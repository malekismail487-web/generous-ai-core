import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ASSURANCE_CLAIMS, OPERATIONAL_PHASES } from "./evaluation/r2-assurance/contracts";
import { evaluateR2AssuranceVector } from "./evaluation/r2-assurance/evaluator";
import { FIXTURE_CANDIDATE, acceptablePackage, contextFor, independentEvidence } from "./evaluation/r2-assurance/fixtures";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function assert(value: unknown, label: string): void {
  if (value) passed += 1;
  else { failed += 1; failures.push(label); console.error(`  x ${label}`); }
}
function evaluate(pkg = acceptablePackage(), context = contextFor(pkg)) { return evaluateR2AssuranceVector(pkg, context); }

const evaluatorSource = readFileSync(fileURLToPath(new URL("./evaluation/r2-assurance/evaluator.ts", import.meta.url)), "utf8");
assert(!evaluatorSource.includes("src/lib/codelab/assurance"), "assurance evaluator imports no implementation-owned assurance helper");
assert(!evaluatorSource.includes("src/lib/codelab/executor"), "assurance evaluator imports no executor helper");
assert(ASSURANCE_CLAIMS.length === 10, "ten independent assurance claims are explicit");
assert(OPERATIONAL_PHASES.length === 7, "R2-A through R2-G remain required");

const acceptable = acceptablePackage();
const accepted = evaluate(acceptable);
assert(accepted.decision === "ACCEPT", "clearly acceptable stable vector is accepted by evaluator semantics");
assert(accepted.acceptedEvidenceIds.length === 10, "acceptable vector preserves one admitted independent evidence ID per claim");
assert(accepted.certifiesCurrentOperationalR2 === false, "synthetic evaluator vector never certifies current operational R2");

const boundaryFailEvidence = independentEvidence(5, { result: "FAIL", evidenceId: "R2-BOUNDARY-FAIL", artifactDigest: "a".repeat(64) });
const boundaryFail = acceptablePackage({ evidence: [...acceptable.evidence.filter((item) => item.claim !== "SANDBOX_BOUNDARY_CONFINEMENT"), boundaryFailEvidence] });
assert(evaluate(boundaryFail).decision === "REJECT", "admitted sandbox-boundary failure rejects an otherwise green package");
assert(evaluate(boundaryFail).rejectedEvidenceIds.includes("R2-BOUNDARY-FAIL"), "rejection preserves falsifying evidence ID");

const insufficient = acceptablePackage({ evidence: [] });
assert(evaluate(insufficient).decision === "INSUFFICIENT_EVIDENCE", "empty evidence package is insufficient");
assert(evaluate(insufficient).missingClaims.length === 10, "empty package reports every missing claim");

const implementationGreen = acceptablePackage({ evidence: acceptable.evidence.map((item) => ({ ...item, evidenceClass: "E1" as const, evaluatorOwner: "IMPLEMENTATION" as const, oracleOwner: "R2-IMPLEMENTATION", sharesImplementationHelpers: true, independenceBasis: null })) });
assert(evaluate(implementationGreen).decision === "INSUFFICIENT_EVIDENCE", "all implementation-owned green tests remain insufficient");
assert(evaluate(implementationGreen).missingClaims.length === 10, "correlated green evidence satisfies no independent claim");

const noRollback = acceptablePackage({ evidence: acceptable.evidence.filter((item) => item.claim !== "ROLLBACK_EQUIVALENCE") });
assert(evaluate(noRollback).decision === "INSUFFICIENT_EVIDENCE", "missing rollback evidence cannot accept R2");
assert(evaluate(noRollback).missingClaims.includes("ROLLBACK_EQUIVALENCE"), "missing rollback claim is explicit");

const stale = acceptablePackage({ evidence: acceptable.evidence.map((item) => ({ ...item, observedAtEpochMs: 1 })) });
assert(evaluate(stale).decision === "INSUFFICIENT_EVIDENCE", "stale evidence remains insufficient");

const contradictionPass = independentEvidence(0, { evidenceId: "R2-CONTRADICTION-PASS", artifactDigest: "b".repeat(64) });
const contradictionFail = independentEvidence(0, { evidenceId: "R2-CONTRADICTION-FAIL", artifactDigest: "c".repeat(64), result: "FAIL" });
const contradictory = acceptablePackage({ evidence: [...acceptable.evidence.filter((item) => item.claim !== "INTENDED_AUTHORITY_ONLY"), contradictionPass, contradictionFail] });
const contradictoryResult = evaluate(contradictory);
assert(contradictoryResult.decision === "REJECT", "admitted contradictory evidence rejects rather than averaging");
assert(contradictoryResult.reasons.some((item) => item.startsWith("contradictory_admitted_evidence")), "contradiction reason identifies the claim");

const wrongCandidate = acceptablePackage({ candidate: { ...FIXTURE_CANDIDATE, commit: "2222222222222222222222222222222222222222" } });
assert(evaluate(wrongCandidate).decision === "INSUFFICIENT_EVIDENCE", "valid evidence cannot certify the wrong candidate version");
assert(evaluate(wrongCandidate).reasons.includes("wrong_candidate_version"), "wrong candidate reason is machine-readable");

const forbiddenWrite = acceptablePackage({ capabilityDelta: { ...acceptable.capabilityDelta, addedAllowed: [...acceptable.capabilityDelta.addedAllowed, "WRITE_REPOSITORY"], currentForbidden: acceptable.capabilityDelta.currentForbidden.filter((item) => item !== "WRITE_REPOSITORY") } });
assert(evaluate(forbiddenWrite).decision === "REJECT", "working sandbox plus repository-write authority rejects");
assert(evaluate(forbiddenWrite).reasons.includes("unexpected_authority_added"), "unexpected authority addition is explicit");
assert(evaluate(acceptablePackage({ capabilityDelta: { ...acceptable.capabilityDelta, removedForbidden: ["SHELL"] } })).decision === "REJECT", "removing a forbidden action rejects");

const cleanupFailure = independentEvidence(7, { result: "FAIL", evidenceId: "R2-CLEANUP-OBJECT-REMAINS", artifactDigest: "d".repeat(64) });
const cleanupPackage = acceptablePackage({ evidence: [...acceptable.evidence.filter((item) => item.claim !== "CLEANUP_TERMINAL_STATE"), cleanupFailure] });
assert(evaluate(cleanupPackage).decision === "REJECT", "reported cleanup with terminal object remaining rejects");

const r1Regression = independentEvidence(1, { result: "FAIL", evidenceId: "R2-R1-REGRESSION", artifactDigest: "e".repeat(64) });
const r1Package = acceptablePackage({ evidence: [...acceptable.evidence.filter((item) => item.claim !== "R1_PRESERVATION"), r1Regression] });
assert(evaluate(r1Package).decision === "REJECT", "R1 regression rejects R2 functionality");

const incompleteAudit = independentEvidence(6, { result: "FAIL", evidenceId: "R2-SEMANTIC-AUDIT-GAP", artifactDigest: "f".repeat(64) });
const auditPackage = acceptablePackage({ evidence: [...acceptable.evidence.filter((item) => item.claim !== "AUDIT_RECONSTRUCTION"), incompleteAudit] });
assert(evaluate(auditPackage).decision === "REJECT", "valid hash chain with semantically incomplete audit rejects");

assert(evaluate(acceptablePackage({ operationalPhases: OPERATIONAL_PHASES.slice(0, -1) })).decision === "INSUFFICIENT_EVIDENCE", "missing R2-G is insufficient");
assert(evaluate(acceptablePackage({ remainingUnknowns: [{ unknownId: "R2-UNKNOWN-001", blocking: true, statement: "Host identity unresolved" }] })).decision === "INSUFFICIENT_EVIDENCE", "blocking unknown remains first-class");

const openFailureEvidence = independentEvidence(0, { evidenceId: "R2-OPEN-CRITICAL", artifactDigest: "9".repeat(64) });
const openFailurePackage = acceptablePackage({
  evidence: [...acceptable.evidence.filter((item) => item.claim !== "INTENDED_AUTHORITY_ONLY"), openFailureEvidence],
  knownFailures: [{ failureId: "R2-KNOWN-001", status: "OPEN", severity: "CRITICAL", candidate: FIXTURE_CANDIDATE, evidenceId: openFailureEvidence.evidenceId }],
});
assert(evaluate(openFailurePackage).decision === "REJECT", "admitted open critical failure rejects");

const tampered = acceptablePackage();
const tamperedEvidence = tampered.evidence.map((item, index) => index === 0 ? { ...item, artifactDigest: "8".repeat(64) } : item);
assert(evaluate(acceptablePackage({ evidence: tamperedEvidence }), contextFor(tampered)).decision === "INSUFFICIENT_EVIDENCE", "artifact digest mismatch fails external admission");
assert(evaluate(acceptablePackage({ schemaVersion: 2 as never })).decision === "INSUFFICIENT_EVIDENCE", "unsupported package schema fails closed");

for (const output of [accepted, evaluate(boundaryFail), evaluate(insufficient)]) {
  assert(["ACCEPT", "REJECT", "INSUFFICIENT_EVIDENCE"].includes(output.decision), `${output.decision} belongs to the closed decision surface`);
}

console.log(`Omega R2 assurance evaluator tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  console.error("FAILURES:");
  for (const item of failures) console.error(`  - ${item}`);
  process.exit(1);
}
