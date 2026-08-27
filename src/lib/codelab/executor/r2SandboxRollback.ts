import { createHash } from "node:crypto";
import {
  type R2ECommittedTransaction,
  type R2EIsolatedTransactionEngine,
  type R2ERollbackLease,
  type R2ETerminationResult,
} from "./r2SandboxTransaction";
import type { R2ATerminationRequest } from "./r2SandboxLifecycle";

export const R2_F_ISOLATED_CANDIDATE_STATUS = Object.freeze({
  chunkId: "OMEGA-R2-F-ISOLATED-001",
  securityClosure: "BLOCKED_EXTERNAL",
  maturity: "IMPLEMENTED_AND_VERIFIED_IN_ISOLATION",
  newCapability: "EXPLICIT_COMMITTED_TRANSACTION_ROLLBACK",
  candidateCapabilities: Object.freeze(["ROLLBACK_COMMITTED_TRANSACTION"] as const),
  unavailableCapabilities: Object.freeze(["PROPOSE_REPOSITORY_PATCH", "APPLY_PATCH", "WRITE_SANDBOX"] as const),
  forbiddenCapabilities: Object.freeze(["WRITE_REPOSITORY", "SHELL", "NETWORK", "CREDENTIAL_ACCESS", "PACKAGE_INSTALL", "DEPLOYMENT"] as const),
  authorityGranted: false,
  productionEligible: false,
} as const);

export interface R2FProcessLocalCapability {
  readonly capabilityId: string;
  readonly issuer: string;
  readonly auditIdentity: string;
  readonly issuedAtEpochMs: number;
  readonly expiresAtEpochMs: number;
}

export interface R2FIsolatedRollbackConfig {
  readonly executorId: string;
  readonly candidateCommit: string;
  readonly evaluatorVersion: string;
  readonly environmentIdentity: string;
  readonly authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED";
  readonly transactionEngine: R2EIsolatedTransactionEngine;
  readonly committedTransaction: R2ECommittedTransaction;
  readonly capability: R2FProcessLocalCapability;
}

export interface R2FRollbackRequest {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly transactionId: string;
  readonly rollbackLeaseId: string;
  readonly sandboxId: string;
  readonly capabilityId: string;
  readonly authority: "ROLLBACK_COMMITTED_TRANSACTION";
  readonly expectedPoststateDigest: string;
  readonly issuer: string;
  readonly auditIdentity: string;
  readonly observedAtEpochMs: number;
}

export type R2FRollbackEventType =
  | "ROLLBACK_REQUESTED"
  | "ROLLBACK_AUTHORIZED"
  | "COMMITTED_POSTSTATE_VERIFICATION"
  | "ROLLBACK_EXECUTED"
  | "ROLLBACK_PROVEN"
  | "ROLLBACK_REJECTED"
  | "ROLLBACK_QUARANTINED"
  | "ROLLBACK_CAPABILITY_REVOCATION";

export interface R2FRollbackEvent {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly eventType: R2FRollbackEventType;
  readonly requestId: string;
  readonly transactionId: string;
  readonly actorIdentity: string;
  readonly result: "REQUESTED" | "AUTHORIZED" | "VERIFIED" | "SUCCEEDED" | "DENIED" | "STALE" | "QUARANTINED" | "REVOKED";
  readonly poststateDigest: string;
  readonly prestateDigest: string | null;
  readonly evidenceRef: string;
  readonly previousHash: string;
  readonly eventHash: string;
}

export interface R2FRollbackResult {
  readonly decision: "ROLLED_BACK" | "STALE_REJECTED" | "REJECTED" | "QUARANTINED";
  readonly reason: string;
  readonly prestateDigest: string | null;
  readonly events: readonly R2FRollbackEvent[];
  readonly evidenceClass: "E3";
  readonly authorityGranted: false;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function appendEvent(events: R2FRollbackEvent[], input: Omit<R2FRollbackEvent, "schemaVersion" | "eventId" | "previousHash" | "eventHash" | "evidenceRef">): R2FRollbackEvent {
  const sequence = events.length + 1;
  const base: Omit<R2FRollbackEvent, "eventHash"> = {
    schemaVersion: 1, eventId: `R2F-${input.transactionId}-${String(sequence).padStart(2, "0")}-${input.eventType}`,
    ...input, evidenceRef: `r2f-local://${input.transactionId}/${String(sequence).padStart(2, "0")}/${input.eventType.toLowerCase()}`,
    previousHash: events.at(-1)?.eventHash ?? "GENESIS",
  };
  const event = Object.freeze({ ...base, eventHash: sha256(canonical(base)) });
  events.push(event);
  return event;
}

export class R2FIsolatedRollbackController {
  readonly #config: R2FIsolatedRollbackConfig;
  readonly #lease: R2ERollbackLease;
  readonly #events: R2FRollbackEvent[] = [];
  #completed = false;
  #revoked = false;

  private constructor(config: R2FIsolatedRollbackConfig, lease: R2ERollbackLease) {
    this.#config = config;
    this.#lease = lease;
  }

  static create(config: R2FIsolatedRollbackConfig): R2FIsolatedRollbackController {
    if (config.authorityMode !== "ISOLATED_CANDIDATE_NOT_GRANTED") throw new Error("production_authority_not_permitted");
    if (!/^[0-9a-f]{40}$/.test(config.candidateCommit)) throw new Error("candidate_commit_must_be_exact");
    if (!config.executorId.trim() || !config.evaluatorVersion.trim() || !config.environmentIdentity.trim()
      || !config.capability.capabilityId.trim() || !config.capability.issuer.trim() || !config.capability.auditIdentity.trim()) {
      throw new Error("isolated_candidate_identity_missing");
    }
    if (!Number.isFinite(config.capability.issuedAtEpochMs) || !Number.isFinite(config.capability.expiresAtEpochMs)
      || config.capability.expiresAtEpochMs <= config.capability.issuedAtEpochMs) throw new Error("capability_lifetime_invalid");
    const lease = config.transactionEngine.transferCommittedTransactionToRollback(config.committedTransaction, config.executorId);
    if (!lease) throw new Error("committed_transaction_transfer_rejected");
    return new R2FIsolatedRollbackController(config, lease);
  }

  rollbackLease(): R2ERollbackLease {
    return this.#lease;
  }

  capabilityProfile(): typeof R2_F_ISOLATED_CANDIDATE_STATUS & { readonly revoked: boolean; readonly completed: boolean } {
    return Object.freeze({ ...R2_F_ISOLATED_CANDIDATE_STATUS, revoked: this.#revoked, completed: this.#completed });
  }

  async rollback(request: R2FRollbackRequest): Promise<R2FRollbackResult> {
    const requestId = typeof request.requestId === "string" && request.requestId.trim() ? request.requestId : "MALFORMED";
    const transactionId = typeof request.transactionId === "string" ? request.transactionId : "MALFORMED";
    appendEvent(this.#events, { eventType: "ROLLBACK_REQUESTED", requestId, transactionId, actorIdentity: typeof request.issuer === "string" ? request.issuer : "UNKNOWN",
      result: "REQUESTED", poststateDigest: this.#config.committedTransaction.poststateDigest, prestateDigest: null });
    const issues = this.#validate(request);
    if (issues.length > 0) {
      appendEvent(this.#events, { eventType: "ROLLBACK_REJECTED", requestId, transactionId, actorIdentity: this.#config.executorId,
        result: "DENIED", poststateDigest: this.#config.committedTransaction.poststateDigest, prestateDigest: null });
      return this.#result("REJECTED", issues.join(","), null);
    }
    appendEvent(this.#events, { eventType: "ROLLBACK_AUTHORIZED", requestId, transactionId, actorIdentity: this.#config.executorId,
      result: "AUTHORIZED", poststateDigest: request.expectedPoststateDigest, prestateDigest: null });
    const recovery = await this.#config.transactionEngine.executeAuthorizedRecovery(this.#lease, this.#config.executorId, request.observedAtEpochMs);
    if (recovery.decision === "STALE_REJECTED") {
      this.#revoked = true;
      appendEvent(this.#events, { eventType: "COMMITTED_POSTSTATE_VERIFICATION", requestId, transactionId, actorIdentity: this.#config.executorId,
        result: "STALE", poststateDigest: request.expectedPoststateDigest, prestateDigest: null });
      return this.#result("STALE_REJECTED", recovery.reason, null);
    }
    if (recovery.decision !== "RESTORED") {
      this.#revoked = true;
      appendEvent(this.#events, { eventType: "ROLLBACK_QUARANTINED", requestId, transactionId, actorIdentity: this.#config.executorId,
        result: "QUARANTINED", poststateDigest: request.expectedPoststateDigest, prestateDigest: null });
      return this.#result(recovery.decision === "REJECTED" ? "REJECTED" : "QUARANTINED", recovery.reason, null);
    }
    appendEvent(this.#events, { eventType: "COMMITTED_POSTSTATE_VERIFICATION", requestId, transactionId, actorIdentity: this.#config.executorId,
      result: "VERIFIED", poststateDigest: request.expectedPoststateDigest, prestateDigest: null });
    appendEvent(this.#events, { eventType: "ROLLBACK_EXECUTED", requestId, transactionId, actorIdentity: this.#config.executorId,
      result: "SUCCEEDED", poststateDigest: request.expectedPoststateDigest, prestateDigest: recovery.prestateDigest });
    appendEvent(this.#events, { eventType: "ROLLBACK_PROVEN", requestId, transactionId, actorIdentity: this.#config.executorId,
      result: "VERIFIED", poststateDigest: request.expectedPoststateDigest, prestateDigest: recovery.prestateDigest });
    this.#completed = true;
    return this.#result("ROLLED_BACK", recovery.reason, recovery.prestateDigest);
  }

  async terminateWithOwnedCleanup(request: R2ATerminationRequest): Promise<R2ETerminationResult> {
    if (!this.#completed || this.#revoked) {
      return Object.freeze({ decision: "REJECTED", reason: "no_verified_rollback_for_cleanup", transactionEvents: Object.freeze([]),
        lifecycleResult: null, evidenceClass: "E3", authorityGranted: false });
    }
    const result = await this.#config.transactionEngine.terminateAfterAuthorizedRecovery(this.#lease, this.#config.executorId, request);
    if (result.decision === "TERMINATED") {
      this.#revoked = true;
      appendEvent(this.#events, { eventType: "ROLLBACK_CAPABILITY_REVOCATION", requestId: request.requestId,
        transactionId: this.#config.committedTransaction.transactionId, actorIdentity: this.#config.executorId,
        result: "REVOKED", poststateDigest: this.#config.committedTransaction.poststateDigest, prestateDigest: null });
    }
    return result;
  }

  #validate(request: R2FRollbackRequest): readonly string[] {
    const issues: string[] = [];
    if (this.#revoked) issues.push("rollback_capability_revoked");
    if (this.#completed) issues.push("rollback_already_completed");
    if (request.schemaVersion !== 1 || typeof request.requestId !== "string" || !request.requestId.trim()
      || typeof request.expectedPoststateDigest !== "string" || typeof request.issuer !== "string" || typeof request.auditIdentity !== "string") {
      issues.push("rollback_request_malformed");
    }
    if (request.authority !== "ROLLBACK_COMMITTED_TRANSACTION") issues.push("rollback_authority_mismatch");
    if (request.transactionId !== this.#lease.transactionId || request.rollbackLeaseId !== this.#lease.leaseId
      || request.sandboxId !== this.#lease.sandboxId) issues.push("rollback_lease_binding_mismatch");
    if (request.expectedPoststateDigest !== this.#lease.committedPoststateDigest) issues.push("rollback_evidence_digest_mismatch");
    if (request.capabilityId !== this.#config.capability.capabilityId || request.issuer !== this.#config.capability.issuer
      || request.auditIdentity !== this.#config.capability.auditIdentity) issues.push("rollback_capability_identity_mismatch");
    if (!Number.isFinite(request.observedAtEpochMs) || request.observedAtEpochMs < this.#config.capability.issuedAtEpochMs
      || request.observedAtEpochMs >= this.#config.capability.expiresAtEpochMs) issues.push("rollback_capability_expired");
    if (!this.#config.transactionEngine.ownsRollbackLease(this.#lease, this.#config.executorId)) issues.push("rollback_lease_not_active");
    return Object.freeze([...new Set(issues)]);
  }

  #result(decision: R2FRollbackResult["decision"], reason: string, prestateDigest: string | null): R2FRollbackResult {
    return Object.freeze({ decision, reason, prestateDigest, events: Object.freeze([...this.#events]), evidenceClass: "E3", authorityGranted: false });
  }
}
