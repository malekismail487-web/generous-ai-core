import { createHash } from "node:crypto";
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";
import { R2AIsolatedSandboxLifecycle } from "../../../src/lib/codelab/executor/r2SandboxLifecycle";
import { R3ADisposablePatchApplicator } from "../../../src/lib/codelab/executor/r3DisposablePatchApplication";
import { R3BControlledEngineeringExecutor } from "../../../src/lib/codelab/executor/r3ControlledEngineeringExecution";
import { ReadOnlyRepositoryExecutor } from "../../../src/lib/codelab/executor/readOnlyExecutor";
import type { R2GPatchProposal } from "../../../src/lib/codelab/executor/r2PatchProposal";
import type { OmegaPreparedRepairCandidate } from "../../../src/lib/codelab/engine/r3BoundedRepairLoop";
import type { NyxRepairHypothesis } from "../../../src/lib/codelab/cognition/nyxNemotronEngineeringCognition";
import { observeEngineeringExecution } from "../../../src/lib/codelab/observation/r3EngineeringObservation";
import { theoryDigest } from "../../../src/lib/codelab/research/theoryContracts";

export const contentHash = (value: string) => createHash("sha256").update(value).digest("hex");
/** Test-harness composition of existing R1/R2A/R2G/R3A/R3B, not a second executor or sandbox. */
export class R3BenchmarkRepositorySession {
  readonly parent: string;
  readonly sourceRoot: string;
  readonly files: Readonly<Record<string, string>>;
  readonly candidate: string;
  readonly deadline: number;
  readonly maxBytes: number;
  #currentRoot: string;
  #sequence = 0;
  #terminated = false;
  #cleanupResult: { sourceUnchanged: boolean; cleanupVerified: boolean; lifecycleTerminations: number;
    provisionedLifecycles: number } | null = null;
  #lifecycle: { lifecycle: R2AIsolatedSandboxLifecycle; requestId: string; cloneRoot: string; capabilityId: string;
    issuer: string; auditIdentity: string }[] = [];

  private constructor(parent: string, files: Readonly<Record<string, string>>, candidate: string,
    deadline: number, maxBytes: number) {
    this.parent = parent; this.sourceRoot = join(parent, "source"); this.#currentRoot = this.sourceRoot;
    this.files = Object.freeze({ ...files }); this.candidate = candidate; this.deadline = deadline; this.maxBytes = maxBytes;
  }
  static async create(files: Readonly<Record<string, string>>, candidate: string, deadline: number, maxBytes: number) {
    if (!/^[a-f0-9]{40}$/.test(candidate) || !Number.isSafeInteger(maxBytes) || maxBytes < 1
      || deadline <= Date.now() || deadline - Date.now() > 600_000
      || Object.keys(files).length < 1 || Object.keys(files).length > 10
      || Object.entries(files).some(([path, content]) => !/^(src|tools)\/[a-z0-9-]+\.mjs$/.test(path)
        || typeof content !== "string" || Buffer.byteLength(content) > 64_000)) throw Error("benchmark_repository_config");
    const parent = await mkdtemp(join(tmpdir(), "nyx-benchmark-r3-"));
    const session = new R3BenchmarkRepositorySession(parent, files, candidate, deadline, maxBytes);
    try {
      await mkdir(join(session.sourceRoot, "src"), { recursive: true });
      await mkdir(join(session.sourceRoot, "tools"));
      for (const [path, content] of Object.entries(files)) await writeFile(join(session.sourceRoot, path), content);
      return session;
    } catch (error) { await session.close(); throw error; }
  }
  assertActive() {
    if (this.#terminated || Date.now() >= this.deadline) throw Error("benchmark_repository_lease_expired");
  }
  async prepare(hypothesis: NyxRepairHypothesis): Promise<OmegaPreparedRepairCandidate> {
    this.assertActive();
    if (hypothesis.changes.length !== 1 || hypothesis.changes[0].relativePath !== "src/transform.mjs"
      || hypothesis.verificationToolIds.length !== 1 || hypothesis.verificationToolIds[0] !== "TEST")
      throw Error("benchmark_repository_scope");
    const change = hypothesis.changes[0];
    const now = Date.now(); const label = `ARC-R3-${++this.#sequence}`;
    const sourceRoot = await realpath(this.#currentRoot);
    const sandboxRoot = join(this.parent, `sandboxes-${this.#sequence}`); await mkdir(sandboxRoot);
    const issuer = "OMEGA-BENCHMARK-ISOLATED"; const auditIdentity = `${label}-AUDIT`;
    const capId = `${label}-CAP`;
    const binding = { commit: this.candidate, capabilityVersion: "r2-a/1" as const, schemaVersion: 1 as const,
      evaluatorVersion: "nyx-arc-r3/1", environmentIdentity: `${process.platform}-${process.arch}-node-${process.version}` };
    const lifecycle = await R2AIsolatedSandboxLifecycle.create({ executorId: label, candidateCommit: this.candidate,
      capabilityVersion: binding.capabilityVersion, evaluatorVersion: binding.evaluatorVersion,
      environmentIdentity: binding.environmentIdentity, authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED",
      repositoryRoot: sourceRoot, approvedSandboxRoot: await realpath(sandboxRoot),
      capability: { capabilityId: capId, issuer, auditIdentity, issuedAtEpochMs: now - 1000, expiresAtEpochMs: this.deadline } }, now);
    const provisioned = await lifecycle.provision({ schemaVersion: 1, requestId: `${label}-PROVISION`, capabilityId: capId,
      authority: "PROVISION_SANDBOX", requestedPath: "candidate", repositoryRoot: sourceRoot,
      approvedSandboxRoot: await realpath(sandboxRoot), issuedAtEpochMs: now, expiresAtEpochMs: this.deadline,
      issuer, auditIdentity, candidateBinding: binding }, now);
    if (!provisioned.sandbox) throw Error(`benchmark_provision_${provisioned.reason}`);
    const cloneRoot = join(provisioned.sandbox.canonicalPath, "repository");
    this.#lifecycle.push({ lifecycle, requestId: provisioned.sandbox.requestId, cloneRoot,
      capabilityId: capId, issuer, auditIdentity });
    await cp(sourceRoot, cloneRoot, { recursive: true, errorOnExist: true, force: false });
    const r1 = await ReadOnlyRepositoryExecutor.create({ executorId: `${label}-R1`, tokenId: `${label}-R1-TOKEN`,
      repositoryRoot: sourceRoot, resourceScopes: ["."], issuedAtEpochMs: now - 1000, expiresAtEpochMs: this.deadline,
      constraints: { maxFileBytes: 64_000, maxDirectoryEntries: 30, allowedExtensions: [".mjs"] }, issuer, auditIdentity });
    const proposalBody = { schemaVersion: 1 as const, proposalId: `${label}-PATCH`, requestId: `${label}-PATCH-REQUEST`,
      repositoryRoot: sourceRoot, baseCandidateCommit: this.candidate, changes: [{ kind: "MODIFY" as const,
        relativePath: change.relativePath, expectedBaseHash: change.expectedBaseHash,
        proposedContent: change.replacementContent, proposedContentHash: change.replacementContentHash,
        baselineEvidenceId: `${label}-BASELINE`, baselineObservationId: `${label}-OBSERVATION`, sandboxArtifactId: `${label}-ARTIFACT` }],
      applyAuthorized: false as const, rollbackRequiredBeforeApply: true as const };
    const proposal: R2GPatchProposal = { ...proposalBody, proposalDigest: theoryDigest(proposalBody) };
    const applicator = await R3ADisposablePatchApplicator.create({ executorId: `${label}-R3A`, candidateCommit: this.candidate,
      evaluatorVersion: binding.evaluatorVersion, environmentIdentity: binding.environmentIdentity,
      authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED", sourceRepositoryRoot: sourceRoot, sourceRepositoryExecutor: r1,
      disposableRepositoryRoot: cloneRoot, sandbox: provisioned.sandbox, lifecycle, proposal,
      capability: { capabilityId: `${label}-APPLY-CAP`, issuer, auditIdentity, issuedAtEpochMs: now - 1000, expiresAtEpochMs: this.deadline },
      allowedExtensions: [".mjs"], maxChanges: 1, maxPatchBytes: this.maxBytes });
    const application = await applicator.apply({ schemaVersion: 1, requestId: `${label}-APPLY`, applicationId: `${label}-APPLICATION`,
      proposalId: proposal.proposalId, proposalDigest: proposal.proposalDigest,
      disposableRepositoryId: applicator.disposableRepositoryId(), sandboxId: provisioned.sandbox.sandboxId,
      capabilityId: `${label}-APPLY-CAP`, authority: "APPLY_REVIEWED_PATCH_TO_DISPOSABLE_REPOSITORY",
      issuer, auditIdentity, observedAtEpochMs: Date.now() });
    if (application.decision !== "APPLIED") throw Error(`benchmark_apply_${application.reason}`);
    const executor = await R3BControlledEngineeringExecutor.create({ executorId: `${label}-R3B`, candidateCommit: this.candidate,
      evaluatorVersion: binding.evaluatorVersion, environmentIdentity: binding.environmentIdentity,
      authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED", disposableRepositoryRoot: cloneRoot,
      disposableRepositoryId: application.disposableRepositoryId, applicator, appliedCandidate: application,
      capability: { capabilityId: `${label}-TEST-CAP`, issuer, auditIdentity, issuedAtEpochMs: now - 1000, expiresAtEpochMs: this.deadline },
      tools: [{ toolId: "TEST", toolKind: "TEST", toolVersion: "arc-public-examples/1", entrypoint: "tools/verify.mjs",
        expectedEntrypointSha256: contentHash(this.files["tools/verify.mjs"]), arguments: [], workingDirectory: ".",
        timeoutMs: 2000, maxOutputBytes: 64_000, allowedMutationPrefixes: [], allowChildProcesses: false }],
      maxRepositoryFiles: 30, maxRepositoryBytes: 500_000, maxTimeoutMs: 2000, maxOutputBytes: 64_000 });
    this.#currentRoot = cloneRoot;
    return { hypothesisId: hypothesis.hypothesisId, hypothesisDigest: hypothesis.proposalDigest, proposal, application,
      verifications: [{ toolId: "TEST", executor, request: { schemaVersion: 1, requestId: `${label}-TEST`, executionId: `${label}-EXECUTION`,
        authority: "RUN_AUTHORIZED_ENGINEERING_TOOL", toolId: "TEST", disposableRepositoryId: application.disposableRepositoryId,
        applicationId: application.applicationId, proposalDigest: application.proposalDigest, capabilityId: `${label}-TEST-CAP`,
        issuer, auditIdentity, environmentIdentity: binding.environmentIdentity, observedAtEpochMs: Date.now() } }],
      files: await Promise.all(Object.keys(this.files).map(async relativePath => {
        const content = await readFile(join(cloneRoot, relativePath), "utf8");
        return { relativePath, content, contentSha256: contentHash(content) };
      })), omegaAuthorityBoundary: "R3A_APPLY_AND_R3B_EXECUTE_ISOLATED_ONLY", sourceRepositoryMutated: false,
      productionAuthorityGranted: false };
  }
  async baseline() {
    const content = this.files["src/transform.mjs"];
    const hypothesis = { hypothesisId: "INITIAL", proposalDigest: "INITIAL", verificationToolIds: ["TEST"],
      changes: [{ kind: "MODIFY", relativePath: "src/transform.mjs", expectedBaseHash: contentHash(content),
        replacementContent: content, replacementContentHash: contentHash(content) }] } as unknown as NyxRepairHypothesis;
    const prepared = await this.prepare(hypothesis);
    const verification = prepared.verifications[0]; const result = await verification.executor.execute(verification.request);
    const observed = observeEngineeringExecution({ schemaVersion: 1, observationRequestId: "ARC-INITIAL-OBSERVATION",
      observerIdentity: "OMEGA-ARC-OBSERVER", evaluatorVersion: "nyx-arc-r3/1",
      expected: { candidateCommit: this.candidate, disposableRepositoryId: prepared.application.disposableRepositoryId,
        applicationId: prepared.application.applicationId, proposalDigest: prepared.proposal.proposalDigest,
        toolId: "TEST", toolKind: "TEST", toolIdentityDigest: result.evidence.toolIdentityDigest,
        environmentIdentity: result.evidence.environmentIdentity }, candidate: result, baseline: null, observedAtEpochMs: Date.now() });
    if (!observed.observation || observed.observation.state !== "TEST_FAIL") throw Error("benchmark_initial_failure_not_observed");
    return { prepared, result, observation: observed.observation };
  }
  async close() {
    if (this.#terminated) {
      if (!this.#cleanupResult) throw Error("benchmark_cleanup_not_verified");
      return this.#cleanupResult;
    }
    this.#terminated = true;
    let sourceUnchanged = true;
    for (const [path, content] of Object.entries(this.files)) {
      try { if (await readFile(join(this.sourceRoot, path), "utf8") !== content) sourceUnchanged = false; }
      catch { sourceUnchanged = false; }
    }
    if (!basename(this.parent).startsWith("nyx-benchmark-r3-") || resolve(this.parent) !== this.parent
      || await realpath(this.parent) !== this.parent || (await lstat(this.parent)).isSymbolicLink())
      throw Error("benchmark_cleanup_root_identity");
    const assertOrdinaryTree = async (path: string): Promise<void> => {
      const delta = relative(this.parent, path);
      if (delta === ".." || delta.startsWith(`..${sep}`)) throw Error("benchmark_cleanup_scope");
      const stats = await lstat(path);
      if (stats.isSymbolicLink() || (!stats.isDirectory() && (!stats.isFile() || stats.nlink !== 1)))
        throw Error("benchmark_cleanup_alias");
      if (stats.isDirectory()) for (const entry of await readdir(path)) await assertOrdinaryTree(join(path, entry));
    };
    await assertOrdinaryTree(this.parent);
    let lifecycleTerminations = 0;
    for (const owned of [...this.#lifecycle].reverse()) {
      await rm(owned.cloneRoot, { recursive: true, force: false });
      const result = await owned.lifecycle.terminate({ schemaVersion: 1, requestId: owned.requestId,
        capabilityId: owned.capabilityId, authority: "TERMINATE_SANDBOX", issuer: owned.issuer,
        auditIdentity: owned.auditIdentity, observedAtEpochMs: Date.now() });
      if (result.decision === "TERMINATED") lifecycleTerminations++;
    }
    // Our own validated mkdtemp root only. Expired lifecycle authority is NOT renewed for cleanup.
    await rm(this.parent, { recursive: true, force: false });
    try { await lstat(this.parent); throw Error("benchmark_cleanup_not_absent"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    this.#cleanupResult = { sourceUnchanged, cleanupVerified: true, lifecycleTerminations,
      provisionedLifecycles: this.#lifecycle.length };
    return this.#cleanupResult;
  }
}
