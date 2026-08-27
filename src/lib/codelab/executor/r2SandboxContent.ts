import { createHash } from "node:crypto";
import { lstat, open, readFile, realpath, unlink } from "node:fs/promises";
import { extname, isAbsolute, join } from "node:path";
import {
  R2AIsolatedSandboxLifecycle,
  type R2AOperationResult,
  type R2AProvisionedSandbox,
  type R2ATerminationRequest,
} from "./r2SandboxLifecycle";
import type { CanonicalTargetIdentity } from "./r2ProvisioningBlueprint";

export const R2_B_ISOLATED_CANDIDATE_STATUS = Object.freeze({
  chunkId: "OMEGA-R2-B-ISOLATED-001",
  securityClosure: "BLOCKED_EXTERNAL",
  maturity: "IMPLEMENTED_AND_VERIFIED_IN_ISOLATION",
  newCapability: "BOUNDED_SANDBOX_CONTENT_CREATION",
  candidateCapabilities: Object.freeze(["WRITE_SANDBOX_CONTENT"] as const),
  unavailableCapabilities: Object.freeze(["MODIFY_SANDBOX_CONTENT", "DELETE_SANDBOX_CONTENT", "WRITE_SANDBOX"] as const),
  forbiddenCapabilities: Object.freeze(["WRITE_REPOSITORY", "SHELL", "NETWORK", "CREDENTIAL_ACCESS", "PACKAGE_INSTALL", "DEPLOYMENT"] as const),
  authorityGranted: false,
  productionEligible: false,
} as const);

export interface R2BProcessLocalCapability {
  readonly capabilityId: string;
  readonly issuer: string;
  readonly auditIdentity: string;
  readonly issuedAtEpochMs: number;
  readonly expiresAtEpochMs: number;
}

export interface R2BContentPolicy {
  readonly maxFileBytes: number;
  readonly allowedExtensions: readonly string[];
}

export interface R2BIsolatedContentConfig {
  readonly executorId: string;
  readonly candidateCommit: string;
  readonly evaluatorVersion: string;
  readonly environmentIdentity: string;
  readonly authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED";
  readonly repositoryRoot: string;
  readonly sandbox: R2AProvisionedSandbox;
  readonly lifecycle: R2AIsolatedSandboxLifecycle;
  readonly capability: R2BProcessLocalCapability;
  readonly policy?: R2BContentPolicy;
}

export interface R2BCreateFileRequest {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly sandboxId: string;
  readonly capabilityId: string;
  readonly authority: "WRITE_SANDBOX_CONTENT";
  readonly relativePath: string;
  readonly content: string;
  readonly issuer: string;
  readonly auditIdentity: string;
  readonly observedAtEpochMs: number;
}

export type R2BContentEventType =
  | "CONTENT_REQUEST"
  | "CONTENT_AUTHORIZATION"
  | "NEW_FILE_PRECONDITION"
  | "CONTENT_WRITE"
  | "CONTENT_POSTCONDITION"
  | "CONTENT_CLEANUP"
  | "CONTENT_CAPABILITY_REVOCATION";

export interface R2BContentEvent {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly eventType: R2BContentEventType;
  readonly requestId: string;
  readonly actorIdentity: string;
  readonly authority: "WRITE_SANDBOX_CONTENT" | "TRUSTED_LIFECYCLE_CLEANUP";
  readonly resourceIdentity: string;
  readonly objectIdentity: string | null;
  readonly result: "REQUESTED" | "AUTHORIZED" | "DENIED" | "ABSENT" | "SUCCEEDED" | "VERIFIED" | "REVOKED";
  readonly contentHash: string | null;
  readonly byteLength: number | null;
  readonly evidenceRef: string;
  readonly previousHash: string;
  readonly eventHash: string;
}

export interface R2BCreatedArtifact {
  readonly artifactId: string;
  readonly requestId: string;
  readonly canonicalPath: string;
  readonly objectIdentity: CanonicalTargetIdentity;
  readonly contentHash: string;
  readonly byteLength: number;
}

export interface R2BCreateResult {
  readonly decision: "CREATED" | "REJECTED" | "QUARANTINED";
  readonly reason: string;
  readonly artifact: R2BCreatedArtifact | null;
  readonly events: readonly R2BContentEvent[];
  readonly evidenceClass: "E3";
  readonly authorityGranted: false;
}

export interface R2BTerminationResult {
  readonly decision: "TERMINATED" | "REJECTED" | "QUARANTINED";
  readonly reason: string;
  readonly contentEvents: readonly R2BContentEvent[];
  readonly lifecycleResult: R2AOperationResult | null;
  readonly evidenceClass: "E3";
  readonly authorityGranted: false;
}

const DEFAULT_POLICY: R2BContentPolicy = Object.freeze({
  maxFileBytes: 1_000_000,
  allowedExtensions: Object.freeze([".ts", ".tsx", ".js", ".json", ".md", ".txt"]),
});

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

function validLeaf(value: unknown): value is string {
  return typeof value === "string"
    && value.trim().length > 0
    && !value.includes("\0")
    && !value.includes("/")
    && !value.includes("\\")
    && !isAbsolute(value)
    && !/^[A-Za-z]:/.test(value)
    && value !== "."
    && value !== "..";
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
  events: R2BContentEvent[],
  input: Omit<R2BContentEvent, "schemaVersion" | "eventId" | "previousHash" | "eventHash" | "evidenceRef">,
): R2BContentEvent {
  const sequence = events.length + 1;
  const base: Omit<R2BContentEvent, "eventHash"> = {
    schemaVersion: 1,
    eventId: `R2B-${input.requestId}-${String(sequence).padStart(2, "0")}-${input.eventType}`,
    ...input,
    evidenceRef: `r2b-local://${input.requestId}/${String(sequence).padStart(2, "0")}/${input.eventType.toLowerCase()}`,
    previousHash: events.at(-1)?.eventHash ?? "GENESIS",
  };
  const event = Object.freeze({ ...base, eventHash: sha256(canonical(base)) });
  events.push(event);
  return event;
}

export class R2BIsolatedContentCreator {
  readonly #config: R2BIsolatedContentConfig;
  readonly #policy: R2BContentPolicy;
  readonly #sandboxIdentity: CanonicalTargetIdentity;
  readonly #events: R2BContentEvent[] = [];
  #artifact: R2BCreatedArtifact | null = null;
  #revoked = false;

  private constructor(config: R2BIsolatedContentConfig, policy: R2BContentPolicy, sandboxIdentity: CanonicalTargetIdentity) {
    this.#config = config;
    this.#policy = policy;
    this.#sandboxIdentity = sandboxIdentity;
  }

  static async create(config: R2BIsolatedContentConfig, observedAtEpochMs = Date.now()): Promise<R2BIsolatedContentCreator> {
    const policy = config.policy ?? DEFAULT_POLICY;
    if (config.authorityMode !== "ISOLATED_CANDIDATE_NOT_GRANTED") throw new Error("production_authority_not_permitted");
    if (!/^[0-9a-f]{40}$/.test(config.candidateCommit)) throw new Error("candidate_commit_must_be_exact");
    if (!config.executorId.trim() || !config.evaluatorVersion.trim() || !config.environmentIdentity.trim()
      || !config.capability.capabilityId.trim() || !config.capability.issuer.trim() || !config.capability.auditIdentity.trim()) {
      throw new Error("isolated_candidate_identity_missing");
    }
    if (!Number.isFinite(config.capability.issuedAtEpochMs) || !Number.isFinite(config.capability.expiresAtEpochMs)
      || config.capability.expiresAtEpochMs <= config.capability.issuedAtEpochMs) throw new Error("capability_lifetime_invalid");
    if (!Number.isInteger(policy.maxFileBytes) || policy.maxFileBytes < 1 || policy.allowedExtensions.length === 0) throw new Error("content_policy_invalid");
    if (!config.lifecycle.ownsActiveSandbox(config.sandbox)) throw new Error("sandbox_not_owned_by_active_lifecycle");
    if (!Number.isFinite(observedAtEpochMs) || observedAtEpochMs >= config.sandbox.expiresAtEpochMs) throw new Error("sandbox_lifetime_expired");
    const canonicalSandbox = await realpath(config.sandbox.canonicalPath);
    if (canonicalSandbox !== config.sandbox.canonicalPath) throw new Error("sandbox_canonical_path_changed");
    const sandboxIdentity = await observeIdentity(canonicalSandbox, observedAtEpochMs);
    if (!sameIdentity(sandboxIdentity, config.sandbox.objectIdentity)) throw new Error("sandbox_identity_changed");
    return new R2BIsolatedContentCreator(config, Object.freeze({ ...policy, allowedExtensions: Object.freeze([...policy.allowedExtensions]) }), sandboxIdentity);
  }

  capabilityProfile(): typeof R2_B_ISOLATED_CANDIDATE_STATUS & { readonly revoked: boolean; readonly artifactCreated: boolean } {
    return Object.freeze({ ...R2_B_ISOLATED_CANDIDATE_STATUS, revoked: this.#revoked, artifactCreated: this.#artifact !== null });
  }

  transferOwnedArtifactToModifier(artifact: R2BCreatedArtifact): boolean {
    if (this.#revoked || !this.#artifact) return false;
    const matches = this.#artifact.artifactId === artifact.artifactId
      && this.#artifact.canonicalPath === artifact.canonicalPath
      && this.#artifact.contentHash === artifact.contentHash
      && this.#artifact.byteLength === artifact.byteLength
      && sameIdentity(this.#artifact.objectIdentity, artifact.objectIdentity)
      && this.#config.lifecycle.ownsActiveSandbox(this.#config.sandbox);
    if (!matches) return false;
    this.#revoked = true;
    return true;
  }

  async createFile(request: R2BCreateFileRequest): Promise<R2BCreateResult> {
    const requestId = typeof request.requestId === "string" && request.requestId.trim() ? request.requestId : "MALFORMED";
    const relativePath = typeof request.relativePath === "string" ? request.relativePath : "INVALID";
    const target = join(this.#config.sandbox.canonicalPath, relativePath || "INVALID");
    appendEvent(this.#events, {
      eventType: "CONTENT_REQUEST", requestId, actorIdentity: typeof request.issuer === "string" && request.issuer ? request.issuer : "UNKNOWN",
      authority: "WRITE_SANDBOX_CONTENT", resourceIdentity: target, objectIdentity: null, result: "REQUESTED", contentHash: null, byteLength: null,
    });
    const content = Buffer.from(typeof request.content === "string" ? request.content : "", "utf8");
    const issues = this.#validateRequest(request, content.byteLength);
    if (issues.length > 0) {
      appendEvent(this.#events, {
        eventType: "CONTENT_AUTHORIZATION", requestId, actorIdentity: this.#config.executorId,
        authority: "WRITE_SANDBOX_CONTENT", resourceIdentity: target, objectIdentity: null, result: "DENIED", contentHash: null, byteLength: content.byteLength,
      });
      return this.#createResult("REJECTED", issues.join(","), null);
    }
    appendEvent(this.#events, {
      eventType: "CONTENT_AUTHORIZATION", requestId: request.requestId, actorIdentity: this.#config.executorId,
      authority: "WRITE_SANDBOX_CONTENT", resourceIdentity: target, objectIdentity: null, result: "AUTHORIZED", contentHash: null, byteLength: content.byteLength,
    });
    let createdByThisCall = false;
    let handle: Awaited<ReturnType<typeof open>> | null = null;
    const expectedHash = sha256(content);
    try {
      const [sandboxAtUse, canonicalSandbox] = await Promise.all([
        observeIdentity(this.#config.sandbox.canonicalPath, request.observedAtEpochMs),
        realpath(this.#config.sandbox.canonicalPath),
      ]);
      if (!sameIdentity(sandboxAtUse, this.#sandboxIdentity)
        || canonicalSandbox !== this.#config.sandbox.canonicalPath
        || !this.#config.lifecycle.ownsActiveSandbox(this.#config.sandbox)) throw new Error("sandbox_identity_changed");
      try {
        await lstat(target);
        throw new Error("new_file_precondition_failed_target_exists");
      } catch (error) {
        if (errorCode(error) !== "ENOENT") throw error;
      }
      appendEvent(this.#events, {
        eventType: "NEW_FILE_PRECONDITION", requestId: request.requestId, actorIdentity: this.#config.executorId,
        authority: "WRITE_SANDBOX_CONTENT", resourceIdentity: target, objectIdentity: null, result: "ABSENT", contentHash: expectedHash, byteLength: content.byteLength,
      });
      handle = await open(target, "wx", 0o600);
      createdByThisCall = true;
      await handle.writeFile(content);
      await handle.sync();
      await handle.close();
      handle = null;
      const canonicalTarget = await realpath(target);
      const [objectIdentity, parentAfterWrite, observedContent] = await Promise.all([
        observeIdentity(canonicalTarget, request.observedAtEpochMs),
        observeIdentity(this.#config.sandbox.canonicalPath, request.observedAtEpochMs),
        readFile(canonicalTarget),
      ]);
      if (canonicalTarget !== target || !sameIdentity(parentAfterWrite, this.#sandboxIdentity)) throw new Error("content_target_identity_changed");
      if (observedContent.byteLength !== content.byteLength || sha256(observedContent) !== expectedHash) throw new Error("content_postcondition_failed");
      appendEvent(this.#events, {
        eventType: "CONTENT_WRITE", requestId: request.requestId, actorIdentity: this.#config.executorId,
        authority: "WRITE_SANDBOX_CONTENT", resourceIdentity: canonicalTarget, objectIdentity: identityKey(objectIdentity), result: "SUCCEEDED",
        contentHash: expectedHash, byteLength: content.byteLength,
      });
      appendEvent(this.#events, {
        eventType: "CONTENT_POSTCONDITION", requestId: request.requestId, actorIdentity: this.#config.executorId,
        authority: "WRITE_SANDBOX_CONTENT", resourceIdentity: canonicalTarget, objectIdentity: identityKey(objectIdentity), result: "VERIFIED",
        contentHash: expectedHash, byteLength: content.byteLength,
      });
      this.#artifact = Object.freeze({
        artifactId: `artifact://${request.capabilityId}/${request.requestId}`,
        requestId: request.requestId,
        canonicalPath: canonicalTarget,
        objectIdentity,
        contentHash: expectedHash,
        byteLength: content.byteLength,
      });
      return this.#createResult("CREATED", "bounded_new_file_created_and_verified", this.#artifact);
    } catch (error) {
      if (handle) await handle.close().catch(() => undefined);
      const reason = error instanceof Error ? error.message : "content_creation_failed";
      if (!createdByThisCall) return this.#createResult("REJECTED", reason, null);
      const rollbackVerified = await this.#rollbackFailedCreation(target, expectedHash, request.observedAtEpochMs);
      if (rollbackVerified) return this.#createResult("REJECTED", `${reason};failed_creation_rollback_verified`, null);
      this.#revoked = true;
      return this.#createResult("QUARANTINED", `${reason};failed_creation_cleanup_unverified`, null);
    }
  }

  async terminateWithOwnedCleanup(request: R2ATerminationRequest): Promise<R2BTerminationResult> {
    if (this.#revoked || !this.#artifact) return this.#terminationResult("REJECTED", "no_active_owned_artifact", null);
    if (!this.#config.lifecycle.authorizesTermination(request, this.#config.sandbox)) {
      return this.#terminationResult("REJECTED", "sandbox_termination_binding_mismatch", null);
    }
    try {
      const [sandboxAtUse, objectAtUse, canonicalTarget, observedContent] = await Promise.all([
        observeIdentity(this.#config.sandbox.canonicalPath, request.observedAtEpochMs),
        observeIdentity(this.#artifact.canonicalPath, request.observedAtEpochMs),
        realpath(this.#artifact.canonicalPath),
        readFile(this.#artifact.canonicalPath),
      ]);
      if (!sameIdentity(sandboxAtUse, this.#sandboxIdentity)
        || canonicalTarget !== this.#artifact.canonicalPath
        || !sameIdentity(objectAtUse, this.#artifact.objectIdentity)) throw new Error("owned_artifact_identity_changed");
      if (observedContent.byteLength !== this.#artifact.byteLength || sha256(observedContent) !== this.#artifact.contentHash) {
        throw new Error("owned_artifact_content_changed");
      }
      await unlink(this.#artifact.canonicalPath);
      try {
        await lstat(this.#artifact.canonicalPath);
        throw new Error("owned_artifact_cleanup_postcondition_failed");
      } catch (error) {
        if (errorCode(error) !== "ENOENT") throw error;
      }
      appendEvent(this.#events, {
        eventType: "CONTENT_CLEANUP", requestId: this.#artifact.requestId, actorIdentity: this.#config.executorId,
        authority: "TRUSTED_LIFECYCLE_CLEANUP", resourceIdentity: this.#artifact.canonicalPath,
        objectIdentity: identityKey(objectAtUse), result: "VERIFIED", contentHash: this.#artifact.contentHash, byteLength: this.#artifact.byteLength,
      });
      this.#revoked = true;
      appendEvent(this.#events, {
        eventType: "CONTENT_CAPABILITY_REVOCATION", requestId: this.#artifact.requestId, actorIdentity: this.#config.executorId,
        authority: "TRUSTED_LIFECYCLE_CLEANUP", resourceIdentity: this.#artifact.canonicalPath,
        objectIdentity: identityKey(objectAtUse), result: "REVOKED", contentHash: this.#artifact.contentHash, byteLength: this.#artifact.byteLength,
      });
      const lifecycleResult = await this.#config.lifecycle.terminate(request);
      return this.#terminationResult(
        lifecycleResult.decision === "TERMINATED" ? "TERMINATED" : "QUARANTINED",
        lifecycleResult.decision === "TERMINATED" ? "owned_file_and_sandbox_cleanup_verified" : `sandbox_cleanup_${lifecycleResult.reason}`,
        lifecycleResult,
      );
    } catch (error) {
      this.#revoked = true;
      return this.#terminationResult("QUARANTINED", error instanceof Error ? error.message : "owned_cleanup_failed", null);
    }
  }

  #validateRequest(request: R2BCreateFileRequest, byteLength: number): readonly string[] {
    const issues: string[] = [];
    if (this.#revoked) issues.push("content_capability_revoked");
    if (this.#artifact) issues.push("single_use_content_capability_already_used");
    if (request.schemaVersion !== 1 || typeof request.requestId !== "string" || !request.requestId.trim()
      || typeof request.relativePath !== "string" || typeof request.content !== "string"
      || typeof request.issuer !== "string" || typeof request.auditIdentity !== "string") issues.push("content_request_malformed");
    if (request.authority !== "WRITE_SANDBOX_CONTENT") issues.push("content_authority_mismatch");
    if (request.sandboxId !== this.#config.sandbox.sandboxId) issues.push("sandbox_binding_mismatch");
    if (request.capabilityId !== this.#config.capability.capabilityId
      || request.issuer !== this.#config.capability.issuer
      || request.auditIdentity !== this.#config.capability.auditIdentity) issues.push("content_capability_identity_mismatch");
    if (!Number.isFinite(request.observedAtEpochMs)
      || request.observedAtEpochMs < this.#config.capability.issuedAtEpochMs
      || request.observedAtEpochMs >= this.#config.capability.expiresAtEpochMs
      || request.observedAtEpochMs >= this.#config.sandbox.expiresAtEpochMs) issues.push("content_capability_expired");
    if (!validLeaf(request.relativePath)) issues.push("invalid_content_leaf_name");
    const extension = typeof request.relativePath === "string" ? extname(request.relativePath).toLowerCase() : "";
    if (!this.#policy.allowedExtensions.includes(extension)) issues.push("content_extension_not_allowed");
    if (byteLength > this.#policy.maxFileBytes) issues.push("content_byte_limit_exceeded");
    if (!this.#config.lifecycle.ownsActiveSandbox(this.#config.sandbox)) issues.push("sandbox_not_active");
    return Object.freeze([...new Set(issues)]);
  }

  async #rollbackFailedCreation(target: string, expectedHash: string, observedAtEpochMs: number): Promise<boolean> {
    try {
      const [sandboxAtUse, canonicalTarget, content] = await Promise.all([
        observeIdentity(this.#config.sandbox.canonicalPath, observedAtEpochMs),
        realpath(target),
        readFile(target),
      ]);
      if (!sameIdentity(sandboxAtUse, this.#sandboxIdentity) || canonicalTarget !== target || sha256(content) !== expectedHash) return false;
      await unlink(canonicalTarget);
      try {
        await lstat(canonicalTarget);
        return false;
      } catch (error) {
        return errorCode(error) === "ENOENT";
      }
    } catch {
      return false;
    }
  }

  #createResult(decision: R2BCreateResult["decision"], reason: string, artifact: R2BCreatedArtifact | null): R2BCreateResult {
    return Object.freeze({ decision, reason, artifact, events: Object.freeze([...this.#events]), evidenceClass: "E3", authorityGranted: false });
  }

  #terminationResult(
    decision: R2BTerminationResult["decision"],
    reason: string,
    lifecycleResult: R2AOperationResult | null,
  ): R2BTerminationResult {
    return Object.freeze({ decision, reason, contentEvents: Object.freeze([...this.#events]), lifecycleResult, evidenceClass: "E3", authorityGranted: false });
  }
}
