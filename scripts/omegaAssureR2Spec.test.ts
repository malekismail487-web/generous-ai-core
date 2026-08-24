import {
  OMEGA_ASSURE_R2_SPEC_001,
  R2_ASSURANCE_CLAIMS,
  R2_OPERATIONAL_PHASES,
  assessR2Assurance,
  evidenceIsMethodologicallyIndependent,
  validateR2AssuranceSpecification,
  type R2AssuranceEvidence,
  type R2AssurancePackage,
  type R2AssuranceSpecification,
} from "../src/lib/codelab/assurance/r2AssuranceSpec";

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

function spec(overrides: Partial<R2AssuranceSpecification> = {}): R2AssuranceSpecification {
  return { ...structuredClone(OMEGA_ASSURE_R2_SPEC_001), ...overrides };
}

function evidence(claim: R2AssuranceEvidence["claim"], overrides: Partial<R2AssuranceEvidence> = {}): R2AssuranceEvidence {
  return {
    evidenceId: `OMEGA-EV-${claim}`,
    claim,
    result: "PASS",
    evidenceClass: "E3",
    provenance: `evaluator://heldout/${claim}`,
    freshness: "CURRENT",
    evaluatorOwner: "INDEPENDENT_EVALUATOR",
    oracleOwner: "R2-INDEPENDENT-ORACLE",
    implementationOwner: "R2-IMPLEMENTATION",
    sharesImplementationHelpers: false,
    independenceBasis: "Evaluator-owned oracle and fixtures do not import implementation normalization or validators.",
    ...overrides,
  };
}

function assurancePackage(overrides: Partial<R2AssurancePackage> = {}): R2AssurancePackage {
  return {
    schemaVersion: 1,
    packageId: "OMEGA-R2-ASSURANCE-PACKAGE-001",
    candidateCommit: "candidate-commit",
    baselineR1Commit: "7729cf3e3e6bdb9e8771dfcad6386ecc9fa55296",
    operationalPhasesClaimed: R2_OPERATIONAL_PHASES,
    evidence: R2_ASSURANCE_CLAIMS.map((claim) => evidence(claim)),
    ...overrides,
  };
}

assert(validateR2AssuranceSpecification(OMEGA_ASSURE_R2_SPEC_001).ok, "reference R2 assurance specification validates");
assert(OMEGA_ASSURE_R2_SPEC_001.maturity === "SPECIFIED", "assurance artifact stops at SPECIFIED maturity");
assert(OMEGA_ASSURE_R2_SPEC_001.certifiesOperationalCapability === false, "specification cannot certify operational R2");
assert(OMEGA_ASSURE_R2_SPEC_001.allowedOutputs.length === 3, "assurance kernel exposes exactly three outcomes");
assert(OMEGA_ASSURE_R2_SPEC_001.allowedOutputs.includes("INSUFFICIENT_EVIDENCE"), "insufficient evidence is a first-class outcome");
assert(OMEGA_ASSURE_R2_SPEC_001.implementationOwnedTestsSufficient === false, "implementation-owned tests are never sufficient alone");
assert(OMEGA_ASSURE_R2_SPEC_001.generatorConfidenceIsEvidence === false, "generator confidence is not evidence");
assert(OMEGA_ASSURE_R2_SPEC_001.evaluatorMayRejectAllImplementationTestsGreen, "independent evaluator may reject a green implementation suite");
assert(OMEGA_ASSURE_R2_SPEC_001.securityClaimForSessionHashChain === "TAMPER_EVIDENT_NOT_SIGNED", "hash-chain claim remains exact");
assert(R2_ASSURANCE_CLAIMS.length === 8, "all eight required R2 assurance questions are explicit");
assert(R2_OPERATIONAL_PHASES.length === 7, "assurance contract requires R2-A through R2-G");
assert(!validateR2AssuranceSpecification(spec({ certifiesOperationalCapability: true as never })).ok, "specification maturity inflation is rejected");
assert(!validateR2AssuranceSpecification(spec({ implementationOwnedTestsSufficient: true as never })).ok, "correlated implementation evidence cannot be made sufficient");
assert(!validateR2AssuranceSpecification(spec({ minimumIndependentEvidenceClass: "E1" as never })).ok, "independence floor cannot be weakened below E3");
assert(!validateR2AssuranceSpecification(spec({ securityClaimForSessionHashChain: "SIGNED" as never })).ok, "tamper evidence cannot be described as signed");

const independent = evidence("INTENDED_AUTHORITY_ONLY");
assert(evidenceIsMethodologicallyIndependent(independent), "fresh separately owned E3 evidence satisfies the independence method check");
assert(!evidenceIsMethodologicallyIndependent(evidence("INTENDED_AUTHORITY_ONLY", { evidenceClass: "E1" })), "E1 evidence is too correlated for promotion");
assert(!evidenceIsMethodologicallyIndependent(evidence("INTENDED_AUTHORITY_ONLY", { evaluatorOwner: "IMPLEMENTATION" })), "implementation-owned evaluator is not independent");
assert(!evidenceIsMethodologicallyIndependent(evidence("INTENDED_AUTHORITY_ONLY", { sharesImplementationHelpers: true })), "shared implementation helpers defeat evaluator independence");
assert(!evidenceIsMethodologicallyIndependent(evidence("INTENDED_AUTHORITY_ONLY", { oracleOwner: "R2-IMPLEMENTATION" })), "same oracle and implementation owner defeats independence");
assert(!evidenceIsMethodologicallyIndependent(evidence("INTENDED_AUTHORITY_ONLY", { freshness: "STALE" })), "stale evidence cannot promote R2");
assert(!evidenceIsMethodologicallyIndependent(evidence("INTENDED_AUTHORITY_ONLY", { independenceBasis: null })), "independence requires a concrete basis");

const empty = assessR2Assurance({ ...assurancePackage(), operationalPhasesClaimed: [], evidence: [] });
assert(empty.decision === "INSUFFICIENT_EVIDENCE", "empty future package is insufficient rather than accepted");
assert(empty.missingClaims.length === 8, "empty package reports every missing claim");
assert(empty.missingOperationalPhases.length === 7, "empty package reports every missing R2 phase");

const implementationOnly = assessR2Assurance({
  ...assurancePackage(),
  evidence: R2_ASSURANCE_CLAIMS.map((claim) => evidence(claim, {
    evidenceClass: "E1",
    evaluatorOwner: "IMPLEMENTATION",
    oracleOwner: "R2-IMPLEMENTATION",
    sharesImplementationHelpers: true,
    independenceBasis: null,
  })),
});
assert(implementationOnly.decision === "INSUFFICIENT_EVIDENCE", "all-green implementation-owned tests cannot accept R2");
assert(implementationOnly.weaklyEvidencedClaims.length === 8, "correlated green evidence identifies every weakly evidenced claim");

const missingPhase = assessR2Assurance({ ...assurancePackage(), operationalPhasesClaimed: R2_OPERATIONAL_PHASES.slice(0, 6) });
assert(missingPhase.decision === "INSUFFICIENT_EVIDENCE", "missing R2-G evidence blocks promotion");
assert(missingPhase.missingOperationalPhases[0] === "R2-G", "missing phase is reported exactly");

const failedBoundary = assessR2Assurance({
  ...assurancePackage(),
  evidence: [
    ...R2_ASSURANCE_CLAIMS.filter((claim) => claim !== "SANDBOX_BOUNDARY_CONFINEMENT").map((claim) => evidence(claim)),
    evidence("SANDBOX_BOUNDARY_CONFINEMENT", { result: "FAIL", evidenceId: "OMEGA-EV-BOUNDARY-ESCAPE" }),
  ],
});
assert(failedBoundary.decision === "REJECT", "one sandbox escape rejects R2 despite every other green result");
assert(failedBoundary.rejectedEvidenceIds.includes("OMEGA-EV-BOUNDARY-ESCAPE"), "rejection preserves falsifying evidence identity");

const forbiddenAuthority = assessR2Assurance({
  ...assurancePackage(),
  evidence: [
    ...R2_ASSURANCE_CLAIMS.filter((claim) => claim !== "FORBIDDEN_AUTHORITY_PRESERVATION").map((claim) => evidence(claim)),
    evidence("FORBIDDEN_AUTHORITY_PRESERVATION", { result: "FAIL", evidenceId: "OMEGA-EV-FORBIDDEN-AUTHORITY" }),
  ],
});
assert(forbiddenAuthority.decision === "REJECT", "accidental forbidden authority rejects R2");

const valid = assessR2Assurance(assurancePackage());
assert(valid.decision === "ACCEPT", "complete fresh independent E3 evidence can accept a future R2 package");
assert(valid.acceptedEvidenceIds.length === 8, "acceptance preserves one independent evidence identity per claim");
assert(valid.missingClaims.length === 0 && valid.weaklyEvidencedClaims.length === 0, "accepted package has no evidence gaps");

const duplicateEvidence = assurancePackage({
  evidence: [...assurancePackage().evidence, assurancePackage().evidence[0]],
});
assert(assessR2Assurance(duplicateEvidence).decision === "INSUFFICIENT_EVIDENCE", "duplicate evidence identity prevents acceptance");
assert(assessR2Assurance({ ...assurancePackage(), schemaVersion: 2 as never }).decision === "INSUFFICIENT_EVIDENCE", "unsupported assurance package schema fails closed");

console.log(`Omega R2 assurance specification tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  console.error("FAILURES:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
