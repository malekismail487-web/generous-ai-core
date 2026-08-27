import { createHash } from "node:crypto";
import { lstat, open, readFile, realpath, unlink } from "node:fs/promises";
import { basename, isAbsolute, join, normalize, sep } from "node:path";
import {
  type R2CIsolatedContentModifier,
  type R2CModifiedArtifact,
} from "./r2SandboxModification";
import {
  type R2AIsolatedSandboxLifecycle,
  type R2AOperationResult,
  type R2AProvisionedSandbox,
  type R2ATerminationRequest,
} from "./r2SandboxLifecycle";
import type { CanonicalTargetIdentity } from "./r2ProvisioningBlueprint";

export const R2_D_ISOLATED_CANDIDATE_STATUS = Object.freeze({
  chunkId: "OMEGA-R2-D-ISOLATED-001",
  securityClosure: "BLOCKED_EXTERNAL",
  maturity: "IMPLEMENTED_AND_VERIFIED_IN_ISOLATION",
  newCapability: "REVERSIBLE_OWNED_SANDBOX_ARTIFACT_DELETION",
  candidateCapabilities: Object.freeze(["DELETE_SANDBOX_CONTENT", "RESTORE_SANDBOX_CONTENT"] as const),
  unavailableCapabilities: Object.freeze(["MULTI_FILE_TRANSACTION", "ROLLBACK_TRANSACTION", "APPLY_PATCH", "WRITE_SANDBOX"] as const),
  forbiddenCapabilities: Object.freeze(["WRITE_REPOSITORY", "SHELL", "NETWORK", "CREDENTIAL_ACCESS", "PACKAGE_INSTALL", "DEPLOYMENT"] as const),
  authorityGranted: false,
  productionEligible: false,
} as const);

export interface R2DProcessLocalCapability {
  readonly capabilityId: string;
  readonly issuer: string;
  readonly auditIdentity: string;
  readonly issuedAtEpochMs: number;
  readonly expiresAtEpochMs: number;
}

export interface R2DIsolatedDeletionConfig {
  readonly executorId: string;
  readonly candidateCommit: string;
  readonly evaluatorVersion: string;
  readonly environmentIdentity: string;
  readonly authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED";
  readonly sandbox: R2AProvisionedSandbox;
  readonly lifecycle: R2AIsolatedSandboxLifecycle;
  readonly predecessor: R2CIsolatedContentModifier;
  readonly baseArtifact: R2CModifiedArtifact;
  readonly capability: R2DProcessLocalCapability;
  readonly maxPreimageBytes: number;
}

export interface R2DDeleteRequest {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly sandboxId: string;
  readonly artifactId: string;
  readonly capabilityId: string;
  readonly authority: "DELETE_SANDBOX_CONTENT";
  readonly requestedRelativePath: string;
  readonly expectedContentHash: string;
  readonly issuer: string;
  readonly auditIdentity: string;
  readonly observedAtEpochMs: number;
}

export interface R2DRestoreRequest {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly sandboxId: string;
  readonly tombstoneId: string;
  readonly capabilityId: string;
  readonly authority: "RESTORE_SANDBOX_CONTENT";
  readonly issuer: string;
  readonly auditIdentity: string;
  readonly observedAtEpochMs: number;
}

export type R2DDeletionEventType =
  | "DELETION_REQUEST"
  | "DELETION_AUTHORIZATION"
  | "TARGET_VALIDATION"
  | "PREIMAGE_CAPTURE"
  | "ARTIFACT_DELETION"
  | "DELETION_POSTCONDITION"
  | "RESTORE_REQUEST"
  | "RESTORE_AUTHORIZATION"
  | "ARTIFACT_RESTORATION"
  | "RESTORATION_POSTCONDITION"
  | "RESTORED_CONTENT_CLEANUP"
  | "DELETION_CAPABILITY_REVOCATION";

export interface R2DDeletionEvent {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly eventType: R2DDeletionEventType;
  readonly requestId: string;
  readonly actorIdentity: string;
  readonly authority: "DELETE_SANDBOX_CONTENT" | "RESTORE_SANDBOX_CONTENT" | "TRUSTED_LIFECYCLE_CLEANUP";
  readonly resourceIdentity: string;
  readonly objectIdentity: string | null;
  readonly result: "REQUESTED" | "AUTHORIZED" | "DENIED" | "VERIFIED" | "SUCCEEDED" | "STALE" | "REVOKED";
  readonly preimageHash: string | null;
  readonly byteLength: number | null;
  readonly evidenceRef: string;
  readonly previousHash: string;
  readonly eventHash: string;
}

export interface R2DDeletionTombstone {
  readonly tombstoneId: string;
  readonly artifactId: string;
  readonly canonicalPath: string;
  readonly deletedObjectIdentity: CanonicalTargetIdentity;
  readonly preimageHash: string;
  readonly byteLength: number;
  readonly deletionRequestId: string;
}

export interface R2DRestoredArtifact extends R2CModifiedArtifact {
  readonly objectIdentity: CanonicalTargetIdentity;
  readonly restorationRequestId: string;
}

export interface R2DDeleteResult {
  readonly decision: "DELETED_REVERSIBLY" | "STALE_REJECTED" | "REJECTED" | "QUARANTINED";
  readonly reason: string;
  readonly tombstone: R2DDeletionTombstone | null;
  readonly events: readonly R2DDeletionEvent[];
  readonly evidenceClass: "E3";
  readonly authorityGranted: false;
}

export interface R2DRestoreResult {
  readonly decision: "RESTORED" | "REJECTED" | "QUARANTINED";
  readonly reason: string;
  readonly artifact: R2DRestoredArtifact | null;
  readonly events: readonly R2DDeletionEvent[];
  readonly evidenceClass: "E3";
  readonly authorityGranted: false;
}

export interface R2DTerminationResult {
  readonly decision: "TERMINATED" | "REJECTED" | "QUARANTINED";
  readonly reason: string;
  readonly deletionEvents: readonly R2DDeletionEvent[];
  readonly lifecycleResult: R2AOperationResult | null;
  readonly evidenceClass: "E3";
  readonly authorityGranted: false;
}

interface PrivateTombstone {
  readonly publicRecord: R2DDeletionTombstone;
  readonly preimage: Buffer;
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

function sameIdentity(left: CanonicalTargetIdentity, right: CanonicalTargetIdentity): boolean {
  return identityKey(left) === identityKey(right);
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
    volumeOrDevice: stats.dev.toString(),
    objectId: `${stats.ino.toString()}:${stats.birthtimeNs.toString()}`,
    observedAtEpochMs,
  };
}

function appendEvent(
  events: R2DDeletionEvent[],
  input: Omit<R2DDeletionEvent, "schemaVersion" | "eventId" | "previousHash" | "eventHash" | "evidenceRef">,
): R2DDeletionEvent {
  const sequence = events.length + 1;
  const base: Omit<R2DDeletionEvent, "eventHash"> = {
    schemaVersion: 1,
    eventId: `R2D-${input.requestId}-${String(sequence).padStart(2, "0")}-${input.eventType}`,
    ...input,
    evidenceRef: `r2d-local://${input.requestId}/${String(sequence).padStart(2, "0")}/${input.eventType.toLowerCase()}`,
    previousHash: events.at(-1)?.eventHash ?? "GENESIS",
  };
  const event = Object.freeze({ ...base, eventHash: sha256(canonical(base)) });
  events.push(event);
  return event;
}

export class R2DIsolatedReversibleDeleter {
  readonly #config: R2DIsolatedDeletionConfig;
  readonly #events: R2DDeletionEvent[] = [];
  #tombstone: PrivateTombstone | null = null;
  #restoredArtifact: R2DRestoredArtifact | null = null;
  #revoked = false;

  private constructor(config: R2DIsolatedDeletionConfig) {
    this.#config = config;
  }

  static async create(config: R2DIsolatedDeletionConfig, observedAtEpochMs = Date.now()): Promise<R2DIsolatedReversibleDeleter> {
    if (config.authorityMode !== "ISOLATED_CANDIDATE_NOT_GRANTED") throw new Error("production_authority_not_permitted");
    if (!/^[0-9a-f]{40}$/.test(config.candidateCommit)) throw new Error("candidate_commit_must_be_exact");
    if (!config.executorId.trim() || !config.evaluatorVersion.trim() || !config.environmentIdentity.trim()
      || !config.capability.capabilityId.trim() || !config.capability.issuer.trim() || !config.capability.auditIdentity.trim()) {
      throw new Error("isolated_candidate_identity_missing");
    }
    if (!Number.isInteger(config.maxPreimageBytes) || config.maxPreimageBytes < 1) throw new Error("deletion_policy_invalid");
    if (!Number.isFinite(config.capability.issuedAtEpochMs) || !Number.isFinite(config.capability.expiresAtEpochMs)
      || config.capability.expiresAtEpochMs <= config.capability.issuedAtEpochMs) throw new Error("capability_lifetime_invalid");
    if (!config.lifecycle.ownsActiveSandbox(config.sandbox)) throw new Error("sandbox_not_owned_by_active_lifecycle");
    if (!Number.isFinite(observedAtEpochMs) || observedAtEpochMs >= config.sandbox.expiresAtEpochMs) throw new Error("sandbox_lifetime_expired");
    const [canonicalTarget, identity] = await Promise.all([
      realpath(config.baseArtifact.canonicalPath),
      observeIdentity(config.baseArtifact.canonicalPath, observedAtEpochMs),
    ]);
    if (canonicalTarget !== config.baseArtifact.canonicalPath || !sameIdentity(identity, config.baseArtifact.objectIdentity)) {
      throw new Error("base_artifact_identity_changed");
    }
    if (!config.predecessor.transferOwnedArtifactToDeleter(config.baseArtifact)) throw new Error("base_artifact_ownership_transfer_rejected");
    return new R2DIsolatedReversibleDeleter(config);
  }

  capabilityProfile(): typeof R2_D_ISOLATED_CANDIDATE_STATUS & { readonly revoked: boolean; readonly deleted: boolean; readonly restored: boolean } {
    return Object.freeze({
      ...R2_D_ISOLATED_CANDIDATE_STATUS,
      revoked: this.#revoked,
      deleted: this.#tombstone !== null && this.#restoredArtifact === null,
      restored: this.#restoredArtifact !== null,
    });
  }

  async deleteOwnedArtifact(request: R2DDeleteRequest): Promise<R2DDeleteResult> {
    const requestId = typeof request.requestId === "string" && request.requestId.trim() ? request.requestId : "MALFORMED";
    appendEvent(this.#events, {
      eventType: "DELETION_REQUEST", requestId, actorIdentity: typeof request.issuer === "string" && request.issuer ? request.issuer : "UNKNOWN",
      authority: "DELETE_SANDBOX_CONTENT", resourceIdentity: this.#config.baseArtifact.canonicalPath,
      objectIdentity: identityKey(this.#config.baseArtifact.objectIdentity), result: "REQUESTED", preimageHash: null, byteLength: null,
    });
    const issues = this.#validateDeleteRequest(request);
    if (issues.length > 0) {
      appendEvent(this.#events, {
        eventType: "DELETION_AUTHORIZATION", requestId, actorIdentity: this.#config.executorId,
        authority: "DELETE_SANDBOX_CONTENT", resourceIdentity: this.#config.baseArtifact.canonicalPath,
        objectIdentity: identityKey(this.#config.baseArtifact.objectIdentity), result: "DENIED",
        preimageHash: request.expectedContentHash ?? null, byteLength: null,
      });
      return this.#deleteResult(issues.includes("expected_content_hash_mismatch") ? "STALE_REJECTED" : "REJECTED", issues.join(","), null);
    }
    appendEvent(this.#events, {
      eventType: "DELETION_AUTHORIZATION", requestId, actorIdentity: this.#config.executorId,
      authority: "DELETE_SANDBOX_CONTENT", resourceIdentity: this.#config.baseArtifact.canonicalPath,
      objectIdentity: identityKey(this.#config.baseArtifact.objectIdentity), result: "AUTHORIZED",
      preimageHash: request.expectedContentHash, byteLength: this.#config.baseArtifact.byteLength,
    });
    try {
      const handle = await open(this.#config.baseArtifact.canonicalPath, "r");
      const stats = await handle.stat({ bigint: true });
      const handleIdentity: CanonicalTargetIdentity = {
        identityScheme: process.platform === "win32" ? "WINDOWS_FILE_ID" : "POSIX_DEVICE_INODE",
        volumeOrDevice: stats.dev.toString(), objectId: `${stats.ino.toString()}:${stats.birthtimeNs.toString()}`,
        observedAtEpochMs: request.observedAtEpochMs,
      };
      const preimage = await handle.readFile();
      await handle.close();
      const preimageHash = sha256(preimage);
      if (!sameIdentity(handleIdentity, this.#config.baseArtifact.objectIdentity)) throw new Error("owned_artifact_identity_changed");
      if (preimage.byteLength > this.#config.maxPreimageBytes) throw new Error("preimage_byte_limit_exceeded");
      if (preimage.byteLength !== this.#config.baseArtifact.byteLength || preimageHash !== request.expectedContentHash
        || preimageHash !== this.#config.baseArtifact.contentHash) {
        appendEvent(this.#events, {
          eventType: "TARGET_VALIDATION", requestId, actorIdentity: this.#config.executorId,
          authority: "DELETE_SANDBOX_CONTENT", resourceIdentity: this.#config.baseArtifact.canonicalPath,
          objectIdentity: identityKey(handleIdentity), result: "STALE", preimageHash, byteLength: preimage.byteLength,
        });
        return this.#deleteResult("STALE_REJECTED", "observed_artifact_content_changed", null);
      }
      const [identityAtDelete, canonicalTarget] = await Promise.all([
        observeIdentity(this.#config.baseArtifact.canonicalPath, request.observedAtEpochMs),
        realpath(this.#config.baseArtifact.canonicalPath),
      ]);
      if (canonicalTarget !== this.#config.baseArtifact.canonicalPath || !sameIdentity(identityAtDelete, handleIdentity)) {
        throw new Error("owned_artifact_identity_changed_before_delete");
      }
      appendEvent(this.#events, {
        eventType: "TARGET_VALIDATION", requestId, actorIdentity: this.#config.executorId,
        authority: "DELETE_SANDBOX_CONTENT", resourceIdentity: canonicalTarget,
        objectIdentity: identityKey(identityAtDelete), result: "VERIFIED", preimageHash, byteLength: preimage.byteLength,
      });
      appendEvent(this.#events, {
        eventType: "PREIMAGE_CAPTURE", requestId, actorIdentity: this.#config.executorId,
        authority: "DELETE_SANDBOX_CONTENT", resourceIdentity: canonicalTarget,
        objectIdentity: identityKey(identityAtDelete), result: "VERIFIED", preimageHash, byteLength: preimage.byteLength,
      });
      await unlink(canonicalTarget);
      try {
        await lstat(canonicalTarget);
        throw new Error("deletion_postcondition_failed");
      } catch (error) {
        if (errorCode(error) !== "ENOENT") throw error;
      }
      const publicRecord: R2DDeletionTombstone = Object.freeze({
        tombstoneId: `tombstone://${request.capabilityId}/${request.requestId}`,
        artifactId: this.#config.baseArtifact.artifactId,
        canonicalPath: canonicalTarget,
        deletedObjectIdentity: identityAtDelete,
        preimageHash,
        byteLength: preimage.byteLength,
        deletionRequestId: request.requestId,
      });
      this.#tombstone = { publicRecord, preimage: Buffer.from(preimage) };
      appendEvent(this.#events, {
        eventType: "ARTIFACT_DELETION", requestId, actorIdentity: this.#config.executorId,
        authority: "DELETE_SANDBOX_CONTENT", resourceIdentity: canonicalTarget,
        objectIdentity: identityKey(identityAtDelete), result: "SUCCEEDED", preimageHash, byteLength: preimage.byteLength,
      });
      appendEvent(this.#events, {
        eventType: "DELETION_POSTCONDITION", requestId, actorIdentity: this.#config.executorId,
        authority: "DELETE_SANDBOX_CONTENT", resourceIdentity: canonicalTarget,
        objectIdentity: identityKey(identityAtDelete), result: "VERIFIED", preimageHash, byteLength: preimage.byteLength,
      });
      return this.#deleteResult("DELETED_REVERSIBLY", "owned_artifact_deleted_with_private_preimage", publicRecord);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "owned_artifact_deletion_failed";
      if (reason.includes("identity_changed") || reason.includes("postcondition_failed")) {
        this.#revoked = true;
        return this.#deleteResult("QUARANTINED", reason, null);
      }
      return this.#deleteResult("REJECTED", reason, null);
    }
  }

  async restoreDeletedArtifact(request: R2DRestoreRequest): Promise<R2DRestoreResult> {
    const requestId = typeof request.requestId === "string" && request.requestId.trim() ? request.requestId : "MALFORMED";
    appendEvent(this.#events, {
      eventType: "RESTORE_REQUEST", requestId, actorIdentity: typeof request.issuer === "string" && request.issuer ? request.issuer : "UNKNOWN",
      authority: "RESTORE_SANDBOX_CONTENT", resourceIdentity: this.#config.baseArtifact.canonicalPath,
      objectIdentity: this.#tombstone ? identityKey(this.#tombstone.publicRecord.deletedObjectIdentity) : null,
      result: "REQUESTED", preimageHash: this.#tombstone?.publicRecord.preimageHash ?? null,
      byteLength: this.#tombstone?.publicRecord.byteLength ?? null,
    });
    const issues = this.#validateRestoreRequest(request);
    if (issues.length > 0) {
      appendEvent(this.#events, {
        eventType: "RESTORE_AUTHORIZATION", requestId, actorIdentity: this.#config.executorId,
        authority: "RESTORE_SANDBOX_CONTENT", resourceIdentity: this.#config.baseArtifact.canonicalPath,
        objectIdentity: null, result: "DENIED", preimageHash: this.#tombstone?.publicRecord.preimageHash ?? null,
        byteLength: this.#tombstone?.publicRecord.byteLength ?? null,
      });
      return this.#restoreResult("REJECTED", issues.join(","), null);
    }
    const tombstone = this.#tombstone!;
    appendEvent(this.#events, {
      eventType: "RESTORE_AUTHORIZATION", requestId, actorIdentity: this.#config.executorId,
      authority: "RESTORE_SANDBOX_CONTENT", resourceIdentity: tombstone.publicRecord.canonicalPath,
      objectIdentity: identityKey(tombstone.publicRecord.deletedObjectIdentity), result: "AUTHORIZED",
      preimageHash: tombstone.publicRecord.preimageHash, byteLength: tombstone.publicRecord.byteLength,
    });
    let handle: Awaited<ReturnType<typeof open>> | null = null;
    let created = false;
    try {
      try {
        await lstat(tombstone.publicRecord.canonicalPath);
        throw new Error("restore_target_not_absent");
      } catch (error) {
        if (errorCode(error) !== "ENOENT") throw error;
      }
      const sandboxCanonical = await realpath(this.#config.sandbox.canonicalPath);
      if (sandboxCanonical !== this.#config.sandbox.canonicalPath || !this.#config.lifecycle.ownsActiveSandbox(this.#config.sandbox)) {
        throw new Error("sandbox_identity_changed");
      }
      handle = await open(tombstone.publicRecord.canonicalPath, "wx", 0o600);
      created = true;
      await handle.writeFile(tombstone.preimage);
      await handle.sync();
      await handle.close();
      handle = null;
      const [content, identity, canonicalTarget] = await Promise.all([
        readFile(tombstone.publicRecord.canonicalPath),
        observeIdentity(tombstone.publicRecord.canonicalPath, request.observedAtEpochMs),
        realpath(tombstone.publicRecord.canonicalPath),
      ]);
      if (canonicalTarget !== tombstone.publicRecord.canonicalPath || content.byteLength !== tombstone.publicRecord.byteLength
        || sha256(content) !== tombstone.publicRecord.preimageHash) throw new Error("restoration_postcondition_failed");
      this.#restoredArtifact = Object.freeze({
        ...this.#config.baseArtifact,
        objectIdentity: identity,
        restorationRequestId: request.requestId,
      });
      appendEvent(this.#events, {
        eventType: "ARTIFACT_RESTORATION", requestId, actorIdentity: this.#config.executorId,
        authority: "RESTORE_SANDBOX_CONTENT", resourceIdentity: canonicalTarget,
        objectIdentity: identityKey(identity), result: "SUCCEEDED", preimageHash: tombstone.publicRecord.preimageHash,
        byteLength: content.byteLength,
      });
      appendEvent(this.#events, {
        eventType: "RESTORATION_POSTCONDITION", requestId, actorIdentity: this.#config.executorId,
        authority: "RESTORE_SANDBOX_CONTENT", resourceIdentity: canonicalTarget,
        objectIdentity: identityKey(identity), result: "VERIFIED", preimageHash: tombstone.publicRecord.preimageHash,
        byteLength: content.byteLength,
      });
      return this.#restoreResult("RESTORED", "private_preimage_restored_and_independently_verified", this.#restoredArtifact);
    } catch (error) {
      if (handle) await handle.close().catch(() => undefined);
      const reason = error instanceof Error ? error.message : "artifact_restoration_failed";
      if (created) {
        try {
          await unlink(tombstone.publicRecord.canonicalPath);
        } catch {
          this.#revoked = true;
          return this.#restoreResult("QUARANTINED", `${reason};failed_restore_cleanup_unverified`, null);
        }
      }
      if (reason.includes("identity_changed") || reason.includes("postcondition_failed")) {
        this.#revoked = true;
        return this.#restoreResult("QUARANTINED", reason, null);
      }
      return this.#restoreResult("REJECTED", reason, null);
    }
  }

  async terminateWithOwnedCleanup(request: R2ATerminationRequest): Promise<R2DTerminationResult> {
    if (this.#revoked || !this.#tombstone) return this.#terminationResult("REJECTED", "no_active_deletion_state", null);
    if (!this.#config.lifecycle.authorizesTermination(request, this.#config.sandbox)) {
      return this.#terminationResult("REJECTED", "sandbox_termination_binding_mismatch", null);
    }
    try {
      if (this.#restoredArtifact) {
        const [identity, content, canonicalTarget] = await Promise.all([
          observeIdentity(this.#restoredArtifact.canonicalPath, request.observedAtEpochMs),
          readFile(this.#restoredArtifact.canonicalPath),
          realpath(this.#restoredArtifact.canonicalPath),
        ]);
        if (canonicalTarget !== this.#restoredArtifact.canonicalPath || !sameIdentity(identity, this.#restoredArtifact.objectIdentity)
          || content.byteLength !== this.#restoredArtifact.byteLength || sha256(content) !== this.#restoredArtifact.contentHash) {
          throw new Error("restored_artifact_changed_before_cleanup");
        }
        await unlink(this.#restoredArtifact.canonicalPath);
        appendEvent(this.#events, {
          eventType: "RESTORED_CONTENT_CLEANUP", requestId: this.#restoredArtifact.restorationRequestId,
          actorIdentity: this.#config.executorId, authority: "TRUSTED_LIFECYCLE_CLEANUP",
          resourceIdentity: canonicalTarget, objectIdentity: identityKey(identity), result: "VERIFIED",
          preimageHash: this.#tombstone.publicRecord.preimageHash, byteLength: content.byteLength,
        });
      } else {
        try {
          await lstat(this.#tombstone.publicRecord.canonicalPath);
          throw new Error("deleted_artifact_reappeared_before_cleanup");
        } catch (error) {
          if (errorCode(error) !== "ENOENT") throw error;
        }
      }
      this.#revoked = true;
      appendEvent(this.#events, {
        eventType: "DELETION_CAPABILITY_REVOCATION", requestId: this.#tombstone.publicRecord.deletionRequestId,
        actorIdentity: this.#config.executorId, authority: "TRUSTED_LIFECYCLE_CLEANUP",
        resourceIdentity: this.#tombstone.publicRecord.canonicalPath,
        objectIdentity: identityKey(this.#tombstone.publicRecord.deletedObjectIdentity), result: "REVOKED",
        preimageHash: this.#tombstone.publicRecord.preimageHash, byteLength: this.#tombstone.publicRecord.byteLength,
      });
      const lifecycleResult = await this.#config.lifecycle.terminate(request);
      return this.#terminationResult(
        lifecycleResult.decision === "TERMINATED" ? "TERMINATED" : "QUARANTINED",
        lifecycleResult.decision === "TERMINATED" ? "deletion_state_and_sandbox_cleanup_verified" : `sandbox_cleanup_${lifecycleResult.reason}`,
        lifecycleResult,
      );
    } catch (error) {
      this.#revoked = true;
      return this.#terminationResult("QUARANTINED", error instanceof Error ? error.message : "deletion_cleanup_failed", null);
    }
  }

  #validateDeleteRequest(request: R2DDeleteRequest): readonly string[] {
    const issues: string[] = [];
    const expectedName = basename(this.#config.baseArtifact.canonicalPath);
    if (this.#revoked) issues.push("deletion_capability_revoked");
    if (this.#tombstone) issues.push("artifact_already_deleted");
    if (request.schemaVersion !== 1 || typeof request.requestId !== "string" || !request.requestId.trim()
      || typeof request.requestedRelativePath !== "string" || !request.requestedRelativePath.trim()
      || typeof request.expectedContentHash !== "string" || typeof request.issuer !== "string" || typeof request.auditIdentity !== "string") {
      issues.push("deletion_request_malformed");
    }
    if (request.authority !== "DELETE_SANDBOX_CONTENT") issues.push("deletion_authority_mismatch");
    if (request.sandboxId !== this.#config.sandbox.sandboxId || request.artifactId !== this.#config.baseArtifact.artifactId) issues.push("artifact_binding_mismatch");
    if (request.capabilityId !== this.#config.capability.capabilityId || request.issuer !== this.#config.capability.issuer
      || request.auditIdentity !== this.#config.capability.auditIdentity) issues.push("deletion_capability_identity_mismatch");
    if (!Number.isFinite(request.observedAtEpochMs) || request.observedAtEpochMs < this.#config.capability.issuedAtEpochMs
      || request.observedAtEpochMs >= this.#config.capability.expiresAtEpochMs || request.observedAtEpochMs >= this.#config.sandbox.expiresAtEpochMs) {
      issues.push("deletion_capability_expired");
    }
    if (request.expectedContentHash !== this.#config.baseArtifact.contentHash) issues.push("expected_content_hash_mismatch");
    const requestedPath = typeof request.requestedRelativePath === "string" ? request.requestedRelativePath : "";
    if (!requestedPath || isAbsolute(requestedPath) || normalize(requestedPath) !== expectedName
      || requestedPath.includes("..") || requestedPath.includes("/")
      || requestedPath.includes("\\") || join(this.#config.sandbox.canonicalPath, expectedName) !== this.#config.baseArtifact.canonicalPath
      || expectedName.includes(sep)) issues.push("requested_path_not_exact_owned_artifact");
    if (!this.#config.lifecycle.ownsActiveSandbox(this.#config.sandbox)) issues.push("sandbox_not_active");
    return Object.freeze([...new Set(issues)]);
  }

  #validateRestoreRequest(request: R2DRestoreRequest): readonly string[] {
    const issues: string[] = [];
    if (this.#revoked) issues.push("deletion_capability_revoked");
    if (!this.#tombstone) issues.push("no_deleted_artifact_to_restore");
    if (this.#restoredArtifact) issues.push("artifact_already_restored");
    if (request.schemaVersion !== 1 || typeof request.requestId !== "string" || !request.requestId.trim()
      || typeof request.tombstoneId !== "string" || typeof request.issuer !== "string" || typeof request.auditIdentity !== "string") {
      issues.push("restore_request_malformed");
    }
    if (request.authority !== "RESTORE_SANDBOX_CONTENT") issues.push("restore_authority_mismatch");
    if (request.sandboxId !== this.#config.sandbox.sandboxId || request.tombstoneId !== this.#tombstone?.publicRecord.tombstoneId) issues.push("tombstone_binding_mismatch");
    if (request.capabilityId !== this.#config.capability.capabilityId || request.issuer !== this.#config.capability.issuer
      || request.auditIdentity !== this.#config.capability.auditIdentity) issues.push("restore_capability_identity_mismatch");
    if (!Number.isFinite(request.observedAtEpochMs) || request.observedAtEpochMs < this.#config.capability.issuedAtEpochMs
      || request.observedAtEpochMs >= this.#config.capability.expiresAtEpochMs || request.observedAtEpochMs >= this.#config.sandbox.expiresAtEpochMs) {
      issues.push("restore_capability_expired");
    }
    if (!this.#config.lifecycle.ownsActiveSandbox(this.#config.sandbox)) issues.push("sandbox_not_active");
    return Object.freeze([...new Set(issues)]);
  }

  #deleteResult(decision: R2DDeleteResult["decision"], reason: string, tombstone: R2DDeletionTombstone | null): R2DDeleteResult {
    return Object.freeze({ decision, reason, tombstone, events: Object.freeze([...this.#events]), evidenceClass: "E3", authorityGranted: false });
  }

  #restoreResult(decision: R2DRestoreResult["decision"], reason: string, artifact: R2DRestoredArtifact | null): R2DRestoreResult {
    return Object.freeze({ decision, reason, artifact, events: Object.freeze([...this.#events]), evidenceClass: "E3", authorityGranted: false });
  }

  #terminationResult(decision: R2DTerminationResult["decision"], reason: string, lifecycleResult: R2AOperationResult | null): R2DTerminationResult {
    return Object.freeze({ decision, reason, deletionEvents: Object.freeze([...this.#events]), lifecycleResult, evidenceClass: "E3", authorityGranted: false });
  }
}
