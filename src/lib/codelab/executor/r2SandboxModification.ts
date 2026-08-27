import { createHash } from "node:crypto";
import { lstat, open, readFile, realpath, unlink } from "node:fs/promises";
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

export const R2_C_ISOLATED_CANDIDATE_STATUS = Object.freeze({
  chunkId: "OMEGA-R2-C-ISOLATED-001",
  securityClosure: "BLOCKED_EXTERNAL",
  maturity: "IMPLEMENTED_AND_VERIFIED_IN_ISOLATION",
  newCapability: "STALE_SAFE_SANDBOX_CONTENT_MODIFICATION",
  candidateCapabilities: Object.freeze(["MODIFY_SANDBOX_CONTENT"] as const),
  unavailableCapabilities: Object.freeze(["DELETE_SANDBOX_CONTENT", "MULTI_FILE_TRANSACTION", "WRITE_SANDBOX"] as const),
  forbiddenCapabilities: Object.freeze(["WRITE_REPOSITORY", "SHELL", "NETWORK", "CREDENTIAL_ACCESS", "PACKAGE_INSTALL", "DEPLOYMENT"] as const),
  authorityGranted: false,
  productionEligible: false,
} as const);

export interface R2CProcessLocalCapability {
  readonly capabilityId: string;
  readonly issuer: string;
  readonly auditIdentity: string;
  readonly issuedAtEpochMs: number;
  readonly expiresAtEpochMs: number;
}

export interface R2CIsolatedModificationConfig {
  readonly executorId: string;
  readonly candidateCommit: string;
  readonly evaluatorVersion: string;
  readonly environmentIdentity: string;
  readonly authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED";
  readonly sandbox: R2AProvisionedSandbox;
  readonly lifecycle: R2AIsolatedSandboxLifecycle;
  readonly predecessor: R2BIsolatedContentCreator;
  readonly baseArtifact: R2BCreatedArtifact;
  readonly capability: R2CProcessLocalCapability;
  readonly maxFileBytes: number;
}

export interface R2CModifyRequest {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly sandboxId: string;
  readonly artifactId: string;
  readonly capabilityId: string;
  readonly authority: "MODIFY_SANDBOX_CONTENT";
  readonly expectedBaseHash: string;
  readonly replacementContent: string;
  readonly issuer: string;
  readonly auditIdentity: string;
  readonly observedAtEpochMs: number;
}

export type R2CModificationEventType =
  | "MODIFICATION_REQUEST"
  | "MODIFICATION_AUTHORIZATION"
  | "BASE_IDENTITY_VALIDATION"
  | "BASE_HASH_VALIDATION"
  | "CONTENT_MODIFICATION"
  | "MODIFICATION_POSTCONDITION"
  | "MODIFIED_CONTENT_CLEANUP"
  | "MODIFICATION_CAPABILITY_REVOCATION";

export interface R2CModificationEvent {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly eventType: R2CModificationEventType;
  readonly requestId: string;
  readonly actorIdentity: string;
  readonly authority: "MODIFY_SANDBOX_CONTENT" | "TRUSTED_LIFECYCLE_CLEANUP";
  readonly resourceIdentity: string;
  readonly objectIdentity: string | null;
  readonly result: "REQUESTED" | "AUTHORIZED" | "DENIED" | "VERIFIED" | "SUCCEEDED" | "STALE" | "REVOKED";
  readonly baseHash: string | null;
  readonly resultHash: string | null;
  readonly byteLength: number | null;
  readonly evidenceRef: string;
  readonly previousHash: string;
  readonly eventHash: string;
}

export interface R2CModifiedArtifact extends R2BCreatedArtifact {
  readonly previousContentHash: string;
  readonly modificationRequestId: string;
}

export interface R2CModifyResult {
  readonly decision: "MODIFIED" | "STALE_REJECTED" | "REJECTED" | "QUARANTINED";
  readonly reason: string;
  readonly artifact: R2CModifiedArtifact | null;
  readonly events: readonly R2CModificationEvent[];
  readonly evidenceClass: "E3";
  readonly authorityGranted: false;
}

export interface R2CTerminationResult {
  readonly decision: "TERMINATED" | "REJECTED" | "QUARANTINED";
  readonly reason: string;
  readonly modificationEvents: readonly R2CModificationEvent[];
  readonly lifecycleResult: R2AOperationResult | null;
  readonly evidenceClass: "E3";
  readonly authorityGranted: false;
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
  events: R2CModificationEvent[],
  input: Omit<R2CModificationEvent, "schemaVersion" | "eventId" | "previousHash" | "eventHash" | "evidenceRef">,
): R2CModificationEvent {
  const sequence = events.length + 1;
  const base: Omit<R2CModificationEvent, "eventHash"> = {
    schemaVersion: 1,
    eventId: `R2C-${input.requestId}-${String(sequence).padStart(2, "0")}-${input.eventType}`,
    ...input,
    evidenceRef: `r2c-local://${input.requestId}/${String(sequence).padStart(2, "0")}/${input.eventType.toLowerCase()}`,
    previousHash: events.at(-1)?.eventHash ?? "GENESIS",
  };
  const event = Object.freeze({ ...base, eventHash: sha256(canonical(base)) });
  events.push(event);
  return event;
}

export class R2CIsolatedContentModifier {
  readonly #config: R2CIsolatedModificationConfig;
  readonly #baseIdentity: CanonicalTargetIdentity;
  readonly #events: R2CModificationEvent[] = [];
  #artifact: R2CModifiedArtifact | null = null;
  #revoked = false;

  private constructor(config: R2CIsolatedModificationConfig) {
    this.#config = config;
    this.#baseIdentity = config.baseArtifact.objectIdentity;
  }

  static async create(config: R2CIsolatedModificationConfig, observedAtEpochMs = Date.now()): Promise<R2CIsolatedContentModifier> {
    if (config.authorityMode !== "ISOLATED_CANDIDATE_NOT_GRANTED") throw new Error("production_authority_not_permitted");
    if (!/^[0-9a-f]{40}$/.test(config.candidateCommit)) throw new Error("candidate_commit_must_be_exact");
    if (!config.executorId.trim() || !config.evaluatorVersion.trim() || !config.environmentIdentity.trim()
      || !config.capability.capabilityId.trim() || !config.capability.issuer.trim() || !config.capability.auditIdentity.trim()) {
      throw new Error("isolated_candidate_identity_missing");
    }
    if (!Number.isFinite(config.capability.issuedAtEpochMs) || !Number.isFinite(config.capability.expiresAtEpochMs)
      || config.capability.expiresAtEpochMs <= config.capability.issuedAtEpochMs) throw new Error("capability_lifetime_invalid");
    if (!Number.isInteger(config.maxFileBytes) || config.maxFileBytes < 1) throw new Error("modification_policy_invalid");
    if (!config.lifecycle.ownsActiveSandbox(config.sandbox)) throw new Error("sandbox_not_owned_by_active_lifecycle");
    if (!Number.isFinite(observedAtEpochMs) || observedAtEpochMs >= config.sandbox.expiresAtEpochMs) throw new Error("sandbox_lifetime_expired");
    const [canonicalTarget, objectIdentity] = await Promise.all([
      realpath(config.baseArtifact.canonicalPath),
      observeIdentity(config.baseArtifact.canonicalPath, observedAtEpochMs),
    ]);
    if (canonicalTarget !== config.baseArtifact.canonicalPath || !sameIdentity(objectIdentity, config.baseArtifact.objectIdentity)) {
      throw new Error("base_artifact_identity_changed");
    }
    if (!config.predecessor.transferOwnedArtifactToModifier(config.baseArtifact)) throw new Error("base_artifact_ownership_transfer_rejected");
    return new R2CIsolatedContentModifier(config);
  }

  capabilityProfile(): typeof R2_C_ISOLATED_CANDIDATE_STATUS & { readonly revoked: boolean; readonly modified: boolean } {
    return Object.freeze({ ...R2_C_ISOLATED_CANDIDATE_STATUS, revoked: this.#revoked, modified: this.#artifact !== null });
  }

  transferOwnedArtifactToDeleter(artifact: R2CModifiedArtifact): boolean {
    if (this.#revoked || !this.#artifact) return false;
    const matches = this.#artifact.artifactId === artifact.artifactId
      && this.#artifact.canonicalPath === artifact.canonicalPath
      && this.#artifact.contentHash === artifact.contentHash
      && this.#artifact.byteLength === artifact.byteLength
      && this.#artifact.modificationRequestId === artifact.modificationRequestId
      && sameIdentity(this.#artifact.objectIdentity, artifact.objectIdentity)
      && this.#config.lifecycle.ownsActiveSandbox(this.#config.sandbox);
    if (!matches) return false;
    this.#revoked = true;
    return true;
  }

  async modifyFile(request: R2CModifyRequest): Promise<R2CModifyResult> {
    const requestId = typeof request.requestId === "string" && request.requestId.trim() ? request.requestId : "MALFORMED";
    appendEvent(this.#events, {
      eventType: "MODIFICATION_REQUEST", requestId, actorIdentity: typeof request.issuer === "string" && request.issuer ? request.issuer : "UNKNOWN",
      authority: "MODIFY_SANDBOX_CONTENT", resourceIdentity: this.#config.baseArtifact.canonicalPath,
      objectIdentity: identityKey(this.#baseIdentity), result: "REQUESTED", baseHash: null, resultHash: null, byteLength: null,
    });
    const replacement = Buffer.from(typeof request.replacementContent === "string" ? request.replacementContent : "", "utf8");
    const issues = this.#validateRequest(request, replacement.byteLength);
    if (issues.length > 0) {
      appendEvent(this.#events, {
        eventType: "MODIFICATION_AUTHORIZATION", requestId, actorIdentity: this.#config.executorId,
        authority: "MODIFY_SANDBOX_CONTENT", resourceIdentity: this.#config.baseArtifact.canonicalPath,
        objectIdentity: identityKey(this.#baseIdentity), result: "DENIED", baseHash: request.expectedBaseHash ?? null,
        resultHash: null, byteLength: replacement.byteLength,
      });
      return this.#result(issues.includes("expected_base_hash_mismatch") ? "STALE_REJECTED" : "REJECTED", issues.join(","), null);
    }
    appendEvent(this.#events, {
      eventType: "MODIFICATION_AUTHORIZATION", requestId, actorIdentity: this.#config.executorId,
      authority: "MODIFY_SANDBOX_CONTENT", resourceIdentity: this.#config.baseArtifact.canonicalPath,
      objectIdentity: identityKey(this.#baseIdentity), result: "AUTHORIZED", baseHash: request.expectedBaseHash,
      resultHash: null, byteLength: replacement.byteLength,
    });
    let handle: Awaited<ReturnType<typeof open>> | null = null;
    let baseContent: Buffer | null = null;
    try {
      handle = await open(this.#config.baseArtifact.canonicalPath, "r+");
      const stats = await handle.stat({ bigint: true });
      if (stats.isSymbolicLink()) throw new Error("base_artifact_alias_not_allowed");
      const handleIdentity: CanonicalTargetIdentity = {
        identityScheme: process.platform === "win32" ? "WINDOWS_FILE_ID" : "POSIX_DEVICE_INODE",
        volumeOrDevice: stats.dev.toString(),
        objectId: `${stats.ino.toString()}:${stats.birthtimeNs.toString()}`,
        observedAtEpochMs: request.observedAtEpochMs,
      };
      if (!sameIdentity(handleIdentity, this.#baseIdentity)) throw new Error("base_artifact_identity_changed");
      baseContent = await handle.readFile();
      const observedBaseHash = sha256(baseContent);
      appendEvent(this.#events, {
        eventType: "BASE_IDENTITY_VALIDATION", requestId, actorIdentity: this.#config.executorId,
        authority: "MODIFY_SANDBOX_CONTENT", resourceIdentity: this.#config.baseArtifact.canonicalPath,
        objectIdentity: identityKey(handleIdentity), result: "VERIFIED", baseHash: observedBaseHash, resultHash: null, byteLength: baseContent.byteLength,
      });
      if (observedBaseHash !== request.expectedBaseHash || observedBaseHash !== this.#config.baseArtifact.contentHash) {
        appendEvent(this.#events, {
          eventType: "BASE_HASH_VALIDATION", requestId, actorIdentity: this.#config.executorId,
          authority: "MODIFY_SANDBOX_CONTENT", resourceIdentity: this.#config.baseArtifact.canonicalPath,
          objectIdentity: identityKey(handleIdentity), result: "STALE", baseHash: observedBaseHash, resultHash: null, byteLength: baseContent.byteLength,
        });
        await handle.close();
        handle = null;
        return this.#result("STALE_REJECTED", "observed_base_hash_changed", null);
      }
      appendEvent(this.#events, {
        eventType: "BASE_HASH_VALIDATION", requestId, actorIdentity: this.#config.executorId,
        authority: "MODIFY_SANDBOX_CONTENT", resourceIdentity: this.#config.baseArtifact.canonicalPath,
        objectIdentity: identityKey(handleIdentity), result: "VERIFIED", baseHash: observedBaseHash, resultHash: null, byteLength: baseContent.byteLength,
      });
      const resultHash = sha256(replacement);
      await handle.truncate(0);
      await handle.write(replacement, 0, replacement.byteLength, 0);
      await handle.sync();
      const observedReplacement = await readFile(this.#config.baseArtifact.canonicalPath);
      const [pathIdentity, canonicalTarget] = await Promise.all([
        observeIdentity(this.#config.baseArtifact.canonicalPath, request.observedAtEpochMs),
        realpath(this.#config.baseArtifact.canonicalPath),
      ]);
      if (canonicalTarget !== this.#config.baseArtifact.canonicalPath || !sameIdentity(pathIdentity, this.#baseIdentity)
        || observedReplacement.byteLength !== replacement.byteLength || sha256(observedReplacement) !== resultHash) {
        throw new Error("modification_postcondition_failed");
      }
      appendEvent(this.#events, {
        eventType: "CONTENT_MODIFICATION", requestId, actorIdentity: this.#config.executorId,
        authority: "MODIFY_SANDBOX_CONTENT", resourceIdentity: canonicalTarget, objectIdentity: identityKey(pathIdentity), result: "SUCCEEDED",
        baseHash: observedBaseHash, resultHash, byteLength: replacement.byteLength,
      });
      appendEvent(this.#events, {
        eventType: "MODIFICATION_POSTCONDITION", requestId, actorIdentity: this.#config.executorId,
        authority: "MODIFY_SANDBOX_CONTENT", resourceIdentity: canonicalTarget, objectIdentity: identityKey(pathIdentity), result: "VERIFIED",
        baseHash: observedBaseHash, resultHash, byteLength: replacement.byteLength,
      });
      await handle.close();
      handle = null;
      this.#artifact = Object.freeze({
        ...this.#config.baseArtifact,
        objectIdentity: pathIdentity,
        previousContentHash: observedBaseHash,
        contentHash: resultHash,
        byteLength: replacement.byteLength,
        modificationRequestId: request.requestId,
      });
      return this.#result("MODIFIED", "stale_safe_content_modification_verified", this.#artifact);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "content_modification_failed";
      if (handle && baseContent) {
        try {
          await handle.truncate(0);
          await handle.write(baseContent, 0, baseContent.byteLength, 0);
          await handle.sync();
          const restored = Buffer.alloc(baseContent.byteLength);
          const { bytesRead } = baseContent.byteLength === 0
            ? { bytesRead: 0 }
            : await handle.read(restored, 0, baseContent.byteLength, 0);
          if (bytesRead !== baseContent.byteLength || sha256(restored) !== sha256(baseContent)) throw new Error("base_restore_postcondition_failed");
        } catch {
          this.#revoked = true;
          await handle.close().catch(() => undefined);
          return this.#result("QUARANTINED", `${reason};base_restore_failed`, null);
        }
      }
      if (handle) await handle.close().catch(() => undefined);
      if (reason === "modification_postcondition_failed" || reason.includes("identity_changed") || reason.includes("alias_not_allowed")) {
        this.#revoked = true;
        return this.#result("QUARANTINED", `${reason};base_restore_verified_but_target_trust_lost`, null);
      }
      return this.#result("REJECTED", `${reason};base_restore_verified`, null);
    }
  }

  async terminateWithOwnedCleanup(request: R2ATerminationRequest): Promise<R2CTerminationResult> {
    if (this.#revoked || !this.#artifact) return this.#terminationResult("REJECTED", "no_active_modified_artifact", null);
    if (!this.#config.lifecycle.authorizesTermination(request, this.#config.sandbox)) {
      return this.#terminationResult("REJECTED", "sandbox_termination_binding_mismatch", null);
    }
    try {
      const [identity, canonicalTarget, content] = await Promise.all([
        observeIdentity(this.#artifact.canonicalPath, request.observedAtEpochMs),
        realpath(this.#artifact.canonicalPath),
        readFile(this.#artifact.canonicalPath),
      ]);
      if (canonicalTarget !== this.#artifact.canonicalPath || !sameIdentity(identity, this.#artifact.objectIdentity)) throw new Error("modified_artifact_identity_changed");
      if (content.byteLength !== this.#artifact.byteLength || sha256(content) !== this.#artifact.contentHash) throw new Error("modified_artifact_content_changed");
      await unlink(this.#artifact.canonicalPath);
      try {
        await lstat(this.#artifact.canonicalPath);
        throw new Error("modified_artifact_cleanup_postcondition_failed");
      } catch (error) {
        if (errorCode(error) !== "ENOENT") throw error;
      }
      appendEvent(this.#events, {
        eventType: "MODIFIED_CONTENT_CLEANUP", requestId: this.#artifact.modificationRequestId, actorIdentity: this.#config.executorId,
        authority: "TRUSTED_LIFECYCLE_CLEANUP", resourceIdentity: this.#artifact.canonicalPath,
        objectIdentity: identityKey(identity), result: "VERIFIED", baseHash: this.#artifact.previousContentHash,
        resultHash: this.#artifact.contentHash, byteLength: this.#artifact.byteLength,
      });
      this.#revoked = true;
      appendEvent(this.#events, {
        eventType: "MODIFICATION_CAPABILITY_REVOCATION", requestId: this.#artifact.modificationRequestId, actorIdentity: this.#config.executorId,
        authority: "TRUSTED_LIFECYCLE_CLEANUP", resourceIdentity: this.#artifact.canonicalPath,
        objectIdentity: identityKey(identity), result: "REVOKED", baseHash: this.#artifact.previousContentHash,
        resultHash: this.#artifact.contentHash, byteLength: this.#artifact.byteLength,
      });
      const lifecycleResult = await this.#config.lifecycle.terminate(request);
      return this.#terminationResult(
        lifecycleResult.decision === "TERMINATED" ? "TERMINATED" : "QUARANTINED",
        lifecycleResult.decision === "TERMINATED" ? "modified_file_and_sandbox_cleanup_verified" : `sandbox_cleanup_${lifecycleResult.reason}`,
        lifecycleResult,
      );
    } catch (error) {
      this.#revoked = true;
      return this.#terminationResult("QUARANTINED", error instanceof Error ? error.message : "modified_cleanup_failed", null);
    }
  }

  #validateRequest(request: R2CModifyRequest, byteLength: number): readonly string[] {
    const issues: string[] = [];
    if (this.#revoked) issues.push("modification_capability_revoked");
    if (this.#artifact) issues.push("single_use_modification_capability_already_used");
    if (request.schemaVersion !== 1 || typeof request.requestId !== "string" || !request.requestId.trim()
      || typeof request.expectedBaseHash !== "string" || typeof request.replacementContent !== "string"
      || typeof request.issuer !== "string" || typeof request.auditIdentity !== "string") issues.push("modification_request_malformed");
    if (request.authority !== "MODIFY_SANDBOX_CONTENT") issues.push("modification_authority_mismatch");
    if (request.sandboxId !== this.#config.sandbox.sandboxId || request.artifactId !== this.#config.baseArtifact.artifactId) issues.push("artifact_binding_mismatch");
    if (request.capabilityId !== this.#config.capability.capabilityId
      || request.issuer !== this.#config.capability.issuer
      || request.auditIdentity !== this.#config.capability.auditIdentity) issues.push("modification_capability_identity_mismatch");
    if (!Number.isFinite(request.observedAtEpochMs)
      || request.observedAtEpochMs < this.#config.capability.issuedAtEpochMs
      || request.observedAtEpochMs >= this.#config.capability.expiresAtEpochMs
      || request.observedAtEpochMs >= this.#config.sandbox.expiresAtEpochMs) issues.push("modification_capability_expired");
    if (request.expectedBaseHash !== this.#config.baseArtifact.contentHash) issues.push("expected_base_hash_mismatch");
    if (byteLength > this.#config.maxFileBytes) issues.push("replacement_byte_limit_exceeded");
    if (!this.#config.lifecycle.ownsActiveSandbox(this.#config.sandbox)) issues.push("sandbox_not_active");
    return Object.freeze([...new Set(issues)]);
  }

  #result(decision: R2CModifyResult["decision"], reason: string, artifact: R2CModifiedArtifact | null): R2CModifyResult {
    return Object.freeze({ decision, reason, artifact, events: Object.freeze([...this.#events]), evidenceClass: "E3", authorityGranted: false });
  }

  #terminationResult(
    decision: R2CTerminationResult["decision"],
    reason: string,
    lifecycleResult: R2AOperationResult | null,
  ): R2CTerminationResult {
    return Object.freeze({ decision, reason, modificationEvents: Object.freeze([...this.#events]), lifecycleResult, evidenceClass: "E3", authorityGranted: false });
  }
}
