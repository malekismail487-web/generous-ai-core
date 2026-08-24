import {
  CURRENT_R1_AUTHORITY_MANIFEST,
  DESIRED_FUTURE_R2_A_AUTHORITY_MANIFEST,
  OMEGA_R2_A_IMPLSPEC_001,
  R2_AUDIT_FIELDS,
  R2_FAILURE_STATES,
  R2_LIFECYCLE_STATES,
  assessDesiredR2ADelta,
  buildQuarantineRecord,
  cleanupIsVerified,
  computeAuthorityDelta,
  evaluateCleanupTerminalState,
  rollbackIsEquivalent,
  targetIdentityMatchesAuthorized,
  transitionLifecycle,
  validateImplementationBlueprint,
  validateProvisioningAudit,
  validateQuarantineRecord,
  validateSandboxProvisionRequest,
  type CanonicalTargetIdentity,
  type CleanupEvidence,
  type ProvisioningAudit,
  type ProvisioningFailure,
  type R2AImplementationBlueprint,
  type RollbackEvidence,
  type SandboxIdentity,
  type SandboxLifecycle,
  type SandboxProvisionRequest,
} from "../src/lib/codelab/executor/r2ProvisioningBlueprint";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: unknown, label: string): void {
  if (condition) passed += 1;
  else {
    failed += 1;
    failures.push(label);
    console.error(`  x ${label}`);
  }
}

function blueprint(overrides: Partial<R2AImplementationBlueprint> = {}): R2AImplementationBlueprint {
  return { ...structuredClone(OMEGA_R2_A_IMPLSPEC_001), ...overrides };
}

function objectIdentity(objectId: string, volumeOrDevice = "volume-7"): CanonicalTargetIdentity {
  return {
    identityScheme: "WINDOWS_FILE_ID",
    volumeOrDevice,
    objectId,
    observedAtEpochMs: 1_000,
  };
}

function identity(overrides: Partial<SandboxIdentity> = {}): SandboxIdentity {
  return {
    requestId: "OMEGA-R2-A-REQUEST-001",
    requestedPath: "task-001",
    canonicalPath: "C:/omega-sandboxes/task-001",
    resolvedTarget: "C:/omega-sandboxes/task-001",
    authorizedSlot: {
      canonicalApprovedRoot: "C:/omega-sandboxes",
      approvedRootIdentity: objectIdentity("sandbox-root-1"),
      canonicalParentPath: "C:/omega-sandboxes",
      parentIdentityAtAuthorization: objectIdentity("sandbox-root-1"),
      leafName: "task-001",
      expectedAbsent: true,
    },
    createdObjectIdentity: objectIdentity("sandbox-42"),
    parentIdentityAtUse: objectIdentity("sandbox-root-1"),
    objectIdentityAtUse: objectIdentity("sandbox-42"),
    repositoryIdentity: objectIdentity("repository-1"),
    bindingMode: "CHECK_USE_CHECK",
    ...overrides,
  };
}

function request(overrides: Partial<SandboxProvisionRequest> = {}): SandboxProvisionRequest {
  return {
    schemaVersion: 1,
    requestId: "OMEGA-R2-A-REQUEST-001",
    capabilityId: "OMEGA-CAP-PROVISION-001",
    authority: "PROVISION_SANDBOX",
    requestedPath: "task-001",
    repositoryRoot: "C:/repo",
    approvedSandboxRoot: "C:/omega-sandboxes",
    issuedAtEpochMs: 1_000,
    expiresAtEpochMs: 2_000,
    issuer: "OMEGA-INSTITUTIONAL-AUTHORITY",
    auditIdentity: "OMEGA-AUDIT-IDENTITY-001",
    candidateBinding: {
      commit: "0123456789abcdef0123456789abcdef01234567",
      capabilityVersion: "r2-a/1",
      schemaVersion: 1,
      evaluatorVersion: "host-eval/1",
      environmentIdentity: "windows-fixture-001",
    },
    ...overrides,
  };
}

function cleanup(overrides: Partial<CleanupEvidence> = {}): CleanupEvidence {
  return {
    evidenceId: "OMEGA-EV-CLEANUP-001",
    requestId: "OMEGA-R2-A-REQUEST-001",
    attempted: true,
    outcome: "SUCCESS",
    terminalObjectExists: false,
    directoryStructureEquivalent: true,
    relevantMetadataEquivalent: true,
    authorityRevoked: true,
    reusable: false,
    provenance: "host-evaluator://cleanup-001",
    ...overrides,
  };
}

function rollback(overrides: Partial<RollbackEvidence> = {}): RollbackEvidence {
  return {
    evidenceId: "OMEGA-EV-ROLLBACK-001",
    requestId: "OMEGA-R2-A-REQUEST-001",
    baseStateHash: "base-hash",
    restoredStateHash: "base-hash",
    existenceEquivalent: true,
    directoryStructureEquivalent: true,
    relevantMetadataEquivalent: true,
    provenance: "host-evaluator://rollback-001",
    ...overrides,
  };
}

function lifecycle(state: SandboxLifecycle["state"] = "REQUESTED"): SandboxLifecycle {
  return {
    lifecycleId: "OMEGA-LIFECYCLE-001",
    requestId: "OMEGA-R2-A-REQUEST-001",
    state,
    previousState: null,
    authorityActive: state !== "REQUESTED",
    reusable: false,
    transitionEvidenceIds: [],
    failure: null,
  };
}

function failure(
  state: ProvisioningFailure["state"],
  category: ProvisioningFailure["category"],
  overrides: Partial<ProvisioningFailure> = {},
): ProvisioningFailure {
  return {
    failureId: `OMEGA-FAILURE-${state}`,
    requestId: "OMEGA-R2-A-REQUEST-001",
    category,
    state,
    reason: `fixture_${state.toLowerCase()}`,
    authorityRevoked: ["CLEANUP", "IDENTITY"].includes(category),
    retryPolicy: ["AUTHORIZATION", "CONFINEMENT", "IDENTITY"].includes(category)
      ? "REQUIRES_NEW_AUTHORIZATION"
      : "NO_AUTOMATIC_RETRY",
    evidenceReferences: [`OMEGA-EV-${state}`],
    ...overrides,
  };
}

function audit(overrides: Partial<ProvisioningAudit> = {}): ProvisioningAudit {
  return {
    auditId: "OMEGA-AUDIT-R2-A-001",
    requestId: "OMEGA-R2-A-REQUEST-001",
    candidateCommit: "0123456789abcdef0123456789abcdef01234567",
    capabilityVersion: "r2-a/1",
    schemaVersion: 1,
    evaluatorVersion: "host-eval/1",
    environmentIdentity: "windows-fixture-001",
    authorizer: "OMEGA-INSTITUTIONAL-AUTHORITY",
    capability: "PROVISION_SANDBOX",
    authorizedTarget: "C:/omega-sandboxes/task-001",
    observedTargetIdentity: objectIdentity("sandbox-42"),
    baseState: "ABSENT",
    requestedMutation: "PROVISION_EMPTY_SANDBOX",
    actualChange: "SANDBOX_DIRECTORY_CREATED",
    observedPostcondition: "EMPTY_SANDBOX_PRESENT",
    rollbackMaterial: rollback(),
    cleanupOutcome: cleanup(),
    eventHashes: ["event-hash-1", "event-hash-2"],
    hashChainClaim: "TAMPER_EVIDENT_NOT_SIGNED",
    ...overrides,
  };
}

assert(validateImplementationBlueprint(OMEGA_R2_A_IMPLSPEC_001).ok, "reference R2-A implementation blueprint validates");
assert(OMEGA_R2_A_IMPLSPEC_001.maturity === "SPECIFIED", "blueprint stops at SPECIFIED maturity");
assert(OMEGA_R2_A_IMPLSPEC_001.operationalAuthority === "UNAVAILABLE", "blueprint grants no operational authority");
assert(OMEGA_R2_A_IMPLSPEC_001.filesystemAdapter === "NONE", "blueprint includes no filesystem adapter");
assert(OMEGA_R2_A_IMPLSPEC_001.interfaces.length === 11, "all eleven required implementation interfaces are explicit");
assert(R2_LIFECYCLE_STATES.length === 14, "nine success and five failure states are explicit");
assert(R2_FAILURE_STATES.includes("QUARANTINED"), "quarantine is an explicit failure terminal");
assert(R2_AUDIT_FIELDS.length === 10, "all ten mutation observability fields are required");
assert(OMEGA_R2_A_IMPLSPEC_001.policy.cleanupFailureAction === "QUARANTINE_AND_REVOKE", "cleanup failure quarantines and revokes");
assert(OMEGA_R2_A_IMPLSPEC_001.policy.reuseAfterUnknownCleanup === false, "unknown cleanup never permits reuse");
assert(OMEGA_R2_A_IMPLSPEC_001.policy.allowContentMutation === false, "R2-A blueprint cannot write content");
assert(!validateImplementationBlueprint(blueprint({ operationalAuthority: "AVAILABLE" as never })).ok, "operational authority inflation is rejected");
assert(!validateImplementationBlueprint(blueprint({ filesystemAdapter: "NODE_FS" as never })).ok, "filesystem adapter injection is rejected");
assert(!validateImplementationBlueprint(blueprint({ requiredStates: R2_LIFECYCLE_STATES.slice(0, -1) })).ok, "missing lifecycle state is rejected");
assert(!validateImplementationBlueprint(blueprint({ auditFields: R2_AUDIT_FIELDS.slice(1) })).ok, "missing observability field is rejected");
assert(!validateImplementationBlueprint(blueprint({ policy: { ...OMEGA_R2_A_IMPLSPEC_001.policy, allowNetwork: true as never } })).ok, "network authority in R2-A policy is rejected");

assert(validateSandboxProvisionRequest(request(), 1_500).ok, "exact-version-bound unexpired provisioning request validates");
assert(!validateSandboxProvisionRequest(request({ authority: "WRITE_SANDBOX" as never }), 1_500).ok, "aggregate write authority cannot provision a sandbox");
assert(!validateSandboxProvisionRequest(request({ candidateBinding: { ...request().candidateBinding, commit: "short" } }), 1_500).ok, "candidate binding requires an exact commit SHA");
assert(!validateSandboxProvisionRequest(request(), 2_000).ok, "expired provisioning request fails closed");
assert(!validateSandboxProvisionRequest(request({ candidateBinding: { ...request().candidateBinding, schemaVersion: 2 as never } }), 1_500).ok, "unsupported request binding schema is rejected");

assert(targetIdentityMatchesAuthorized(identity()), "matching authorized object identity is accepted conceptually");
assert(!targetIdentityMatchesAuthorized(identity({ objectIdentityAtUse: objectIdentity("substituted-object") })), "target substitution is detected independently of path string");
assert(!targetIdentityMatchesAuthorized(identity({ parentIdentityAtUse: objectIdentity("substituted-parent") })), "parent substitution between authorization and use is detected");
assert(!targetIdentityMatchesAuthorized(identity({ repositoryIdentity: objectIdentity("sandbox-42") })), "repository object cannot be treated as sandbox target");
assert(!targetIdentityMatchesAuthorized(identity({ bindingMode: "BEST_EFFORT" })), "best-effort lexical confinement cannot satisfy strong target identity");
assert(!targetIdentityMatchesAuthorized(identity({ canonicalPath: "C:/changed/string", resolvedTarget: "C:/changed/string" })), "lexical path changes cannot substitute for the authorized target slot");

assert(cleanupIsVerified(cleanup()), "fully observed cleanup satisfies verification contract");
assert(!cleanupIsVerified(cleanup({ outcome: "UNKNOWN" })), "unknown cleanup is not successful cleanup");
assert(!cleanupIsVerified(cleanup({ terminalObjectExists: true })), "remaining terminal object fails cleanup proof");
assert(!cleanupIsVerified(cleanup({ directoryStructureEquivalent: null })), "unobserved directory equivalence fails cleanup proof");
assert(!cleanupIsVerified(cleanup({ reusable: true })), "cleaned sandbox cannot be silently reused");
assert(rollbackIsEquivalent(rollback()), "rollback equality includes content and structural dimensions");
assert(!rollbackIsEquivalent(rollback({ restoredStateHash: "different" })), "rollback hash mismatch is rejected");
assert(!rollbackIsEquivalent(rollback({ relevantMetadataEquivalent: false })), "rollback metadata mismatch is rejected");

let state = lifecycle();
for (const next of ["AUTHORIZED", "IDENTITY_VALIDATED", "PROVISIONING", "ACTIVE", "TERMINATING", "CLEANUP_PENDING"] as const) {
  const result = transitionLifecycle(state, next, [`OMEGA-EV-${next}`]);
  assert(result.accepted, `valid lifecycle transition reaches ${next}`);
  state = result.lifecycle;
}
const cleaned = evaluateCleanupTerminalState(state, cleanup(), "OMEGA-FAILURE-NOT-USED");
assert(cleaned.accepted && cleaned.lifecycle.state === "CLEANED", "verified cleanup reaches CLEANED");
const verifiedClean = transitionLifecycle(cleaned.lifecycle, "VERIFIED_CLEAN", ["OMEGA-EV-VERIFIED-CLEAN"]);
assert(verifiedClean.accepted && verifiedClean.lifecycle.authorityActive === false, "verified-clean terminal revokes authority");
assert(!transitionLifecycle(lifecycle("REQUESTED"), "ACTIVE", ["OMEGA-EV-SKIP"]).accepted, "state machine cannot skip authorization and identity validation");
assert(!transitionLifecycle(lifecycle("AUTHORIZED"), "IDENTITY_CHANGED", ["OMEGA-EV-ID"], null).accepted, "failure state requires a failure record");
assert(!transitionLifecycle(lifecycle("AUTHORIZED"), "IDENTITY_CHANGED", ["OMEGA-EV-ID"], failure("IDENTITY_CHANGED", "IDENTITY", { authorityRevoked: false })).accepted, "identity failure requires authority revocation");
assert(!transitionLifecycle(lifecycle("REQUESTED"), "REJECTED", ["OMEGA-EV-REJECT"], failure("REJECTED", "AUTHORIZATION", { retryPolicy: "TRANSIENT_SAME_TARGET_ONLY" })).accepted, "authorization failure cannot silently retry");
const identityFailure = transitionLifecycle(lifecycle("AUTHORIZED"), "IDENTITY_CHANGED", ["OMEGA-EV-ID"], failure("IDENTITY_CHANGED", "IDENTITY"));
assert(identityFailure.accepted && !identityFailure.lifecycle.authorityActive, "identity change records terminal revoked authority");

const unknownCleanup = evaluateCleanupTerminalState(lifecycle("CLEANUP_PENDING"), cleanup({ outcome: "UNKNOWN", terminalObjectExists: null, directoryStructureEquivalent: null, relevantMetadataEquivalent: null }), "OMEGA-FAILURE-CLEANUP");
assert(unknownCleanup.accepted && unknownCleanup.lifecycle.state === "CLEANUP_FAILED", "unknown cleanup enters CLEANUP_FAILED");
assert(unknownCleanup.lifecycle.failure?.authorityRevoked === true, "cleanup failure revokes authority");
assert(unknownCleanup.lifecycle.failure?.retryPolicy === "NO_AUTOMATIC_RETRY", "cleanup failure cannot silently retry");
const quarantined = transitionLifecycle(
  unknownCleanup.lifecycle,
  "QUARANTINED",
  ["OMEGA-EV-QUARANTINE"],
  failure("QUARANTINED", "CLEANUP", { reason: "cleanup_remediation_required" }),
);
assert(quarantined.accepted && quarantined.lifecycle.state === "QUARANTINED", "cleanup failure transitions to quarantine");
assert(!quarantined.lifecycle.reusable && !quarantined.lifecycle.authorityActive, "quarantined sandbox is revoked and non-reusable");
const quarantineRecord = buildQuarantineRecord(quarantined.lifecycle, "WINDOWS_FILE_ID:volume-7:sandbox-42", "cleanup_remediation_required", ["OMEGA-EV-QUARANTINE"]);
assert(validateQuarantineRecord(quarantineRecord).ok, "quarantine record preserves evidence and denies reuse");
assert(!validateQuarantineRecord({ ...quarantineRecord, evidenceReferences: [] }).ok, "quarantine without evidence is rejected");
assert(!validateQuarantineRecord({ ...quarantineRecord, remediationAuthority: "SANDBOX_WORKER" as never }).ok, "sandbox worker cannot self-release quarantine");

assert(validateProvisioningAudit(audit()).ok, "complete version-bound provisioning audit validates");
assert(!validateProvisioningAudit(audit({ candidateCommit: "" })).ok, "audit requires exact candidate binding");
assert(!validateProvisioningAudit(audit({ observedTargetIdentity: null })).ok, "audit requires observed target identity");
assert(!validateProvisioningAudit(audit({ actualChange: "UNKNOWN" })).ok, "unknown actual change fails audit reconstruction");
assert(!validateProvisioningAudit(audit({ rollbackMaterial: null })).ok, "audit requires rollback evidence");
assert(!validateProvisioningAudit(audit({ cleanupOutcome: cleanup({ outcome: "FAILED" }) })).ok, "audit cannot call failed cleanup complete");
assert(!validateProvisioningAudit(audit({ eventHashes: [] })).ok, "audit requires reconstructable event sequence");
assert(!validateProvisioningAudit(audit({ hashChainClaim: "SIGNED" as never })).ok, "audit hash chain cannot be inflated to signed evidence");

const authorityStates = new Map(CURRENT_R1_AUTHORITY_MANIFEST.certificates.map((item) => [item.authority, item.state]));
assert(authorityStates.get("READ_REPOSITORY") === "VERIFIED", "R1 read certificate remains verified");
assert(authorityStates.get("WRITE_SANDBOX") === "UNAVAILABLE", "WRITE_SANDBOX negative certificate remains unavailable");
assert(authorityStates.get("PROVISION_SANDBOX") === "UNAVAILABLE", "PROVISION_SANDBOX negative certificate remains unavailable");
assert(authorityStates.get("TERMINATE_SANDBOX") === "UNAVAILABLE", "TERMINATE_SANDBOX negative certificate remains unavailable");
assert(authorityStates.get("WRITE_SANDBOX_CONTENT") === "UNAVAILABLE", "WRITE_SANDBOX_CONTENT negative certificate remains unavailable");
for (const forbidden of ["WRITE_REPOSITORY", "SHELL", "NETWORK", "CREDENTIAL_ACCESS", "PACKAGE_INSTALL", "DEPLOYMENT"] as const) {
  assert(authorityStates.get(forbidden) === "FORBIDDEN", `${forbidden} remains explicitly forbidden`);
}
const desiredDelta = computeAuthorityDelta(CURRENT_R1_AUTHORITY_MANIFEST, DESIRED_FUTURE_R2_A_AUTHORITY_MANIFEST);
assert([...desiredDelta.addedCapabilities].sort().join(",") === "PROVISION_SANDBOX,TERMINATE_SANDBOX", "desired future delta adds only sandbox lifecycle primitives");
assert(desiredDelta.removedForbiddenActions.length === 0, "desired future delta removes no forbidden action");
assert(DESIRED_FUTURE_R2_A_AUTHORITY_MANIFEST.certificates.find((item) => item.authority === "WRITE_SANDBOX")?.state === "UNAVAILABLE", "future R2-A does not grant aggregate sandbox write");
assert(DESIRED_FUTURE_R2_A_AUTHORITY_MANIFEST.certificates.find((item) => item.authority === "WRITE_SANDBOX_CONTENT")?.state === "UNAVAILABLE", "future R2-A does not grant sandbox content mutation");
assert(assessDesiredR2ADelta(desiredDelta).ok, "desired future R2-A authority delta satisfies the blueprint");
const unsafeCandidate = {
  ...DESIRED_FUTURE_R2_A_AUTHORITY_MANIFEST,
  certificates: DESIRED_FUTURE_R2_A_AUTHORITY_MANIFEST.certificates.map((item) => item.authority === "SHELL" ? { ...item, state: "VERIFIED" as const } : item),
};
const unsafeDelta = computeAuthorityDelta(CURRENT_R1_AUTHORITY_MANIFEST, unsafeCandidate);
assert(unsafeDelta.removedForbiddenActions.includes("SHELL"), "capability delta detects lost shell prohibition");
assert(!assessDesiredR2ADelta(unsafeDelta).ok, "unexpected shell authority blocks future R2-A promotion");

console.log(`Omega R2-A implementation blueprint tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  console.error("FAILURES:");
  for (const item of failures) console.error(`  - ${item}`);
  process.exit(1);
}
