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
