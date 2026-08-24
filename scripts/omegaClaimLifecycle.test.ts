import type { EvidenceDependencyBinding } from "./evaluation/evidence-invalidation/engine";
import { initializeRepositoryClaimLifecycle, transitionRepositoryClaim, type ClaimLifecycleEvent, type RepositoryClaimLifecycle } from "./evaluation/claim-lifecycle/lifecycle";
import type { MaterialRepositoryClaim } from "./evaluation/ro-vertical-slice/contracts";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function assert(value: unknown, label: string): void { if (value) passed += 1; else { failed += 1; failures.push(label); console.error(`  x ${label}`); } }

const dependencies: readonly EvidenceDependencyBinding[] = [
  { dependencyId: "PACKAGE_JSON", fingerprint: "package-v1", kind: "SOURCE" },
  { dependencyId: "RO_EVALUATOR", fingerprint: "ro-vs-evaluator/1", kind: "EVALUATOR" },
];
const material: MaterialRepositoryClaim = {
  claimId: "CLAIM-PACKAGE-PRIVATE", statement: "package.json private equals true", value: true, epistemicState: "SUPPORTED", observationId: "OBS-1",
  sourceRequestId: "REQ-1", sourceResource: "package.json", sourceContentSha256: "a".repeat(64), repositoryFingerprint: "repo-v1", evaluatorVersion: "ro-vs-evaluator/1",
  candidate: { commit: "b".repeat(40), capabilityVersion: "ro-vs/1", schemaVersion: 1, environmentIdentity: "windows-node24" },
  authorityScope: { repositoryRoot: "C:/repo", resourceScopes: ["package.json"], operation: "READ_REPOSITORY" },
  evidenceAdmissionRef: "evidence://custodian/package-private", evidenceArtifactId: "ART-PACKAGE-PRIVATE", registryRecordId: "Ω-CAP-READ-REPOSITORY",
};
function initial(): RepositoryClaimLifecycle {
  return initializeRepositoryClaimLifecycle({ materialClaim: material, subject: "repository:package.json", predicate: "json.private", createdAtOrder: 1, freshnessDependencies: dependencies });
}
function event(type: ClaimLifecycleEvent["type"], order: number, overrides: Partial<ClaimLifecycleEvent> = {}): ClaimLifecycleEvent {
  return { eventId: `EVENT-${order}`, type, order, evidenceAdmissionRefs: [`evidence://event/${order}`], reason: `${type} fixture`, ...overrides };
}

const claim = initial();
assert(claim.state === "SUPPORTED", "custody-admitted supported R1 claim initializes as supported");
assert(claim.subject === "repository:package.json" && claim.predicate === "json.private" && claim.value === true, "claim preserves subject, predicate, and value");
assert(claim.sourceEvidenceRefs[0] === material.evidenceAdmissionRef && claim.candidateRepositoryState.commit === material.candidate.commit, "claim preserves source evidence and candidate repository state");
assert(claim.createdAtOrder === 1 && claim.freshnessDependencies.length === 2, "claim preserves order and explicit freshness dependencies");

const stale = transitionRepositoryClaim(claim, event("INVALIDATE", 2));
assert(stale.decision === "APPLIED" && stale.claim.state === "STALE", "supported claim becomes stale when an applicable dependency changes");
const wrongRevalidation = transitionRepositoryClaim(stale.claim, event("REVALIDATE", 3, { dependencyBindings: dependencies.map((item) => item.dependencyId === "PACKAGE_JSON" ? { ...item, fingerprint: "wrong" } : item) }));
assert(wrongRevalidation.decision === "REJECTED" && wrongRevalidation.claim.state === "STALE", "mismatched revalidation cannot restore support");
const revalidated = transitionRepositoryClaim(stale.claim, event("REVALIDATE", 3, { dependencyBindings: dependencies }));
assert(revalidated.decision === "APPLIED" && revalidated.claim.state === "SUPPORTED", "fresh exact-bound evidence restores stale claim support");

const conflicted = transitionRepositoryClaim(claim, event("CONTRADICT", 2, { contradictionId: "CONTRA-1" }));
assert(conflicted.decision === "APPLIED" && conflicted.claim.state === "CONFLICTED", "admitted contradiction makes a supported claim conflicted");
assert(conflicted.claim.contradictionIds.includes("CONTRA-1") && conflicted.claim.contradictingEvidenceRefs.length === 1, "conflict preserves contradiction identity and evidence");
const resolved = transitionRepositoryClaim(conflicted.claim, event("RESOLVE_CONFLICT", 3));
assert(resolved.decision === "APPLIED" && resolved.claim.state === "SUPPORTED" && resolved.claim.contradictionIds.length === 0, "evidence-backed resolution can restore support");
const refuted = transitionRepositoryClaim(conflicted.claim, event("REFUTE", 3));
assert(refuted.decision === "APPLIED" && refuted.claim.state === "REFUTED", "conflicted claim can become refuted with falsifying evidence");
assert(transitionRepositoryClaim(refuted.claim, event("SUPPORT", 4)).decision === "REJECTED", "refuted claim is terminal rather than silently resurrected");

const superseded = transitionRepositoryClaim(claim, event("SUPERSEDE", 2, { supersedingClaimId: "CLAIM-PACKAGE-PRIVATE-V2" }));
assert(superseded.decision === "APPLIED" && superseded.claim.state === "SUPERSEDED", "supported claim may be explicitly superseded");
assert(superseded.claim.supersedingClaimId === "CLAIM-PACKAGE-PRIVATE-V2", "superseding claim identity is retained");
assert(transitionRepositoryClaim(superseded.claim, event("INVALIDATE", 3)).decision === "REJECTED", "superseded claim is terminal historical knowledge");

assert(transitionRepositoryClaim(claim, event("INVALIDATE", 1)).issues.includes("non_monotonic_event_order"), "event order cannot move backward");
assert(transitionRepositoryClaim(claim, event("INVALIDATE", 2, { evidenceAdmissionRefs: [] })).issues.includes("evidence_required"), "claim transition requires attributable evidence");
assert(transitionRepositoryClaim(claim, event("SUPERSEDE", 2, { supersedingClaimId: claim.claimId })).issues.includes("valid_superseding_claim_required"), "claim cannot supersede itself");
assert(claim.history.length === 1 && claim.state === "SUPPORTED", "lifecycle transitions never mutate the input claim");

console.log(`Omega claim lifecycle tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) { console.error("FAILURES:"); for (const failure of failures) console.error(`  - ${failure}`); process.exit(1); }
