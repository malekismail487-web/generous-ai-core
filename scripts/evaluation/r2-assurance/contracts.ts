export const ASSURANCE_CLAIMS = Object.freeze([
  "INTENDED_AUTHORITY_ONLY",
  "R1_PRESERVATION",
  "FORBIDDEN_AUTHORITY_PRESERVATION",
  "ROLLBACK_EQUIVALENCE",
  "STALE_STATE_REJECTION",
  "SANDBOX_BOUNDARY_CONFINEMENT",
  "AUDIT_RECONSTRUCTION",
  "CLEANUP_TERMINAL_STATE",
  "EVALUATOR_INDEPENDENCE",
  "NEGATIVE_CAPABILITY_DELTA",
] as const);
export type AssuranceClaim = (typeof ASSURANCE_CLAIMS)[number];

export const OPERATIONAL_PHASES = Object.freeze(["R2-A", "R2-B", "R2-C", "R2-D", "R2-E", "R2-F", "R2-G"] as const);
export type OperationalPhase = (typeof OPERATIONAL_PHASES)[number];
export type EvidenceClass = "E0" | "E1" | "E2" | "E3" | "E4" | "E5";

export interface CandidateVersion {
  readonly commit: string;
  readonly capabilityVersion: string;
  readonly schemaVersion: 1;
  readonly environmentIdentity: string;
}

export interface AssuranceEvidenceVector {
  readonly evidenceId: string;
  readonly claim: AssuranceClaim;
  readonly result: "PASS" | "FAIL" | "UNOBSERVED";
  readonly evidenceClass: EvidenceClass;
  readonly evaluatorOwner: "IMPLEMENTATION" | "SEPARATE_EVALUATOR" | "EXTERNAL_MECHANISM" | "HUMAN_INSTITUTION";
  readonly oracleOwner: string;
  readonly implementationOwner: string;
  readonly sharesImplementationHelpers: boolean;
  readonly independenceBasis: string | null;
  readonly provenance: string;
  readonly artifactDigest: string;
  readonly candidate: CandidateVersion;
  readonly observedAtEpochMs: number;
}

export interface CapabilityDeltaVector {
  readonly addedAllowed: readonly string[];
  readonly removedAllowed: readonly string[];
  readonly removedForbidden: readonly string[];
  readonly currentForbidden: readonly string[];
}

export interface KnownFailureVector {
  readonly failureId: string;
  readonly status: "OPEN" | "RESOLVED";
  readonly severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  readonly candidate: CandidateVersion;
  readonly evidenceId: string;
}

export interface RemainingUnknownVector {
  readonly unknownId: string;
  readonly blocking: boolean;
  readonly statement: string;
}

export interface AssurancePackageVector {
  readonly schemaVersion: 1;
  readonly packageId: string;
  readonly evaluatorVersion: "r2-assurance-eval/1";
  readonly candidate: CandidateVersion;
  readonly baselineR1Commit: string;
  readonly operationalPhases: readonly OperationalPhase[];
  readonly evidence: readonly AssuranceEvidenceVector[];
  readonly capabilityDelta: CapabilityDeltaVector;
  readonly knownFailures: readonly KnownFailureVector[];
  readonly remainingUnknowns: readonly RemainingUnknownVector[];
}

export interface AssuranceEvaluationContext {
  readonly expectedCandidate: CandidateVersion;
  readonly expectedBaselineR1Commit: string;
  readonly nowEpochMs: number;
  readonly maxEvidenceAgeMs: number;
  readonly admittedEvidenceDigests: Readonly<Record<string, string>>;
  readonly requiredForbiddenActions: readonly string[];
  readonly permittedAddedAuthorities: readonly string[];
}

export interface AssuranceEvaluationResult {
  readonly decision: "ACCEPT" | "REJECT" | "INSUFFICIENT_EVIDENCE";
  readonly reasons: readonly string[];
  readonly acceptedEvidenceIds: readonly string[];
  readonly rejectedEvidenceIds: readonly string[];
  readonly missingClaims: readonly AssuranceClaim[];
  readonly missingPhases: readonly OperationalPhase[];
  readonly certifiesCurrentOperationalR2: false;
}
