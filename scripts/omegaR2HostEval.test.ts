import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { R2_HOST_ATTACK_FAMILIES } from "./evaluation/r2-host/contracts";
import { evaluateHostMutationBoundary, summarizeHostEvaluationCoverage } from "./evaluation/r2-host/evaluator";
import { COMPLETE_SYNTHETIC_ATTACK_FAMILY, EXPECTED_HOST_CANDIDATE, safeSyntheticObservation } from "./evaluation/r2-host/fixtures";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function assert(value: unknown, label: string): void {
  if (value) passed += 1;
  else { failed += 1; failures.push(label); console.error(`  x ${label}`); }
}
function decision(overrides = {}) {
  return evaluateHostMutationBoundary(safeSyntheticObservation(overrides), EXPECTED_HOST_CANDIDATE);
}

const evaluatorSource = readFileSync(fileURLToPath(new URL("./evaluation/r2-host/evaluator.ts", import.meta.url)), "utf8");
assert(!evaluatorSource.includes("src/lib/codelab/executor"), "host evaluator imports no executor implementation helper");
assert(!evaluatorSource.includes("r2ProvisioningBlueprint"), "host evaluator is structurally separate from the blueprint oracle");
assert(decision().decision === "INSUFFICIENT_EVIDENCE", "clean synthetic vector cannot certify real host behavior");
assert(decision().reasons.includes("synthetic_vector_not_host_evidence"), "synthetic insufficiency is explicit");
assert(decision().operationalAuthorityGranted === false, "host evaluator never grants operational authority");
const claimedReal = safeSyntheticObservation({ evidenceKind: "REAL_HOST_OBSERVATION", adapterOwner: "INDEPENDENT_HOST_DRIVER" });
assert(evaluateHostMutationBoundary(claimedReal, EXPECTED_HOST_CANDIDATE).reasons.includes("real_host_claim_not_externally_admitted"), "self-labelled real-host transcript cannot certify itself");
assert(evaluateHostMutationBoundary(claimedReal, { ...EXPECTED_HOST_CANDIDATE, admittedRealHostObservationIds: [claimedReal.observationId] }).decision === "ACCEPT", "externally admitted independently owned real-host transcript is acceptable in contract");
assert(decision({ evidenceKind: "REAL_HOST_OBSERVATION", adapterOwner: "R2_IMPLEMENTATION" }).decision === "INSUFFICIENT_EVIDENCE", "implementation-owned host observation cannot independently certify");
assert(decision({ candidate: { ...safeSyntheticObservation().candidate, commit: "fedcba9876543210fedcba9876543210fedcba98" } }).reasons.includes("wrong_candidate_binding"), "wrong candidate evidence is insufficient");
assert(decision({ observedAtEpochMs: 1 }).reasons.includes("stale_or_invalid_observation_time"), "stale host evidence is insufficient");
assert(decision({ eventReferences: [] }).reasons.includes("event_provenance_missing"), "missing host provenance is insufficient");
assert(decision({ semanticEventCount: 1 }).decision === "REJECT", "valid hash over semantically incomplete events rejects");
assert(decision({ hashChainValid: false }).decision === "REJECT", "invalid event hash chain rejects");
assert(decision({ forbiddenActionsObserved: ["WRITE_REPOSITORY"] }).reasons.includes("forbidden_authority_observed"), "repository-write observation rejects");
assert(decision({ resolvedInsideApprovedRoot: false }).reasons.includes("boundary_escape_not_rejected"), "unrejected resolved escape rejects");
assert(decision({ authorizationDecision: "REJECTED", resolvedInsideApprovedRoot: false, mutationAttempted: false, actualChange: "NONE", cleanupOutcome: "NOT_APPLICABLE", terminalObjectExists: null }).decision === "INSUFFICIENT_EVIDENCE", "synthetic rejected escape remains non-certifying but has no false rejection");
assert(decision({ authorizationDecision: "REJECTED", mutationAttempted: true }).reasons.includes("mutation_after_rejection"), "mutation after rejection rejects");
assert(decision({ authorizationDecision: "REJECTED", mutationAttempted: false, actualChange: "NONE", authorityRevoked: false }).reasons.includes("rejected_authority_not_revoked"), "rejected capability must be revoked");
assert(decision({ parentIdentityAtUse: { ...safeSyntheticObservation().authorizedParentIdentity, objectId: "swapped-parent" } }).reasons.includes("parent_identity_changed"), "parent replacement is detected");
assert(decision({ objectIdentityAtUse: { ...safeSyntheticObservation().createdObjectIdentity!, objectId: "swapped-object" } }).reasons.includes("target_identity_changed"), "target replacement is detected");
assert(decision({ createdObjectIdentity: safeSyntheticObservation().repositoryIdentity, objectIdentityAtUse: safeSyntheticObservation().repositoryIdentity }).reasons.includes("repository_object_mutated"), "repository identity cannot become sandbox identity");
assert(decision({ createdObjectIdentity: null }).reasons.includes("mutated_object_identity_unobserved"), "unobserved created identity is insufficient");
assert(decision({ actualChange: "UNKNOWN" }).reasons.includes("unexpected_or_unknown_actual_change"), "unknown actual mutation rejects");
assert(decision({ cleanupOutcome: "UNKNOWN", terminalObjectExists: null }).reasons.includes("cleanup_not_verified_or_reusable"), "unknown cleanup rejects");
assert(decision({ terminalObjectExists: true }).reasons.includes("cleanup_not_verified_or_reusable"), "remaining terminal object rejects");
assert(decision({ reusable: true }).reasons.includes("cleanup_not_verified_or_reusable"), "sandbox reuse after cleanup rejects");

const coverage = summarizeHostEvaluationCoverage(COMPLETE_SYNTHETIC_ATTACK_FAMILY);
assert(coverage.syntheticFamilies.length === R2_HOST_ATTACK_FAMILIES.length, "every required attack family has a synthetic detector vector");
assert(coverage.missingSyntheticFamilies.length === 0, "synthetic attack-family coverage has no gap");
assert(coverage.realHostFamilies.length === 0, "no synthetic fixture is inflated into real host evidence");
assert(coverage.operationalAuthority === "UNAVAILABLE", "host evaluator preparation preserves unavailable authority");
for (const family of R2_HOST_ATTACK_FAMILIES) assert(coverage.syntheticFamilies.includes(family), `${family} detector vector is registered`);

console.log(`Omega R2 host evaluator tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  console.error("FAILURES:");
  for (const item of failures) console.error(`  - ${item}`);
  process.exit(1);
}
