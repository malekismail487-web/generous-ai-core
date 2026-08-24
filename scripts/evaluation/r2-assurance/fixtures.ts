import { ASSURANCE_CLAIMS, OPERATIONAL_PHASES, type AssuranceEvaluationContext, type AssuranceEvidenceVector, type AssurancePackageVector, type CandidateVersion } from "./contracts";

export const FIXTURE_CANDIDATE: CandidateVersion = Object.freeze({
  commit: "1111111111111111111111111111111111111111",
  capabilityVersion: "r2/fixture-1",
  schemaVersion: 1,
  environmentIdentity: "assurance-vector-environment-1",
});
const BASELINE = "7729cf3e3e6bdb9e8771dfcad6386ecc9fa55296";
function digest(index: number): string { return index.toString(16).padStart(64, "0"); }

export function independentEvidence(index: number, overrides: Partial<AssuranceEvidenceVector> = {}): AssuranceEvidenceVector {
  const claim = ASSURANCE_CLAIMS[index % ASSURANCE_CLAIMS.length];
  return {
    evidenceId: `R2-ASSURANCE-FIXTURE-${String(index).padStart(2, "0")}`,
    claim,
    result: "PASS",
    evidenceClass: "E3",
    evaluatorOwner: "SEPARATE_EVALUATOR",
    oracleOwner: "R2-ASSURANCE-ORACLE",
    implementationOwner: "R2-IMPLEMENTATION",
    sharesImplementationHelpers: false,
    independenceBasis: "Evaluator-owned oracle and artifact admission are separate from the implementation path.",
    provenance: `fixture://r2-assurance/${claim}`,
    artifactDigest: digest(index + 1),
    candidate: FIXTURE_CANDIDATE,
    observedAtEpochMs: 9_000,
    ...overrides,
  };
}

export function acceptablePackage(overrides: Partial<AssurancePackageVector> = {}): AssurancePackageVector {
  return {
    schemaVersion: 1,
    packageId: "R2-ASSURANCE-ACCEPTABLE-001",
    evaluatorVersion: "r2-assurance-eval/1",
    candidate: FIXTURE_CANDIDATE,
    baselineR1Commit: BASELINE,
    operationalPhases: OPERATIONAL_PHASES,
    evidence: ASSURANCE_CLAIMS.map((_, index) => independentEvidence(index)),
    capabilityDelta: {
      addedAllowed: ["PROVISION_SANDBOX", "TERMINATE_SANDBOX"],
      removedAllowed: [],
      removedForbidden: [],
      currentForbidden: ["WRITE_REPOSITORY", "SHELL", "NETWORK", "CREDENTIAL_ACCESS", "PACKAGE_INSTALL", "DEPLOYMENT"],
    },
    knownFailures: [],
    remainingUnknowns: [],
    ...overrides,
  };
}

export function contextFor(pkg: AssurancePackageVector = acceptablePackage()): AssuranceEvaluationContext {
  return {
    expectedCandidate: FIXTURE_CANDIDATE,
    expectedBaselineR1Commit: BASELINE,
    nowEpochMs: 10_000,
    maxEvidenceAgeMs: 5_000,
    admittedEvidenceDigests: Object.fromEntries(pkg.evidence.map((item) => [item.evidenceId, item.artifactDigest])),
    requiredForbiddenActions: ["WRITE_REPOSITORY", "SHELL", "NETWORK", "CREDENTIAL_ACCESS", "PACKAGE_INSTALL", "DEPLOYMENT"],
    permittedAddedAuthorities: ["PROVISION_SANDBOX", "TERMINATE_SANDBOX"],
  };
}
