export const R2_ASSURANCE_CLAIMS = Object.freeze([
  "INTENDED_AUTHORITY_ONLY",
  "R1_PRESERVATION",
  "FORBIDDEN_AUTHORITY_PRESERVATION",
  "ROLLBACK_EQUIVALENCE",
  "STALE_STATE_REJECTION",
  "SANDBOX_BOUNDARY_CONFINEMENT",
  "AUDIT_RECONSTRUCTION",
  "EVALUATOR_INDEPENDENCE",
] as const);
export type R2AssuranceClaim = (typeof R2_ASSURANCE_CLAIMS)[number];

export const R2_OPERATIONAL_PHASES = Object.freeze([
  "R2-A",
  "R2-B",
  "R2-C",
  "R2-D",
  "R2-E",
  "R2-F",
  "R2-G",
] as const);
export type R2OperationalPhase = (typeof R2_OPERATIONAL_PHASES)[number];

export type AssuranceDecision = "ACCEPT" | "REJECT" | "INSUFFICIENT_EVIDENCE";
export type AssuranceEvidenceClass = "E0" | "E1" | "E2" | "E3" | "E4" | "E5";

export interface R2AssuranceSpecification {
  readonly schemaVersion: 1;
  readonly specificationId: "OMEGA-ASSURE-R2-SPEC-001";
  readonly maturity: "SPECIFIED";
  readonly implementationState: "DECISION_CONTRACT_ONLY";
  readonly certifiesOperationalCapability: false;
  readonly allowedOutputs: readonly ["ACCEPT", "REJECT", "INSUFFICIENT_EVIDENCE"];
  readonly requiredClaims: readonly R2AssuranceClaim[];
  readonly requiredOperationalPhases: readonly R2OperationalPhase[];
  readonly minimumIndependentEvidenceClass: "E3";
  readonly implementationOwnedTestsSufficient: false;
  readonly generatorConfidenceIsEvidence: false;
  readonly evaluatorMayRejectAllImplementationTestsGreen: true;
  readonly securityClaimForSessionHashChain: "TAMPER_EVIDENT_NOT_SIGNED";
}

export interface R2AssuranceEvidence {
  readonly evidenceId: string;
  readonly claim: R2AssuranceClaim;
  readonly result: "PASS" | "FAIL" | "UNOBSERVED";
  readonly evidenceClass: AssuranceEvidenceClass;
  readonly provenance: string;
  readonly freshness: "CURRENT" | "STALE";
  readonly evaluatorOwner: "IMPLEMENTATION" | "INDEPENDENT_EVALUATOR" | "EXTERNAL_MECHANISM" | "HUMAN_INSTITUTION";
  readonly oracleOwner: string;
  readonly implementationOwner: string;
  readonly sharesImplementationHelpers: boolean;
  readonly independenceBasis: string | null;
}

export interface R2AssurancePackage {
  readonly schemaVersion: 1;
  readonly packageId: string;
  readonly candidateCommit: string;
  readonly baselineR1Commit: string;
  readonly operationalPhasesClaimed: readonly R2OperationalPhase[];
  readonly evidence: readonly R2AssuranceEvidence[];
}

export interface R2AssuranceResult {
  readonly decision: AssuranceDecision;
  readonly reasons: readonly string[];
  readonly acceptedEvidenceIds: readonly string[];
  readonly rejectedEvidenceIds: readonly string[];
  readonly missingClaims: readonly R2AssuranceClaim[];
  readonly weaklyEvidencedClaims: readonly R2AssuranceClaim[];
  readonly missingOperationalPhases: readonly R2OperationalPhase[];
}

export interface AssuranceSpecificationValidation {
  readonly ok: boolean;
  readonly issues: readonly string[];
}

const INDEPENDENT_CLASS_RANK: Readonly<Record<AssuranceEvidenceClass, number>> = Object.freeze({
  E0: 0,
  E1: 1,
  E2: 2,
  E3: 3,
  E4: 4,
  E5: 5,
});

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function unique<T>(values: readonly T[]): readonly T[] {
  return [...new Set(values)];
}

export function validateR2AssuranceSpecification(
  spec: R2AssuranceSpecification,
): AssuranceSpecificationValidation {
  const issues: string[] = [];
  if (spec.schemaVersion !== 1 || spec.specificationId !== "OMEGA-ASSURE-R2-SPEC-001") issues.push("unsupported_or_wrong_specification");
  if (spec.maturity !== "SPECIFIED" || spec.implementationState !== "DECISION_CONTRACT_ONLY") issues.push("assurance_maturity_inflation");
  if (spec.certifiesOperationalCapability !== false) issues.push("specification_cannot_certify_capability");
  if (spec.allowedOutputs.length !== 3
    || !spec.allowedOutputs.includes("ACCEPT")
    || !spec.allowedOutputs.includes("REJECT")
    || !spec.allowedOutputs.includes("INSUFFICIENT_EVIDENCE")) issues.push("invalid_decision_surface");
  for (const claim of R2_ASSURANCE_CLAIMS) {
    if (!spec.requiredClaims.includes(claim)) issues.push(`missing_required_claim:${claim}`);
  }
  for (const phase of R2_OPERATIONAL_PHASES) {
    if (!spec.requiredOperationalPhases.includes(phase)) issues.push(`missing_required_phase:${phase}`);
  }
  if (spec.minimumIndependentEvidenceClass !== "E3") issues.push("independence_floor_weakened");
  if (spec.implementationOwnedTestsSufficient !== false || spec.generatorConfidenceIsEvidence !== false) issues.push("correlated_evidence_inflation");
  if (spec.evaluatorMayRejectAllImplementationTestsGreen !== true) issues.push("independent_rejection_disabled");
  if (spec.securityClaimForSessionHashChain !== "TAMPER_EVIDENT_NOT_SIGNED") issues.push("hash_chain_claim_inflated");
  return { ok: issues.length === 0, issues };
}

export function evidenceIsMethodologicallyIndependent(evidence: R2AssuranceEvidence): boolean {
  return INDEPENDENT_CLASS_RANK[evidence.evidenceClass] >= INDEPENDENT_CLASS_RANK.E3
    && evidence.evaluatorOwner !== "IMPLEMENTATION"
    && evidence.oracleOwner !== evidence.implementationOwner
    && evidence.sharesImplementationHelpers === false
    && nonEmpty(evidence.independenceBasis)
    && nonEmpty(evidence.provenance)
    && evidence.freshness === "CURRENT";
}

function invalidPackageReasons(pkg: R2AssurancePackage): string[] {
  const reasons: string[] = [];
  if (pkg.schemaVersion !== 1) reasons.push("unsupported_package_schema");
  if (!nonEmpty(pkg.packageId) || !nonEmpty(pkg.candidateCommit) || !nonEmpty(pkg.baselineR1Commit)) reasons.push("missing_package_identity");
  const evidenceIds = new Set<string>();
  for (const evidence of pkg.evidence) {
    if (!nonEmpty(evidence.evidenceId) || !nonEmpty(evidence.provenance)) reasons.push("malformed_evidence");
    if (evidenceIds.has(evidence.evidenceId)) reasons.push(`duplicate_evidence_id:${evidence.evidenceId}`);
    evidenceIds.add(evidence.evidenceId);
  }
  return reasons;
}

export function assessR2Assurance(
  pkg: R2AssurancePackage,
  spec: R2AssuranceSpecification = OMEGA_ASSURE_R2_SPEC_001,
): R2AssuranceResult {
  const reasons = [...validateR2AssuranceSpecification(spec).issues, ...invalidPackageReasons(pkg)];
  const missingOperationalPhases = R2_OPERATIONAL_PHASES.filter((phase) => !pkg.operationalPhasesClaimed.includes(phase));
  if (unique(pkg.operationalPhasesClaimed).length !== pkg.operationalPhasesClaimed.length) reasons.push("duplicate_operational_phase");

  const rejectedEvidenceIds = pkg.evidence
    .filter((item) => item.result === "FAIL")
    .map((item) => item.evidenceId);
  if (rejectedEvidenceIds.length > 0) {
    return {
      decision: "REJECT",
      reasons: [...reasons, "falsifying_evidence_present"],
      acceptedEvidenceIds: [],
      rejectedEvidenceIds,
      missingClaims: [],
      weaklyEvidencedClaims: [],
      missingOperationalPhases,
    };
  }

  const missingClaims: R2AssuranceClaim[] = [];
  const weaklyEvidencedClaims: R2AssuranceClaim[] = [];
  const acceptedEvidenceIds: string[] = [];
  for (const claim of R2_ASSURANCE_CLAIMS) {
    const passing = pkg.evidence.filter((item) => item.claim === claim && item.result === "PASS");
    if (passing.length === 0) {
      missingClaims.push(claim);
      continue;
    }
    const independent = passing.filter(evidenceIsMethodologicallyIndependent);
    if (independent.length === 0) weaklyEvidencedClaims.push(claim);
    else acceptedEvidenceIds.push(...independent.map((item) => item.evidenceId));
  }

  if (reasons.length > 0
    || missingOperationalPhases.length > 0
    || missingClaims.length > 0
    || weaklyEvidencedClaims.length > 0) {
    return {
      decision: "INSUFFICIENT_EVIDENCE",
      reasons: [
        ...reasons,
        ...(missingOperationalPhases.length > 0 ? ["operational_phase_evidence_incomplete"] : []),
        ...(missingClaims.length > 0 ? ["required_claims_unobserved"] : []),
        ...(weaklyEvidencedClaims.length > 0 ? ["independent_evidence_floor_not_met"] : []),
      ],
      acceptedEvidenceIds,
      rejectedEvidenceIds,
      missingClaims,
      weaklyEvidencedClaims,
      missingOperationalPhases,
    };
  }

  return {
    decision: "ACCEPT",
    reasons: [],
    acceptedEvidenceIds,
    rejectedEvidenceIds,
    missingClaims,
    weaklyEvidencedClaims,
    missingOperationalPhases,
  };
}

export const OMEGA_ASSURE_R2_SPEC_001 = Object.freeze<R2AssuranceSpecification>({
  schemaVersion: 1,
  specificationId: "OMEGA-ASSURE-R2-SPEC-001",
  maturity: "SPECIFIED",
  implementationState: "DECISION_CONTRACT_ONLY",
  certifiesOperationalCapability: false,
  allowedOutputs: ["ACCEPT", "REJECT", "INSUFFICIENT_EVIDENCE"],
  requiredClaims: R2_ASSURANCE_CLAIMS,
  requiredOperationalPhases: R2_OPERATIONAL_PHASES,
  minimumIndependentEvidenceClass: "E3",
  implementationOwnedTestsSufficient: false,
  generatorConfidenceIsEvidence: false,
  evaluatorMayRejectAllImplementationTestsGreen: true,
  securityClaimForSessionHashChain: "TAMPER_EVIDENT_NOT_SIGNED",
});
