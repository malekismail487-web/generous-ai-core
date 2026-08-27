import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { type R2BCreatedArtifact, type R2BIsolatedContentCreator } from "./r2SandboxContent";
import { type R2AIsolatedSandboxLifecycle, type R2AProvisionedSandbox } from "./r2SandboxLifecycle";
import { type ReadOnlyRepositoryExecutor } from "./readOnlyExecutor";
import type { ExecutorTransaction } from "./types";
import type { CanonicalTargetIdentity } from "./r2ProvisioningBlueprint";

export const R2_G_ISOLATED_CANDIDATE_STATUS = Object.freeze({
  chunkId: "OMEGA-R2-G-ISOLATED-001",
  securityClosure: "BLOCKED_EXTERNAL",
  maturity: "IMPLEMENTED_AND_VERIFIED_IN_ISOLATION",
  newCapability: "CONTROLLED_REPOSITORY_PATCH_PROPOSAL",
  candidateCapabilities: Object.freeze(["PROPOSE_REPOSITORY_PATCH"] as const),
  unavailableCapabilities: Object.freeze(["APPLY_PATCH", "WRITE_REPOSITORY", "WRITE_SANDBOX"] as const),
  forbiddenCapabilities: Object.freeze(["SHELL", "NETWORK", "CREDENTIAL_ACCESS", "PACKAGE_INSTALL", "DEPLOYMENT"] as const),
  authorityGranted: false,
  productionEligible: false,
} as const);

export interface R2GSandboxArtifactInput {
  readonly creator: R2BIsolatedContentCreator;
  readonly artifact: R2BCreatedArtifact;
}

export interface R2GRepositoryBaseline {
  readonly relativePath: string;
  readonly transaction: ExecutorTransaction;
}

export interface R2GIsolatedPatchConfig {
  readonly executorId: string;
  readonly candidateCommit: string;
  readonly evaluatorVersion: string;
  readonly environmentIdentity: string;
  readonly authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED";
  readonly repositoryRoot: string;
  readonly repositoryExecutor: ReadOnlyRepositoryExecutor;
  readonly sandbox: R2AProvisionedSandbox;
  readonly lifecycle: R2AIsolatedSandboxLifecycle;
  readonly baselines: readonly R2GRepositoryBaseline[];
  readonly sandboxArtifacts: readonly R2GSandboxArtifactInput[];
  readonly maxChanges: number;
  readonly maxPatchBytes: number;
}

export type R2GPatchIntent =
  | { readonly kind: "CREATE"; readonly relativePath: string; readonly baselineObservationId: string; readonly sandboxArtifactId: string }
  | { readonly kind: "MODIFY"; readonly relativePath: string; readonly baselineObservationId: string; readonly sandboxArtifactId: string }
  | { readonly kind: "DELETE"; readonly relativePath: string; readonly baselineObservationId: string };

export interface R2GProposeRequest {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly proposalId: string;
  readonly authority: "PROPOSE_REPOSITORY_PATCH";
  readonly intents: readonly R2GPatchIntent[];
  readonly observedAtEpochMs: number;
}

export interface R2GProposedChange {
  readonly kind: R2GPatchIntent["kind"];
  readonly relativePath: string;
  readonly expectedBaseHash: string | null;
  readonly proposedContentHash: string | null;
  readonly proposedContent: string | null;
  readonly baselineEvidenceId: string;
  readonly baselineObservationId: string;
  readonly sandboxArtifactId: string | null;
}

export interface R2GPatchProposal {
  readonly schemaVersion: 1;
  readonly proposalId: string;
  readonly requestId: string;
  readonly repositoryRoot: string;
  readonly baseCandidateCommit: string;
  readonly changes: readonly R2GProposedChange[];
  readonly proposalDigest: string;
  readonly applyAuthorized: false;
  readonly rollbackRequiredBeforeApply: true;
}

export interface R2GPatchEvidence {
  readonly evidenceId: string;
  readonly evidenceClass: "E3";
  readonly proposalId: string;
  readonly repositoryObservationIds: readonly string[];
  readonly repositoryEvidenceIds: readonly string[];
  readonly sandboxArtifactIds: readonly string[];
  readonly proposalDigest: string | null;
  readonly result: "PROPOSED" | "REJECTED" | "STALE" | "QUARANTINED";
  readonly authorityGranted: false;
}

export interface R2GProposalResult {
  readonly decision: "PROPOSED" | "STALE_REJECTED" | "REJECTED" | "QUARANTINED";
  readonly reason: string;
  readonly proposal: R2GPatchProposal | null;
  readonly evidence: R2GPatchEvidence;
  readonly authorityGranted: false;
}

interface ValidatedBaseline {
  readonly relativePath: string;
  readonly transaction: ExecutorTransaction;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function identityKey(identity: CanonicalTargetIdentity): string {
  return `${identity.identityScheme}:${identity.volumeOrDevice}:${identity.objectId}`;
}

function within(root: string, candidate: string): boolean {
  const delta = relative(root, candidate);
  return delta === "" || (!delta.startsWith(`..${sep}`) && delta !== ".." && !isAbsolute(delta));
}

function validRelativePath(path: unknown): path is string {
  return typeof path === "string" && path.trim().length > 0 && !path.includes("\0") && !isAbsolute(path)
    && !path.replace(/\\/g, "/").split("/").some((segment) => !segment || segment === ".." || segment === ".");
}

function validateBaseline(root: string, baseline: R2GRepositoryBaseline): ValidatedBaseline {
  const { transaction } = baseline;
  if (!validRelativePath(baseline.relativePath) || transaction.request.action !== "READ_FILE"
    || transaction.request.resourcePath !== baseline.relativePath || !transaction.authorization.allowed
    || transaction.toolAction?.actionId !== transaction.observation.actionId
    || transaction.evidence.observationId !== transaction.observation.observationId
    || transaction.evidence.actionId !== transaction.toolAction?.actionId
    || transaction.observation.resourcePath !== baseline.relativePath
    || !within(root, resolve(root, baseline.relativePath))) throw new Error("repository_baseline_provenance_invalid");
  const status = transaction.observation.status;
  if (status !== "OBSERVED" && status !== "ABSENT") throw new Error("repository_baseline_not_supported");
  if (status === "OBSERVED" && (transaction.observation.epistemicState !== "SUPPORTED"
    || transaction.observation.resourceKind !== "FILE" || transaction.observation.content === null
    || transaction.observation.contentSha256 !== sha256(transaction.observation.content))) throw new Error("repository_baseline_content_invalid");
  return { relativePath: baseline.relativePath, transaction };
}

export class R2GControlledPatchProposer {
  readonly #config: R2GIsolatedPatchConfig;
  readonly #baselines: ReadonlyMap<string, ValidatedBaseline>;
  readonly #artifacts: ReadonlyMap<string, R2GSandboxArtifactInput>;
  #revoked = false;

  private constructor(config: R2GIsolatedPatchConfig, baselines: ReadonlyMap<string, ValidatedBaseline>, artifacts: ReadonlyMap<string, R2GSandboxArtifactInput>) {
    this.#config = config; this.#baselines = baselines; this.#artifacts = artifacts;
  }

  static async create(config: R2GIsolatedPatchConfig): Promise<R2GControlledPatchProposer> {
    if (config.authorityMode !== "ISOLATED_CANDIDATE_NOT_GRANTED") throw new Error("production_authority_not_permitted");
    if (!/^[0-9a-f]{40}$/.test(config.candidateCommit)) throw new Error("candidate_commit_must_be_exact");
    if (!config.executorId.trim() || !config.evaluatorVersion.trim() || !config.environmentIdentity.trim()) throw new Error("isolated_candidate_identity_missing");
    if (!Number.isInteger(config.maxChanges) || config.maxChanges < 1 || !Number.isInteger(config.maxPatchBytes) || config.maxPatchBytes < 1) {
      throw new Error("patch_policy_invalid");
    }
    const repositoryRoot = await realpath(config.repositoryRoot);
    if (repositoryRoot !== config.repositoryExecutor.token.repositoryRoot) throw new Error("repository_executor_root_mismatch");
    if (!config.lifecycle.ownsActiveSandbox(config.sandbox)) throw new Error("sandbox_not_active");
    if (within(repositoryRoot, config.sandbox.canonicalPath) || within(config.sandbox.canonicalPath, repositoryRoot)) throw new Error("sandbox_repository_not_disjoint");
    const baselines = new Map<string, ValidatedBaseline>();
    for (const input of config.baselines) {
      if (baselines.has(input.relativePath)) throw new Error("duplicate_repository_baseline");
      baselines.set(input.relativePath, validateBaseline(repositoryRoot, input));
    }
    const artifacts = new Map<string, R2GSandboxArtifactInput>();
    for (const input of config.sandboxArtifacts) {
      if (artifacts.has(input.artifact.artifactId) || !input.creator.attestsOwnedArtifactForPatch(input.artifact)) throw new Error("sandbox_artifact_ownership_invalid");
      const [canonicalPath, stats, content] = await Promise.all([realpath(input.artifact.canonicalPath), lstat(input.artifact.canonicalPath, { bigint: true }), readFile(input.artifact.canonicalPath)]);
      const identity = `${process.platform === "win32" ? "WINDOWS_FILE_ID" : "POSIX_DEVICE_INODE"}:${stats.dev.toString()}:${stats.ino.toString()}:${stats.birthtimeNs.toString()}`;
      if (canonicalPath !== input.artifact.canonicalPath || !within(config.sandbox.canonicalPath, canonicalPath)
        || identity !== identityKey(input.artifact.objectIdentity) || content.byteLength !== input.artifact.byteLength
        || sha256(content) !== input.artifact.contentHash) throw new Error("sandbox_artifact_observation_invalid");
      artifacts.set(input.artifact.artifactId, input);
    }
    return new R2GControlledPatchProposer(config, baselines, artifacts);
  }

  capabilityProfile(): typeof R2_G_ISOLATED_CANDIDATE_STATUS & { readonly revoked: boolean } {
    return Object.freeze({ ...R2_G_ISOLATED_CANDIDATE_STATUS, revoked: this.#revoked });
  }

  async propose(request: R2GProposeRequest): Promise<R2GProposalResult> {
    const proposalId = typeof request.proposalId === "string" && request.proposalId.trim() ? request.proposalId : "MALFORMED";
    const issues: string[] = [];
    if (this.#revoked) issues.push("patch_proposer_revoked");
    if (request.schemaVersion !== 1 || typeof request.requestId !== "string" || !request.requestId.trim()
      || typeof request.proposalId !== "string" || !request.proposalId.trim() || !Number.isFinite(request.observedAtEpochMs)) issues.push("patch_request_malformed");
    if (request.authority !== "PROPOSE_REPOSITORY_PATCH") issues.push("patch_proposal_authority_mismatch");
    const intents = Array.isArray(request.intents) ? request.intents : [];
    if (intents.length < 1 || intents.length > this.#config.maxChanges) issues.push("patch_change_count_out_of_bounds");
    const paths = intents.map((intent) => typeof intent?.relativePath === "string" ? intent.relativePath : "");
    if (new Set(paths).size !== paths.length) issues.push("duplicate_patch_target");
    for (const intent of intents) {
      if (!intent || !validRelativePath(intent.relativePath)) issues.push("patch_target_invalid");
      if (intent?.kind !== "CREATE" && intent?.kind !== "MODIFY" && intent?.kind !== "DELETE") issues.push("unsupported_patch_change_kind");
      const baseline = this.#baselines.get(intent?.relativePath);
      if (!baseline || intent?.baselineObservationId !== baseline.transaction.observation.observationId) issues.push("patch_baseline_binding_mismatch");
      if ((intent?.kind === "CREATE" || intent?.kind === "MODIFY") && !this.#artifacts.has(intent.sandboxArtifactId)) issues.push("patch_sandbox_artifact_binding_mismatch");
    }
    if (issues.length > 0) return this.#result("REJECTED", [...new Set(issues)].join(","), null, proposalId, [], []);
    try {
      const freshTransactions: ExecutorTransaction[] = [];
      const changes: R2GProposedChange[] = [];
      let totalBytes = 0;
      for (let index = 0; index < intents.length; index += 1) {
        const intent = intents[index];
        const baseline = this.#baselines.get(intent.relativePath)!;
        const fresh = await this.#config.repositoryExecutor.execute({ requestId: `R2G-REVALIDATE-${request.requestId}-${index + 1}`,
          tokenId: this.#config.repositoryExecutor.token.tokenId, action: "READ_FILE", resourcePath: intent.relativePath,
          observedAtEpochMs: request.observedAtEpochMs });
        freshTransactions.push(fresh);
        const baselineObservation = baseline.transaction.observation;
        const current = fresh.observation;
        const baselineAbsent = baselineObservation.status === "ABSENT";
        if (!fresh.authorization.allowed || (baselineAbsent && current.status !== "ABSENT")
          || (!baselineAbsent && (current.status !== "OBSERVED" || current.contentSha256 !== baselineObservation.contentSha256))) {
          return this.#result("STALE_REJECTED", "repository_base_changed_since_inspection", null, proposalId,
            freshTransactions.map((item) => item.observation.observationId), freshTransactions.map((item) => item.evidence.evidenceId));
        }
        if (intent.kind === "CREATE" && !baselineAbsent) return this.#result("REJECTED", "create_requires_absent_baseline", null, proposalId, [], []);
        if (intent.kind !== "CREATE" && baselineAbsent) return this.#result("REJECTED", "modify_delete_requires_existing_baseline", null, proposalId, [], []);
        let proposedContent: string | null = null;
        let proposedContentHash: string | null = null;
        let sandboxArtifactId: string | null = null;
        if (intent.kind !== "DELETE") {
          const input = this.#artifacts.get(intent.sandboxArtifactId)!;
          const [canonicalPath, content] = await Promise.all([realpath(input.artifact.canonicalPath), readFile(input.artifact.canonicalPath, "utf8")]);
          if (canonicalPath !== input.artifact.canonicalPath || sha256(content) !== input.artifact.contentHash) throw new Error("sandbox_artifact_changed_during_proposal");
          proposedContent = content; proposedContentHash = input.artifact.contentHash; sandboxArtifactId = input.artifact.artifactId;
          totalBytes += Buffer.byteLength(content, "utf8");
        }
        changes.push(Object.freeze({ kind: intent.kind, relativePath: intent.relativePath,
          expectedBaseHash: baselineObservation.contentSha256, proposedContentHash, proposedContent,
          baselineEvidenceId: baseline.transaction.evidence.evidenceId,
          baselineObservationId: baselineObservation.observationId, sandboxArtifactId }));
      }
      if (totalBytes > this.#config.maxPatchBytes) return this.#result("REJECTED", "patch_byte_limit_exceeded", null, proposalId, [], []);
      const proposalBase = { schemaVersion: 1 as const, proposalId, requestId: request.requestId,
        repositoryRoot: this.#config.repositoryExecutor.token.repositoryRoot, baseCandidateCommit: this.#config.candidateCommit,
        changes: Object.freeze(changes), applyAuthorized: false as const, rollbackRequiredBeforeApply: true as const };
      const proposal: R2GPatchProposal = Object.freeze({ ...proposalBase, proposalDigest: sha256(canonical(proposalBase)) });
      return this.#result("PROPOSED", "deterministic_patch_proposal_revalidated_against_repository_base", proposal, proposalId,
        freshTransactions.map((item) => item.observation.observationId), freshTransactions.map((item) => item.evidence.evidenceId));
    } catch (error) {
      const reason = error instanceof Error ? error.message : "patch_proposal_failed";
      this.#revoked = reason.includes("changed") || reason.includes("identity") || reason.includes("alias");
      return this.#result(this.#revoked ? "QUARANTINED" : "REJECTED", reason, null, proposalId, [], []);
    }
  }

  #result(decision: R2GProposalResult["decision"], reason: string, proposal: R2GPatchProposal | null, proposalId: string,
    observations: readonly string[], evidenceIds: readonly string[]): R2GProposalResult {
    const evidence: R2GPatchEvidence = Object.freeze({ evidenceId: `R2G-EVIDENCE-${proposalId}`, evidenceClass: "E3", proposalId,
      repositoryObservationIds: Object.freeze([...observations]), repositoryEvidenceIds: Object.freeze([...evidenceIds]),
      sandboxArtifactIds: Object.freeze(proposal?.changes.flatMap((change) => change.sandboxArtifactId ? [change.sandboxArtifactId] : []) ?? []),
      proposalDigest: proposal?.proposalDigest ?? null, result: decision === "PROPOSED" ? "PROPOSED" : decision === "STALE_REJECTED" ? "STALE" : decision === "QUARANTINED" ? "QUARANTINED" : "REJECTED",
      authorityGranted: false });
    return Object.freeze({ decision, reason, proposal, evidence, authorityGranted: false });
  }
}
