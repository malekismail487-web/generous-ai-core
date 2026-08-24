import {
  OMEGA_R2_COMPOSE_SEC_SPEC_001,
  R2_COMPOSITION_COMPONENTS,
  R2_COMPOSITION_SECURITY_DOMAINS,
  assessR2CompositionReview,
  validateR2CompositionSecuritySpecification,
  type R2CompositionObservation,
  type R2CompositionReviewPackage,
  type R2CompositionSecuritySpecification,
} from "../src/lib/codelab/assurance/r2CompositionSecuritySpec";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function assert(value: unknown, label: string): void {
  if (value) passed += 1;
  else { failed += 1; failures.push(label); console.error(`  x ${label}`); }
}

const COMMIT = "5".repeat(40);
function observation(index: number, overrides: Partial<R2CompositionObservation> = {}): R2CompositionObservation {
  const domain = R2_COMPOSITION_SECURITY_DOMAINS[index % R2_COMPOSITION_SECURITY_DOMAINS.length];
  return {
    observationId: `R2-COMPOSE-OBS-${String(index).padStart(2, "0")}`,
    domain,
    result: "PASS",
    evidenceClass: "E3",
    provenance: `heldout://r2-composition/${domain}`,
    independenceBasis: "Evaluator-owned cross-component fixture imports no component implementation helpers.",
    evaluatorOwner: "R2-COMPOSITION-EVALUATOR",
    implementationOwner: "R2-IMPLEMENTATION",
    sharesImplementationHelpers: false,
    candidateCommit: COMMIT,
    environmentIdentity: "windows-r2-composition-fixture",
    componentIds: [R2_COMPOSITION_COMPONENTS[index % R2_COMPOSITION_COMPONENTS.length], R2_COMPOSITION_COMPONENTS[(index + 1) % R2_COMPOSITION_COMPONENTS.length]],
    freshness: "CURRENT",
    ...overrides,
  };
}

function reviewPackage(overrides: Partial<R2CompositionReviewPackage> = {}): R2CompositionReviewPackage {
  return {
    schemaVersion: 1,
    packageId: "OMEGA-R2-COMPOSE-REVIEW-FIXTURE-001",
    candidateCommit: COMMIT,
    environmentIdentity: "windows-r2-composition-fixture",
    componentBindings: R2_COMPOSITION_COMPONENTS.map((component) => ({ component, version: `${component}/1`, candidateCommit: COMMIT })),
    observations: R2_COMPOSITION_SECURITY_DOMAINS.map((_, index) => observation(index)),
    authorityDelta: {
      addedAllowed: ["PROVISION_SANDBOX", "TERMINATE_SANDBOX"],
      removedAllowed: [],
      removedForbidden: [],
      currentForbidden: ["WRITE_REPOSITORY", "SHELL", "NETWORK", "CREDENTIAL_ACCESS", "PACKAGE_INSTALL", "DEPLOYMENT"],
    },
    permittedAddedAuthorities: ["PROVISION_SANDBOX", "TERMINATE_SANDBOX"],
    blockingUnknowns: [],
    ...overrides,
  };
}

function spec(overrides: Partial<R2CompositionSecuritySpecification> = {}): R2CompositionSecuritySpecification {
  return { ...structuredClone(OMEGA_R2_COMPOSE_SEC_SPEC_001), ...overrides };
}

assert(validateR2CompositionSecuritySpecification(OMEGA_R2_COMPOSE_SEC_SPEC_001).ok, "reference composition-security specification validates");
assert(OMEGA_R2_COMPOSE_SEC_SPEC_001.maturity === "SPECIFIED", "composition review stops at SPECIFIED maturity");
assert(OMEGA_R2_COMPOSE_SEC_SPEC_001.implementationState === "REVIEW_CONTRACT_ONLY", "review contract is not an operational implementation");
assert(OMEGA_R2_COMPOSE_SEC_SPEC_001.grantsOperationalAuthority === false, "composition specification grants no authority");
assert(OMEGA_R2_COMPOSE_SEC_SPEC_001.certifiesOperationalR2 === false, "composition specification cannot certify operational R2");
assert(OMEGA_R2_COMPOSE_SEC_SPEC_001.compositionLaw === "SECURE_COMPONENTS_DO_NOT_IMPLY_SECURE_COMPOSITION", "secure components never imply secure composition");
assert(R2_COMPOSITION_COMPONENTS.length === 12, "all twelve composition components are explicit");
assert(R2_COMPOSITION_SECURITY_DOMAINS.length === 12, "all twelve cross-component security domains are explicit");
assert(OMEGA_R2_COMPOSE_SEC_SPEC_001.minimumIndependentEvidenceClass === "E3", "composition review requires E3 or stronger evidence");
assert(OMEGA_R2_COMPOSE_SEC_SPEC_001.hashChainClaim === "TAMPER_EVIDENT_NOT_SIGNED", "hash-chain terminology remains exact");
assert(!validateR2CompositionSecuritySpecification(spec({ grantsOperationalAuthority: true as never })).ok, "specification authority inflation is rejected");
assert(!validateR2CompositionSecuritySpecification(spec({ requiredDomains: R2_COMPOSITION_SECURITY_DOMAINS.slice(1) })).ok, "missing security domain invalidates specification");
assert(!validateR2CompositionSecuritySpecification(spec({ requiredComponents: R2_COMPOSITION_COMPONENTS.slice(0, -1) })).ok, "missing component invalidates specification");
assert(!validateR2CompositionSecuritySpecification(spec({ minimumIndependentEvidenceClass: "E1" as never })).ok, "independence floor cannot be weakened");
assert(!validateR2CompositionSecuritySpecification(spec({ hashChainClaim: "SIGNED" as never })).ok, "tamper evidence cannot be relabelled signed");

const complete = assessR2CompositionReview(reviewPackage());
assert(complete.decision === "SATISFIES_REVIEW_CONTRACT", "complete synthetic vector satisfies the review contract");
assert(complete.certifiesOperationalR2 === false, "satisfying the review contract never certifies operational R2");
assert(complete.missingComponents.length === 0 && complete.missingDomains.length === 0, "complete vector reports no composition coverage gaps");

for (const [index, domain] of R2_COMPOSITION_SECURITY_DOMAINS.entries()) {
  const failedObservation = observation(index, { result: "FAIL", observationId: `R2-COMPOSE-FAIL-${index}` });
  const pkg = reviewPackage({ observations: [failedObservation, ...reviewPackage().observations.filter((item) => item.domain !== domain)] });
  const result = assessR2CompositionReview(pkg);
  assert(result.decision === "REJECT", `${domain} failure rejects composed R2`);
}

const componentMissing = assessR2CompositionReview(reviewPackage({ componentBindings: reviewPackage().componentBindings.slice(0, -1) }));
assert(componentMissing.decision === "INSUFFICIENT_EVIDENCE", "missing component binding is insufficient");
assert(componentMissing.missingComponents.includes("ASSURANCE_KERNEL"), "missing assurance-kernel binding is explicit");

const e1 = assessR2CompositionReview(reviewPackage({ observations: reviewPackage().observations.map((item) => ({ ...item, evidenceClass: "E1" as const, independenceBasis: null })) }));
assert(e1.decision === "INSUFFICIENT_EVIDENCE" && e1.missingDomains.length === 12, "correlated E1 evidence satisfies no composition domain");
const sharedHelpers = assessR2CompositionReview(reviewPackage({ observations: reviewPackage().observations.map((item) => ({ ...item, sharesImplementationHelpers: true })) }));
assert(sharedHelpers.decision === "INSUFFICIENT_EVIDENCE", "shared implementation helpers defeat independent composition evidence");
const oneComponent = assessR2CompositionReview(reviewPackage({ observations: reviewPackage().observations.map((item) => ({ ...item, componentIds: [item.componentIds[0]] })) }));
assert(oneComponent.decision === "INSUFFICIENT_EVIDENCE", "single-component tests cannot establish composition security");
const stale = assessR2CompositionReview(reviewPackage({ observations: reviewPackage().observations.map((item) => ({ ...item, freshness: "STALE" as const })) }));
assert(stale.decision === "INSUFFICIENT_EVIDENCE", "stale composition evidence fails closed");
const wrongCandidate = assessR2CompositionReview(reviewPackage({ observations: reviewPackage().observations.map((item) => ({ ...item, candidateCommit: "6".repeat(40) })) }));
assert(wrongCandidate.decision === "INSUFFICIENT_EVIDENCE", "cross-candidate composition evidence cannot be replayed");
const duplicateBinding = assessR2CompositionReview(reviewPackage({ componentBindings: [...reviewPackage().componentBindings, reviewPackage().componentBindings[0]] }));
assert(duplicateBinding.decision === "INSUFFICIENT_EVIDENCE", "duplicate component binding is rejected as insufficient");
const duplicateObservation = assessR2CompositionReview(reviewPackage({ observations: [...reviewPackage().observations, reviewPackage().observations[0]] }));
assert(duplicateObservation.decision === "INSUFFICIENT_EVIDENCE", "duplicate observation identity fails closed");

assert(assessR2CompositionReview(reviewPackage({ authorityDelta: { ...reviewPackage().authorityDelta, addedAllowed: ["PROVISION_SANDBOX", "SHELL"] } })).decision === "REJECT", "composition cannot add unpermitted shell authority");
assert(assessR2CompositionReview(reviewPackage({ authorityDelta: { ...reviewPackage().authorityDelta, removedForbidden: ["NETWORK"] } })).decision === "REJECT", "composition cannot remove a forbidden authority");
assert(assessR2CompositionReview(reviewPackage({ authorityDelta: { ...reviewPackage().authorityDelta, currentForbidden: reviewPackage().authorityDelta.currentForbidden.filter((item) => item !== "WRITE_REPOSITORY") } })).decision === "REJECT", "composition must preserve repository-write prohibition");
assert(assessR2CompositionReview(reviewPackage({ authorityDelta: { ...reviewPackage().authorityDelta, removedAllowed: ["READ_REPOSITORY"] } })).decision === "REJECT", "composition cannot silently remove baseline read authority");
assert(assessR2CompositionReview(reviewPackage({ blockingUnknowns: ["cross-component TOCTOU not exercised"] })).decision === "INSUFFICIENT_EVIDENCE", "blocking composition unknown remains first-class");

console.log(`Omega R2 composition security specification tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  console.error("FAILURES:");
  for (const item of failures) console.error(`  - ${item}`);
  process.exit(1);
}
