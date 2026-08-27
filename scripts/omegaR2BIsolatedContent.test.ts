import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, realpath, readdir, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  R2AIsolatedSandboxLifecycle,
  type R2AIsolatedLifecycleConfig,
  type R2AProvisionedSandbox,
  type R2ATerminationRequest,
} from "../src/lib/codelab/executor/r2SandboxLifecycle";
import {
  R2_B_ISOLATED_CANDIDATE_STATUS,
  R2BIsolatedContentCreator,
  type R2BCreateFileRequest,
  type R2BIsolatedContentConfig,
} from "../src/lib/codelab/executor/r2SandboxContent";
import type { SandboxProvisionRequest } from "../src/lib/codelab/executor/r2ProvisioningBlueprint";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function assert(value: unknown, label: string): void {
  if (value) passed += 1;
  else { failed += 1; failures.push(label); console.error(`  x ${label}`); }
}

const REPOSITORY = await realpath(resolve("."));
const CANDIDATE = execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPOSITORY, encoding: "utf8" }).trim();
const NOW = Date.now();

interface Harness {
  readonly root: string;
  readonly lifecycleConfig: R2AIsolatedLifecycleConfig;
  readonly lifecycle: R2AIsolatedSandboxLifecycle;
  readonly sandbox: R2AProvisionedSandbox;
  readonly contentConfig: R2BIsolatedContentConfig;
}

async function harness(label: string, policy?: R2BIsolatedContentConfig["policy"]): Promise<Harness> {
  const root = await mkdtemp(join(tmpdir(), `omega-r2b-${label}-`));
  const lifecycleConfig: R2AIsolatedLifecycleConfig = {
    executorId: `R2A-EXECUTOR-${label}`,
    candidateCommit: CANDIDATE,
    capabilityVersion: "r2-a/1",
    evaluatorVersion: "r2b-isolated-eval/1",
    environmentIdentity: `local-${process.platform}-${process.arch}`,
    authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED",
    repositoryRoot: REPOSITORY,
    approvedSandboxRoot: await realpath(root),
    capability: {
      capabilityId: `R2A-CAP-${label}`,
      issuer: "OMEGA-ISOLATED-TEST-AUTHORITY",
      auditIdentity: `R2A-AUDIT-${label}`,
      issuedAtEpochMs: NOW - 1_000,
      expiresAtEpochMs: NOW + 120_000,
    },
  };
  const lifecycle = await R2AIsolatedSandboxLifecycle.create(lifecycleConfig, NOW);
  const provision = provisionRequest(lifecycleConfig, `R2A-${label}`);
  const provisioned = await lifecycle.provision(provision, NOW);
  if (!provisioned.sandbox) throw new Error(`harness_provision_failed:${provisioned.reason}`);
  const contentConfig: R2BIsolatedContentConfig = {
    executorId: `R2B-EXECUTOR-${label}`,
    candidateCommit: CANDIDATE,
    evaluatorVersion: "r2b-isolated-eval/1",
    environmentIdentity: lifecycleConfig.environmentIdentity,
    authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED",
    repositoryRoot: REPOSITORY,
    sandbox: provisioned.sandbox,
    lifecycle,
    capability: {
      capabilityId: `R2B-CAP-${label}`,
      issuer: "OMEGA-ISOLATED-TEST-AUTHORITY",
      auditIdentity: `R2B-AUDIT-${label}`,
      issuedAtEpochMs: NOW - 500,
      expiresAtEpochMs: NOW + 90_000,
    },
    policy,
  };
  return { root, lifecycleConfig, lifecycle, sandbox: provisioned.sandbox, contentConfig };
}

function provisionRequest(config: R2AIsolatedLifecycleConfig, requestId: string): SandboxProvisionRequest {
  return {
    schemaVersion: 1,
    requestId,
    capabilityId: config.capability.capabilityId,
    authority: "PROVISION_SANDBOX",
    requestedPath: `sandbox-${requestId}`,
    repositoryRoot: config.repositoryRoot,
    approvedSandboxRoot: config.approvedSandboxRoot,
    issuedAtEpochMs: NOW,
    expiresAtEpochMs: NOW + 60_000,
    issuer: config.capability.issuer,
    auditIdentity: config.capability.auditIdentity,
    candidateBinding: {
      commit: config.candidateCommit,
      capabilityVersion: config.capabilityVersion,
      schemaVersion: 1,
      evaluatorVersion: config.evaluatorVersion,
      environmentIdentity: config.environmentIdentity,
    },
  };
}

function createRequest(config: R2BIsolatedContentConfig, requestId: string, relativePath: string, content: string, overrides: Partial<R2BCreateFileRequest> = {}): R2BCreateFileRequest {
  return {
    schemaVersion: 1,
    requestId,
    sandboxId: config.sandbox.sandboxId,
    capabilityId: config.capability.capabilityId,
    authority: "WRITE_SANDBOX_CONTENT",
    relativePath,
    content,
    issuer: config.capability.issuer,
    auditIdentity: config.capability.auditIdentity,
    observedAtEpochMs: NOW + 1_000,
    ...overrides,
  };
}

function termination(config: R2AIsolatedLifecycleConfig, requestId: string): R2ATerminationRequest {
  return {
    schemaVersion: 1,
    requestId,
    capabilityId: config.capability.capabilityId,
    authority: "TERMINATE_SANDBOX",
    issuer: config.capability.issuer,
    auditIdentity: config.capability.auditIdentity,
    observedAtEpochMs: NOW + 5_000,
  };
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

function verifyEventChain(events: readonly { readonly previousHash: string; readonly eventHash: string }[]): boolean {
  let previous = "GENESIS";
  for (const event of events) {
    const { eventHash, ...input } = event;
    if (event.previousHash !== previous || createHash("sha256").update(canonical(input), "utf8").digest("hex") !== eventHash) return false;
    previous = eventHash;
  }
  return true;
}

async function terminateEmpty(h: Harness): Promise<void> {
  await h.lifecycle.terminate(termination(h.lifecycleConfig, h.sandbox.requestId));
  await rmdir(h.root);
}

{
  const h = await harness("success");
  const creator = await R2BIsolatedContentCreator.create(h.contentConfig, NOW);
  const content = "export const answer = 42;\n";
  const created = await creator.createFile(createRequest(h.contentConfig, "R2B-SUCCESS", "answer.ts", content));
  assert(created.decision === "CREATED" && created.artifact !== null, "bounded new sandbox file is created on the real host filesystem");
  assert(created.artifact !== null && existsSync(created.artifact.canonicalPath), "created artifact exists inside the owned sandbox");
  assert(created.artifact !== null && (await readFile(created.artifact.canonicalPath, "utf8")) === content, "created artifact content matches exactly");
  assert(created.artifact?.contentHash === createHash("sha256").update(content).digest("hex"), "content postcondition carries the independently reproduced hash");
  assert(created.artifact?.byteLength === Buffer.byteLength(content), "UTF-8 byte limit is measured from actual bytes");
  assert(created.events.map((event) => event.eventType).join(",") === "CONTENT_REQUEST,CONTENT_AUTHORIZATION,NEW_FILE_PRECONDITION,CONTENT_WRITE,CONTENT_POSTCONDITION", "creation emits the complete semantic evidence sequence");
  assert(verifyEventChain(created.events), "content evidence is canonically hash chained");
  assert(created.evidenceClass === "E3" && created.authorityGranted === false, "real local content evidence remains non-promoting E3");
  assert(!("modifyFile" in creator) && !("deleteFile" in creator) && !("executeShell" in creator) && !("fetch" in creator), "R2-B exposes no modify, general delete, shell, or network primitive");
  const unauthorizedTermination = await creator.terminateWithOwnedCleanup({ ...termination(h.lifecycleConfig, h.sandbox.requestId), capabilityId: "UNAUTHORIZED" });
  assert(unauthorizedTermination.decision === "REJECTED" && created.artifact !== null && existsSync(created.artifact.canonicalPath), "unauthorized termination cannot trigger owned-file cleanup");
  const finished = await creator.terminateWithOwnedCleanup(termination(h.lifecycleConfig, h.sandbox.requestId));
  assert(finished.decision === "TERMINATED", "trusted terminal cleanup removes the exact owned artifact and sandbox");
  assert(!existsSync(h.sandbox.canonicalPath) && (await readdir(h.root)).length === 0, "R2-B termination restores the approved root to empty state");
  assert(finished.contentEvents.at(-2)?.eventType === "CONTENT_CLEANUP" && finished.contentEvents.at(-1)?.eventType === "CONTENT_CAPABILITY_REVOCATION", "cleanup and revocation remain attributable");
  assert(creator.capabilityProfile().revoked, "content capability is terminally revoked");
  await rmdir(h.root);
}

{
  const h = await harness("bounds", { maxFileBytes: 8, allowedExtensions: [".txt"] });
  const creator = await R2BIsolatedContentCreator.create(h.contentConfig, NOW);
  const cases: readonly [string, R2BCreateFileRequest, string][] = [
    ["traversal", createRequest(h.contentConfig, "R2B-TRAVERSAL", "../escape.txt", "x"), "invalid_content_leaf_name"],
    ["absolute repository path", createRequest(h.contentConfig, "R2B-ABSOLUTE", REPOSITORY, "x"), "invalid_content_leaf_name"],
    ["disallowed extension", createRequest(h.contentConfig, "R2B-EXTENSION", "payload.exe", "x"), "content_extension_not_allowed"],
    ["byte overflow", createRequest(h.contentConfig, "R2B-BYTES", "large.txt", "123456789"), "content_byte_limit_exceeded"],
    ["wrong capability", createRequest(h.contentConfig, "R2B-CAP", "wrong.txt", "x", { capabilityId: "UNAUTHORIZED" }), "content_capability_identity_mismatch"],
    ["expired capability", createRequest(h.contentConfig, "R2B-EXPIRED", "expired.txt", "x", { observedAtEpochMs: h.contentConfig.capability.expiresAtEpochMs }), "content_capability_expired"],
    ["non-finite observation time", createRequest(h.contentConfig, "R2B-NAN", "nan.txt", "x", { observedAtEpochMs: Number.NaN }), "content_capability_expired"],
    ["malformed runtime request", { ...createRequest(h.contentConfig, "R2B-MALFORMED", "valid.txt", "x"), relativePath: null } as unknown as R2BCreateFileRequest, "content_request_malformed"],
  ];
  for (const [label, request, reason] of cases) {
    const result = await creator.createFile(request);
    assert(result.decision === "REJECTED" && result.reason.includes(reason), `${label} fails closed before content mutation`);
  }
  assert((await readdir(h.sandbox.canonicalPath)).length === 0, "all rejected content requests leave the sandbox unchanged");
  await terminateEmpty(h);
}

{
  const h = await harness("existing");
  const creator = await R2BIsolatedContentCreator.create(h.contentConfig, NOW);
  const target = join(h.sandbox.canonicalPath, "existing.txt");
  await writeFile(target, "foreign", "utf8");
  const result = await creator.createFile(createRequest(h.contentConfig, "R2B-EXISTING", "existing.txt", "replacement"));
  assert(result.decision === "REJECTED" && result.reason === "new_file_precondition_failed_target_exists", "exclusive creation rejects an existing target");
  assert((await readFile(target, "utf8")) === "foreign", "existing content is never overwritten");
  await unlink(target);
  await terminateEmpty(h);
}

{
  const h = await harness("unicode");
  const creator = await R2BIsolatedContentCreator.create(h.contentConfig, NOW);
  const result = await creator.createFile(createRequest(h.contentConfig, "R2B-UNICODE", "دليل.txt", "محتوى موثّق"));
  assert(result.decision === "CREATED" && result.artifact !== null, "Unicode leaf names and UTF-8 content are supported within policy");
  await creator.terminateWithOwnedCleanup(termination(h.lifecycleConfig, h.sandbox.requestId));
  await rmdir(h.root);
}

{
  const h = await harness("modified");
  const creator = await R2BIsolatedContentCreator.create(h.contentConfig, NOW);
  const created = await creator.createFile(createRequest(h.contentConfig, "R2B-MODIFIED", "owned.txt", "original"));
  await writeFile(created.artifact!.canonicalPath, "external replacement content", "utf8");
  const result = await creator.terminateWithOwnedCleanup(termination(h.lifecycleConfig, h.sandbox.requestId));
  assert(result.decision === "QUARANTINED" && result.reason === "owned_artifact_content_changed", "externally modified owned content is quarantined");
  assert(existsSync(created.artifact!.canonicalPath), "quarantine never deletes content whose hash changed");
  await unlink(created.artifact!.canonicalPath);
  await h.lifecycle.terminate(termination(h.lifecycleConfig, h.sandbox.requestId));
  await rmdir(h.root);
}

{
  const h = await harness("identity");
  const creator = await R2BIsolatedContentCreator.create(h.contentConfig, NOW);
  const created = await creator.createFile(createRequest(h.contentConfig, "R2B-IDENTITY", "owned.txt", "original"));
  await unlink(created.artifact!.canonicalPath);
  await writeFile(created.artifact!.canonicalPath, "original", "utf8");
  const result = await creator.terminateWithOwnedCleanup(termination(h.lifecycleConfig, h.sandbox.requestId));
  assert(result.decision === "QUARANTINED" && result.reason === "owned_artifact_identity_changed", "same-content object substitution is detected by identity");
  assert(existsSync(created.artifact!.canonicalPath), "identity mismatch is not followed by destructive cleanup");
  await unlink(created.artifact!.canonicalPath);
  await h.lifecycle.terminate(termination(h.lifecycleConfig, h.sandbox.requestId));
  await rmdir(h.root);
}

{
  const root = await mkdtemp(join(tmpdir(), "omega-r2b-unowned-"));
  const fakeSandbox: R2AProvisionedSandbox = {
    sandboxId: "sandbox://unowned/fake",
    requestId: "UNOWNED",
    canonicalPath: root,
    objectIdentity: { identityScheme: "HOST_STABLE_ID", volumeOrDevice: "fake", objectId: "fake", observedAtEpochMs: NOW },
    createdAtEpochMs: NOW,
    expiresAtEpochMs: NOW + 1_000,
  };
  const h = await harness("ownership");
  await assertRejects(R2BIsolatedContentCreator.create({ ...h.contentConfig, sandbox: fakeSandbox }, NOW), "content capability cannot bind an unowned directory");
  await rmdir(root);
  await terminateEmpty(h);
}

assert(R2_B_ISOLATED_CANDIDATE_STATUS.newCapability === "BOUNDED_SANDBOX_CONTENT_CREATION", "chunk reports a concrete new capability");
assert(R2_B_ISOLATED_CANDIDATE_STATUS.authorityGranted === false && !R2_B_ISOLATED_CANDIDATE_STATUS.productionEligible, "SEC-003 keeps production promotion false");
assert(R2_B_ISOLATED_CANDIDATE_STATUS.unavailableCapabilities.includes("MODIFY_SANDBOX_CONTENT")
  && R2_B_ISOLATED_CANDIDATE_STATUS.unavailableCapabilities.includes("DELETE_SANDBOX_CONTENT"), "later R2-C/R2-D content authorities remain unavailable");

async function assertRejects(promise: Promise<unknown>, label: string): Promise<void> {
  try { await promise; assert(false, label); }
  catch { assert(true, label); }
}

console.log(`Omega R2-B isolated content tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  console.error("FAILURES:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
