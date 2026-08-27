import { createHash } from "node:crypto";
import { lstat, mkdir, readdir, realpath, rmdir } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import {
  OMEGA_R2_A_IMPLSPEC_001,
  validateSandboxProvisionRequest,
  type CanonicalTargetIdentity,
  type SandboxPolicy,
  type SandboxProvisionRequest,
} from "./r2ProvisioningBlueprint";

export type R2AAuditEventType =
  | "REQUEST"
  | "AUTHORIZATION"
  | "PARENT_IDENTITY_VALIDATION"
  | "DISJOINTNESS_VALIDATION"
  | "PROVISION"
  | "CREATED_OBJECT_IDENTITY"
  | "TERMINATION_REQUEST"
  | "CLEANUP"
  | "POST_CLEANUP_OBSERVATION"
  | "REVOCATION";

export interface R2AAuditEvent {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly eventType: R2AAuditEventType;
  readonly requestId: string;
  readonly actorIdentity: string;
  readonly authority: string;
  readonly resourceIdentity: string;
  readonly objectIdentity: string | null;
  readonly result: "REQUESTED" | "AUTHORIZED" | "DENIED" | "SUCCEEDED" | "FAILED" | "OBSERVED_CLEAN" | "REVOKED";
  readonly evidenceRef: string;
  readonly previousHash: string;
  readonly eventHash: string;
}

export const R2_A_ISOLATED_CANDIDATE_STATUS = Object.freeze({
  chunkId: "OMEGA-R2-A-OPERATIONAL-001",
  securityClosure: "BLOCKED_EXTERNAL",
  maturity: "IMPLEMENTED_AND_VERIFIED_IN_ISOLATION",
  newCapability: "DISPOSABLE_SANDBOX_LIFECYCLE",
  candidateCapabilities: Object.freeze(["PROVISION_SANDBOX", "TERMINATE_SANDBOX"] as const),
  unavailableCapabilities: Object.freeze(["WRITE_SANDBOX", "WRITE_SANDBOX_CONTENT"] as const),
  forbiddenCapabilities: Object.freeze(["WRITE_REPOSITORY", "SHELL", "NETWORK", "CREDENTIAL_ACCESS", "PACKAGE_INSTALL", "DEPLOYMENT"] as const),
  authorityGranted: false,
  productionEligible: false,
} as const);

export interface R2AProcessLocalCapability {
  readonly capabilityId: string;
  readonly issuer: string;
  readonly auditIdentity: string;
  readonly issuedAtEpochMs: number;
  readonly expiresAtEpochMs: number;
}

export interface R2AIsolatedLifecycleConfig {
  readonly executorId: string;
  readonly candidateCommit: string;
  readonly capabilityVersion: "r2-a/1";
  readonly evaluatorVersion: string;
  readonly environmentIdentity: string;
  readonly authorityMode: "ISOLATED_CANDIDATE_NOT_GRANTED";
  readonly repositoryRoot: string;
  readonly approvedSandboxRoot: string;
  readonly capability: R2AProcessLocalCapability;
  readonly policy?: SandboxPolicy;
}

export interface R2ATerminationRequest {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly capabilityId: string;
  readonly authority: "TERMINATE_SANDBOX";
  readonly issuer: string;
  readonly auditIdentity: string;
  readonly observedAtEpochMs: number;
}

export interface R2AProvisionedSandbox {
  readonly sandboxId: string;
  readonly requestId: string;
  readonly canonicalPath: string;
  readonly objectIdentity: CanonicalTargetIdentity;
  readonly createdAtEpochMs: number;
  readonly expiresAtEpochMs: number;
}

export interface R2AOperationResult {
  readonly decision: "PROVISIONED" | "TERMINATED" | "REJECTED" | "QUARANTINED";
  readonly reason: string;
  readonly sandbox: R2AProvisionedSandbox | null;
  readonly events: readonly R2AAuditEvent[];
  readonly evidenceClass: "E3";
  readonly authorityGranted: false;
}

interface ActiveSession {
  readonly sandbox: R2AProvisionedSandbox;
  readonly parentIdentity: CanonicalTargetIdentity;
  readonly events: R2AAuditEvent[];
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

function hashEvent(event: Omit<R2AAuditEvent, "eventHash">): string {
  return createHash("sha256").update(canonical(event), "utf8").digest("hex");
}

function identityKey(identity: CanonicalTargetIdentity): string {
  return `${identity.identityScheme}:${identity.volumeOrDevice}:${identity.objectId}`;
}

function within(root: string, candidate: string): boolean {
  const delta = relative(root, candidate);
  return delta === "" || (!delta.startsWith(`..${sep}`) && delta !== ".." && !isAbsolute(delta));
}

function disjoint(left: string, right: string): boolean {
  return !within(left, right) && !within(right, left);
}

function validLeafName(value: string): boolean {
  if (!nonEmpty(value) || value.includes("\0") || isAbsolute(value) || /^[A-Za-z]:/.test(value)) return false;
  return !value.includes("/") && !value.includes("\\") && value !== "." && value !== "..";
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

function sameIdentity(left: CanonicalTargetIdentity, right: CanonicalTargetIdentity): boolean {
  return identityKey(left) === identityKey(right);
}

function appendEvent(
  events: R2AAuditEvent[],
  input: Omit<R2AAuditEvent, "schemaVersion" | "eventId" | "previousHash" | "eventHash" | "evidenceRef">,
): R2AAuditEvent {
  const sequence = events.length + 1;
  const base: Omit<R2AAuditEvent, "eventHash"> = {
    schemaVersion: 1,
    eventId: `R2A-${input.requestId}-${String(sequence).padStart(2, "0")}-${input.eventType}`,
    ...input,
    evidenceRef: `r2a-local://${input.requestId}/${String(sequence).padStart(2, "0")}/${input.eventType.toLowerCase()}`,
    previousHash: events.at(-1)?.eventHash ?? "GENESIS",
  };
  const event = Object.freeze({ ...base, eventHash: hashEvent(base) });
  events.push(event);
  return event;
}

function validateConfig(config: R2AIsolatedLifecycleConfig): void {
  for (const value of [config.executorId, config.evaluatorVersion, config.environmentIdentity, config.capability.capabilityId, config.capability.issuer, config.capability.auditIdentity]) {
    if (!nonEmpty(value)) throw new Error("isolated_candidate_identity_missing");
  }
  if (!/^[0-9a-f]{40}$/.test(config.candidateCommit)) throw new Error("candidate_commit_must_be_exact");
  if (config.authorityMode !== "ISOLATED_CANDIDATE_NOT_GRANTED") throw new Error("production_authority_not_permitted");
  if (!isAbsolute(config.repositoryRoot) || !isAbsolute(config.approvedSandboxRoot)) throw new Error("roots_must_be_absolute");
  if (!Number.isFinite(config.capability.issuedAtEpochMs)
    || !Number.isFinite(config.capability.expiresAtEpochMs)
    || config.capability.expiresAtEpochMs <= config.capability.issuedAtEpochMs) throw new Error("capability_lifetime_invalid");
}

export class R2AIsolatedSandboxLifecycle {
  readonly #config: R2AIsolatedLifecycleConfig;
  readonly #policy: SandboxPolicy;
  readonly #repositoryRoot: string;
  readonly #sandboxRoot: string;
  readonly #repositoryIdentity: CanonicalTargetIdentity;
  readonly #rootIdentity: CanonicalTargetIdentity;
  readonly #active = new Map<string, ActiveSession>();
  readonly #usedTargets = new Set<string>();
  #capabilityRevoked = false;

  private constructor(
    config: R2AIsolatedLifecycleConfig,
    policy: SandboxPolicy,
    repositoryRoot: string,
    sandboxRoot: string,
    repositoryIdentity: CanonicalTargetIdentity,
    rootIdentity: CanonicalTargetIdentity,
  ) {
    this.#config = config;
    this.#policy = policy;
    this.#repositoryRoot = repositoryRoot;
    this.#sandboxRoot = sandboxRoot;
    this.#repositoryIdentity = repositoryIdentity;
    this.#rootIdentity = rootIdentity;
  }

  static async create(config: R2AIsolatedLifecycleConfig, observedAtEpochMs = Date.now()): Promise<R2AIsolatedSandboxLifecycle> {
    validateConfig(config);
    const policy = config.policy ?? OMEGA_R2_A_IMPLSPEC_001.policy;
    if (policy.allowContentMutation || policy.allowRepositoryMutation || policy.allowShell || policy.allowNetwork
      || policy.allowCredentials || policy.allowPackageInstall || policy.allowDeployment || policy.reuseAfterUnknownCleanup) {
      throw new Error("r2_a_policy_expands_authority");
    }
    const repositoryRoot = await realpath(resolve(config.repositoryRoot));
    const sandboxRoot = await realpath(resolve(config.approvedSandboxRoot));
    if (!disjoint(repositoryRoot, sandboxRoot)) throw new Error("sandbox_root_not_disjoint_from_repository");
    const [repositoryIdentity, rootIdentity, rootEntries] = await Promise.all([
      observeIdentity(repositoryRoot, observedAtEpochMs),
      observeIdentity(sandboxRoot, observedAtEpochMs),
      readdir(sandboxRoot),
    ]);
    if (sameIdentity(repositoryIdentity, rootIdentity)) throw new Error("sandbox_root_aliases_repository");
    if (rootEntries.length !== 0) throw new Error("approved_sandbox_root_must_start_empty");
    return new R2AIsolatedSandboxLifecycle(config, policy, repositoryRoot, sandboxRoot, repositoryIdentity, rootIdentity);
  }

  capabilityProfile(): typeof R2_A_ISOLATED_CANDIDATE_STATUS & { readonly revoked: boolean; readonly activeSandboxes: number } {
    return Object.freeze({ ...R2_A_ISOLATED_CANDIDATE_STATUS, revoked: this.#capabilityRevoked, activeSandboxes: this.#active.size });
  }

  async provision(request: SandboxProvisionRequest, nowEpochMs = Date.now()): Promise<R2AOperationResult> {
    const events: R2AAuditEvent[] = [];
    const requestedTarget = resolve(this.#sandboxRoot, request.requestedPath || "INVALID");
    appendEvent(events, {
      eventType: "REQUEST",
      requestId: request.requestId || "MALFORMED",
      actorIdentity: request.issuer || "UNKNOWN",
      authority: "PROVISION_SANDBOX",
      resourceIdentity: requestedTarget,
      objectIdentity: null,
      result: "REQUESTED",
    });
    const issues = this.#validateProvision(request, nowEpochMs);
    if (issues.length > 0) {
      appendEvent(events, {
        eventType: "AUTHORIZATION", requestId: request.requestId || "MALFORMED", actorIdentity: this.#config.executorId,
        authority: "PROVISION_SANDBOX", resourceIdentity: requestedTarget, objectIdentity: null, result: "DENIED",
      });
      return this.#result("REJECTED", issues.join(","), null, events);
    }
    appendEvent(events, {
      eventType: "AUTHORIZATION", requestId: request.requestId, actorIdentity: this.#config.executorId,
      authority: "PROVISION_SANDBOX", resourceIdentity: requestedTarget, objectIdentity: null, result: "AUTHORIZED",
    });

    let createdByThisCall = false;
    try {
      const [rootAtUse, canonicalRoot] = await Promise.all([observeIdentity(this.#sandboxRoot, nowEpochMs), realpath(this.#sandboxRoot)]);
      if (!sameIdentity(rootAtUse, this.#rootIdentity) || canonicalRoot !== this.#sandboxRoot) throw new Error("approved_root_identity_changed");
      appendEvent(events, {
        eventType: "PARENT_IDENTITY_VALIDATION", requestId: request.requestId, actorIdentity: this.#config.executorId,
        authority: "PROVISION_SANDBOX", resourceIdentity: this.#sandboxRoot, objectIdentity: identityKey(rootAtUse), result: "SUCCEEDED",
      });
      if (!within(this.#sandboxRoot, requestedTarget) || !disjoint(this.#repositoryRoot, requestedTarget)) throw new Error("sandbox_boundary_escape");
      appendEvent(events, {
        eventType: "DISJOINTNESS_VALIDATION", requestId: request.requestId, actorIdentity: this.#config.executorId,
        authority: "PROVISION_SANDBOX", resourceIdentity: requestedTarget, objectIdentity: null, result: "SUCCEEDED",
      });
      try {
        await lstat(requestedTarget);
        throw new Error("sandbox_target_already_exists");
      } catch (error) {
        if (errorCode(error) !== "ENOENT") throw error;
      }
      await mkdir(requestedTarget, { recursive: false });
      createdByThisCall = true;
      const canonicalTarget = await realpath(requestedTarget);
      const [createdIdentity, parentAfterCreate] = await Promise.all([
        observeIdentity(canonicalTarget, nowEpochMs),
        observeIdentity(this.#sandboxRoot, nowEpochMs),
      ]);
      if (canonicalTarget !== requestedTarget || !sameIdentity(parentAfterCreate, this.#rootIdentity)
        || sameIdentity(createdIdentity, this.#repositoryIdentity)) throw new Error("target_identity_changed_after_creation");
      appendEvent(events, {
        eventType: "PROVISION", requestId: request.requestId, actorIdentity: this.#config.executorId,
        authority: "PROVISION_SANDBOX", resourceIdentity: canonicalTarget, objectIdentity: identityKey(createdIdentity), result: "SUCCEEDED",
      });
      appendEvent(events, {
        eventType: "CREATED_OBJECT_IDENTITY", requestId: request.requestId, actorIdentity: this.#config.executorId,
        authority: "PROVISION_SANDBOX", resourceIdentity: canonicalTarget, objectIdentity: identityKey(createdIdentity), result: "SUCCEEDED",
      });
      const sandbox: R2AProvisionedSandbox = Object.freeze({
        sandboxId: `sandbox://${request.capabilityId}/${request.requestId}`,
        requestId: request.requestId,
        canonicalPath: canonicalTarget,
        objectIdentity: createdIdentity,
        createdAtEpochMs: nowEpochMs,
        expiresAtEpochMs: Math.min(request.expiresAtEpochMs, nowEpochMs + this.#policy.maxLifetimeMs),
      });
      this.#active.set(request.requestId, { sandbox, parentIdentity: parentAfterCreate, events });
      this.#usedTargets.add(canonicalTarget);
      return this.#result("PROVISIONED", "empty_disposable_sandbox_provisioned", sandbox, events);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "provision_failed";
      if (!createdByThisCall) return this.#result("REJECTED", reason, null, events);
      const rollbackVerified = await this.#rollbackFailedProvision(requestedTarget, nowEpochMs);
      if (rollbackVerified) return this.#result("REJECTED", `${reason};failed_provision_rollback_verified`, null, events);
      this.#capabilityRevoked = true;
      return this.#result("QUARANTINED", `${reason};failed_provision_cleanup_unverified`, null, events);
    }
  }

  async terminate(request: R2ATerminationRequest): Promise<R2AOperationResult> {
    const session = this.#active.get(request.requestId);
    if (!session) return this.#result("REJECTED", "unknown_or_stale_sandbox", null, []);
    const events = session.events;
    const authorized = request.schemaVersion === 1
      && request.authority === "TERMINATE_SANDBOX"
      && request.capabilityId === this.#config.capability.capabilityId
      && request.issuer === this.#config.capability.issuer
      && request.auditIdentity === this.#config.capability.auditIdentity
      && Number.isFinite(request.observedAtEpochMs);
    if (!authorized) return this.#result("REJECTED", "termination_authorization_rejected", session.sandbox, []);
    appendEvent(events, {
      eventType: "TERMINATION_REQUEST", requestId: request.requestId, actorIdentity: request.issuer,
      authority: "TERMINATE_SANDBOX", resourceIdentity: session.sandbox.canonicalPath,
      objectIdentity: identityKey(session.sandbox.objectIdentity), result: "REQUESTED",
    });
    try {
      const [rootAtUse, targetAtUse, canonicalTarget, entries] = await Promise.all([
        observeIdentity(this.#sandboxRoot, request.observedAtEpochMs),
        observeIdentity(session.sandbox.canonicalPath, request.observedAtEpochMs),
        realpath(session.sandbox.canonicalPath),
        readdir(session.sandbox.canonicalPath),
      ]);
      if (!sameIdentity(rootAtUse, this.#rootIdentity) || !sameIdentity(rootAtUse, session.parentIdentity)) throw new Error("parent_identity_changed");
      if (canonicalTarget !== session.sandbox.canonicalPath || !sameIdentity(targetAtUse, session.sandbox.objectIdentity)) throw new Error("target_identity_changed");
      if (entries.length !== 0) throw new Error("sandbox_not_empty_content_mutation_not_authorized");
      await rmdir(session.sandbox.canonicalPath);
      let existsAfter = true;
      try { await lstat(session.sandbox.canonicalPath); } catch (error) { if (errorCode(error) === "ENOENT") existsAfter = false; else throw error; }
      if (existsAfter) throw new Error("cleanup_postcondition_failed");
      appendEvent(events, {
        eventType: "CLEANUP", requestId: request.requestId, actorIdentity: this.#config.executorId,
        authority: "TERMINATE_SANDBOX", resourceIdentity: session.sandbox.canonicalPath,
        objectIdentity: identityKey(targetAtUse), result: "SUCCEEDED",
      });
      appendEvent(events, {
        eventType: "POST_CLEANUP_OBSERVATION", requestId: request.requestId, actorIdentity: this.#config.executorId,
        authority: "TERMINATE_SANDBOX", resourceIdentity: session.sandbox.canonicalPath,
        objectIdentity: identityKey(targetAtUse), result: "OBSERVED_CLEAN",
      });
      this.#capabilityRevoked = true;
      this.#active.delete(request.requestId);
      appendEvent(events, {
        eventType: "REVOCATION", requestId: request.requestId, actorIdentity: this.#config.executorId,
        authority: "TERMINATE_SANDBOX", resourceIdentity: session.sandbox.canonicalPath,
        objectIdentity: identityKey(targetAtUse), result: "REVOKED",
      });
      return this.#result("TERMINATED", "sandbox_removed_and_cleanup_verified", session.sandbox, events);
    } catch (error) {
      this.#capabilityRevoked = true;
      return this.#result("QUARANTINED", error instanceof Error ? error.message : "cleanup_failed", session.sandbox, events);
    }
  }

  #validateProvision(request: SandboxProvisionRequest, nowEpochMs: number): string[] {
    const issues = [...validateSandboxProvisionRequest(request, nowEpochMs).issues];
    if (this.#capabilityRevoked) issues.push("capability_revoked");
    if (this.#active.size > 0) issues.push("single_use_capability_already_active");
    if (request.capabilityId !== this.#config.capability.capabilityId
      || request.issuer !== this.#config.capability.issuer
      || request.auditIdentity !== this.#config.capability.auditIdentity) issues.push("capability_identity_mismatch");
    if (request.issuedAtEpochMs < this.#config.capability.issuedAtEpochMs
      || request.expiresAtEpochMs > this.#config.capability.expiresAtEpochMs
      || request.expiresAtEpochMs - request.issuedAtEpochMs > this.#policy.maxLifetimeMs) issues.push("capability_lifetime_exceeded");
    if (request.repositoryRoot !== this.#repositoryRoot || request.approvedSandboxRoot !== this.#sandboxRoot) issues.push("authorized_roots_mismatch");
    if (request.candidateBinding.commit !== this.#config.candidateCommit
      || request.candidateBinding.capabilityVersion !== this.#config.capabilityVersion
      || request.candidateBinding.evaluatorVersion !== this.#config.evaluatorVersion
      || request.candidateBinding.environmentIdentity !== this.#config.environmentIdentity) issues.push("candidate_binding_mismatch");
    if (!validLeafName(request.requestedPath)) issues.push("invalid_sandbox_leaf_name");
    const target = resolve(this.#sandboxRoot, request.requestedPath || "INVALID");
    if (!within(this.#sandboxRoot, target) || !disjoint(this.#repositoryRoot, target)) issues.push("sandbox_boundary_escape");
    if (this.#usedTargets.has(target)) issues.push("sandbox_identity_reuse_denied");
    return [...new Set(issues)];
  }

  async #rollbackFailedProvision(target: string, observedAtEpochMs: number): Promise<boolean> {
    try {
      const [rootAtRollback, targetAtRollback, canonicalTarget, entries] = await Promise.all([
        observeIdentity(this.#sandboxRoot, observedAtEpochMs),
        observeIdentity(target, observedAtEpochMs),
        realpath(target),
        readdir(target),
      ]);
      if (!sameIdentity(rootAtRollback, this.#rootIdentity)
        || canonicalTarget !== target
        || !within(this.#sandboxRoot, canonicalTarget)
        || sameIdentity(targetAtRollback, this.#repositoryIdentity)
        || entries.length !== 0) return false;
      await rmdir(canonicalTarget);
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

  #result(
    decision: R2AOperationResult["decision"],
    reason: string,
    sandbox: R2AProvisionedSandbox | null,
    events: readonly R2AAuditEvent[],
  ): R2AOperationResult {
    return Object.freeze({ decision, reason, sandbox, events: Object.freeze([...events]), evidenceClass: "E3", authorityGranted: false });
  }
}
