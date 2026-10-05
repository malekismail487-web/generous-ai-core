import assert from "node:assert/strict";
import { parseNyxHarborTaskRequest, runNyxHarborCandidate } from "./omega/benchmarks/nyxHarborBridge";
import { NYX_CONTAINER_SUPERVISOR, type NyxContainerDriver } from "../src/lib/codelab/executor/nyxContainerExecution";
import { NvidiaNimProvider } from "../src/lib/codelab/model/nvidiaNimProvider";

let passed = 0;
const check = (value: unknown, label: string) => {assert.ok(value, label); passed++;};
const request = () => ({schemaVersion: 1, candidate: "d".repeat(40), taskIdentity: "UNSEEN-DEVELOPMENT",
  instruction: "Calculate the requested result inside the authorized disposable environment. Ω is not a success oracle.",
  containerId: "a".repeat(64), imageId: `sha256:${"b".repeat(64)}`, owner: "c".repeat(32),
  issuedAtEpochMs: Date.now() - 1, expiresAtEpochMs: Date.now() + 120000});
const profile = () => ({Id: "a".repeat(64), Image: `sha256:${"b".repeat(64)}`,
  State: {Running: true, Paused: false, Restarting: false}, Mounts: [],
  HostConfig: {NetworkMode: "none", PortBindings: {}, Links: null, Binds: null, Privileged: false, ReadonlyRootfs: true,
    PidMode: "", IpcMode: "private", CapAdd: null, Devices: [], DeviceRequests: null, VolumesFrom: null,
    CapDrop: ["ALL"], SecurityOpt: ["no-new-privileges:true"], Memory: 268435456, MemorySwap: 268435456,
    NanoCpus: 1000000000, PidsLimit: 32, Tmpfs: {
      "/workspace": "rw,nosuid,nodev,size=67108864,uid=65534,gid=65534,mode=0700",
      "/tmp": "rw,nosuid,nodev,size=67108864,uid=65534,gid=65534,mode=0700"}},
  Config: {User: "65534:65534", WorkingDir: "/workspace", Cmd: [...NYX_CONTAINER_SUPERVISOR],
    Env: ["PATH=/usr/local/bin:/usr/bin:/bin", "LANG=C.UTF-8"], Labels: {"org.lumina.nyx.isolated-owner": "c".repeat(32)}}});
check(Object.isFrozen(parseNyxHarborTaskRequest(request())), "freeze trusted request without issuing authority");
for (const raw of [null, [], {...request(), argv: ["host-command"]}, {...request(), owner: "wrong"},
  {...request(), schemaVersion: 2}, {...request(), containerId: "name-not-identity"}, {...request(), instruction: "x".repeat(8001)},
  {...request(), expiresAtEpochMs: Date.now() - 100}, {...request(), expiresAtEpochMs: Date.now() + 600000},
  {...request(), candidate: "branch-name"}, {...request(), taskIdentity: "../../host"}]) {
  assert.throws(() => parseNyxHarborTaskRequest(raw)); passed++;
}

function model(outputs: unknown[], includeUsage = true) {
  let index = 0;
  return NvidiaNimProvider.create({providerId: "HARBOR-CONTRACT-TEST", model: "nvidia/nemotron-3-ultra-550b-a55b",
    authorityMode: "TEST_DOUBLE_ONLY", credentialSource: {sourceIdentity: "test-only", read: () => "synthetic-noncredential"},
    maxPromptBytes: 64000, maxOutputTokens: 4096, timeoutMs: 1000,
    transport: async () => new Response(JSON.stringify({choices: [{message: {content: JSON.stringify(outputs[index++])}, finish_reason: "stop"}],
      ...(includeUsage ? {usage: {prompt_tokens: 20, completion_tokens: 30, total_tokens: 50}} : {})}), {status: 200})});
}
let executions = 0;
const driver: NyxContainerDriver = {inspect: async () => profile(), exec: async (id, argv) => {
  assert.equal(id, "a".repeat(64)); assert.deepEqual(argv, ["python", "-c", "print(5)"]); executions++;
  return {exitCode: 0, stdout: "unnecessary raw observation not persisted", stderr: "", timedOut: false};
}};
const receipt = await runNyxHarborCandidate(request(), {driver, model: model([
  {kind: "CONTAINER_EXEC", argv: ["python", "-c", "print(5)"]}, {kind: "REPLY", message: "Do not accept my claim without the official verifier."}])});
check(receipt.outcome === "REPLIED" && executions === 1 && receipt.modelCalls === 2, "existing cognition selects actual typed executor path");
check(receipt.officialVerification === "NOT_EXECUTED_BY_AGENT" && !receipt.taskSuccessClaimed && !receipt.cognitiveGain,
  "model reply and successful command cannot certify official task success or cognitive gain");
check(receipt.leaseRevoked && receipt.audit.length === 1 && receipt.audit[0].toolAction === "DOCKER_CONTAINER_EXEC",
  "all actions attributable and lease revoked before independent grading");
check(receipt.inputTokens === 40 && receipt.outputTokens === 60 && receipt.usage.reportedTokens === 100,
  "realized reported usage retained separately from execution work");
check(!JSON.stringify(receipt).includes("unnecessary raw observation") && !JSON.stringify(receipt).includes("Do not accept my claim")
  && !JSON.stringify(receipt).includes(request().instruction), "receipt uses digests not unnecessary raw instructions/replies/output");
check(!receipt.hostAuthority && !receipt.productionAuthority && !receipt.generalNetworkAuthority
  && !receipt.sourceRepositoryMutation, "Harbor bridge cannot promote research into host or production authority");

const rejected = await runNyxHarborCandidate(request(), {driver, model: model([
  {kind: "CONTAINER_EXEC", argv: ["python", "-c", "print(5)"], containerId: "other"},
  {kind: "CONTAINER_EXEC", argv: ["python", "-c", "print(5)"], containerId: "other"}])});
check(rejected.outcome === "REJECTED" && executions === 1 && rejected.audit.length === 0,
  "malformed extra target cannot mutate an environment");
const missingUsage = await runNyxHarborCandidate(request(), {driver, model: model([{kind: "REPLY", message: "Unknown usage."}], false)});
check(missingUsage.inputTokens === null && missingUsage.outputTokens === null && missingUsage.usage.unknownUsageCalls === 1,
  "unknown provider compute is not zero usage");
const thrown = await runNyxHarborCandidate(request(), {driver, model: {complete: async () => {throw Error("not logged");}}});
check(thrown.outcome === "MODEL_FAILURE" && thrown.usage.unobservedLogicalCalls === 1
  && thrown.inputTokens === null && thrown.outputTokens === null && thrown.leaseRevoked,
  "missing model evidence cannot become known zero compute or leave authority active");
for (const change of [(raw: ReturnType<typeof profile>) => {raw.HostConfig.NetworkMode = "bridge";},
  (raw: ReturnType<typeof profile>) => {raw.Config.User = "root";},
  (raw: ReturnType<typeof profile>) => {raw.HostConfig.ReadonlyRootfs = false;}]) {
  let modelInvoked = false;
  const raw = profile(); change(raw);
  await assert.rejects(runNyxHarborCandidate(request(), {driver: {...driver, inspect: async () => raw},
    model: {complete: async () => {modelInvoked = true; throw Error("must not run");}}})); passed++;
  check(!modelInvoked, "incompatible official profile rejected before provider call; no easier replacement task");
}
console.log(`Omega NYX Harbor bridge tests - passed: ${passed}, failed: 0`);
