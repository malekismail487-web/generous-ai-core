import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, realpath, readdir, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { R2AIsolatedSandboxLifecycle, type R2AIsolatedLifecycleConfig, type R2AProvisionedSandbox, type R2ATerminationRequest } from "../src/lib/codelab/executor/r2SandboxLifecycle";
import { R2BIsolatedContentCreator, type R2BCreatedArtifact, type R2BIsolatedContentConfig } from "../src/lib/codelab/executor/r2SandboxContent";
import {
  R2_E_ISOLATED_CANDIDATE_STATUS,
  R2EIsolatedTransactionEngine,
  type R2ECommitRequest,
  type R2EFaultInjection,
  type R2EIsolatedTransactionConfig,
  type R2EPrepareRequest,
  type R2ETransactionOperation,
} from "../src/lib/codelab/executor/r2SandboxTransaction";
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
  readonly artifacts: ReadonlyMap<string, R2BCreatedArtifact>;
  readonly transactionConfig: R2EIsolatedTransactionConfig;
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
  const root = await mkdtemp(join(tmpdir(), `omega-r2e-${label}-`));
  const lifecycleConfig: R2AIsolatedLifecycleConfig = {
    executorId: `R2A-EXECUTOR-${label}`, candidateCommit: CANDIDATE, capabilityVersion: "r2-a/1",
    evaluatorVersion: "r2e-isolated-eval/1", environmentIdentity: `local-${process.platform}-${process.arch}`,
    authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED", repositoryRoot: REPOSITORY, approvedSandboxRoot: await realpath(root),
    capability: { capabilityId: `R2A-CAP-${label}`, issuer: "OMEGA-ISOLATED-TEST-AUTHORITY", auditIdentity: `R2A-AUDIT-${label}`,
      issuedAtEpochMs: NOW - 1_000, expiresAtEpochMs: NOW + 240_000 },
  };
  const lifecycle = await R2AIsolatedSandboxLifecycle.create(lifecycleConfig, NOW);
  const provisioned = await lifecycle.provision(provisionRequest(lifecycleConfig, `R2A-${label}`), NOW);
  if (!provisioned.sandbox) throw new Error(`provision_failed:${provisioned.reason}`);
  const artifacts = new Map<string, R2BCreatedArtifact>();
  const ownedInputs: { predecessor: R2BIsolatedContentCreator; artifact: R2BCreatedArtifact }[] = [];
  for (const [index, name, content] of [[0, "modify.txt", "modify-base"], [1, "delete.txt", "delete-base"]] as const) {
    const config: R2BIsolatedContentConfig = {
      executorId: `R2B-EXECUTOR-${label}-${index}`, candidateCommit: CANDIDATE, evaluatorVersion: "r2e-isolated-eval/1",
      environmentIdentity: lifecycleConfig.environmentIdentity, authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED",
      repositoryRoot: REPOSITORY, sandbox: provisioned.sandbox, lifecycle,
      capability: { capabilityId: `R2B-CAP-${label}-${index}`, issuer: "OMEGA-ISOLATED-TEST-AUTHORITY",
        auditIdentity: `R2B-AUDIT-${label}-${index}`, issuedAtEpochMs: NOW, expiresAtEpochMs: NOW + 220_000 },
    };
    const creator = await R2BIsolatedContentCreator.create(config, NOW);
    const created = await creator.createFile({ schemaVersion: 1, requestId: `R2B-${label}-${index}`, sandboxId: provisioned.sandbox.sandboxId,
      capabilityId: config.capability.capabilityId, authority: "WRITE_SANDBOX_CONTENT", relativePath: name, content,
      issuer: config.capability.issuer, auditIdentity: config.capability.auditIdentity, observedAtEpochMs: NOW + 1_000 });
    if (!created.artifact) throw new Error(`create_failed:${created.reason}`);
    artifacts.set(name, created.artifact); ownedInputs.push({ predecessor: creator, artifact: created.artifact });
  }
  const transactionConfig: R2EIsolatedTransactionConfig = {
    executorId: `R2E-EXECUTOR-${label}`, candidateCommit: CANDIDATE, evaluatorVersion: "r2e-isolated-eval/1",
    environmentIdentity: lifecycleConfig.environmentIdentity, authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED",
    sandbox: provisioned.sandbox, lifecycle, ownedInputs,
    capability: { capabilityId: `R2E-CAP-${label}`, issuer: "OMEGA-ISOLATED-TEST-AUTHORITY", auditIdentity: `R2E-AUDIT-${label}`,
      issuedAtEpochMs: NOW, expiresAtEpochMs: NOW + 200_000 }, maxOperations: 4, maxTotalBytes: 1024,
    allowedExtensions: [".txt"], faultInjection,
  };
  return { root, lifecycleConfig, lifecycle, sandbox: provisioned.sandbox, artifacts, transactionConfig };
}

function operations(h: Harness): readonly R2ETransactionOperation[] {
  return [
    { kind: "CREATE", relativePath: "created.txt", content: "created-value" },
    { kind: "MODIFY", relativePath: "modify.txt", expectedBaseHash: h.artifacts.get("modify.txt")!.contentHash, replacementContent: "modified-value" },
    { kind: "DELETE", relativePath: "delete.txt", expectedBaseHash: h.artifacts.get("delete.txt")!.contentHash },
  ];
}

function prepareRequest(h: Harness, requestId: string, ops = operations(h), overrides: Partial<R2EPrepareRequest> = {}): R2EPrepareRequest {
  return { schemaVersion: 1, requestId, transactionId: `TX-${requestId}`, sandboxId: h.sandbox.sandboxId,
    capabilityId: h.transactionConfig.capability.capabilityId, authority: "PREPARE_SANDBOX_TRANSACTION", operations: ops,
    issuer: h.transactionConfig.capability.issuer, auditIdentity: h.transactionConfig.capability.auditIdentity,
    observedAtEpochMs: NOW + 5_000, ...overrides };
}

function commitRequest(h: Harness, transactionId: string, requestId: string, overrides: Partial<R2ECommitRequest> = {}): R2ECommitRequest {
  return { schemaVersion: 1, requestId, transactionId, sandboxId: h.sandbox.sandboxId,
    capabilityId: h.transactionConfig.capability.capabilityId, authority: "COMMIT_SANDBOX_TRANSACTION",
    issuer: h.transactionConfig.capability.issuer, auditIdentity: h.transactionConfig.capability.auditIdentity,
    observedAtEpochMs: NOW + 10_000, ...overrides };
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
  const engine = await R2EIsolatedTransactionEngine.create(h.transactionConfig, NOW + 2_000);
  const prepared = await engine.prepare(prepareRequest(h, "PREPARE-SUCCESS"));
  assert(prepared.decision === "PREPARED" && prepared.transaction?.operations.length === 3, "three bounded operations prepare as one transaction");
  assert(prepared.transaction?.operations.every((operation) => !("content" in operation) && !("replacementContent" in operation)), "public preparation evidence contains hashes but no content");
  assert((await readFile(join(h.sandbox.canonicalPath, "modify.txt"), "utf8")) === "modify-base" && !existsSync(join(h.sandbox.canonicalPath, "created.txt")), "prepare performs no mutation");
  const committed = await engine.commit(commitRequest(h, prepared.transaction!.transactionId, "COMMIT-SUCCESS"));
  assert(committed.decision === "COMMITTED" && committed.transaction !== null, "prepared transaction commits atomically within the process-local boundary");
  assert((await readFile(join(h.sandbox.canonicalPath, "created.txt"), "utf8")) === "created-value", "create operation poststate is observed");
  assert((await readFile(join(h.sandbox.canonicalPath, "modify.txt"), "utf8")) === "modified-value", "modify operation poststate is observed");
  assert(!existsSync(join(h.sandbox.canonicalPath, "delete.txt")), "delete operation poststate is observed");
  assert(verifyChain(committed.events), "transaction evidence is independently recomputed as a canonical hash chain");
  assert(committed.evidenceClass === "E3" && committed.authorityGranted === false, "local transaction evidence cannot grant authority");
  const unauthorizedCleanup = await engine.terminateWithOwnedCleanup(termination(h.lifecycleConfig, h.sandbox.requestId, "WRONG"));
  assert(unauthorizedCleanup.decision === "REJECTED" && existsSync(join(h.sandbox.canonicalPath, "modify.txt")), "cleanup authorization is enforced before mutation");
  const finished = await engine.terminateWithOwnedCleanup(termination(h.lifecycleConfig, h.sandbox.requestId));
  assert(finished.decision === "TERMINATED" && (await readdir(h.root)).length === 0, "verified transaction poststate is cleaned and sandbox terminates");
  await rmdir(h.root);
}

{
  const h = await harness("preflight");
  const engine = await R2EIsolatedTransactionEngine.create(h.transactionConfig, NOW + 2_000);
  const badCases: readonly [string, R2EPrepareRequest, string][] = [
    ["duplicate", prepareRequest(h, "DUP", [operations(h)[0], operations(h)[0]]), "duplicate_transaction_target"],
    ["traversal", prepareRequest(h, "TRAV", [{ kind: "CREATE", relativePath: "../escape.txt", content: "x" }]), "transaction_target_invalid"],
    ["unsupported extension", prepareRequest(h, "EXT", [{ kind: "CREATE", relativePath: "bad.exe", content: "x" }]), "transaction_target_invalid"],
    ["overflow", prepareRequest(h, "BYTES", [{ kind: "CREATE", relativePath: "big.txt", content: "x".repeat(2048) }]), "transaction_byte_limit_exceeded"],
    ["wrong authority", prepareRequest(h, "AUTH", operations(h), { authority: "COMMIT_SANDBOX_TRANSACTION" } as Partial<R2EPrepareRequest>), "transaction_authority_mismatch"],
  ];
  for (const [label, request, reason] of badCases) {
    const result = await engine.prepare(request);
    assert(result.decision === "REJECTED" && result.reason.includes(reason), `${label} prepare is rejected`);
    assert((await readdir(h.sandbox.canonicalPath)).sort().join(",") === "delete.txt,modify.txt", `${label} rejection preserves the complete prestate`);
  }
  const good = await engine.prepare(prepareRequest(h, "AFTER-REJECT"));
  assert(good.decision === "PREPARED", "invalid preparations do not consume the transaction engine");
  const wrongCommit = await engine.commit(commitRequest(h, "WRONG-TX", "WRONG-COMMIT"));
  assert(wrongCommit.decision === "REJECTED", "commit must bind to the exact prepared transaction");
  const committed = await engine.commit(commitRequest(h, good.transaction!.transactionId, "RIGHT-COMMIT"));
  assert(committed.decision === "COMMITTED", "valid commit remains available after denied commit request");
  await engine.terminateWithOwnedCleanup(termination(h.lifecycleConfig, h.sandbox.requestId));
  await rmdir(h.root);
}

{
  const h = await harness("stale");
  const engine = await R2EIsolatedTransactionEngine.create(h.transactionConfig, NOW + 2_000);
  const prepared = await engine.prepare(prepareRequest(h, "STALE-PREPARE"));
  await writeFile(join(h.sandbox.canonicalPath, "modify.txt"), "external-divergence", "utf8");
  const commit = await engine.commit(commitRequest(h, prepared.transaction!.transactionId, "STALE-COMMIT"));
  assert(commit.decision === "STALE_REJECTED", "prepared base divergence rejects commit before the first mutation");
  assert(!existsSync(join(h.sandbox.canonicalPath, "created.txt")) && existsSync(join(h.sandbox.canonicalPath, "delete.txt")), "stale transaction applies no partial operation");
  assert((await readFile(join(h.sandbox.canonicalPath, "modify.txt"), "utf8")) === "external-divergence", "stale rejection preserves external divergence");
  await manualCleanup(h);
}

{
  const h = await harness("abort", { failAfterOperationIndex: 1 });
  const engine = await R2EIsolatedTransactionEngine.create(h.transactionConfig, NOW + 2_000);
  const prepared = await engine.prepare(prepareRequest(h, "ABORT-PREPARE"));
  const commit = await engine.commit(commitRequest(h, prepared.transaction!.transactionId, "ABORT-COMMIT"));
  assert(commit.decision === "ABORTED_RESTORED" && commit.reason.includes("prestate_restoration_verified"), "induced mid-commit failure aborts and restores prestate");
  assert(!existsSync(join(h.sandbox.canonicalPath, "created.txt")), "failed create is removed during abort");
  assert((await readFile(join(h.sandbox.canonicalPath, "modify.txt"), "utf8")) === "modify-base", "failed modification is restored exactly");
  assert((await readFile(join(h.sandbox.canonicalPath, "delete.txt"), "utf8")) === "delete-base", "untouched deletion target remains exact");
  assert(commit.events.some((event) => event.eventType === "TRANSACTION_ABORTED")
    && commit.events.some((event) => event.eventType === "TRANSACTION_PRESTATE_RESTORED"), "abort and proven restoration are distinct evidence events");
  await manualCleanup(h);
}

{
  const h = await harness("quarantine", { failAfterOperationIndex: 0, failRollbackForRelativePath: "created.txt" });
  const engine = await R2EIsolatedTransactionEngine.create(h.transactionConfig, NOW + 2_000);
  const prepared = await engine.prepare(prepareRequest(h, "QUARANTINE-PREPARE"));
  const commit = await engine.commit(commitRequest(h, prepared.transaction!.transactionId, "QUARANTINE-COMMIT"));
  assert(commit.decision === "QUARANTINED" && commit.reason.includes("prestate_restoration_unverified"), "unverifiable restoration quarantines the transaction capability");
  assert(engine.capabilityProfile().revoked, "quarantined engine is revoked");
  assert(commit.events.some((event) => event.eventType === "TRANSACTION_QUARANTINED"), "quarantine is explicitly evidenced");
  await manualCleanup(h);
}

assert(R2_E_ISOLATED_CANDIDATE_STATUS.newCapability === "ATOMIC_BOUNDED_SANDBOX_TRANSACTION", "chunk reports the exact new capability");
assert(R2_E_ISOLATED_CANDIDATE_STATUS.authorityGranted === false && !R2_E_ISOLATED_CANDIDATE_STATUS.productionEligible, "R2-E remains an isolated candidate");
assert(R2_E_ISOLATED_CANDIDATE_STATUS.unavailableCapabilities.includes("ROLLBACK_COMMITTED_TRANSACTION")
  && R2_E_ISOLATED_CANDIDATE_STATUS.forbiddenCapabilities.includes("WRITE_REPOSITORY"), "R2-F and repository writes remain unavailable");
assert(!("rollbackCommitted" in R2EIsolatedTransactionEngine.prototype) && !("applyPatch" in R2EIsolatedTransactionEngine.prototype), "R2-E exposes neither committed rollback nor patch application");

console.log(`Omega R2-E isolated transaction tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  console.error("FAILURES:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
