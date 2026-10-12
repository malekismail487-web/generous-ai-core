import { snapshotBoundedReasoningData } from "../../src/lib/codelab/research/boundedReasoningWorkbench";
import type { ProcedureTask } from "../../src/lib/codelab/research/quantitativeProcedureReuse";
import { immutableTheoryValue, theoryDigest } from "../../src/lib/codelab/research/theoryContracts";

/** Fresh, public formal objectives. Transfer changes parameter values, NOT task
 * families. Oracles solve linear systems independently of the native IR engine.
 * No benchmark questions, prior answers or reference program enter cognition.
 */
export interface ProcedureCase extends ProcedureTask { readonly taskId: string; readonly family: "INTERPOLATION" | "PASSIVE_NETWORK" }
export const PROCEDURE_REUSE_EPOCH = immutableTheoryValue({ version: "nyx-procedure-reuse/1",
  model: "nvidia/nemotron-3-super-120b-a12b", arms: ["CURRENT_RECOMPUTE", "CONTEXT_ONLY", "BOUND_INVOCATION"],
  maxCallsPerStage: 2, maxOutputTokensPerCall: 8192, maxStageMs: 180000, maxEpochMs: 1800000,
  maxHttpAttemptsPerStage: 2, maxHttpAttemptsPerEpoch: 28,
  reasoningControl: "SUPER_HOSTED_NATIVE" as const, reasoningBudgetTokens: 2048, structuredOutput: "GUIDED_STRICT_LOCAL_VALIDATION",
  maxToolRequestsPerStage: 2, maxToolWorkUnitsPerStage: 100000, maxToolElapsedMsPerStage: 2000,
  maxPhysicalLogicalCalls: 28, transferScope: "UNSEEN_PARAMETER_VALUES_IN_TWO_KNOWN_FORMAL_FAMILIES",
  sharedSeedConstruction: true, seedCostCharging: "FULL_CONSTRUCTION_BOTH_REUSE_ARMS_BASELINE_NOT_CHARGED", noHumanAuthoredFallback: true,
  acceptance: "EXACT_CANONICAL_OUTPUTS_INDEPENDENT_LINEAR_SYSTEM_ORACLE",
  promotion: "COMPLETE_PROVIDER_STABLE_TRANSFER_WITH_NO_ACCEPTANCE_REGRESSION_AND_LOWER_FULLY_CHARGED_TOKENS_AND_NO_MORE_CALLS",
  broadCognitionPromotion: false, authorityIncrease: false });
const objectives = {
  INTERPOLATION: "The constants x0,x1,x2 are distinct. Let p be the unique polynomial of degree at most 2 satisfying p(x0)=y0, p(x1)=y1, p(x2)=y2. Compute value=p(t) and slope=p'(t), exactly. Named zero, one and two have their usual values. Derive the result from the current parameters, not from a previous case.",
  PASSIVE_NETWORK: "A grounded passive electrical network has two non-ground nodes 0 and 1. Conductances g0 and g1 connect each node to ground; conductance g01 connects the nodes. Currents i0 and i1 are injected into the respective nodes, with negative currents representing extraction. The potentials satisfy (g0+g01)*v0-g01*v1=i0 and -g01*v0+(g1+g01)*v1=i1. All conductances are positive. Compute voltage0=v0, voltage1=v1 and loss=g0*v0^2+g1*v1^2+g01*(v0-v1)^2, exactly. Named zero, one and two are fixed mathematical constants."
};
function task(family: ProcedureCase["family"], taskId: string, values: Record<string, string>): ProcedureCase {
  return immutableTheoryValue({ taskId, family, objective: objectives[family],
    problem: { kind: "EXACT_QUANTITATIVE_DERIVATION", constants: Object.entries({ zero: "0", one: "1", two: "2", ...values }).map(([id, value]) => ({ id, value })) },
    outputLabels: family === "INTERPOLATION" ? ["value", "slope"] : ["voltage0", "voltage1", "loss"] });
}
export const PROCEDURE_FAMILIES = immutableTheoryValue([
  { family: "INTERPOLATION", seed: task("INTERPOLATION", "PROC-INTERPOLATION-SEED", { x0: "-2", x1: "1", x2: "4", y0: "7", y1: "-3", y2: "11", t: "2" }),
    fresh: [task("INTERPOLATION", "PROC-INTERPOLATION-TRANSFER-1", { x0: "-3/2", x1: "2/3", x2: "5/2", y0: "8/7", y1: "-4/5", y2: "9/2", t: "-1/3" }),
      task("INTERPOLATION", "PROC-INTERPOLATION-TRANSFER-2", { x0: "-5", x1: "-1", x2: "3", y0: "17", y1: "2", y2: "-8", t: "-1" })] },
  { family: "PASSIVE_NETWORK", seed: task("PASSIVE_NETWORK", "PROC-NETWORK-SEED", { g0: "2", g1: "3", g01: "1", i0: "7", i1: "-2" }),
    fresh: [task("PASSIVE_NETWORK", "PROC-NETWORK-TRANSFER-1", { g0: "2/3", g1: "7/5", g01: "3/4", i0: "-9/2", i1: "11/3" }),
      task("PASSIVE_NETWORK", "PROC-NETWORK-TRANSFER-2", { g0: "5", g1: "2", g01: "4", i0: "0", i1: "-13" })] }
]);
export const PROCEDURE_CORPUS_DIGEST = theoryDigest(PROCEDURE_FAMILIES);
/** Newly frozen values, never sent in the earlier seed/reuse epoch. The formal
 * families are known: this tests a general interface correction, not unseen
 * disciplines or memorized exposed questions. Oracle and all native limits stay.
 */
export const NATIVE_GENERATION_CASES = immutableTheoryValue([
  task("INTERPOLATION", "GEN-INTERPOLATION-1", {x0:"-7/3",x1:"5/4",x2:"13/5",y0:"19/7",y1:"-11/6",y2:"23/8",t:"-4/9"}),
  task("PASSIVE_NETWORK", "GEN-NETWORK-1", {g0:"11/7",g1:"5/9",g01:"13/8",i0:"-17/6",i1:"29/11"}),
  task("INTERPOLATION", "GEN-INTERPOLATION-2", {x0:"-6",x1:"-2",x2:"5",y0:"-9",y1:"13",y2:"2",t:"7/3"}),
  task("PASSIVE_NETWORK", "GEN-NETWORK-2", {g0:"7",g1:"11",g01:"3",i0:"19",i1:"-23"})
]);
export const NATIVE_GENERATION_CORPUS_DIGEST = theoryDigest(NATIVE_GENERATION_CASES);
export const NATIVE_GENERATION_EPOCH = immutableTheoryValue({version:"nyx-native-generation-bounds/1",
  model:PROCEDURE_REUSE_EPOCH.model,arms:["ORIGINAL_GENERATION","NATIVE_BOUNDS"],
  maxCallsPerStage:2,maxHttpAttemptsPerStage:2,maxLogicalCalls:16,maxHttpAttemptsPerEpoch:16,
  maxOutputTokensPerCall:8192,reasoningControl:"SUPER_HOSTED_NATIVE" as const,reasoningBudgetTokens:2048,
  maxStageMs:180000,maxEpochMs:1800000,maxToolRequestsPerStage:2,maxToolWorkUnitsPerStage:100000,maxToolElapsedMsPerStage:2000,
  realizedTokenMatchTolerance:0.05,unchangedOracle:"independent-gaussian-elimination/1",
  changedVariable:"OPTIONAL_NATIVE_COLLECTION_SCHEMA_PROMPT_AND_PUBLIC_DIAGNOSTIC_GUIDANCE",
  support:"MORE_INDEPENDENTLY_ACCEPTED_FRESH_CASES_WITHOUT_MORE_REALIZED_MODEL_COMPUTE_AND_NO_CASE_REGRESSION",
  limitations:["FOUR_NEW_VALUES_TWO_KNOWN_FORMAL_FAMILIES","INTERFACE_CORRECTION_NOT_NEW_COGNITIVE_LAYER",
    "CAPS_MATCHED_REALIZED_COMPUTE_MEASURED_NOT_ASSUMED","SINGLE_EPOCH_NO_DEFAULT_OR_BROAD_PROMOTION"],authorityIncrease:false});
/** Frozen new values for a surface-notation ablation. No task-specific formula
 * is supplied to cognition. Same independent oracle and exact output checks. */
export const ALGEBRAIC_TRANSFER_CASES = immutableTheoryValue([
  task("INTERPOLATION", "ALGEBRA-INTERPOLATION-1", {x0:"-19/12",x1:"23/14",x2:"41/10",y0:"61/31",y1:"-37/27",y2:"29/19",t:"11/17"}),
  task("PASSIVE_NETWORK", "ALGEBRA-NETWORK-1", {g0:"43/25",g1:"47/31",g01:"29/22",i0:"-83/37",i1:"67/23"}),
  task("INTERPOLATION", "ALGEBRA-INTERPOLATION-2", {x0:"-17",x1:"7",x2:"23",y0:"59",y1:"-31",y2:"47",t:"19/13"}),
  task("PASSIVE_NETWORK", "ALGEBRA-NETWORK-2", {g0:"31",g1:"23",g01:"17",i0:"-79",i1:"53"}),
]);
export const ALGEBRAIC_TRANSFER_CORPUS_DIGEST = theoryDigest(ALGEBRAIC_TRANSFER_CASES);
export const ALGEBRAIC_TRANSFER_EPOCH = immutableTheoryValue({...NATIVE_GENERATION_EPOCH,
  version:"nyx-algebraic-surface-transfer/1",arms:["GRAPH_WITH_ADMITTED_CONTEXT","ALGEBRAIC_FORM_WITH_ADMITTED_CONTEXT"],
  changedVariable:"MODEL_AUTHORED_MATHEMATICAL_SURFACE_STRINGS_LOWERED_INTO_EXISTING_EXACT_INTERPRETER",
  limitations:["FOUR_NEW_PARAMETER_CASES_TWO_KNOWN_FORMAL_FAMILIES","NO_TASK_SPECIFIC_FORMULAS_SUPPLIED",
    "SAME_ORACLE_OUTPUT_CONTRACT_ADMITTED_REPAIR_CONTEXT_CAPS_AND_NATIVE_EXECUTOR",
    "REALIZED_MODEL_COMPUTE_AND_NATIVE_PARSER_WORK_MEASURED_NOT_ASSUMED_MATCHED",
    "NO_DEFAULT_CHANGE_OR_BROAD_COGNITIVE_PROMOTION"],authorityIncrease:false});
type Q = readonly [bigint, bigint];
/** New representation epoch; old corpora and their oracle identities remain unchanged. */
export const EXPRESSION_TRANSFER_CASES=immutableTheoryValue([
  task("INTERPOLATION","EXPR-INTERPOLATION-1",{x0:"-8/5",x1:"7/6",x2:"17/4",y0:"31/9",y1:"-13/7",y2:"5/11",t:"-2/3"}),
  task("PASSIVE_NETWORK","EXPR-NETWORK-1",{g0:"17/9",g1:"11/13",g01:"7/6",i0:"-23/5",i1:"37/8"}),
  task("INTERPOLATION","EXPR-INTERPOLATION-2",{x0:"-9",x1:"2",x2:"6",y0:"23",y1:"-7",y2:"11",t:"4/5"}),
  task("PASSIVE_NETWORK","EXPR-NETWORK-2",{g0:"13",g1:"7",g01:"5",i0:"-31",i1:"17"})
]);
export const EXPRESSION_TRANSFER_CORPUS_DIGEST=theoryDigest(EXPRESSION_TRANSFER_CASES);
export const EXPRESSION_TRANSFER_EPOCH=immutableTheoryValue({...NATIVE_GENERATION_EPOCH,version:"nyx-expression-graph-transfer/1",
  arms:["NATIVE_BOUNDS","EXPRESSION_GRAPH"],changedVariable:"GENERATION_REPRESENTATION_WITH_HOST_OWNED_TEMPORARY_BINDING_AND_REGISTER_REUSE",
  limitations:["FOUR_NEW_VALUES_TWO_KNOWN_FORMAL_FAMILIES","INTERFACE_LOWERING_NOT_NEW_COGNITIVE_LAYER",
    "CAPS_MATCHED_REALIZED_COMPUTE_MEASURED_NOT_ASSUMED","SINGLE_EPOCH_REQUIRES_REPLICATION","PAIR_ORIGINAL_FIELDS_DENOTE_CONTROL_BOUNDED_FIELDS_DENOTE_TREATMENT"]});
/** Existing repair state was not enabled in the preceding positional-graph
 * experiment. Both arms now share the exact public output contract; only
 * treatment receives its OWN most recently admitted IR on a later call.
 * No old case/answer/program is supplied, and no new persistent memory exists. */
export const REPAIR_CONTEXT_CASES=immutableTheoryValue([
  task("INTERPOLATION","CTX-INTERPOLATION-1",{x0:"-11/7",x1:"9/8",x2:"19/6",y0:"37/13",y1:"-17/9",y2:"7/5",t:"-3/4"}),
  task("PASSIVE_NETWORK","CTX-NETWORK-1",{g0:"19/11",g1:"13/17",g01:"11/8",i0:"-29/7",i1:"41/9"}),
  task("INTERPOLATION","CTX-INTERPOLATION-2",{x0:"-8",x1:"3",x2:"9",y0:"29",y1:"-11",y2:"17",t:"7/6"}),
  task("PASSIVE_NETWORK","CTX-NETWORK-2",{g0:"17",g1:"11",g01:"7",i0:"-43",i1:"23"})
]);
export const REPAIR_CONTEXT_CORPUS_DIGEST=theoryDigest(REPAIR_CONTEXT_CASES);
export const REPAIR_CONTEXT_EPOCH=immutableTheoryValue({...NATIVE_GENERATION_EPOCH,version:"nyx-admitted-repair-context/1",
  arms:["GRAPH_WITH_OUTPUT_CONTRACT","GRAPH_WITH_ADMITTED_CONTEXT"],objectiveOutputContract:"ENFORCE",maxAdmittedContextBytes:12000,
  changedVariable:"SECOND_CALL_OWN_ADMITTED_PROGRAM_CONTEXT_UNDER_COMMON_OBJECTIVE_OUTPUT_CONTRACT",
  support:"MORE_FRESH_ACCEPTED_REPAIRS_WITHOUT_MORE_REALIZED_MODEL_COMPUTE_NO_CASE_REGRESSION_REQUIRES_REPLICATION",
  limitations:["FOUR_NEW_VALUES_TWO_KNOWN_FORMAL_FAMILIES","EXISTING_CONTEXT_FEATURE_NOT_NEW_COGNITIVE_LAYER",
    "INDEPENDENT_FIRST_PROPOSALS_NOT_SHARED_START_CAUSAL_IDENTIFICATION","FIRST_AND_REPAIRED_OUTCOMES_SEPARATE",
    "CAPS_MATCHED_REALIZED_COMPUTE_MEASURED_NOT_ASSUMED","SINGLE_EPOCH_REQUIRES_REPLICATION",
    "PAIR_ORIGINAL_FIELDS_DENOTE_CONTROL_BOUNDED_FIELDS_DENOTE_TREATMENT"]});
/** Diagnostic only: same reasoning-enabled model, fresh values and exact oracle.
 * Direct control has no computation tool; native arm uses the EXISTING graph
 * capability. This deliberate availability difference is the hypothesis, not
 * a matched-tools or broad cognitive-promotion claim. */
export const DIRECT_NATIVE_CASES=immutableTheoryValue([
  task("INTERPOLATION","DIR-INTERPOLATION-1",{x0:"-13/9",x1:"11/10",x2:"23/7",y0:"41/17",y1:"-19/11",y2:"13/8",t:"5/6"}),
  task("PASSIVE_NETWORK","DIR-NETWORK-1",{g0:"23/13",g1:"17/19",g01:"13/10",i0:"-37/11",i1:"47/13"}),
  task("INTERPOLATION","DIR-INTERPOLATION-2",{x0:"-7",x1:"4",x2:"11",y0:"31",y1:"-13",y2:"19",t:"9/7"}),
  task("PASSIVE_NETWORK","DIR-NETWORK-2",{g0:"19",g1:"13",g01:"9",i0:"-47",i1:"29"})
]);
export const DIRECT_NATIVE_CORPUS_DIGEST=theoryDigest(DIRECT_NATIVE_CASES);
export const DIRECT_NATIVE_EPOCH=immutableTheoryValue({...NATIVE_GENERATION_EPOCH,version:"nyx-direct-native-diagnostic/1",
  arms:["DIRECT_REASONED","NATIVE_GRAPH"],objectiveOutputContract:"ENFORCE",
  changedVariable:"MANUAL_CERTIFICATE_WITHOUT_TOOL_VERSUS_EXISTING_NATIVE_GRAPH_TOOL_AVAILABILITY",
  support:"DIAGNOSTIC_PAIRED_OUTCOMES_NOT_DEFAULT_OR_COGNITIVE_PROMOTION",
  limitations:["FOUR_NEW_VALUES_TWO_KNOWN_FORMAL_FAMILIES","DELIBERATE_TOOL_AVAILABILITY_AND_REPRESENTATION_DIFFERENCE",
    "SAME_REASONING_ENABLED_MODEL_WIRE_CONTROLS_NOT_NONREASONING_DIRECT_CONTROL",
    "FIRST_AND_REPAIRED_OUTCOMES_SEPARATE","CAPS_MATCHED_REALIZED_COMPUTE_MEASURED_NOT_ASSUMED",
    "INDEPENDENT_FIRST_PROPOSALS_NOT_SHARED_START_CAUSAL_IDENTIFICATION","SINGLE_DIAGNOSTIC_NO_DEFAULT_PROMOTION",
    "NATIVE_ARM_MAY_CHOOSE_MANUAL_SUBMISSION_TOOL_USE_MEASURED_NOT_ASSUMED",
    "EXACT_CANONICAL_OUTPUT_ACCEPTANCE_UNCHANGED_DIRECT_NONCANONICAL_EQUIVALENCE_NOT_SEPARATELY_GRADED",
    "PAIR_ORIGINAL_FIELDS_DENOTE_DIRECT_CONTROL_BOUNDED_FIELDS_DENOTE_NATIVE_ARM"]});
/** Fresh parameter transfer of an EXISTING public-model repair mechanism.
 * Both arms have no tool and replay the same unseeded first live proposal.
 * No formulation, certificate, reference solver or numeric answer is supplied. */
export const DIRECT_REFORMULATION_CASES=immutableTheoryValue([
  task("INTERPOLATION","REFORM-INTERPOLATION-1",{x0:"-17/11",x1:"13/8",x2:"29/6",y0:"43/19",y1:"-23/13",y2:"17/9",t:"7/10"}),
  task("PASSIVE_NETWORK","REFORM-NETWORK-1",{g0:"31/17",g1:"23/19",g01:"19/14",i0:"-41/13",i1:"53/17"}),
  task("INTERPOLATION","REFORM-INTERPOLATION-2",{x0:"-11",x1:"3",x2:"13",y0:"37",y1:"-17",y2:"23",t:"11/9"}),
  task("PASSIVE_NETWORK","REFORM-NETWORK-2",{g0:"23",g1:"17",g01:"11",i0:"-59",i1:"37"})
]);
export const DIRECT_REFORMULATION_CORPUS_DIGEST=theoryDigest(DIRECT_REFORMULATION_CASES);
export const DIRECT_REFORMULATION_EPOCH=immutableTheoryValue({...NATIVE_GENERATION_EPOCH,version:"nyx-direct-model-repair/1",
  arms:["DIRECT_REPAIR","DIRECT_MODEL_REPAIR"],maxCallsPerStage:4,maxHttpAttemptsPerStage:4,
  maxLogicalCalls:32,maxHttpAttemptsPerEpoch:28,maxPhysicalLogicalCalls:28,maxStageMs:240000,
  objectiveOutputContract:"ENFORCE",sharedFirstProposal:true,
  changedVariable:"EXISTING_PUBLIC_MODEL_REFORMULATION_AFTER_EXACT_REJECTION_WITHIN_EQUAL_CALL_LIMITS",
  support:"EXPOSED_SHARED_START_REPAIR_GAIN_NO_PAIRED_REGRESSION_NO_MORE_REALIZED_REPAIR_COMPUTE_REPLICATION_REQUIRED",
  limitations:["FOUR_NEW_VALUES_TWO_KNOWN_FORMAL_FAMILIES_NOT_OFFICIAL_OR_FAMILY_DISJOINT_HOLDOUT",
    "IDENTICAL_REASONING_MODEL_WIRE_AND_NO_TOOLS_BOTH_ARMS","SAME_FIRST_LIVE_PROPOSAL_OWN_LEASES_AND_ORACLES",
    "SHARED_PREFIX_CHARGED_FULLY_TO_BOTH_ARMS_PHYSICAL_USAGE_COUNTED_ONCE",
    "PUBLIC_FORMULATION_USES_ONE_EXISTING_CALL_NOT_A_FREE_ADDITIONAL_CALL",
    "COMMON_PREFIX_TIME_DEDUCTED_FROM_REPLAY_ARM_TASK_BUDGET","CAPS_MATCHED_REALIZED_REPAIR_COMPUTE_MEASURED_NOT_ASSUMED",
    "EXACT_CANONICAL_ACCEPTANCE_NONCANONICAL_EQUIVALENCE_NOT_SEPARATELY_GRADED","NO_BROAD_DEFAULT_OR_RECURSION_PROMOTION"]});
/** New observations, not a rerun/regrade or cognitive-promotion epoch. The
 * numerical oracle and cognitive requests are unchanged; observers expose only
 * bounded contract classes and as-written exact-value comparisons. */
export const QUANTITATIVE_DIAGNOSIS_CASES=immutableTheoryValue([
  task("INTERPOLATION","DIAG-INTERPOLATION-1",{x0:"-14/11",x1:"17/9",x2:"31/7",y0:"47/23",y1:"-29/17",y2:"19/13",t:"13/12"}),
  task("PASSIVE_NETWORK","DIAG-NETWORK-1",{g0:"29/19",g1:"31/23",g01:"17/12",i0:"-61/19",i1:"43/13"})
]);
export const QUANTITATIVE_DIAGNOSIS_CORPUS_DIGEST=theoryDigest(QUANTITATIVE_DIAGNOSIS_CASES);
export const QUANTITATIVE_DIAGNOSIS_EPOCH=immutableTheoryValue({...DIRECT_REFORMULATION_EPOCH,version:"nyx-quantitative-failure-diagnosis/1",
  maxCallsPerStage:3,maxHttpAttemptsPerStage:3,maxLogicalCalls:12,maxPhysicalLogicalCalls:10,maxHttpAttemptsPerEpoch:10,
  changedVariable:"COUNTS_ONLY_FORMULATION_CONTRACT_AND_PRIVATE_EXACT_VALUE_OBSERVATION",
  diagnosticOnly:true,support:"OBSERVED_FAILURE_CLASSIFICATION_NOT_COGNITIVE_OR_DEFAULT_PROMOTION",
  limitations:["TWO_NEW_VALUES_IN_TWO_KNOWN_FORMAL_FAMILIES_NOT_OFFICIAL_BENCHMARK",
    "SAME_REASONING_ENABLED_MODEL_AND_NO_TOOLS_BOTH_ARMS","SHARED_FIRST_PROPOSAL_FULLY_CHARGED_BOTH_ARMS",
    "OBSERVERS_DO_NOT_CHANGE_COGNITIVE_REQUESTS_OR_VERIFICATION_FEEDBACK","FINITE_DIAGNOSTIC_LIMITS_NOT_PRIOR_EPOCH_REGRADING",
    "UNCHANGED_EXACT_CANONICAL_ACCEPTANCE_NONCANONICAL_EQUIVALENCE_DIAGNOSED_ONLY",
    "NO_RAW_EQUATIONS_ASSUMPTIONS_CERTIFICATES_OR_REFERENCE_VALUES_RETAINED","NO_COGNITIVE_OR_DEFAULT_PROMOTION"]});
/** Fresh transfer of the measured cardinality correction. Both arms spend one
 * existing repair call on public definitions; only their generation guidance
 * differs. Original accepted/failed cases and diagnostic limits stay frozen. */
export const FORMULATION_BOUNDS_CASES=immutableTheoryValue([
  task("INTERPOLATION","FORM-INTERPOLATION-1",{x0:"-16/13",x1:"19/11",x2:"37/9",y0:"53/29",y1:"-31/23",y2:"23/17",t:"17/14"}),
  task("PASSIVE_NETWORK","FORM-NETWORK-1",{g0:"37/23",g1:"41/29",g01:"23/18",i0:"-71/31",i1:"59/19"}),
  task("INTERPOLATION","FORM-INTERPOLATION-2",{x0:"-13",x1:"5",x2:"17",y0:"41",y1:"-19",y2:"29",t:"13/11"}),
  task("PASSIVE_NETWORK","FORM-NETWORK-2",{g0:"29",g1:"19",g01:"13",i0:"-67",i1:"43"})
]);
export const FORMULATION_BOUNDS_CORPUS_DIGEST=theoryDigest(FORMULATION_BOUNDS_CASES);
export const FORMULATION_BOUNDS_EPOCH=immutableTheoryValue({...DIRECT_REFORMULATION_EPOCH,version:"nyx-public-formulation-bounds/1",
  arms:["LEGACY_FORMULATION_GUIDANCE","BOUNDED_FORMULATION_GUIDANCE"],
  maxCallsPerStage:3,maxHttpAttemptsPerStage:3,maxLogicalCalls:24,maxPhysicalLogicalCalls:20,maxHttpAttemptsPerEpoch:20,
  changedVariable:"PUBLIC_FORMULATION_GENERATION_CARDINALITY_ASSUMPTION_AND_NONEMPTY_GUIDANCE_ONLY",
  formulationCallsBothArms:"ONCE_AFTER_REJECTION_WITHIN_EXISTING_TASK_BUDGET",boundedProfile:"nyx-public-formulation-generation/1",
  support:"FORMULATION_ADMISSION_AND_EXACT_CORRECTNESS_SEPARATE_REALIZED_COMPUTE_AND_REPLICATION_REQUIRED",
  limitations:["FOUR_NEW_PARAMETER_CASES_IN_TWO_KNOWN_FAMILIES_NOT_OFFICIAL_OR_CROSS_DOMAIN_BENCHMARK",
    "SAME_MODEL_REASONING_CALL_CAPS_TOOLS_NONE_AND_UNCHANGED_EXACT_ORACLE",
    "SHARED_FIRST_PROPOSAL_FULLY_CHARGED_BOTH_ARMS_OWN_SESSIONS_AND_TIME_LIMITS",
    "BOTH_ARMS_FORMULATE_ONCE_NO_FREE_EXTRA_MODEL_CALL",
    "STRUCTURALLY_ADMITTED_DEFINITIONS_ARE_NOT_MATHEMATICALLY_VERIFIED",
    "COUNTS_ONLY_OBSERVERS_SUPPLY_NO_PRIVATE_REFERENCE_OR_VERIFIER_FEEDBACK",
    "EXACT_CANONICAL_ACCEPTANCE_UNCHANGED_WITH_PRIVATE_AS_WRITTEN_VALUE_DIAGNOSIS",
    "REALIZED_WHOLE_AND_REPAIR_COMPUTE_MATCHING_MEASURED_NOT_ASSUMED",
    "INTERFACE_SIGNAL_NOT_COGNITIVE_DEFAULT_OR_RECURSIVE_PROMOTION"]});
function q(n: bigint, d = 1n): Q {
  if (!d) throw Error("procedure_oracle_division_by_zero");
  if (d < 0n) { n = -n; d = -d; }
  let a = n < 0n ? -n : n, b = d;
  while (b) { const r = a % b; a = b; b = r; }
  return [n / a, d / a];
}
const parse = (s: string): Q => { const [n, d = "1"] = s.split("/"); return q(BigInt(n), BigInt(d)); };
const plus = (a: Q, b: Q) => q(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
const minus = (a: Q, b: Q) => plus(a, [-b[0], b[1]]);
const times = (a: Q, b: Q) => q(a[0] * b[0], a[1] * b[1]);
const over = (a: Q, b: Q) => q(a[0] * b[1], a[1] * b[0]);
const show = (a: Q) => a[1] === 1n ? String(a[0]) : `${a[0]}/${a[1]}`;
function eliminate(matrix: Q[][], rhs: Q[]): Q[] {
  const m = matrix.map((row, i) => [...row, rhs[i]]), n = rhs.length;
  for (let col = 0; col < n; col++) {
    const pivot = m.findIndex((row, i) => i >= col && row[col][0] !== 0n);
    if (pivot < 0) throw Error("procedure_oracle_singular");
    [m[col], m[pivot]] = [m[pivot], m[col]];
    const scale = m[col][col]; m[col] = m[col].map(v => over(v, scale));
    for (let row = 0; row < n; row++) if (row !== col) {
      const factor = m[row][col]; m[row] = m[row].map((v, j) => minus(v, times(factor, m[col][j])));
    }
  }
  return m.map(row => row[n]);
}
export function expectedProcedureOutputs(task: ProcedureCase) {
  const c = Object.fromEntries(task.problem.constants.map(v => [v.id, parse(v.value)]));
  let values: Q[];
  if (task.family === "INTERPOLATION") {
    const [a, b, d] = eliminate([c.x0, c.x1, c.x2].map(x => [q(1n), x, times(x, x)]), [c.y0, c.y1, c.y2]);
    values = [plus(a, plus(times(b, c.t), times(d, times(c.t, c.t)))), plus(b, times(q(2n), times(d, c.t)))];
  } else {
    const [v0, v1] = eliminate([[plus(c.g0, c.g01), times(q(-1n), c.g01)], [times(q(-1n), c.g01), plus(c.g1, c.g01)]], [c.i0, c.i1]);
    // Energy identity I·V is independent of the requested branch-loss expression.
    values = [v0, v1, plus(times(c.i0, v0), times(c.i1, v1))];
  }
  return task.outputLabels.map((label, i) => ({ label, value: show(values[i]) }));
}
export function verifyProcedureOutputs(task: ProcedureCase, certificate: unknown) {
  const expected = expectedProcedureOutputs(task);
  let c: { outputs?: { label: string; value: string }[]; confidence?: number } | null = null;
  try { c = snapshotBoundedReasoningData(certificate) as typeof c; } catch { /* Reject before reading candidate accessors. */ }
  const shaped = c !== null && typeof c === "object" && !Array.isArray(c)
    && Object.keys(c).sort().join("\0") === "confidence\0outputs" && typeof c.confidence === "number"
    && c.confidence >= 0 && c.confidence <= 1 && Array.isArray(c.outputs) && c.outputs.length === expected.length
    && new Set(c.outputs.map(v => v?.label)).size === expected.length
    && c.outputs.every(v => v && typeof v === "object" && Object.keys(v).sort().join("\0") === "label\0value"
      && typeof v.label === "string" && typeof v.value === "string");
  const accepted = !!shaped && expected.every(v => c!.outputs!.some(o => o.label === v.label && o.value === v.value));
  return immutableTheoryValue({ accepted, findings: accepted ? [] : [shaped ? "EXACT_OBJECTIVE_MISMATCH" : "CERTIFICATE_SCHEMA_INVALID"],
    verificationDigest: theoryDigest({ task: theoryDigest(task), candidate: c, accepted, oracle: "independent-gaussian-elimination/1" }) });
}
export interface ProcedureCertificateDiagnosis {
  readonly version:"nyx-exact-output-diagnosis/1";readonly diagnosticOnly:true;
  readonly verdict:"EXACT_CANONICAL"|"EQUIVALENT_NONCANONICAL"|"AS_WRITTEN_NUMERIC_MISMATCH"|"UNCLASSIFIED_VALUE_TEXT"|"MALFORMED_CERTIFICATE";
  readonly expectedOutputs:number;readonly canonicalExactMatchCount:number;readonly equivalentNoncanonicalCount:number;
  readonly incorrectExactValueCount:number;readonly unclassifiedValueTextCount:number;readonly admissionChanged:false;
}
/** Exact cross-product comparison independent of the native arithmetic engine.
 * Finite decimals are classified as their AS-WRITTEN exact value, not an inferred
 * intended answer. Unsupported/oversized text remains unknown. No normalization
 * replaces the original certificate, and no numeric/reference value is returned. */
export function diagnoseProcedureCertificate(task:ProcedureCase,certificate:unknown):ProcedureCertificateDiagnosis {
  const expected=expectedProcedureOutputs(task);let owned:unknown;
  try{owned=snapshotBoundedReasoningData(certificate);}catch{owned=null;}
  const checked=verifyProcedureOutputs(task,owned);
  const base={version:"nyx-exact-output-diagnosis/1" as const,diagnosticOnly:true as const,expectedOutputs:expected.length,
    canonicalExactMatchCount:0,equivalentNoncanonicalCount:0,incorrectExactValueCount:0,unclassifiedValueTextCount:0,admissionChanged:false as const};
  if(checked.findings.includes("CERTIFICATE_SCHEMA_INVALID"))
    return immutableTheoryValue({...base,verdict:"MALFORMED_CERTIFICATE" as const});
  const proposal=owned as {outputs:{label:string;value:string}[]};
  if(!expected.every(e=>proposal.outputs.some(o=>o.label===e.label)))
    return immutableTheoryValue({...base,verdict:"MALFORMED_CERTIFICATE" as const});
  function exactText(s:string):readonly[bigint,bigint]|null {
    if(s.length>520)return null;const t=s.trim();
    const f=/^([+-]?\d{1,256})(?:\/([+-]?\d{1,256}))?$/.exec(t);
    if(f){const d=BigInt(f[2]??"1");return d===0n?null:[BigInt(f[1]),d];}
    const dec=/^([+-]?)(\d{1,256})\.(\d{1,256})$/.exec(t);
    return dec?[BigInt(dec[2]+dec[3])*(dec[1]==="-"?-1n:1n),10n**BigInt(dec[3].length)]:null;
  }
  const counts={...base};
  for(const e of expected){
    const value=proposal.outputs.find(o=>o.label===e.label)!.value;
    if(value===e.value){counts.canonicalExactMatchCount++;continue;}
    const a=exactText(value),b=exactText(e.value);
    if(!a||!b)counts.unclassifiedValueTextCount++;
    else if(a[0]*b[1]===b[0]*a[1])counts.equivalentNoncanonicalCount++;
    else counts.incorrectExactValueCount++;
  }
  const verdict=counts.canonicalExactMatchCount===expected.length?"EXACT_CANONICAL":counts.incorrectExactValueCount?
    "AS_WRITTEN_NUMERIC_MISMATCH":counts.unclassifiedValueTextCount?"UNCLASSIFIED_VALUE_TEXT":"EQUIVALENT_NONCANONICAL";
  return immutableTheoryValue({...counts,verdict});
}
