import { compilePlanArtifact, type PlanArtifactInput, type ProposedPlanAction } from "./evaluation/plan-artifact/planner";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function assert(value: unknown, label: string): void { if (value) passed += 1; else { failed += 1; failures.push(label); console.error(`  x ${label}`); } }

function action(actionId: string, requiredAuthority: ProposedPlanAction["requiredAuthority"], overrides: Partial<ProposedPlanAction> = {}): ProposedPlanAction {
  return { actionId, description: `${actionId} description`, requiredAuthority, affectedResources: ["package.json"], assumptions: ["repository identity is stable"],
    preconditions: ["required evidence remains applicable"], requiredObservationIds: ["OBS-PACKAGE"], expectedEvidence: [`evidence for ${actionId}`],
    verificationStrategy: [`verify ${actionId}`], rollbackRequirement: requiredAuthority === "READ_REPOSITORY" ? "NONE_READ_ONLY" : "REQUIRED_BEFORE_EXECUTION",
    dependsOnActionIds: [], ...overrides };
}
function input(overrides: Partial<PlanArtifactInput> = {}): PlanArtifactInput {
  return { planId: "PLAN-R1-TO-R2", objective: { objectiveId: "OBJECTIVE-1", statement: "Inspect and later prepare a controlled change." },
    authorizedObservations: [{ observationId: "OBS-PACKAGE", claimId: "CLAIM-PACKAGE", epistemicState: "SUPPORTED", evidenceAdmissionRef: "evidence://package" }],
    requirements: [{ requirementId: "REQ-R1", statement: "Preserve R1", priority: "HARD", constraintKey: "authority_ceiling", constraintValue: "R1" }],
    knownUnknowns: [], proposedActions: [action("INSPECT", "READ_REPOSITORY"), action("PROVISION", "PROVISION_SANDBOX", { dependsOnActionIds: ["INSPECT"] })],
    availableAuthorities: ["READ_REPOSITORY"], ...overrides };
}

const plan = compilePlanArtifact(input());
assert(plan.actions[0].feasibility === "EXECUTABLE_NOW", "R1 observation action is executable under explicit R1 authority");
assert(plan.actions[1].feasibility === "BLOCKED_BY_AUTHORITY", "sandbox provisioning may be planned but remains blocked by unavailable authority");
assert(plan.feasibility === "BLOCKED_BY_AUTHORITY", "overall plan truthfully reports its highest-priority blocker");
assert(plan.grantsAuthority === false && plan.executesActions === false, "plan artifact neither grants authority nor executes actions");
assert(plan.authorityAnalysis.find((item) => item.authority === "PROVISION_SANDBOX")?.available === false, "authority analysis exposes unavailable requested authority");
assert(!("patch" in plan) && !("executionResult" in plan), "planning substrate does not generate patches or actuation results");

const unsupportedEvidence = compilePlanArtifact(input({ authorizedObservations: [{ ...input().authorizedObservations[0], epistemicState: "STALE" }] }));
assert(unsupportedEvidence.actions[0].feasibility === "BLOCKED_BY_EVIDENCE", "stale required observation blocks planned action by evidence");
const ambiguous = compilePlanArtifact(input({ knownUnknowns: [{ unknownId: "UNKNOWN-SCOPE", statement: "Target scope unresolved", blocksActionIds: ["INSPECT"] }] }));
assert(ambiguous.actions[0].feasibility === "AMBIGUOUS", "known unknown can preserve an explicitly ambiguous action");

const contradictory = compilePlanArtifact(input({ requirements: [
  { requirementId: "REQ-A", statement: "R1 only", priority: "HARD", constraintKey: "authority_ceiling", constraintValue: "R1" },
  { requirementId: "REQ-B", statement: "R2 required", priority: "HARD", constraintKey: "authority_ceiling", constraintValue: "R2" },
] }));
assert(contradictory.feasibility === "CONTRADICTORY" && contradictory.issues.includes("contradictory_hard_requirement:authority_ceiling"), "contradictory hard requirements are explicit rather than forced into a plan");

const dependencyBlocked = compilePlanArtifact(input({ availableAuthorities: ["READ_REPOSITORY", "PROVISION_SANDBOX"], proposedActions: [
  action("INSPECT", "READ_REPOSITORY", { requiredObservationIds: ["MISSING"] }), action("PROVISION", "PROVISION_SANDBOX", { dependsOnActionIds: ["INSPECT"] }),
] }));
assert(dependencyBlocked.issues.includes("unknown_action_observation:INSPECT:MISSING"), "unknown observation reference is a structural issue");
assert(dependencyBlocked.actions[1].feasibility === "BLOCKED_BY_DEPENDENCY", "downstream action is blocked when its prerequisite is not executable");

const mutationNoRollback = compilePlanArtifact(input({ proposedActions: [action("PROVISION", "PROVISION_SANDBOX", { rollbackRequirement: "NONE_READ_ONLY" })] }));
assert(mutationNoRollback.issues.includes("mutation_without_rollback_requirement:PROVISION"), "non-read plan action must declare rollback before execution");
const malformed = compilePlanArtifact(input({ proposedActions: [action("DUP", "READ_REPOSITORY"), action("DUP", "READ_REPOSITORY")] }));
assert(malformed.issues.includes("duplicate_action:DUP"), "duplicate action identities are rejected");
assert(Object.isFrozen(plan) && Object.isFrozen(plan.actions), "compiled plan is immutable");

console.log(`Omega plan artifact tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) { console.error("FAILURES:"); for (const failure of failures) console.error(`  - ${failure}`); process.exit(1); }
