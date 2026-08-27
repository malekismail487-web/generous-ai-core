import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, realpath, rmdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ReadOnlyRepositoryExecutor } from "../src/lib/codelab/executor/readOnlyExecutor";
import { R2AIsolatedSandboxLifecycle, type R2AIsolatedLifecycleConfig, type R2AProvisionedSandbox, type R2ATerminationRequest } from "../src/lib/codelab/executor/r2SandboxLifecycle";
import { R2BIsolatedContentCreator, type R2BIsolatedContentConfig } from "../src/lib/codelab/executor/r2SandboxContent";
import {
  R2_G_ISOLATED_CANDIDATE_STATUS,
  R2GControlledPatchProposer,
  type R2GIsolatedPatchConfig,
  type R2GPatchIntent,
  type R2GProposeRequest,
  type R2GRepositoryBaseline,
  type R2GSandboxArtifactInput,
} from "../src/lib/codelab/executor/r2PatchProposal";
import type { SandboxProvisionRequest } from "../src/lib/codelab/executor/r2ProvisioningBlueprint";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function assert(value: unknown, label: string): void {
  if (value) passed += 1;
  else { failed += 1; failures.push(label); console.error(`  x ${label}`); }
}

const SOURCE_REPOSITORY = await realpath(resolve("."));
const CANDIDATE = execFileSync("git", ["rev-parse", "HEAD"], { cwd: SOURCE_REPOSITORY, encoding: "utf8" }).trim();
const NOW = Date.now();

interface Harness {
  readonly fixtureParent: string;
  readonly repositoryRoot: string;
  readonly sandboxParent: string;
  readonly lifecycleConfig: R2AIsolatedLifecycleConfig;
  readonly lifecycle: R2AIsolatedSandboxLifecycle;
  readonly sandbox: R2AProvisionedSandbox;
  readonly creators: readonly R2BIsolatedContentCreator[];
  readonly config: R2GIsolatedPatchConfig;
  readonly baselines: ReadonlyMap<string, R2GRepositoryBaseline>;
  readonly artifacts: readonly R2GSandboxArtifactInput[];
}

function provisionRequest(config: R2AIsolatedLifecycleConfig, requestId: string): SandboxProvisionRequest {
  return { schemaVersion: 1, requestId, capabilityId: config.capability.capabilityId, authority: "PROVISION_SANDBOX",
    requestedPath: `sandbox-${requestId}`, repositoryRoot: config.repositoryRoot, approvedSandboxRoot: config.approvedSandboxRoot,
    issuedAtEpochMs: NOW, expiresAtEpochMs: NOW + 180_000, issuer: config.capability.issuer, auditIdentity: config.capability.auditIdentity,
    candidateBinding: { commit: config.candidateCommit, capabilityVersion: config.capabilityVersion, schemaVersion: 1,
      evaluatorVersion: config.evaluatorVersion, environmentIdentity: config.environmentIdentity } };
}

function termination(config: R2AIsolatedLifecycleConfig, requestId: string): R2ATerminationRequest {
  return { schemaVersion: 1, requestId, capabilityId: config.capability.capabilityId, authority: "TERMINATE_SANDBOX",
    issuer: config.capability.issuer, auditIdentity: config.capability.auditIdentity, observedAtEpochMs: NOW + 100_000 };
}

async function harness(label: string, maxPatchBytes = 1024): Promise<Harness> {
  const fixtureParent = await mkdtemp(join(tmpdir(), `omega-r2g-repo-${label}-`));
  const repositoryRoot = join(fixtureParent, "fixture-repository"); await mkdir(repositoryRoot);
  await writeFile(join(repositoryRoot, "modify.txt"), "repository-modify-base", "utf8");
  await writeFile(join(repositoryRoot, "delete.txt"), "repository-delete-base", "utf8");
  const executor = await ReadOnlyRepositoryExecutor.create({ executorId: `R1-${label}`, tokenId: `R1-TOKEN-${label}`,
    repositoryRoot, resourceScopes: ["."], issuedAtEpochMs: NOW - 1_000, expiresAtEpochMs: NOW + 240_000,
    constraints: { maxFileBytes: 4096, maxDirectoryEntries: 100, allowedExtensions: [".txt"] },
    issuer: "OMEGA-R1-TEST-AUTHORITY", auditIdentity: `R1-AUDIT-${label}` });
  const baselines = new Map<string, R2GRepositoryBaseline>();
  for (const [index, relativePath] of ["create.txt", "modify.txt", "delete.txt"].entries()) {
    const transaction = await executor.execute({ requestId: `BASE-${label}-${index}`, tokenId: executor.token.tokenId,
      action: "READ_FILE", resourcePath: relativePath, observedAtEpochMs: NOW + index });
    baselines.set(relativePath, { relativePath, transaction });
  }
  const sandboxParent = await mkdtemp(join(tmpdir(), `omega-r2g-sandbox-${label}-`));
  const lifecycleConfig: R2AIsolatedLifecycleConfig = { executorId: `R2A-${label}`, candidateCommit: CANDIDATE,
    capabilityVersion: "r2-a/1", evaluatorVersion: "r2g-eval/1", environmentIdentity: `local-${process.platform}-${process.arch}`,
    authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED", repositoryRoot, approvedSandboxRoot: await realpath(sandboxParent),
    capability: { capabilityId: `R2A-CAP-${label}`, issuer: "OMEGA-ISOLATED-TEST-AUTHORITY", auditIdentity: `R2A-AUDIT-${label}`,
      issuedAtEpochMs: NOW - 1_000, expiresAtEpochMs: NOW + 220_000 } };
  const lifecycle = await R2AIsolatedSandboxLifecycle.create(lifecycleConfig, NOW);
  const provisioned = await lifecycle.provision(provisionRequest(lifecycleConfig, `R2A-${label}`), NOW);
  if (!provisioned.sandbox) throw new Error("sandbox_provision_failed");
  const creators: R2BIsolatedContentCreator[] = [];
  const artifacts: R2GSandboxArtifactInput[] = [];
  for (const [index, name, content] of [[0, "proposal-create.txt", "proposed-created-content"], [1, "proposal-modify.txt", "proposed-modified-content"]] as const) {
    const contentConfig: R2BIsolatedContentConfig = { executorId: `R2B-${label}-${index}`, candidateCommit: CANDIDATE,
      evaluatorVersion: "r2g-eval/1", environmentIdentity: lifecycleConfig.environmentIdentity,
      authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED", repositoryRoot, sandbox: provisioned.sandbox, lifecycle,
      capability: { capabilityId: `R2B-CAP-${label}-${index}`, issuer: "OMEGA-ISOLATED-TEST-AUTHORITY",
        auditIdentity: `R2B-AUDIT-${label}-${index}`, issuedAtEpochMs: NOW, expiresAtEpochMs: NOW + 200_000 } };
    const creator = await R2BIsolatedContentCreator.create(contentConfig, NOW);
    const created = await creator.createFile({ schemaVersion: 1, requestId: `CREATE-${label}-${index}`, sandboxId: provisioned.sandbox.sandboxId,
      capabilityId: contentConfig.capability.capabilityId, authority: "WRITE_SANDBOX_CONTENT", relativePath: name, content,
      issuer: contentConfig.capability.issuer, auditIdentity: contentConfig.capability.auditIdentity, observedAtEpochMs: NOW + 5_000 });
    if (!created.artifact) throw new Error("sandbox_content_create_failed");
    creators.push(creator); artifacts.push({ creator, artifact: created.artifact });
  }
  const config: R2GIsolatedPatchConfig = { executorId: `R2G-${label}`, candidateCommit: CANDIDATE,
    evaluatorVersion: "r2g-eval/1", environmentIdentity: lifecycleConfig.environmentIdentity,
    authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED", repositoryRoot, repositoryExecutor: executor,
    sandbox: provisioned.sandbox, lifecycle, baselines: [...baselines.values()], sandboxArtifacts: artifacts,
    maxChanges: 4, maxPatchBytes };
  return { fixtureParent, repositoryRoot, sandboxParent, lifecycleConfig, lifecycle, sandbox: provisioned.sandbox,
    creators, config, baselines, artifacts };
}

function intents(h: Harness): readonly R2GPatchIntent[] {
  return [
    { kind: "CREATE", relativePath: "create.txt", baselineObservationId: h.baselines.get("create.txt")!.transaction.observation.observationId,
      sandboxArtifactId: h.artifacts[0].artifact.artifactId },
    { kind: "MODIFY", relativePath: "modify.txt", baselineObservationId: h.baselines.get("modify.txt")!.transaction.observation.observationId,
      sandboxArtifactId: h.artifacts[1].artifact.artifactId },
    { kind: "DELETE", relativePath: "delete.txt", baselineObservationId: h.baselines.get("delete.txt")!.transaction.observation.observationId },
  ];
}

function request(h: Harness, requestId: string, patchIntents = intents(h), overrides: Partial<R2GProposeRequest> = {}): R2GProposeRequest {
  return { schemaVersion: 1, requestId, proposalId: `PROPOSAL-${requestId}`, authority: "PROPOSE_REPOSITORY_PATCH",
    intents: patchIntents, observedAtEpochMs: NOW + 20_000, ...overrides };
}

async function cleanup(h: Harness): Promise<void> {
  for (const artifact of h.artifacts) if (existsSync(artifact.artifact.canonicalPath)) await unlink(artifact.artifact.canonicalPath);
  if (h.lifecycle.ownsActiveSandbox(h.sandbox)) await h.lifecycle.terminate(termination(h.lifecycleConfig, h.sandbox.requestId));
  await rmdir(h.sandboxParent); await rm(h.fixtureParent, { recursive: true });
}

{
  const h = await harness("success");
  const proposer = await R2GControlledPatchProposer.create(h.config);
  const result = await proposer.propose(request(h, "SUCCESS"));
  assert(result.decision === "PROPOSED" && result.proposal?.changes.length === 3, "create/modify/delete intents become one controlled patch proposal");
  assert(result.proposal?.changes.map((change) => change.kind).join(",") === "CREATE,MODIFY,DELETE", "proposal preserves deterministic semantic change ordering");
  assert(result.proposal?.changes[1].expectedBaseHash === h.baselines.get("modify.txt")!.transaction.observation.contentSha256, "modify proposal binds exact inspected repository preimage");
  assert(result.proposal?.changes[2].proposedContent === null && result.proposal.changes[2].expectedBaseHash !== null, "proposed deletion carries base hash without copying deleted content");
  assert(result.proposal?.applyAuthorized === false && result.authorityGranted === false, "proposal is explicitly not application authority");
  assert(result.evidence.repositoryObservationIds.length === 3 && result.evidence.repositoryEvidenceIds.length === 3, "fresh R1 revalidation evidence is attributable");
  assert(!existsSync(join(h.repositoryRoot, "create.txt")), "proposal does not create a repository file");
  assert((await readFile(join(h.repositoryRoot, "modify.txt"), "utf8")) === "repository-modify-base", "proposal does not modify repository content");
  assert(existsSync(join(h.repositoryRoot, "delete.txt")), "proposal does not apply proposed deletion");
  const second = await proposer.propose(request(h, "SUCCESS", intents(h), { proposalId: result.proposal!.proposalId }));
  assert(second.proposal?.proposalDigest === result.proposal?.proposalDigest, "identical inputs reproduce the deterministic patch digest");
  assert(!("apply" in proposer) && !("writeRepository" in proposer) && !("executeShell" in proposer), "proposer exposes no apply, repository-write, or shell method");
  await cleanup(h);
}

{
  const h = await harness("invalid");
  const proposer = await R2GControlledPatchProposer.create(h.config);
  const bad: readonly [string, R2GProposeRequest, string][] = [
    ["duplicate", request(h, "DUP", [intents(h)[0], intents(h)[0]]), "duplicate_patch_target"],
    ["traversal", request(h, "TRAV", [{ ...intents(h)[0], relativePath: "../create.txt" }]), "patch_target_invalid"],
    ["wrong baseline", request(h, "BASE", [{ ...intents(h)[0], baselineObservationId: "WRONG" }]), "patch_baseline_binding_mismatch"],
    ["wrong artifact", request(h, "ART", [{ ...intents(h)[0], sandboxArtifactId: "WRONG" }]), "patch_sandbox_artifact_binding_mismatch"],
    ["unsupported", request(h, "UNSUPPORTED", [{ ...intents(h)[0], kind: "RENAME" } as unknown as R2GPatchIntent]), "unsupported_patch_change_kind"],
  ];
  for (const [label, input, reason] of bad) {
    const result = await proposer.propose(input);
    assert(result.decision === "REJECTED" && result.reason.includes(reason), `${label} patch intent is rejected explicitly`);
    assert((await readFile(join(h.repositoryRoot, "modify.txt"), "utf8")) === "repository-modify-base", `${label} rejection leaves fixture repository unchanged`);
  }
  await cleanup(h);
}

{
  const h = await harness("stale");
  const proposer = await R2GControlledPatchProposer.create(h.config);
  await writeFile(join(h.repositoryRoot, "modify.txt"), "changed-after-inspection", "utf8");
  const result = await proposer.propose(request(h, "STALE"));
  assert(result.decision === "STALE_REJECTED" && result.reason === "repository_base_changed_since_inspection", "stale repository base rejects patch proposal");
  assert((await readFile(join(h.repositoryRoot, "modify.txt"), "utf8")) === "changed-after-inspection", "stale detection never repairs or overwrites repository state");
  assert(result.evidence.result === "STALE" && result.evidence.repositoryObservationIds.length > 0, "stale rejection retains fresh observation provenance");
  await cleanup(h);
}

{
  const h = await harness("artifact-change");
  const proposer = await R2GControlledPatchProposer.create(h.config);
  await writeFile(h.artifacts[0].artifact.canonicalPath, "changed-sandbox-artifact", "utf8");
  const result = await proposer.propose(request(h, "ARTIFACT-CHANGED"));
  assert(result.decision === "QUARANTINED" && result.reason === "sandbox_artifact_changed_during_proposal", "changed sandbox artifact quarantines proposal generation");
  assert(proposer.capabilityProfile().revoked, "artifact integrity failure revokes the proposer");
  assert(!existsSync(join(h.repositoryRoot, "create.txt")), "artifact integrity failure cannot mutate repository");
  await cleanup(h);
}

{
  const h = await harness("bytes", 4);
  const proposer = await R2GControlledPatchProposer.create(h.config);
  const result = await proposer.propose(request(h, "BYTES"));
  assert(result.decision === "REJECTED" && result.reason === "patch_byte_limit_exceeded", "patch proposal byte bound is enforced");
  assert(!existsSync(join(h.repositoryRoot, "create.txt")), "oversized proposal has no repository side effect");
  await cleanup(h);
}

assert(R2_G_ISOLATED_CANDIDATE_STATUS.newCapability === "CONTROLLED_REPOSITORY_PATCH_PROPOSAL", "chunk reports the exact capability gain");
assert(R2_G_ISOLATED_CANDIDATE_STATUS.authorityGranted === false && !R2_G_ISOLATED_CANDIDATE_STATUS.productionEligible, "R2-G remains an isolated candidate");
assert(R2_G_ISOLATED_CANDIDATE_STATUS.unavailableCapabilities.includes("APPLY_PATCH")
  && R2_G_ISOLATED_CANDIDATE_STATUS.unavailableCapabilities.includes("WRITE_REPOSITORY"), "proposal never implies application authority");

console.log(`Omega R2-G controlled patch tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) { console.error("FAILURES:"); for (const failure of failures) console.error(`  - ${failure}`); process.exit(1); }
