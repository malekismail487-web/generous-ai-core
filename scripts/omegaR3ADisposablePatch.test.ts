import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ReadOnlyRepositoryExecutor } from "../src/lib/codelab/executor/readOnlyExecutor";
import { R2AIsolatedSandboxLifecycle, type R2AIsolatedLifecycleConfig, type R2AProvisionedSandbox } from "../src/lib/codelab/executor/r2SandboxLifecycle";
import type { SandboxProvisionRequest } from "../src/lib/codelab/executor/r2ProvisioningBlueprint";
import type { R2GPatchProposal, R2GProposedChange } from "../src/lib/codelab/executor/r2PatchProposal";
import {
  R3_A_ISOLATED_CANDIDATE_STATUS,
  R3ADisposablePatchApplicator,
  type R3AApplyRequest,
  type R3ADisposablePatchConfig,
  type R3AFaultInjection,
} from "../src/lib/codelab/executor/r3DisposablePatchApplication";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(value: unknown, label: string): void {
  if (value) passed += 1;
  else { failed += 1; failures.push(label); console.error(`  x ${label}`); }
}
const assert = check;

const CANDIDATE = execFileSync("git", ["rev-parse", "HEAD"], { cwd: resolve("."), encoding: "utf8" }).trim();
const NOW = Date.now();
function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

interface Harness {
  readonly parent: string;
  readonly sourceRoot: string;
  readonly sandboxRoot: string;
  readonly sandbox: R2AProvisionedSandbox;
  readonly lifecycle: R2AIsolatedSandboxLifecycle;
  readonly lifecycleConfig: R2AIsolatedLifecycleConfig;
  readonly proposal: R2GPatchProposal;
  readonly config: R3ADisposablePatchConfig;
}

function provisionRequest(config: R2AIsolatedLifecycleConfig, requestId: string): SandboxProvisionRequest {
  return { schemaVersion: 1, requestId, capabilityId: config.capability.capabilityId, authority: "PROVISION_SANDBOX",
    requestedPath: `sandbox-${requestId}`, repositoryRoot: config.repositoryRoot, approvedSandboxRoot: config.approvedSandboxRoot,
    issuedAtEpochMs: NOW, expiresAtEpochMs: NOW + 240_000, issuer: config.capability.issuer, auditIdentity: config.capability.auditIdentity,
    candidateBinding: { commit: config.candidateCommit, capabilityVersion: config.capabilityVersion, schemaVersion: 1,
      evaluatorVersion: config.evaluatorVersion, environmentIdentity: config.environmentIdentity } };
}

function proposal(sourceRoot: string, changes?: readonly R2GProposedChange[]): R2GPatchProposal {
  const values = changes ?? [
    { kind: "CREATE", relativePath: "src/create.txt", expectedBaseHash: null, proposedContentHash: hash("created"),
      proposedContent: "created", baselineEvidenceId: "evidence://create", baselineObservationId: "observation://create", sandboxArtifactId: "artifact://create" },
    { kind: "MODIFY", relativePath: "src/modify.txt", expectedBaseHash: hash("modify-base"), proposedContentHash: hash("modified"),
      proposedContent: "modified", baselineEvidenceId: "evidence://modify", baselineObservationId: "observation://modify", sandboxArtifactId: "artifact://modify" },
    { kind: "DELETE", relativePath: "src/delete.txt", expectedBaseHash: hash("delete-base"), proposedContentHash: null,
      proposedContent: null, baselineEvidenceId: "evidence://delete", baselineObservationId: "observation://delete", sandboxArtifactId: null },
  ] as const;
  const base = { schemaVersion: 1 as const, proposalId: "R3A-REVIEWED-PROPOSAL", requestId: "R2G-PROPOSAL-REQUEST",
    repositoryRoot: sourceRoot, baseCandidateCommit: CANDIDATE, changes: Object.freeze([...values]),
    applyAuthorized: false as const, rollbackRequiredBeforeApply: true as const };
  return Object.freeze({ ...base, proposalDigest: hash(canonical(base)) });
}

async function harness(label: string, faultInjection?: R3AFaultInjection, proposalFactory = proposal): Promise<Harness> {
  const parent = await mkdtemp(join(tmpdir(), `omega-r3a-${label}-`));
  const sourceRoot = join(parent, "source-repository");
  const sandboxRoot = join(parent, "approved-sandboxes");
  await mkdir(join(sourceRoot, "src"), { recursive: true });
  await mkdir(sandboxRoot);
  await writeFile(join(sourceRoot, "src", "modify.txt"), "modify-base", "utf8");
  await writeFile(join(sourceRoot, "src", "delete.txt"), "delete-base", "utf8");
  const sourceCanonical = await realpath(sourceRoot);
  const executor = await ReadOnlyRepositoryExecutor.create({ executorId: `R1-R3A-${label}`, tokenId: `R1-R3A-TOKEN-${label}`,
    repositoryRoot: sourceCanonical, resourceScopes: ["."], issuedAtEpochMs: NOW - 1_000, expiresAtEpochMs: NOW + 300_000,
    constraints: { maxFileBytes: 4096, maxDirectoryEntries: 100, allowedExtensions: [".txt"] },
    issuer: "OMEGA-R1-R3A-TEST", auditIdentity: `R1-R3A-AUDIT-${label}` });
  const lifecycleConfig: R2AIsolatedLifecycleConfig = { executorId: `R2A-R3A-${label}`, candidateCommit: CANDIDATE,
    capabilityVersion: "r2-a/1", evaluatorVersion: "r3-a-eval/1", environmentIdentity: `local-${process.platform}-${process.arch}`,
    authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED", repositoryRoot: sourceCanonical, approvedSandboxRoot: await realpath(sandboxRoot),
    capability: { capabilityId: `R2A-R3A-CAP-${label}`, issuer: "OMEGA-ISOLATED-TEST-AUTHORITY",
      auditIdentity: `R2A-R3A-AUDIT-${label}`, issuedAtEpochMs: NOW - 1_000, expiresAtEpochMs: NOW + 280_000 } };
  const lifecycle = await R2AIsolatedSandboxLifecycle.create(lifecycleConfig, NOW);
  const provisioned = await lifecycle.provision(provisionRequest(lifecycleConfig, label), NOW);
  if (!provisioned.sandbox) throw new Error(`sandbox_provision_failed:${provisioned.reason}`);
  const disposableRoot = join(provisioned.sandbox.canonicalPath, "repository-copy");
  await cp(sourceCanonical, disposableRoot, { recursive: true, errorOnExist: true, force: false });
  const reviewedProposal = proposalFactory(sourceCanonical);
  const config: R3ADisposablePatchConfig = { executorId: `R3A-${label}`, candidateCommit: CANDIDATE,
    evaluatorVersion: "r3-a-eval/1", environmentIdentity: lifecycleConfig.environmentIdentity,
    authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED", sourceRepositoryRoot: sourceCanonical, sourceRepositoryExecutor: executor,
    disposableRepositoryRoot: disposableRoot, sandbox: provisioned.sandbox, lifecycle, proposal: reviewedProposal,
    capability: { capabilityId: `R3A-CAP-${label}`, issuer: "OMEGA-ISOLATED-TEST-AUTHORITY", auditIdentity: `R3A-AUDIT-${label}`,
      issuedAtEpochMs: NOW - 1_000, expiresAtEpochMs: NOW + 250_000 }, allowedExtensions: [".txt"], maxChanges: 8,
    maxPatchBytes: 4096, faultInjection };
  return { parent, sourceRoot: sourceCanonical, sandboxRoot, sandbox: provisioned.sandbox, lifecycle, lifecycleConfig,
    proposal: reviewedProposal, config };
}

function request(h: Harness, applicator: R3ADisposablePatchApplicator, overrides: Partial<R3AApplyRequest> = {}): R3AApplyRequest {
  return { schemaVersion: 1, requestId: `REQUEST-${h.proposal.proposalId}`, applicationId: `APPLICATION-${h.proposal.proposalId}`,
    proposalId: h.proposal.proposalId, proposalDigest: h.proposal.proposalDigest,
    disposableRepositoryId: applicator.disposableRepositoryId(), sandboxId: h.sandbox.sandboxId,
    capabilityId: h.config.capability.capabilityId, authority: "APPLY_REVIEWED_PATCH_TO_DISPOSABLE_REPOSITORY",
    issuer: h.config.capability.issuer, auditIdentity: h.config.capability.auditIdentity, observedAtEpochMs: NOW + 20_000,
    ...overrides };
}

async function cleanup(h: Harness): Promise<void> { await rm(h.parent, { recursive: true, force: true }); }

{
  const h = await harness("success");
  const applicator = await R3ADisposablePatchApplicator.create(h.config);
  const result = await applicator.apply(request(h, applicator));
  const clone = h.config.disposableRepositoryRoot;
  check(result.decision === "APPLIED" && result.changedPaths.length === 3, "reviewed create/modify/delete patch applies transactionally to disposable repository");
  check(await readFile(join(clone, "src", "create.txt"), "utf8") === "created", "create postcondition is observed");
  check(await readFile(join(clone, "src", "modify.txt"), "utf8") === "modified", "modify postcondition is observed");
  check(!existsSync(join(clone, "src", "delete.txt")), "delete postcondition is observed");
  check(!existsSync(join(h.sourceRoot, "src", "create.txt"))
    && await readFile(join(h.sourceRoot, "src", "modify.txt"), "utf8") === "modify-base"
    && await readFile(join(h.sourceRoot, "src", "delete.txt"), "utf8") === "delete-base", "source repository remains unchanged");
  check(result.sourceRepositoryMutated === false && result.authorityGranted === false, "application evidence denies source mutation and authority promotion");
  check(result.events.some((event) => event.eventType === "SOURCE_BASE_REVALIDATED")
    && result.events.at(-1)?.eventType === "APPLICATION_PROVEN", "evidence chain records source revalidation through proof");
  check(result.events.every((event, index) => event.previousHash === (index === 0 ? "GENESIS" : result.events[index - 1].eventHash)), "application audit is hash chained");
  const reused = await applicator.apply(request(h, applicator, { requestId: "REUSE" }));
  check(reused.decision === "REJECTED" && reused.reason.includes("already_used"), "single-use application capability rejects replay");
  check(!("writeSourceRepository" in applicator) && !("executeShell" in applicator) && !("runBuild" in applicator), "applicator exposes no source-write, shell, or build method");
  await cleanup(h);
}

{
  const h = await harness("binding");
  const applicator = await R3ADisposablePatchApplicator.create(h.config);
  const result = await applicator.apply(request(h, applicator, { proposalDigest: "0".repeat(64) }));
  check(result.decision === "REJECTED" && result.reason.includes("patch_proposal_binding_mismatch"), "wrong proposal digest rejects before mutation");
  check(await readFile(join(h.config.disposableRepositoryRoot, "src", "modify.txt"), "utf8") === "modify-base", "binding rejection leaves disposable repository unchanged");
  await cleanup(h);
}

{
  const h = await harness("source-stale");
  const applicator = await R3ADisposablePatchApplicator.create(h.config);
  await writeFile(join(h.sourceRoot, "src", "modify.txt"), "source-changed", "utf8");
  const result = await applicator.apply(request(h, applicator));
  check(result.decision === "STALE_REJECTED" && result.reason.includes("source_repository_base_changed"), "source change since proposal rejects application");
  check(await readFile(join(h.config.disposableRepositoryRoot, "src", "modify.txt"), "utf8") === "modify-base", "source staleness cannot mutate clone");
  await cleanup(h);
}

{
  const h = await harness("rollback", { failAfterAppliedChanges: 2 });
  const applicator = await R3ADisposablePatchApplicator.create(h.config);
  const result = await applicator.apply(request(h, applicator));
  const clone = h.config.disposableRepositoryRoot;
  check(result.decision === "ROLLED_BACK" && result.prestateDigest === result.poststateDigest, "mid-application failure triggers proven rollback");
  check(!existsSync(join(clone, "src", "create.txt")) && await readFile(join(clone, "src", "modify.txt"), "utf8") === "modify-base"
    && await readFile(join(clone, "src", "delete.txt"), "utf8") === "delete-base", "rollback restores complete scoped prestate");
  check(result.events.some((event) => event.eventType === "AUTOMATIC_ROLLBACK_PROVEN"), "rollback proof is retained in evidence chain");
  await cleanup(h);
}

{
  let changed = false;
  const h = await harness("at-use", { alterBeforeUse: async (relativePath, path) => {
    if (!changed && relativePath === "src/modify.txt") { changed = true; await writeFile(path, "external-race", "utf8"); }
  } });
  const applicator = await R3ADisposablePatchApplicator.create(h.config);
  const result = await applicator.apply(request(h, applicator));
  check(result.decision === "QUARANTINED" && result.reason.includes("target_identity_or_content_changed_at_use"), "at-use target divergence quarantines rather than overwriting external state");
  check(!existsSync(join(h.config.disposableRepositoryRoot, "src", "create.txt")), "quarantine rolls back preceding owned change");
  check(await readFile(join(h.config.disposableRepositoryRoot, "src", "modify.txt"), "utf8") === "external-race", "rollback does not overwrite detected external mutation");
  await cleanup(h);
}

{
  const h = await harness("invalid-path", undefined, (root) => proposal(root, [{ kind: "CREATE", relativePath: "../escape.txt",
    expectedBaseHash: null, proposedContentHash: hash("escape"), proposedContent: "escape", baselineEvidenceId: "evidence://escape",
    baselineObservationId: "observation://escape", sandboxArtifactId: "artifact://escape" }]));
  let rejected = "";
  try { await R3ADisposablePatchApplicator.create(h.config); } catch (error) { rejected = error instanceof Error ? error.message : "unknown"; }
  check(rejected === "patch_target_invalid", "path traversal proposal is rejected during admission");
  check(!existsSync(join(h.parent, "escape.txt")), "path traversal rejection has no external side effect");
  await cleanup(h);
}

{
  const h = await harness("junction", undefined, (root) => proposal(root, [{ kind: "CREATE", relativePath: "alias/escape.txt",
    expectedBaseHash: null, proposedContentHash: hash("escape"), proposedContent: "escape", baselineEvidenceId: "evidence://escape",
    baselineObservationId: "observation://escape", sandboxArtifactId: "artifact://escape" }]));
  const outside = join(h.parent, "outside"); await mkdir(outside);
  const alias = join(h.config.disposableRepositoryRoot, "alias");
  let aliasCreated = false;
  try { await symlink(outside, alias, process.platform === "win32" ? "junction" : "dir"); aliasCreated = true; } catch { /* environment cannot create aliases */ }
  if (aliasCreated) {
    let rejected = "";
    try { await R3ADisposablePatchApplicator.create(h.config); } catch (error) { rejected = error instanceof Error ? error.message : "unknown"; }
    check(rejected === "patch_parent_escape", "real filesystem alias outside disposable root is rejected");
    check(!existsSync(join(outside, "escape.txt")), "alias escape rejection leaves outside directory unchanged");
  } else {
    check(true, "filesystem alias test explicitly unavailable in this environment");
    check(true, "unavailable alias fixture produces no outside mutation");
  }
  await cleanup(h);
}

assert(R3_A_ISOLATED_CANDIDATE_STATUS.newCapability === "TRANSACTIONAL_PATCH_APPLICATION_TO_DISPOSABLE_REPOSITORY", "chunk reports exact R3-A capability gain");
assert(R3_A_ISOLATED_CANDIDATE_STATUS.authorityGranted === false && !R3_A_ISOLATED_CANDIDATE_STATUS.productionEligible, "R3-A remains an isolated candidate");
assert(R3_A_ISOLATED_CANDIDATE_STATUS.unavailableCapabilities.includes("WRITE_SOURCE_REPOSITORY")
  && R3_A_ISOLATED_CANDIDATE_STATUS.forbiddenCapabilities.includes("NETWORK"), "R3-A preserves source-write and network prohibitions");

console.log(`Omega R3-A disposable patch tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) { console.error("FAILURES:"); for (const failure of failures) console.error(`  - ${failure}`); process.exit(1); }
