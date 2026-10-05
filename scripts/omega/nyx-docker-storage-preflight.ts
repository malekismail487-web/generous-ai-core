import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { NyxDockerDriver } from "./benchmarks/nyxDockerDriver";
import { NYX_CONTAINER_SUPERVISOR } from "../../src/lib/codelab/executor/nyxContainerExecution";
import { nyxContainsSecretLike, nyxSha256, nyxCanonical } from "../../src/lib/codelab/cli/nyxChatProtocol";

const LABEL = "org.lumina.nyx.storage-probe-owner";
const QUOTA = 64 * 1024 * 1024;
const runFile = promisify(execFile);
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const empty = (value: unknown) => value === null || Array.isArray(value) && value.length === 0;

/** A trusted environment diagnostic, NOT an executor profile or issued NYX capability. */
export function quotaProbeArgs(imageId: string, owner: string): readonly string[] {
  if (!/^sha256:[a-f0-9]{64}$/.test(imageId) || !/^[a-f0-9]{32}$/.test(owner)) throw Error("quota_probe_identity_invalid");
  return Object.freeze(["create", "--pull=never", "--network=none", "--storage-opt=size=64m",
    "--cap-drop=ALL", "--security-opt=no-new-privileges:true", "--user=65534:65534", "--workdir=/tmp",
    "--memory=128m", "--memory-swap=128m", "--cpus=1", "--pids-limit=32", "--ipc=private",
    "--label", `${LABEL}=${owner}`, imageId, ...NYX_CONTAINER_SUPERVISOR]);
}

export function quotaProbeInspection(raw: unknown, id: string, imageId: string, owner: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(id) || !/^sha256:[a-f0-9]{64}$/.test(imageId) || !/^[a-f0-9]{32}$/.test(owner)) return false;
  const value = record(raw), host = record(value?.HostConfig), config = record(value?.Config);
  const labels = record(config?.Labels), storage = record(host?.StorageOpt);
  const ports = record(host?.PortBindings);
  const envNames = new Set(["PATH", "LANG", "GPG_KEY", "PYTHON_VERSION", "PYTHON_SHA256", "PYTHON_PIP_VERSION",
    "PYTHON_SETUPTOOLS_VERSION", "PYTHON_GET_PIP_URL", "PYTHON_GET_PIP_SHA256"]);
  try { return !!value && !!host && !!config && value.Id === id && value.Image === imageId && labels?.[LABEL] === owner
    && host.NetworkMode === "none" && (empty(host.PortBindings) || !!ports && Object.keys(ports).length === 0)
    && empty(host.Links) && host.Privileged === false && host.ReadonlyRootfs === false
    && host.PidMode === "" && host.IpcMode === "private" && empty(host.Binds) && empty(host.CapAdd)
    && empty(host.Devices) && empty(host.DeviceRequests) && empty(host.VolumesFrom)
    && nyxCanonical(host.CapDrop) === nyxCanonical(["ALL"])
    && Array.isArray(host.SecurityOpt) && host.SecurityOpt.length === 1
    && ["no-new-privileges", "no-new-privileges:true"].includes(String(host.SecurityOpt[0]))
    && host.Memory === 134217728 && host.MemorySwap === host.Memory && host.NanoCpus === 1000000000
    && host.PidsLimit === 32 && !!storage && Object.keys(storage).length === 1 && storage.size === "64m"
    && (host.Tmpfs === null || !!record(host.Tmpfs) && Object.keys(record(host.Tmpfs)!).length === 0)
    && Array.isArray(value.Mounts) && value.Mounts.length === 0
    && config.User === "65534:65534" && config.WorkingDir === "/tmp"
    && nyxCanonical(config.Cmd) === nyxCanonical(NYX_CONTAINER_SUPERVISOR)
    && Array.isArray(config.Env) && config.Env.every(item => typeof item === "string"
      && envNames.has(item.split("=", 1)[0]) && !nyxContainsSecretLike(item)
      && (!item.startsWith("GPG_KEY=") || /^GPG_KEY=[A-F0-9]{40}$/.test(item))); }
  catch { return false; }
}

export function quotaCreationFailure(stderr: string): "STORAGE_QUOTA_UNSUPPORTED" | "CONTAINER_CREATION_FAILED" {
  return /storage-opt.*(?:not supported|unsupported|only supported)|storage-opt.*supported only.*xfs|(?:xfs|pquota).*(?:required|only|must)|(?:only supported).*xfs/i.test(stderr)
    ? "STORAGE_QUOTA_UNSUPPORTED" : "CONTAINER_CREATION_FAILED";
}

// Fixed trusted diagnostic only. No task code, model response, credential or external path is interpolated.
const WRITE_PROBE = `import errno,json,os
block=b'x'*(1024*1024)
within=False
limited=False
written=0
with open('/tmp/nyx-quota-probe.bin','wb',buffering=0) as f:
    f.write(block)
    os.fsync(f.fileno())
    within=True
    written=len(block)
    try:
        for _ in range(127):
            written+=f.write(block)
            os.fsync(f.fileno())
    except OSError as exc:
        limited=exc.errno in (errno.ENOSPC,errno.EDQUOT)
    size=os.fstat(f.fileno()).st_size
print(json.dumps({'withinQuotaWritten':within,'quotaExceededRejected':limited,'fileBytes':size}))
`;

export async function runQuotaPreflight() {
  if (process.platform !== "linux" || process.env.OMEGA_ALLOW_STORAGE_QUOTA_PREFLIGHT !== "1")
    throw Error("explicit_linux_storage_preflight_authorization_required");
  const candidate = process.env.GITHUB_SHA;
  if (!candidate || !/^[a-f0-9]{40}$/.test(candidate)) throw Error("quota_probe_candidate_identity_required");
  const owner = randomBytes(16).toString("hex"), driver = new NyxDockerDriver();
  const docker = (argv: readonly string[], timeout = 15000) => runFile("docker", [...argv],
    {shell: false, windowsHide: true, timeout, maxBuffer: 65536,
      env: {PATH: process.env.PATH, DOCKER_CONFIG: "/nonexistent-nyx-docker-config"}});
  let id: string | null = null, imageId: string | null = null;
  let state = "INFRASTRUCTURE_FAILURE", reason = "PRECONDITION_NOT_ESTABLISHED", cleanupVerified = false;
  let proof: Record<string, unknown> | null = null;
  let storageEnvironment: Record<string, unknown> | null = null;
  try {
    const info = JSON.parse((await docker(["info", "--format", "{{json .}}"])).stdout);
    storageEnvironment = {driver: info.Driver, driverStatus: info.DriverStatus, serverVersion: info.ServerVersion};
    await docker(["pull", "python:3.12-slim"], 120000);
    const images = JSON.parse((await docker(["image", "inspect", "python:3.12-slim"])).stdout);
    if (!Array.isArray(images) || images.length !== 1 || !/^sha256:[a-f0-9]{64}$/.test(images[0].Id)) throw Error("image_identity_invalid");
    imageId = images[0].Id;
    let creation;
    try { creation = await docker(quotaProbeArgs(imageId!, owner)); }
    catch (error) {
      reason = quotaCreationFailure(String((error as {stderr?: unknown}).stderr ?? ""));
      state = reason === "STORAGE_QUOTA_UNSUPPORTED" ? "BLOCKED_ENVIRONMENT" : "INFRASTRUCTURE_FAILURE";
    }
    if (creation) {
      const createdId = creation.stdout.trim();
      if (!/^[a-f0-9]{64}$/.test(createdId)) throw Error("container_identity_invalid");
      id = createdId;
      if (!quotaProbeInspection(await driver.inspect(id), id, imageId!, owner)) throw Error("quota_profile_not_proven");
      await docker(["start", id]);
      const fresh = await driver.inspect(id) as {State?: {Running?: boolean}};
      if (!quotaProbeInspection(fresh, id, imageId!, owner) || fresh.State?.Running !== true) throw Error("quota_profile_not_running");
      const output = await docker(["exec", "--user=65534:65534", "--workdir=/tmp", id,
        "/usr/bin/timeout", "--signal=KILL", "10s", "python", "-I", "-c", WRITE_PROBE], 15000);
      proof = record(JSON.parse(output.stdout));
      if (proof?.withinQuotaWritten !== true || proof.quotaExceededRejected !== true
        || !Number.isSafeInteger(proof.fileBytes) || Number(proof.fileBytes) < 1048576 || Number(proof.fileBytes) > QUOTA)
        throw Error("quota_enforcement_not_proven");
      state = "PASS"; reason = "WRITABLE_LAYER_QUOTA_EMPIRICALLY_ENFORCED";
    }
  } catch (error) {
    state = "INFRASTRUCTURE_FAILURE";
    reason = error instanceof Error && /^[a-z_]{1,100}$/.test(error.message) ? error.message : "quota_probe_backend_failure";
  } finally {
    try {
      // Recover only the uniquely owned diagnostic if Docker partially created it before reporting failure.
      const matches = (await docker(["ps", "--all", "--no-trunc", "--quiet", "--filter", `label=${LABEL}=${owner}`])).stdout.trim();
      const ids = matches ? matches.split(/\r?\n/) : [];
      if (ids.length > 1 || ids.some(value => !/^[a-f0-9]{64}$/.test(value)) || id && ids.some(value => value !== id))
        throw Error("cleanup_identity_conflict");
      if (!id && ids.length === 1) id = ids[0];
      if (id && ids.length) {
        const raw = await driver.inspect(id) as {Id?: string; Image?: string; Config?: {Labels?: Record<string, string>}};
        if (raw.Id !== id || raw.Image !== imageId || raw.Config?.Labels?.[LABEL] !== owner) throw Error("cleanup_ownership_unproven");
        await docker(["rm", "--force", id]);
      }
      const after = (await docker(["ps", "--all", "--quiet", "--filter", `label=${LABEL}=${owner}`])).stdout.trim();
      cleanupVerified = after === "";
    } catch { state = "INFRASTRUCTURE_FAILURE"; reason = "OWNED_DIAGNOSTIC_CLEANUP_UNVERIFIED"; }
  }
  const receipt = {schemaVersion: 1, identity: "NYX-OFFICIAL-TASK-WRITABLE-LAYER-PREREQUISITE-001", candidate,
    executionIdentity: `github-actions-${process.env.GITHUB_RUN_ID || "unknown"}`, evidenceClass: "E3",
    state, reason, storageEnvironment, proof, imageId, containerIdentityDigest: id ? nyxSha256(id) : null,
    cleanupVerified, nyxCapabilityGranted: false, modelCalls: 0, benchmarkTasksExecuted: 0,
    automaticFallback: false, productionAuthority: false,
    limitation: "QUOTA_DIAGNOSTIC_ONLY_NOT_A_COMPLETE_BENCHMARK_ENVIRONMENT_OR_KERNEL_ESCAPE_PROOF"};
  await writeFile(join(process.env.RUNNER_TEMP || tmpdir(), `nyx-storage-preflight-${candidate}.json`), JSON.stringify(receipt, null, 2));
  console.log(`NYX_STORAGE_PREFLIGHT ${JSON.stringify(receipt)}`);
  if (!cleanupVerified || state === "INFRASTRUCTURE_FAILURE") process.exitCode = 1;
  return receipt;
}
if (process.argv[1]?.replace(/\\/g, "/").endsWith("/nyx-docker-storage-preflight.ts")) await runQuotaPreflight();
