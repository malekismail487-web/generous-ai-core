import { DIRECTIVE_016_PLAN_COVERAGE, DIRECTIVE_016_WORKSTREAM_IDS } from "../src/lib/codelab/registry/directive016Coverage";
import { validatePlanCoverage } from "../src/lib/codelab/registry/planCoverage";

let passed = 0; let failed = 0; const failures: string[] = [];
function assert(value: unknown, label: string): void { if (value) passed += 1; else { failed += 1; failures.push(label); console.error(`  x ${label}`); } }

const record = DIRECTIVE_016_PLAN_COVERAGE[0];
assert(DIRECTIVE_016_PLAN_COVERAGE.length === 1, "Directive 016 remains one narrow identity-reconciliation workstream");
assert(validatePlanCoverage(DIRECTIVE_016_PLAN_COVERAGE, DIRECTIVE_016_WORKSTREAM_IDS).length === 0, "Directive 016 traceability satisfies executable invariants");
assert(record.sourceDirective === "OMEGA_DIRECTIVE_016" && record.coverageStatus === "PARTIAL_JUST_IN_TIME", "Directive provenance is explicit without claiming total corpus coverage");
assert(record.implementedRequirements.includes("exact operator-designated deployment commit") && record.implementedRequirements.includes("descendant-with-changed-runtime rejection"), "coverage records both exact designation and anti-descendant weakening");
assert(record.deferredRequirements.includes("authorized Lovable deployment") && record.deferredRequirements.includes("final SEC-003 closure"), "deployment and security closure remain deferred");
assert(record.authority.available.join(",") === "READ_REPOSITORY" && record.authority.grantedByArtifact.length === 0, "identity reconciliation grants no authority");
assert(!record.independentlyReplicated && record.verificationScope === "LOCAL_DETERMINISTIC_IMPLEMENTATION_ADJACENT", "local identity checks do not become deployment evidence");

console.log(`Omega Directive 016 plan coverage tests - passed: ${passed}, failed: ${failed}`);
if (failed) { for (const failure of failures) console.error(`  - ${failure}`); process.exit(1); }
