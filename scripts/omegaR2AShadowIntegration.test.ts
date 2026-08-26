import { R2_SHADOW_ADVERSARIAL_CASES, evaluateR2AShadowIntegration, type R2ShadowFault } from "./evaluation/r2-shadow-integration/evaluator";

let passed = 0; let failed = 0; const failures: string[] = [];
function assert(value: unknown, label: string): void { if (value) passed += 1; else { failed += 1; failures.push(label); console.error(`  x ${label}`); } }

const baseline = evaluateR2AShadowIntegration();
assert(baseline.shadowDecision === "SHADOW_COMPOSITION_VALIDATED", "internally consistent synthetic lifecycle validates component composition");
assert(baseline.operationalCapabilityDecision === "INSUFFICIENT_EVIDENCE", "shadow validation never becomes operational acceptance");
assert(baseline.packageCompleteness === "COMPLETE_FOR_EVALUATION", "baseline package is structurally complete for evaluation");
assert(baseline.assuranceDecision === "ACCEPT", "existing assurance evaluator accepts its exact-bound synthetic evidence while certifying no operational R2");
assert(Object.values(baseline.components).every((decision) => decision === "PASS"), "all baseline shadow components agree within their scoped contracts");
assert(baseline.syntheticOnly && !baseline.filesystemMutationPerformed && !baseline.authorityGranted, "baseline remains entirely non-operational");
assert(baseline.semanticContradictions.length === 0, "baseline exposes no semantic contradictions between scoped evaluators");
assert(R2_SHADOW_ADVERSARIAL_CASES.length === 14, "all fourteen required adversarial cases are enumerated");

const expectedDetector: Readonly<Record<R2ShadowFault, string>> = {
  CANDIDATE_IDENTITY_MISMATCH: "CANDIDATE_PACKAGE",
  MISSING_CLEANUP: "CANDIDATE_PACKAGE",
  VALID_HASH_MISSING_SEMANTIC_EVENT: "AUDIT_RECONSTRUCTION",
  UNDECLARED_AUTHORITY_IMPLICATION: "AUTHORITY_GRAPH",
  ADDITIONAL_FORBIDDEN_CAPABILITY: "NEGATIVE_CAPABILITY",
  STALE_BASELINE: "BASELINE_DIFF",
  DELETED_SECURITY_EVIDENCE: "BASELINE_DIFF",
  REUSED_BUT_STALE_EVIDENCE: "VERIFICATION_COST",
  PLAN_MAPPING_MISSING_FOR_AUTHORITY_CHANGE: "PLAN_COVERAGE",
  SUPPRESSED_KNOWN_FAILURE: "R2_ASSURANCE",
  REVOCATION_REPORTED_NOT_EVIDENCED: "CANDIDATE_PACKAGE",
  ENVIRONMENT_IDENTITY_MISMATCH: "CANDIDATE_PACKAGE",
  STRUCTURALLY_COMPLETE_INADEQUATE_CAPABILITY_EVIDENCE: "OPERATIONAL_E4_FLOOR",
  POSITIVE_TESTS_WITH_CRITICAL_FALSIFICATION: "R2_ASSURANCE",
};

for (const fault of R2_SHADOW_ADVERSARIAL_CASES) {
  const result = evaluateR2AShadowIntegration([fault]);
  assert(result.shadowDecision !== "SHADOW_COMPOSITION_VALIDATED", `${fault} fails closed`);
  assert(result.operationalCapabilityDecision === "INSUFFICIENT_EVIDENCE" && !result.authorityGranted, `${fault} cannot grant operational authority`);
  if (expectedDetector[fault] === "OPERATIONAL_E4_FLOOR") {
    assert(result.packageCompleteness === "COMPLETE_FOR_EVALUATION" && result.reasons.includes("operational_e4_evidence_absent"), "structural completeness remains unequal to acceptance");
  } else {
    assert(result.components[expectedDetector[fault]] !== "PASS", `${fault} is caught by ${expectedDetector[fault]}`);
  }
  assert(result.semanticContradictions.length === 0, `${fault} produces scoped detector divergence rather than hidden semantic contradiction`);
}

const falsification = evaluateR2AShadowIntegration(["POSITIVE_TESTS_WITH_CRITICAL_FALSIFICATION"]);
assert(falsification.assuranceDecision === "REJECT", "one admitted critical falsification outranks positive evidence");
const semanticOmission = evaluateR2AShadowIntegration(["VALID_HASH_MISSING_SEMANTIC_EVENT"]);
assert(semanticOmission.components.AUDIT_RECONSTRUCTION === "INSUFFICIENT_EVIDENCE", "valid rehashed chain cannot hide a missing semantic event");
const forbidden = evaluateR2AShadowIntegration(["ADDITIONAL_FORBIDDEN_CAPABILITY"]);
assert(forbidden.components.NEGATIVE_CAPABILITY === "REJECT" && forbidden.components.R2_ASSURANCE === "REJECT", "forbidden capability is independently rejected by two evaluators");
assert(forbidden.acceptedRejectedDivergences.length > 0, "component acceptance/rejection divergence is explicitly recorded");

console.log(`Omega R2-A shadow integration tests - passed: ${passed}, failed: ${failed}`);
if (failed) { for (const item of failures) console.error(`  - ${item}`); process.exit(1); }
