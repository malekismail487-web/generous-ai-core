import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { R2AIsolatedSandboxLifecycle, type R2AIsolatedLifecycleConfig } from "../executor/r2SandboxLifecycle";
import type { SandboxProvisionRequest } from "../executor/r2ProvisioningBlueprint";
import type { R2GPatchProposal, R2GProposedChange } from "../executor/r2PatchProposal";
import { R3ADisposablePatchApplicator, type R3AApplyRequest } from "../executor/r3DisposablePatchApplication";
import { R3BControlledEngineeringExecutor, type R3BEngineeringToolDefinition,
  type R3BExecutionRequest } from "../executor/r3ControlledEngineeringExecution";
import { ReadOnlyRepositoryExecutor } from "../executor/readOnlyExecutor";
import { nyxCanonical, nyxSafeRelativePath, nyxSha256 } from "./nyxChatProtocol";
import type { NyxCandidateObservation, NyxCandidateRequest, NyxCandidateResult, NyxCandidateWriter } from "./nyxChatSession";

export interface NyxIsolatedCandidateConfig {
  readonly sourceRoot: string;
  readonly editablePath: string;
  readonly verifierPath: string | null;
  readonly candidateCommit: string;
  readonly maxCandidateBytes: number;
  readonly maxVerifierMs: number;
}

/** Host-owned packaging, never an agent tool. Only two explicitly selected source files can enter a clone. */
export class NyxIsolatedCandidateWriter implements NyxCandidateWriter {
  readonly #config: NyxIsolatedCandidateConfig;
  readonly #sourceRoot: string;
  readonly #scratchRoot: string;
  #currentRoot: string;
  #sequence = 0;
  #closed = false;
  #originalHash: string | null = null;
  #currentHash: string | null = null;
  #currentCandidateId: string | null = null;
  #observationSequence = 0;

  private constructor(config: NyxIsolatedCandidateConfig, sourceRoot: string, scratchRoot: string) {
    this.#config = config;
    this.#sourceRoot = sourceRoot;
    this.#scratchRoot = scratchRoot;
    this.#currentRoot = sourceRoot;
  }

  static async create(config: NyxIsolatedCandidateConfig): Promise<NyxIsolatedCandidateWriter> {
    if (!nyxSafeRelativePath(config.editablePath) || (config.verifierPath !== null && !nyxSafeRelativePath(config.verifierPath))
      || config.verifierPath === config.editablePath || !/^[a-f0-9]{40}$/.test(config.candidateCommit)
      || !Number.isSafeInteger(config.maxCandidateBytes) || config.maxCandidateBytes < 1 || config.maxCandidateBytes > 65_536
      || !Number.isSafeInteger(config.maxVerifierMs) || config.maxVerifierMs < 100 || config.maxVerifierMs > 30_000) {
      throw new Error("nyx_candidate_config_invalid");
    }
    const sourceRoot = await realpath(config.sourceRoot);
    if (!(await lstat(sourceRoot)).isDirectory()) throw new Error("nyx_source_not_directory");
    const scratchRoot = await mkdtemp(join(tmpdir(), "nyx-cli-"));
    const canonicalScratch = await realpath(scratchRoot);
    if (inside(sourceRoot, canonicalScratch) || inside(canonicalScratch, sourceRoot)) {
      throw new Error("nyx_scratch_not_disjoint_from_source");
    }
    return new NyxIsolatedCandidateWriter(config, sourceRoot, canonicalScratch);
  }

  get scratchRoot(): string { return this.#scratchRoot; }

  async observeCandidate(path: string): Promise<NyxCandidateObservation> {
    if (this.#closed || path !== this.#config.editablePath || this.#currentRoot === this.#sourceRoot
      || this.#currentHash === null || this.#currentCandidateId === null) {
      throw new Error("isolated_candidate_not_observable");
    }
    const source = await readFile(join(this.#sourceRoot, ...path.split("/")), "utf8");
    if (nyxSha256(source) !== this.#originalHash) throw new Error("authoritative_source_changed_during_session");
    const now = Date.now();
    const observationId = `NYX-CANDIDATE-REOBSERVE-${++this.#observationSequence}-${now}`;
    const reader = await ReadOnlyRepositoryExecutor.create({ executorId: observationId,
      tokenId: `${observationId}-TOKEN`, repositoryRoot: this.#currentRoot, resourceScopes: [path],
      issuedAtEpochMs: now - 1_000, expiresAtEpochMs: now + 30_000,
      constraints: { maxFileBytes: this.#config.maxCandidateBytes, maxDirectoryEntries: 1,
        allowedExtensions: [extension(path)] },
      issuer: "NYX-CLI-ISOLATED-HOST", auditIdentity: `${observationId}-AUDIT` });
    try {
      const transaction = await reader.execute({ requestId: observationId, tokenId: reader.token.tokenId,
        action: "READ_FILE", resourcePath: path, observedAtEpochMs: now });
      const observed = transaction.observation;
      if (observed.status !== "OBSERVED" || observed.content === null
        || observed.contentSha256 !== this.#currentHash) throw new Error("isolated_candidate_state_changed");
      return { path, content: observed.content, contentSha256: observed.contentSha256,
        candidateId: this.#currentCandidateId, evidenceId: transaction.evidence.evidenceId,
        sourceRepositoryMutated: false };
    } finally { reader.terminate(Date.now(), "isolated_candidate_observation_finished"); }
  }

  async apply(request: NyxCandidateRequest): Promise<NyxCandidateResult> {
    const fail = (reason: string): NyxCandidateResult => ({ decision: "REJECTED", reason, candidateId: null,
      evidenceId: `NYX-CANDIDATE-REJECTED-${nyxSha256(`${request.requestId}:${reason}`).slice(0, 24)}`,
      sourceRepositoryMutated: false, authorityGranted: false, verification: "NOT_CONFIGURED", changedPath: null });
    if (this.#closed) return fail("candidate_writer_closed");
    if (request.path !== this.#config.editablePath || !nyxSafeRelativePath(request.path)
      || Buffer.byteLength(request.replacement, "utf8") > this.#config.maxCandidateBytes) return fail("candidate_scope_or_size_rejected");
    if (!/^[a-f0-9]{64}$/.test(request.expectedBaseHash)) return fail("candidate_base_hash_invalid");
    this.#sequence += 1;
    const label = `candidate-${this.#sequence}`;
    const now = Date.now();
    const expires = now + Math.max(120_000, this.#config.maxVerifierMs + 60_000);
    const sourceRoot = this.#currentRoot;
    const reader = await ReadOnlyRepositoryExecutor.create({ executorId: `NYX-CANDIDATE-R1-${label}`,
      tokenId: `NYX-CANDIDATE-R1-TOKEN-${label}`, repositoryRoot: sourceRoot,
      resourceScopes: [request.path, ...(this.#config.verifierPath ? [this.#config.verifierPath] : [])],
      issuedAtEpochMs: now - 1_000, expiresAtEpochMs: expires,
      constraints: { maxFileBytes: Math.max(this.#config.maxCandidateBytes, 65_536), maxDirectoryEntries: 8,
        allowedExtensions: [...new Set([extension(request.path), ...(this.#config.verifierPath ? [extension(this.#config.verifierPath)] : [])])] },
      issuer: "NYX-CLI-ISOLATED-HOST", auditIdentity: `NYX-CANDIDATE-R1-AUDIT-${label}` });
    const base = await reader.execute({ requestId: `${label}-BASE`, tokenId: reader.token.tokenId,
      action: "READ_FILE", resourcePath: request.path, observedAtEpochMs: now });
    if (base.observation.status !== "OBSERVED" || base.observation.content === null
      || base.observation.contentSha256 !== request.expectedBaseHash) return fail("candidate_base_stale_or_unavailable");
    if (this.#originalHash === null) this.#originalHash = base.observation.contentSha256;
    const originalNow = await readFile(join(this.#sourceRoot, ...request.path.split("/")), "utf8");
    if (nyxSha256(originalNow) !== this.#originalHash) return fail("authoritative_source_changed_during_session");
    if (base.observation.content === request.replacement) return fail("candidate_no_semantic_change");
    let verifierContent: string | null = null;
    if (this.#config.verifierPath) {
      const verifier = await reader.execute({ requestId: `${label}-VERIFIER-BASE`, tokenId: reader.token.tokenId,
        action: "READ_FILE", resourcePath: this.#config.verifierPath, observedAtEpochMs: now });
      if (verifier.observation.status !== "OBSERVED" || verifier.observation.content === null) {
        return fail("verifier_unavailable_in_declared_scope");
      }
      verifierContent = verifier.observation.content;
    }
    const sandboxRoot = join(this.#scratchRoot, `sandboxes-${label}`);
    await mkdir(sandboxRoot);
    const capabilityId = `NYX-CANDIDATE-R2A-CAP-${label}`;
    const issuer = "NYX-CLI-ISOLATED-HOST";
    const auditIdentity = `NYX-CANDIDATE-R2A-AUDIT-${label}`;
    const environmentIdentity = `nyx-cli-${process.platform}-${process.arch}`;
    const evaluatorVersion = "nyx-cli-candidate/1";
    const lifecycleConfig: R2AIsolatedLifecycleConfig = { executorId: `NYX-CANDIDATE-R2A-${label}`,
      candidateCommit: this.#config.candidateCommit, capabilityVersion: "r2-a/1", evaluatorVersion,
      environmentIdentity, authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED", repositoryRoot: sourceRoot,
      approvedSandboxRoot: await realpath(sandboxRoot), capability: { capabilityId, issuer, auditIdentity,
        issuedAtEpochMs: now - 1_000, expiresAtEpochMs: expires } };
    const lifecycle = await R2AIsolatedSandboxLifecycle.create(lifecycleConfig, now);
    const provisionRequest: SandboxProvisionRequest = { schemaVersion: 1, requestId: `NYX-PROVISION-${label}`,
      capabilityId, authority: "PROVISION_SANDBOX", requestedPath: `work-${label}`, repositoryRoot: sourceRoot,
      approvedSandboxRoot: lifecycleConfig.approvedSandboxRoot, issuedAtEpochMs: now,
      expiresAtEpochMs: expires, issuer, auditIdentity, candidateBinding: {
        commit: this.#config.candidateCommit, capabilityVersion: "r2-a/1", schemaVersion: 1,
        evaluatorVersion, environmentIdentity } };
    const provisioned = await lifecycle.provision(provisionRequest, now);
    if (!provisioned.sandbox) return fail(`sandbox_provision_rejected:${provisioned.reason}`);
    const cloneRoot = join(provisioned.sandbox.canonicalPath, "repository-copy");
    await materialize(cloneRoot, request.path, base.observation.content);
    if (this.#config.verifierPath && verifierContent !== null) {
      await materialize(cloneRoot, this.#config.verifierPath, verifierContent);
    }
    const change: R2GProposedChange = { kind: "MODIFY", relativePath: request.path,
      expectedBaseHash: request.expectedBaseHash, proposedContentHash: nyxSha256(request.replacement),
      proposedContent: request.replacement, baselineEvidenceId: base.evidence.evidenceId,
      baselineObservationId: base.observation.observationId,
      sandboxArtifactId: `NYX-CLI-MODEL-PROPOSAL-${nyxSha256(request.replacement).slice(0, 16)}` };
    const proposalBase = { schemaVersion: 1 as const, proposalId: `NYX-CLI-PROPOSAL-${label}`,
      requestId: request.requestId, repositoryRoot: sourceRoot, baseCandidateCommit: this.#config.candidateCommit,
      changes: [change], applyAuthorized: false as const, rollbackRequiredBeforeApply: true as const };
    const proposal: R2GPatchProposal = { ...proposalBase, proposalDigest: nyxSha256(nyxCanonical(proposalBase)) };
    const applyCapability = `NYX-CANDIDATE-R3A-CAP-${label}`;
    const applyAudit = `NYX-CANDIDATE-R3A-AUDIT-${label}`;
    const applicator = await R3ADisposablePatchApplicator.create({ executorId: `NYX-CANDIDATE-R3A-${label}`,
      candidateCommit: this.#config.candidateCommit, evaluatorVersion, environmentIdentity,
      authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED", sourceRepositoryRoot: sourceRoot,
      sourceRepositoryExecutor: reader, disposableRepositoryRoot: cloneRoot,
      sandbox: provisioned.sandbox, lifecycle, proposal, capability: { capabilityId: applyCapability,
        issuer, auditIdentity: applyAudit, issuedAtEpochMs: now - 1_000, expiresAtEpochMs: expires },
      allowedExtensions: [extension(request.path)], maxChanges: 1, maxPatchBytes: this.#config.maxCandidateBytes });
    const applyRequest: R3AApplyRequest = { schemaVersion: 1, requestId: `NYX-CLI-APPLY-REQUEST-${label}`,
      applicationId: `NYX-CLI-APPLICATION-${label}`, proposalId: proposal.proposalId,
      proposalDigest: proposal.proposalDigest, disposableRepositoryId: applicator.disposableRepositoryId(),
      sandboxId: provisioned.sandbox.sandboxId, capabilityId: applyCapability,
      authority: "APPLY_REVIEWED_PATCH_TO_DISPOSABLE_REPOSITORY", issuer,
      auditIdentity: applyAudit, observedAtEpochMs: Date.now() };
    const application = await applicator.apply(applyRequest);
    if (application.decision !== "APPLIED") return fail(`isolated_application_${application.decision}:${application.reason}`);
    if (!this.#config.verifierPath || verifierContent === null) {
      this.#currentRoot = cloneRoot;
      this.#currentHash = nyxSha256(request.replacement);
      this.#currentCandidateId = application.applicationId;
      return { decision: "UNVERIFIED", reason: "isolated_candidate_applied_no_verifier_configured",
        candidateId: application.applicationId, evidenceId: `NYX-CANDIDATE-${nyxSha256(nyxCanonical(application)).slice(0, 32)}`,
        sourceRepositoryMutated: false, authorityGranted: false, verification: "NOT_CONFIGURED", changedPath: request.path };
    }
    const definition: R3BEngineeringToolDefinition = { toolId: "TEST", toolKind: "TEST", toolVersion: evaluatorVersion,
      entrypoint: this.#config.verifierPath, expectedEntrypointSha256: nyxSha256(verifierContent), arguments: [],
      workingDirectory: ".", timeoutMs: this.#config.maxVerifierMs, maxOutputBytes: 16_384,
      allowedMutationPrefixes: [], allowChildProcesses: false };
    const execCapability = `NYX-CANDIDATE-R3B-CAP-${label}`;
    const execAudit = `NYX-CANDIDATE-R3B-AUDIT-${label}`;
    const executor = await R3BControlledEngineeringExecutor.create({ executorId: `NYX-CANDIDATE-R3B-${label}`,
      candidateCommit: this.#config.candidateCommit, evaluatorVersion, environmentIdentity,
      authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED", disposableRepositoryRoot: cloneRoot,
      disposableRepositoryId: application.disposableRepositoryId, applicator, appliedCandidate: application,
      capability: { capabilityId: execCapability, issuer, auditIdentity: execAudit,
        issuedAtEpochMs: now - 1_000, expiresAtEpochMs: expires }, tools: [definition], maxRepositoryFiles: 16,
      maxRepositoryBytes: 256_000, maxTimeoutMs: 30_000, maxOutputBytes: 32_768 });
    const executionRequest: R3BExecutionRequest = { schemaVersion: 1, requestId: `NYX-CLI-EXEC-REQUEST-${label}`,
      executionId: `NYX-CLI-EXECUTION-${label}`, authority: "RUN_AUTHORIZED_ENGINEERING_TOOL",
      toolId: "TEST", disposableRepositoryId: application.disposableRepositoryId,
      applicationId: application.applicationId, proposalDigest: application.proposalDigest,
      capabilityId: execCapability, issuer, auditIdentity: execAudit, environmentIdentity,
      observedAtEpochMs: Date.now() };
    const execution = await executor.execute(executionRequest);
    const actual = await readFile(join(cloneRoot, ...request.path.split("/")), "utf8");
    const sourceNow = await readFile(join(this.#sourceRoot, ...request.path.split("/")), "utf8");
    const sourceUnchanged = nyxSha256(sourceNow) === this.#originalHash;
    if (actual !== request.replacement || !sourceUnchanged) {
      return fail(actual !== request.replacement
        ? "candidate_content_changed_during_verification" : "authoritative_source_changed_during_session");
    }
    this.#currentRoot = cloneRoot;
    this.#currentHash = nyxSha256(actual);
    this.#currentCandidateId = application.applicationId;
    const pass = execution.outcome === "PASS";
    return { decision: pass ? "VERIFIED" : "UNVERIFIED",
      reason: pass ? "bounded_isolated_test_passed" : `bounded_isolated_test_${execution.outcome.toLowerCase()}`,
      candidateId: application.applicationId, evidenceId: execution.evidence.evidenceId,
      sourceRepositoryMutated: false, authorityGranted: false,
      verification: execution.outcome === "PASS" ? "PASS" : "FAIL", changedPath: request.path };
  }

  /** A failed preflight leaves scratch material quarantined, rather than broadening deletion. */
  async close(): Promise<{ readonly decision: "CLEANED" | "QUARANTINED"; readonly path: string }> {
    if (this.#closed) return { decision: "CLEANED", path: this.#scratchRoot };
    this.#closed = true;
    const canonicalTmp = await realpath(tmpdir());
    const canonicalScratch = await realpath(this.#scratchRoot);
    if (dirname(canonicalScratch) !== canonicalTmp || !canonicalScratch.split(sep).at(-1)?.startsWith("nyx-cli-")) {
      return { decision: "QUARANTINED", path: this.#scratchRoot };
    }
    if (!(await safeTree(canonicalScratch))) return { decision: "QUARANTINED", path: this.#scratchRoot };
    try { await rm(canonicalScratch, { recursive: true, force: false }); }
    catch { return { decision: "QUARANTINED", path: this.#scratchRoot }; }
    return { decision: "CLEANED", path: this.#scratchRoot };
  }
}

function inside(root: string, candidate: string): boolean {
  const delta = relative(root, candidate);
  return delta === "" || (delta !== ".." && !delta.startsWith(`..${sep}`) && !delta.startsWith(sep));
}

function extension(path: string): string {
  const name = path.split("/").at(-1) ?? "";
  const dot = name.lastIndexOf(".");
  if (dot < 1) throw new Error("nyx_candidate_extension_required");
  return name.slice(dot).toLowerCase();
}

async function materialize(root: string, path: string, content: string): Promise<void> {
  if (!nyxSafeRelativePath(path)) throw new Error("nyx_materialization_path_invalid");
  const target = resolve(root, ...path.split("/"));
  if (!inside(root, target)) throw new Error("nyx_materialization_escape");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, { encoding: "utf8", flag: "wx" });
}

async function safeTree(root: string): Promise<boolean> {
  const stats = await lstat(root);
  if (stats.isSymbolicLink()) return false;
  if (!stats.isDirectory()) return stats.isFile();
  for (const name of await readdir(root)) {
    const child = join(root, name);
    if (!inside(root, child) || !(await safeTree(child))) return false;
  }
  return true;
}
