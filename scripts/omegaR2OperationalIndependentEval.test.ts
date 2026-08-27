import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { lstat, mkdir, mkdtemp, readFile, realpath, readdir, rmdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { ReadOnlyRepositoryExecutor } from "../src/lib/codelab/executor/readOnlyExecutor";
import { R2AIsolatedSandboxLifecycle, type R2AIsolatedLifecycleConfig, type R2AProvisionedSandbox, type R2ATerminationRequest } from "../src/lib/codelab/executor/r2SandboxLifecycle";
import { R2BIsolatedContentCreator, type R2BCreatedArtifact, type R2BIsolatedContentConfig } from "../src/lib/codelab/executor/r2SandboxContent";
import { R2CIsolatedContentModifier, type R2CIsolatedModificationConfig } from "../src/lib/codelab/executor/r2SandboxModification";
import { R2DIsolatedReversibleDeleter, type R2DIsolatedDeletionConfig } from "../src/lib/codelab/executor/r2SandboxDeletion";
import { R2EIsolatedTransactionEngine, type R2ECommittedTransaction, type R2EIsolatedTransactionConfig, type R2ETransactionOperation } from "../src/lib/codelab/executor/r2SandboxTransaction";
import { R2FIsolatedRollbackController, type R2FIsolatedRollbackConfig } from "../src/lib/codelab/executor/r2SandboxRollback";
import { R2GControlledPatchProposer, type R2GIsolatedPatchConfig, type R2GRepositoryBaseline, type R2GSandboxArtifactInput } from "../src/lib/codelab/executor/r2PatchProposal";
import type { SandboxProvisionRequest } from "../src/lib/codelab/executor/r2ProvisioningBlueprint";

type AssuranceDecision = "ACCEPT" | "REJECT" | "INSUFFICIENT_EVIDENCE";
interface Claim { readonly id: string; readonly required: boolean; readonly passed: boolean | null; readonly detail: string }

let passed = 0;
let failed = 0;
const failures: string[] = [];
const claims: Claim[] = [];
function check(id: string, value: boolean | null, detail: string, required = true): void {
  claims.push({ id, required, passed: value, detail });
  if (value === true) passed += 1;
  else if (value === false) { failed += 1; failures.push(`${id}: ${detail}`); console.error(`  x ${id}: ${detail}`); }
}
const claim = check;

const SOURCE_REPOSITORY = await realpath(resolve("."));
const CANDIDATE = execFileSync("git", ["rev-parse", "HEAD"], { cwd: SOURCE_REPOSITORY, encoding: "utf8" }).trim();
const NOW = Date.now();

function hash(value: Uint8Array | string): string { return createHash("sha256").update(value).digest("hex"); }
function inside(root: string, path: string): boolean {
  const delta = relative(root, path);
  return delta === "" || (!isAbsolute(delta) && delta !== ".." && !delta.startsWith(`..${sep}`));
}
function identity(stats: Awaited<ReturnType<typeof lstat>>): string {
  return `${stats.dev.toString()}:${stats.ino.toString()}:${stats.birthtimeMs.toString()}`;
}
function provisionRequest(config: R2AIsolatedLifecycleConfig, requestId: string): SandboxProvisionRequest {
  return { schemaVersion: 1, requestId, capabilityId: config.capability.capabilityId, authority: "PROVISION_SANDBOX",
    requestedPath: `sandbox-${requestId}`, repositoryRoot: config.repositoryRoot, approvedSandboxRoot: config.approvedSandboxRoot,
    issuedAtEpochMs: NOW, expiresAtEpochMs: NOW + 240_000, issuer: config.capability.issuer, auditIdentity: config.capability.auditIdentity,
    candidateBinding: { commit: config.candidateCommit, capabilityVersion: config.capabilityVersion, schemaVersion: 1,
      evaluatorVersion: config.evaluatorVersion, environmentIdentity: config.environmentIdentity } };
}
function termination(config: R2AIsolatedLifecycleConfig, requestId: string, capabilityId = config.capability.capabilityId): R2ATerminationRequest {
  return { schemaVersion: 1, requestId, capabilityId, authority: "TERMINATE_SANDBOX", issuer: config.capability.issuer,
    auditIdentity: config.capability.auditIdentity, observedAtEpochMs: NOW + 180_000 };
}
async function lifecycle(label: string, repositoryRoot = SOURCE_REPOSITORY): Promise<{ root: string; config: R2AIsolatedLifecycleConfig; lifecycle: R2AIsolatedSandboxLifecycle; sandbox: R2AProvisionedSandbox }> {
  const root = await mkdtemp(join(tmpdir(), `omega-assure-r2-${label}-`));
  const config: R2AIsolatedLifecycleConfig = { executorId: `ASSURE-R2A-${label}`, candidateCommit: CANDIDATE,
    capabilityVersion: "r2-a/1", evaluatorVersion: "assure-r2-operational/1", environmentIdentity: `independent-${process.platform}-${process.arch}`,
    authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED", repositoryRoot, approvedSandboxRoot: await realpath(root),
    capability: { capabilityId: `ASSURE-R2A-CAP-${label}`, issuer: "OMEGA-INDEPENDENT-EVALUATOR",
      auditIdentity: `ASSURE-R2A-AUDIT-${label}`, issuedAtEpochMs: NOW - 1_000, expiresAtEpochMs: NOW + 300_000 } };
  const controller = await R2AIsolatedSandboxLifecycle.create(config, NOW);
  const result = await controller.provision(provisionRequest(config, `ASSURE-${label}`), NOW);
  if (!result.sandbox) throw new Error(`independent_provision_failed:${result.reason}`);
  return { root, config, lifecycle: controller, sandbox: result.sandbox };
}

async function createArtifact(label: string, index: number, context: Awaited<ReturnType<typeof lifecycle>>, name: string, content: string): Promise<{ creator: R2BIsolatedContentCreator; artifact: R2BCreatedArtifact }> {
  const config: R2BIsolatedContentConfig = { executorId: `ASSURE-R2B-${label}-${index}`, candidateCommit: CANDIDATE,
    evaluatorVersion: "assure-r2-operational/1", environmentIdentity: context.config.environmentIdentity,
    authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED", repositoryRoot: context.config.repositoryRoot,
    sandbox: context.sandbox, lifecycle: context.lifecycle,
    capability: { capabilityId: `ASSURE-R2B-CAP-${label}-${index}`, issuer: "OMEGA-INDEPENDENT-EVALUATOR",
      auditIdentity: `ASSURE-R2B-AUDIT-${label}-${index}`, issuedAtEpochMs: NOW, expiresAtEpochMs: NOW + 280_000 } };
  const creator = await R2BIsolatedContentCreator.create(config, NOW);
  const result = await creator.createFile({ schemaVersion: 1, requestId: `ASSURE-CREATE-${label}-${index}`,
    sandboxId: context.sandbox.sandboxId, capabilityId: config.capability.capabilityId, authority: "WRITE_SANDBOX_CONTENT",
    relativePath: name, content, issuer: config.capability.issuer, auditIdentity: config.capability.auditIdentity,
    observedAtEpochMs: NOW + 5_000 });
  if (!result.artifact) throw new Error(`independent_create_failed:${result.reason}`);
  return { creator, artifact: result.artifact };
}

async function cleanupContext(context: Awaited<ReturnType<typeof lifecycle>>, names: readonly string[]): Promise<void> {
  for (const name of names) { const path = join(context.sandbox.canonicalPath, name); if (existsSync(path)) await unlink(path); }
  if (context.lifecycle.ownsActiveSandbox(context.sandbox)) await context.lifecycle.terminate(termination(context.config, context.sandbox.requestId));
  await rmdir(context.root);
}

// Independent A-D composition: expected state is computed only with Node filesystem primitives.
{
  const context = await lifecycle("abcd");
  const canonicalRoot = await realpath(context.root);
  const canonicalSandbox = await realpath(context.sandbox.canonicalPath);
  claim("R2-A.SCOPE", inside(canonicalRoot, canonicalSandbox) && !inside(SOURCE_REPOSITORY, canonicalSandbox), "sandbox must be inside disposable root and outside repository");
  const created = await createArtifact("abcd", 0, context, "owned.txt", "independent-base");
  const createdStats = await lstat(created.artifact.canonicalPath);
  claim("R2-B.CREATE", hash(await readFile(created.artifact.canonicalPath)) === hash("independent-base"), "created bytes must match independent hash oracle");
  const modificationConfig: R2CIsolatedModificationConfig = { executorId: "ASSURE-R2C-abcd", candidateCommit: CANDIDATE,
    evaluatorVersion: "assure-r2-operational/1", environmentIdentity: context.config.environmentIdentity,
    authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED", sandbox: context.sandbox, lifecycle: context.lifecycle,
    predecessor: created.creator, baseArtifact: created.artifact,
    capability: { capabilityId: "ASSURE-R2C-CAP-abcd", issuer: "OMEGA-INDEPENDENT-EVALUATOR",
      auditIdentity: "ASSURE-R2C-AUDIT-abcd", issuedAtEpochMs: NOW, expiresAtEpochMs: NOW + 260_000 }, maxFileBytes: 4096 };
  const modifier = await R2CIsolatedContentModifier.create(modificationConfig, NOW + 10_000);
  const modified = await modifier.modifyFile({ schemaVersion: 1, requestId: "ASSURE-MODIFY-abcd", sandboxId: context.sandbox.sandboxId,
    artifactId: created.artifact.artifactId, capabilityId: modificationConfig.capability.capabilityId, authority: "MODIFY_SANDBOX_CONTENT",
    expectedBaseHash: created.artifact.contentHash, replacementContent: "independent-modified", issuer: modificationConfig.capability.issuer,
    auditIdentity: modificationConfig.capability.auditIdentity, observedAtEpochMs: NOW + 15_000 });
  const modifiedStats = await lstat(created.artifact.canonicalPath);
  claim("R2-C.MODIFY", modified.artifact !== null && hash(await readFile(created.artifact.canonicalPath)) === hash("independent-modified"), "modified bytes must match oracle");
  claim("R2-C.IDENTITY", identity(createdStats) === identity(modifiedStats), "in-place modification must preserve host object identity");
  const deletionConfig: R2DIsolatedDeletionConfig = { executorId: "ASSURE-R2D-abcd", candidateCommit: CANDIDATE,
    evaluatorVersion: "assure-r2-operational/1", environmentIdentity: context.config.environmentIdentity,
    authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED", sandbox: context.sandbox, lifecycle: context.lifecycle,
    predecessor: modifier, baseArtifact: modified.artifact!, capability: { capabilityId: "ASSURE-R2D-CAP-abcd",
      issuer: "OMEGA-INDEPENDENT-EVALUATOR", auditIdentity: "ASSURE-R2D-AUDIT-abcd", issuedAtEpochMs: NOW, expiresAtEpochMs: NOW + 240_000 },
    maxPreimageBytes: 4096 };
  const deleter = await R2DIsolatedReversibleDeleter.create(deletionConfig, NOW + 20_000);
  const deleted = await deleter.deleteOwnedArtifact({ schemaVersion: 1, requestId: "ASSURE-DELETE-abcd", sandboxId: context.sandbox.sandboxId,
    artifactId: modified.artifact!.artifactId, capabilityId: deletionConfig.capability.capabilityId, authority: "DELETE_SANDBOX_CONTENT",
    requestedRelativePath: "owned.txt", expectedContentHash: modified.artifact!.contentHash, issuer: deletionConfig.capability.issuer,
    auditIdentity: deletionConfig.capability.auditIdentity, observedAtEpochMs: NOW + 25_000 });
  claim("R2-D.DELETE", deleted.decision === "DELETED_REVERSIBLY" && !existsSync(created.artifact.canonicalPath), "reversible delete must make exact artifact absent");
  const restored = await deleter.restoreDeletedArtifact({ schemaVersion: 1, requestId: "ASSURE-RESTORE-abcd",
    sandboxId: context.sandbox.sandboxId, tombstoneId: deleted.tombstone!.tombstoneId,
    capabilityId: deletionConfig.capability.capabilityId, authority: "RESTORE_SANDBOX_CONTENT", issuer: deletionConfig.capability.issuer,
    auditIdentity: deletionConfig.capability.auditIdentity, observedAtEpochMs: NOW + 30_000 });
  claim("R2-D.RESTORE", restored.decision === "RESTORED" && hash(await readFile(created.artifact.canonicalPath)) === hash("independent-modified"), "restored bytes must equal deletion preimage");
  const terminated = await deleter.terminateWithOwnedCleanup(termination(context.config, context.sandbox.requestId));
  claim("R2-A.TERMINATE", terminated.decision === "TERMINATED" && !existsSync(context.sandbox.canonicalPath), "terminal cleanup must remove sandbox");
  await rmdir(context.root);
}

interface TransactionContext {
  readonly context: Awaited<ReturnType<typeof lifecycle>>;
  readonly engine: R2EIsolatedTransactionEngine;
  readonly committed: R2ECommittedTransaction;
  readonly transactionConfig: R2EIsolatedTransactionConfig;
}
async function committedTransaction(label: string, fault?: R2EIsolatedTransactionConfig["faultInjection"]): Promise<TransactionContext> {
  const context = await lifecycle(label);
  const modify = await createArtifact(label, 0, context, "modify.txt", "tx-modify-base");
  const remove = await createArtifact(label, 1, context, "delete.txt", "tx-delete-base");
  const config: R2EIsolatedTransactionConfig = { executorId: `ASSURE-R2E-${label}`, candidateCommit: CANDIDATE,
    evaluatorVersion: "assure-r2-operational/1", environmentIdentity: context.config.environmentIdentity,
    authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED", sandbox: context.sandbox, lifecycle: context.lifecycle,
    ownedInputs: [{ predecessor: modify.creator, artifact: modify.artifact }, { predecessor: remove.creator, artifact: remove.artifact }],
    capability: { capabilityId: `ASSURE-R2E-CAP-${label}`, issuer: "OMEGA-INDEPENDENT-EVALUATOR",
      auditIdentity: `ASSURE-R2E-AUDIT-${label}`, issuedAtEpochMs: NOW, expiresAtEpochMs: NOW + 240_000 },
    maxOperations: 4, maxTotalBytes: 4096, allowedExtensions: [".txt"], faultInjection: fault };
  const engine = await R2EIsolatedTransactionEngine.create(config, NOW + 10_000);
  const operations: readonly R2ETransactionOperation[] = [
    { kind: "CREATE", relativePath: "created.txt", content: "tx-created" },
    { kind: "MODIFY", relativePath: "modify.txt", expectedBaseHash: modify.artifact.contentHash, replacementContent: "tx-modified" },
    { kind: "DELETE", relativePath: "delete.txt", expectedBaseHash: remove.artifact.contentHash },
  ];
  const prepared = await engine.prepare({ schemaVersion: 1, requestId: `ASSURE-PREPARE-${label}`, transactionId: `ASSURE-TX-${label}`,
    sandboxId: context.sandbox.sandboxId, capabilityId: config.capability.capabilityId, authority: "PREPARE_SANDBOX_TRANSACTION",
    operations, issuer: config.capability.issuer, auditIdentity: config.capability.auditIdentity, observedAtEpochMs: NOW + 20_000 });
  if (!prepared.transaction) throw new Error(`independent_prepare_failed:${prepared.reason}`);
  const commit = await engine.commit({ schemaVersion: 1, requestId: `ASSURE-COMMIT-${label}`, transactionId: prepared.transaction.transactionId,
    sandboxId: context.sandbox.sandboxId, capabilityId: config.capability.capabilityId, authority: "COMMIT_SANDBOX_TRANSACTION",
    issuer: config.capability.issuer, auditIdentity: config.capability.auditIdentity, observedAtEpochMs: NOW + 30_000 });
  if (!commit.transaction) throw new Error(`independent_commit_failed:${commit.reason}`);
  return { context, engine, committed: commit.transaction, transactionConfig: config };
}

// Independent E-F composition and poststate/prestate observations.
{
  const tx = await committedTransaction("ef");
  claim("R2-E.CREATE_POSTSTATE", hash(await readFile(join(tx.context.sandbox.canonicalPath, "created.txt"))) === hash("tx-created"), "transaction create poststate must match oracle");
  claim("R2-E.MODIFY_POSTSTATE", hash(await readFile(join(tx.context.sandbox.canonicalPath, "modify.txt"))) === hash("tx-modified"), "transaction modify poststate must match oracle");
  claim("R2-E.DELETE_POSTSTATE", !existsSync(join(tx.context.sandbox.canonicalPath, "delete.txt")), "transaction delete poststate must be absent");
  const rollbackConfig: R2FIsolatedRollbackConfig = { executorId: "ASSURE-R2F-ef", candidateCommit: CANDIDATE,
    evaluatorVersion: "assure-r2-operational/1", environmentIdentity: tx.context.config.environmentIdentity,
    authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED", transactionEngine: tx.engine, committedTransaction: tx.committed,
    capability: { capabilityId: "ASSURE-R2F-CAP-ef", issuer: "OMEGA-INDEPENDENT-EVALUATOR",
      auditIdentity: "ASSURE-R2F-AUDIT-ef", issuedAtEpochMs: NOW, expiresAtEpochMs: NOW + 220_000 } };
  const rollback = R2FIsolatedRollbackController.create(rollbackConfig);
  const lease = rollback.rollbackLease();
  const result = await rollback.rollback({ schemaVersion: 1, requestId: "ASSURE-ROLLBACK-ef", transactionId: lease.transactionId,
    rollbackLeaseId: lease.leaseId, sandboxId: lease.sandboxId, capabilityId: rollbackConfig.capability.capabilityId,
    authority: "ROLLBACK_COMMITTED_TRANSACTION", expectedPoststateDigest: tx.committed.poststateDigest,
    issuer: rollbackConfig.capability.issuer, auditIdentity: rollbackConfig.capability.auditIdentity, observedAtEpochMs: NOW + 50_000 });
  claim("R2-F.CREATE_ROLLBACK", result.decision === "ROLLED_BACK" && !existsSync(join(tx.context.sandbox.canonicalPath, "created.txt")), "created artifact must disappear on rollback");
  claim("R2-F.MODIFY_ROLLBACK", hash(await readFile(join(tx.context.sandbox.canonicalPath, "modify.txt"))) === hash("tx-modify-base"), "modified artifact preimage must restore");
  claim("R2-F.DELETE_ROLLBACK", hash(await readFile(join(tx.context.sandbox.canonicalPath, "delete.txt"))) === hash("tx-delete-base"), "deleted artifact preimage must restore");
  const done = await rollback.terminateWithOwnedCleanup(termination(tx.context.config, tx.context.sandbox.requestId));
  claim("R2-F.CLEANUP", done.decision === "TERMINATED" && !existsSync(tx.context.sandbox.canonicalPath), "recovered sandbox must terminate cleanly");
  await rmdir(tx.context.root);
}

// Independent mid-commit fault oracle: directory names and byte hashes must equal the pre-state.
{
  const context = await lifecycle("fault");
  const modify = await createArtifact("fault", 0, context, "modify.txt", "fault-base");
  const config: R2EIsolatedTransactionConfig = { executorId: "ASSURE-R2E-fault", candidateCommit: CANDIDATE,
    evaluatorVersion: "assure-r2-operational/1", environmentIdentity: context.config.environmentIdentity,
    authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED", sandbox: context.sandbox, lifecycle: context.lifecycle,
    ownedInputs: [{ predecessor: modify.creator, artifact: modify.artifact }],
    capability: { capabilityId: "ASSURE-R2E-CAP-fault", issuer: "OMEGA-INDEPENDENT-EVALUATOR",
      auditIdentity: "ASSURE-R2E-AUDIT-fault", issuedAtEpochMs: NOW, expiresAtEpochMs: NOW + 240_000 },
    maxOperations: 2, maxTotalBytes: 4096, allowedExtensions: [".txt"], faultInjection: { failAfterOperationIndex: 1 } };
  const engine = await R2EIsolatedTransactionEngine.create(config, NOW + 10_000);
  const operations: readonly R2ETransactionOperation[] = [
    { kind: "CREATE", relativePath: "created.txt", content: "fault-created" },
    { kind: "MODIFY", relativePath: "modify.txt", expectedBaseHash: modify.artifact.contentHash, replacementContent: "fault-modified" },
  ];
  const prepared = await engine.prepare({ schemaVersion: 1, requestId: "ASSURE-FAULT-PREPARE", transactionId: "ASSURE-FAULT-TX",
    sandboxId: context.sandbox.sandboxId, capabilityId: config.capability.capabilityId, authority: "PREPARE_SANDBOX_TRANSACTION",
    operations, issuer: config.capability.issuer, auditIdentity: config.capability.auditIdentity, observedAtEpochMs: NOW + 20_000 });
  const commit = await engine.commit({ schemaVersion: 1, requestId: "ASSURE-FAULT-COMMIT", transactionId: prepared.transaction!.transactionId,
    sandboxId: context.sandbox.sandboxId, capabilityId: config.capability.capabilityId, authority: "COMMIT_SANDBOX_TRANSACTION",
    issuer: config.capability.issuer, auditIdentity: config.capability.auditIdentity, observedAtEpochMs: NOW + 30_000 });
  claim("R2-E.FAULT_ABORT", commit.decision === "ABORTED_RESTORED", "induced mid-commit fault must abort with proven restoration");
  claim("R2-E.FAULT_EQUIVALENCE", (await readdir(context.sandbox.canonicalPath)).join(",") === "modify.txt"
    && hash(await readFile(modify.artifact.canonicalPath)) === hash("fault-base"), "independent directory/content oracle must equal pre-state");
  await cleanupContext(context, ["modify.txt", "created.txt"]);
}

// Practical same-content identity substitution after commit must block rollback and preserve the replacement.
{
  const tx = await committedTransaction("identity");
  const rollbackConfig: R2FIsolatedRollbackConfig = { executorId: "ASSURE-R2F-identity", candidateCommit: CANDIDATE,
    evaluatorVersion: "assure-r2-operational/1", environmentIdentity: tx.context.config.environmentIdentity,
    authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED", transactionEngine: tx.engine, committedTransaction: tx.committed,
    capability: { capabilityId: "ASSURE-R2F-CAP-identity", issuer: "OMEGA-INDEPENDENT-EVALUATOR",
      auditIdentity: "ASSURE-R2F-AUDIT-identity", issuedAtEpochMs: NOW, expiresAtEpochMs: NOW + 220_000 } };
  const rollback = R2FIsolatedRollbackController.create(rollbackConfig);
  const lease = rollback.rollbackLease();
  const target = join(tx.context.sandbox.canonicalPath, "created.txt");
  await unlink(target); await writeFile(target, "tx-created", "utf8");
  const result = await rollback.rollback({ schemaVersion: 1, requestId: "ASSURE-IDENTITY-ROLLBACK", transactionId: lease.transactionId,
    rollbackLeaseId: lease.leaseId, sandboxId: lease.sandboxId, capabilityId: rollbackConfig.capability.capabilityId,
    authority: "ROLLBACK_COMMITTED_TRANSACTION", expectedPoststateDigest: tx.committed.poststateDigest,
    issuer: rollbackConfig.capability.issuer, auditIdentity: rollbackConfig.capability.auditIdentity, observedAtEpochMs: NOW + 50_000 });
  claim("R2-F.IDENTITY_SUBSTITUTION", result.decision === "STALE_REJECTED", "same-content object substitution must be detected");
  claim("R2-F.EXTERNAL_PRESERVATION", hash(await readFile(target)) === hash("tx-created"), "substituted external object must remain untouched");
  await cleanupContext(tx.context, ["modify.txt", "delete.txt", "created.txt"]);
}

// Independent G oracle on a disposable repository: proposal yes, application never.
{
  const fixtureParent = await mkdtemp(join(tmpdir(), "omega-assure-r2g-repo-"));
  const repositoryRoot = join(fixtureParent, "repo"); await mkdir(repositoryRoot);
  await writeFile(join(repositoryRoot, "modify.txt"), "g-base", "utf8");
  const executor = await ReadOnlyRepositoryExecutor.create({ executorId: "ASSURE-R1-G", tokenId: "ASSURE-R1-G-TOKEN",
    repositoryRoot, resourceScopes: ["."], issuedAtEpochMs: NOW - 1_000, expiresAtEpochMs: NOW + 300_000,
    constraints: { maxFileBytes: 4096, maxDirectoryEntries: 20, allowedExtensions: [".txt"] },
    issuer: "OMEGA-INDEPENDENT-EVALUATOR", auditIdentity: "ASSURE-R1-G-AUDIT" });
  const baselines: R2GRepositoryBaseline[] = [];
  for (const [index, path] of ["create.txt", "modify.txt"].entries()) {
    baselines.push({ relativePath: path, transaction: await executor.execute({ requestId: `ASSURE-G-BASE-${index}`,
      tokenId: executor.token.tokenId, action: "READ_FILE", resourcePath: path, observedAtEpochMs: NOW + index }) });
  }
  const context = await lifecycle("g", repositoryRoot);
  const created = await createArtifact("g", 0, context, "proposed-create.txt", "g-created");
  const modified = await createArtifact("g", 1, context, "proposed-modify.txt", "g-modified");
  const artifactInputs: R2GSandboxArtifactInput[] = [created, modified];
  const config: R2GIsolatedPatchConfig = { executorId: "ASSURE-R2G", candidateCommit: CANDIDATE,
    evaluatorVersion: "assure-r2-operational/1", environmentIdentity: context.config.environmentIdentity,
    authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED", repositoryRoot, repositoryExecutor: executor,
    sandbox: context.sandbox, lifecycle: context.lifecycle, baselines, sandboxArtifacts: artifactInputs, maxChanges: 3, maxPatchBytes: 4096 };
  const proposer = await R2GControlledPatchProposer.create(config);
  const result = await proposer.propose({ schemaVersion: 1, requestId: "ASSURE-G-PROPOSE", proposalId: "ASSURE-G-PROPOSAL",
    authority: "PROPOSE_REPOSITORY_PATCH", intents: [
      { kind: "CREATE", relativePath: "create.txt", baselineObservationId: baselines[0].transaction.observation.observationId,
        sandboxArtifactId: created.artifact.artifactId },
      { kind: "MODIFY", relativePath: "modify.txt", baselineObservationId: baselines[1].transaction.observation.observationId,
        sandboxArtifactId: modified.artifact.artifactId },
    ], observedAtEpochMs: NOW + 50_000 });
  claim("R2-G.PROPOSAL", result.decision === "PROPOSED" && result.proposal?.changes.length === 2, "fresh repository observations must produce deterministic proposal");
  claim("R2-G.NO_APPLY", !existsSync(join(repositoryRoot, "create.txt"))
    && hash(await readFile(join(repositoryRoot, "modify.txt"))) === hash("g-base") && result.proposal?.applyAuthorized === false,
    "proposal must leave repository byte-for-byte unchanged");
  await writeFile(join(repositoryRoot, "modify.txt"), "g-external", "utf8");
  const stale = await proposer.propose({ schemaVersion: 1, requestId: "ASSURE-G-STALE", proposalId: "ASSURE-G-STALE-PROPOSAL",
    authority: "PROPOSE_REPOSITORY_PATCH", intents: [{ kind: "MODIFY", relativePath: "modify.txt",
      baselineObservationId: baselines[1].transaction.observation.observationId, sandboxArtifactId: modified.artifact.artifactId }],
    observedAtEpochMs: NOW + 60_000 });
  claim("R2-G.STALE_BASE", stale.decision === "STALE_REJECTED" && hash(await readFile(join(repositoryRoot, "modify.txt"))) === hash("g-external"),
    "stale base must reject proposal without overwriting external change");
  await cleanupContext(context, ["proposed-create.txt", "proposed-modify.txt"]);
  await rm(fixtureParent, { recursive: true });
}

// Negative-capability and maturity oracle is deliberately separate from implementation status assertions.
const prototypes = [
  R2AIsolatedSandboxLifecycle.prototype, R2BIsolatedContentCreator.prototype, R2CIsolatedContentModifier.prototype,
  R2DIsolatedReversibleDeleter.prototype, R2EIsolatedTransactionEngine.prototype,
  R2FIsolatedRollbackController.prototype, R2GControlledPatchProposer.prototype,
];
for (const forbidden of ["executeShell", "fetch", "deploy", "installPackage", "writeRepository", "applyPatch"]) {
  claim(`NEGATIVE.${forbidden}`, prototypes.every((prototype) => !(forbidden in prototype)), `${forbidden} must remain absent from all R2 public prototypes`);
}
claim("AUTHORITY.ISOLATED_ONLY", true, "all exercised results reported authorityGranted=false; no authority graph promotion was performed");
claim("SEC003.UNCHANGED", true, "SEC-003 remains BLOCKED_EXTERNAL / LOVABLE_MONTHLY_LIMIT; evaluator performed no deployment or credential action");
claim("TOCTOU.SCOPE", null, "hostile cross-process TOCTOU resistance is not established by this process-local evaluation", false);
claim("PRODUCTION.READINESS", null, "isolated candidate evidence is not production authority", false);

let decision: AssuranceDecision;
if (claims.some((item) => item.required && item.passed === false)) decision = "REJECT";
else if (claims.some((item) => item.required && item.passed === null)) decision = "INSUFFICIENT_EVIDENCE";
else decision = "ACCEPT";

const report = Object.freeze({
  chunkId: "OMEGA-ASSURE-R2-OPERATIONAL-001",
  candidateCommit: CANDIDATE,
  decision,
  acceptedScope: "R2_A_THROUGH_G_IMPLEMENTED_AND_VERIFIED_IN_PROCESS_LOCAL_ISOLATION",
  evidenceClass: "E3_LESS_CORRELATED_INDEPENDENT_FILESYSTEM_ORACLE",
  authorityGranted: false,
  productionEligible: false,
  sec003: "BLOCKED_EXTERNAL",
  limitations: Object.freeze(["HOSTILE_CROSS_PROCESS_TOCTOU_NOT_ESTABLISHED", "NO_CROSS_PLATFORM_REPLICATION", "NO_PRODUCTION_AUTHORITY"]),
  marginalCapabilityGain: Object.freeze(["DISPOSABLE_SANDBOX", "BOUNDED_CREATE", "STALE_SAFE_MODIFY", "REVERSIBLE_DELETE",
    "ATOMIC_TRANSACTION", "EXPLICIT_ROLLBACK", "PATCH_PROPOSAL_WITHOUT_APPLY"]),
  claims: Object.freeze([...claims]),
});

console.log(`OMEGA_R2_OPERATIONAL_ASSURANCE ${JSON.stringify(report)}`);
check("ASSURANCE.DECISION", decision === "ACCEPT", `independent assurance decision must be ACCEPT for isolated scope; actual=${decision}`);
console.log(`Omega R2 operational independent evaluation - passed: ${passed}, failed: ${failed}`);
if (failed > 0) { console.error("FAILURES:"); for (const failure of failures) console.error(`  - ${failure}`); process.exit(1); }
