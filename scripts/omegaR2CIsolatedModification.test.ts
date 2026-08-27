import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, realpath, readdir, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  R2AIsolatedSandboxLifecycle,
  type R2AIsolatedLifecycleConfig,
  type R2ATerminationRequest,
} from "../src/lib/codelab/executor/r2SandboxLifecycle";
import {
  R2BIsolatedContentCreator,
  type R2BCreatedArtifact,
  type R2BIsolatedContentConfig,
} from "../src/lib/codelab/executor/r2SandboxContent";
import {
  R2_C_ISOLATED_CANDIDATE_STATUS,
  R2CIsolatedContentModifier,
  type R2CIsolatedModificationConfig,
  type R2CModifyRequest,
} from "../src/lib/codelab/executor/r2SandboxModification";
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
  readonly contentConfig: R2BIsolatedContentConfig;
  readonly creator: R2BIsolatedContentCreator;
  readonly artifact: R2BCreatedArtifact;
  readonly modificationConfig: R2CIsolatedModificationConfig;
}

async function harness(label: string, baseContent = "base content\n", maxFileBytes = 1_000_000): Promise<Harness> {
  const root = await mkdtemp(join(tmpdir(), `omega-r2c-${label}-`));
  const lifecycleConfig: R2AIsolatedLifecycleConfig = {
    executorId: `R2A-EXECUTOR-${label}`,
    candidateCommit: CANDIDATE,
    capabilityVersion: "r2-a/1",
    evaluatorVersion: "r2c-isolated-eval/1",
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
  const provisioned = await lifecycle.provision(provisionRequest(lifecycleConfig, `R2A-${label}`), NOW);
  if (!provisioned.sandbox) throw new Error(`harness_provision_failed:${provisioned.reason}`);
  const contentConfig: R2BIsolatedContentConfig = {
    executorId: `R2B-EXECUTOR-${label}`,
    candidateCommit: CANDIDATE,
    evaluatorVersion: "r2c-isolated-eval/1",
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
  };
  const creator = await R2BIsolatedContentCreator.create(contentConfig, NOW);
  const created = await creator.createFile({
    schemaVersion: 1,
    requestId: `R2B-${label}`,
    sandboxId: provisioned.sandbox.sandboxId,
    capabilityId: contentConfig.capability.capabilityId,
    authority: "WRITE_SANDBOX_CONTENT",
    relativePath: "owned.txt",
    content: baseContent,
    issuer: contentConfig.capability.issuer,
    auditIdentity: contentConfig.capability.auditIdentity,
    observedAtEpochMs: NOW + 500,
  });
  if (!created.artifact) throw new Error(`harness_content_failed:${created.reason}`);
  const modificationConfig: R2CIsolatedModificationConfig = {
    executorId: `R2C-EXECUTOR-${label}`,
    candidateCommit: CANDIDATE,
    evaluatorVersion: "r2c-isolated-eval/1",
    environmentIdentity: lifecycleConfig.environmentIdentity,
    authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED",
    sandbox: provisioned.sandbox,
    lifecycle,
    predecessor: creator,
    baseArtifact: created.artifact,
    capability: {
      capabilityId: `R2C-CAP-${label}`,
      issuer: "OMEGA-ISOLATED-TEST-AUTHORITY",
      auditIdentity: `R2C-AUDIT-${label}`,
      issuedAtEpochMs: NOW,
      expiresAtEpochMs: NOW + 80_000,
    },
    maxFileBytes,
  };
  return { root, lifecycleConfig, lifecycle, contentConfig, creator, artifact: created.artifact, modificationConfig };
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

function modifyRequest(config: R2CIsolatedModificationConfig, requestId: string, replacementContent: string, overrides: Partial<R2CModifyRequest> = {}): R2CModifyRequest {
  return {
    schemaVersion: 1,
    requestId,
    sandboxId: config.sandbox.sandboxId,
    artifactId: config.baseArtifact.artifactId,
    capabilityId: config.capability.capabilityId,
    authority: "MODIFY_SANDBOX_CONTENT",
    expectedBaseHash: config.baseArtifact.contentHash,
    replacementContent,
    issuer: config.capability.issuer,
    auditIdentity: config.capability.auditIdentity,
    observedAtEpochMs: NOW + 2_000,
    ...overrides,
  };
}

function termination(config: R2AIsolatedLifecycleConfig, requestId: string, capabilityId = config.capability.capabilityId): R2ATerminationRequest {
  return {
    schemaVersion: 1,
    requestId,
    capabilityId,
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

async function cleanupManually(h: Harness): Promise<void> {
  if (existsSync(h.artifact.canonicalPath)) await unlink(h.artifact.canonicalPath);
  await h.lifecycle.terminate(termination(h.lifecycleConfig, h.modificationConfig.sandbox.requestId));
  await rmdir(h.root);
}

{
  const h = await harness("success");
  const modifier = await R2CIsolatedContentModifier.create(h.modificationConfig, NOW + 1_000);
  assert(h.creator.capabilityProfile().revoked, "R2-B ownership is revoked when the artifact transfers to R2-C");
  const replacement = "replacement content\n";
  const result = await modifier.modifyFile(modifyRequest(h.modificationConfig, "R2C-SUCCESS", replacement));
  assert(result.decision === "MODIFIED" && result.artifact !== null, "owned sandbox content is modified on the real host filesystem");
  assert(result.artifact?.previousContentHash === h.artifact.contentHash, "modification preserves the exact predecessor hash");
  assert(result.artifact?.contentHash === createHash("sha256").update(replacement).digest("hex"), "modified artifact exposes verified result hash");
  assert(result.artifact?.objectIdentity.objectId === h.artifact.objectIdentity.objectId, "in-place modification preserves exact file identity");
  assert((await readFile(h.artifact.canonicalPath, "utf8")) === replacement, "observed file content equals requested replacement");
  assert(result.events.map((event) => event.eventType).join(",") === "MODIFICATION_REQUEST,MODIFICATION_AUTHORIZATION,BASE_IDENTITY_VALIDATION,BASE_HASH_VALIDATION,CONTENT_MODIFICATION,MODIFICATION_POSTCONDITION", "successful modification emits the complete evidence sequence");
  assert(verifyEventChain(result.events), "modification evidence is independently verified as a canonical hash chain");
  assert(result.evidenceClass === "E3" && result.authorityGranted === false, "local modification evidence cannot promote authority");
  assert(!("deleteFile" in modifier) && !("modifyPath" in modifier) && !("executeShell" in modifier) && !("fetch" in modifier), "modifier exposes no arbitrary path, delete, shell, or network primitive");
  const deniedCleanup = await modifier.terminateWithOwnedCleanup(termination(h.lifecycleConfig, h.modificationConfig.sandbox.requestId, "UNAUTHORIZED"));
  assert(deniedCleanup.decision === "REJECTED" && existsSync(h.artifact.canonicalPath), "unauthorized termination cannot delete modified content");
  const finished = await modifier.terminateWithOwnedCleanup(termination(h.lifecycleConfig, h.modificationConfig.sandbox.requestId));
  assert(finished.decision === "TERMINATED", "authorized terminal cleanup removes modified content and sandbox");
  assert(!existsSync(h.modificationConfig.sandbox.canonicalPath) && (await readdir(h.root)).length === 0, "R2-C terminal cleanup restores the approved root");
  assert(modifier.capabilityProfile().revoked, "modification capability is revoked after termination");
  await rmdir(h.root);
}

{
  const h = await harness("preflight", "base", 8);
  const modifier = await R2CIsolatedContentModifier.create(h.modificationConfig, NOW + 1_000);
  const cases: readonly [string, R2CModifyRequest, string][] = [
    ["stale declared base", modifyRequest(h.modificationConfig, "R2C-STALE", "next", { expectedBaseHash: "0".repeat(64) }), "expected_base_hash_mismatch"],
    ["wrong capability", modifyRequest(h.modificationConfig, "R2C-CAP", "next", { capabilityId: "UNAUTHORIZED" }), "modification_capability_identity_mismatch"],
    ["replacement overflow", modifyRequest(h.modificationConfig, "R2C-BYTES", "123456789"), "replacement_byte_limit_exceeded"],
    ["expired request", modifyRequest(h.modificationConfig, "R2C-EXPIRED", "next", { observedAtEpochMs: h.modificationConfig.capability.expiresAtEpochMs }), "modification_capability_expired"],
    ["malformed runtime request", { ...modifyRequest(h.modificationConfig, "R2C-MALFORMED", "next"), replacementContent: null } as unknown as R2CModifyRequest, "modification_request_malformed"],
  ];
  for (const [label, request, reason] of cases) {
    const result = await modifier.modifyFile(request);
    assert((result.decision === "REJECTED" || result.decision === "STALE_REJECTED") && result.reason.includes(reason), `${label} is rejected before mutation`);
    assert((await readFile(h.artifact.canonicalPath, "utf8")) === "base", `${label} preserves base content`);
  }
  const accepted = await modifier.modifyFile(modifyRequest(h.modificationConfig, "R2C-AFTER-REJECT", "accepted"));
  assert(accepted.decision === "MODIFIED", "safe preflight rejection does not consume a valid single-use modification");
  await modifier.terminateWithOwnedCleanup(termination(h.lifecycleConfig, h.modificationConfig.sandbox.requestId));
  await rmdir(h.root);
}

{
  const h = await harness("observed-stale", "expected");
  const modifier = await R2CIsolatedContentModifier.create(h.modificationConfig, NOW + 1_000);
  await writeFile(h.artifact.canonicalPath, "external change", "utf8");
  const result = await modifier.modifyFile(modifyRequest(h.modificationConfig, "R2C-OBSERVED-STALE", "replacement"));
  assert(result.decision === "STALE_REJECTED" && result.reason === "observed_base_hash_changed", "observed stale base is rejected after handle-bound verification");
  assert((await readFile(h.artifact.canonicalPath, "utf8")) === "external change", "stale rejection does not overwrite concurrent content");
  await cleanupManually(h);
}

{
  const h = await harness("identity", "same-content");
  const modifier = await R2CIsolatedContentModifier.create(h.modificationConfig, NOW + 1_000);
  await unlink(h.artifact.canonicalPath);
  await writeFile(h.artifact.canonicalPath, "same-content", "utf8");
  const result = await modifier.modifyFile(modifyRequest(h.modificationConfig, "R2C-IDENTITY", "replacement"));
  assert(result.decision === "QUARANTINED" && result.reason.includes("base_artifact_identity_changed"), "same-content object substitution is rejected and quarantined by identity");
  assert((await readFile(h.artifact.canonicalPath, "utf8")) === "same-content", "identity rejection does not mutate substituted object");
  await cleanupManually(h);
}

assert(R2_C_ISOLATED_CANDIDATE_STATUS.newCapability === "STALE_SAFE_SANDBOX_CONTENT_MODIFICATION", "chunk reports a concrete new capability");
assert(R2_C_ISOLATED_CANDIDATE_STATUS.authorityGranted === false && !R2_C_ISOLATED_CANDIDATE_STATUS.productionEligible, "blocked SEC-003 still prevents promotion");
assert(R2_C_ISOLATED_CANDIDATE_STATUS.unavailableCapabilities.includes("DELETE_SANDBOX_CONTENT")
  && R2_C_ISOLATED_CANDIDATE_STATUS.unavailableCapabilities.includes("MULTI_FILE_TRANSACTION"), "R2-D/R2-E authorities remain unavailable");

console.log(`Omega R2-C isolated modification tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  console.error("FAILURES:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
