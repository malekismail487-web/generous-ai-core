export const PLAN_FEASIBILITY_STATES = Object.freeze([
  "EXECUTABLE_NOW", "BLOCKED_BY_AUTHORITY", "BLOCKED_BY_EVIDENCE", "BLOCKED_BY_DEPENDENCY", "AMBIGUOUS", "CONTRADICTORY",
] as const);
export type PlanFeasibilityState = (typeof PLAN_FEASIBILITY_STATES)[number];

export type PlannedAuthority = "READ_REPOSITORY" | "PROVISION_SANDBOX" | "TERMINATE_SANDBOX" | "WRITE_SANDBOX_CONTENT"
  | "APPLY_PATCH" | "RUN_BUILD" | "RUN_TEST" | "SCOPED_TERMINAL" | "NETWORK_RETRIEVAL" | "DEPLOY";

export interface PlanObservation {
  readonly observationId: string;
  readonly claimId: string;
  readonly epistemicState: "SUPPORTED" | "REFUTED" | "CONFLICTED" | "UNKNOWN" | "INSUFFICIENT_EVIDENCE" | "STALE";
  readonly evidenceAdmissionRef: string;
}

export interface PlanRequirement {
  readonly requirementId: string;
  readonly statement: string;
  readonly priority: "HARD" | "SOFT";
  readonly constraintKey: string | null;
  readonly constraintValue: string | null;
}

export interface KnownPlanUnknown { readonly unknownId: string; readonly statement: string; readonly blocksActionIds: readonly string[]; }

export interface ProposedPlanAction {
  readonly actionId: string;
  readonly description: string;
  readonly requiredAuthority: PlannedAuthority;
  readonly affectedResources: readonly string[];
  readonly assumptions: readonly string[];
  readonly preconditions: readonly string[];
  readonly requiredObservationIds: readonly string[];
  readonly expectedEvidence: readonly string[];
  readonly verificationStrategy: readonly string[];
  readonly rollbackRequirement: "NONE_READ_ONLY" | "REQUIRED_BEFORE_EXECUTION";
  readonly dependsOnActionIds: readonly string[];
}

export interface PlanArtifactInput {
  readonly planId: string;
  readonly objective: { readonly objectiveId: string; readonly statement: string };
  readonly authorizedObservations: readonly PlanObservation[];
  readonly requirements: readonly PlanRequirement[];
  readonly knownUnknowns: readonly KnownPlanUnknown[];
  readonly proposedActions: readonly ProposedPlanAction[];
  readonly availableAuthorities: readonly PlannedAuthority[];
}

export interface CompiledPlanAction extends ProposedPlanAction {
  readonly feasibility: PlanFeasibilityState;
  readonly blockingReasons: readonly string[];
}

export interface PlanArtifact {
  readonly schemaVersion: 1;
  readonly planId: string;
  readonly objective: PlanArtifactInput["objective"];
  readonly observations: readonly PlanObservation[];
  readonly requirements: readonly PlanRequirement[];
  readonly knownUnknowns: readonly KnownPlanUnknown[];
  readonly actions: readonly CompiledPlanAction[];
  readonly feasibility: PlanFeasibilityState;
  readonly authorityAnalysis: readonly { readonly authority: PlannedAuthority; readonly available: boolean; readonly actionIds: readonly string[] }[];
  readonly issues: readonly string[];
  readonly grantsAuthority: false;
  readonly executesActions: false;
}

function nonEmpty(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function duplicates(values: readonly string[]): readonly string[] { const seen = new Set<string>(); return [...new Set(values.filter((item) => seen.has(item) || !seen.add(item)))]; }
function unique(values: readonly string[]): readonly string[] { return [...new Set(values)]; }

export function compilePlanArtifact(input: PlanArtifactInput): PlanArtifact {
  const issues: string[] = [];
  if (!nonEmpty(input.planId) || !nonEmpty(input.objective.objectiveId) || !nonEmpty(input.objective.statement)) issues.push("malformed_plan_identity");
  for (const id of duplicates(input.proposedActions.map((item) => item.actionId))) issues.push(`duplicate_action:${id}`);
  for (const id of duplicates(input.authorizedObservations.map((item) => item.observationId))) issues.push(`duplicate_observation:${id}`);
  for (const id of duplicates(input.requirements.map((item) => item.requirementId))) issues.push(`duplicate_requirement:${id}`);
  const actionIds = new Set(input.proposedActions.map((item) => item.actionId));
  const observationIds = new Set(input.authorizedObservations.map((item) => item.observationId));
  for (const action of input.proposedActions) {
    if (!nonEmpty(action.actionId) || !nonEmpty(action.description) || action.affectedResources.length === 0 || action.expectedEvidence.length === 0 || action.verificationStrategy.length === 0) issues.push(`malformed_action:${action.actionId}`);
    for (const dependency of action.dependsOnActionIds) if (!actionIds.has(dependency) || dependency === action.actionId) issues.push(`invalid_action_dependency:${action.actionId}:${dependency}`);
    for (const observation of action.requiredObservationIds) if (!observationIds.has(observation)) issues.push(`unknown_action_observation:${action.actionId}:${observation}`);
    if (action.requiredAuthority !== "READ_REPOSITORY" && action.rollbackRequirement !== "REQUIRED_BEFORE_EXECUTION") issues.push(`mutation_without_rollback_requirement:${action.actionId}`);
  }
  const hardConstraints = new Map<string, Set<string>>();
  for (const requirement of input.requirements) {
    if (requirement.priority === "HARD" && nonEmpty(requirement.constraintKey) && nonEmpty(requirement.constraintValue)) {
      const values = hardConstraints.get(requirement.constraintKey) ?? new Set<string>(); values.add(requirement.constraintValue); hardConstraints.set(requirement.constraintKey, values);
    }
  }
  const contradictions = [...hardConstraints].filter(([, values]) => values.size > 1).map(([key]) => key);
  for (const key of contradictions) issues.push(`contradictory_hard_requirement:${key}`);
  const observationMap = new Map(input.authorizedObservations.map((item) => [item.observationId, item]));
  const available = new Set(input.availableAuthorities);
  const compiled = new Map<string, CompiledPlanAction>();
  for (const action of input.proposedActions) {
    const reasons: string[] = [];
    let feasibility: PlanFeasibilityState = "EXECUTABLE_NOW";
    if (contradictions.length > 0) { feasibility = "CONTRADICTORY"; reasons.push(...contradictions.map((key) => `hard_requirement:${key}`)); }
    else if (action.requiredObservationIds.some((id) => observationMap.get(id)?.epistemicState !== "SUPPORTED")) {
      feasibility = "BLOCKED_BY_EVIDENCE"; reasons.push(...action.requiredObservationIds.filter((id) => observationMap.get(id)?.epistemicState !== "SUPPORTED").map((id) => `observation_not_supported:${id}`));
    } else if (input.knownUnknowns.some((unknown) => unknown.blocksActionIds.includes(action.actionId))) {
      feasibility = "AMBIGUOUS"; reasons.push(...input.knownUnknowns.filter((unknown) => unknown.blocksActionIds.includes(action.actionId)).map((unknown) => `known_unknown:${unknown.unknownId}`));
    } else if (!available.has(action.requiredAuthority)) {
      feasibility = "BLOCKED_BY_AUTHORITY"; reasons.push(`authority_unavailable:${action.requiredAuthority}`);
    } else {
      const blockers = action.dependsOnActionIds.map((id) => compiled.get(id)).filter((item) => item && item.feasibility !== "EXECUTABLE_NOW");
      if (blockers.length > 0) { feasibility = "BLOCKED_BY_DEPENDENCY"; reasons.push(...blockers.map((item) => `action_dependency:${item!.actionId}:${item!.feasibility}`)); }
    }
    compiled.set(action.actionId, Object.freeze({ ...action, feasibility, blockingReasons: Object.freeze(unique(reasons)) }));
  }
  const actions = [...compiled.values()];
  const statePriority: PlanFeasibilityState[] = ["CONTRADICTORY", "BLOCKED_BY_EVIDENCE", "AMBIGUOUS", "BLOCKED_BY_AUTHORITY", "BLOCKED_BY_DEPENDENCY", "EXECUTABLE_NOW"];
  const feasibility = statePriority.find((state) => actions.some((action) => action.feasibility === state)) ?? "AMBIGUOUS";
  const requestedAuthorities = unique(input.proposedActions.map((item) => item.requiredAuthority));
  return Object.freeze({
    schemaVersion: 1, planId: input.planId, objective: Object.freeze({ ...input.objective }),
    observations: Object.freeze(input.authorizedObservations.map((item) => Object.freeze({ ...item }))),
    requirements: Object.freeze(input.requirements.map((item) => Object.freeze({ ...item }))),
    knownUnknowns: Object.freeze(input.knownUnknowns.map((item) => Object.freeze({ ...item }))), actions: Object.freeze(actions), feasibility,
    authorityAnalysis: Object.freeze(requestedAuthorities.map((authority) => Object.freeze({ authority, available: available.has(authority), actionIds: Object.freeze(input.proposedActions.filter((item) => item.requiredAuthority === authority).map((item) => item.actionId)) }))),
    issues: Object.freeze(unique(issues)), grantsAuthority: false, executesActions: false,
  });
}
