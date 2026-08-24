export const R2_LIFECYCLE_STATES = Object.freeze([
  "REQUESTED",
  "AUTHORIZED",
  "IDENTITY_VALIDATED",
  "PROVISIONING",
  "ACTIVE",
  "TERMINATING",
  "CLEANUP_PENDING",
  "CLEANED",
  "VERIFIED_CLEAN",
  "REJECTED",
  "PROVISION_FAILED",
  "IDENTITY_CHANGED",
  "CLEANUP_FAILED",
  "QUARANTINED",
] as const);
export type SandboxLifecycleState = (typeof R2_LIFECYCLE_STATES)[number];

export const R2_FAILURE_STATES = Object.freeze([
  "REJECTED",
  "PROVISION_FAILED",
  "IDENTITY_CHANGED",
  "CLEANUP_FAILED",
  "QUARANTINED",
] as const);
export type SandboxFailureState = (typeof R2_FAILURE_STATES)[number];

export const R2_AUDIT_FIELDS = Object.freeze([
  "AUTHORIZER",
  "CAPABILITY",
  "AUTHORIZED_TARGET",
  "OBSERVED_TARGET_IDENTITY",
  "BASE_STATE",
  "REQUESTED_MUTATION",
  "ACTUAL_CHANGE",
  "OBSERVED_POSTCONDITION",
  "ROLLBACK_MATERIAL",
  "CLEANUP_OUTCOME",
] as const);

export type ExecutorAuthorityName =
  | "READ_REPOSITORY"
  | "WRITE_SANDBOX"
  | "PROVISION_SANDBOX"
  | "TERMINATE_SANDBOX"
  | "WRITE_SANDBOX_CONTENT"
  | "WRITE_REPOSITORY"
  | "SHELL"
  | "NETWORK"
  | "CREDENTIAL_ACCESS"
  | "PACKAGE_INSTALL"
  | "DEPLOYMENT";
export type ExecutorAuthorityState = "VERIFIED" | "UNAVAILABLE" | "FORBIDDEN";

export interface SandboxProvisionRequest {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly capabilityId: string;
  readonly authority: "PROVISION_SANDBOX";
  readonly requestedPath: string;
  readonly repositoryRoot: string;
  readonly approvedSandboxRoot: string;
  readonly issuedAtEpochMs: number;
  readonly expiresAtEpochMs: number;
  readonly issuer: string;
  readonly auditIdentity: string;
  readonly candidateBinding: {
    readonly commit: string;
    readonly capabilityVersion: string;
    readonly schemaVersion: 1;
    readonly evaluatorVersion: string;
    readonly environmentIdentity: string;
  };
}

export interface CanonicalTargetIdentity {
  readonly identityScheme: "WINDOWS_FILE_ID" | "POSIX_DEVICE_INODE" | "HOST_STABLE_ID";
  readonly volumeOrDevice: string;
  readonly objectId: string;
  readonly observedAtEpochMs: number;
}

export interface AuthorizedTargetSlot {
  readonly canonicalApprovedRoot: string;
  readonly approvedRootIdentity: CanonicalTargetIdentity;
  readonly canonicalParentPath: string;
  readonly parentIdentityAtAuthorization: CanonicalTargetIdentity;
  readonly leafName: string;
  readonly expectedAbsent: true;
}

export interface SandboxIdentity {
  readonly requestId: string;
  readonly requestedPath: string;
  readonly canonicalPath: string;
  readonly resolvedTarget: string;
  readonly authorizedSlot: AuthorizedTargetSlot;
  readonly createdObjectIdentity: CanonicalTargetIdentity;
  readonly parentIdentityAtUse: CanonicalTargetIdentity;
  readonly objectIdentityAtUse: CanonicalTargetIdentity;
  readonly repositoryIdentity: CanonicalTargetIdentity;
  readonly bindingMode: "HANDLE_BOUND" | "CHECK_USE_CHECK" | "BEST_EFFORT";
}

export interface SandboxPolicy {
  readonly policyId: string;
  readonly maxLifetimeMs: number;
  readonly maxEntries: number;
  readonly maxTotalBytes: number;
  readonly maxNestingDepth: number;
  readonly allowContentMutation: false;
  readonly allowRepositoryMutation: false;
  readonly allowShell: false;
  readonly allowNetwork: false;
  readonly allowCredentials: false;
  readonly allowPackageInstall: false;
  readonly allowDeployment: false;
  readonly reuseAfterUnknownCleanup: false;
  readonly cleanupFailureAction: "QUARANTINE_AND_REVOKE";
}

export interface CleanupEvidence {
  readonly evidenceId: string;
  readonly requestId: string;
  readonly attempted: boolean;
  readonly outcome: "SUCCESS" | "FAILED" | "UNKNOWN";
  readonly terminalObjectExists: boolean | null;
  readonly directoryStructureEquivalent: boolean | null;
  readonly relevantMetadataEquivalent: boolean | null;
  readonly authorityRevoked: boolean;
  readonly reusable: boolean;
  readonly provenance: string;
}

export interface RollbackEvidence {
  readonly evidenceId: string;
  readonly requestId: string;
  readonly baseStateHash: string;
  readonly restoredStateHash: string;
  readonly existenceEquivalent: boolean;
  readonly directoryStructureEquivalent: boolean;
  readonly relevantMetadataEquivalent: boolean;
  readonly provenance: string;
}

export interface ProvisioningAudit {
  readonly auditId: string;
  readonly requestId: string;
  readonly candidateCommit: string;
  readonly capabilityVersion: string;
  readonly schemaVersion: 1;
  readonly evaluatorVersion: string;
  readonly environmentIdentity: string;
  readonly authorizer: string;
  readonly capability: "PROVISION_SANDBOX";
  readonly authorizedTarget: string;
  readonly observedTargetIdentity: CanonicalTargetIdentity | null;
  readonly baseState: string | null;
  readonly requestedMutation: "PROVISION_EMPTY_SANDBOX";
  readonly actualChange: "NONE" | "SANDBOX_DIRECTORY_CREATED" | "UNKNOWN";
  readonly observedPostcondition: string | null;
  readonly rollbackMaterial: RollbackEvidence | null;
  readonly cleanupOutcome: CleanupEvidence | null;
  readonly eventHashes: readonly string[];
  readonly hashChainClaim: "TAMPER_EVIDENT_NOT_SIGNED";
}

export interface ProvisioningFailure {
  readonly failureId: string;
  readonly requestId: string;
  readonly category: "AUTHORIZATION" | "CONFINEMENT" | "IDENTITY" | "PROVISIONING" | "CLEANUP";
  readonly state: SandboxFailureState;
  readonly reason: string;
  readonly authorityRevoked: boolean;
  readonly retryPolicy: "REQUIRES_NEW_AUTHORIZATION" | "NO_AUTOMATIC_RETRY" | "TRANSIENT_SAME_TARGET_ONLY";
  readonly evidenceReferences: readonly string[];
}

export interface QuarantineRecord {
  readonly quarantineId: string;
  readonly requestId: string;
  readonly sandboxIdentity: string;
  readonly authorityRevoked: true;
  readonly reuseDenied: true;
  readonly evidencePreserved: true;
  readonly remediationRequired: true;
  readonly remediationAuthority: "TRUSTED_LIFECYCLE_MANAGER";
  readonly reason: string;
  readonly evidenceReferences: readonly string[];
}

export interface SandboxLifecycle {
  readonly lifecycleId: string;
  readonly requestId: string;
  readonly state: SandboxLifecycleState;
  readonly previousState: SandboxLifecycleState | null;
  readonly authorityActive: boolean;
  readonly reusable: boolean;
  readonly transitionEvidenceIds: readonly string[];
  readonly failure: ProvisioningFailure | null;
}

export interface ExecutorAuthorityCertificate {
  readonly authority: ExecutorAuthorityName;
  readonly state: ExecutorAuthorityState;
  readonly evidenceIds: readonly string[];
  readonly rationale: string;
}

export interface AuthorityManifest {
  readonly manifestId: string;
  readonly candidateCommit: string;
  readonly certificates: readonly ExecutorAuthorityCertificate[];
}

export interface AuthorityDelta {
  readonly addedCapabilities: readonly ExecutorAuthorityName[];
  readonly removedCapabilities: readonly ExecutorAuthorityName[];
  readonly removedForbiddenActions: readonly ExecutorAuthorityName[];
  readonly newlyForbiddenActions: readonly ExecutorAuthorityName[];
  readonly changedStates: readonly {
    readonly authority: ExecutorAuthorityName;
    readonly before: ExecutorAuthorityState;
    readonly after: ExecutorAuthorityState;
  }[];
}

export interface BlueprintValidation {
  readonly ok: boolean;
  readonly issues: readonly string[];
}

export interface LifecycleTransitionResult {
  readonly accepted: boolean;
  readonly lifecycle: SandboxLifecycle;
  readonly issues: readonly string[];
}

export interface R2AImplementationBlueprint {
  readonly schemaVersion: 1;
  readonly blueprintId: "OMEGA-R2-A-IMPLSPEC-001";
  readonly maturity: "SPECIFIED";
  readonly operationalAuthority: "UNAVAILABLE";
  readonly filesystemAdapter: "NONE";
  readonly interfaces: readonly [
    "SandboxProvisionRequest",
    "AuthorizedTargetSlot",
    "SandboxIdentity",
    "SandboxPolicy",
    "SandboxLifecycle",
    "CanonicalTargetIdentity",
    "CleanupEvidence",
    "RollbackEvidence",
    "ProvisioningAudit",
    "ProvisioningFailure",
    "QuarantineRecord",
  ];
  readonly requiredStates: readonly SandboxLifecycleState[];
  readonly auditFields: readonly string[];
  readonly policy: SandboxPolicy;
  readonly currentAuthorityManifest: AuthorityManifest;
}

const SUCCESS_TRANSITIONS: Readonly<Record<string, readonly SandboxLifecycleState[]>> = Object.freeze({
  REQUESTED: ["AUTHORIZED", "REJECTED"],
  AUTHORIZED: ["IDENTITY_VALIDATED", "IDENTITY_CHANGED", "REJECTED"],
  IDENTITY_VALIDATED: ["PROVISIONING", "IDENTITY_CHANGED"],
  PROVISIONING: ["ACTIVE", "PROVISION_FAILED", "IDENTITY_CHANGED"],
  ACTIVE: ["TERMINATING", "IDENTITY_CHANGED"],
  TERMINATING: ["CLEANUP_PENDING", "IDENTITY_CHANGED"],
  CLEANUP_PENDING: ["CLEANED", "CLEANUP_FAILED"],
  CLEANED: ["VERIFIED_CLEAN", "CLEANUP_FAILED"],
  PROVISION_FAILED: ["CLEANUP_PENDING", "QUARANTINED"],
  IDENTITY_CHANGED: ["QUARANTINED"],
  CLEANUP_FAILED: ["QUARANTINED"],
});

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function identityKey(identity: CanonicalTargetIdentity): string {
  return `${identity.identityScheme}:${identity.volumeOrDevice}:${identity.objectId}`;
}

export function targetIdentityMatchesAuthorized(identity: SandboxIdentity): boolean {
  return identity.authorizedSlot.expectedAbsent
    && identity.bindingMode !== "BEST_EFFORT"
    && identity.canonicalPath === `${identity.authorizedSlot.canonicalParentPath}/${identity.authorizedSlot.leafName}`
    && identityKey(identity.parentIdentityAtUse) === identityKey(identity.authorizedSlot.parentIdentityAtAuthorization)
    && identityKey(identity.createdObjectIdentity) === identityKey(identity.objectIdentityAtUse)
    && identityKey(identity.createdObjectIdentity) !== identityKey(identity.repositoryIdentity)
    && identityKey(identity.authorizedSlot.approvedRootIdentity) !== identityKey(identity.repositoryIdentity);
}

export function validateSandboxProvisionRequest(request: SandboxProvisionRequest, nowEpochMs: number): BlueprintValidation {
  const issues: string[] = [];
  for (const value of [
    request.requestId,
    request.capabilityId,
    request.requestedPath,
    request.repositoryRoot,
    request.approvedSandboxRoot,
    request.issuer,
    request.auditIdentity,
    request.candidateBinding.capabilityVersion,
    request.candidateBinding.evaluatorVersion,
    request.candidateBinding.environmentIdentity,
  ]) if (!nonEmpty(value)) issues.push("request_identity_or_binding_missing");
  if (request.schemaVersion !== 1 || request.candidateBinding.schemaVersion !== 1) issues.push("unsupported_request_schema");
  if (request.authority !== "PROVISION_SANDBOX") issues.push("wrong_request_authority");
  if (!/^[0-9a-f]{40}$/.test(request.candidateBinding.commit)) issues.push("candidate_commit_not_exact_sha1");
  if (!Number.isFinite(request.issuedAtEpochMs)
    || !Number.isFinite(request.expiresAtEpochMs)
    || request.expiresAtEpochMs <= request.issuedAtEpochMs
    || nowEpochMs < request.issuedAtEpochMs
    || nowEpochMs >= request.expiresAtEpochMs) issues.push("request_time_window_invalid");
  return { ok: issues.length === 0, issues };
}

export function cleanupIsVerified(evidence: CleanupEvidence): boolean {
  return evidence.attempted
    && evidence.outcome === "SUCCESS"
    && evidence.terminalObjectExists === false
    && evidence.directoryStructureEquivalent === true
    && evidence.relevantMetadataEquivalent === true
    && evidence.reusable === false;
}

export function rollbackIsEquivalent(evidence: RollbackEvidence): boolean {
  return nonEmpty(evidence.baseStateHash)
    && evidence.baseStateHash === evidence.restoredStateHash
    && evidence.existenceEquivalent
    && evidence.directoryStructureEquivalent
    && evidence.relevantMetadataEquivalent
    && nonEmpty(evidence.provenance);
}

export function buildQuarantineRecord(
  lifecycle: SandboxLifecycle,
  sandboxIdentity: string,
  reason: string,
  evidenceReferences: readonly string[],
): QuarantineRecord {
  return {
    quarantineId: `QUARANTINE-${lifecycle.lifecycleId}`,
    requestId: lifecycle.requestId,
    sandboxIdentity,
    authorityRevoked: true,
    reuseDenied: true,
    evidencePreserved: true,
    remediationRequired: true,
    remediationAuthority: "TRUSTED_LIFECYCLE_MANAGER",
    reason,
    evidenceReferences,
  };
}

export function validateQuarantineRecord(record: QuarantineRecord): BlueprintValidation {
  const issues: string[] = [];
  for (const value of [record.quarantineId, record.requestId, record.sandboxIdentity, record.reason]) {
    if (!nonEmpty(value)) issues.push("quarantine_identity_missing");
  }
  if (!record.authorityRevoked || !record.reuseDenied || !record.evidencePreserved || !record.remediationRequired) {
    issues.push("quarantine_safety_property_missing");
  }
  if (record.remediationAuthority !== "TRUSTED_LIFECYCLE_MANAGER") issues.push("unsafe_quarantine_remediation_authority");
  if (record.evidenceReferences.length === 0 || record.evidenceReferences.some((item) => !nonEmpty(item))) {
    issues.push("quarantine_evidence_missing");
  }
  return { ok: issues.length === 0, issues };
}

export function validateProvisioningAudit(audit: ProvisioningAudit): BlueprintValidation {
  const issues: string[] = [];
  for (const value of [
    audit.auditId,
    audit.requestId,
    audit.candidateCommit,
    audit.capabilityVersion,
    audit.evaluatorVersion,
    audit.environmentIdentity,
    audit.authorizer,
    audit.authorizedTarget,
  ]) if (!nonEmpty(value)) issues.push("missing_audit_identity_or_binding");
  if (audit.schemaVersion !== 1 || audit.capability !== "PROVISION_SANDBOX") issues.push("invalid_audit_schema_or_capability");
  if (!/^[0-9a-f]{40}$/.test(audit.candidateCommit)) issues.push("audit_candidate_commit_not_exact_sha1");
  if (audit.requestedMutation !== "PROVISION_EMPTY_SANDBOX") issues.push("r2_a_content_mutation_forbidden");
  if (audit.actualChange === "UNKNOWN") issues.push("actual_change_unknown");
  if (audit.observedTargetIdentity === null) issues.push("target_identity_unobserved");
  if (!nonEmpty(audit.baseState) || !nonEmpty(audit.observedPostcondition)) issues.push("base_or_postcondition_unobserved");
  if (audit.rollbackMaterial === null || !rollbackIsEquivalent(audit.rollbackMaterial)) issues.push("rollback_evidence_incomplete");
  if (audit.cleanupOutcome === null || !cleanupIsVerified(audit.cleanupOutcome)) issues.push("cleanup_evidence_incomplete");
  if (audit.eventHashes.length === 0 || audit.eventHashes.some((item) => !nonEmpty(item))) issues.push("audit_events_missing");
  if (audit.hashChainClaim !== "TAMPER_EVIDENT_NOT_SIGNED") issues.push("hash_chain_claim_inflated");
  return { ok: issues.length === 0, issues };
}

export function transitionLifecycle(
  lifecycle: SandboxLifecycle,
  nextState: SandboxLifecycleState,
  evidenceIds: readonly string[],
  failure: ProvisioningFailure | null = null,
): LifecycleTransitionResult {
  const issues: string[] = [];
  const allowed = SUCCESS_TRANSITIONS[lifecycle.state] ?? [];
  if (!allowed.includes(nextState)) issues.push(`invalid_transition:${lifecycle.state}->${nextState}`);
  if (evidenceIds.length === 0 || evidenceIds.some((item) => !nonEmpty(item))) issues.push("transition_evidence_missing");
  const nextIsFailure = (R2_FAILURE_STATES as readonly string[]).includes(nextState);
  if (nextIsFailure && failure === null) issues.push("failure_state_requires_failure_record");
  if (!nextIsFailure && failure !== null) issues.push("success_state_cannot_carry_failure");
  if (failure !== null) {
    if (failure.requestId !== lifecycle.requestId || failure.state !== nextState) issues.push("failure_record_mismatch");
    if (["AUTHORIZATION", "CONFINEMENT", "IDENTITY"].includes(failure.category)
      && failure.retryPolicy !== "REQUIRES_NEW_AUTHORIZATION") issues.push("authority_failure_must_not_retry_silently");
    if (["CLEANUP", "IDENTITY"].includes(failure.category) && !failure.authorityRevoked) issues.push("security_failure_requires_revocation");
  }
  if (issues.length > 0) return { accepted: false, lifecycle, issues };

  const authorityActive = ![
    "REJECTED",
    "PROVISION_FAILED",
    "IDENTITY_CHANGED",
    "CLEANUP_FAILED",
    "QUARANTINED",
    "CLEANED",
    "VERIFIED_CLEAN",
  ].includes(nextState);
  return {
    accepted: true,
    issues,
    lifecycle: {
      ...lifecycle,
      previousState: lifecycle.state,
      state: nextState,
      authorityActive,
      reusable: false,
      transitionEvidenceIds: [...lifecycle.transitionEvidenceIds, ...evidenceIds],
      failure,
    },
  };
}

export function evaluateCleanupTerminalState(
  lifecycle: SandboxLifecycle,
  cleanup: CleanupEvidence,
  failureId: string,
): LifecycleTransitionResult {
  if (cleanupIsVerified(cleanup)) {
    return transitionLifecycle(lifecycle, "CLEANED", [cleanup.evidenceId]);
  }
  const failure: ProvisioningFailure = {
    failureId,
    requestId: lifecycle.requestId,
    category: "CLEANUP",
    state: "CLEANUP_FAILED",
    reason: cleanup.outcome === "UNKNOWN" ? "cleanup_outcome_unknown" : "cleanup_not_proven_equivalent",
    authorityRevoked: true,
    retryPolicy: "NO_AUTOMATIC_RETRY",
    evidenceReferences: [cleanup.evidenceId],
  };
  return transitionLifecycle(lifecycle, "CLEANUP_FAILED", [cleanup.evidenceId], failure);
}

export function computeAuthorityDelta(baseline: AuthorityManifest, candidate: AuthorityManifest): AuthorityDelta {
  const before = new Map(baseline.certificates.map((item) => [item.authority, item.state]));
  const after = new Map(candidate.certificates.map((item) => [item.authority, item.state]));
  const authorities = [...new Set([...before.keys(), ...after.keys()])];
  const changedStates = authorities
    .filter((authority) => before.get(authority) !== after.get(authority) && before.has(authority) && after.has(authority))
    .map((authority) => ({ authority, before: before.get(authority)!, after: after.get(authority)! }));
  return {
    addedCapabilities: authorities.filter((authority) => before.get(authority) !== "VERIFIED" && after.get(authority) === "VERIFIED"),
    removedCapabilities: authorities.filter((authority) => before.get(authority) === "VERIFIED" && after.get(authority) !== "VERIFIED"),
    removedForbiddenActions: authorities.filter((authority) => before.get(authority) === "FORBIDDEN" && after.get(authority) !== "FORBIDDEN"),
    newlyForbiddenActions: authorities.filter((authority) => before.get(authority) !== "FORBIDDEN" && after.get(authority) === "FORBIDDEN"),
    changedStates,
  };
}

export function assessDesiredR2ADelta(delta: AuthorityDelta): BlueprintValidation {
  const issues: string[] = [];
  const added = [...delta.addedCapabilities].sort();
  if (added.length !== 2 || added[0] !== "PROVISION_SANDBOX" || added[1] !== "TERMINATE_SANDBOX") issues.push("unexpected_capability_delta");
  if (delta.removedCapabilities.length > 0) issues.push("baseline_capability_removed");
  if (delta.removedForbiddenActions.length > 0) issues.push("forbidden_authority_removed");
  return { ok: issues.length === 0, issues };
}

export function validateImplementationBlueprint(blueprint: R2AImplementationBlueprint): BlueprintValidation {
  const issues: string[] = [];
  if (blueprint.schemaVersion !== 1 || blueprint.blueprintId !== "OMEGA-R2-A-IMPLSPEC-001") issues.push("wrong_blueprint_identity");
  if (blueprint.maturity !== "SPECIFIED" || blueprint.operationalAuthority !== "UNAVAILABLE" || blueprint.filesystemAdapter !== "NONE") issues.push("blueprint_grants_authority");
  const requiredInterfaces = [
    "SandboxProvisionRequest",
    "AuthorizedTargetSlot",
    "SandboxIdentity",
    "SandboxPolicy",
    "SandboxLifecycle",
    "CanonicalTargetIdentity",
    "CleanupEvidence",
    "RollbackEvidence",
    "ProvisioningAudit",
    "ProvisioningFailure",
    "QuarantineRecord",
  ];
  for (const item of requiredInterfaces) if (!blueprint.interfaces.includes(item as never)) issues.push(`missing_interface:${item}`);
  for (const state of R2_LIFECYCLE_STATES) if (!blueprint.requiredStates.includes(state)) issues.push(`missing_state:${state}`);
  for (const field of R2_AUDIT_FIELDS) if (!blueprint.auditFields.includes(field)) issues.push(`missing_audit_field:${field}`);
  const policy = blueprint.policy;
  if (policy.allowContentMutation
    || policy.allowRepositoryMutation
    || policy.allowShell
    || policy.allowNetwork
    || policy.allowCredentials
    || policy.allowPackageInstall
    || policy.allowDeployment
    || policy.reuseAfterUnknownCleanup
    || policy.cleanupFailureAction !== "QUARANTINE_AND_REVOKE") issues.push("unsafe_blueprint_policy");
  const manifestStates = new Map(blueprint.currentAuthorityManifest.certificates.map((item) => [item.authority, item.state]));
  if (manifestStates.get("READ_REPOSITORY") !== "VERIFIED"
    || manifestStates.get("WRITE_SANDBOX") !== "UNAVAILABLE"
    || manifestStates.get("PROVISION_SANDBOX") !== "UNAVAILABLE"
    || manifestStates.get("TERMINATE_SANDBOX") !== "UNAVAILABLE"
    || manifestStates.get("WRITE_SANDBOX_CONTENT") !== "UNAVAILABLE") issues.push("current_authority_ceiling_misrepresented");
  for (const forbidden of ["WRITE_REPOSITORY", "SHELL", "NETWORK", "CREDENTIAL_ACCESS", "PACKAGE_INSTALL", "DEPLOYMENT"] as const) {
    if (manifestStates.get(forbidden) !== "FORBIDDEN") issues.push(`missing_negative_certificate:${forbidden}`);
  }
  return { ok: issues.length === 0, issues };
}

function certificate(
  authority: ExecutorAuthorityName,
  state: ExecutorAuthorityState,
  rationale: string,
  evidenceIds: readonly string[] = [],
): ExecutorAuthorityCertificate {
  return { authority, state, rationale, evidenceIds };
}

export const CURRENT_R1_AUTHORITY_MANIFEST = Object.freeze<AuthorityManifest>({
  manifestId: "OMEGA-AUTHORITY-R1-7D60DF1",
  candidateCommit: "7d60df145245bded761ce49cf22d04d0bf53e009",
  certificates: [
    certificate("READ_REPOSITORY", "VERIFIED", "R1 locally and held-out verified.", ["OMEGA-EV-EVAL-R1-PRIVATE-31"]),
    certificate("WRITE_SANDBOX", "UNAVAILABLE", "Aggregate sandbox write authority remains unavailable."),
    certificate("PROVISION_SANDBOX", "UNAVAILABLE", "SEC-003 blocks operational R2-A provisioning."),
    certificate("TERMINATE_SANDBOX", "UNAVAILABLE", "SEC-003 blocks operational R2-A termination."),
    certificate("WRITE_SANDBOX_CONTENT", "UNAVAILABLE", "Content mutation is outside R2-A."),
    certificate("WRITE_REPOSITORY", "FORBIDDEN", "Repository mutation requires a later independent authority class."),
    certificate("SHELL", "FORBIDDEN", "No scoped terminal authority exists."),
    certificate("NETWORK", "FORBIDDEN", "No network executor authority exists."),
    certificate("CREDENTIAL_ACCESS", "FORBIDDEN", "Executor credentials are prohibited."),
    certificate("PACKAGE_INSTALL", "FORBIDDEN", "Package installation is outside R1/R2-A."),
    certificate("DEPLOYMENT", "FORBIDDEN", "Deployment is a separate future authority."),
  ],
});

export const DESIRED_FUTURE_R2_A_AUTHORITY_MANIFEST = Object.freeze<AuthorityManifest>({
  manifestId: "OMEGA-AUTHORITY-DESIRED-R2-A",
  candidateCommit: "FUTURE_CANDIDATE_REQUIRED",
  certificates: CURRENT_R1_AUTHORITY_MANIFEST.certificates.map((item) => {
    if (item.authority === "PROVISION_SANDBOX") {
      return certificate("PROVISION_SANDBOX", "VERIFIED", "Future empty-sandbox provisioning only; not currently granted.", ["FUTURE_OPERATIONAL_EVIDENCE_REQUIRED"]);
    }
    if (item.authority === "TERMINATE_SANDBOX") {
      return certificate("TERMINATE_SANDBOX", "VERIFIED", "Future sandbox termination/cleanup only; not currently granted.", ["FUTURE_OPERATIONAL_EVIDENCE_REQUIRED"]);
    }
    return item;
  }),
});

export const OMEGA_R2_A_IMPLSPEC_001 = Object.freeze<R2AImplementationBlueprint>({
  schemaVersion: 1,
  blueprintId: "OMEGA-R2-A-IMPLSPEC-001",
  maturity: "SPECIFIED",
  operationalAuthority: "UNAVAILABLE",
  filesystemAdapter: "NONE",
  interfaces: [
    "SandboxProvisionRequest",
    "AuthorizedTargetSlot",
    "SandboxIdentity",
    "SandboxPolicy",
    "SandboxLifecycle",
    "CanonicalTargetIdentity",
    "CleanupEvidence",
    "RollbackEvidence",
    "ProvisioningAudit",
    "ProvisioningFailure",
    "QuarantineRecord",
  ],
  requiredStates: R2_LIFECYCLE_STATES,
  auditFields: R2_AUDIT_FIELDS,
  policy: {
    policyId: "OMEGA-R2-A-POLICY-001",
    maxLifetimeMs: 3_600_000,
    maxEntries: 64,
    maxTotalBytes: 8_000_000,
    maxNestingDepth: 2,
    allowContentMutation: false,
    allowRepositoryMutation: false,
    allowShell: false,
    allowNetwork: false,
    allowCredentials: false,
    allowPackageInstall: false,
    allowDeployment: false,
    reuseAfterUnknownCleanup: false,
    cleanupFailureAction: "QUARANTINE_AND_REVOKE",
  },
  currentAuthorityManifest: CURRENT_R1_AUTHORITY_MANIFEST,
});
