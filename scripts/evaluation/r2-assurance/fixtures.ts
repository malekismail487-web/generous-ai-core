import { ASSURANCE_CLAIMS, OPERATIONAL_PHASES, type AssuranceEvaluationContext, type AssuranceEvidenceVector, type AssurancePackageVector, type CandidateVersion } from "./contracts";
import { EvidenceCustodySession, computeAuthoritativeEvidenceDigest } from "../evidence-custody/custodian";
import type { EvidenceAdmissionPolicy, EvidenceArtifact } from "../evidence-custody/contracts";

export const FIXTURE_CANDIDATE: CandidateVersion = Object.freeze({
  commit: "1111111111111111111111111111111111111111",
  capabilityVersion: "r2/fixture-1",
  schemaVersion: 1,
  environmentIdentity: "assurance-vector-environment-1",
});
const BASELINE = "7729cf3e3e6bdb9e8771dfcad6386ecc9fa55296";
const EVIDENCE_EVALUATOR_VERSION = "r2-evidence-eval/1";

export function artifactForEvidence(evidence: AssuranceEvidenceVector): EvidenceArtifact {
  return {
    schemaVersion: 1,
    artifactId: evidence.evidenceId,
    evidenceType: "R2_ASSURANCE_OBSERVATION",
    source: evidence.provenance,
    candidate: evidence.candidate,
    evaluatorVersion: evidence.evaluatorVersion,
    observedAtEpochMs: evidence.observedAtEpochMs,
    independence: {
      evidenceClass: evidence.evidenceClass,
      evidenceChannel: "r2-assurance-heldout",
      producerOwner: evidence.evaluatorOwner,
      evaluatorOwner: evidence.evaluatorOwner,
      oracleOwner: evidence.oracleOwner,
      implementationOwner: evidence.implementationOwner,
      sharesImplementationHelpers: evidence.sharesImplementationHelpers,
      independenceBasis: evidence.independenceBasis,
    },
    payload: { evidenceId: evidence.evidenceId, claim: evidence.claim, result: evidence.result },
  };
}

export function independentEvidence(index: number, overrides: Partial<AssuranceEvidenceVector> = {}): AssuranceEvidenceVector {
  const claim = ASSURANCE_CLAIMS[index % ASSURANCE_CLAIMS.length];
  const base: AssuranceEvidenceVector = {
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
    evaluatorVersion: EVIDENCE_EVALUATOR_VERSION,
    artifactDigest: "0".repeat(64),
    candidate: FIXTURE_CANDIDATE,
    observedAtEpochMs: 9_000,
    ...overrides,
  };
  if (overrides.artifactDigest !== undefined) return base;
  return { ...base, artifactDigest: computeAuthoritativeEvidenceDigest(artifactForEvidence(base)) };
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

export function contextFor(
  pkg: AssurancePackageVector = acceptablePackage(),
  overrides: Partial<AssuranceEvaluationContext> = {},
): AssuranceEvaluationContext {
  const admissionPolicy: EvidenceAdmissionPolicy = {
    schemaVersion: 1,
    policyId: "OMEGA-R2-ASSURANCE-CUSTODY-001",
    custodianId: "OMEGA-R2-ASSURANCE-CUSTODIAN",
    expectedCandidate: FIXTURE_CANDIDATE,
    compatibleEvaluatorVersions: [EVIDENCE_EVALUATOR_VERSION],
    allowedEvidenceTypes: ["R2_ASSURANCE_OBSERVATION"],
    admittedAtEpochMs: 10_000,
    maxEvidenceAgeMs: 5_000,
    maxFutureSkewMs: 0,
  };
  const custody = new EvidenceCustodySession(admissionPolicy);
  const artifacts = new Map<string, EvidenceArtifact>();
  for (const item of pkg.evidence) {
    const artifact = artifactForEvidence(item);
    const admission = custody.admit({
      schemaVersion: 1,
      requestId: `ADMIT-${item.evidenceId}`,
      artifact,
      candidateClaimedDigest: item.artifactDigest,
    });
    if (admission.decision === "ADMIT") artifacts.set(item.evidenceId, artifact);
  }
  const admittedEvidence = Object.fromEntries(custody.records().map((record) => [record.artifactId, { record, artifact: artifacts.get(record.artifactId)! }]));
  return {
    expectedCandidate: FIXTURE_CANDIDATE,
    expectedBaselineR1Commit: BASELINE,
    nowEpochMs: 10_000,
    maxEvidenceAgeMs: 5_000,
    admissionPolicy,
    admittedEvidence,
    externalKnownFailures: pkg.knownFailures,
    externalBlockingUnknowns: pkg.remainingUnknowns.filter((item) => item.blocking),
    requiredForbiddenActions: ["WRITE_REPOSITORY", "SHELL", "NETWORK", "CREDENTIAL_ACCESS", "PACKAGE_INSTALL", "DEPLOYMENT"],
    permittedAddedAuthorities: ["PROVISION_SANDBOX", "TERMINATE_SANDBOX"],
    ...overrides,
  };
}
