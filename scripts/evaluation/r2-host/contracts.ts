export const R2_HOST_ATTACK_FAMILIES = Object.freeze([
  "BASELINE",
  "REAL_JUNCTION",
  "SYMBOLIC_LINK",
  "ALIAS_SUBSTITUTION",
  "PATH_REPLACEMENT",
  "RENAME_RACE",
  "PARENT_DIRECTORY_REPLACEMENT",
  "CLEANUP_RACE",
  "CONCURRENT_FILE_HANDLE",
  "DIRECTORY_CONTENTION",
  "CASE_NORMALIZATION",
  "UNICODE_NORMALIZATION",
  "TARGET_IDENTITY_CHANGE",
] as const);
export type HostAttackFamily = (typeof R2_HOST_ATTACK_FAMILIES)[number];

export interface HostObjectIdentity {
  readonly scheme: "WINDOWS_FILE_ID" | "POSIX_DEVICE_INODE" | "HOST_STABLE_ID";
  readonly volumeOrDevice: string;
  readonly objectId: string;
}

export interface HostCandidateBinding {
  readonly commit: string;
  readonly capabilityVersion: string;
  readonly schemaVersion: 1;
  readonly evaluatorVersion: string;
  readonly environmentIdentity: string;
}

export interface ExpectedHostCandidate extends HostCandidateBinding {
  readonly nowEpochMs: number;
  readonly maxEvidenceAgeMs: number;
  readonly admittedRealHostObservationIds: readonly string[];
}

export interface HostMutationBoundaryObservation {
  readonly schemaVersion: 1;
  readonly observationId: string;
  readonly attackFamily: HostAttackFamily;
  readonly evidenceKind: "SYNTHETIC_VECTOR" | "REAL_HOST_OBSERVATION";
  readonly observerOwner: "R2_HOST_EVALUATOR";
  readonly adapterOwner: string;
  readonly observedAtEpochMs: number;
  readonly candidate: HostCandidateBinding;
  readonly capability: "PROVISION_SANDBOX";
  readonly requestedOperation: "PROVISION_EMPTY_SANDBOX";
  readonly authorizationDecision: "ALLOWED" | "REJECTED";
  readonly canonicalApprovedRoot: string;
  readonly canonicalParent: string;
  readonly canonicalTarget: string;
  readonly resolvedTarget: string;
  readonly resolvedInsideApprovedRoot: boolean;
  readonly targetExpectedAbsent: true;
  readonly authorizedRootIdentity: HostObjectIdentity;
  readonly authorizedParentIdentity: HostObjectIdentity;
  readonly parentIdentityAtUse: HostObjectIdentity | null;
  readonly createdObjectIdentity: HostObjectIdentity | null;
  readonly objectIdentityAtUse: HostObjectIdentity | null;
  readonly repositoryIdentity: HostObjectIdentity;
  readonly mutationAttempted: boolean;
  readonly actualChange: "NONE" | "EMPTY_DIRECTORY_CREATED" | "UNKNOWN";
  readonly cleanupOutcome: "SUCCESS" | "FAILED" | "UNKNOWN" | "NOT_APPLICABLE";
  readonly terminalObjectExists: boolean | null;
  readonly authorityRevoked: boolean;
  readonly reusable: boolean;
  readonly forbiddenActionsObserved: readonly string[];
  readonly eventReferences: readonly string[];
  readonly semanticEventCount: number;
  readonly hashChainValid: boolean;
}

export interface HostBoundaryDecision {
  readonly decision: "ACCEPT" | "REJECT" | "INSUFFICIENT_EVIDENCE";
  readonly reasons: readonly string[];
  readonly candidateBound: boolean;
  readonly realHostEvidence: boolean;
  readonly operationalAuthorityGranted: false;
}

export interface HostEvaluationCoverage {
  readonly syntheticFamilies: readonly HostAttackFamily[];
  readonly realHostFamilies: readonly HostAttackFamily[];
  readonly missingSyntheticFamilies: readonly HostAttackFamily[];
  readonly operationalAuthority: "UNAVAILABLE";
}
