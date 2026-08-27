import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, realpath, readdir, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  R2AIsolatedSandboxLifecycle,
  type R2AIsolatedLifecycleConfig,
  type R2AProvisionedSandbox,
  type R2ATerminationRequest,
} from "../src/lib/codelab/executor/r2SandboxLifecycle";
import { R2BIsolatedContentCreator, type R2BIsolatedContentConfig } from "../src/lib/codelab/executor/r2SandboxContent";
import {
  R2CIsolatedContentModifier,
  type R2CIsolatedModificationConfig,
} from "../src/lib/codelab/executor/r2SandboxModification";
import {
  R2_D_ISOLATED_CANDIDATE_STATUS,
  R2DIsolatedReversibleDeleter,
  type R2DDeleteRequest,
  type R2DIsolatedDeletionConfig,
  type R2DRestoreRequest,
} from "../src/lib/codelab/executor/r2SandboxDeletion";
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
  readonly modifier: R2CIsolatedContentModifier;
  readonly deletionConfig: R2DIsolatedDeletionConfig;
}

function provisionRequest(config: R2AIsolatedLifecycleConfig, requestId: string): SandboxProvisionRequest {
  return {
    schemaVersion: 1, requestId, capabilityId: config.capability.capabilityId, authority: "PROVISION_SANDBOX",
    requestedPath: `sandbox-${requestId}`, repositoryRoot: config.repositoryRoot, approvedSandboxRoot: config.approvedSandboxRoot,
    issuedAtEpochMs: NOW, expiresAtEpochMs: NOW + 60_000, issuer: config.capability.issuer,
    auditIdentity: config.capability.auditIdentity,
    candidateBinding: { commit: config.candidateCommit, capabilityVersion: config.capabilityVersion, schemaVersion: 1,
      evaluatorVersion: config.evaluatorVersion, environmentIdentity: config.environmentIdentity },
  };
}

function termination(config: R2AIsolatedLifecycleConfig, requestId: string, capabilityId = config.capability.capabilityId): R2ATerminationRequest {
  return { schemaVersion: 1, requestId, capabilityId, authority: "TERMINATE_SANDBOX", issuer: config.capability.issuer,
    auditIdentity: config.capability.auditIdentity, observedAtEpochMs: NOW + 20_000 };
}

async function harness(label: string, content = `private-${label}-payload\n`): Promise<Harness> {
  const root = await mkdtemp(join(tmpdir(), `omega-r2d-${label}-`));
  const lifecycleConfig: R2AIsolatedLifecycleConfig = {
    executorId: `R2A-EXECUTOR-${label}`, candidateCommit: CANDIDATE, capabilityVersion: "r2-a/1",
    evaluatorVersion: "r2d-isolated-eval/1", environmentIdentity: `local-${process.platform}-${process.arch}`,
    authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED", repositoryRoot: REPOSITORY, approvedSandboxRoot: await realpath(root),
    capability: { capabilityId: `R2A-CAP-${label}`, issuer: "OMEGA-ISOLATED-TEST-AUTHORITY", auditIdentity: `R2A-AUDIT-${label}`,
      issuedAtEpochMs: NOW - 1_000, expiresAtEpochMs: NOW + 120_000 },
  };
  const lifecycle = await R2AIsolatedSandboxLifecycle.create(lifecycleConfig, NOW);
  const provisioned = await lifecycle.provision(provisionRequest(lifecycleConfig, `R2A-${label}`), NOW);
  if (!provisioned.sandbox) throw new Error(`provision_failed:${provisioned.reason}`);
  const contentConfig: R2BIsolatedContentConfig = {
    executorId: `R2B-EXECUTOR-${label}`, candidateCommit: CANDIDATE, evaluatorVersion: "r2d-isolated-eval/1",
    environmentIdentity: lifecycleConfig.environmentIdentity, authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED",
    repositoryRoot: REPOSITORY, sandbox: provisioned.sandbox, lifecycle,
    capability: { capabilityId: `R2B-CAP-${label}`, issuer: "OMEGA-ISOLATED-TEST-AUTHORITY", auditIdentity: `R2B-AUDIT-${label}`,
      issuedAtEpochMs: NOW, expiresAtEpochMs: NOW + 110_000 },
  };
  const creator = await R2BIsolatedContentCreator.create(contentConfig, NOW);
  const created = await creator.createFile({ schemaVersion: 1, requestId: `R2B-${label}`, sandboxId: provisioned.sandbox.sandboxId,
    capabilityId: contentConfig.capability.capabilityId, authority: "WRITE_SANDBOX_CONTENT", relativePath: "owned.txt", content,
    issuer: contentConfig.capability.issuer, auditIdentity: contentConfig.capability.auditIdentity, observedAtEpochMs: NOW + 1_000 });
  if (!created.artifact) throw new Error(`create_failed:${created.reason}`);
  const modificationConfig: R2CIsolatedModificationConfig = {
    executorId: `R2C-EXECUTOR-${label}`, candidateCommit: CANDIDATE, evaluatorVersion: "r2d-isolated-eval/1",
    environmentIdentity: lifecycleConfig.environmentIdentity, authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED",
    sandbox: provisioned.sandbox, lifecycle, predecessor: creator, baseArtifact: created.artifact,
    capability: { capabilityId: `R2C-CAP-${label}`, issuer: "OMEGA-ISOLATED-TEST-AUTHORITY", auditIdentity: `R2C-AUDIT-${label}`,
      issuedAtEpochMs: NOW, expiresAtEpochMs: NOW + 100_000 }, maxFileBytes: 1_000_000,
  };
  const modifier = await R2CIsolatedContentModifier.create(modificationConfig, NOW + 2_000);
  const modified = await modifier.modifyFile({ schemaVersion: 1, requestId: `R2C-${label}`, sandboxId: provisioned.sandbox.sandboxId,
    artifactId: created.artifact.artifactId, capabilityId: modificationConfig.capability.capabilityId, authority: "MODIFY_SANDBOX_CONTENT",
    expectedBaseHash: created.artifact.contentHash, replacementContent: content, issuer: modificationConfig.capability.issuer,
    auditIdentity: modificationConfig.capability.auditIdentity, observedAtEpochMs: NOW + 3_000 });
  if (!modified.artifact) throw new Error(`modify_failed:${modified.reason}`);
  const deletionConfig: R2DIsolatedDeletionConfig = {
    executorId: `R2D-EXECUTOR-${label}`, candidateCommit: CANDIDATE, evaluatorVersion: "r2d-isolated-eval/1",
    environmentIdentity: lifecycleConfig.environmentIdentity, authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED",
    sandbox: provisioned.sandbox, lifecycle, predecessor: modifier, baseArtifact: modified.artifact,
    capability: { capabilityId: `R2D-CAP-${label}`, issuer: "OMEGA-ISOLATED-TEST-AUTHORITY", auditIdentity: `R2D-AUDIT-${label}`,
      issuedAtEpochMs: NOW, expiresAtEpochMs: NOW + 90_000 }, maxPreimageBytes: 1_000_000,
  };
  return { root, lifecycleConfig, lifecycle, sandbox: provisioned.sandbox, modifier, deletionConfig };
}

function deleteRequest(config: R2DIsolatedDeletionConfig, requestId: string, overrides: Partial<R2DDeleteRequest> = {}): R2DDeleteRequest {
  return { schemaVersion: 1, requestId, sandboxId: config.sandbox.sandboxId, artifactId: config.baseArtifact.artifactId,
    capabilityId: config.capability.capabilityId, authority: "DELETE_SANDBOX_CONTENT", requestedRelativePath: "owned.txt",
    expectedContentHash: config.baseArtifact.contentHash, issuer: config.capability.issuer, auditIdentity: config.capability.auditIdentity,
    observedAtEpochMs: NOW + 5_000, ...overrides };
}

function restoreRequest(config: R2DIsolatedDeletionConfig, tombstoneId: string, requestId: string, overrides: Partial<R2DRestoreRequest> = {}): R2DRestoreRequest {
  return { schemaVersion: 1, requestId, sandboxId: config.sandbox.sandboxId, tombstoneId,
    capabilityId: config.capability.capabilityId, authority: "RESTORE_SANDBOX_CONTENT", issuer: config.capability.issuer,
    auditIdentity: config.capability.auditIdentity, observedAtEpochMs: NOW + 8_000, ...overrides };
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

function verifyChain(events: readonly { readonly previousHash: string; readonly eventHash: string }[]): boolean {
  let previous = "GENESIS";
  for (const event of events) {
    const { eventHash, ...input } = event;
    if (event.previousHash !== previous || createHash("sha256").update(canonical(input)).digest("hex") !== eventHash) return false;
    previous = eventHash;
  }
  return true;
}

async function manualCleanup(h: Harness): Promise<void> {
  if (existsSync(h.deletionConfig.baseArtifact.canonicalPath)) await unlink(h.deletionConfig.baseArtifact.canonicalPath);
  if (h.lifecycle.ownsActiveSandbox(h.sandbox)) await h.lifecycle.terminate(termination(h.lifecycleConfig, h.sandbox.requestId));
  await rmdir(h.root);
}

{
  const secretPayload = "sensitive-preimage-never-in-evidence\n";
  const h = await harness("success", secretPayload);
  const deleter = await R2DIsolatedReversibleDeleter.create(h.deletionConfig, NOW + 4_000);
  assert(h.modifier.capabilityProfile().revoked, "R2-C ownership is revoked on transfer to R2-D");
  const deleted = await deleter.deleteOwnedArtifact(deleteRequest(h.deletionConfig, "R2D-DELETE"));
  assert(deleted.decision === "DELETED_REVERSIBLY" && deleted.tombstone !== null, "exact owned artifact is deleted with a recoverable tombstone");
  assert(!existsSync(h.deletionConfig.baseArtifact.canonicalPath), "deletion postcondition is observed on the real filesystem");
  assert(!JSON.stringify(deleted).includes(secretPayload.trim()), "evidence and public tombstone never leak preimage content");
  assert(verifyChain(deleted.events), "deletion evidence is an independently recomputed canonical hash chain");
  const unauthorized = await deleter.restoreDeletedArtifact(restoreRequest(h.deletionConfig, deleted.tombstone!.tombstoneId, "R2D-UNAUTHORIZED", { capabilityId: "WRONG" }));
  assert(unauthorized.decision === "REJECTED" && !existsSync(h.deletionConfig.baseArtifact.canonicalPath), "unauthorized restore is rejected before mutation");
  const restored = await deleter.restoreDeletedArtifact(restoreRequest(h.deletionConfig, deleted.tombstone!.tombstoneId, "R2D-RESTORE"));
  assert(restored.decision === "RESTORED" && restored.artifact !== null, "private preimage restores the artifact through exclusive creation");
  assert((await readFile(h.deletionConfig.baseArtifact.canonicalPath, "utf8")) === secretPayload, "restored bytes exactly equal the preimage");
  assert(restored.artifact?.contentHash === deleted.tombstone?.preimageHash, "independent restoration readback verifies the preimage hash");
  assert((await deleter.restoreDeletedArtifact(restoreRequest(h.deletionConfig, deleted.tombstone!.tombstoneId, "R2D-DOUBLE-RESTORE"))).decision === "REJECTED", "double restoration is rejected");
  const deniedCleanup = await deleter.terminateWithOwnedCleanup(termination(h.lifecycleConfig, h.sandbox.requestId, "WRONG"));
  assert(deniedCleanup.decision === "REJECTED" && existsSync(h.deletionConfig.baseArtifact.canonicalPath), "cleanup authorization occurs before deletion");
  const finished = await deleter.terminateWithOwnedCleanup(termination(h.lifecycleConfig, h.sandbox.requestId));
  assert(finished.decision === "TERMINATED" && !existsSync(h.sandbox.canonicalPath), "authorized cleanup removes restored artifact and terminates sandbox");
  assert(deleter.capabilityProfile().revoked, "R2-D capability is revoked after terminal cleanup");
  await rmdir(h.root);
}

{
  const h = await harness("preflight");
  const deleter = await R2DIsolatedReversibleDeleter.create(h.deletionConfig, NOW + 4_000);
  const cases: readonly [string, R2DDeleteRequest, string][] = [
    ["traversal", deleteRequest(h.deletionConfig, "R2D-TRAVERSAL", { requestedRelativePath: "../owned.txt" }), "requested_path_not_exact_owned_artifact"],
    ["absolute path", deleteRequest(h.deletionConfig, "R2D-ABS", { requestedRelativePath: h.deletionConfig.baseArtifact.canonicalPath }), "requested_path_not_exact_owned_artifact"],
    ["wrong ownership", deleteRequest(h.deletionConfig, "R2D-OWNER", { artifactId: "artifact://other" }), "artifact_binding_mismatch"],
    ["stale hash", deleteRequest(h.deletionConfig, "R2D-STALE", { expectedContentHash: "0".repeat(64) }), "expected_content_hash_mismatch"],
    ["expired", deleteRequest(h.deletionConfig, "R2D-EXPIRED", { observedAtEpochMs: h.deletionConfig.capability.expiresAtEpochMs }), "deletion_capability_expired"],
    ["malformed", { ...deleteRequest(h.deletionConfig, "R2D-MALFORMED"), requestedRelativePath: null } as unknown as R2DDeleteRequest, "deletion_request_malformed"],
  ];
  for (const [label, request, reason] of cases) {
    const result = await deleter.deleteOwnedArtifact(request);
    assert((result.decision === "REJECTED" || result.decision === "STALE_REJECTED") && result.reason.includes(reason), `${label} deletion is rejected`);
    assert(existsSync(h.deletionConfig.baseArtifact.canonicalPath), `${label} rejection preserves the owned artifact`);
  }
  const deleted = await deleter.deleteOwnedArtifact(deleteRequest(h.deletionConfig, "R2D-AFTER-REJECT"));
  assert(deleted.decision === "DELETED_REVERSIBLY", "preflight rejection does not consume the valid deletion capability");
  assert((await deleter.deleteOwnedArtifact(deleteRequest(h.deletionConfig, "R2D-DOUBLE-DELETE"))).decision === "REJECTED", "double delete is rejected");
  assert((await deleter.restoreDeletedArtifact(restoreRequest(h.deletionConfig, "WRONG-TOMBSTONE", "R2D-WRONG-TOMB"))).decision === "REJECTED", "wrong tombstone cannot restore content");
  await deleter.terminateWithOwnedCleanup(termination(h.lifecycleConfig, h.sandbox.requestId));
  await rmdir(h.root);
}

{
  const h = await harness("stale");
  const deleter = await R2DIsolatedReversibleDeleter.create(h.deletionConfig, NOW + 4_000);
  await writeFile(h.deletionConfig.baseArtifact.canonicalPath, "external-content", "utf8");
  const stale = await deleter.deleteOwnedArtifact(deleteRequest(h.deletionConfig, "R2D-OBSERVED-STALE"));
  assert(stale.decision === "STALE_REJECTED", "observed stale content is rejected after handle-bound read");
  assert((await readFile(h.deletionConfig.baseArtifact.canonicalPath, "utf8")) === "external-content", "stale deletion never removes external content");
  await manualCleanup(h);
}

{
  const h = await harness("identity", "same-content");
  const deleter = await R2DIsolatedReversibleDeleter.create(h.deletionConfig, NOW + 4_000);
  await unlink(h.deletionConfig.baseArtifact.canonicalPath);
  await writeFile(h.deletionConfig.baseArtifact.canonicalPath, "same-content", "utf8");
  const substituted = await deleter.deleteOwnedArtifact(deleteRequest(h.deletionConfig, "R2D-SUBSTITUTED"));
  assert(substituted.decision === "QUARANTINED" && substituted.reason.includes("identity_changed"), "same-content identity substitution is quarantined");
  assert(existsSync(h.deletionConfig.baseArtifact.canonicalPath), "identity-substituted object is never deleted");
  await manualCleanup(h);
}

{
  const h = await harness("cleanup-manipulation");
  const deleter = await R2DIsolatedReversibleDeleter.create(h.deletionConfig, NOW + 4_000);
  const deleted = await deleter.deleteOwnedArtifact(deleteRequest(h.deletionConfig, "R2D-CLEANUP-DELETE"));
  await deleter.restoreDeletedArtifact(restoreRequest(h.deletionConfig, deleted.tombstone!.tombstoneId, "R2D-CLEANUP-RESTORE"));
  await writeFile(h.deletionConfig.baseArtifact.canonicalPath, "manipulated-after-restore", "utf8");
  const cleanup = await deleter.terminateWithOwnedCleanup(termination(h.lifecycleConfig, h.sandbox.requestId));
  assert(cleanup.decision === "QUARANTINED", "cleanup manipulation is quarantined instead of deleting divergent content");
  assert(existsSync(h.deletionConfig.baseArtifact.canonicalPath), "quarantined cleanup preserves divergent external content");
  await manualCleanup(h);
}

assert(R2_D_ISOLATED_CANDIDATE_STATUS.newCapability === "REVERSIBLE_OWNED_SANDBOX_ARTIFACT_DELETION", "chunk reports its concrete capability delta");
assert(R2_D_ISOLATED_CANDIDATE_STATUS.authorityGranted === false && !R2_D_ISOLATED_CANDIDATE_STATUS.productionEligible, "isolated R2-D does not grant production authority");
assert(R2_D_ISOLATED_CANDIDATE_STATUS.unavailableCapabilities.includes("MULTI_FILE_TRANSACTION")
  && R2_D_ISOLATED_CANDIDATE_STATUS.forbiddenCapabilities.includes("WRITE_REPOSITORY"), "R2-E and repository mutation remain unavailable");

console.log(`Omega R2-D isolated deletion tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  console.error("FAILURES:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
