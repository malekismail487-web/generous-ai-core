import type { RepresentationTask } from "./sourceRepresentationTasks";
import { v3NativeReasoningConfiguration, v3NativeWireVerified } from "./v3NativeReasoningTransferTasks";

export const GUARDED_REPAIR_FRESH_EPOCH = Object.freeze({
  version: "nyx-guarded-repair-unseeded-transfer/1", admissionPolicyId: "omega-public-static-candidate/3" as const,
  uniqueTasks: 2, predeclaredRepeats: 2, suppliedCandidates: false,
  changedVariable: "SAME_GUARDED_PROPOSALS_SOURCE_EMISSION_VS_SOURCE_BOUND_SELECTION_AFTER_QUALITY_REJECTION",
  criterion: "BOTH_REPEATS_WIN_IN_BOTH_DOMAINS_AT_MATCHED_REALIZED_COMPUTE_WITH_IDENTICAL_INITIAL_REJECTED_CANDIDATE_AND_NO_REGRESSION",
  limitations: "Same-author small unseeded engineering tasks; source-bound selection is a host proposal reviewed by the model, not model-authored replacement source or certified equivalence. Pre-feedback candidate differences earn no causal credit.",
});
export function guardedRepairFreshConfiguration(variant: string) {
  if (!["GUARDED_SOURCE_CONTROL", "GUARDED_SELECTION"].includes(variant)) throw Error("guarded_fresh_arm_invalid");
  return { ...v3NativeReasoningConfiguration("NATIVE_BOUNDED_REASONING"),
    localRefactorGuidance: "EVALUATION_ORDER_PROPOSALS" as const,
    ...(variant === "GUARDED_SELECTION" ? { localRefactorSelection: "SOURCE_BOUND_REFERENCES" as const } : {}) };
}
export function guardedRepairFreshWireVerified(variant: string, controls: readonly {
  initialCandidateState?: boolean; originalBudgetPresented?: boolean; originalBudgetVersion?: unknown;
  originalBudgetPolicyId?: unknown; publicAdmissionPolicyId?: unknown; legacyLineApplicabilityPresent?: boolean;
  qualityRepairPhase?: boolean; localProposalsPresented?: boolean; localProposalCount?: number;
  localProposalVersion?: string | null; selectionBranchOffered?: boolean; selectionBindingDigest?: string | null;
}[]) {
  guardedRepairFreshConfiguration(variant);
  return v3NativeWireVerified("NATIVE_BOUNDED_REASONING", controls) && controls.length > 0 && controls.every(control => {
    const count = control.localProposalCount;
    if (!Number.isSafeInteger(count) || count! < 0 || count! > 8) return false;
    if (count === 0) return control.localProposalsPresented === false && control.localProposalVersion === null
      && control.selectionBranchOffered === false && control.selectionBindingDigest === null;
    const selected = variant === "GUARDED_SELECTION";
    return control.initialCandidateState === false && control.qualityRepairPhase === true && control.localProposalsPresented === true
      && control.localProposalVersion === (selected ? "nyx-source-bound-refactor-selection/1" : "nyx-local-refactor-proposals/3")
      && control.selectionBranchOffered === selected
      && (selected ? /^[a-f0-9]{64}$/.test(control.selectionBindingDigest ?? "") : control.selectionBindingDigest === null);
  });
}

type RepairPairRow = {
  accepted?: boolean;
  perIteration?: readonly { candidateSourceDigest?: string | null; functionalAccepted?: boolean; quality?: string | null }[];
  guardedSelectionReceipts?: readonly { outcome: string }[];
};
/** Attribution is evaluator-owned, not a model claim or a runtime promotion decision. */
export function guardedRepairPairAssessment(control: RepairPairRow | undefined,
  treatment: RepairPairRow | undefined, matchedRealizedCompute: boolean) {
  const first=control?.perIteration?.[0], other=treatment?.perIteration?.[0];
  const sameFirstCandidate=typeof first?.candidateSourceDigest==="string"
    && /^[a-f0-9]{64}$/.test(first.candidateSourceDigest) && first.candidateSourceDigest===other?.candidateSourceDigest;
  const treatmentExercised=treatment?.guardedSelectionReceipts?.some(receipt=>receipt.outcome==="RESOLVED")===true;
  const qualityRepairEligible=matchedRealizedCompute&&sameFirstCandidate&&treatmentExercised
    &&[first,other].every(row=>row?.functionalAccepted===true&&row.quality==="REJECTED");
  return {sameFirstCandidate,treatmentExercised,qualityRepairEligible,
    qualifyingQualityRepairGain:qualityRepairEligible&&treatment?.accepted===true&&control?.accepted===false};
}

type Pose = { transforms: number[][]; point: number[] };
// Oracle evaluates the geometric action on three basis points; witness multiplies affine coefficients.
function pose(input: Pose): number[][] {
  const act = (point: number[]) => input.transforms.reduce(([x, y], [a, b, c, d, tx, ty]) =>
    [a * x + b * y + tx, c * x + d * y + ty], point.slice());
  const origin = act([0, 0]), xBasis = act([1, 0]), yBasis = act([0, 1]);
  return [[xBasis[0] - origin[0], yBasis[0] - origin[0], xBasis[1] - origin[1], yBasis[1] - origin[1], ...origin], act(input.point)];
}
type Chain = { matrix: number[][]; initial: number[]; rewards: number[]; steps: number };
// Oracle enumerates complete state paths; witness propagates the distribution in time.
function chain(input: Chain): number {
  let expected = 0;
  const visit = (state: number, time: number, probability: number, reward: number) => {
    if (time === input.steps) { expected += probability * reward; return; }
    input.matrix[state].forEach((transition, next) => {
      if (transition) visit(next, time + 1, probability * transition, reward + input.rewards[next]);
    });
  };
  input.initial.forEach((probability, state) => { if (probability) visit(state, 0, probability, 0); });
  return expected;
}
const poseInputs: Pose[] = [{ transforms: [], point: [-2, 3] },
  { transforms: [[1, 0, 0, 1, 2, -1], [0, -1, 1, 0, 0, 0]], point: [3, 4] },
  { transforms: [[0, 0, 0, 0, 7, -3]], point: [2, 1] },
  ...Array.from({ length: 9 }, (_, seed) => ({ transforms: Array.from({ length: seed % 4 + 1 }, (_, index) =>
    [seed % 3 - 1, index % 2, -(index % 2), 1, seed - 4, index - 2]), point: [seed - 3, 3 - seed] }))];
const chainInputs: Chain[] = [
  { matrix: [[1, 0], [0, 1]], initial: [1, 0], rewards: [2, -4], steps: 0 },
  { matrix: [[0, 1], [1, 0]], initial: [1, 0], rewards: [5, -2], steps: 5 },
  { matrix: [[0.5, 0.5], [0, 1]], initial: [1, 0], rewards: [0, 4], steps: 4 },
  { matrix: [[1]], initial: [1], rewards: [-3], steps: 6 },
  ...Array.from({ length: 8 }, (_, seed) => ({ matrix: [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5]],
    initial: seed % 2 ? [0.5, 0.5, 0] : [1, 0, 0], rewards: [seed - 3, 2, -1], steps: seed % 7 }))];
const boundary = " Preserve inputs, independently own any returned arrays, retain the named ESM transform export. No imports, processes, filesystem or network; only src/transform.mjs may change.";
export const GUARDED_REPAIR_FRESH_TASKS: readonly RepresentationTask[] = [
  { id: "AFFINE-POSE-ACCUMULATION", tier: "DEVELOPMENT", domain: "ORDERED_COORDINATE_COMPOSITION",
    objective: "Implement transform(input) for {transforms,point}. Each transform is [a,b,c,d,tx,ty] and maps [x,y] to [a*x+b*y+tx,c*x+d*y+ty]. Apply transforms in listed order (first listed acts first). Return [combinedTransform,transformedPoint] using the same six-coefficient convention. Empty transforms use identity. There are at most four transforms, coefficients and point coordinates are integers -10..10. Singular transforms are valid; do not divide or invert." + boundary,
    publicCases: [{ input: { transforms: [], point: [1, 2] }, expected: [[1, 0, 0, 1, 0, 0], [1, 2]] },
      { input: { transforms: [[1, 0, 0, 1, 2, 3], [2, 0, 0, 2, 0, 0]], point: [1, 1] }, expected: [[2, 0, 0, 2, 4, 6], [6, 8]] }],
    privateCases: poseInputs.map(input => ({ input, expected: pose(input) })) },
  { id: "FINITE-CHAIN-ARRIVAL-REWARD", tier: "VALIDATION", domain: "BOUNDED_STOCHASTIC_PROPAGATION",
    objective: "Implement transform(input) for {matrix,initial,rewards,steps}. A 1..3 state Markov chain has row-stochastic transition matrix (row is source state, column is destination), an initial probability distribution, and a reward per state. Return expected total arrival reward over exactly steps transitions; exclude reward at time zero and do not discount. Steps is integer 0..6. Probabilities are 0,0.5,1; rewards integers -10..10. Matrix and distributions are valid. Steps zero returns 0. Use ordinary exact binary arithmetic on these dyadic inputs." + boundary,
    publicCases: [{ input: { matrix: [[0, 1], [1, 0]], initial: [1, 0], rewards: [3, 7], steps: 2 }, expected: 10 },
      { input: { matrix: [[0.5, 0.5], [0, 1]], initial: [1, 0], rewards: [0, 4], steps: 2 }, expected: 5 }],
    privateCases: chainInputs.map(input => ({ input, expected: chain(input) })) },
];
export function guardedRepairFreshTasks(): RepresentationTask[] {
  return GUARDED_REPAIR_FRESH_TASKS.flatMap(task => [1, 2].map(repeat => ({ ...task, id: `${task.id}-REPEAT-${repeat}` })));
}
