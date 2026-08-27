import { createHash } from "node:crypto";
import { lstat, open, readFile, realpath, unlink } from "node:fs/promises";
import { basename, isAbsolute, join, normalize } from "node:path";
import {
  type R2BCreatedArtifact,
  type R2BIsolatedContentCreator,
} from "./r2SandboxContent";
import {
  type R2AIsolatedSandboxLifecycle,
  type R2AOperationResult,
  type R2AProvisionedSandbox,
  type R2ATerminationRequest,
} from "./r2SandboxLifecycle";
import type { CanonicalTargetIdentity } from "./r2ProvisioningBlueprint";

export const R2_E_ISOLATED_CANDIDATE_STATUS = Object.freeze({
  chunkId: "OMEGA-R2-E-ISOLATED-001",
  securityClosure: "BLOCKED_EXTERNAL",
  maturity: "IMPLEMENTED_AND_VERIFIED_IN_ISOLATION",
  newCapability: "ATOMIC_BOUNDED_SANDBOX_TRANSACTION",
  candidateCapabilities: Object.freeze(["PREPARE_SANDBOX_TRANSACTION", "COMMIT_SANDBOX_TRANSACTION", "ABORT_SANDBOX_TRANSACTION"] as const),
  unavailableCapabilities: Object.freeze(["ROLLBACK_COMMITTED_TRANSACTION", "PROPOSE_REPOSITORY_PATCH", "APPLY_PATCH", "WRITE_SANDBOX"] as const),
  forbiddenCapabilities: Object.freeze(["WRITE_REPOSITORY", "SHELL", "NETWORK", "CREDENTIAL_ACCESS", "PACKAGE_INSTALL", "DEPLOYMENT"] as const),
  authorityGranted: false,
  productionEligible: false,
} as const);

export interface R2EProcessLocalCapability {
  readonly capabilityId: string;
  readonly issuer: string;
  readonly auditIdentity: string;
  readonly issuedAtEpochMs: number;
  readonly expiresAtEpochMs: number;
}

export interface R2EOwnedInput {
  readonly predecessor: R2BIsolatedContentCreator;
  readonly artifact: R2BCreatedArtifact;
}

export interface R2EFaultInjection {
  readonly failAfterOperationIndex?: number;
  readonly failRollbackForRelativePath?: string;
  readonly failExplicitRollbackForRelativePath?: string;
}

export interface R2EIsolatedTransactionConfig {
  readonly executorId: string;
  readonly candidateCommit: string;
  readonly evaluatorVersion: string;
  readonly environmentIdentity: string;
  readonly authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED";
  readonly sandbox: R2AProvisionedSandbox;
  readonly lifecycle: R2AIsolatedSandboxLifecycle;
  readonly ownedInputs: readonly R2EOwnedInput[];
  readonly capability: R2EProcessLocalCapability;
  readonly maxOperations: number;
  readonly maxTotalBytes: number;
  readonly allowedExtensions: readonly string[];
  readonly faultInjection?: R2EFaultInjection;
}

export type R2ETransactionOperation =
  | { readonly kind: "CREATE"; readonly relativePath: string; readonly content: string }
  | { readonly kind: "MODIFY"; readonly relativePath: string; readonly expectedBaseHash: string; readonly replacementContent: string }
  | { readonly kind: "DELETE"; readonly relativePath: string; readonly expectedBaseHash: string };

export interface R2EPrepareRequest {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly transactionId: string;
  readonly sandboxId: string;
  readonly capabilityId: string;
  readonly authority: "PREPARE_SANDBOX_TRANSACTION";
  readonly operations: readonly R2ETransactionOperation[];
  readonly issuer: string;
  readonly auditIdentity: string;
  readonly observedAtEpochMs: number;
}

export interface R2ECommitRequest {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly transactionId: string;
  readonly sandboxId: string;
  readonly capabilityId: string;
  readonly authority: "COMMIT_SANDBOX_TRANSACTION";
  readonly issuer: string;
  readonly auditIdentity: string;
  readonly observedAtEpochMs: number;
}

export interface R2EPreparedOperation {
  readonly kind: R2ETransactionOperation["kind"];
  readonly relativePath: string;
  readonly baseHash: string | null;
  readonly resultHash: string | null;
  readonly byteLength: number;
}

export interface R2EPreparedTransaction {
  readonly transactionId: string;
  readonly requestId: string;
  readonly sandboxId: string;
  readonly operationDigest: string;
  readonly operations: readonly R2EPreparedOperation[];
  readonly preparedAtEpochMs: number;
}

export interface R2ECommittedTransaction extends R2EPreparedTransaction {
  readonly commitRequestId: string;
  readonly committedAtEpochMs: number;
  readonly poststateDigest: string;
}

export type R2ETransactionEventType =
  | "TRANSACTION_PREPARE_REQUEST"
  | "TRANSACTION_AUTHORIZATION"
  | "TRANSACTION_PRECONDITION"
  | "TRANSACTION_PREPARED"
  | "TRANSACTION_COMMIT_REQUEST"
  | "TRANSACTION_OPERATION"
  | "TRANSACTION_POSTCONDITION"
  | "TRANSACTION_COMMITTED"
  | "TRANSACTION_ABORTED"
  | "TRANSACTION_PRESTATE_RESTORED"
  | "TRANSACTION_QUARANTINED"
  | "TRANSACTION_CONTENT_CLEANUP"
  | "TRANSACTION_CAPABILITY_REVOCATION";

export interface R2ETransactionEvent {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly eventType: R2ETransactionEventType;
  readonly requestId: string;
  readonly transactionId: string;
  readonly actorIdentity: string;
  readonly authority: "PREPARE_SANDBOX_TRANSACTION" | "COMMIT_SANDBOX_TRANSACTION" | "TRUSTED_LIFECYCLE_CLEANUP";
  readonly resourceIdentity: string;
  readonly result: "REQUESTED" | "AUTHORIZED" | "DENIED" | "VERIFIED" | "SUCCEEDED" | "ABORTED" | "RESTORED" | "QUARANTINED" | "REVOKED";
  readonly operationDigest: string | null;
  readonly evidenceRef: string;
  readonly previousHash: string;
  readonly eventHash: string;
}

export interface R2EPrepareResult {
  readonly decision: "PREPARED" | "STALE_REJECTED" | "REJECTED" | "QUARANTINED";
  readonly reason: string;
  readonly transaction: R2EPreparedTransaction | null;
  readonly events: readonly R2ETransactionEvent[];
  readonly evidenceClass: "E3";
  readonly authorityGranted: false;
}

export interface R2ECommitResult {
  readonly decision: "COMMITTED" | "ABORTED_RESTORED" | "STALE_REJECTED" | "REJECTED" | "QUARANTINED";
  readonly reason: string;
  readonly transaction: R2ECommittedTransaction | null;
  readonly events: readonly R2ETransactionEvent[];
  readonly evidenceClass: "E3";
  readonly authorityGranted: false;
}

export interface R2ETerminationResult {
  readonly decision: "TERMINATED" | "REJECTED" | "QUARANTINED";
  readonly reason: string;
  readonly transactionEvents: readonly R2ETransactionEvent[];
  readonly lifecycleResult: R2AOperationResult | null;
  readonly evidenceClass: "E3";
  readonly authorityGranted: false;
}

export interface R2ERollbackLease {
  readonly leaseId: string;
  readonly transactionId: string;
  readonly sandboxId: string;
  readonly consumerIdentity: string;
  readonly committedPoststateDigest: string;
}

export interface R2ERecoveryResult {
  readonly decision: "RESTORED" | "STALE_REJECTED" | "REJECTED" | "QUARANTINED";
  readonly reason: string;
  readonly prestateDigest: string | null;
  readonly evidenceClass: "E3";
  readonly authorityGranted: false;
}

interface ObservedFile {
  readonly exists: boolean;
  readonly identity: CanonicalTargetIdentity | null;
  readonly content: Buffer | null;
  readonly hash: string | null;
}

interface PrivatePreparedOperation extends R2EPreparedOperation {
  readonly canonicalPath: string;
  readonly requestedContent: Buffer | null;
  readonly prestate: ObservedFile;
}

interface PrivatePreparedTransaction {
  readonly publicRecord: R2EPreparedTransaction;
  readonly operations: readonly PrivatePreparedOperation[];
}

interface PrivateCommittedTransaction {
  readonly publicRecord: R2ECommittedTransaction;
  readonly prestateOperations: readonly PrivatePreparedOperation[];
  readonly poststates: ReadonlyMap<string, ObservedFile>;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

function sha256(content: Uint8Array | string): string {
  return createHash("sha256").update(content).digest("hex");
}

function identityKey(identity: CanonicalTargetIdentity): string {
  return `${identity.identityScheme}:${identity.volumeOrDevice}:${identity.objectId}`;
}

function sameIdentity(left: CanonicalTargetIdentity | null, right: CanonicalTargetIdentity | null): boolean {
  return left !== null && right !== null && identityKey(left) === identityKey(right);
}

function errorCode(error: unknown): string | null {
  if (error === null || typeof error !== "object" || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

async function observeIdentity(path: string, observedAtEpochMs: number): Promise<CanonicalTargetIdentity> {
  const stats = await lstat(path, { bigint: true });
  if (stats.isSymbolicLink()) throw new Error("filesystem_alias_not_allowed");
  return {
    identityScheme: process.platform === "win32" ? "WINDOWS_FILE_ID" : "POSIX_DEVICE_INODE",
    volumeOrDevice: stats.dev.toString(), objectId: `${stats.ino.toString()}:${stats.birthtimeNs.toString()}`, observedAtEpochMs,
  };
}

async function observeFile(path: string, observedAtEpochMs: number): Promise<ObservedFile> {
  try {
    const [canonicalPath, identity, content] = await Promise.all([realpath(path), observeIdentity(path, observedAtEpochMs), readFile(path)]);
    if (canonicalPath !== path) throw new Error("transaction_target_alias_not_allowed");
    return { exists: true, identity, content, hash: sha256(content) };
  } catch (error) {
    if (errorCode(error) === "ENOENT") return { exists: false, identity: null, content: null, hash: null };
    throw error;
  }
}

function appendEvent(events: R2ETransactionEvent[], input: Omit<R2ETransactionEvent, "schemaVersion" | "eventId" | "previousHash" | "eventHash" | "evidenceRef">): R2ETransactionEvent {
  const sequence = events.length + 1;
  const base: Omit<R2ETransactionEvent, "eventHash"> = {
    schemaVersion: 1, eventId: `R2E-${input.transactionId}-${String(sequence).padStart(2, "0")}-${input.eventType}`,
    ...input, evidenceRef: `r2e-local://${input.transactionId}/${String(sequence).padStart(2, "0")}/${input.eventType.toLowerCase()}`,
    previousHash: events.at(-1)?.eventHash ?? "GENESIS",
  };
  const event = Object.freeze({ ...base, eventHash: sha256(canonical(base)) });
  events.push(event);
  return event;
}

export class R2EIsolatedTransactionEngine {
  readonly #config: R2EIsolatedTransactionConfig;
  readonly #ownedByPath: ReadonlyMap<string, R2BCreatedArtifact>;
  readonly #events: R2ETransactionEvent[] = [];
  #prepared: PrivatePreparedTransaction | null = null;
  #committed: PrivateCommittedTransaction | null = null;
  #rollbackLease: R2ERollbackLease | null = null;
  #rolledBack = false;
  #revoked = false;

  private constructor(config: R2EIsolatedTransactionConfig, ownedByPath: ReadonlyMap<string, R2BCreatedArtifact>) {
    this.#config = config;
    this.#ownedByPath = ownedByPath;
  }

  static async create(config: R2EIsolatedTransactionConfig, observedAtEpochMs = Date.now()): Promise<R2EIsolatedTransactionEngine> {
    if (config.authorityMode !== "ISOLATED_CANDIDATE_NOT_GRANTED") throw new Error("production_authority_not_permitted");
    if (!/^[0-9a-f]{40}$/.test(config.candidateCommit)) throw new Error("candidate_commit_must_be_exact");
    if (!config.executorId.trim() || !config.evaluatorVersion.trim() || !config.environmentIdentity.trim()
      || !config.capability.capabilityId.trim() || !config.capability.issuer.trim() || !config.capability.auditIdentity.trim()) {
      throw new Error("isolated_candidate_identity_missing");
    }
    if (!Number.isInteger(config.maxOperations) || config.maxOperations < 1 || !Number.isInteger(config.maxTotalBytes)
      || config.maxTotalBytes < 1 || config.allowedExtensions.length === 0) throw new Error("transaction_policy_invalid");
    if (config.ownedInputs.length > config.maxOperations) throw new Error("owned_input_count_exceeds_policy");
    if (!Number.isFinite(config.capability.issuedAtEpochMs) || !Number.isFinite(config.capability.expiresAtEpochMs)
      || config.capability.expiresAtEpochMs <= config.capability.issuedAtEpochMs) throw new Error("capability_lifetime_invalid");
    if (!config.lifecycle.ownsActiveSandbox(config.sandbox) || observedAtEpochMs >= config.sandbox.expiresAtEpochMs) throw new Error("sandbox_not_active");
    const canonicalSandbox = await realpath(config.sandbox.canonicalPath);
    if (canonicalSandbox !== config.sandbox.canonicalPath) throw new Error("sandbox_canonical_path_changed");
    const owned = new Map<string, R2BCreatedArtifact>();
    for (const input of config.ownedInputs) {
      const name = basename(input.artifact.canonicalPath);
      if (owned.has(name) || join(config.sandbox.canonicalPath, name) !== input.artifact.canonicalPath) throw new Error("owned_input_path_invalid_or_duplicate");
      const observed = await observeFile(input.artifact.canonicalPath, observedAtEpochMs);
      if (!observed.exists || !sameIdentity(observed.identity, input.artifact.objectIdentity) || observed.hash !== input.artifact.contentHash) {
        throw new Error("owned_input_observation_mismatch");
      }
      if (!input.predecessor.transferOwnedArtifactToTransaction(input.artifact)) throw new Error("owned_input_transfer_rejected");
      owned.set(name, input.artifact);
    }
    return new R2EIsolatedTransactionEngine(config, owned);
  }

  capabilityProfile(): typeof R2_E_ISOLATED_CANDIDATE_STATUS & { readonly revoked: boolean; readonly prepared: boolean; readonly committed: boolean } {
    return Object.freeze({ ...R2_E_ISOLATED_CANDIDATE_STATUS, revoked: this.#revoked, prepared: this.#prepared !== null, committed: this.#committed !== null });
  }

  transferCommittedTransactionToRollback(transaction: R2ECommittedTransaction, consumerIdentity: string): R2ERollbackLease | null {
    if (this.#revoked || this.#rolledBack || this.#rollbackLease || !this.#committed || !consumerIdentity.trim()) return null;
    const expected = this.#committed.publicRecord;
    if (transaction.transactionId !== expected.transactionId || transaction.poststateDigest !== expected.poststateDigest
      || transaction.commitRequestId !== expected.commitRequestId || transaction.operationDigest !== expected.operationDigest
      || !this.#config.lifecycle.ownsActiveSandbox(this.#config.sandbox)) return null;
    this.#rollbackLease = Object.freeze({
      leaseId: `rollback-lease://${this.#config.capability.capabilityId}/${transaction.transactionId}/${sha256(consumerIdentity).slice(0, 16)}`,
      transactionId: transaction.transactionId,
      sandboxId: this.#config.sandbox.sandboxId,
      consumerIdentity,
      committedPoststateDigest: transaction.poststateDigest,
    });
    return this.#rollbackLease;
  }

  ownsRollbackLease(lease: R2ERollbackLease, consumerIdentity: string): boolean {
    return !this.#revoked && !this.#rolledBack && this.#rollbackLease !== null
      && lease.leaseId === this.#rollbackLease.leaseId && lease.transactionId === this.#rollbackLease.transactionId
      && lease.sandboxId === this.#rollbackLease.sandboxId && lease.committedPoststateDigest === this.#rollbackLease.committedPoststateDigest
      && consumerIdentity === this.#rollbackLease.consumerIdentity && this.#config.lifecycle.ownsActiveSandbox(this.#config.sandbox);
  }

  async executeAuthorizedRecovery(lease: R2ERollbackLease, consumerIdentity: string, observedAtEpochMs: number): Promise<R2ERecoveryResult> {
    if (!this.ownsRollbackLease(lease, consumerIdentity) || !this.#committed) {
      return Object.freeze({ decision: "REJECTED", reason: "rollback_lease_not_owned", prestateDigest: null, evidenceClass: "E3", authorityGranted: false });
    }
    try {
      for (const operation of this.#committed.prestateOperations) {
        const expected = this.#committed.poststates.get(operation.relativePath)!;
        const observed = await observeFile(operation.canonicalPath, observedAtEpochMs);
        if (expected.exists !== observed.exists || (expected.exists
          && (!sameIdentity(expected.identity, observed.identity) || expected.hash !== observed.hash))) {
          this.#revoked = true;
          return Object.freeze({ decision: "STALE_REJECTED", reason: "committed_poststate_diverged_external_state_preserved",
            prestateDigest: null, evidenceClass: "E3", authorityGranted: false });
        }
      }
      for (const operation of [...this.#committed.prestateOperations].reverse()) {
        if (this.#config.faultInjection?.failExplicitRollbackForRelativePath === operation.relativePath) throw new Error("induced_explicit_rollback_failure");
        const current = await observeFile(operation.canonicalPath, observedAtEpochMs);
        if (!operation.prestate.exists) {
          if (!current.exists || !sameIdentity(current.identity, this.#committed.poststates.get(operation.relativePath)!.identity)
            || current.hash !== this.#committed.poststates.get(operation.relativePath)!.hash) throw new Error("created_artifact_changed_during_rollback");
          await unlink(operation.canonicalPath);
        } else if (!current.exists) {
          const handle = await open(operation.canonicalPath, "wx", 0o600);
          await handle.writeFile(operation.prestate.content!); await handle.sync(); await handle.close();
        } else {
          const handle = await open(operation.canonicalPath, "r+");
          const stats = await handle.stat({ bigint: true });
          const handleIdentity: CanonicalTargetIdentity = {
            identityScheme: process.platform === "win32" ? "WINDOWS_FILE_ID" : "POSIX_DEVICE_INODE",
            volumeOrDevice: stats.dev.toString(), objectId: `${stats.ino.toString()}:${stats.birthtimeNs.toString()}`, observedAtEpochMs,
          };
          if (!sameIdentity(handleIdentity, current.identity)) { await handle.close(); throw new Error("rollback_target_identity_changed"); }
          await handle.truncate(0); await handle.writeFile(operation.prestate.content!); await handle.sync(); await handle.close();
        }
      }
      const proof = [];
      for (const operation of this.#committed.prestateOperations) {
        const observed = await observeFile(operation.canonicalPath, observedAtEpochMs);
        if (operation.prestate.exists !== observed.exists || (observed.exists && observed.hash !== operation.prestate.hash)) {
          throw new Error("rollback_postcondition_failed");
        }
        proof.push({ relativePath: operation.relativePath, exists: observed.exists, hash: observed.hash });
      }
      const prestateDigest = sha256(canonical(proof));
      this.#rolledBack = true;
      return Object.freeze({ decision: "RESTORED", reason: "committed_transaction_prestate_restored_and_verified",
        prestateDigest, evidenceClass: "E3", authorityGranted: false });
    } catch (error) {
      this.#revoked = true;
      return Object.freeze({ decision: "QUARANTINED", reason: error instanceof Error ? error.message : "explicit_rollback_failed",
        prestateDigest: null, evidenceClass: "E3", authorityGranted: false });
    }
  }

  async terminateAfterAuthorizedRecovery(lease: R2ERollbackLease, consumerIdentity: string, request: R2ATerminationRequest): Promise<R2ETerminationResult> {
    if (this.#revoked || !this.#rolledBack || !this.#rollbackLease || lease.leaseId !== this.#rollbackLease.leaseId
      || consumerIdentity !== this.#rollbackLease.consumerIdentity || !this.#committed) {
      return this.#terminationResult("REJECTED", "no_verified_recovery_owned_by_consumer", null);
    }
    if (!this.#config.lifecycle.authorizesTermination(request, this.#config.sandbox)) return this.#terminationResult("REJECTED", "sandbox_termination_binding_mismatch", null);
    try {
      for (const operation of this.#committed.prestateOperations) {
        const observed = await observeFile(operation.canonicalPath, request.observedAtEpochMs);
        if (operation.prestate.exists !== observed.exists || (observed.exists && observed.hash !== operation.prestate.hash)) {
          throw new Error("recovered_prestate_changed_before_cleanup");
        }
      }
      for (const operation of this.#committed.prestateOperations) {
        const observed = await observeFile(operation.canonicalPath, request.observedAtEpochMs);
        if (observed.exists) await unlink(operation.canonicalPath);
      }
      this.#revoked = true;
      const lifecycleResult = await this.#config.lifecycle.terminate(request);
      return this.#terminationResult(lifecycleResult.decision === "TERMINATED" ? "TERMINATED" : "QUARANTINED",
        lifecycleResult.decision === "TERMINATED" ? "recovered_content_and_sandbox_cleanup_verified" : `sandbox_cleanup_${lifecycleResult.reason}`, lifecycleResult);
    } catch (error) {
      this.#revoked = true;
      return this.#terminationResult("QUARANTINED", error instanceof Error ? error.message : "recovered_cleanup_failed", null);
    }
  }

  async prepare(request: R2EPrepareRequest): Promise<R2EPrepareResult> {
    const requestId = typeof request.requestId === "string" && request.requestId.trim() ? request.requestId : "MALFORMED";
    const transactionId = typeof request.transactionId === "string" && request.transactionId.trim() ? request.transactionId : "MALFORMED";
    appendEvent(this.#events, { eventType: "TRANSACTION_PREPARE_REQUEST", requestId, transactionId,
      actorIdentity: typeof request.issuer === "string" && request.issuer ? request.issuer : "UNKNOWN",
      authority: "PREPARE_SANDBOX_TRANSACTION", resourceIdentity: this.#config.sandbox.canonicalPath,
      result: "REQUESTED", operationDigest: null });
    const issues = this.#validateCommon(request, "PREPARE_SANDBOX_TRANSACTION");
    const operations = Array.isArray(request.operations) ? request.operations : [];
    if (this.#prepared || this.#committed) issues.push("transaction_engine_single_use");
    if (operations.length < 1 || operations.length > this.#config.maxOperations) issues.push("operation_count_out_of_bounds");
    const paths = operations.map((operation) => typeof operation?.relativePath === "string" ? operation.relativePath : "");
    if (new Set(paths).size !== paths.length) issues.push("duplicate_transaction_target");
    let totalBytes = 0;
    for (const operation of operations) {
      if (!operation || !this.#validRelativePath(operation.relativePath)) issues.push("transaction_target_invalid");
      if (operation?.kind === "CREATE") totalBytes += Buffer.byteLength(typeof operation.content === "string" ? operation.content : "", "utf8");
      else if (operation?.kind === "MODIFY") totalBytes += Buffer.byteLength(typeof operation.replacementContent === "string" ? operation.replacementContent : "", "utf8");
      else if (operation?.kind !== "DELETE") issues.push("transaction_operation_malformed");
    }
    if (totalBytes > this.#config.maxTotalBytes) issues.push("transaction_byte_limit_exceeded");
    if (issues.length > 0) {
      appendEvent(this.#events, { eventType: "TRANSACTION_AUTHORIZATION", requestId, transactionId, actorIdentity: this.#config.executorId,
        authority: "PREPARE_SANDBOX_TRANSACTION", resourceIdentity: this.#config.sandbox.canonicalPath,
        result: "DENIED", operationDigest: null });
      return this.#prepareResult("REJECTED", [...new Set(issues)].join(","), null);
    }
    appendEvent(this.#events, { eventType: "TRANSACTION_AUTHORIZATION", requestId, transactionId, actorIdentity: this.#config.executorId,
      authority: "PREPARE_SANDBOX_TRANSACTION", resourceIdentity: this.#config.sandbox.canonicalPath,
      result: "AUTHORIZED", operationDigest: null });
    try {
      const privateOperations: PrivatePreparedOperation[] = [];
      let stale = false;
      for (const operation of operations) {
        const path = join(this.#config.sandbox.canonicalPath, operation.relativePath);
        const observed = await observeFile(path, request.observedAtEpochMs);
        const owned = this.#ownedByPath.get(operation.relativePath);
        let baseHash: string | null = null;
        let resultHash: string | null = null;
        let requestedContent: Buffer | null = null;
        let byteLength = 0;
        if (operation.kind === "CREATE") {
          requestedContent = Buffer.from(operation.content, "utf8"); resultHash = sha256(requestedContent); byteLength = requestedContent.byteLength;
          if (observed.exists) stale = true;
        } else {
          baseHash = operation.expectedBaseHash;
          if (!owned || !observed.exists || !sameIdentity(observed.identity, owned.objectIdentity)
            || observed.hash !== operation.expectedBaseHash || observed.hash !== owned.contentHash) stale = true;
          if (operation.kind === "MODIFY") {
            requestedContent = Buffer.from(operation.replacementContent, "utf8"); resultHash = sha256(requestedContent); byteLength = requestedContent.byteLength;
          } else byteLength = observed.content?.byteLength ?? 0;
        }
        privateOperations.push({ kind: operation.kind, relativePath: operation.relativePath, canonicalPath: path,
          baseHash, resultHash, byteLength, requestedContent, prestate: observed });
        appendEvent(this.#events, { eventType: "TRANSACTION_PRECONDITION", requestId, transactionId,
          actorIdentity: this.#config.executorId, authority: "PREPARE_SANDBOX_TRANSACTION", resourceIdentity: path,
          result: stale ? "DENIED" : "VERIFIED", operationDigest: baseHash ?? resultHash });
      }
      if (stale) return this.#prepareResult("STALE_REJECTED", "one_or_more_transaction_preconditions_stale", null);
      const publicOperations = Object.freeze(privateOperations.map(({ canonicalPath: _path, requestedContent: _content, prestate: _prestate, ...operation }) => Object.freeze(operation)));
      const operationDigest = sha256(canonical(publicOperations));
      const publicRecord: R2EPreparedTransaction = Object.freeze({ transactionId, requestId, sandboxId: request.sandboxId,
        operationDigest, operations: publicOperations, preparedAtEpochMs: request.observedAtEpochMs });
      this.#prepared = { publicRecord, operations: privateOperations };
      appendEvent(this.#events, { eventType: "TRANSACTION_PREPARED", requestId, transactionId, actorIdentity: this.#config.executorId,
        authority: "PREPARE_SANDBOX_TRANSACTION", resourceIdentity: this.#config.sandbox.canonicalPath,
        result: "VERIFIED", operationDigest });
      return this.#prepareResult("PREPARED", "all_transaction_preconditions_verified_before_commit", publicRecord);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "transaction_prepare_failed";
      this.#revoked = reason.includes("alias") || reason.includes("identity");
      return this.#prepareResult(this.#revoked ? "QUARANTINED" : "REJECTED", reason, null);
    }
  }

  async commit(request: R2ECommitRequest): Promise<R2ECommitResult> {
    const requestId = typeof request.requestId === "string" && request.requestId.trim() ? request.requestId : "MALFORMED";
    const transactionId = typeof request.transactionId === "string" && request.transactionId.trim() ? request.transactionId : "MALFORMED";
    appendEvent(this.#events, { eventType: "TRANSACTION_COMMIT_REQUEST", requestId, transactionId,
      actorIdentity: typeof request.issuer === "string" && request.issuer ? request.issuer : "UNKNOWN",
      authority: "COMMIT_SANDBOX_TRANSACTION", resourceIdentity: this.#config.sandbox.canonicalPath,
      result: "REQUESTED", operationDigest: this.#prepared?.publicRecord.operationDigest ?? null });
    const issues = this.#validateCommon(request, "COMMIT_SANDBOX_TRANSACTION");
    if (!this.#prepared) issues.push("no_prepared_transaction");
    if (request.transactionId !== this.#prepared?.publicRecord.transactionId) issues.push("transaction_binding_mismatch");
    if (this.#committed) issues.push("transaction_already_committed");
    if (issues.length > 0) return this.#commitResult("REJECTED", [...new Set(issues)].join(","), null);
    const prepared = this.#prepared!;
    try {
      for (const operation of prepared.operations) {
        const observed = await observeFile(operation.canonicalPath, request.observedAtEpochMs);
        if (operation.prestate.exists !== observed.exists || (observed.exists
          && (!sameIdentity(observed.identity, operation.prestate.identity) || observed.hash !== operation.prestate.hash))) {
          return this.#commitResult("STALE_REJECTED", "prepared_prestate_changed_before_commit", null);
        }
      }
      const poststates = new Map<string, ObservedFile>();
      for (let index = 0; index < prepared.operations.length; index += 1) {
        const operation = prepared.operations[index];
        await this.#applyOperation(operation);
        const poststate = await observeFile(operation.canonicalPath, request.observedAtEpochMs);
        poststates.set(operation.relativePath, poststate);
        appendEvent(this.#events, { eventType: "TRANSACTION_OPERATION", requestId, transactionId,
          actorIdentity: this.#config.executorId, authority: "COMMIT_SANDBOX_TRANSACTION", resourceIdentity: operation.canonicalPath,
          result: "SUCCEEDED", operationDigest: operation.resultHash ?? operation.baseHash });
        if (this.#config.faultInjection?.failAfterOperationIndex === index) throw new Error(`induced_failure_after_operation_${index}`);
      }
      for (const operation of prepared.operations) {
        const observed = poststates.get(operation.relativePath)!;
        const expectedExists = operation.kind !== "DELETE";
        const expectedHash = operation.kind === "DELETE" ? null : operation.resultHash;
        if (observed.exists !== expectedExists || observed.hash !== expectedHash) throw new Error("transaction_postcondition_failed");
        appendEvent(this.#events, { eventType: "TRANSACTION_POSTCONDITION", requestId, transactionId,
          actorIdentity: this.#config.executorId, authority: "COMMIT_SANDBOX_TRANSACTION", resourceIdentity: operation.canonicalPath,
          result: "VERIFIED", operationDigest: expectedHash });
      }
      const poststateDigest = sha256(canonical([...poststates.entries()].map(([path, state]) => ({ path, exists: state.exists,
        identity: state.identity ? identityKey(state.identity) : null, hash: state.hash }))));
      const publicRecord: R2ECommittedTransaction = Object.freeze({ ...prepared.publicRecord, commitRequestId: request.requestId,
        committedAtEpochMs: request.observedAtEpochMs, poststateDigest });
      this.#committed = { publicRecord, prestateOperations: prepared.operations, poststates };
      appendEvent(this.#events, { eventType: "TRANSACTION_COMMITTED", requestId, transactionId,
        actorIdentity: this.#config.executorId, authority: "COMMIT_SANDBOX_TRANSACTION", resourceIdentity: this.#config.sandbox.canonicalPath,
        result: "VERIFIED", operationDigest: poststateDigest });
      return this.#commitResult("COMMITTED", "bounded_transaction_committed_and_postconditions_verified", publicRecord);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "transaction_commit_failed";
      appendEvent(this.#events, { eventType: "TRANSACTION_ABORTED", requestId, transactionId,
        actorIdentity: this.#config.executorId, authority: "COMMIT_SANDBOX_TRANSACTION", resourceIdentity: this.#config.sandbox.canonicalPath,
        result: "ABORTED", operationDigest: prepared.publicRecord.operationDigest });
      const restored = await this.#restorePreparedPrestate(prepared.operations, request.observedAtEpochMs);
      if (!restored) {
        this.#revoked = true;
        appendEvent(this.#events, { eventType: "TRANSACTION_QUARANTINED", requestId, transactionId,
          actorIdentity: this.#config.executorId, authority: "COMMIT_SANDBOX_TRANSACTION", resourceIdentity: this.#config.sandbox.canonicalPath,
          result: "QUARANTINED", operationDigest: prepared.publicRecord.operationDigest });
        return this.#commitResult("QUARANTINED", `${reason};prestate_restoration_unverified`, null);
      }
      appendEvent(this.#events, { eventType: "TRANSACTION_PRESTATE_RESTORED", requestId, transactionId,
        actorIdentity: this.#config.executorId, authority: "COMMIT_SANDBOX_TRANSACTION", resourceIdentity: this.#config.sandbox.canonicalPath,
        result: "RESTORED", operationDigest: prepared.publicRecord.operationDigest });
      this.#revoked = true;
      return this.#commitResult("ABORTED_RESTORED", `${reason};prestate_restoration_verified`, null);
    }
  }

  async terminateWithOwnedCleanup(request: R2ATerminationRequest): Promise<R2ETerminationResult> {
    if (this.#revoked || !this.#committed) return this.#terminationResult("REJECTED", "no_active_committed_transaction", null);
    if (!this.#config.lifecycle.authorizesTermination(request, this.#config.sandbox)) return this.#terminationResult("REJECTED", "sandbox_termination_binding_mismatch", null);
    try {
      for (const operation of this.#committed.prestateOperations) {
        const expected = this.#committed.poststates.get(operation.relativePath)!;
        const observed = await observeFile(operation.canonicalPath, request.observedAtEpochMs);
        if (expected.exists !== observed.exists || (expected.exists
          && (!sameIdentity(expected.identity, observed.identity) || expected.hash !== observed.hash))) throw new Error("transaction_poststate_changed_before_cleanup");
      }
      for (const operation of this.#committed.prestateOperations) {
        const observed = await observeFile(operation.canonicalPath, request.observedAtEpochMs);
        if (observed.exists) await unlink(operation.canonicalPath);
      }
      appendEvent(this.#events, { eventType: "TRANSACTION_CONTENT_CLEANUP", requestId: request.requestId,
        transactionId: this.#committed.publicRecord.transactionId, actorIdentity: this.#config.executorId,
        authority: "TRUSTED_LIFECYCLE_CLEANUP", resourceIdentity: this.#config.sandbox.canonicalPath,
        result: "VERIFIED", operationDigest: this.#committed.publicRecord.poststateDigest });
      this.#revoked = true;
      appendEvent(this.#events, { eventType: "TRANSACTION_CAPABILITY_REVOCATION", requestId: request.requestId,
        transactionId: this.#committed.publicRecord.transactionId, actorIdentity: this.#config.executorId,
        authority: "TRUSTED_LIFECYCLE_CLEANUP", resourceIdentity: this.#config.sandbox.canonicalPath,
        result: "REVOKED", operationDigest: this.#committed.publicRecord.poststateDigest });
      const lifecycleResult = await this.#config.lifecycle.terminate(request);
      return this.#terminationResult(lifecycleResult.decision === "TERMINATED" ? "TERMINATED" : "QUARANTINED",
        lifecycleResult.decision === "TERMINATED" ? "transaction_content_and_sandbox_cleanup_verified" : `sandbox_cleanup_${lifecycleResult.reason}`,
        lifecycleResult);
    } catch (error) {
      this.#revoked = true;
      return this.#terminationResult("QUARANTINED", error instanceof Error ? error.message : "transaction_cleanup_failed", null);
    }
  }

  async #applyOperation(operation: PrivatePreparedOperation): Promise<void> {
    if (operation.kind === "CREATE") {
      const handle = await open(operation.canonicalPath, "wx", 0o600);
      await handle.writeFile(operation.requestedContent!); await handle.sync(); await handle.close();
    } else if (operation.kind === "MODIFY") {
      const handle = await open(operation.canonicalPath, "r+");
      await handle.truncate(0); await handle.writeFile(operation.requestedContent!); await handle.sync(); await handle.close();
    } else await unlink(operation.canonicalPath);
  }

  async #restorePreparedPrestate(operations: readonly PrivatePreparedOperation[], observedAtEpochMs: number): Promise<boolean> {
    try {
      for (const operation of [...operations].reverse()) {
        if (this.#config.faultInjection?.failRollbackForRelativePath === operation.relativePath) throw new Error("induced_rollback_failure");
        const current = await observeFile(operation.canonicalPath, observedAtEpochMs);
        if (!operation.prestate.exists) {
          if (current.exists) await unlink(operation.canonicalPath);
        } else if (!current.exists) {
          const handle = await open(operation.canonicalPath, "wx", 0o600);
          await handle.writeFile(operation.prestate.content!); await handle.sync(); await handle.close();
        } else {
          const handle = await open(operation.canonicalPath, "r+");
          await handle.truncate(0); await handle.writeFile(operation.prestate.content!); await handle.sync(); await handle.close();
        }
      }
      for (const operation of operations) {
        const observed = await observeFile(operation.canonicalPath, observedAtEpochMs);
        if (operation.prestate.exists !== observed.exists || (observed.exists && observed.hash !== operation.prestate.hash)) return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  #validateCommon(request: R2EPrepareRequest | R2ECommitRequest, expectedAuthority: R2EPrepareRequest["authority"] | R2ECommitRequest["authority"]): string[] {
    const issues: string[] = [];
    if (this.#revoked) issues.push("transaction_capability_revoked");
    if (request.schemaVersion !== 1 || typeof request.requestId !== "string" || !request.requestId.trim()
      || typeof request.transactionId !== "string" || !request.transactionId.trim() || typeof request.issuer !== "string"
      || typeof request.auditIdentity !== "string") issues.push("transaction_request_malformed");
    if (request.authority !== expectedAuthority) issues.push("transaction_authority_mismatch");
    if (request.sandboxId !== this.#config.sandbox.sandboxId) issues.push("sandbox_binding_mismatch");
    if (request.capabilityId !== this.#config.capability.capabilityId || request.issuer !== this.#config.capability.issuer
      || request.auditIdentity !== this.#config.capability.auditIdentity) issues.push("transaction_capability_identity_mismatch");
    if (!Number.isFinite(request.observedAtEpochMs) || request.observedAtEpochMs < this.#config.capability.issuedAtEpochMs
      || request.observedAtEpochMs >= this.#config.capability.expiresAtEpochMs || request.observedAtEpochMs >= this.#config.sandbox.expiresAtEpochMs) {
      issues.push("transaction_capability_expired");
    }
    if (!this.#config.lifecycle.ownsActiveSandbox(this.#config.sandbox)) issues.push("sandbox_not_active");
    return issues;
  }

  #validRelativePath(path: unknown): path is string {
    if (typeof path !== "string" || !path.trim() || isAbsolute(path) || normalize(path) !== path || path.includes("..")
      || path.includes("/") || path.includes("\\") || basename(path) !== path) return false;
    return this.#config.allowedExtensions.some((extension) => path.endsWith(extension));
  }

  #prepareResult(decision: R2EPrepareResult["decision"], reason: string, transaction: R2EPreparedTransaction | null): R2EPrepareResult {
    return Object.freeze({ decision, reason, transaction, events: Object.freeze([...this.#events]), evidenceClass: "E3", authorityGranted: false });
  }

  #commitResult(decision: R2ECommitResult["decision"], reason: string, transaction: R2ECommittedTransaction | null): R2ECommitResult {
    return Object.freeze({ decision, reason, transaction, events: Object.freeze([...this.#events]), evidenceClass: "E3", authorityGranted: false });
  }

  #terminationResult(decision: R2ETerminationResult["decision"], reason: string, lifecycleResult: R2AOperationResult | null): R2ETerminationResult {
    return Object.freeze({ decision, reason, transactionEvents: Object.freeze([...this.#events]), lifecycleResult, evidenceClass: "E3", authorityGranted: false });
  }
}
