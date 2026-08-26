import { EVIDENCE_BOTTLENECKS, MAJOR_EVIDENCE_MECHANISMS, classifyEvidenceRelationship, validateEvidenceCorrelationMap } from "../src/lib/codelab/assurance/evidenceCorrelation";

let passed = 0; let failed = 0; const failures: string[] = [];
function assert(value: unknown, label: string): void { if (value) passed += 1; else { failed += 1; failures.push(label); console.error(`  x ${label}`); } }
const byId = new Map(MAJOR_EVIDENCE_MECHANISMS.map((item) => [item.mechanismId, item]));
const relation = (left: string, right: string) => classifyEvidenceRelationship(byId.get(left)!, byId.get(right)!);
assert(validateEvidenceCorrelationMap().length === 0, "major evidence map is structurally valid");
assert(MAJOR_EVIDENCE_MECHANISMS.length === 9, "nine major mechanisms are explicitly profiled");
const r2Cluster = relation("R2_CANDIDATE_PACKAGE_CONTRACT", "R2_ASSURANCE_EVALUATOR");
assert(r2Cluster.classification === "PARTIALLY_CORRELATED", "R2 local evaluators expose shared-authoring correlation");
assert(r2Cluster.sharedAssumptions.some((item) => item.startsWith("environment:")) && r2Cluster.sharedAssumptions.some((item) => item.startsWith("authoring:")), "correlation rationale names shared environment and authoring path");
const r1 = relation("R1_EXECUTOR_CONTRACT", "R1_PRIVATE_HELDOUT_EVALUATOR");
assert(r1.classification === "PARTIALLY_CORRELATED", "R1 private evaluation is lower-correlation but not independent");
const compiler = relation("R2_CANDIDATE_PACKAGE_CONTRACT", "TYPESCRIPT_COMPILER");
assert(compiler.classification === "INDEPENDENT_MECHANISM", "compiler is recognized as a deterministic distinct mechanism");
const replication = relation("R1_PRIVATE_HELDOUT_EVALUATOR", "R1_INDEPENDENT_REPLICATION");
assert(replication.classification === "UNKNOWN", "blocked replication cannot establish independence");
assert(replication.numericalIndependenceScore === null && r2Cluster.numericalIndependenceScore === null, "model never emits a fake numerical independence score");
assert(EVIDENCE_BOTTLENECKS.some((item) => item.claimFamily === "R2_PREACTUATION_SAFETY" && item.state === "IMPLEMENTATION_ADJACENT_E3_DOMINANT"), "R2 E3 bottleneck is explicit");
assert(EVIDENCE_BOTTLENECKS.some((item) => item.claimFamily === "SEC003_CONTAINMENT" && item.state === "BLOCKED_EXTERNAL"), "security evidence bottleneck remains external");
assert(MAJOR_EVIDENCE_MECHANISMS.filter((item) => item.currentState === "AVAILABLE").every((item) => item.sharedEvidenceSource.length > 0), "available evidence always names its source");
console.log(`Omega evidence correlation map tests - passed: ${passed}, failed: ${failed}`); if (failed) { for (const item of failures) console.error(`  - ${item}`); process.exit(1); }
