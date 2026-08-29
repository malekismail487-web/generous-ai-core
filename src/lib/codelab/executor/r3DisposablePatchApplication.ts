import { createHash } from "node:crypto";
import { chmod, lstat, open, readFile, realpath, unlink } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { ReadOnlyRepositoryExecutor } from "./readOnlyExecutor";
import type { R2AIsolatedSandboxLifecycle, R2AProvisionedSandbox } from "./r2SandboxLifecycle";
import type { R2GPatchProposal, R2GProposedChange } from "./r2PatchProposal";

export const R3_A_ISOLATED_CANDIDATE_STATUS = Object.freeze({
  chunkId: "OMEGA-R3-A-ISOLATED-001",
  securityClosure: "BLOCKED_EXTERNAL",
  maturity: "IMPLEMENTED_AND_VERIFIED_IN_ISOLATION",
  newCapability: "TRANSACTIONAL_PATCH_APPLICATION_TO_DISPOSABLE_REPOSITORY",
  candidateCapabilities: Object.freeze(["APPLY_REVIEWED_PATCH_TO_DISPOSABLE_REPOSITORY"] as const),
  unavailableCapabilities: Object.freeze(["WRITE_SOURCE_REPOSITORY", "RUN_BUILD", "RUN_TEST", "SCOPED_TERMINAL"] as const),
  forbiddenCapabilities: Object.freeze(["NETWORK", "CREDENTIAL_ACCESS", "PACKAGE_INSTALL", "DEPLOYMENT"] as const),
  authorityGranted: false,
  productionEligible: false,
} as const);

export interface R3AProcessLocalCapability {
  readonly capabilityId: string;
  readonly issuer: string;
  readonly auditIdentity: string;
  readonly issuedAtEpochMs: number;
  readonly expiresAtEpochMs: number;
}

export interface R3AFaultInjection {
  /** Test-only: fail after this many changes have been applied. */
  readonly failAfterAppliedChanges?: number;
  /** Test-only: mutate this target immediately before its use. */
  readonly alterBeforeUse?: (relativePath: string, canonicalPath: string) => Promise<void>;
}

export interface R3ADisposablePatchConfig {
  readonly executorId: string;
  readonly candidateCommit: string;
  readonly evaluatorVersion: string;
  readonly environmentIdentity: string;
  readonly authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED";
  readonly sourceRepositoryRoot: string;
  readonly sourceRepositoryExecutor: ReadOnlyRepositoryExecutor;
  readonly disposableRepositoryRoot: string;
  readonly sandbox: R2AProvisionedSandbox;
  readonly lifecycle: R2AIsolatedSandboxLifecycle;
  readonly proposal: R2GPatchProposal;
  readonly capability: R3AProcessLocalCapability;
  readonly allowedExtensions: readonly string[];
  readonly maxChanges: number;
  readonly maxPatchBytes: number;
  readonly faultInjection?: R3AFaultInjection;
}

export interface R3AApplyRequest {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly applicationId: string;
  readonly proposalId: string;
  readonly proposalDigest: string;
  readonly disposableRepositoryId: string;
  readonly sandboxId: string;
  readonly capabilityId: string;
  readonly authority: "APPLY_REVIEWED_PATCH_TO_DISPOSABLE_REPOSITORY";
  readonly issuer: string;
  readonly auditIdentity: string;
  readonly observedAtEpochMs: number;
}

export type R3AEventType =
  | "APPLICATION_REQUESTED"
  | "APPLICATION_AUTHORIZED"
  | "SOURCE_BASE_REVALIDATED"
  | "CLONE_PRESTATE_VERIFIED"
  | "CHANGE_APPLIED"
  | "CLONE_POSTSTATE_VERIFIED"
  | "APPLICATION_PROVEN"
  | "APPLICATION_REJECTED"
  | "APPLICATION_STALE"
  | "AUTOMATIC_ROLLBACK_EXECUTED"
  | "AUTOMATIC_ROLLBACK_PROVEN"
  | "APPLICATION_QUARANTINED";

export interface R3AEvent {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly eventType: R3AEventType;
  readonly requestId: string;
  readonly applicationId: string;
  readonly actorIdentity: string;
  readonly result: "REQUESTED" | "AUTHORIZED" | "VERIFIED" | "SUCCEEDED" | "DENIED" | "STALE" | "ROLLED_BACK" | "QUARANTINED";
  readonly proposalDigest: string;
  readonly stateDigest: string | null;
  readonly evidenceRef: string;
  readonly previousHash: string;
  readonly eventHash: string;
}

export interface R3AApplyResult {
  readonly decision: "APPLIED" | "STALE_REJECTED" | "REJECTED" | "ROLLED_BACK" | "QUARANTINED";
  readonly reason: string;
  readonly applicationId: string;
  readonly proposalDigest: string;
  readonly prestateDigest: string | null;
  readonly poststateDigest: string | null;
  readonly changedPaths: readonly string[];
  readonly events: readonly R3AEvent[];
  readonly evidenceClass: "E3";
  readonly sourceRepositoryMutated: false;
  readonly authorityGranted: false;
}

interface ObservedFile {
  readonly exists: boolean;
  readonly content: string | null;
  readonly hash: string | null;
  readonly mode: number | null;
  readonly identity: string | null;
}

interface PreparedChange {
  readonly change: R2GProposedChange;
  readonly canonicalPath: string;
  readonly prestate: ObservedFile;
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

function within(root: string, candidate: string): boolean {
  const delta = relative(root, candidate);
  return delta === "" || (!isAbsolute(delta) && delta !== ".." && !delta.startsWith(`..${sep}`));
}

function validRelativePath(path: unknown): path is string {
  if (typeof path !== "string" || !path.trim() || path.includes("\0") || isAbsolute(path)) return false;
  const segments = path.replace(/\\/g, "/").split("/");
  return segments.every((segment) => Boolean(segment) && segment !== "." && segment !== "..");
}

function identityOf(stats: Awaited<ReturnType<typeof lstat>>): string {
  return `${process.platform === "win32" ? "WINDOWS_FILE_ID" : "POSIX_DEVICE_INODE"}:${stats.dev.toString()}:${stats.ino.toString()}:${stats.birthtimeMs.toString()}`;
}

function proposalDigest(proposal: R2GPatchProposal): string {
  const { proposalDigest: _digest, ...base } = proposal;
  return sha256(canonical(base));
}

function stateDigest(prepared: readonly PreparedChange[], poststate = false): string {
  return sha256(canonical(prepared.map((item) => ({
    relativePath: item.change.relativePath,
    exists: poststate ? item.change.kind !== "DELETE" : item.prestate.exists,
    hash: poststate ? item.change.proposedContentHash : item.prestate.hash,
    mode: item.prestate.mode,
  }))));
}

async function observeFile(path: string): Promise<ObservedFile> {
  try {
    const stats = await lstat(path);
    if (stats.isSymbolicLink() || !stats.isFile()) throw new Error("target_not_regular_file");
    const content = await readFile(path, "utf8");
    return Object.freeze({ exists: true, content, hash: sha256(content), mode: stats.mode, identity: identityOf(stats) });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return Object.freeze({ exists: false, content: null, hash: null, mode: null, identity: null });
    }
    throw error;
  }
}

function sameState(left: ObservedFile, right: ObservedFile): boolean {
  return left.exists === right.exists && left.hash === right.hash && left.mode === right.mode
    && (!left.exists || left.identity === right.identity);
}

function matchesProposalPrestate(observed: ObservedFile, change: R2GProposedChange): boolean {
  return change.kind === "CREATE"
    ? !observed.exists && change.expectedBaseHash === null
    : observed.exists && observed.hash === change.expectedBaseHash;
}

function matchesProposalPoststate(observed: ObservedFile, change: R2GProposedChange): boolean {
  return change.kind === "DELETE"
    ? !observed.exists
    : observed.exists && observed.hash === change.proposedContentHash;
}

function appendEvent(events: R3AEvent[], input: Omit<R3AEvent, "schemaVersion" | "eventId" | "evidenceRef" | "previousHash" | "eventHash">): R3AEvent {
  const sequence = events.length + 1;
  const base: Omit<R3AEvent, "eventHash"> = {
    schemaVersion: 1,
    eventId: `R3A-${input.applicationId}-${String(sequence).padStart(2, "0")}-${input.eventType}`,
    ...input,
    evidenceRef: `r3a-local://${input.applicationId}/${String(sequence).padStart(2, "0")}/${input.eventType.toLowerCase()}`,
    previousHash: events.at(-1)?.eventHash ?? "GENESIS",
  };
  const event = Object.freeze({ ...base, eventHash: sha256(canonical(base)) });
  events.push(event);
  return event;
}

export class R3ADisposablePatchApplicator {
  readonly #config: R3ADisposablePatchConfig;
  readonly #sourceRoot: string;
  readonly #cloneRoot: string;
  readonly #disposableRepositoryId: string;
  readonly #prepared: readonly PreparedChange[];
  readonly #events: R3AEvent[] = [];
  #revoked = false;
  #used = false;

  private constructor(config: R3ADisposablePatchConfig, sourceRoot: string, cloneRoot: string,
    disposableRepositoryId: string, prepared: readonly PreparedChange[]) {
    this.#config = config;
    this.#sourceRoot = sourceRoot;
    this.#cloneRoot = cloneRoot;
    this.#disposableRepositoryId = disposableRepositoryId;
    this.#prepared = prepared;
  }

  static async create(config: R3ADisposablePatchConfig): Promise<R3ADisposablePatchApplicator> {
    if (config.authorityMode !== "ISOLATED_CANDIDATE_NOT_GRANTED") throw new Error("production_authority_not_permitted");
    if (!/^[0-9a-f]{40}$/.test(config.candidateCommit) || config.proposal.baseCandidateCommit !== config.candidateCommit) {
      throw new Error("candidate_binding_invalid");
    }
    if (!config.executorId.trim() || !config.evaluatorVersion.trim() || !config.environmentIdentity.trim()
      || !config.capability.capabilityId.trim() || !config.capability.issuer.trim() || !config.capability.auditIdentity.trim()) {
      throw new Error("isolated_candidate_identity_missing");
    }
    if (!Number.isFinite(config.capability.issuedAtEpochMs) || !Number.isFinite(config.capability.expiresAtEpochMs)
      || config.capability.expiresAtEpochMs <= config.capability.issuedAtEpochMs) throw new Error("capability_lifetime_invalid");
    if (!Number.isInteger(config.maxChanges) || config.maxChanges < 1 || !Number.isInteger(config.maxPatchBytes) || config.maxPatchBytes < 1) {
      throw new Error("patch_application_policy_invalid");
    }
    const sourceRoot = await realpath(config.sourceRepositoryRoot);
    const cloneRoot = await realpath(config.disposableRepositoryRoot);
    const sandboxRoot = await realpath(config.sandbox.canonicalPath);
    if (sourceRoot !== config.sourceRepositoryExecutor.token.repositoryRoot || sourceRoot !== config.proposal.repositoryRoot) {
      throw new Error("source_observation_authority_mismatch");
    }
    if (!config.lifecycle.ownsActiveSandbox(config.sandbox) || sandboxRoot !== config.sandbox.canonicalPath
      || !within(sandboxRoot, cloneRoot) || cloneRoot === sandboxRoot) throw new Error("disposable_repository_not_owned");
    if (within(sourceRoot, cloneRoot) || within(cloneRoot, sourceRoot)) throw new Error("source_and_disposable_repository_not_disjoint");
    const cloneStats = await lstat(cloneRoot);
    if (!cloneStats.isDirectory() || cloneStats.isSymbolicLink()) throw new Error("disposable_repository_not_directory");
    const calculatedProposalDigest = proposalDigest(config.proposal);
    if (calculatedProposalDigest !== config.proposal.proposalDigest || config.proposal.applyAuthorized !== false
      || config.proposal.rollbackRequiredBeforeApply !== true) throw new Error("proposal_integrity_invalid");
    if (config.proposal.changes.length < 1 || config.proposal.changes.length > config.maxChanges) throw new Error("patch_change_count_out_of_bounds");
    const paths = new Set<string>();
    let bytes = 0;
    const prepared: PreparedChange[] = [];
    for (const change of config.proposal.changes) {
      if (!validRelativePath(change.relativePath) || paths.has(change.relativePath)
        || !config.allowedExtensions.some((extension) => change.relativePath.endsWith(extension))) throw new Error("patch_target_invalid");
      paths.add(change.relativePath);
      if (change.kind === "DELETE") {
        if (change.proposedContent !== null || change.proposedContentHash !== null) throw new Error("delete_payload_invalid");
      } else {
        if (typeof change.proposedContent !== "string" || sha256(change.proposedContent) !== change.proposedContentHash) {
          throw new Error("proposed_content_integrity_invalid");
        }
        bytes += Buffer.byteLength(change.proposedContent, "utf8");
      }
      const target = resolve(cloneRoot, change.relativePath);
      if (!within(cloneRoot, target)) throw new Error("patch_target_escape");
      const parent = await realpath(dirname(target));
      if (!within(cloneRoot, parent)) throw new Error("patch_parent_escape");
      const parentStats = await lstat(parent);
      if (!parentStats.isDirectory() || parentStats.isSymbolicLink()) throw new Error("patch_parent_not_real_directory");
      const prestate = await observeFile(target);
      if (!matchesProposalPrestate(prestate, change)) throw new Error("disposable_repository_base_mismatch");
      prepared.push(Object.freeze({ change, canonicalPath: target, prestate }));
    }
    if (bytes > config.maxPatchBytes) throw new Error("patch_byte_limit_exceeded");
    const disposableRepositoryId = `DISPOSABLE-REPO-${sha256(canonical({ cloneRoot, identity: identityOf(cloneStats), proposal: config.proposal.proposalDigest })).slice(0, 32)}`;
    return new R3ADisposablePatchApplicator(config, sourceRoot, cloneRoot, disposableRepositoryId, Object.freeze(prepared));
  }

  disposableRepositoryId(): string {
    return this.#disposableRepositoryId;
  }

  capabilityProfile(): typeof R3_A_ISOLATED_CANDIDATE_STATUS & { readonly revoked: boolean; readonly used: boolean } {
    return Object.freeze({ ...R3_A_ISOLATED_CANDIDATE_STATUS, revoked: this.#revoked, used: this.#used });
  }

  async apply(request: R3AApplyRequest): Promise<R3AApplyResult> {
    const requestId = typeof request.requestId === "string" && request.requestId.trim() ? request.requestId : "MALFORMED";
    const applicationId = typeof request.applicationId === "string" && request.applicationId.trim() ? request.applicationId : "MALFORMED";
    appendEvent(this.#events, { eventType: "APPLICATION_REQUESTED", requestId, applicationId,
      actorIdentity: typeof request.issuer === "string" ? request.issuer : "UNKNOWN", result: "REQUESTED",
      proposalDigest: this.#config.proposal.proposalDigest, stateDigest: null });
    const issues = this.#validateRequest(request);
    if (issues.length > 0) {
      appendEvent(this.#events, { eventType: "APPLICATION_REJECTED", requestId, applicationId, actorIdentity: this.#config.executorId,
        result: "DENIED", proposalDigest: this.#config.proposal.proposalDigest, stateDigest: null });
      return this.#result("REJECTED", issues.join(","), applicationId, null, null, []);
    }
    appendEvent(this.#events, { eventType: "APPLICATION_AUTHORIZED", requestId, applicationId, actorIdentity: this.#config.executorId,
      result: "AUTHORIZED", proposalDigest: request.proposalDigest, stateDigest: null });
    const applied: PreparedChange[] = [];
    const prestate = stateDigest(this.#prepared);
    try {
      const sourceFresh = await this.#revalidateSource(request);
      if (!sourceFresh) return this.#stale(requestId, applicationId, "source_repository_base_changed_since_proposal", prestate);
      appendEvent(this.#events, { eventType: "SOURCE_BASE_REVALIDATED", requestId, applicationId, actorIdentity: this.#config.executorId,
        result: "VERIFIED", proposalDigest: request.proposalDigest, stateDigest: prestate });
      for (const item of this.#prepared) {
        const observed = await observeFile(item.canonicalPath);
        if (!sameState(observed, item.prestate)) return this.#stale(requestId, applicationId, "disposable_repository_changed_before_application", prestate);
      }
      appendEvent(this.#events, { eventType: "CLONE_PRESTATE_VERIFIED", requestId, applicationId, actorIdentity: this.#config.executorId,
        result: "VERIFIED", proposalDigest: request.proposalDigest, stateDigest: prestate });
      for (const item of this.#prepared) {
        await this.#config.faultInjection?.alterBeforeUse?.(item.change.relativePath, item.canonicalPath);
        const atUse = await observeFile(item.canonicalPath);
        if (!sameState(atUse, item.prestate)) throw new Error("target_identity_or_content_changed_at_use");
        await this.#applyChange(item);
        applied.push(item);
        const after = await observeFile(item.canonicalPath);
        if (!matchesProposalPoststate(after, item.change)) throw new Error("patch_postcondition_failed");
        appendEvent(this.#events, { eventType: "CHANGE_APPLIED", requestId, applicationId, actorIdentity: this.#config.executorId,
          result: "SUCCEEDED", proposalDigest: request.proposalDigest,
          stateDigest: sha256(canonical({ relativePath: item.change.relativePath, hash: after.hash, exists: after.exists })) });
        if (this.#config.faultInjection?.failAfterAppliedChanges === applied.length) throw new Error("induced_mid_application_failure");
      }
      const poststate = stateDigest(this.#prepared, true);
      appendEvent(this.#events, { eventType: "CLONE_POSTSTATE_VERIFIED", requestId, applicationId, actorIdentity: this.#config.executorId,
        result: "VERIFIED", proposalDigest: request.proposalDigest, stateDigest: poststate });
      appendEvent(this.#events, { eventType: "APPLICATION_PROVEN", requestId, applicationId, actorIdentity: this.#config.executorId,
        result: "VERIFIED", proposalDigest: request.proposalDigest, stateDigest: poststate });
      this.#used = true;
      return this.#result("APPLIED", "reviewed_patch_applied_to_disposable_repository", applicationId, prestate, poststate,
        this.#prepared.map((item) => item.change.relativePath));
    } catch (error) {
      const reason = error instanceof Error ? error.message : "patch_application_failed";
      if (applied.length === 0) {
        this.#revoked = reason.includes("changed") || reason.includes("identity") || reason.includes("alias");
        return this.#stale(requestId, applicationId, reason, prestate);
      }
      const restored = await this.#restore(applied);
      appendEvent(this.#events, { eventType: "AUTOMATIC_ROLLBACK_EXECUTED", requestId, applicationId, actorIdentity: this.#config.executorId,
        result: restored ? "ROLLED_BACK" : "QUARANTINED", proposalDigest: request.proposalDigest, stateDigest: restored ? prestate : null });
      if (restored) {
        appendEvent(this.#events, { eventType: "AUTOMATIC_ROLLBACK_PROVEN", requestId, applicationId, actorIdentity: this.#config.executorId,
          result: "VERIFIED", proposalDigest: request.proposalDigest, stateDigest: prestate });
        this.#used = true;
        return this.#result("ROLLED_BACK", reason, applicationId, prestate, prestate,
          applied.map((item) => item.change.relativePath));
      }
      this.#revoked = true;
      appendEvent(this.#events, { eventType: "APPLICATION_QUARANTINED", requestId, applicationId, actorIdentity: this.#config.executorId,
        result: "QUARANTINED", proposalDigest: request.proposalDigest, stateDigest: null });
      return this.#result("QUARANTINED", `${reason},automatic_rollback_failed`, applicationId, prestate, null,
        applied.map((item) => item.change.relativePath));
    }
  }

  async #revalidateSource(request: R3AApplyRequest): Promise<boolean> {
    for (const [index, item] of this.#prepared.entries()) {
      const transaction = await this.#config.sourceRepositoryExecutor.execute({
        requestId: `R3A-SOURCE-${request.requestId}-${index + 1}`,
        tokenId: this.#config.sourceRepositoryExecutor.token.tokenId,
        action: "READ_FILE",
        resourcePath: item.change.relativePath,
        observedAtEpochMs: request.observedAtEpochMs,
      });
      if (!transaction.authorization.allowed) return false;
      const observation = transaction.observation;
      if (item.change.kind === "CREATE") {
        if (observation.status !== "ABSENT") return false;
      } else if (observation.status !== "OBSERVED" || observation.contentSha256 !== item.change.expectedBaseHash) return false;
    }
    return true;
  }

  async #applyChange(item: PreparedChange): Promise<void> {
    if (item.change.kind === "CREATE") {
      const handle = await open(item.canonicalPath, "wx", 0o600);
      try { await handle.writeFile(item.change.proposedContent!); await handle.sync(); } finally { await handle.close(); }
      return;
    }
    if (item.change.kind === "DELETE") {
      await unlink(item.canonicalPath);
      return;
    }
    const handle = await open(item.canonicalPath, "r+");
    try { await handle.truncate(0); await handle.writeFile(item.change.proposedContent!); await handle.sync(); } finally { await handle.close(); }
    if (item.prestate.mode !== null) await chmod(item.canonicalPath, item.prestate.mode);
  }

  async #restore(applied: readonly PreparedChange[]): Promise<boolean> {
    try {
      for (const item of [...applied].reverse()) {
        const current = await observeFile(item.canonicalPath);
        if (!item.prestate.exists) {
          if (current.exists) await unlink(item.canonicalPath);
        } else if (!current.exists) {
          const handle = await open(item.canonicalPath, "wx", item.prestate.mode ?? 0o600);
          try { await handle.writeFile(item.prestate.content!); await handle.sync(); } finally { await handle.close(); }
        } else {
          const handle = await open(item.canonicalPath, "r+");
          try { await handle.truncate(0); await handle.writeFile(item.prestate.content!); await handle.sync(); } finally { await handle.close(); }
          if (item.prestate.mode !== null) await chmod(item.canonicalPath, item.prestate.mode);
        }
      }
      for (const item of this.#prepared) {
        const restored = await observeFile(item.canonicalPath);
        if (restored.exists !== item.prestate.exists || restored.hash !== item.prestate.hash || restored.mode !== item.prestate.mode) return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  #validateRequest(request: R3AApplyRequest): readonly string[] {
    const issues: string[] = [];
    if (this.#revoked) issues.push("patch_application_capability_revoked");
    if (this.#used) issues.push("patch_application_capability_already_used");
    if (request.schemaVersion !== 1 || typeof request.requestId !== "string" || !request.requestId.trim()
      || typeof request.applicationId !== "string" || !request.applicationId.trim()
      || typeof request.issuer !== "string" || typeof request.auditIdentity !== "string") issues.push("patch_application_request_malformed");
    if (request.authority !== "APPLY_REVIEWED_PATCH_TO_DISPOSABLE_REPOSITORY") issues.push("patch_application_authority_mismatch");
    if (request.proposalId !== this.#config.proposal.proposalId || request.proposalDigest !== this.#config.proposal.proposalDigest) {
      issues.push("patch_proposal_binding_mismatch");
    }
    if (request.disposableRepositoryId !== this.#disposableRepositoryId || request.sandboxId !== this.#config.sandbox.sandboxId) {
      issues.push("disposable_repository_binding_mismatch");
    }
    if (request.capabilityId !== this.#config.capability.capabilityId || request.issuer !== this.#config.capability.issuer
      || request.auditIdentity !== this.#config.capability.auditIdentity) issues.push("patch_application_capability_identity_mismatch");
    if (!Number.isFinite(request.observedAtEpochMs) || request.observedAtEpochMs < this.#config.capability.issuedAtEpochMs
      || request.observedAtEpochMs >= this.#config.capability.expiresAtEpochMs
      || request.observedAtEpochMs >= this.#config.sandbox.expiresAtEpochMs) issues.push("patch_application_capability_expired");
    if (!this.#config.lifecycle.ownsActiveSandbox(this.#config.sandbox)) issues.push("sandbox_not_active");
    return Object.freeze([...new Set(issues)]);
  }

  #stale(requestId: string, applicationId: string, reason: string, prestate: string): R3AApplyResult {
    this.#revoked = true;
    appendEvent(this.#events, { eventType: "APPLICATION_STALE", requestId, applicationId, actorIdentity: this.#config.executorId,
      result: "STALE", proposalDigest: this.#config.proposal.proposalDigest, stateDigest: prestate });
    return this.#result("STALE_REJECTED", reason, applicationId, prestate, null, []);
  }

  #result(decision: R3AApplyResult["decision"], reason: string, applicationId: string, prestateDigest: string | null,
    poststateDigest: string | null, changedPaths: readonly string[]): R3AApplyResult {
    return Object.freeze({ decision, reason, applicationId, proposalDigest: this.#config.proposal.proposalDigest,
      prestateDigest, poststateDigest, changedPaths: Object.freeze([...changedPaths]), events: Object.freeze([...this.#events]),
      evidenceClass: "E3", sourceRepositoryMutated: false, authorityGranted: false });
  }
}
