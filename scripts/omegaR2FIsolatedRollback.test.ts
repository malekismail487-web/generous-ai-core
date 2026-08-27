import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, realpath, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { R2AIsolatedSandboxLifecycle, type R2AIsolatedLifecycleConfig, type R2AProvisionedSandbox, type R2ATerminationRequest } from "../src/lib/codelab/executor/r2SandboxLifecycle";
import { R2BIsolatedContentCreator, type R2BCreatedArtifact, type R2BIsolatedContentConfig } from "../src/lib/codelab/executor/r2SandboxContent";
import {
  R2EIsolatedTransactionEngine,
  type R2ECommittedTransaction,
  type R2EFaultInjection,
  type R2EIsolatedTransactionConfig,
  type R2ETransactionOperation,
} from "../src/lib/codelab/executor/r2SandboxTransaction";
import {
  R2_F_ISOLATED_CANDIDATE_STATUS,
  R2FIsolatedRollbackController,
  type R2FIsolatedRollbackConfig,
  type R2FRollbackRequest,
} from "../src/lib/codelab/executor/r2SandboxRollback";
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
  readonly transactionConfig: R2EIsolatedTransactionConfig;
  readonly engine: R2EIsolatedTransactionEngine;
  readonly committed: R2ECommittedTransaction;
}

function provisionRequest(config: R2AIsolatedLifecycleConfig, requestId: string): SandboxProvisionRequest {
  return { schemaVersion: 1, requestId, capabilityId: config.capability.capabilityId, authority: "PROVISION_SANDBOX",
    requestedPath: `sandbox-${requestId}`, repositoryRoot: config.repositoryRoot, approvedSandboxRoot: config.approvedSandboxRoot,
    issuedAtEpochMs: NOW, expiresAtEpochMs: NOW + 180_000, issuer: config.capability.issuer, auditIdentity: config.capability.auditIdentity,
    candidateBinding: { commit: config.candidateCommit, capabilityVersion: config.capabilityVersion, schemaVersion: 1,
      evaluatorVersion: config.evaluatorVersion, environmentIdentity: config.environmentIdentity } };
}

function termination(config: R2AIsolatedLifecycleConfig, requestId: string, capabilityId = config.capability.capabilityId): R2ATerminationRequest {
  return { schemaVersion: 1, requestId, capabilityId, authority: "TERMINATE_SANDBOX", issuer: config.capability.issuer,
    auditIdentity: config.capability.auditIdentity, observedAtEpochMs: NOW + 100_000 };
}

async function harness(label: string, faultInjection?: R2EFaultInjection): Promise<Harness> {
  const root = await mkdtemp(join(tmpdir(), `omega-r2f-${label}-`));
  const lifecycleConfig: R2AIsolatedLifecycleConfig = {
    executorId: `R2A-${label}`, candidateCommit: CANDIDATE, capabilityVersion: "r2-a/1", evaluatorVersion: "r2f-eval/1",
    environmentIdentity: `local-${process.platform}-${process.arch}`, authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED",
    repositoryRoot: REPOSITORY, approvedSandboxRoot: await realpath(root), capability: { capabilityId: `R2A-CAP-${label}`,
      issuer: "OMEGA-ISOLATED-TEST-AUTHORITY", auditIdentity: `R2A-AUDIT-${label}`, issuedAtEpochMs: NOW - 1_000, expiresAtEpochMs: NOW + 240_000 },
  };
  const lifecycle = await R2AIsolatedSandboxLifecycle.create(lifecycleConfig, NOW);
  const provisioned = await lifecycle.provision(provisionRequest(lifecycleConfig, `R2A-${label}`), NOW);
  if (!provisioned.sandbox) throw new Error("provision_failed");
  const artifacts = new Map<string, R2BCreatedArtifact>();
  const ownedInputs: { predecessor: R2BIsolatedContentCreator; artifact: R2BCreatedArtifact }[] = [];
  for (const [index, name, content] of [[0, "modify.txt", "modify-base"], [1, "delete.txt", "delete-base"]] as const) {
    const config: R2BIsolatedContentConfig = { executorId: `R2B-${label}-${index}`, candidateCommit: CANDIDATE,
      evaluatorVersion: "r2f-eval/1", environmentIdentity: lifecycleConfig.environmentIdentity,
      authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED", repositoryRoot: REPOSITORY, sandbox: provisioned.sandbox, lifecycle,
      capability: { capabilityId: `R2B-CAP-${label}-${index}`, issuer: "OMEGA-ISOLATED-TEST-AUTHORITY",
        auditIdentity: `R2B-AUDIT-${label}-${index}`, issuedAtEpochMs: NOW, expiresAtEpochMs: NOW + 220_000 } };
    const creator = await R2BIsolatedContentCreator.create(config, NOW);
    const created = await creator.createFile({ schemaVersion: 1, requestId: `CREATE-${label}-${index}`, sandboxId: provisioned.sandbox.sandboxId,
      capabilityId: config.capability.capabilityId, authority: "WRITE_SANDBOX_CONTENT", relativePath: name, content,
      issuer: config.capability.issuer, auditIdentity: config.capability.auditIdentity, observedAtEpochMs: NOW + 1_000 });
    if (!created.artifact) throw new Error("content_create_failed");
    artifacts.set(name, created.artifact); ownedInputs.push({ predecessor: creator, artifact: created.artifact });
  }
  const transactionConfig: R2EIsolatedTransactionConfig = { executorId: `R2E-${label}`, candidateCommit: CANDIDATE,
    evaluatorVersion: "r2f-eval/1", environmentIdentity: lifecycleConfig.environmentIdentity,
    authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED", sandbox: provisioned.sandbox, lifecycle, ownedInputs,
    capability: { capabilityId: `R2E-CAP-${label}`, issuer: "OMEGA-ISOLATED-TEST-AUTHORITY", auditIdentity: `R2E-AUDIT-${label}`,
      issuedAtEpochMs: NOW, expiresAtEpochMs: NOW + 200_000 }, maxOperations: 4, maxTotalBytes: 1024,
    allowedExtensions: [".txt"], faultInjection };
  const engine = await R2EIsolatedTransactionEngine.create(transactionConfig, NOW + 2_000);
  const operations: readonly R2ETransactionOperation[] = [
    { kind: "CREATE", relativePath: "created.txt", content: "created-value" },
    { kind: "MODIFY", relativePath: "modify.txt", expectedBaseHash: artifacts.get("modify.txt")!.contentHash, replacementContent: "modified-value" },
    { kind: "DELETE", relativePath: "delete.txt", expectedBaseHash: artifacts.get("delete.txt")!.contentHash },
  ];
  const prepared = await engine.prepare({ schemaVersion: 1, requestId: `PREPARE-${label}`, transactionId: `TX-${label}`,
    sandboxId: provisioned.sandbox.sandboxId, capabilityId: transactionConfig.capability.capabilityId,
    authority: "PREPARE_SANDBOX_TRANSACTION", operations, issuer: transactionConfig.capability.issuer,
    auditIdentity: transactionConfig.capability.auditIdentity, observedAtEpochMs: NOW + 5_000 });
  if (!prepared.transaction) throw new Error(`prepare_failed:${prepared.reason}`);
  const committed = await engine.commit({ schemaVersion: 1, requestId: `COMMIT-${label}`, transactionId: prepared.transaction.transactionId,
    sandboxId: provisioned.sandbox.sandboxId, capabilityId: transactionConfig.capability.capabilityId,
    authority: "COMMIT_SANDBOX_TRANSACTION", issuer: transactionConfig.capability.issuer,
    auditIdentity: transactionConfig.capability.auditIdentity, observedAtEpochMs: NOW + 10_000 });
  if (!committed.transaction) throw new Error(`commit_failed:${committed.reason}`);
  return { root, lifecycleConfig, lifecycle, sandbox: provisioned.sandbox, transactionConfig, engine, committed: committed.transaction };
}

function rollbackConfig(h: Harness, label: string): R2FIsolatedRollbackConfig {
  return { executorId: `R2F-${label}`, candidateCommit: CANDIDATE, evaluatorVersion: "r2f-eval/1",
    environmentIdentity: h.transactionConfig.environmentIdentity, authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED",
    transactionEngine: h.engine, committedTransaction: h.committed,
    capability: { capabilityId: `R2F-CAP-${label}`, issuer: "OMEGA-ISOLATED-TEST-AUTHORITY", auditIdentity: `R2F-AUDIT-${label}`,
      issuedAtEpochMs: NOW, expiresAtEpochMs: NOW + 180_000 } };
}

function rollbackRequest(config: R2FIsolatedRollbackConfig, controller: R2FIsolatedRollbackController, requestId: string,
  overrides: Partial<R2FRollbackRequest> = {}): R2FRollbackRequest {
  const lease = controller.rollbackLease();
  return { schemaVersion: 1, requestId, transactionId: lease.transactionId, rollbackLeaseId: lease.leaseId, sandboxId: lease.sandboxId,
    capabilityId: config.capability.capabilityId, authority: "ROLLBACK_COMMITTED_TRANSACTION",
    expectedPoststateDigest: config.committedTransaction.poststateDigest, issuer: config.capability.issuer,
    auditIdentity: config.capability.auditIdentity, observedAtEpochMs: NOW + 20_000, ...overrides };
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

function verifyChain(events: readonly { previousHash: string; eventHash: string }[]): boolean {
  let previous = "GENESIS";
  for (const event of events) {
    const { eventHash, ...base } = event;
    if (event.previousHash !== previous || createHash("sha256").update(canonical(base)).digest("hex") !== eventHash) return false;
    previous = eventHash;
  }
  return true;
}

async function manualCleanup(h: Harness): Promise<void> {
  for (const name of ["modify.txt", "delete.txt", "created.txt"]) {
    const path = join(h.sandbox.canonicalPath, name);
    if (existsSync(path)) await unlink(path);
  }
  if (h.lifecycle.ownsActiveSandbox(h.sandbox)) await h.lifecycle.terminate(termination(h.lifecycleConfig, h.sandbox.requestId));
  await rmdir(h.root);
}

{
  const h = await harness("success");
  const config = rollbackConfig(h, "success");
  const controller = R2FIsolatedRollbackController.create(config);
  const cases: readonly [string, Partial<R2FRollbackRequest>, string][] = [
    ["wrong lease", { rollbackLeaseId: "WRONG" }, "rollback_lease_binding_mismatch"],
    ["wrong capability", { capabilityId: "WRONG" }, "rollback_capability_identity_mismatch"],
    ["expired", { observedAtEpochMs: config.capability.expiresAtEpochMs }, "rollback_capability_expired"],
    ["evidence corruption", { expectedPoststateDigest: "0".repeat(64) }, "rollback_evidence_digest_mismatch"],
  ];
  for (const [label, override, reason] of cases) {
    const rejected = await controller.rollback(rollbackRequest(config, controller, `REJECT-${label}`, override));
    assert(rejected.decision === "REJECTED" && rejected.reason.includes(reason), `${label} rollback request is rejected`);
    assert((await readFile(join(h.sandbox.canonicalPath, "modify.txt"), "utf8")) === "modified-value", `${label} rejection preserves committed state`);
  }
  const result = await controller.rollback(rollbackRequest(config, controller, "ROLLBACK-SUCCESS"));
  assert(result.decision === "ROLLED_BACK" && result.prestateDigest !== null, "committed transaction explicitly rolls back");
  assert(!existsSync(join(h.sandbox.canonicalPath, "created.txt")), "rollback removes transaction-created artifact");
  assert((await readFile(join(h.sandbox.canonicalPath, "modify.txt"), "utf8")) === "modify-base", "rollback restores modified preimage exactly");
  assert((await readFile(join(h.sandbox.canonicalPath, "delete.txt"), "utf8")) === "delete-base", "rollback restores deleted preimage exactly");
  assert(result.events.some((event) => event.eventType === "ROLLBACK_REQUESTED")
    && result.events.some((event) => event.eventType === "ROLLBACK_EXECUTED")
    && result.events.some((event) => event.eventType === "ROLLBACK_PROVEN"), "requested, executed, and proven are distinct evidence states");
  assert(verifyChain(result.events), "rollback evidence is independently recomputed as a canonical hash chain");
  const repeated = await controller.rollback(rollbackRequest(config, controller, "ROLLBACK-REPEATED"));
  assert(repeated.decision === "REJECTED" && repeated.reason.includes("rollback_already_completed"), "repeated rollback is rejected");
  const deniedCleanup = await controller.terminateWithOwnedCleanup(termination(h.lifecycleConfig, h.sandbox.requestId, "WRONG"));
  assert(deniedCleanup.decision === "REJECTED" && existsSync(join(h.sandbox.canonicalPath, "modify.txt")), "unauthorized recovered-state cleanup is rejected");
  const cleanup = await controller.terminateWithOwnedCleanup(termination(h.lifecycleConfig, h.sandbox.requestId));
  assert(cleanup.decision === "TERMINATED" && !existsSync(h.sandbox.canonicalPath), "verified recovered state is cleaned and sandbox terminates");
  await rmdir(h.root);
}

{
  const h = await harness("stale");
  const config = rollbackConfig(h, "stale");
  const controller = R2FIsolatedRollbackController.create(config);
  await writeFile(join(h.sandbox.canonicalPath, "modify.txt"), "external-after-commit", "utf8");
  const result = await controller.rollback(rollbackRequest(config, controller, "ROLLBACK-STALE"));
  assert(result.decision === "STALE_REJECTED", "external post-commit divergence rejects rollback before restoration");
  assert((await readFile(join(h.sandbox.canonicalPath, "modify.txt"), "utf8")) === "external-after-commit", "stale rollback never overwrites external divergence");
  assert(existsSync(join(h.sandbox.canonicalPath, "created.txt")) && !existsSync(join(h.sandbox.canonicalPath, "delete.txt")), "stale rejection preserves remaining committed poststate");
  await manualCleanup(h);
}

{
  const h = await harness("partial-failure", { failExplicitRollbackForRelativePath: "modify.txt" });
  const config = rollbackConfig(h, "partial-failure");
  const controller = R2FIsolatedRollbackController.create(config);
  const result = await controller.rollback(rollbackRequest(config, controller, "ROLLBACK-PARTIAL"));
  assert(result.decision === "QUARANTINED" && result.reason === "induced_explicit_rollback_failure", "partial restoration failure quarantines rollback");
  assert(controller.capabilityProfile().revoked, "failed restoration revokes the rollback controller");
  assert(existsSync(join(h.sandbox.canonicalPath, "delete.txt")), "fault after one restoration proves a partial rollback path was exercised");
  assert(result.events.some((event) => event.eventType === "ROLLBACK_QUARANTINED"), "failed restoration emits explicit quarantine evidence");
  await manualCleanup(h);
}

{
  const h = await harness("substitution");
  const config = rollbackConfig(h, "substitution");
  const controller = R2FIsolatedRollbackController.create(config);
  const createdPath = join(h.sandbox.canonicalPath, "created.txt");
  await unlink(createdPath); await writeFile(createdPath, "created-value", "utf8");
  const result = await controller.rollback(rollbackRequest(config, controller, "ROLLBACK-SUBSTITUTED"));
  assert(result.decision === "STALE_REJECTED", "same-content identity substitution is rejected before rollback");
  assert((await readFile(createdPath, "utf8")) === "created-value", "substituted object remains untouched");
  await manualCleanup(h);
}

assert(R2_F_ISOLATED_CANDIDATE_STATUS.newCapability === "EXPLICIT_COMMITTED_TRANSACTION_ROLLBACK", "chunk reports its concrete rollback capability");
assert(R2_F_ISOLATED_CANDIDATE_STATUS.authorityGranted === false && !R2_F_ISOLATED_CANDIDATE_STATUS.productionEligible, "R2-F remains an isolated candidate");
assert(R2_F_ISOLATED_CANDIDATE_STATUS.unavailableCapabilities.includes("PROPOSE_REPOSITORY_PATCH")
  && R2_F_ISOLATED_CANDIDATE_STATUS.forbiddenCapabilities.includes("WRITE_REPOSITORY"), "R2-G and repository writes remain unavailable");

console.log(`Omega R2-F isolated rollback tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  console.error("FAILURES:"); for (const failure of failures) console.error(`  - ${failure}`); process.exit(1);
}
