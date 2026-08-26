import { DIRECTIVE_015_PLAN_COVERAGE, DIRECTIVE_015_WORKSTREAM_IDS } from "../src/lib/codelab/registry/directive015Coverage";
import { INHERITED_OMEGA_CONSTRAINTS, validatePlanCoverage } from "../src/lib/codelab/registry/planCoverage";

let passed = 0; let failed = 0; const failures: string[] = [];
function assert(value: unknown, label: string): void { if (value) passed += 1; else { failed += 1; failures.push(label); console.error(`  x ${label}`); } }

assert(DIRECTIVE_015_PLAN_COVERAGE.length === 2, "release and deployment-bound closure retain separate traceability identities");
assert(validatePlanCoverage(DIRECTIVE_015_PLAN_COVERAGE, DIRECTIVE_015_WORKSTREAM_IDS).length === 0, "Directive 015 coverage satisfies executable traceability invariants");
assert(DIRECTIVE_015_PLAN_COVERAGE.every((item) => item.sourceDirective === "OMEGA_DIRECTIVE_015"), "all records retain Directive 015 provenance");
assert(DIRECTIVE_015_PLAN_COVERAGE.every((item) => item.coverageStatus === "PARTIAL_JUST_IN_TIME" && item.corpusStatus === "PARTIAL_NOT_LOSSLESSLY_CERTIFIED"), "coverage remains partial and does not claim corpus certification");
assert(DIRECTIVE_015_PLAN_COVERAGE.every((item) => item.inheritedConstraints.length === INHERITED_OMEGA_CONSTRAINTS.length), "all institutional constraints remain inherited");
assert(DIRECTIVE_015_PLAN_COVERAGE.every((item) => item.authority.available.join(",") === "READ_REPOSITORY" && item.authority.grantedByArtifact.length === 0), "security remediation grants no Ω authority");
assert(DIRECTIVE_015_PLAN_COVERAGE.every((item) => item.deferredRequirements.includes("final SEC-003 closure") || item.deferredRequirements.includes("real operator evidence")), "deployment and final closure remain explicitly deferred");
assert(DIRECTIVE_015_PLAN_COVERAGE.every((item) => !item.independentlyReplicated && item.verificationScope === "LOCAL_DETERMINISTIC_IMPLEMENTATION_ADJACENT"), "local release checks do not become deployment or replication evidence");

console.log(`Omega Directive 015 plan coverage tests - passed: ${passed}, failed: ${failed}`);
if (failed) { for (const failure of failures) console.error(`  - ${failure}`); process.exit(1); }
