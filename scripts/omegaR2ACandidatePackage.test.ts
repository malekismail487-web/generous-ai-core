import {
  R2_A_NEGATIVE_CERTIFICATES, R2_A_REQUIRED_LIFECYCLE_EVENTS, assessR2ACandidatePackage,
  type CandidatePackageEvidence, type R2ACandidateEvidencePackage,
} from "../src/lib/codelab/assurance/r2CandidatePackage";

let passed = 0; let failed = 0; const failures: string[] = [];
function assert(value: unknown, label: string): void { if (value) passed += 1; else { failed += 1; failures.push(label); console.error(`  x ${label}`); } }
const COMMIT = "a".repeat(40); const NOW = 1_000_000;
function evidence(id: string, changes: Partial<CandidatePackageEvidence> = {}): CandidatePackageEvidence { return { evidenceId: id, evidenceClass: "E3", result: "SUPPORTS", admittedEvidenceRef: `evidence://${id}`, evaluatorVersion: "eval/1", environmentIdentity: "windows-fixture-1", observedAtEpochMs: NOW - 10, ...changes }; }
function complete(): R2ACandidateEvidencePackage {
  return { schemaVersion: 1, packageId: "PKG-R2-A-1", candidate: { commit: COMMIT, capabilityVersion: "r2-a/1" },
    traceableInstitutionalBaselineRef: "baseline://OMEGA-R1-TRACEABLE-INSTITUTIONAL-BASELINE/68717200b669a8e7644e01f717f158ea44899820",
    parentSandboxAuthority: "R2_A_AUTHORIZATION", requestedLeafIdentity: "sandbox-leaf-1", repositoryDisjointnessEvidence: evidence("DISJOINT"), createdObjectIdentityEvidence: evidence("OBJECT"),
    lifecycleTranscript: Object.fromEntries(R2_A_REQUIRED_LIFECYCLE_EVENTS.map((event) => [event, evidence(`EVENT-${event}`)])), cleanupTranscript: [evidence("CLEANUP")], cleanupResult: "VERIFIED_CLEAN", revocationResult: "VERIFIED_REVOKED",
    negativeCapabilityCertificates: Object.fromEntries(R2_A_NEGATIVE_CERTIFICATES.map((authority) => [authority, evidence(`NEG-${authority}`)])), r1PreservationEvidence: evidence("R1"), hostEvaluatorEvidence: evidence("HOST"),
    evidenceCustodyRefs: ["custody://1"], auditChainRefs: ["audit://1"], knownFailures: [], blockingUnknowns: [], environmentIdentity: "windows-fixture-1", toolVersions: { node: "24.19.0", evaluator: "r2-package/1" }, certifiesOperationalCapability: false };
}
const context = { commit: COMMIT, capabilityVersion: "r2-a/1", nowEpochMs: NOW, maxEvidenceAgeMs: 1000 };
const completeResult = assessR2ACandidatePackage(complete(), context);
assert(completeResult.completeness === "COMPLETE_FOR_EVALUATION", "complete evidence package can enter evaluation");
assert(completeResult.capabilityAcceptance === "NOT_EVALUATED" && !completeResult.grantsAuthority, "package completeness neither accepts capability nor grants authority");
const missingLifecycle = complete(); delete (missingLifecycle.lifecycleTranscript as Record<string, unknown>).CLEANUP;
assert(assessR2ACandidatePackage(missingLifecycle, context).missingItems.includes("lifecycle_event:CLEANUP"), "missing mandatory lifecycle event makes package incomplete");
const weak = complete(); (weak.negativeCapabilityCertificates as Record<string, CandidatePackageEvidence>).SHELL = evidence("NEG-SHELL", { evidenceClass: "E1" });
assert(assessR2ACandidatePackage(weak, context).missingItems.includes("evidence_below_e3:NEG-SHELL"), "weak evidence cannot structurally support R2-A completion");
const stale = complete(); stale.cleanupTranscript[0] = evidence("CLEANUP", { observedAtEpochMs: 0 });
assert(assessR2ACandidatePackage(stale, context).completeness === "STALE", "stale admitted evidence remains distinct from incomplete or rejected capability");
assert(assessR2ACandidatePackage(complete(), { ...context, commit: "b".repeat(40) }).completeness === "WRONG_CANDIDATE", "wrong candidate package is explicit");
const falsified = complete(); falsified.hostEvaluatorEvidence = evidence("HOST-FAIL", { result: "FALSIFIES" });
assert(assessR2ACandidatePackage(falsified, context).completeness === "CONTRADICTED", "falsifying evidence outranks structural completeness");
const failedCleanup = complete(); failedCleanup.cleanupResult = "FAILED";
assert(assessR2ACandidatePackage(failedCleanup, context).completeness === "CONTRADICTED", "failed cleanup contradicts candidate package");
const unknown = complete(); unknown.blockingUnknowns = [{ unknownId: "U1", statement: "host identity unresolved" }];
assert(assessR2ACandidatePackage(unknown, context).completeness === "INCOMPLETE", "blocking unknown prevents complete-for-evaluation status");
const openFailure = complete(); openFailure.knownFailures = [{ failureId: "F1", open: true, evidenceRef: "evidence://failure" }];
assert(assessR2ACandidatePackage(openFailure, context).completeness === "CONTRADICTED", "open known failure contradicts candidate package");
const wrongEnvironment = complete(); wrongEnvironment.hostEvaluatorEvidence = evidence("HOST", { environmentIdentity: "other-environment" });
assert(assessR2ACandidatePackage(wrongEnvironment, context).completeness === "INCOMPLETE", "evidence from another environment cannot complete package");
assert(!("VALID" in completeResult) && !("SAFE" in completeResult), "package API cannot conflate completeness with validity or safety");
console.log(`Omega R2-A candidate package tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) { for (const failure of failures) console.error(`  - ${failure}`); process.exit(1); }
