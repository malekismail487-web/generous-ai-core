import { CONTROLLED_MUTATION_CHAIN, R2_NYX_LINEAGE_COVERAGE, R2_TO_NYX_CAPABILITY_LINEAGE, validateR2NyxLineage } from "../src/lib/codelab/registry/r2NyxLineage";

let passed = 0; let failed = 0; const failures: string[] = [];
function assert(value: unknown, label: string): void { if (value) passed += 1; else { failed += 1; failures.push(label); console.error(`  x ${label}`); } }
assert(validateR2NyxLineage().length === 0, "R2-to-Nyx lineage satisfies all institutional invariants");
assert(R2_TO_NYX_CAPABILITY_LINEAGE.length === 8 && R2_TO_NYX_CAPABILITY_LINEAGE.map((item) => item.chunkId).join(",") === CONTROLLED_MUTATION_CHAIN.join(","), "R2-A through assurance are complete and ordered");
assert(R2_TO_NYX_CAPABILITY_LINEAGE[0].authorityDelta.added.join(",") === "PROVISION_SANDBOX,TERMINATE_SANDBOX", "R2-A has the exact minimal authority delta");
assert(R2_TO_NYX_CAPABILITY_LINEAGE[1].authorityDelta.added.join(",") === "WRITE_SANDBOX_CONTENT", "R2-B separately introduces bounded content authority");
assert(R2_TO_NYX_CAPABILITY_LINEAGE.slice(2).every((item) => item.authorityDelta.added.length === 0), "later capability steps do not silently expand authority");
assert(R2_TO_NYX_CAPABILITY_LINEAGE.every((item) => item.directPlanAncestry.length > 0 && item.supportingPlans.length > 0), "every future chunk has direct and supporting plan ancestry");
assert(R2_TO_NYX_CAPABILITY_LINEAGE.every((item) => item.securityDependencies.length > 0 && item.evidenceRequirements.length > 0), "every future chunk has security and evidence dependencies");
assert(R2_TO_NYX_CAPABILITY_LINEAGE.every((item) => item.deferredArchitecture.length > 0 && item.supersededMechanisms.length > 0), "deferred and superseded architecture remains visible");
assert(R2_TO_NYX_CAPABILITY_LINEAGE.every((item) => !item.grantsAuthority), "lineage grants no authority");
assert(R2_NYX_LINEAGE_COVERAGE.coverageStatus === "PARTIAL_JUST_IN_TIME" && R2_NYX_LINEAGE_COVERAGE.corpusStatus === "PARTIAL_NOT_LOSSLESSLY_CERTIFIED", "lineage coverage remains honestly partial");
assert(R2_NYX_LINEAGE_COVERAGE.conceptualPath.join("→") === "CONTROLLED_MUTATION→VERIFIED_CODING_ACTION→LONG_HORIZON_ENGINEERING→TOOL_CONSTRUCTION→RESEARCH_ENGINEERING→ΝΥΞ", "controlled mutation is explicitly connected to Nyx");
const reordered = [R2_TO_NYX_CAPABILITY_LINEAGE[1], R2_TO_NYX_CAPABILITY_LINEAGE[0], ...R2_TO_NYX_CAPABILITY_LINEAGE.slice(2)];
assert(validateR2NyxLineage(reordered).some((issue) => issue.startsWith("lineage_order_invalid")), "out-of-order capability lineage is rejected");
console.log(`Omega R2-to-Nyx lineage tests - passed: ${passed}, failed: ${failed}`); if (failed) { for (const item of failures) console.error(`  - ${item}`); process.exit(1); }
