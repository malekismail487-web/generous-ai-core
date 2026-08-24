import {
  DIRECTIVE_008_PLAN_COVERAGE,
  INHERITED_OMEGA_CONSTRAINTS,
  OMEGA_CORPUS_STATUS,
  OMEGA_COVERAGE_STATUS,
  coverageForWorkstream,
  traceabilityChain,
  validatePlanCoverage,
  workstreamsCoveringConcept,
  type PlanCoverageRecord,
} from "../src/lib/codelab/registry/planCoverage";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function assert(value: unknown, label: string): void { if (value) passed += 1; else { failed += 1; failures.push(label); console.error(`  x ${label}`); } }
function mutate(record: PlanCoverageRecord, changes: Partial<PlanCoverageRecord>): PlanCoverageRecord { return { ...record, ...changes }; }

const records = DIRECTIVE_008_PLAN_COVERAGE;
assert(records.length === 6, "all six Directive 008 workstreams have separate coverage identities");
assert(validatePlanCoverage(records).length === 0, "institutional plan coverage validates without exceptions");
assert(records.every((item) => item.coverageStatus === OMEGA_COVERAGE_STATUS && item.corpusStatus === OMEGA_CORPUS_STATUS), "coverage remains partial and just-in-time rather than claiming complete corpus ingestion");
assert(records.every((item) => item.inheritedConstraints.length === 19 && item.inheritedConstraints.every((constraint) => INHERITED_OMEGA_CONSTRAINTS.includes(constraint))), "every workstream inherits the complete Directive 008 constraint set");
assert(records.every((item) => item.directlyImplemented.length > 0 && item.supporting.length > 0 && item.deferred.length > 0), "direct, supporting, and deferred Omega concepts are explicit");
assert(records.every((item) => item.implementedRequirements.length > 0 && item.deferredRequirements.length > 0), "implemented and deferred requirements are explicit");
assert(records.every((item) => item.conflicts.length > 0 && item.conflicts.every((entry) => entry.preservedSourceRefs.length > 0 && entry.evidenceRefs.length > 0)), "architectural conflicts preserve source, operational decision, and evidence");
assert(records.every((item) => item.supersededOperationalApproaches.length > 0), "superseded operational approaches remain visible");
assert(records.every((item) => item.maturity === "VERIFIED" && !item.independentlyReplicated), "local deterministic verification does not become independent replication");
assert(records.every((item) => item.authority.available.join() === "READ_REPOSITORY" && item.authority.grantedByArtifact.length === 0), "plan coverage grants no authority and preserves the R1 ceiling");
assert(records.every((item) => item.authority.unavailable.includes("PROVISION_SANDBOX") && item.authority.unavailable.includes("WRITE_SANDBOX_CONTENT")), "sandbox provisioning and content mutation remain unavailable");
assert(records.every((item) => ["WRITE_REPOSITORY", "SHELL", "NETWORK", "CREDENTIAL_ACCESS", "PACKAGE_INSTALL", "DEPLOYMENT"].every((authority) => item.authority.forbidden.includes(authority))), "all forbidden authority classes remain forbidden");
assert(records.every((item) => traceabilityChain(item).some((entry) => entry.startsWith("implementation://")) && traceabilityChain(item).some((entry) => entry.startsWith("suite://")) && traceabilityChain(item).at(-1)?.startsWith("maturity://VERIFIED/")), "each workstream traces from vision through implementation and evidence to scoped maturity");
assert(coverageForWorkstream("OMEGA-PLAN-ARTIFACT-001")?.capabilityObjectiveId === "CAPABILITY-AUTHORITY-NEUTRAL-PLANNING", "workstream query returns its capability objective");
assert(workstreamsCoveringConcept("PLAN-XXI").map((item) => item.workstreamId).includes("OMEGA-PRE-R2-GATE-BUNDLE-001"), "concept query returns supporting workstreams");
assert(coverageForWorkstream("OMEGA-NOT-REGISTERED") === null, "unknown workstream remains explicitly absent");

const first = records[0];
assert(validatePlanCoverage([mutate(first, { coverageStatus: "COMPLETE" as never })]).some((item) => item.code === "DISHONEST_CORPUS_COVERAGE"), "total-coverage overclaim is rejected");
assert(validatePlanCoverage([mutate(first, { inheritedConstraints: INHERITED_OMEGA_CONSTRAINTS.slice(1) as typeof INHERITED_OMEGA_CONSTRAINTS })]).some((item) => item.code === "INHERITED_CONSTRAINT_DRIFT"), "missing inherited constraint is rejected");
assert(validatePlanCoverage([mutate(first, { directlyImplemented: [] })]).some((item) => item.code === "INCOMPLETE_PLAN_MAPPING"), "workstream without upward plan mapping is rejected");
assert(validatePlanCoverage([mutate(first, { implementationMappings: [] })]).some((item) => item.code === "BROKEN_DOWNWARD_TRACE"), "workstream without downward implementation trace is rejected");
assert(validatePlanCoverage([mutate(first, { independentlyReplicated: true as never })]).some((item) => item.code === "MATURITY_SCOPE_OVERCLAIM"), "local evidence cannot claim independent replication");
assert(validatePlanCoverage([mutate(first, { authority: { ...first.authority, available: ["READ_REPOSITORY", "SHELL"] } as typeof first.authority })]).some((item) => item.code === "AUTHORITY_CEILING_CHANGED"), "traceability cannot grant shell or alter the authority ceiling");
assert(validatePlanCoverage([mutate(first, { conflicts: [{ ...first.conflicts[0], operationalDecision: "" }] })]).some((item) => item.code === "SILENT_CONFLICT_RESOLUTION"), "conflict cannot be resolved without recorded reasoning");

console.log(`Omega plan coverage traceability tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) { console.error("FAILURES:"); for (const failure of failures) console.error(`  - ${failure}`); process.exit(1); }
