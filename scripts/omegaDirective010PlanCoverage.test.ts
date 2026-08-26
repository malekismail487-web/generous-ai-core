import { DIRECTIVE_010_PLAN_COVERAGE, DIRECTIVE_010_WORKSTREAM_IDS } from "../src/lib/codelab/registry/directive010Coverage";
import { INHERITED_OMEGA_CONSTRAINTS, validatePlanCoverage } from "../src/lib/codelab/registry/planCoverage";

let passed = 0; let failed = 0; const failures: string[] = [];
function assert(value: unknown, label: string): void { if (value) passed += 1; else { failed += 1; failures.push(label); console.error(`  x ${label}`); } }
assert(DIRECTIVE_010_PLAN_COVERAGE.length === 5, "all five Directive 010 workstreams have distinct coverage records");
assert(validatePlanCoverage(DIRECTIVE_010_PLAN_COVERAGE, DIRECTIVE_010_WORKSTREAM_IDS).length === 0, "Directive 010 coverage satisfies executable traceability invariants");
assert(DIRECTIVE_010_PLAN_COVERAGE.every((record) => record.sourceDirective === "OMEGA_DIRECTIVE_010"), "every record retains Directive 010 provenance");
assert(DIRECTIVE_010_PLAN_COVERAGE.every((record) => record.coverageStatus === "PARTIAL_JUST_IN_TIME" && record.corpusStatus === "PARTIAL_NOT_LOSSLESSLY_CERTIFIED"), "no record overclaims corpus completeness");
assert(DIRECTIVE_010_PLAN_COVERAGE.every((record) => record.inheritedConstraints.length === INHERITED_OMEGA_CONSTRAINTS.length), "all inherited institutional constraints remain attached");
assert(DIRECTIVE_010_PLAN_COVERAGE.every((record) => record.authority.grantedByArtifact.length === 0 && record.authority.available.join(",") === "READ_REPOSITORY"), "coverage changes no authority");
assert(DIRECTIVE_010_PLAN_COVERAGE.every((record) => record.directlyImplemented.length > 0 && record.supporting.length > 0 && record.deferred.length > 0), "direct, supporting, and deferred concepts are explicit");
assert(DIRECTIVE_010_PLAN_COVERAGE.every((record) => record.conflicts.length === 1 && record.conflicts[0].disposition === "RESOLVED"), "each workstream records its central architectural conflict");
console.log(`Omega Directive 010 plan coverage tests - passed: ${passed}, failed: ${failed}`); if (failed) { for (const item of failures) console.error(`  - ${item}`); process.exit(1); }
