import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NyxIsolatedContainerHost, NYX_CONTAINER_SUPERVISOR, validateNyxContainerInspection, type NyxContainerConfig,
  type NyxContainerDriver } from "../src/lib/codelab/executor/nyxContainerExecution";
import { parseNyxChatAction, nyxCanonical, nyxSha256 } from "../src/lib/codelab/cli/nyxChatProtocol";
import { NyxChatSession } from "../src/lib/codelab/cli/nyxChatSession";
import { NyxScopedComputerHost } from "../src/lib/codelab/cli/nyxScopedComputerHost";
import { ReadOnlyRepositoryExecutor } from "../src/lib/codelab/executor/readOnlyExecutor";
import { NvidiaNimProvider } from "../src/lib/codelab/model/nvidiaNimProvider";

let passed = 0;
function check(condition: unknown, label: string) { assert.ok(condition, label); passed += 1; }
const identity = {containerId: "a".repeat(64), imageId: `sha256:${"b".repeat(64)}`, owner: "c".repeat(32)};
function inspection(): any {
  return {Id: identity.containerId, Image: identity.imageId,
    State: {Running: true, Paused: false, Restarting: false}, Mounts: [],
    HostConfig: {NetworkMode: "none", PortBindings: {}, Links: null, Binds: null, Privileged: false, ReadonlyRootfs: true,
      PidMode: "", IpcMode: "private", CapAdd: null, Devices: [], DeviceRequests: null, VolumesFrom: null,
      CapDrop: ["ALL"], SecurityOpt: ["no-new-privileges:true"], Memory: 268435456, MemorySwap: 268435456, NanoCpus: 1000000000,
      PidsLimit: 32, Tmpfs: {"/workspace": "rw,nosuid,nodev,size=67108864", "/tmp": "rw,nosuid,nodev,size=67108864"}},
    Config: {User: "65534:65534", WorkingDir: "/workspace", Cmd: [...NYX_CONTAINER_SUPERVISOR], Env: ["PATH=/usr/local/bin:/usr/bin:/bin", "LANG=C.UTF-8"],
      Labels: {"org.lumina.nyx.isolated-owner": identity.owner}}};
}
function fixture(overrides: Partial<NyxContainerConfig> = {}) {
  let now = 1000, executions = 0;
  let profile = inspection();
  const driver: NyxContainerDriver = {inspect: async () => structuredClone(profile), exec: async (id, argv) => {
    assert.equal(id, identity.containerId); assert.deepEqual(argv, ["python", "-c", "print(2+3)"]);
    executions += 1; return {exitCode: 0, stdout: "5\n", stderr: "", timedOut: false};
  }};
  const config: NyxContainerConfig = {...identity, authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED",
    issuedAtEpochMs: 0, expiresAtEpochMs: 20000, maxCommands: 3, commandMs: 1000,
    driver, now: () => now, ...overrides};
  return {config, driver, setProfile: (value: any) => {profile = value;}, setNow: (value: number) => {now = value;},
    executions: () => executions};
}
const action = {kind: "CONTAINER_EXEC" as const, argv: ["python", "-c", "print(2+3)"]};
check(parseNyxChatAction(JSON.stringify(action)).action?.kind === "CONTAINER_EXEC", "typed argv recognized without issuing authority");
for (const invalid of [[], [""], ["-v"], ["x\0"], ["x", 3], Array(25).fill("x"), ["x", "y".repeat(16001)]]) {
  check(parseNyxChatAction(JSON.stringify({kind: "CONTAINER_EXEC", argv: invalid})).action === null, "malformed argv rejected");
}
check(parseNyxChatAction(JSON.stringify({...action, containerId: identity.containerId})).action === null,
  "model cannot choose a container or attach extra runtime options");
check(validateNyxContainerInspection(inspection(), identity).length === 0, "independent fixed engine snapshot accepted");
const attacks: [string, (value: any) => void][] = [
  ["wrong exact ID", v => {v.Id = "d".repeat(64);}], ["wrong image", v => {v.Image = `sha256:${"d".repeat(64)}`;}],
  ["wrong ownership", v => {v.Config.Labels["org.lumina.nyx.isolated-owner"] = "d".repeat(32);}],
  ["host networking", v => {v.HostConfig.NetworkMode = "host";}], ["public networking", v => {v.HostConfig.NetworkMode = "bridge";}],
  ["port binding", v => {v.HostConfig.PortBindings = {"80/tcp": [{HostPort: "80"}]};}],
  ["privilege", v => {v.HostConfig.Privileged = true;}], ["host PID", v => {v.HostConfig.PidMode = "host";}],
  ["host IPC", v => {v.HostConfig.IpcMode = "host";}], ["extra caps", v => {v.HostConfig.CapAdd = ["SYS_ADMIN"];}],
  ["missing cap drop", v => {v.HostConfig.CapDrop = [];}], ["unconfined seccomp", v => {v.HostConfig.SecurityOpt.push("seccomp=unconfined");}],
  ["root user", v => {v.Config.User = "0";}], ["root filesystem writable", v => {v.HostConfig.ReadonlyRootfs = false;}],
  ["host repository mount", v => {v.Mounts = [{Type: "bind", Destination: "/repo", Source: "/home/runner/work"}];}],
  ["configured bind", v => {v.HostConfig.Binds = ["/host:/guest"]; }],
  ["Docker socket", v => {v.Mounts = [{Type: "bind", Destination: "/var/run/docker.sock"}];}],
  ["volume escape", v => {v.HostConfig.VolumesFrom = ["other-container"];}],
  ["unbounded memory", v => {v.HostConfig.Memory = 0;}], ["unbounded CPU", v => {v.HostConfig.NanoCpus = 0;}],
  ["unbounded swap", v => {v.HostConfig.MemorySwap = -1;}], ["arbitrary supervisor", v => {v.Config.Cmd = ['sleep', 'infinity'];}],
  ["unbounded PIDs", v => {v.HostConfig.PidsLimit = -1;}], ["large tmpfs", v => {v.HostConfig.Tmpfs["/tmp"] = "rw,nosuid,nodev,size=999999999";}],
  ["extra filesystem", v => {v.HostConfig.Tmpfs["/host"] = "rw,nosuid,nodev,size=67108864";}],
  ["device access", v => {v.HostConfig.Devices = [{PathOnHost: "/dev/sda"}];}],
  ["GPU access", v => {v.HostConfig.DeviceRequests = [{Driver: "nvidia"}];}],
  ["credential env", v => {v.Config.Env.push("NVIDIA_API_KEY=synthetic-only");}], ["host workdir", v => {v.Config.WorkingDir = "/host";}],
  ["stopped", v => {v.State.Running = false;}], ["paused", v => {v.State.Paused = true;}],
];
for (const [label, attack] of attacks) {
  const raw = inspection(); attack(raw);
  check(validateNyxContainerInspection(raw, identity).length > 0, `reject ${label}`);
}
for (const raw of [null, [], {}, {Id: identity.containerId}])
  check(validateNyxContainerInspection(raw, identity).length > 0, "malformed inspection fails closed");
for (const override of [{authorityMode: "PRODUCTION"}, {containerId: "short-name"}, {imageId: "python:latest"},
  {expiresAtEpochMs: 999}, {issuedAtEpochMs: 1001}, {maxCommands: 13}, {commandMs: 10001}, {expiresAtEpochMs: 600001}]) {
  const f = fixture(override as Partial<NyxContainerConfig>);
  await assert.rejects(NyxIsolatedContainerHost.create(f.config)); passed += 1;
}
{
  const f = fixture(), host = await NyxIsolatedContainerHost.create(f.config);
  check((await host.execute(action, "A")).decision === "EXECUTED", "authorized exact container action executes");
  check((await host.execute(action, "A")).decision === "REJECTED" && f.executions() === 1, "replay cannot duplicate execution");
  check((await host.execute({kind: "TERMINAL_CHECK", path: "src/a.mjs"}, "B")).decision === "REJECTED",
    "container lease cannot acquire host syntax or desktop authority");
  const logs = host.auditLog();
  check(logs.length === 3 && logs[0].inspectionDigest !== null && logs[0].decision === "EXECUTED"
    && logs[0].toolAction === "DOCKER_CONTAINER_EXEC" && logs[1].toolAction === null, "all actual and denied actions audited");
  for (let i = 0; i < logs.length; i++) {
    const {eventDigest, ...base} = logs[i];
    check(eventDigest === nyxSha256(base.previousDigest + nyxCanonical(base))
      && base.previousDigest === (logs[i - 1]?.eventDigest ?? "0".repeat(64)), "canonical hash chain reconstructs");
  }
  host.revoke(); check(!host.containerExecAvailable && (await host.execute(action, "C")).decision === "REJECTED",
    "explicit revocation removes authority");
}
{
  const f = fixture(), host = await NyxIsolatedContainerHost.create(f.config);
  f.setNow(20000);
  check((await host.execute(action, "EXPIRED")).decision === "REJECTED" && f.executions() === 0, "expired lease no execution");
}
{
  const f = fixture({maxCommands: 1}), host = await NyxIsolatedContainerHost.create(f.config);
  await host.execute(action, "ONE");
  check((await host.execute(action, "TWO")).decision === "REJECTED" && f.executions() === 1, "finite command budget enforced");
}
{
  const f = fixture(), host = await NyxIsolatedContainerHost.create(f.config), raw = inspection();
  raw.HostConfig.NetworkMode = "host"; f.setProfile(raw);
  check((await host.execute(action, "CHANGED")).reason === "container_profile_changed" && f.executions() === 0,
    "fresh inspection blocks unsafe profile changes before use");
  f.setProfile(inspection()); check(!host.containerExecAvailable, "quarantine cannot recover itself from a later safe-looking snapshot");
}
{
  const f = fixture(), host = await NyxIsolatedContainerHost.create(f.config);
  f.driver.inspect = async () => {f.setNow(19999); return inspection();};
  check((await host.execute(action, "TOCTOU")).decision === "REJECTED" && f.executions() === 0,
    "awaited authorization cannot spend an expired/insufficient lease");
}
{
  const f = fixture(), host = await NyxIsolatedContainerHost.create(f.config);
  let release!: () => void;
  f.driver.exec = async () => {await new Promise<void>(resolve => {release = resolve;});
    return {exitCode: 0, stdout: "done", stderr: "", timedOut: false};};
  const first = host.execute(action, "FIRST");
  await new Promise(resolve => setTimeout(resolve, 0));
  check((await host.execute(action, "OVERLAP")).reason === "container_command_already_active", "overlapping execution denied");
  host.revoke(); release();
  check((await first).decision === "UNVERIFIED", "revocation while running withholds late success");
}
for (const output of [{exitCode: 0, stdout: "x".repeat(16001), stderr: "", timedOut: false},
  {exitCode: 137, stdout: "", stderr: "", timedOut: true}]) {
  const f = fixture(), host = await NyxIsolatedContainerHost.create(f.config);
  f.driver.exec = async () => output;
  check((await host.execute(action, "RESOURCE")).decision === "UNVERIFIED" && !host.containerExecAvailable,
    "timeout/oversized output quarantines and withholds output");
}
{
  const f = fixture(), host = await NyxIsolatedContainerHost.create(f.config);
  f.driver.exec = async () => {throw Error("raw backend detail is never persisted");};
  check((await host.execute(action, "THROW")).reason === "container_backend_failure"
    && host.auditLog()[0].toolAction === "DOCKER_CONTAINER_EXEC", "backend failure cannot silently omit an attempted tool action");
}
{
  const f = fixture({maxCommands: 1}), host = await NyxIsolatedContainerHost.create(f.config);
  Object.assign(f.config, {maxCommands: 12, expiresAtEpochMs: 500000, containerId: "d".repeat(64)});
  check((await host.execute(action, "OWNED")).decision === "EXECUTED"
    && (await host.execute(action, "EXPANDED")).decision === "REJECTED", "caller mutation cannot expand frozen identity, quota or lifetime");
}
{
  const root = await mkdtemp(join(tmpdir(), "nyx-container-chat-test-"));
  const now = Date.now();
  const r1 = await ReadOnlyRepositoryExecutor.create({executorId: "CONTAINER-R1", tokenId: "CONTAINER-R1-TOKEN",
    repositoryRoot: root, resourceScopes: ["."], issuedAtEpochMs: now - 1, expiresAtEpochMs: now + 30000,
    constraints: {maxFileBytes: 1000, maxDirectoryEntries: 1, allowedExtensions: [".mjs"]},
    issuer: "NYX-CONTAINER-TEST", auditIdentity: "CONTAINER-AUDIT"});
  r1.terminate(now, "NO_SOURCE_REPOSITORY_TOOLS");
  try {
    for (const allowed of [false, true]) {
      let calls = 0, systemPrompt = "";
      const f = fixture(), host = allowed ? await NyxIsolatedContainerHost.create(f.config) :
        NyxScopedComputerHost.create({reader: r1, allowedCheckPaths: [], desktopPid: null, winappPath: null,
          approveDesktopAction: async () => false});
      const model = NvidiaNimProvider.create({providerId: "CONTAINER-CHAT-TEST", model: "nvidia/nemotron-3-ultra-550b-a55b",
        authorityMode: "TEST_DOUBLE_ONLY", credentialSource: {sourceIdentity: "test-double", read: () => "synthetic-not-real"},
        maxPromptBytes: 64000, maxOutputTokens: 1024, timeoutMs: 5000,
        transport: async (_url, request) => {
          systemPrompt = JSON.parse(String(request?.body)).messages[0].content;
          return new Response(JSON.stringify({choices: [{message: {content: JSON.stringify(calls++ === 0
          ? action : {kind: "REPLY", message: "An independent verifier must assess the result."})}, finish_reason: "stop"}],
          usage: {prompt_tokens: 20, completion_tokens: 20, total_tokens: 40}}), {status: 200});
        }});
      const result = await NyxChatSession.create({sessionId: `CONTAINER-${allowed}`, model, reader: r1,
        candidateWriter: null, computerHost: host, editablePaths: [], maxModelCallsPerTurn: 2,
        maxCandidatesPerTurn: 0, maxTurnMs: 20000, maxOutputTokens: 1024}).turn("Execute the bounded container calculation.");
      check(result.events.some(e => e.eventType === (allowed ? "COMPUTER" : "DENIAL")),
        "same NYX loop authorizes only explicitly available container capability");
      check(f.executions() === (allowed ? 1 : 0) && result.sourceRepositoryMutated === false
        && result.broaderAuthorityGranted === false && result.outcome !== "CANDIDATE_VERIFIED",
      "normal client retains forbidden authority and reply cannot self-certify task success");
      check(systemPrompt.includes("CONTAINER_EXEC") === allowed
        && systemPrompt.includes("never request arbitrary shell text,") === !allowed,
        "normal prompt is unchanged and isolated prompt distinguishes guest shell from forbidden host shell");
    }
  } finally {await rm(root, {recursive: true});}
}
console.log(`Omega NYX container execution tests - passed: ${passed}, failed: 0`);
