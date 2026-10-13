import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { BoundedReasoningSession, snapshotBoundedReasoningData, type ReasoningProblem, type ColoringProblem, type ReachabilityProblem,
  type ExperimentSelectionProblem, type HypothesisEliminationProblem } from "../src/lib/codelab/research/boundedReasoningWorkbench";
import { theoryDigest } from "../src/lib/codelab/research/theoryContracts";
import { QUANTITATIVE_TASKS, expectedQuantities, referenceQuantitativeProgram, verifyQuantitativeSubmission } from "./omega/nyx-quantitative-transfer-fixtures";
import type { QuantitativeProblem, QuantitativeProgram } from "../src/lib/codelab/research/exactQuantitativeDerivation";
import { runNyxQuantitativeTask, quantitativeExchangeSchema,quantitativeOutputStructure,OBJECTIVE_OUTPUT_POLICY } from "../src/lib/codelab/research/nyxQuantitativeReasoning";
import { FRESH_QUANTITATIVE_TASKS,referenceFreshQuantitativeProgram,verifyFreshQuantitativeSubmission } from "./omega/nyx-quantitative-fresh-fixtures";
import { SLOT_TRANSFER_TASKS,referenceSlotTransferProgram,verifySlotTransferSubmission } from "./omega/nyx-quantitative-slot-transfer-fixtures";
import { EQUATION_TRANSFER_TASKS,verifyEquationTransferSubmission } from "./omega/nyx-quantitative-equation-transfer-fixtures";
import { COMPOSED_TRANSFER_TASKS,verifyComposedTransferSubmission } from "./omega/nyx-quantitative-composed-transfer-fixtures";
import { COMMAND_TRANSFER_TASKS,verifyCommandTransferSubmission } from "./omega/nyx-quantitative-command-transfer-fixtures";
import { equationNames,lowerQuantitativeEquations,type QuantitativeEquations } from "../src/lib/codelab/research/quantitativeEquationCompiler";
import { NvidiaNimProvider, type NvidiaNimCompletionRequest } from "../src/lib/codelab/model/nvidiaNimProvider";
import { BoundQuantitativeProcedure } from "../src/lib/codelab/research/quantitativeProcedureReuse";
import { PROCEDURE_FAMILIES, PROCEDURE_REUSE_EPOCH, NATIVE_GENERATION_CASES, NATIVE_GENERATION_EPOCH,
  EXPRESSION_TRANSFER_CASES,EXPRESSION_TRANSFER_EPOCH,REPAIR_CONTEXT_CASES,REPAIR_CONTEXT_EPOCH,DIRECT_NATIVE_CASES,DIRECT_NATIVE_EPOCH,
  DIRECT_REFORMULATION_CASES,DIRECT_REFORMULATION_EPOCH,DIRECT_REFORMULATION_CORPUS_DIGEST,
  QUANTITATIVE_DIAGNOSIS_CASES,QUANTITATIVE_DIAGNOSIS_EPOCH,QUANTITATIVE_DIAGNOSIS_CORPUS_DIGEST,
  FORMULATION_BOUNDS_CASES,FORMULATION_BOUNDS_EPOCH,FORMULATION_BOUNDS_CORPUS_DIGEST,
  expectedProcedureOutputs,verifyProcedureOutputs,type ProcedureCase } from "./omega/nyx-procedure-reuse-fixtures";
import { runProcedureReuseEpoch, publicRun } from "./omega/nyx-procedure-reuse-live-eval";
import { runNativeGenerationEpoch } from "./omega/nyx-native-generation-live-eval";
import {lowerQuantitativeExpressions,quantitativeExpressionSchema,type QuantitativeExpressionGraph} from "../src/lib/codelab/research/quantitativeExpressionCompiler";
import {lowerQuantitativeAlgebraicForm,quantitativeAlgebraicSchema,ALGEBRAIC_COMPILER_POLICY,ALGEBRAIC_EMISSION_POLICY,
  algebraicEmissionDiagnostic,type AlgebraicEmissionDiagnostic,type QuantitativeAlgebraicForm} from "../src/lib/codelab/research/quantitativeAlgebraicCompiler";
import {ALGEBRAIC_TRANSFER_CASES,ALGEBRAIC_TRANSFER_EPOCH,ALGEBRAIC_TRANSFER_CORPUS_DIGEST} from "./omega/nyx-procedure-reuse-fixtures";
import {ALGEBRAIC_EMISSION_CASES,ALGEBRAIC_EMISSION_EPOCH,ALGEBRAIC_EMISSION_CORPUS_DIGEST} from "./omega/nyx-procedure-reuse-fixtures";
import { createFrontierWorkbench, parseFrontierExchange, frontierExchangeSchema,
  materializeFrontierArtifact, frontierArtifactReviewPrompt } from "./omega/nyx-frontier-workbench";
import { graphPrompt, protocolPrompt, causalPlanPrompt, causalConclusionPrompt, executeCausalExperiments,
  verifyGraphSubmission, verifyProtocolSubmission, verifyCausalPlan, verifyCausalConclusion,
  FRONTIER_GRAPH_SCHEMA } from "./omega/nyx-frontier-reasoning-fixtures";

let passed = 0; let failed = 0;
function check(condition: unknown, label: string): void {
  if (condition) passed += 1; else { failed += 1; console.error(`x ${label}`); }
}
function throws(body: () => unknown): boolean { try { body(); return false; } catch { return true; } }
function solve(problem: ReasoningProblem, maximum = 50_000) {
  const session = BoundedReasoningSession.create(problem, { maxWorkUnits: maximum, maxElapsedMs: 2_000,
    maxRequests: 1, expiresAtEpochMs: Date.now() + 10_000 });
  const result = session.analyze({ schemaVersion: 1, operation: "ANALYZE_FINITE_PROBLEM", problemDigest: session.problemDigest });
  session.revoke(); return result;
}
const triangle: ColoringProblem = { kind: "COLORING", vertices: ["a", "b", "c"],
  edges: [["a", "b"], ["b", "c"], ["a", "c"]], colors: [1, 2, 3], cliqueSize: 3 };
const colored = solve(triangle);
check(colored.status === "CONSTRUCTED" && colored.payload!.clique instanceof Array,
  "constructive coloring returns an explicit clique, not a confidence vote");
check(solve({ ...triangle, colors: [1, 2] }).status === "EXHAUSTIVE_NO_WITNESS",
  "two-color triangle exhausts its declared finite domain");
check(solve(triangle, 1).status === "BUDGET_EXHAUSTED" && solve(triangle, 1).payload === null,
  "search exhaustion is not misrepresented as unsatisfiability");
check(colored.grantsAuthority === false && colored.acceptanceRequiresIndependentVerifier,
  "constructed results neither authorize execution nor self-certify");
const { resultDigest, ...digestBody } = colored;
check(resultDigest === theoryDigest(digestBody) && colored.inputDigest === theoryDigest(triangle),
  "tool evidence binds exact inputs, requests, output, and measured resources");
check(Object.isFrozen(colored.payload) && Object.isFrozen(colored.payload!.clique),
  "caller cannot mutate returned evidence in place");
const session = BoundedReasoningSession.create(triangle, { maxWorkUnits: 50_000, maxElapsedMs: 1_000,
  maxRequests: 1, expiresAtEpochMs: Date.now() + 10_000 });
const request = { schemaVersion: 1, operation: "ANALYZE_FINITE_PROBLEM", problemDigest: session.problemDigest };
check(throws(() => session.analyze({ ...request, problemDigest: "stale" })), "stale problem identity fails closed");
check(throws(() => session.analyze({ ...request, operation: "SHELL" })), "model text cannot request shell authority");
check(throws(() => session.analyze({ ...request, maxWorkUnits: 1_000_000 })), "request cannot widen a trusted budget");
session.analyze(request);
check(throws(() => session.analyze(request)), "replaying a consumed computation request fails closed");
session.revoke();
check(throws(() => session.analyze(request)), "revocation permanently ends the session");
let clock = 1_000;
const expiring = BoundedReasoningSession.create(triangle, { maxWorkUnits: 100, maxElapsedMs: 100,
  maxRequests: 1, expiresAtEpochMs: 1_001 }, () => clock);
clock = 1_001;
check(throws(() => expiring.analyze({ ...request, problemDigest: expiring.problemDigest })), "expired session cannot compute");
check(throws(() => solve({ ...triangle, edges: [["a", "missing"]] })), "unknown endpoints are rejected before search");
check(throws(() => solve({ ...triangle, edges: [["a", "b"], ["b", "a"]] })), "duplicate undirected edges are rejected");
check(throws(() => solve({ ...triangle, colors: [1, 1] })), "duplicate color domains are rejected");
check(throws(() => solve({ ...triangle, cliqueSize: 9 })), "unsupported witness cardinality is rejected");
const cyclic: Record<string, unknown> = { ...triangle }; cyclic.self = cyclic;
check(throws(() => solve(cyclic as unknown as ReasoningProblem)), "cyclic host inputs are rejected");
let getterRead = false;
const accessor = { ...triangle };
Object.defineProperty(accessor, "vertices", { enumerable: true, get() { getterRead = true; return triangle.vertices; } });
check(throws(() => solve(accessor)) && !getterRead, "accessors are rejected without executing caller code");
const mutatedInput = { ...triangle, vertices: [...triangle.vertices], edges: [...triangle.edges] };
const owned = BoundedReasoningSession.create(mutatedInput, { maxWorkUnits: 500, maxElapsedMs: 1_000,
  maxRequests: 1, expiresAtEpochMs: Date.now() + 10_000 });
mutatedInput.vertices[0] = "changed";
check(owned.problemDigest === theoryDigest(triangle) && owned.analyze({ ...request, problemDigest: owned.problemDigest }).status === "CONSTRUCTED",
  "trusted binding owns an immutable input snapshot rather than caller aliases");

const chain: ReachabilityProblem = { kind: "REACHABILITY", initialState: "s0", states: ["s0", "s1", "bad", "island"],
  unsafeStates: ["bad"], transitions: [{ from: "s0", to: "s1", action: "go" }, { from: "s1", to: "bad", action: "fail" },
    { from: "s1", to: "s0", action: "back" }] };
check(JSON.stringify(solve(chain).payload!.trace) === '["go","fail"]', "finite-state search constructs a shortest counterexample");
check((solve({ ...chain, unsafeStates: ["s0"] }).payload!.trace as unknown[]).length === 0,
  "initial-state violations have a zero-action counterexample");
check(solve({ ...chain, unsafeStates: ["island"] }).status === "EXHAUSTIVE_NO_WITNESS",
  "unreachable unsafe state does not falsify reachable safety");
check(solve(chain, 2).status === "BUDGET_EXHAUSTED", "state-search resource exhaustion remains unknown");
check(throws(() => solve({ ...chain, transitions: [{ from: "s0", to: "outside", action: "escape" }] })),
  "transition targets must remain inside the declared finite domain");

const predictions: ExperimentSelectionProblem = { kind: "EXPERIMENT_SELECTION", mechanismIds: ["u", "v", "w", "x"],
  experimentIds: ["p", "q", "r"], predictions: [{ mechanismId: "u", outcomes: ["0", "0", "a"] },
    { mechanismId: "v", outcomes: ["0", "1", "a"] }, { mechanismId: "w", outcomes: ["1", "0", "a"] },
    { mechanismId: "x", outcomes: ["1", "1", "a"] }] };
check(solve(predictions).payload!.minimumCardinality === 2, "experiment search proves minimal separating cardinality");
check(solve({ ...predictions, predictions: predictions.predictions.map((row) => ({ ...row, outcomes: ["0", "0", "0"] })) }).status === "EXHAUSTIVE_NO_WITNESS",
  "indistinguishable mechanisms remain nonidentifiable");
const inference: HypothesisEliminationProblem = { ...predictions, kind: "HYPOTHESIS_ELIMINATION",
  observations: [{ experimentId: "p", outcome: "1", evidenceRef: "obs:p" }] };
check(solve(inference).status === "INSUFFICIENT_EVIDENCE" && (solve(inference).payload!.survivors as string[]).length === 2,
  "ambiguous observations retain competing hypotheses");
check(solve({ ...inference, observations: [...inference.observations, { experimentId: "q", outcome: "0", evidenceRef: "obs:q" }] }).payload!.mechanismId === "w",
  "unique mechanism is selected only after discriminating observations");
check(solve({ ...inference, observations: [{ experimentId: "p", outcome: "impossible", evidenceRef: "obs:p" }] }).payload!.conflict === true,
  "observations contradicting every theory are preserved as conflict");
check(throws(() => solve({ ...inference, observations: [...inference.observations, ...inference.observations] })),
  "duplicate observations cannot manufacture independent evidence");

// Differential holdouts: distinct algorithms and oracles, no frozen gauntlet answers.
function random(seed: number): () => number { let value = seed; return () => {
  value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296;
}; }
function bruteColor(problem: ColoringProblem): boolean {
  const assignment = Array<number>(problem.vertices.length).fill(0);
  for (let mask = 0; mask < problem.colors.length ** assignment.length; mask += 1) {
    let rest = mask;
    for (let at = 0; at < assignment.length; at += 1) { assignment[at] = problem.colors[rest % problem.colors.length]; rest = Math.floor(rest / problem.colors.length); }
    if (problem.edges.every(([a, b]) => assignment[problem.vertices.indexOf(a)] !== assignment[problem.vertices.indexOf(b)])) return true;
  }
  return false;
}
function greedyColor(problem: ColoringProblem): boolean {
  const assigned = new Map<string, number>();
  for (const vertex of problem.vertices) {
    const neighbors = problem.edges.filter((edge) => edge.includes(vertex)).map(([a, b]) => a === vertex ? b : a);
    const color = problem.colors.find((candidate) => neighbors.every((neighbor) => assigned.get(neighbor) !== candidate));
    if (color === undefined) return false; assigned.set(vertex, color);
  }
  return true;
}
let constructed = 0; let satisfiable = 0; let baselineSolved = 0; let mismatches = 0;
for (let seed = 41001; seed < 41033; seed += 1) {
  const rng = random(seed); const vertices = Array.from({ length: 7 }, (_, at) => `v${at}`);
  const edges: [string, string][] = [];
  for (let a = 0; a < vertices.length; a += 1) for (let b = a + 1; b < vertices.length; b += 1)
    if (rng() < 0.34) edges.push([vertices[a], vertices[b]]);
  const problem: ColoringProblem = { kind: "COLORING", vertices, edges, colors: [1, 2, 3], cliqueSize: 1 };
  const expected = bruteColor(problem); const result = solve(problem); const accepted = result.status === "CONSTRUCTED";
  if (expected) satisfiable += 1; if (greedyColor(problem)) baselineSolved += 1; if (accepted) constructed += 1;
  if (accepted !== expected) mismatches += 1;
  if (accepted) {
    const assignments = result.payload!.coloring as Array<{ vertex: string; color: number }>;
    if (!edges.every(([a, b]) => assignments.find((entry) => entry.vertex === a)!.color !== assignments.find((entry) => entry.vertex === b)!.color)) mismatches += 1;
  }
}
check(mismatches === 0, "32 generated graph holdouts agree with independent brute-force existence and edge checking");
check(constructed === satisfiable && constructed > baselineSolved, "constraint propagation/backtracking solves more holdouts than fixed-order greedy search");
let reachabilityMismatches = 0;
for (let seed = 51001; seed < 51025; seed += 1) {
  const rng = random(seed); const states = Array.from({ length: 8 }, (_, at) => `s${at}`);
  const distance = states.map((_, a) => states.map((_, b) => a === b ? 0 : Infinity));
  const transitions: ReachabilityProblem["transitions"][number][] = [];
  for (let a = 0; a < 8; a += 1) for (let b = 0; b < 8; b += 1) if (a !== b && rng() < 0.18) {
    distance[a][b] = 1; transitions.push({ from: states[a], to: states[b], action: `${a}->${b}` });
  }
  for (let k = 0; k < 8; k += 1) for (let a = 0; a < 8; a += 1) for (let b = 0; b < 8; b += 1)
    distance[a][b] = Math.min(distance[a][b], distance[a][k] + distance[k][b]);
  const result = solve({ kind: "REACHABILITY", states, initialState: states[0], unsafeStates: [states[7]], transitions });
  if (Number.isFinite(distance[0][7]) ? result.status !== "CONSTRUCTED" || (result.payload!.trace as string[]).length !== distance[0][7]
    : result.status !== "EXHAUSTIVE_NO_WITNESS") reachabilityMismatches += 1;
}
check(reachabilityMismatches === 0, "24 directed graph holdouts agree with independent Floyd-Warshall shortest paths");
let selectionMismatches = 0;
for (let seed = 61001; seed < 61025; seed += 1) {
  const rng = random(seed); const outcomes = Array.from({ length: 6 }, () => Array.from({ length: 4 }, () => String(Math.floor(rng() * 3))));
  let expected = Infinity;
  for (let mask = 0; mask < 16; mask += 1) {
    const indices = [0, 1, 2, 3].filter((at) => mask & (1 << at));
    if (new Set(outcomes.map((row) => JSON.stringify(indices.map((at) => row[at])))).size === 6) expected = Math.min(expected, indices.length);
  }
  const result = solve({ kind: "EXPERIMENT_SELECTION", mechanismIds: outcomes.map((_, at) => `m${at}`),
    experimentIds: ["e0", "e1", "e2", "e3"], predictions: outcomes.map((row, at) => ({ mechanismId: `m${at}`, outcomes: row })) });
  if (Number.isFinite(expected) ? result.status !== "CONSTRUCTED" || result.payload!.minimumCardinality !== expected
    : result.status !== "EXHAUSTIVE_NO_WITNESS") selectionMismatches += 1;
}
check(selectionMismatches === 0, "24 experiment-table holdouts agree with independent bitmask cardinality oracle");

function tool(stage: string, prompt: Readonly<Record<string, unknown>>) {
  const adapter = createFrontierWorkbench(stage, prompt, Date.now() + 20_000);
  const descriptor = adapter.descriptor;
  const result = adapter.analyze({ schemaVersion: 1, operation: descriptor.operation, problemDigest: descriptor.problemDigest });
  adapter.revoke(); return result;
}
function candidate(result: Readonly<Record<string, unknown>>, decision: string): Record<string, unknown> {
  return { schemaVersion: 1, decision, ...(result.certificateFields as object), uncertainties: [], confidence: 0.8 };
}
check(verifyGraphSubmission(candidate(tool("FRONTIER_GRAPH", graphPrompt()), "SUBMIT")).accepted,
  "algorithmic graph construction passes the unchanged independent frozen certificate oracle");
check(verifyProtocolSubmission(candidate(tool("FRONTIER_PROTOCOL", protocolPrompt()), "SUBMIT")).accepted,
  "independently transcribed protocol construction passes original trace, minimality and safety oracles");
const selected = candidate(tool("FRONTIER_CAUSAL_PLAN", causalPlanPrompt()), "REQUEST_EXPERIMENTS");
check(verifyCausalPlan(selected).accepted, "experiment design passes unchanged forecast and minimality oracle");
const observations = executeCausalExperiments(selected.experimentIds as string[]);
check(verifyCausalConclusion(candidate(tool("FRONTIER_CAUSAL_CONCLUSION", causalConclusionPrompt(observations)), "SELECT_MECHANISM"), observations).accepted,
  "causal conclusion uses only admitted observation references and passes the unchanged oracle");
check(throws(() => parseFrontierExchange({ action: "REQUEST_ANALYSIS", analysisRequest: request, certificate: null }, false)),
  "baseline cannot gain a tool through text requesting it");
check(throws(() => parseFrontierExchange({ action: "REQUEST_ANALYSIS", analysisRequest: request, certificate: { decision: "SUBMIT" } }, true)),
  "tool and certificate payloads cannot be ambiguously combined");
check(throws(() => parseFrontierExchange({ action: "SHELL", analysisRequest: null, certificate: null }, true)),
  "unknown executable actions remain forbidden");
check(frontierExchangeSchema({}, false).properties.action.enum.length === 1,
  "baseline schema exposes only certificate submission");
const graphArtifact = tool("FRONTIER_GRAPH", graphPrompt());
const artifactRequest = { schemaVersion: 1, operation: "SUBMIT_ANALYSIS_ARTIFACT",
  problemDigest: graphArtifact.problemDigest, resultDigest: theoryDigest(graphArtifact), confidence: 0.75 };
check(verifyGraphSubmission(materializeFrontierArtifact(graphArtifact, FRONTIER_GRAPH_SCHEMA, artifactRequest)).accepted,
  "digest-bound native artifact survives independent verification without model source re-emission");
check(throws(() => materializeFrontierArtifact(graphArtifact, FRONTIER_GRAPH_SCHEMA,
  { ...artifactRequest, resultDigest: "forged" })), "forged analysis digest cannot substitute an artifact");
check(throws(() => materializeFrontierArtifact(graphArtifact, FRONTIER_GRAPH_SCHEMA,
  { ...artifactRequest, problemDigest: "another-task" })), "cross-task artifact reference fails closed");
check(throws(() => materializeFrontierArtifact(graphArtifact, FRONTIER_GRAPH_SCHEMA,
  { ...artifactRequest, confidence: 1.01 })), "model confidence cannot escape the unchanged certificate range");
check(throws(() => materializeFrontierArtifact(graphArtifact, FRONTIER_GRAPH_SCHEMA,
  { ...artifactRequest, certificateFields: {} })), "model reference cannot overwrite generated certificate fields");
check(throws(() => parseFrontierExchange({ action: "SUBMIT_ANALYSIS_ARTIFACT", analysisRequest: artifactRequest,
  certificate: null }, false, false)), "baseline cannot acquire artifact submission through textual requests");
const deceptiveArtifact = { ...graphArtifact, certificateFields: { coloring: [], clique: [] } };
const deceptiveCandidate = materializeFrontierArtifact(deceptiveArtifact, FRONTIER_GRAPH_SCHEMA,
  { ...artifactRequest, resultDigest: theoryDigest(deceptiveArtifact) });
check(!verifyGraphSubmission(deceptiveCandidate).accepted,
  "validly bound but incorrect tool artifact is still rejected by the original independent oracle");
const reviewSchema = frontierExchangeSchema(FRONTIER_GRAPH_SCHEMA, false, true);
check(reviewSchema.properties.action.enum.join(",") === "SUBMIT_ANALYSIS_ARTIFACT,DECLINE_ANALYSIS_ARTIFACT"
  && reviewSchema.properties.certificate.type === "null",
  "constructed-artifact review exposes no certificate regeneration path");
check(parseFrontierExchange({ action: "DECLINE_ANALYSIS_ARTIFACT", analysisRequest: null,
  certificate: null }, false, true).action === "DECLINE_ANALYSIS_ARTIFACT",
  "model may decline a constructed artifact instead of being forced to submit");
check(throws(() => parseFrontierExchange({ action: "SUBMIT_CERTIFICATE", analysisRequest: null,
  certificate: deceptiveCandidate }, false, true)), "review phase cannot smuggle replacement certificate fields");
check(throws(() => parseFrontierExchange({ action: "DECLINE_ANALYSIS_ARTIFACT", analysisRequest: artifactRequest,
  certificate: null }, false, true)), "decline cannot also request artifact submission");
check(throws(() => parseFrontierExchange({ action: "DECLINE_ANALYSIS_ARTIFACT", analysisRequest: null,
  certificate: null }, false, false)), "baseline cannot invoke a nonexistent artifact-review capability");
const reviewPrompt = frontierArtifactReviewPrompt(graphPrompt(), graphArtifact, []);
check(reviewPrompt.phase === "REVIEW_CONSTRUCTED_ARTIFACT"
  && !Object.prototype.hasOwnProperty.call(reviewPrompt, "revisionInstruction")
  && (reviewPrompt.artifactReference as Record<string, unknown>).resultDigest === theoryDigest(graphArtifact),
  "review prompt binds the proposal without contradictory generation instructions");
const coreSource = readFileSync("src/lib/codelab/research/boundedReasoningWorkbench.ts", "utf8");
const adapterSource = readFileSync("scripts/omega/nyx-frontier-workbench.ts", "utf8");
check(!coreSource.includes("frontier-reasoning-fixtures") && !adapterSource.includes("referenceGraph")
  && !adapterSource.includes("CAUSAL_TARGET") && !adapterSource.includes("verifyProtocolSubmission"),
  "constructors cannot read verifier reference answers or hidden causal target");
console.log(`NYX_WORKBENCH_DIFFERENTIAL_EVIDENCE ${JSON.stringify({ graphTasks: 32, satisfiable,
  greedyBaselineSolved: baselineSolved, workbenchSolved: constructed, graphOracleMismatches: mismatches,
  stateTasks: 24, reachabilityMismatches, experimentTasks: 24, selectionMismatches,
  scope: "GENERATED_FINITE_TASKS_NOT_LIVE_MODEL_OR_FRONTIER_CERTIFICATION" })}`);
function calculation(problem: QuantitativeProblem, program: unknown, maximum = 100_000) {
  const session=BoundedReasoningSession.create(problem,{maxWorkUnits:maximum,maxElapsedMs:2000,maxRequests:1,expiresAtEpochMs:Date.now()+10000});
  try {return session.analyze({schemaVersion:1,operation:"ANALYZE_FINITE_PROBLEM",problemDigest:session.problemDigest,program});}
  finally {session.revoke();}
}
for(const task of QUANTITATIVE_TASKS) {
  const result=calculation(task.problem,referenceQuantitativeProgram(task));
  check(result.status==="CONSTRUCTED" && verifyQuantitativeSubmission(task,{outputs:result.payload!.outputs,confidence:1}).accepted,
    `exact ${task.taskId} computation agrees with independent domain oracle`);
  const outputs=expectedQuantities(task);
  check(!verifyQuantitativeSubmission(task,{outputs:outputs.map((o,i)=>i?o:{...o,value:"0"}),confidence:1}).accepted,
    `independent ${task.taskId} oracle rejects wrong arithmetic even at maximum confidence`);
  check(!verifyQuantitativeSubmission(task,{outputs:[...outputs,{...outputs[0]}],confidence:1}).accepted,
    `independent ${task.taskId} oracle rejects duplicate or extra outputs`);
  check(calculation(task.problem,referenceQuantitativeProgram(task),1).status==="BUDGET_EXHAUSTED",
    `exact ${task.taskId} exhaustion is not accepted partial arithmetic`);
}
const numerical:QuantitativeProblem={kind:"EXACT_QUANTITATIVE_DERIVATION",constants:[{id:"a",value:"2"},{id:"b",value:"3"},{id:"zero",value:"0"}]};
const basic:QuantitativeProgram={schemaVersion:1,registers:[{id:"x",source:"a"},{id:"y",source:"b"}],blocks:[
  {iterations:1,mode:"SIMULTANEOUS",steps:[{target:"x",op:"ADD",left:"x",right:"y"},{target:"y",op:"SUB",left:"x",right:"y"}]}],
  outputs:[{label:"x",source:"x"},{label:"y",source:"y"}]};
check(JSON.stringify(calculation(numerical,basic).payload!.outputs)==='[{"label":"x","value":"5"},{"label":"y","value":"-1"}]',
  "simultaneous derivation preserves pre-update operands");
check(JSON.stringify(calculation(numerical,{...basic,blocks:[{...basic.blocks[0],mode:"SEQUENTIAL"}]}).payload!.outputs)
  ==='[{"label":"x","value":"5"},{"label":"y","value":"2"}]',"sequential derivation reads updated operands");
for(const op of ["ADD","SUB","MUL","DIV","MIN","MAX"] as const) for(let a=-4;a<=4;a++) for(let b=-3;b<=3;b++) {
  if(op==="DIV" && b===0) continue;
  const p:QuantitativeProblem={kind:"EXACT_QUANTITATIVE_DERIVATION",constants:[{id:"a",value:String(a)},{id:"b",value:String(b)}]};
  const program={...basic,registers:[{id:"x",source:"a"}],blocks:[{iterations:1,mode:"SEQUENTIAL",steps:[{target:"x",op,left:"a",right:"b"}]}],outputs:[{label:"x",source:"x"}]};
  const value=((calculation(p,program).payload!.outputs as {value:string}[])[0].value).split("/").map(Number);
  const expected=op==="ADD"?a+b:op==="SUB"?a-b:op==="MUL"?a*b:op==="DIV"?a/b:op==="MIN"?Math.min(a,b):Math.max(a,b);
  check(Math.abs(value[0]/(value[1]??1)-expected)<1e-12,`exact ${op} agrees with separate small-domain arithmetic ${a},${b}`);
}
const invalidPrograms:unknown[]=[{...basic,shell:"echo"},{...basic,schemaVersion:2},{...basic,registers:[{id:"a",source:"b"}]},
  {...basic,registers:[{id:"x",source:"not_authorized"}]},{...basic,outputs:[{label:"x",source:"outside"}]},
  {...basic,blocks:[{...basic.blocks[0],iterations:1025}]},{...basic,blocks:[{...basic.blocks[0],iterations:-1}]},
  {...basic,blocks:[{...basic.blocks[0],mode:"PARALLEL"}]},
  {...basic,blocks:[{...basic.blocks[0],steps:[{target:"a",op:"ADD",left:"a",right:"b"}]}]},
  {...basic,blocks:[{...basic.blocks[0],steps:[...basic.blocks[0].steps,basic.blocks[0].steps[0]]}]},
  {...basic,blocks:[{...basic.blocks[0],steps:[{target:"x",op:"EVAL",left:"a",right:"b"}]}]},
  {...basic,outputs:[basic.outputs[0],basic.outputs[0]]}];
for(const [at,program] of invalidPrograms.entries()) check(throws(()=>calculation(numerical,program)),`invalid quantitative authority/program ${at} fails closed`);
let programGetter=false;
const hostProgram={...basic};Object.defineProperty(hostProgram,"blocks",{enumerable:true,get(){programGetter=true;return basic.blocks;}});
check(throws(()=>calculation(numerical,hostProgram))&&!programGetter,"model-authored IR accessors are rejected without execution");
check(throws(()=>calculation({...numerical,constants:[{id:"a",value:"1/0"}]},basic)),"zero-denominator constant rejected before arithmetic");
const divided=calculation(numerical,{...basic,blocks:[{iterations:1,mode:"SEQUENTIAL",steps:[{target:"x",op:"DIV",left:"a",right:"zero"}]}]});
check(divided.status==="INSUFFICIENT_EVIDENCE" && divided.payload!.errorCode==="DIVISION_BY_ZERO" && divided.payload!.outputs===null,
  "mathematical domain failure produces no partially successful certificate");
const expanded=calculation(numerical,{...basic,blocks:[{iterations:16,mode:"SEQUENTIAL",steps:[{target:"x",op:"MUL",left:"x",right:"x"}]}]});
check(expanded.status==="INSUFFICIENT_EVIDENCE" && expanded.payload!.errorCode==="INTEGER_BOUND_EXCEEDED",
  "finite repeated squaring cannot allocate unbounded integers");
const boundCalculation=BoundedReasoningSession.create(numerical,{maxWorkUnits:1000,maxElapsedMs:1000,maxRequests:1,expiresAtEpochMs:Date.now()+10000});
const numericRequest={schemaVersion:1,operation:"ANALYZE_FINITE_PROBLEM",problemDigest:boundCalculation.problemDigest,program:basic};
for(const bad of [{...numericRequest,problemDigest:"stale"},{...numericRequest,operation:"SHELL"},
  {...numericRequest,constants:[{id:"replacement",value:"1"}]},{...numericRequest,maxWorkUnits:1000000}])
  check(throws(()=>boundCalculation.analyze(bad)),"quantitative intent cannot replace scope, operation or trusted budget");
boundCalculation.analyze(numericRequest);
check(throws(()=>boundCalculation.analyze(numericRequest)),"quantitative requests consume the same nonrenewable session limit");
boundCalculation.revoke();
check(throws(()=>boundCalculation.analyze(numericRequest)),"quantitative revocation does not leave a hidden computation capability");
for(let seed=1;seed<=48;seed++) {
  const a=seed%7-3;const b=seed%5+1;const cycles=seed%4+1;
  const dynamic:QuantitativeProblem={kind:"EXACT_QUANTITATIVE_DERIVATION",constants:[{id:"a",value:String(a)},{id:"b",value:String(b)}]};
  for(const mode of ["SEQUENTIAL","SIMULTANEOUS"] as const) {
    const candidateProgram={...basic,blocks:[{...basic.blocks[0],iterations:cycles,mode}]};
    let x=a;let y=b;
    for(let iteration=0;iteration<cycles;iteration++){const previousX=x;const previousY=y;x=previousX+previousY;y=(mode==="SIMULTANEOUS"?previousX:x)-previousY;}
    check(JSON.stringify(calculation(dynamic,candidateProgram).payload!.outputs)===JSON.stringify([{label:"x",value:String(x)},{label:"y",value:String(y)}]),
      `independent direct recurrence agrees across fresh integer inputs ${seed},${mode}`);
  }
}
const wrongMix=referenceQuantitativeProgram(QUANTITATIVE_TASKS[0]);
const wrongCalculation=calculation(QUANTITATIVE_TASKS[0].problem,{...wrongMix,blocks:[{...wrongMix.blocks[0],steps:[
  ...wrongMix.blocks[0].steps.filter(step=>step.target!=="d"),wrongMix.blocks[0].steps.find(step=>step.target==="d")!]}]});
check(!verifyQuantitativeSubmission(QUANTITATIVE_TASKS[0],{outputs:wrongCalculation.payload!.outputs,confidence:1}).accepted,
  "exact arithmetic cannot launder an incorrect state-update model through independent acceptance");
check(!readFileSync("src/lib/codelab/research/exactQuantitativeDerivation.ts","utf8").includes("quantitative-transfer-fixtures"),
  "production arithmetic machinery cannot import frozen oracle answers");
const cognitionTask=QUANTITATIVE_TASKS[0];let cognitionCalls=0;let verifierCalls=0;
let oracleGetter=false;const maliciousOracleInput={outputs:expectedQuantities(cognitionTask)};
Object.defineProperty(maliciousOracleInput,"confidence",{enumerable:true,get(){oracleGetter=true;return 1;}});
check(!verifyQuantitativeSubmission(cognitionTask,maliciousOracleInput).accepted&&!oracleGetter,
  "independent quantitative detector cannot execute candidate accessors");
for(const malformed of [null,undefined,[],"text",new Date(),{outputs:expectedQuantities(cognitionTask),confidence:NaN}])
  check(!verifyQuantitativeSubmission(cognitionTask,malformed).accepted,"malformed quantitative certificate fails closed without oracle crash");
const cognition=NvidiaNimProvider.create({providerId:"TEST-QUANTITATIVE",model:"nvidia/nemotron-3-ultra-550b-a55b",authorityMode:"TEST_DOUBLE_ONLY",
  credentialSource:{read:()=>"test-only-non-secret",sourceIdentity:"DETERMINISTIC_TEST_DOUBLE"},maxPromptBytes:32000,maxOutputTokens:4096,timeoutMs:1000,
  transport:async(_url,init)=>{
    cognitionCalls++;const request=JSON.parse(String(init?.body));const prompt=JSON.parse(request.messages[1].content);
    const exchange=cognitionCalls===1?{action:"SHELL",analysisRequest:null,certificate:null}:cognitionCalls===2?
      {action:"REQUEST_ANALYSIS",analysisRequest:{schemaVersion:1,operation:"ANALYZE_FINITE_PROBLEM",problemDigest:prompt.availableTool.problemDigest,
        program:referenceQuantitativeProgram(cognitionTask)},certificate:null}:
      {action:"SUBMIT_ANALYSIS_ARTIFACT",analysisRequest:{...prompt.artifactReference,confidence:0.9},certificate:null};
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(exchange)},finish_reason:"stop"}],
      usage:{prompt_tokens:100,completion_tokens:50,total_tokens:150}}),{status:200,headers:{"Content-Type":"application/json"}});
  }});
const limits={maxCalls:4,maxOutputTokens:4096,maxTaskMs:10000,expiresAtEpochMs:Date.now()+20000,maxToolRequests:2,maxToolWorkUnits:100000,maxToolElapsedMs:2000};
let capturedCompletion: Awaited<ReturnType<typeof cognition.complete>>;
const liveComposition=await runNyxQuantitativeTask({...cognitionTask,arm:"REASONING_WITH_WORKBENCH",limits,
  complete:async request=>{capturedCompletion=await cognition.complete(request);return capturedCompletion;},
  verify:certificate=>{verifierCalls++;return verifyQuantitativeSubmission(cognitionTask,certificate);}});
check(liveComposition.accepted && cognitionCalls===3 && verifierCalls===1 && liveComposition.toolRequests===1,
  "NYX cognition independently requests existing Omega arithmetic then submits to external verifier");
check(liveComposition.attempts[0].outcome==="PROTOCOL_REJECTION" && !liveComposition.authorityIncrease,
  "unknown model shell output cannot acquire action authority, and remains correctable within finite budget");
check(liveComposition.attempts[1].outcome==="DERIVATION_RETURNED_NOT_ACCEPTED" && liveComposition.attempts[1].resultDigest!==null,
  "exact quantitative result carries evidence without being accepted by its generator");
const controlSchema=quantitativeExchangeSchema(cognitionTask.outputLabels,false,false,theoryDigest(cognitionTask.problem));
check(JSON.stringify(controlSchema.anyOf[0].properties.action)==='{"type":"string","enum":["SUBMIT"]}'
  && !JSON.stringify(controlSchema).includes("ANALYZE_FINITE_PROBLEM"),"control provider schema exposes only existing action rather than tempting unavailable tool use");
const boundedSchema=quantitativeExchangeSchema(["result"],true,false,"fixed",["zero","one","r0"]);
const generatedProgram=(boundedSchema.anyOf[1].properties.analysisRequest as {
  properties:{program:{properties:{initialState:{items:{properties:Record<"slot"|"source",{enum:readonly string[]}>}}}}}
}).properties.program;
check(!generatedProgram.properties.initialState.items.properties.slot.enum.includes("r0")
  &&generatedProgram.properties.initialState.items.properties.source.enum.includes("zero")
  &&!generatedProgram.properties.initialState.items.properties.source.enum.includes("0"),
  "guided finite slots cannot redeclare a constant or initialize from a nonexistent numeric source");
const exhaustedCalculation=BoundedReasoningSession.create(numerical,{maxWorkUnits:1,maxElapsedMs:1000,maxRequests:2,expiresAtEpochMs:Date.now()+10000});
exhaustedCalculation.analyze({...numericRequest,problemDigest:exhaustedCalculation.problemDigest});
check(exhaustedCalculation.descriptor().available===false&&exhaustedCalculation.descriptor().remainingWorkUnits===0,
  "tool descriptor withdraws exhausted computation even when request-count budget remains");
exhaustedCalculation.revoke();
check(exhaustedCalculation.descriptor().available===false,"revoked numeric descriptor cannot advertise active authority");
for(const task of FRESH_QUANTITATIVE_TASKS) {
  const result=calculation(task.problem,referenceFreshQuantitativeProgram(task));
  check(verifyFreshQuantitativeSubmission(task,{outputs:result.payload!.outputs,confidence:1}).accepted,
    `unchanged exact engine transfers to unseen parameters for ${task.taskId}`);
}
for(const task of SLOT_TRANSFER_TASKS) {
  const result=calculation(task.problem,referenceSlotTransferProgram(task));
  check(verifySlotTransferSubmission(task,{outputs:result.payload!.outputs,confidence:1}).accepted,
    `same native semantics and oracle transfer to third unseen numeric population ${task.taskId}`);
}
// Independent equation-semantic checks, not merely round-tripping compiler output.
const phaseProblem:QuantitativeProblem={kind:"EXACT_QUANTITATIVE_DERIVATION",constants:[
  {id:"zero",value:"0"},{id:"a",value:"2"},{id:"b",value:"3"},{id:"one",value:"1"}]};
const swap:QuantitativeEquations={schemaVersion:2,initialState:[{slot:"r0",source:"a"},{slot:"r1",source:"b"}],
  cycles:[{iterations:1,phases:[{expressions:[],updates:[{slot:"r0",source:"r1"},{slot:"r1",source:"r0"}]}]}],
  outputs:[{label:"x",source:"r0"},{label:"y",source:"r1"},{label:"zeroState",source:"r15"}]};
const equationSession=BoundedReasoningSession.create(phaseProblem,{maxWorkUnits:50000,maxElapsedMs:2000,maxRequests:1,expiresAtEpochMs:Date.now()+10000});
const equationResult=equationSession.analyze({schemaVersion:1,operation:"ANALYZE_FINITE_PROBLEM",problemDigest:equationSession.problemDigest,program:swap});
check(JSON.stringify(equationResult.payload!.outputs)==='[{"label":"x","value":"3"},{"label":"y","value":"2"},{"label":"zeroState","value":"0"}]',
  "atomic state-to-state updates snapshot their sources, rather than sequentially corrupting a swap");
check(equationResult.workUnits>lowerQuantitativeEquations(phaseProblem,swap).registers.length&&!(equationResult as {grantsAuthority:boolean}).grantsAuthority,
  "lowering consumes the same work budget without granting action or acceptance authority");
equationSession.revoke();
for(let a=-4;a<=4;a++)for(let b=-3;b<=3;b++)for(const ordered of [false,true]) {
  const problem={...phaseProblem,constants:phaseProblem.constants.map(c=>({...c,value:c.id==="a"?String(a):c.id==="b"?String(b):c.value}))};
  const x={expressions:[{id:"e0",op:"ADD" as const,left:"r0",right:"r1"}],updates:[{slot:"r0",source:"e0"}]};
  const y={expressions:[{id:"e1",op:"SUB" as const,left:"r0",right:"r1"}],updates:[{slot:"r1",source:"e1"}]};
  const equations={...swap,cycles:[{iterations:3,phases:ordered?[x,y]:[{expressions:[...x.expressions,...y.expressions],updates:[...x.updates,...y.updates]}]}],
    outputs:swap.outputs.slice(0,2)};
  let expectedX=a,expectedY=b;
  for(let i=0;i<3;i++){const nextX=expectedX+expectedY;const nextY=(ordered?nextX:expectedX)-expectedY;expectedX=nextX;expectedY=nextY;}
  const result=calculation(problem,lowerQuantitativeEquations(problem,equations));
  check(JSON.stringify(result.payload!.outputs)===JSON.stringify([{label:"x",value:String(expectedX)},{label:"y",value:String(expectedY)}]),
    `equation lowering respects independently calculated ${ordered?"ordered":"simultaneous"} state semantics ${a}/${b}`);
}
function liftTestProgram(task:typeof cognitionTask,program:QuantitativeProgram):QuantitativeEquations {
  const {state,expressions}=equationNames(task.problem.constants.map(c=>c.id));
  const mapping=new Map(program.registers.map((r,i)=>[r.id,state[i]]));
  const source=(name:string)=>mapping.get(name)??name;
  const phase=(steps:QuantitativeProgram["blocks"][number]["steps"])=>({
    expressions:steps.map((s,i)=>({id:expressions[i],op:s.op,left:source(s.left),right:source(s.right)})),
    updates:steps.map((s,i)=>({slot:source(s.target),source:expressions[i]}))});
  return {schemaVersion:2,initialState:program.registers.map(r=>({slot:source(r.id),source:source(r.source)})),
    cycles:program.blocks.map(b=>({iterations:b.iterations,phases:b.mode==="SIMULTANEOUS"?[phase(b.steps)]:b.steps.map(s=>phase([s]))})),
    outputs:program.outputs.map(o=>({label:o.label,source:source(o.source)}))};
}
for(const [i,task] of EQUATION_TRANSFER_TASKS.entries()) {
  const reference=referenceSlotTransferProgram({...task,taskId:SLOT_TRANSFER_TASKS[i].taskId});
  const lowered=lowerQuantitativeEquations(task.problem,liftTestProgram(task,reference));
  check(verifyEquationTransferSubmission(task,{outputs:calculation(task.problem,lowered).payload!.outputs,confidence:1}).accepted,
    `same independent domain oracle verifies equation lowering on fourth frozen population ${task.taskId}`);
}
for(const invalid of [
  {...swap,schemaVersion:3},
  {...swap,initialState:[{slot:"outside",source:"a"}]},
  {...swap,cycles:[{iterations:1025,phases:swap.cycles[0].phases}]},
  {...swap,cycles:[{iterations:1,phases:Array(9).fill(swap.cycles[0].phases[0])}]},
  {...swap,cycles:[{iterations:1,phases:[{expressions:[{id:"e0",op:"ADD",left:"e1",right:"one"}],updates:[{slot:"r0",source:"e0"}]}]}]},
  {...swap,cycles:[{iterations:1,phases:[{expressions:[{id:"e0",op:"SHELL",left:"r0",right:"one"}],updates:[{slot:"r0",source:"e0"}]}]}]},
  {...swap,cycles:[{iterations:1,phases:[{expressions:[],updates:[{slot:"r0",source:"r1"},{slot:"r0",source:"r0"}]}]}]},
  {...swap,outputs:[{label:"bad",source:"e0"}]}
])check(throws(()=>lowerQuantitativeEquations(phaseProblem,invalid)),"equation compiler rejects malformed scope, cycles, authority, and update identity");
check(throws(()=>lowerQuantitativeEquations({...phaseProblem,constants:phaseProblem.constants.filter(c=>c.id!=="zero")},swap)),
  "compiler requires an observed zero constant rather than silently expanding the bound problem");
const equationGetterSession=BoundedReasoningSession.create(phaseProblem,{maxWorkUnits:1,maxElapsedMs:1000,maxRequests:1,expiresAtEpochMs:Date.now()+10000});
let equationGetterRead=false;
const getterEquations={...swap};Object.defineProperty(getterEquations,"initialState",{enumerable:true,get(){equationGetterRead=true;return swap.initialState;}});
check(throws(()=>equationGetterSession.analyze({schemaVersion:1,operation:"ANALYZE_FINITE_PROBLEM",problemDigest:equationGetterSession.problemDigest,program:getterEquations}))
  &&!equationGetterRead,"equation authority entry rejects accessors before the compiler can read them");
const compilerBudget=equationGetterSession.analyze({schemaVersion:1,operation:"ANALYZE_FINITE_PROBLEM",problemDigest:equationGetterSession.problemDigest,program:swap});
check(compilerBudget.status==="BUDGET_EXHAUSTED"&&compilerBudget.workUnits===1&&compilerBudget.payload===null,
  "a one-unit budget cannot hide lowering cost or return a partial accepted result");
equationGetterSession.revoke();
let pascal:bigint[]=[1n];
for(let n=0;n<=30;n++) {
  if(n>0)pascal=Array.from({length:n+1},(_,k)=>(pascal[k-1]??0n)+(pascal[k]??0n));
  for(let k=0;k<=n+2;k++) {
    const problem:QuantitativeProblem={kind:"EXACT_QUANTITATIVE_DERIVATION",constants:[{id:"zero",value:"0"},{id:"n",value:String(n)},{id:"k",value:String(k)}]};
    const program:QuantitativeProgram={schemaVersion:1,registers:[{id:"result",source:"zero"}],
      blocks:[{iterations:1,mode:"SEQUENTIAL",steps:[{target:"result",op:"BINOMIAL",left:"n",right:"k"}]}],outputs:[{label:"result",source:"result"}]};
    check(calculation(problem,program).payload!.outputs[0].value===String(pascal[k]??0n),
      `multiplicative exact binomial matches independent additive Pascal oracle ${n}/${k}`);
  }
}
for(const [n,k] of [["-1","0"],["5/2","1"],["4096","2048"]]) {
  const problem:QuantitativeProblem={kind:"EXACT_QUANTITATIVE_DERIVATION",constants:[{id:"zero",value:"0"},{id:"n",value:n},{id:"k",value:k}]};
  const result=calculation(problem,{schemaVersion:1,registers:[{id:"result",source:"zero"}],
    blocks:[{iterations:1,mode:"SEQUENTIAL",steps:[{target:"result",op:"BINOMIAL",left:"n",right:"k"}]}],outputs:[{label:"result",source:"result"}]});
  check(result.status==="INSUFFICIENT_EVIDENCE"&&result.payload!.outputs===null,"binomial domain and iteration bounds fail closed without partial output");
}
for(const [i,task] of COMPOSED_TRANSFER_TASKS.entries()) {
  const reference=referenceSlotTransferProgram({...task,taskId:SLOT_TRANSFER_TASKS[i].taskId});
  const lowered=lowerQuantitativeEquations(task.problem,liftTestProgram(task,reference));
  check(verifyComposedTransferSubmission(task,{outputs:calculation(task.problem,lowered).payload!.outputs,confidence:1}).accepted,
    `unweakened domain oracle covers fifth frozen population ${task.taskId}`);
}
const compoundRequest={action:"SUBMIT_DERIVATION",analysisRequest:{problemDigest:theoryDigest(cognitionTask.problem),
  program:liftTestProgram(cognitionTask,referenceQuantitativeProgram(cognitionTask))},certificate:{confidence:0.9}};
// Validate the GENERATION schema using an independent JSON-Schema implementation already
// pinned in the repository's frozen dependency graph, not a copy of the local action parser.
const require=createRequire(import.meta.url);const Ajv=require("ajv");
const schemaArtifactRequest={schemaVersion:1,operation:"SUBMIT_ANALYSIS_ARTIFACT",problemDigest:theoryDigest(cognitionTask.problem),
  resultDigest:theoryDigest({artifact:"schema-adversary"}),confidence:0.9};
const fullCertificate={outputs:expectedQuantities(cognitionTask),confidence:0.9};
for(const tool of [false,true])for(const artifact of [false,true]) {
  const admits=new Ajv().compile(quantitativeExchangeSchema(cognitionTask.outputLabels,tool,artifact,theoryDigest(cognitionTask.problem),
    cognitionTask.problem.constants.map(c=>c.id),schemaArtifactRequest.resultDigest));
  for(const action of ["SUBMIT","SUBMIT_DERIVATION","SUBMIT_ANALYSIS_ARTIFACT","DECLINE_ANALYSIS_ARTIFACT"])
    for(const [analysisIndex,analysisRequest] of [null,compoundRequest.analysisRequest,schemaArtifactRequest].entries())
      for(const [certificateIndex,certificate] of [null,compoundRequest.certificate,fullCertificate].entries()) {
        const expected=action==="SUBMIT"&&analysisIndex===0&&certificateIndex===2
          ||action==="SUBMIT_DERIVATION"&&tool&&analysisIndex===1&&certificateIndex===1
          ||action==="SUBMIT_ANALYSIS_ARTIFACT"&&artifact&&analysisIndex===2&&certificateIndex===0
          ||action==="DECLINE_ANALYSIS_ARTIFACT"&&artifact&&analysisIndex===0&&certificateIndex===0;
        check(admits({action,analysisRequest,certificate})===expected,`tagged guided schema admits only coherent available intents ${tool}/${artifact}/${action}/${analysisIndex}/${certificateIndex}`);
      }
  for(const illegal of [{...compoundRequest,action:"SHELL"},{...compoundRequest,analysisRequest:{...compoundRequest.analysisRequest,operation:"ANALYZE_FINITE_PROBLEM"}},
    {...compoundRequest,certificate:{confidence:0.9,outputs:[]}}, {...compoundRequest,additionalAuthority:true}])
    check(!admits(illegal),"guided schema excludes unknown authority and mixed envelope fields without weakening the executor");
}
console.log(`NYX_QUANTITATIVE_SCHEMA_VALIDATOR ajv=${require("ajv/package.json").version}`);
const compound=await runNyxQuantitativeTask({...cognitionTask,arm:"REASONING_WITH_WORKBENCH",limits:{...limits,maxCalls:1},
  complete:async()=>({...capturedCompletion,content:JSON.stringify(compoundRequest)}),verify:certificate=>verifyQuantitativeSubmission(cognitionTask,certificate)});
check(compound.accepted&&compound.calls===1&&compound.toolRequests===1&&compound.attempts[0].executedProgram!==null,
  "explicit compound intent computes, preserves action evidence, and invokes the SAME external oracle without an acknowledgement model call");
check(compound.attempts[0].computation?.inputDigest===theoryDigest(cognitionTask.problem)
  &&compound.attempts[0].computation?.requestDigest===theoryDigest({schemaVersion:1,operation:"ANALYZE_FINITE_PROBLEM",...compoundRequest.analysisRequest})
  &&compound.attempts[0].computation?.acceptanceRequiresIndependentVerifier===true,
  "model intent and fixed native envelope retain distinct attributable identities, without automatic acceptance");
const malformedCompound=await runNyxQuantitativeTask({...cognitionTask,arm:"REASONING_WITH_WORKBENCH",limits:{...limits,maxCalls:1},
  complete:async()=>({...capturedCompletion,content:JSON.stringify({...compoundRequest,analysisRequest:{...compoundRequest.analysisRequest,schemaVersion:2}})}),
  verify:()=>{throw Error("malformed_compound_cannot_reach_oracle");}});
check(malformedCompound.outcome==="PROTOCOL_REJECTION"&&malformedCompound.toolRequests===0,
  "adapter refuses extra compound fields instead of silently fixing an unauthorized model request");
for(const certificate of [null,fullCertificate,{confidence:1.01},{confidence:"0.9"},{confidence:0.9,extra:true}]) {
  const result=await runNyxQuantitativeTask({...cognitionTask,arm:"REASONING_WITH_WORKBENCH",limits:{...limits,maxCalls:1},
    complete:async()=>({...capturedCompletion,content:JSON.stringify({...compoundRequest,certificate})}),
    verify:()=>{throw Error("malformed_confidence_cannot_reach_oracle");}});
  check(result.outcome==="PROTOCOL_REJECTION"&&result.toolRequests===0
    &&result.attempts[0].findings[0]==="DERIVATION_CERTIFICATE_REQUIRES_ONLY_FINITE_CONFIDENCE_0_TO_1",
    "invalid envelope is explicitly diagnosed, not confused with expired/exhausted computation authority");
}
const mismatchedCompound=await runNyxQuantitativeTask({...cognitionTask,arm:"REASONING_WITH_WORKBENCH",limits:{...limits,maxCalls:1},
  complete:async()=>({...capturedCompletion,content:JSON.stringify({...compoundRequest,analysisRequest:{...compoundRequest.analysisRequest,problemDigest:"different-bound-scope"}})}),
  verify:()=>{throw Error("mismatched_scope_cannot_reach_oracle");}});
check(mismatchedCompound.toolRequests===0&&mismatchedCompound.attempts[0].findings[0]==="reasoning_request_invalid:PROBLEM_BINDING",
  "adapter-owned native header does not replace or excuse a model's mismatched scope");
for(const [i,task] of COMMAND_TRANSFER_TASKS.entries()) {
  const reference=referenceSlotTransferProgram({...task,taskId:SLOT_TRANSFER_TASKS[i].taskId});
  const lowered=lowerQuantitativeEquations(task.problem,liftTestProgram(task,reference));
  check(verifyCommandTransferSubmission(task,{outputs:calculation(task.problem,lowered).payload!.outputs,confidence:1}).accepted,
    `unchanged mathematical semantics pass the sixth population oracle ${task.taskId}`);
}
const sixthEvidence=JSON.parse(readFileSync("scripts/omega/checkpoints/quantitative-protocol-v6/comparison.json","utf8"));
check(sixthEvidence.candidate==="8ce9d8621b294ac392b31068e62f29c41b24582a"&&sixthEvidence.complete&&!sixthEvidence.providerStable
  &&sixthEvidence.summaries[2].accepted===3&&sixthEvidence.summaries[2].firstCallAccepted===2
  &&sixthEvidence.summaries[2].calls===8&&!sixthEvidence.broadPromotion&&sixthEvidence.matchedRealizedCompute===false
  &&theoryDigest(sixthEvidence)==="bca41318d024f0a678e6a6d1c7dd1ae04e102346683fc82e2cd5c644aa25491f",
  "sixth live pilot preserves narrower successes and control-arm disruption without invented compute matching or promotion");
for(const run of sixthEvidence.results.filter((r:{arm:string})=>r.arm==="REASONING_WITH_WORKBENCH")) {
  const task=COMMAND_TRANSFER_TASKS.find(t=>t.taskId===run.taskId)!;
  const replay=BoundedReasoningSession.create(task.problem,{maxWorkUnits:100000,maxElapsedMs:2000,maxRequests:2,expiresAtEpochMs:Date.now()+10000});
  try {
    for(const attempt of run.attempts.filter((a:{computation:unknown})=>a.computation!==null)) {
      const nativeRequest={schemaVersion:1,operation:"ANALYZE_FINITE_PROBLEM",problemDigest:theoryDigest(task.problem),program:attempt.executedProgram};
      const computed=replay.analyze(nativeRequest);
      const {resultDigest,...body}=attempt.computation;
      check(resultDigest===theoryDigest(body)&&computed.requestDigest===attempt.computation.requestDigest
        &&computed.workUnits===attempt.computation.workUnits&&computed.executedProgramDigest===attempt.computation.executedProgramDigest
        &&theoryDigest(computed.payload)===theoryDigest(attempt.computation.payload),
        `live model-authored mathematics replays its computation and custody ${task.taskId}/${attempt.call}`);
      const independent=verifyCommandTransferSubmission(task,{outputs:computed.payload!.outputs,confidence:attempt.confidence});
      check(independent.accepted===(attempt.outcome==="ACCEPTED")&&independent.verificationDigest===attempt.resultDigest,
        `independent domain oracle reproduces both acceptance AND falsification ${task.taskId}/${attempt.call}`);
    }
  } finally {replay.revoke();}
}
const fifthNegative=JSON.parse(readFileSync("scripts/omega/checkpoints/quantitative-protocol-v5/comparison.json","utf8"));
check(fifthNegative.candidate==="f87b9dd419321dae0f00fdc86c22d293e7ed965c"&&fifthNegative.complete
  &&fifthNegative.summaries[2].accepted===0&&fifthNegative.summaries[2].protocolOrAuthorizationFailures===15&&!fifthNegative.broadPromotion,
  "failed compound-contract experiment remains preserved as integration failure rather than an invented model capability result");
const deniedCompound=await runNyxQuantitativeTask({...cognitionTask,arm:"CURRENT_DIRECT",limits:{...limits,maxCalls:1},
  complete:async()=>({...capturedCompletion,content:JSON.stringify(compoundRequest)}),verify:()=>{throw Error("unavailable_action_cannot_reach_oracle");}});
check(!deniedCompound.accepted&&deniedCompound.toolRequests===0&&deniedCompound.outcome==="AUTHORIZATION_REJECTION",
  "compound intent does not grant unavailable computation to a control arm");
const rejectedCompound=await runNyxQuantitativeTask({...cognitionTask,arm:"REASONING_WITH_WORKBENCH",limits:{...limits,maxCalls:1},
  complete:async()=>({...capturedCompletion,content:JSON.stringify(compoundRequest)}),verify:()=>({accepted:false,findings:["ADVERSARIAL_ORACLE_REJECTED"],verificationDigest:"fixed-rejection"})});
check(!rejectedCompound.accepted&&rejectedCompound.outcome==="FUNCTIONAL_REJECTION"&&rejectedCompound.toolRequests===1,
  "a successfully executed derivation cannot overrule an independent rejection");
let verifierExceptionObserved=false;
try {await runNyxQuantitativeTask({...cognitionTask,arm:"REASONING_WITH_WORKBENCH",limits:{...limits,maxCalls:1},
  complete:async()=>({...capturedCompletion,content:JSON.stringify(compoundRequest)}),verify:()=>{throw Error("independent-verifier-unavailable");}});}
catch(error){verifierExceptionObserved=error instanceof Error&&error.message==="independent-verifier-unavailable";}
check(verifierExceptionObserved,"independent verifier failure cannot be caught and mislabeled as an authorization/model failure");
const fourthNegative=JSON.parse(readFileSync("scripts/omega/checkpoints/quantitative-protocol-v4/comparison.json","utf8"));
check(fourthNegative.candidate==="1ed7c07f12b79e9f004d06692e4ea38117e1cf8a"&&fourthNegative.complete&&fourthNegative.providerStable
  &&fourthNegative.summaries[2].accepted===3&&fourthNegative.summaries[2].protocolOrAuthorizationFailures===0&&!fourthNegative.broadPromotion
  &&theoryDigest(fourthNegative)==="25cc4908f7e5ab225a9b43d82121fa2d25d7a3376a9a5a14397696db4113c10a",
  "fourth experiment distinguishes solved interface failures from remaining mathematical and compute-efficiency failures");
const thirdNegative=JSON.parse(readFileSync("scripts/omega/checkpoints/quantitative-protocol-v3/comparison.json","utf8"));
check(thirdNegative.candidate==="aa90f8ccf473ba90a17164f4f68f2498f9c4aba0"&&thirdNegative.complete&&!thirdNegative.providerStable
  &&thirdNegative.summaries[2].accepted===2&&!thirdNegative.broadPromotion
  &&theoryDigest(thirdNegative)==="fa4bd7c9a2c0496ae3614890500edeef34d769269d5fdef371d6dd17dfcc23b3",
  "third experiment preserves the two correct outcomes AND provider disruption without selective promotion");
const secondNegative=JSON.parse(readFileSync("scripts/omega/checkpoints/quantitative-protocol-v2/comparison.json","utf8"));
check(secondNegative.complete&&secondNegative.providerStable&&secondNegative.summaries[2].accepted===1
  &&secondNegative.summaries[2].reportedTokens>secondNegative.summaries[1].reportedTokens&&!secondNegative.broadPromotion,
  "one accepted task at greater compute remains an unpromoted experiment, not a fabricated general cognitive gain");
check(secondNegative.candidate==="cdc4ba1bdd1933c3d01b1fbcb6f5b18c8525dbee"
  &&theoryDigest(secondNegative)==="498128bc5de3b36b9fde84ec57e52668486eee9f81cc0930b76e60bed8a246f6",
  "second live comparison retains its exact source candidate and immutable sanitized E4 report");
const preservedNegative=JSON.parse(readFileSync("scripts/omega/checkpoints/quantitative-protocol-v1/comparison.json","utf8"));
check(preservedNegative.complete&&preservedNegative.providerStable&&preservedNegative.results.length===12
  &&preservedNegative.summaries.every((s:{accepted:number})=>s.accepted===0),"first negative live protocol experiment preserved without rewriting its result");
check(preservedNegative.candidate==="c2a69187cea0280db2f3060326df50ba5e3f38d2"
  &&preservedNegative.matchedRealizedCompute===false&&!preservedNegative.broadPromotion,
  "failed quantitative comparison stays bound to actual candidate, with no broader capability promotion");
check(theoryDigest(preservedNegative)==="304945fdd03eae04dcf3416eb5998370232753d7af799bbfb8a43953d6c0de64","negative live report remains byte-semantically faithful to immutable E4 job logs");
for(const report of [preservedNegative,secondNegative,thirdNegative,fourthNegative,fifthNegative,sixthEvidence]) for(const [path,digest] of Object.entries(report.sourceDigests)) {
  if(typeof path!=="string"||path.includes("..")||!path.endsWith(".ts")||!path.startsWith("src/")&&!path.startsWith("scripts/"))
    throw Error("invalid_archived_source_path");
  check(theoryDigest(execFileSync("git",["show",`${report.candidate}:${path}`],{encoding:"utf8"}))===digest,
    `negative live evidence reconstructs its historical source identity ${path}`);
}
let controlToolUsed=false;
const deniedControl=await runNyxQuantitativeTask({...cognitionTask,arm:"REASONING_MEDIUM",limits:{...limits,maxCalls:1},
  complete:async()=>{
    controlToolUsed=true;
    return {...capturedCompletion,content:JSON.stringify({action:"REQUEST_ANALYSIS",analysisRequest:{schemaVersion:1,operation:"ANALYZE_FINITE_PROBLEM",
      problemDigest:theoryDigest(cognitionTask.problem),program:referenceQuantitativeProgram(cognitionTask)},certificate:null})};
  },verify:certificate=>verifyQuantitativeSubmission(cognitionTask,certificate)});
check(controlToolUsed&&!deniedControl.accepted&&deniedControl.toolRequests===0&&deniedControl.outcome==="AUTHORIZATION_REJECTION",
  "control reasoning cannot gain unavailable workbench authority by emitting a valid tool request");
let staleClock=1000;
const late=await runNyxQuantitativeTask({...cognitionTask,arm:"REASONING_WITH_WORKBENCH",now:()=>staleClock,
  limits:{...limits,maxCalls:1,expiresAtEpochMs:1002},complete:async()=>{
    staleClock=1002;
    return {...capturedCompletion,content:JSON.stringify({action:"SUBMIT",analysisRequest:null,certificate:{outputs:expectedQuantities(cognitionTask),confidence:1}})};
  },verify:()=>{throw Error("expired_model_cannot_invoke_verifier");}});
check(!late.accepted&&late.outcome==="LATE_RESPONSE_NOT_ADMITTED"&&late.toolRequests===0
  &&late.attempts[0].modelEvidence.usage.totalTokens===150,"late model response is unadmitted but spent compute remains accounted");
// Authored development witnesses only: never passed to live cognition or used as
// a fallback for failed tool synthesis. Oracle uses matrix elimination instead.
check(theoryDigest(expectedProcedureOutputs(PROCEDURE_FAMILIES[0].seed)) === theoryDigest([{label:"value",value:"-1"},{label:"slope",value:"10/3"}]),
  "interpolation oracle agrees with independently derived polynomial 4x^2/3-2x-7/3, not just native execution");
check(theoryDigest(expectedProcedureOutputs(PROCEDURE_FAMILIES[1].seed)) === theoryDigest([{label:"voltage0",value:"26/11"},{label:"voltage1",value:"1/11"},{label:"loss",value:"180/11"}]),
  "network oracle agrees with explicit conservation solution and energy identity");
function procedureWitness(task: ProcedureCase): QuantitativeProgram {
  const registers: { id: string; source: string }[] = [], steps: QuantitativeProgram["blocks"][number]["steps"][number][] = [];
  function op(id: string, operation: "ADD"|"SUB"|"MUL"|"DIV", left: string, right: string) {
    if (!registers.some(v => v.id === id)) registers.push({ id, source: "zero" });
    steps.push({ target: id, op: operation, left, right }); return id;
  }
  const outputs: { label: string; source: string }[] = [];
  if (task.family === "INTERPOLATION") {
    const twiceT = op("twiceT", "MUL", "two", "t");
    const terms: string[] = [], slopes: string[] = [];
    for (let i = 0; i < 3; i++) {
      const [j, k] = [0,1,2].filter(v => v !== i);
      const a = op(`a${i}`, "SUB", `x${i}`, `x${j}`), b = op(`b${i}`, "SUB", `x${i}`, `x${k}`);
      const den = op(`d${i}`, "MUL", a, b), weight = op(`w${i}`, "DIV", `y${i}`, den);
      const tj = op(`j${i}`, "SUB", "t", `x${j}`), tk = op(`k${i}`, "SUB", "t", `x${k}`);
      terms.push(op(`v${i}`, "MUL", weight, op(`a${i}`, "MUL", tj, tk)));
      slopes.push(op(`s${i}`, "MUL", weight, op(`b${i}`, "SUB", op(`b${i}`, "SUB", twiceT, `x${j}`), `x${k}`)));
    }
    // Reuse two existing registers; stay within the native 32-register bound.
    steps.push({ target: "v0", op: "ADD", left: terms[0], right: terms[1] }, { target: "v0", op: "ADD", left: "v0", right: terms[2] },
      { target: "s0", op: "ADD", left: slopes[0], right: slopes[1] }, { target: "s0", op: "ADD", left: "s0", right: slopes[2] });
    outputs.push({ label: "value", source: "v0" }, { label: "slope", source: "s0" });
  } else {
    const a = op("a", "ADD", "g0", "g01"), d = op("d", "ADD", "g1", "g01");
    const det = op("det", "SUB", op("ad", "MUL", a, d), op("cross", "MUL", "g01", "g01"));
    const v0 = op("v0", "DIV", op("num0", "ADD", op("id", "MUL", "i0", d), op("ki", "MUL", "g01", "i1")), det);
    const v1 = op("v1", "DIV", op("num1", "ADD", op("ia", "MUL", "i1", a), op("kj", "MUL", "g01", "i0")), det);
    const loss = op("loss", "ADD", op("iv0", "MUL", "i0", v0), op("iv1", "MUL", "i1", v1));
    outputs.push({ label: "voltage0", source: v0 }, { label: "voltage1", source: v1 }, { label: "loss", source: loss });
  }
  return { schemaVersion: 1, registers, blocks: [{ iterations: 1, mode: "SEQUENTIAL", steps }], outputs };
}
for (const task of [...PROCEDURE_FAMILIES.flatMap(f=>[f.seed,...f.fresh]),...NATIVE_GENERATION_CASES,...EXPRESSION_TRANSFER_CASES]) {
  const native = BoundedReasoningSession.create(task.problem, { maxWorkUnits: 100000, maxElapsedMs: 2000, maxRequests: 1, expiresAtEpochMs: Date.now()+10000 });
  const result = native.analyze({ schemaVersion: 1, operation: "ANALYZE_FINITE_PROBLEM", problemDigest: native.problemDigest, program: procedureWitness(task) });
  check(result.status === "CONSTRUCTED" && verifyProcedureOutputs(task, { outputs: result.payload!.outputs, confidence: 0.8 }).accepted,
    `independent elimination oracle agrees with a different authored derivation for ${task.taskId}`); native.revoke();
  check(!verifyProcedureOutputs(task, { outputs: expectedProcedureOutputs(task).map(v => ({ ...v, value: "0" })), confidence: 1 }).accepted,
    "wrong computed quantities cannot be accepted by confidence");
}
const sumTask = { objective: "Compute sum=x+y exactly.", problem: { kind: "EXACT_QUANTITATIVE_DERIVATION" as const,
  constants: [{ id: "zero", value: "0" }, { id: "x", value: "2" }, { id: "y", value: "3" }] }, outputLabels: ["sum"] };
const sumProgram: QuantitativeProgram = { schemaVersion: 1, registers: [{ id: "r", source: "zero" }],
  blocks: [{ iterations: 1, mode: "SEQUENTIAL", steps: [{ target: "r", op: "ADD", left: "x", right: "y" }] }], outputs: [{ label: "sum", source: "r" }] };
const procedureLimits = { maxWorkUnits: 100000, maxElapsedMs: 2000, maxRequests: 1, expiresAtEpochMs: Date.now()+120000 };
const sumCheck = (expected: string) => (certificate: unknown) => {
  const c = certificate as { outputs?: { label: string; value: string }[] };
  const accepted = c.outputs?.length === 1 && c.outputs[0].label === "sum" && c.outputs[0].value === expected;
  return { accepted: !!accepted, findings: accepted ? [] : ["EXACT_OBJECTIVE_MISMATCH"], verificationDigest: theoryDigest({ expected, certificate }) };
};
const admitSum = () => BoundQuantitativeProcedure.admit({ task: sumTask, program: sumProgram, parameterIds: ["x","y"],
  modelEvidenceDigest: theoryDigest("development-test-double"), limits: procedureLimits, verify: sumCheck("5") });
const admitted = admitSum(), bound = admitted.procedure!;
check(admitted.decision === "SEED_VALIDATED_TRANSFER_UNVERIFIED" && BoundQuantitativeProcedure.isOwned(bound) && admitted.result.workUnits > 0,
  "admission requires actual bounded native replay and independent seed acceptance, with charged work");
check(bound.descriptor().grantsAuthority === false && bound.descriptor().freshNativeLeaseRequired && bound.descriptor().independentVerificationRequired,
  "procedure minting is not a capability lease or semantic proof on transfer");
const freshSum = { ...sumTask, taskId: "PROC-SUM-FRESH", problem: { ...sumTask.problem,
  constants: [{ id: "zero", value: "0" }, { id: "x", value: "-9" }, { id: "y", value: "17" }] } };
check(bound.matches(freshSum) && bound.context(freshSum).program.schemaVersion === 1, "new parameter values preserve declared procedure applicability");
for (const task of [{ ...freshSum, objective: "Different objective" }, { ...freshSum, outputLabels: ["other"] },
  { ...freshSum, problem: { ...freshSum.problem, constants: [...freshSum.problem.constants, { id: "extra", value: "0" }] } },
  { ...freshSum, problem: { ...freshSum.problem, constants: freshSum.problem.constants.map(v => v.id === "zero" ? { ...v, value: "1" } : v) } },
  { ...freshSum, problem: { ...freshSum.problem, constants: [...freshSum.problem.constants, freshSum.problem.constants[0]] } }])
  check(!bound.matches(task), "changed objective, labels, constant names, fixed constants or invalid inputs withhold applicability");
let getterTriggered = false;
const getterTask = Object.defineProperty({}, "objective", { enumerable: true, get() { getterTriggered = true; return sumTask.objective; } });
check(!bound.matches(getterTask as typeof sumTask) && !getterTriggered, "applicability never executes candidate accessors");
const cycle: { self?: unknown } = {}; cycle.self = cycle;
for (const data of [getterTask, cycle, new Date(), { value: "x".repeat(128001) }, { value: NaN }, { [Symbol("hidden")]: 1 }])
  check(throws(() => snapshotBoundedReasoningData(data)), "cross-callback snapshots reject non-data, cyclic and oversized candidates");
const aliasTask = JSON.parse(JSON.stringify(sumTask)), aliasProgram = JSON.parse(JSON.stringify(sumProgram)), aliasParams = ["x","y"];
const snapshotAdmission = BoundQuantitativeProcedure.admit({ task: aliasTask, program: aliasProgram, parameterIds: aliasParams,
  modelEvidenceDigest: theoryDigest("owned-origin"), limits: procedureLimits, verify: c => {
    aliasTask.objective = "mutated"; aliasTask.problem.constants[0].value = "99"; aliasProgram.blocks[0].steps[0].op = "SUB"; aliasParams.pop();
    return sumCheck("5")(c);
  } });
check(snapshotAdmission.procedure!.matches(freshSum) && theoryDigest(snapshotAdmission.procedure!.context(freshSum).program) === theoryDigest(sumProgram),
  "trusted verification callback cannot mutate the retained artifact through input aliases");
check(BoundQuantitativeProcedure.admit({ task: sumTask, program: sumProgram, parameterIds: ["x"], modelEvidenceDigest: theoryDigest("seed"),
  limits: procedureLimits, verify: sumCheck("6") }).procedure === null, "wrong seed never mints a procedure");
check(throws(() => BoundQuantitativeProcedure.admit({ task: sumTask, program: sumProgram, parameterIds: ["missing"],
  modelEvidenceDigest: theoryDigest("seed"), limits: procedureLimits, verify: sumCheck("5") })), "unknown parameter declaration cannot mint an artifact");
check(throws(() => BoundQuantitativeProcedure.admit({ task: sumTask, program: sumProgram, parameterIds: ["x"],
  modelEvidenceDigest: theoryDigest("seed"), limits: procedureLimits, verify: () => { throw Error("oracle-unavailable"); } })), "seed oracle failures propagate instead of authorizing fallback");
const invocation = { problemDigest: theoryDigest(freshSum.problem), procedureId: bound.descriptor().procedureId };
for (const reference of [{ ...invocation, procedureId: "forged" }, { ...invocation, problemDigest: "stale" },
  { ...invocation, program: sumProgram }, null, getterTask])
  check(throws(() => bound.request(freshSum, reference, theoryDigest(freshSum.problem))), "unknown/stale/overridden/non-data invocation rejected before execution");
check(!getterTriggered, "invocation rejection never calls accessors");
check(!BoundQuantitativeProcedure.isOwned(JSON.parse(JSON.stringify(bound.descriptor())))
  && !BoundQuantitativeProcedure.isOwned(Object.create(BoundQuantitativeProcedure.prototype)), "serialized descriptor/prototype cannot mint process-local ownership");
const reuseLimits = { ...limits, maxCalls: 1, maxToolRequests: 1, expiresAtEpochMs: Date.now()+120000 };
const reuseInput = { ...freshSum, arm: "REASONING_WITH_WORKBENCH" as const, limits: reuseLimits, verify: sumCheck("8") };
const responseFor = (request: unknown) => ({ ...capturedCompletion, content: JSON.stringify(request) });
const procedureExchange = { action: "SUBMIT_PROCEDURE", analysisRequest: invocation, certificate: { confidence: 0.9 } };
let schemaOffersInvocation = false;
const reused = await runNyxQuantitativeTask({ ...reuseInput, procedure: { artifact: bound, mode: "BOUND_INVOCATION" }, complete: async request => {
  schemaOffersInvocation = JSON.stringify(request.responseFormat).includes("SUBMIT_PROCEDURE"); return responseFor(procedureExchange);
} });
check(reused.accepted && reused.calls === 1 && reused.toolRequests === 1 && schemaOffersInvocation
  && reused.attempts[0].procedureReference?.procedureId === bound.descriptor().procedureId && reused.attempts[0].computation?.status === "CONSTRUCTED",
  "model explicitly selects bound procedure; unchanged existing native lease executes fresh constants; independent oracle accepts");
const contextOnly = await runNyxQuantitativeTask({ ...reuseInput, procedure: { artifact: bound, mode: "CONTEXT_ONLY" }, complete: async request => {
  check(!JSON.stringify(request.responseFormat).includes("SUBMIT_PROCEDURE") && request.messages[1].content.includes("priorProcedureContext"),
    "context-only control offers public prior IR but no invocation action"); return responseFor(procedureExchange);
} });
check(!contextOnly.accepted && contextOnly.toolRequests === 0 && contextOnly.outcome === "AUTHORIZATION_REJECTION", "model cannot invent invocation in context-only arm");
const unsupported = await runNyxQuantitativeTask({ ...reuseInput, complete: async () => responseFor(procedureExchange) });
check(!unsupported.accepted && unsupported.toolRequests === 0, "default NYX gains no procedure authority from emitted text");
const exhaustedReuse = await runNyxQuantitativeTask({ ...reuseInput, limits: { ...reuseLimits, maxToolWorkUnits: 1 },
  procedure: { artifact: bound, mode: "BOUND_INVOCATION" }, complete: async () => responseFor(procedureExchange) });
check(!exhaustedReuse.accepted && exhaustedReuse.attempts[0].computation?.status === "BUDGET_EXHAUSTED",
  "procedure invocation cannot reset or enlarge the fresh session's arithmetic work budget");
const hardcoded = { ...sumProgram, blocks: [], registers: [{ id: "r", source: "y" }], outputs: [{ label: "sum", source: "x" }] };
const hardcodedSeed = { ...sumTask, problem: { ...sumTask.problem, constants: [{id:"zero",value:"0"},{id:"x",value:"5"},{id:"y",value:"0"}] } };
const seedOnly = BoundQuantitativeProcedure.admit({ task: hardcodedSeed, program: hardcoded, parameterIds: ["x","y"],
  limits: procedureLimits, modelEvidenceDigest: theoryDigest("hardcoded-test-double"), verify: sumCheck("5") }).procedure!;
const seedOnlyRun = await runNyxQuantitativeTask({ ...reuseInput, procedure: { artifact: seedOnly, mode: "BOUND_INVOCATION" },
  complete: async () => responseFor({ ...procedureExchange, analysisRequest: { ...invocation, procedureId: seedOnly.descriptor().procedureId } }) });
check(!seedOnlyRun.accepted && seedOnlyRun.outcome === "FUNCTIONAL_REJECTION" && seedOnlyRun.toolRequests === 1,
  "seed-passing but nongeneral procedure is independently refuted on fresh values, not silently certified");
bound.revoke();
check(!bound.matches(freshSum) && !bound.descriptor().available && throws(() => bound.request(freshSum, invocation, invocation.problemDigest)),
  "revocation removes applicability without granting replacement leases");
const revokedRun = await runNyxQuantitativeTask({ ...reuseInput, procedure: { artifact: bound, mode: "BOUND_INVOCATION" },
  complete: async request => { check(!JSON.stringify(request.responseFormat).includes("SUBMIT_PROCEDURE"), "revoked artifact withheld from model schema"); return responseFor(procedureExchange); } });
check(!revokedRun.accepted && revokedRun.toolRequests === 0, "revoked invocation fails closed in actual cognition protocol");
check(PROCEDURE_REUSE_EPOCH.maxPhysicalLogicalCalls === 28 && !PROCEDURE_REUSE_EPOCH.broadCognitionPromotion,
  "research protocol freezes finite calls and prohibits broad cognition promotion from two parameter-transfer families");
let procedureWireCalls = 0;
const procedureCognition = NvidiaNimProvider.create({ providerId: "TEST-PROCEDURE", model: PROCEDURE_REUSE_EPOCH.model,
  authorityMode: "TEST_DOUBLE_ONLY", credentialSource: { read: () => "test-only-non-secret", sourceIdentity: "DETERMINISTIC_TEST_DOUBLE" },
  maxPromptBytes: 32000, maxOutputTokens: 8192, timeoutMs: 1000, transport: async (_url, init) => {
    procedureWireCalls++; const wire = JSON.parse(String(init?.body)), prompt = JSON.parse(wire.messages[1].content);
    check(wire.model === PROCEDURE_REUSE_EPOCH.model && wire.reasoning_effort === "high" && wire.reasoning_budget === 2048
      && wire.response_format?.type === "json_schema" && !wire.chat_template_kwargs, "all experimental arms use identical supported Super native controls and strict schema");
    const task = PROCEDURE_FAMILIES.flatMap(f => [f.seed, ...f.fresh]).find(t => t.taskId === prompt.taskId)!;
    const exchange = prompt.boundProcedure ? { action: "SUBMIT_PROCEDURE", analysisRequest: { problemDigest: prompt.availableTool.problemDigest,
      procedureId: prompt.boundProcedure.procedureId }, certificate: { confidence: 0.8 } } : { action: "SUBMIT_DERIVATION",
      analysisRequest: { problemDigest: prompt.availableTool.problemDigest, program: procedureWitness(task) }, certificate: { confidence: 0.8 } };
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(exchange) }, finish_reason: "stop" }],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 } }), { status: 200, headers: { "Content-Type": "application/json" } });
  } });
const simulatedReuse = await runProcedureReuseEpoch(request => procedureCognition.complete(request),
  { candidate: "0".repeat(40), sourceDigests: { development: theoryDigest("test-only") } });
check(simulatedReuse.complete && simulatedReuse.providerStable && procedureWireCalls === 14 && simulatedReuse.physicalLogicalCalls === 14,
  "entire finite comparison runs through real protocol and native tools with E3 cognition test doubles, never mislabeled E4");
check(simulatedReuse.arms.every(a => a.correct === 4) && simulatedReuse.arms[2].procedureAccepted === 4,
  "composed procedure invocation passes independently checked fresh values in both formal families");
check(simulatedReuse.physicalUsage.reportedTokens === 2100 && simulatedReuse.arms[0].fullyChargedUsage.reportedTokens === 600
  && simulatedReuse.arms[1].fullyChargedUsage.reportedTokens === 900 && simulatedReuse.arms[2].fullyChargedUsage.reportedTokens === 900,
  "physical construction charged once, full counterfactual construction charged to both reuse arms, no unfair baseline setup charge");
check(PROCEDURE_REUSE_EPOCH.seedCostCharging === "FULL_CONSTRUCTION_BOTH_REUSE_ARMS_BASELINE_NOT_CHARGED",
  "freeze metadata agrees with independent cost-accounting assertions, not a misleading shared-prefix label");
check(simulatedReuse.arms[2].fullyChargedUsage.toolWorkUnits > simulatedReuse.arms[0].fullyChargedUsage.toolWorkUnits
  && !simulatedReuse.scopedEfficiencySignal && simulatedReuse.promotion.startsWith("NONE"), "equal acceptance plus extra construction is not claimed as a cognitive improvement");
check(!JSON.stringify(simulatedReuse).includes('"registers"') && !JSON.stringify(simulatedReuse).includes('"initialState"')
  && simulatedReuse.seeds.every(s => s.run.attempts.every(a => a.modelEvidence.evidenceClass === "E3")), "report retains identities/outcomes/accounting, not IR or private model reasoning");
const noSeed = await runProcedureReuseEpoch(async request => {
  const prompt = JSON.parse(request.messages[1].content);
  const task = PROCEDURE_FAMILIES.flatMap(f => [f.seed,...f.fresh]).find(t => t.taskId === prompt.taskId)!;
  return responseFor({ action: "SUBMIT", analysisRequest: null, certificate: { outputs: expectedProcedureOutputs(task), confidence: 1 } });
}, { candidate: "0".repeat(40), sourceDigests: {} });
check(!noSeed.complete && noSeed.seeds.every(s => s.admission === "NO_REPLAYABLE_ACCEPTED_PROCEDURE")
  && noSeed.arms[2].unexecuted === 4 && noSeed.arms[0].correct === 4, "manual seed answer cannot trigger hidden authored-tool fallback; missing tool and successful control stay distinct");
const sumEquations: QuantitativeEquations = { schemaVersion: 2, initialState: [], cycles: [{ iterations: 1, phases: [{
  expressions: [{ id: "e0", op: "ADD", left: "x", right: "y" }], updates: [{ slot: "r0", source: "e0" }] }] }], outputs: [{ label: "sum", source: "r0" }] };
const equationProcedure = BoundQuantitativeProcedure.admit({ task: sumTask, program: sumEquations, parameterIds: ["x","y"],
  modelEvidenceDigest: theoryDigest("v2-test-double"), limits: procedureLimits, verify: sumCheck("5") }).procedure!;
const equationReuse = await runNyxQuantitativeTask({ ...reuseInput, procedure: { artifact: equationProcedure, mode: "BOUND_INVOCATION" },
  complete: async () => responseFor({ ...procedureExchange, analysisRequest: { ...invocation, procedureId: equationProcedure.descriptor().procedureId } }) });
check(equationReuse.accepted && equationReuse.attempts[0].executedProgram?.schemaVersion === 2
  && equationReuse.attempts[0].computation?.loweringVersion !== null, "actual hosted-schema equation format admits and transfers through existing lowerer");
let forgedCallback = false;
try { await runNyxQuantitativeTask({ ...reuseInput, procedure: { artifact: JSON.parse(JSON.stringify(equationProcedure.descriptor())), mode: "BOUND_INVOCATION" },
  complete: async () => { forgedCallback = true; return responseFor(procedureExchange); } }); check(false, "forged artifact must throw"); }
catch { check(!forgedCallback, "forged configuration rejected before any model call"); }
let reuseOracleFailure = false;
try { await runNyxQuantitativeTask({ ...reuseInput, procedure: { artifact: equationProcedure, mode: "BOUND_INVOCATION" },
  complete: async () => responseFor({ ...procedureExchange, analysisRequest: { ...invocation, procedureId: equationProcedure.descriptor().procedureId } }),
  verify: () => { throw Error("fresh-independent-oracle-unavailable"); } }); }
catch(error) { reuseOracleFailure = error instanceof Error && error.message === "fresh-independent-oracle-unavailable"; }
check(reuseOracleFailure, "fresh verifier exception propagates after native procedure execution; never mislabeled or accepted");
const unboundedGeneration = new Ajv().compile(quantitativeExchangeSchema(["sum"],true,false,theoryDigest(freshSum.problem),freshSum.problem.constants.map(c=>c.id)));
const boundedGeneration = new Ajv().compile(quantitativeExchangeSchema(["sum"],true,false,theoryDigest(freshSum.problem),freshSum.problem.constants.map(c=>c.id),null,null,true));
const equationExchange = (program: QuantitativeEquations) => ({action:"SUBMIT_DERIVATION",analysisRequest:{problemDigest:theoryDigest(freshSum.problem),program},certificate:{confidence:0.8}});
const emptyUpdate = {...sumEquations,cycles:[{iterations:1,phases:[{expressions:[],updates:[]}]}]};
check(unboundedGeneration(equationExchange(emptyUpdate)) && !boundedGeneration(equationExchange(emptyUpdate)),
  "separate development reproduction: structural JSON guidance permits empty updates; opt-in native generation bounds reject them before emission");
const tooManyExpressions = {...sumEquations,cycles:[{iterations:1,phases:[{expressions:Array(17).fill(sumEquations.cycles[0].phases[0].expressions[0]),
  updates:sumEquations.cycles[0].phases[0].updates}]}]};
check(unboundedGeneration(equationExchange(tooManyExpressions)) && !boundedGeneration(equationExchange(tooManyExpressions)),
  "oversized phase development reproduction rejected without increasing the native sixteen-expression limit");
check(boundedGeneration(equationExchange(sumEquations)), "useful in-scope equations remain schema-admissible");
const duplicatedExpression = {...sumEquations,cycles:[{iterations:1,phases:[{expressions:Array(2).fill(sumEquations.cycles[0].phases[0].expressions[0]),
  updates:sumEquations.cycles[0].phases[0].updates}]}]};
check(boundedGeneration(equationExchange(duplicatedExpression)) && throws(()=>lowerQuantitativeEquations(freshSum.problem,duplicatedExpression)),
  "generation schema is not a detector substitute: duplicate-ID semantic rejection remains independent");
let boundedGenerationCalls = 0;
const generationRepair = await runNyxQuantitativeTask({...reuseInput,limits:{...reuseLimits,maxCalls:2},nativeGenerationBounds:true,complete:async request=>{
  boundedGenerationCalls++; const prompt=JSON.parse(request.messages[1].content);
  check(prompt.nativeGenerationBounds.maxExpressionsPerPhase===16&&prompt.nativeGenerationBounds.maxTotalLoweredSteps===64,
    "generation aid communicates exact unchanged native resource policy");
  if(boundedGenerationCalls===2)check(prompt.verificationFeedback.some((s:string)=>s.includes("0..16 expressions and 1..16 updates")),
    "rejected phase receives specific public interface guidance, never secret oracle quantities");
  return responseFor(equationExchange(boundedGenerationCalls===1?emptyUpdate:sumEquations));
}});
check(generationRepair.accepted&&generationRepair.calls===2&&generationRepair.toolRequests===1
  &&generationRepair.attempts[0].outcome==="AUTHORIZATION_OR_IR_REJECTION", "development-only general emission correction composes with unchanged verifier and lease; no automatic rewriting");
const generationWrong = await runNyxQuantitativeTask({...reuseInput,nativeGenerationBounds:true,verify:sumCheck("9"),
  complete:async()=>responseFor(equationExchange(sumEquations))});
check(!generationWrong.accepted&&generationWrong.outcome==="FUNCTIONAL_REJECTION", "bounded generation cannot turn native success into mathematical acceptance");
const receipt = JSON.parse(readFileSync("docs/omega/evidence/nyx-procedure-transfer-b89f3bea.json","utf8"));
const frozenProcedure = receipt.frozenReport, exactReportBytes = Buffer.from(JSON.stringify(frozenProcedure,null,2)+"\n");
check(createHash("sha256").update(exactReportBytes).digest("hex")===receipt.integrity.reportSha256
  && exactReportBytes.length===receipt.integrity.reportBytes && theoryDigest(frozenProcedure.freeze)===frozenProcedure.freezeDigest,
  "frozen sanitized report exactly reconstructs independently verified artifact bytes and freeze identity");
for(const [path,digest] of Object.entries(frozenProcedure.freeze.sourceDigests)) {
  if(!/^(?:src|scripts)\/[A-Za-z0-9_./-]+\.ts$/.test(path)||path.split("/").includes(".."))throw Error("unsafe_receipt_source_path");
  check(theoryDigest(execFileSync("git",["show",`${receipt.evaluatedCandidate}:${path}`],{encoding:"utf8"}))===digest,
    `procedure receipt reconstructs historical source ${path}`);
}
for(const binding of frozenProcedure.freeze.taskBindings)
  check(PROCEDURE_FAMILIES.flatMap(f=>[f.seed,...f.fresh]).some(t=>t.taskId===binding.taskId&&theoryDigest(t)===binding.digest),
    "exact frozen public corpus membership and parameter values retained");
const frozenAttempts = [...frozenProcedure.seeds.map((s:any)=>s.run),...frozenProcedure.results.flatMap((s:any)=>s.run?[s.run]:[])].flatMap((r:any)=>r.attempts);
check(frozenAttempts.length===12&&frozenAttempts.every((a:any)=>a.modelEvidence.evidenceClass==="E4"&&a.modelEvidence.model===PROCEDURE_REUSE_EPOCH.model
  &&a.modelEvidence.finishReason==="stop"&&a.modelEvidence.usage.totalTokens!==null), "observed live Super identity and full delivery remain distinct from E3 development tests");
check(frozenAttempts.filter((a:any)=>a.findings.includes("quantitative_equations_invalid:PHASE_BOUND")).length===9
  &&frozenAttempts.filter((a:any)=>a.findings.includes("quantitative_equations_invalid:EXPRESSION_SHAPE")).length===2
  &&frozenAttempts.filter((a:any)=>a.outcome==="FUNCTIONAL_REJECTION").length===1, "eleven unexecuted IR rejections never mislabeled as eleven reasoning failures");
check(frozenProcedure.results.filter((s:any)=>s.blocked!==null).length===8&&!frozenProcedure.complete&&!frozenProcedure.scopedEfficiencySignal
  &&frozenProcedure.physicalUsage.reportedTokens===57357&&frozenProcedure.physicalUsage.httpAttempts===12, "blocked transfer stays untested and full physical compute remains charged");
check(frozenProcedure.arms[0].fullyChargedUsage.reportedTokens===38123&&frozenProcedure.arms[1].fullyChargedUsage.reportedTokens===19234
  &&frozenProcedure.arms[2].fullyChargedUsage.reportedTokens===19234&&frozenProcedure.freeze.configuration.seedChargedToEveryArm===true
  &&receipt.frozenMetadataAnnotation.frozenOutcomeAltered===false, "misleading historical cost label is preserved and explicitly annotated, never used to corrupt correct arithmetic");
check(generationRepair.attempts[0].nativeRejectionStructure?.phases[0].updateCount===0
  &&generationRepair.attempts[0].nativeRejectionStructure?.phases[0].expressionCount===0,
  "rejected phase telemetry distinguishes empty updates without reconstructing or retaining candidate source");
const measuredDuplicate=await runNyxQuantitativeTask({...reuseInput,complete:async()=>responseFor(equationExchange(duplicatedExpression))});
check(measuredDuplicate.attempts[0].nativeRejectionStructure?.phases[0].duplicateExpressionIds===1
  &&measuredDuplicate.attempts[0].nativeRejectionStructure?.phases[0].expressionCount===2,
  "specific duplicate-ID observation separates semantic identifier failure from over-limit phase generation");
const measuredOversize=await runNyxQuantitativeTask({...reuseInput,complete:async()=>responseFor(equationExchange(tooManyExpressions))});
check(measuredOversize.attempts[0].nativeRejectionStructure?.phases[0].expressionCount===17
  &&measuredOversize.attempts[0].nativeRejectionStructure?.phases[0].inspectedExpressions===17,
  "oversized phase reports actual count, not just ambiguous PHASE_BOUND");
const secretLikeProgram={...sumEquations,cycles:[{iterations:1,phases:[{expressions:[{id:"do-not-persist-candidate-name",op:"ADD",left:"x",right:"y"}],updates:[]}]}]};
const measuredPrivacy=await runNyxQuantitativeTask({...reuseInput,complete:async()=>responseFor(equationExchange(secretLikeProgram as QuantitativeEquations))});
check(!JSON.stringify(measuredPrivacy.attempts[0].nativeRejectionStructure).includes("do-not-persist-candidate-name")
  &&measuredPrivacy.attempts[0].nativeRejectionStructure?.phases[0].unknownExpressionIds===1,
  "shape telemetry contains counts only, not arbitrary names, input values or private generated content");
const manyExpressions={...sumEquations,cycles:[{iterations:1,phases:[{expressions:Array(100).fill(sumEquations.cycles[0].phases[0].expressions[0]),updates:[]}]}]};
const measuredBound=await runNyxQuantitativeTask({...reuseInput,complete:async()=>responseFor(equationExchange(manyExpressions))});
check(measuredBound.attempts[0].nativeRejectionStructure?.phases[0].expressionCount===100
  &&measuredBound.attempts[0].nativeRejectionStructure?.phases[0].inspectedExpressions===32,
  "diagnostic inspection ceiling stays explicit and bounded even for an oversized rejected proposal");
check(NATIVE_GENERATION_CASES.length===4&&NATIVE_GENERATION_EPOCH.maxLogicalCalls===16
  &&NATIVE_GENERATION_CASES.every(t=>!PROCEDURE_FAMILIES.flatMap(f=>[f.seed,...f.fresh]).some(old=>theoryDigest(old.problem)===theoryDigest(t.problem))),
  "new paired comparison binds fresh values rather than replaying exposed seed/transfer inputs");
let generationEpochCalls=0;
const generationEpoch=await runNativeGenerationEpoch(async(request,stage)=>{
  generationEpochCalls++;const prompt=JSON.parse(request.messages[1].content),task=NATIVE_GENERATION_CASES.find(t=>t.taskId===prompt.taskId)!;
  check(request.reasoningControl==="SUPER_HOSTED_NATIVE"&&request.reasoningEffort===undefined&&request.reasoningBudgetTokens===2048
    &&request.maxTokens===8192, "fresh comparison holds native model controls fixed across both arms");
  check(Boolean(prompt.nativeGenerationBounds)===stage.endsWith("NATIVE_BOUNDS"), "only declared treatment receives generation constraints");
  return responseFor({action:"SUBMIT_DERIVATION",analysisRequest:{problemDigest:theoryDigest(task.problem),program:procedureWitness(task)},certificate:{confidence:0.8}});
},{candidate:"0".repeat(40),sourceDigests:{development:theoryDigest("test-double")}});
check(generationEpoch.complete&&generationEpoch.providerStable&&generationEpochCalls===8&&generationEpoch.totals.reportedTokens===1200
  &&generationEpoch.summaries.every(s=>s.accepted===4&&s.firstAttemptAccepted===4), "full paired epoch composes existing native engine and independent fresh-case oracle under E3 doubles");
check(generationEpoch.pairs.every(p=>p.realizedComputeMatched)&&!generationEpoch.scopedFunctionalSignal&&!generationEpoch.emissionSignal,
  "equal matched success is not manufactured into an improvement signal");
const retriedGenerationEpoch=await runNativeGenerationEpoch(async request=>{
  const prompt=JSON.parse(request.messages[1].content),task=NATIVE_GENERATION_CASES.find(t=>t.taskId===prompt.taskId)!;
  const completion=responseFor({action:"SUBMIT_DERIVATION",analysisRequest:{problemDigest:theoryDigest(task.problem),program:procedureWitness(task)},certificate:{confidence:0.8}});
  return {...completion,evidence:{...completion.evidence,delivery:{policy:"nvidia-capacity/1",requestsPerMinute:40,scope:"PROCESS_LOCAL_FIXED_NVIDIA_ENDPOINT",
    httpAttempts:2,rateLimitedResponses:1,transientUnavailableResponses:0,timedOutAttempts:0,capacityWaitMs:1,state:"DELIVERED",notBeforeEpochMs:null,authorityRenewed:false}}};
},{candidate:"0".repeat(40),sourceDigests:{}});
check(retriedGenerationEpoch.totals.httpAttempts===16&&retriedGenerationEpoch.totals.knownUsageHttpAttempts===8
  &&retriedGenerationEpoch.totals.unknownUsageHttpAttempts===8&&!retriedGenerationEpoch.providerStable&&!retriedGenerationEpoch.scopedFunctionalSignal
  &&retriedGenerationEpoch.pairs.every(p=>!p.realizedComputeMatched&&!p.boundedNoMoreModelCompute),
  "successful final delivery cannot conceal unreported usage from earlier physical retry attempts or establish compute-matched gain");
let nativeWireChecks=0;
const generationWire=NvidiaNimProvider.create({providerId:"TEST-NATIVE-GENERATION-WIRE",model:NATIVE_GENERATION_EPOCH.model,authorityMode:"TEST_DOUBLE_ONLY",
  credentialSource:{read:()=>"test-only-non-secret",sourceIdentity:"DETERMINISTIC_TEST_DOUBLE"},maxPromptBytes:32000,maxOutputTokens:8192,timeoutMs:1000,
  transport:async(_url,init)=>{
    const wire=JSON.parse(String(init?.body)),prompt=JSON.parse(wire.messages[1].content),task=NATIVE_GENERATION_CASES.find(t=>t.taskId===prompt.taskId)!;
    const bounded=Boolean(prompt.nativeGenerationBounds),programSchema=wire.response_format.json_schema.schema.anyOf[1].properties.analysisRequest.properties.program;
    check(wire.model===NATIVE_GENERATION_EPOCH.model&&wire.reasoning_budget===2048&&wire.reasoning_effort==="high"&&wire.max_tokens===8192,
      "actual NVIDIA adapter preserves frozen Super wire controls in fresh comparison");
    check((programSchema.properties.cycles.items.properties.phases.items.properties.expressions.maxItems===16)===bounded
      &&(programSchema.properties.cycles.items.properties.phases.items.properties.updates.minItems===1)===bounded,
      "adapter transmits optional min/max collection constraints unchanged; it does not silently strip them");nativeWireChecks++;
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({action:"SUBMIT",analysisRequest:null,
      certificate:{outputs:expectedProcedureOutputs(task),confidence:0.8}})},finish_reason:"stop"}],usage:{prompt_tokens:100,completion_tokens:50,total_tokens:150}}),
      {status:200,headers:{"Content-Type":"application/json"}});
  }});
const wireEpoch=await runNativeGenerationEpoch(request=>generationWire.complete(request),{candidate:"0".repeat(40),sourceDigests:{}});
check(nativeWireChecks===8&&wireEpoch.summaries.every(s=>s.accepted===4&&s.nativeExecutions===0)
  &&wireEpoch.rows.every(r=>r.run!.attempts.every(a=>a.modelEvidence.evidenceClass==="E3")),
  "wire/strict manual-certificate test is explicitly E3 and not misrepresented as model reasoning or native execution");
const staleGenerationEpoch=await runNativeGenerationEpoch(async request=>{
  const prompt=JSON.parse(request.messages[1].content),task=NATIVE_GENERATION_CASES.find(t=>t.taskId===prompt.taskId)!;
  return responseFor({action:"SUBMIT_DERIVATION",analysisRequest:{problemDigest:"stale-scope",program:procedureWitness(task)},certificate:{confidence:0.8}});
},{candidate:"0".repeat(40),sourceDigests:{}});
check(staleGenerationEpoch.summaries.every(s=>s.irRejections===0&&s.nativeAuthorizationRejections===8&&s.graded===0),
  "stale-scope and authority rejection never masquerade as malformed IR or mathematical reasoning failure");
let expiryClock=1000;
const expiredEpoch=await runNativeGenerationEpoch(async request=>{
  expiryClock+=NATIVE_GENERATION_EPOCH.maxEpochMs;return responseFor({action:"SUBMIT",analysisRequest:null,certificate:{outputs:[],confidence:1}});
},{candidate:"0".repeat(40),sourceDigests:{}},()=>expiryClock);
check(!expiredEpoch.complete&&expiredEpoch.rows.filter(r=>r.blocked==="GLOBAL_BUDGET").length===7&&expiredEpoch.logicalCalls===1,
  "global expiry does not renew task leases or dispatch seven remaining stages");
const generationReceipt=JSON.parse(readFileSync("docs/omega/evidence/nyx-native-generation-b42b7e72.json","utf8"));
const frozenGeneration=generationReceipt.frozenReport, generationBytes=Buffer.from(JSON.stringify(frozenGeneration,null,2)+"\n");
check(createHash("sha256").update(generationBytes).digest("hex")===generationReceipt.integrity.reportSha256
  &&generationBytes.length===generationReceipt.integrity.reportBytes&&theoryDigest(frozenGeneration.freeze)===frozenGeneration.freezeDigest,
  "generation receipt reconstructs exact independently verified artifact bytes and freeze identity");
for(const [path,digest] of Object.entries(frozenGeneration.freeze.sourceDigests)){
  if(!/^(?:src|scripts)\/[A-Za-z0-9_./-]+\.ts$/.test(path)||path.split("/").includes(".."))throw Error("unsafe_generation_receipt_source_path");
  check(theoryDigest(execFileSync("git",["show",`${generationReceipt.evaluatedCandidate}:${path}`],{encoding:"utf8"}))===digest,
    `generation receipt binds exact historical source ${path}`);
}
for(const binding of frozenGeneration.freeze.tasks)check(NATIVE_GENERATION_CASES.some(t=>t.taskId===binding.taskId&&theoryDigest(t)===binding.digest),
  "new public corpus identity is preserved without answer-specific repairs");
const observedGeneration=frozenGeneration.rows.flatMap((r:any)=>r.run.attempts);
check(observedGeneration.length===16&&observedGeneration.every((a:any)=>a.modelEvidence.evidenceClass==="E4"
  &&a.modelEvidence.model===NATIVE_GENERATION_EPOCH.model&&a.modelEvidence.finishReason==="stop"&&a.modelEvidence.usage.totalTokens!==null)
  &&frozenGeneration.totals.calls===16&&frozenGeneration.totals.httpAttempts===16&&frozenGeneration.totals.reportedTokens===74096
  &&frozenGeneration.totals.unknownUsageHttpAttempts===0, "stable live delivery and all realized model compute remain separately accounted");
const originalObserved=frozenGeneration.rows.filter((r:any)=>r.arm==="ORIGINAL_GENERATION").flatMap((r:any)=>r.run.attempts);
const boundedObserved=frozenGeneration.rows.filter((r:any)=>r.arm==="NATIVE_BOUNDS").flatMap((r:any)=>r.run.attempts);
check(originalObserved.filter((a:any)=>a.findings.includes("quantitative_equations_invalid:PHASE_BOUND")).length===4
  &&boundedObserved.every((a:any)=>!a.findings.includes("quantitative_equations_invalid:PHASE_BOUND"))
  &&boundedObserved.filter((a:any)=>a.findings.includes("quantitative_equations_invalid:EXPRESSION_SHAPE")
    &&a.nativeRejectionStructure.phases.some((p:any)=>p.duplicateExpressionIds>0)).length===4
  &&boundedObserved.filter((a:any)=>a.findings.some((f:string)=>f.startsWith("quantitative_equations_invalid:EXPRESSION_SOURCE_NOT_BOUND"))).length===1,
  "phase bounds improved one structural class, while duplicate identifiers and unavailable phase references remain observed");
check(frozenGeneration.summaries.every((s:any)=>s.accepted===0&&s.irRejections===5&&s.nativeExecutions===3&&s.functionalRejections===3
  &&s.nativeAuthorizationRejections===0)&&frozenGeneration.pairs.filter((p:any)=>p.realizedComputeMatched).length===2
  &&frozenGeneration.pairs.every((p:any)=>!p.boundedNoMoreModelCompute)&&frozenGeneration.complete&&frozenGeneration.providerStable
  &&!frozenGeneration.scopedFunctionalSignal&&!frozenGeneration.emissionSignal&&frozenGeneration.promotion==="NONE_REQUIRES_REPLICATION_FRESH_OUTCOMES_AND_REALIZED_COMPUTE_ASSESSMENT",
  "unchanged total emission/functional failure and higher treatment compute cannot be promoted as cognition or efficiency gain");
check(observedGeneration.filter((a:any)=>a.call===1&&a.outcome==="FUNCTIONAL_REJECTION").length===2
  &&observedGeneration.filter((a:any)=>a.call===2&&a.outcome==="FUNCTIONAL_REJECTION").length===4
  &&generationReceipt.accounting.independentlyGradedStages===4&&generationReceipt.accounting.ungradedAttemptedStages===4
  &&generationReceipt.diagnosis.defaultChanged===false&&frozenGeneration.sourceUnchanged===true,
  "first and second proposal grades are not conflated with unique graded stages or broad authority promotion");
const graphProblem:QuantitativeProblem={kind:"EXACT_QUANTITATIVE_DERIVATION",constants:[{id:"q0",value:"7"},{id:"a",value:"-3"},
  {id:"b",value:"5"},{id:"one",value:"1"},{id:"zero",value:"0"},{id:"six",value:"6"},{id:"three",value:"3"}]};
const graphLimits={maxWorkUnits:100000,maxElapsedMs:2000,maxRequests:1,expiresAtEpochMs:Date.now()+120000};
function graphNative(program:unknown,maximum=100000){
  const session=BoundedReasoningSession.create(graphProblem,{...graphLimits,maxWorkUnits:maximum},Date.now,{expressionGraphs:true});
  try{return session.analyze({schemaVersion:1,operation:"ANALYZE_FINITE_PROBLEM",problemDigest:session.problemDigest,program});}
  finally{session.revoke();}
}
const dataGraph:QuantitativeExpressionGraph={schemaVersion:4,expressions:[{op:"SUB",left:"b",right:"a"},
  {op:"DIV",left:0,right:"b"},{op:"ADD",left:0,right:1}],outputs:[{label:"result",source:2},{label:"retained",source:0}]};
const graphResult=graphNative(dataGraph);
check(graphResult.status==="CONSTRUCTED"&&JSON.stringify(graphResult.payload!.outputs)===JSON.stringify([{label:"result",value:"48/5"},{label:"retained",value:"8"}])
  &&graphResult.loweringVersion==="nyx-expression-lowering/1", "positional graph preserves noncommutative operands, shared values and output lifetime through the existing interpreter");
const noGraph=BoundedReasoningSession.create(graphProblem,graphLimits);
check(throws(()=>noGraph.analyze({schemaVersion:1,operation:"ANALYZE_FINITE_PROBLEM",problemDigest:noGraph.problemDigest,program:dataGraph}))
  &&!noGraph.descriptor().expressionPolicy, "expression frontend remains opt-in; model cannot activate it by sending a new version");noGraph.revoke();
check(throws(()=>BoundedReasoningSession.create(triangle,graphLimits,Date.now,{expressionGraphs:true})), "expression option cannot expand a non-arithmetic capability");
const longGraph:QuantitativeExpressionGraph={schemaVersion:4,expressions:Array.from({length:64},(_,i)=>({op:"ADD" as const,left:i?i-1:"zero",right:"one"})),
  outputs:[{label:"sum",source:63}]};
const loweredLong=lowerQuantitativeExpressions(graphProblem,longGraph);
check(loweredLong.registers.length===1&&loweredLong.registers[0].id!=="q0"&&loweredLong.blocks[0].steps.length===64
  &&(graphNative(longGraph).payload!.outputs as any[])[0].value==="64", "64-expression chain reuses one register, avoids constant collisions and preserves the 64-step ceiling");
check(graphNative(dataGraph,1).status==="BUDGET_EXHAUSTED", "compiler work is charged inside the same native work budget, not added as free tool computation");
const constantGraph={schemaVersion:4,expressions:[],outputs:[{label:"value",source:"a"}]};
check((graphNative(constantGraph).payload!.outputs as any[])[0].value==="-3", "constant-only output needs neither implicit zero nor a fabricated operation");
const badGraphs=[{...longGraph,expressions:[...longGraph.expressions,{op:"ADD",left:63,right:"one"}]},
  {...dataGraph,expressions:[{op:"ADD",left:0,right:"a"}]},{...dataGraph,expressions:[{op:"ADD",left:"0",right:"a"}]},
  {...dataGraph,expressions:[{op:"ADD",left:-1,right:"a"}]},{...dataGraph,expressions:[{op:"ADD",left:0.5,right:"a"}]},
  {...dataGraph,expressions:[{op:"SHELL",left:"a",right:"b"}]},{...dataGraph,expressions:[{id:"duplicate",op:"ADD",left:"a",right:"b"}]},
  {...dataGraph,outputs:[{label:"x",source:0},{label:"x",source:1}]},{...dataGraph,outputs:[{label:"x",source:3}]},
  {...dataGraph,outputs:[{label:"x",source:"q1"}]},{...dataGraph,constants:[]},{...dataGraph,iterations:1000000}];
for(const g of badGraphs)check(throws(()=>graphNative(g)), "malformed, forward, unbound, injected or over-limit expression graph fails closed");
const pressure:QuantitativeExpressionGraph={schemaVersion:4,expressions:[...Array.from({length:33},()=>({op:"ADD" as const,left:"a",right:"b"})),
  ...Array.from({length:31},(_,i)=>({op:"ADD" as const,left:i,right:i+2}))],outputs:[{label:"x",source:63}]};
check(throws(()=>graphNative(pressure)), "33 simultaneously live values reject without memory spill, increased register limits or operation reordering");
const unusedBad={schemaVersion:4,expressions:[{op:"DIV",left:"one",right:"zero"}],outputs:[{label:"x",source:"a"}]};
check(graphNative(unusedBad).status==="INSUFFICIENT_EVIDENCE", "unused bad arithmetic is not optimized away to hide a failure");
let graphGetterRead=false;
const hostileGraph={schemaVersion:4,get expressions(){graphGetterRead=true;return[];},outputs:[]};
check(throws(()=>graphNative(hostileGraph))&&!graphGetterRead, "native snapshot rejects graph accessors before reading them");
const graphCycle:any={schemaVersion:4,expressions:[],outputs:[]};graphCycle.expressions.push(graphCycle);
check(throws(()=>graphNative(graphCycle)), "cyclic graph host data is not an expression dependency or executable authority");
const leaseGraph=BoundedReasoningSession.create(graphProblem,graphLimits,Date.now,{expressionGraphs:true});
const graphRequest={schemaVersion:1,operation:"ANALYZE_FINITE_PROBLEM",problemDigest:leaseGraph.problemDigest,program:dataGraph};
check(throws(()=>leaseGraph.analyze({...graphRequest,problemDigest:"stale"})), "expression lowering never bypasses problem binding");
leaseGraph.analyze(graphRequest);check(throws(()=>leaseGraph.analyze(graphRequest)), "expression request obeys the original request-count lease");
leaseGraph.revoke();check(throws(()=>leaseGraph.analyze(graphRequest)), "revoked expression session cannot execute");
const graphSchemaValidator=createRequire(import.meta.url)("ajv");
const validateGraph=new graphSchemaValidator({allErrors:true}).compile(quantitativeExpressionSchema(["result","retained"],graphProblem.constants.map(c=>c.id)));
check(validateGraph(dataGraph)&&!validateGraph({...dataGraph,expressions:[{op:"ADD",left:64,right:"a"}]}), "guided schema bounds are separate from mandatory topological/native checks");
// Independent oracle stores every SSA value permanently; it has no register
// allocation, native compiler, native validation or native evaluator dependency.
type OracleQ=readonly[bigint,bigint];
function graphQ(n:bigint,d=1n):OracleQ{if(d<0n){n=-n;d=-d;}let a=n<0n?-n:n,b=d;while(b){[a,b]=[b,a%b];}return[n/a,d/a];}
function graphOracle(g:QuantitativeExpressionGraph){
  const c=Object.fromEntries(graphProblem.constants.map(c=>[c.id,graphQ(BigInt(c.value))])),values:OracleQ[]=[];
  const resolve=(s:string|number)=>typeof s==="string"?c[s]:values[s];
  for(const e of g.expressions){const [a,b]=resolve(e.left),[d,f]=resolve(e.right);let result:OracleQ;
    switch(e.op){case "ADD":result=graphQ(a*f+d*b,b*f);break;case "SUB":result=graphQ(a*f-d*b,b*f);break;
      case "MUL":result=graphQ(a*d,b*f);break;case "DIV":result=graphQ(a*f,b*d);break;
      case "MIN":result=a*f<=d*b?[a,b]:[d,f];break;case "MAX":result=a*f>=d*b?[a,b]:[d,f];break;
      case "BINOMIAL":{let ways=0n;for(let mask=0;mask<2**Number(a);mask++)if(mask.toString(2).replaceAll("0","").length===Number(d))ways++;
        result=[ways,1n];break;}}
    values.push(result);
  }
  return g.outputs.map(o=>{const[n,d]=resolve(o.source);return{label:o.label,value:d===1n?String(n):`${n}/${d}`};});
}
let graphSeed=7919;const nextGraph=()=>{graphSeed=(Math.imul(graphSeed,1664525)+1013904223)>>>0;return graphSeed;};
for(let sample=0;sample<120;sample++){
  const expressions:QuantitativeExpressionGraph["expressions"][number][]=[{op:"BINOMIAL",left:"six",right:"three"}];
  const operations=["ADD","SUB","MUL","DIV","MIN","MAX"] as const;
  for(let i=1;i<24;i++){const op=operations[nextGraph()%operations.length];
    expressions.push({op,left:nextGraph()%i,right:op==="DIV"?"b":nextGraph()%2?"a":"b"});}
  const g:QuantitativeExpressionGraph={schemaVersion:4,expressions,outputs:[{label:"head",source:0},{label:"tail",source:23},
    {label:"middle",source:7},{label:"constant",source:"q0"}]};
  check(JSON.stringify(graphNative(g).payload!.outputs)===JSON.stringify(graphOracle(g)),
    "independent permanent-SSA oracle agrees with register-reused execution across all allowed operations and noncommutative cases");
}
const graphExchange={action:"SUBMIT_DERIVATION",analysisRequest:{problemDigest:theoryDigest(freshSum.problem),
  program:{schemaVersion:4,expressions:[{op:"ADD",left:"x",right:"y"}],outputs:[{label:"sum",source:0}]}},certificate:{confidence:0.8}};
const graphLoop=await runNyxQuantitativeTask({...reuseInput,nativeExpressionGraph:true,complete:async request=>{
  const prompt=JSON.parse(request.messages[1].content);check(prompt.nativeExpressionGraph.schemaVersion===4&&!prompt.nativeGenerationBounds,
    "graph cognition sees only actual opt-in representation and resource contract");return responseFor(graphExchange);}});
check(graphLoop.accepted&&graphLoop.attempts[0].computation?.loweringVersion==="nyx-expression-lowering/1",
  "model-shaped action composes native graph lowering and independent acceptance under E3 test double");
const wrongGraphLoop=await runNyxQuantitativeTask({...reuseInput,nativeExpressionGraph:true,verify:sumCheck("9"),complete:async()=>responseFor(graphExchange)});
check(!wrongGraphLoop.accepted&&wrongGraphLoop.outcome==="FUNCTIONAL_REJECTION", "compiler success cannot override a wrong objective result");
const legacyGraphLoop=await runNyxQuantitativeTask({...reuseInput,nativeExpressionGraph:true,complete:async()=>responseFor(equationExchange(sumEquations))});
check(legacyGraphLoop.outcome==="PROTOCOL_REJECTION"&&legacyGraphLoop.toolRequests===0, "graph treatment cannot fall back to a legacy representation silently");
// Authored witness conversion exists ONLY inside this E3 unit harness. No
// generated or reference program is provided to the live completion callback.
function testExpressionWitness(t:ProcedureCase):QuantitativeExpressionGraph{
  const p=procedureWitness(t),bindings=new Map<string,string|number>(t.problem.constants.map(c=>[c.id,c.id]));
  for(const r of p.registers)bindings.set(r.id,bindings.get(r.source)!);
  const expressions:QuantitativeExpressionGraph["expressions"][number][]=[];
  for(const b of p.blocks){if(b.iterations!==1||b.mode!=="SEQUENTIAL")throw Error("unsupported_test_witness");
    for(const s of b.steps){const left=bindings.get(s.left)!,right=bindings.get(s.right)!;
      bindings.set(s.target,expressions.length);expressions.push({op:s.op,left,right});}}
  return{schemaVersion:4,expressions,outputs:p.outputs.map(o=>({label:o.label,source:bindings.get(o.source)!}))};
}
for(const t of EXPRESSION_TRANSFER_CASES){
  const s=BoundedReasoningSession.create(t.problem,graphLimits,Date.now,{expressionGraphs:true});
  const result=s.analyze({schemaVersion:1,operation:"ANALYZE_FINITE_PROBLEM",problemDigest:s.problemDigest,program:testExpressionWitness(t)});s.revoke();
  check(result.status==="CONSTRUCTED"&&verifyProcedureOutputs(t,{outputs:result.payload!.outputs,confidence:1}).accepted,
    "new parameter case can be represented without changing elimination oracle, expression order or native arithmetic");
}
check(EXPRESSION_TRANSFER_CASES.every(t=>![...NATIVE_GENERATION_CASES,...PROCEDURE_FAMILIES.flatMap(f=>[f.seed,...f.fresh])]
  .some(old=>theoryDigest(old.problem)===theoryDigest(t.problem))), "graph live epoch does not replay exposed parameter values");
let representationCalls=0;
const representationEpoch=await runNativeGenerationEpoch(async(request,stage)=>{
  representationCalls++;const prompt=JSON.parse(request.messages[1].content),t=EXPRESSION_TRANSFER_CASES.find(t=>t.taskId===prompt.taskId)!;
  check(request.reasoningBudgetTokens===2048&&request.maxTokens===8192&&request.reasoningControl==="SUPER_HOSTED_NATIVE",
    "new representation comparison preserves model, inference controls and caps");
  const graph=stage.endsWith("EXPRESSION_GRAPH"),program=graph?testExpressionWitness(t):procedureWitness(t);
  check(Boolean(prompt.nativeExpressionGraph)===graph&&Boolean(prompt.nativeGenerationBounds)===!graph,
    "only graph arm sees positional representation; control preserves bounded equations");
  return responseFor({action:"SUBMIT_DERIVATION",analysisRequest:{problemDigest:theoryDigest(t.problem),program},certificate:{confidence:0.8}});
},{candidate:"0".repeat(40),sourceDigests:{}},Date.now,async()=>{},"EXPRESSION_GRAPH");
check(representationCalls===8&&representationEpoch.complete&&representationEpoch.summaries.every(s=>s.accepted===4)
  &&representationEpoch.pairs.every(p=>p.realizedComputeMatched)&&!representationEpoch.scopedFunctionalSignal,
  "matched E3 equality validates composition without being manufactured into a live capability gain");
const badReferenceEpoch=await runNativeGenerationEpoch(async request=>{
  const prompt=JSON.parse(request.messages[1].content);return responseFor({action:"SUBMIT_DERIVATION",analysisRequest:{problemDigest:theoryDigest(prompt.problem),
    program:{schemaVersion:4,expressions:[{op:"ADD",left:0,right:"one"}],outputs:[{label:prompt.outputLabels[0],source:0}]}},certificate:{confidence:0.8}});
},{candidate:"0".repeat(40),sourceDigests:{}},Date.now,async()=>{},"EXPRESSION_GRAPH");
check(badReferenceEpoch.summaries[1].irRejections===8&&badReferenceEpoch.summaries[1].nativeAuthorizationRejections===0
  &&badReferenceEpoch.summaries[1].graded===0, "graph source rejection is separate from authority refusal or unreached mathematical grading");
const expressionReceipt=JSON.parse(readFileSync("docs/omega/evidence/nyx-expression-transfer-becd3139.json","utf8"));
const frozenExpression=expressionReceipt.frozenReport, expressionReceiptBytes=Buffer.from(JSON.stringify(frozenExpression,null,2)+"\n");
check(createHash("sha256").update(expressionReceiptBytes).digest("hex")===expressionReceipt.integrity.reportSha256
  &&expressionReceiptBytes.length===expressionReceipt.integrity.reportBytes&&theoryDigest(frozenExpression.freeze)===frozenExpression.freezeDigest,
  "expression receipt reconstructs independently verified artifact bytes and exact freeze");
for(const [path,digest] of Object.entries(frozenExpression.freeze.sourceDigests)){
  if(!/^(?:src|scripts)\/[A-Za-z0-9_./-]+\.ts$/.test(path)||path.split("/").includes(".."))throw Error("unsafe_expression_receipt_source_path");
  check(theoryDigest(execFileSync("git",["show",`${expressionReceipt.evaluatedCandidate}:${path}`],{encoding:"utf8"}))===digest,
    `expression receipt binds exact historical source ${path}`);
}
check(theoryDigest(frozenExpression.freeze.configuration)===theoryDigest(EXPRESSION_TRANSFER_EPOCH)
  &&frozenExpression.freeze.tasks.length===4&&frozenExpression.freeze.tasks.every((b:any)=>EXPRESSION_TRANSFER_CASES.some(t=>t.taskId===b.taskId&&theoryDigest(t)===b.digest)),
  "frozen model, controls, corpus, oracle, caps and representation identities remain unchanged");
const expressionObserved=frozenExpression.rows.flatMap((r:any)=>r.run.attempts);
check(expressionObserved.length===16&&expressionObserved.every((a:any)=>a.modelEvidence.evidenceClass==="E4"
  &&a.modelEvidence.model===EXPRESSION_TRANSFER_EPOCH.model&&a.modelEvidence.finishReason==="stop"&&a.modelEvidence.usage.totalTokens!==null)
  &&frozenExpression.totals.calls===16&&frozenExpression.totals.httpAttempts===16&&frozenExpression.totals.reportedTokens===76221
  &&frozenExpression.totals.unknownUsageCalls===0&&frozenExpression.totals.unknownUsageHttpAttempts===0&&frozenExpression.providerStable,
  "all sixteen live deliveries and known physical/logical compute are preserved without treating reliability as cognition");
check(frozenExpression.summaries[0].arm==="NATIVE_BOUNDS"&&frozenExpression.summaries[0].irRejections===3
  &&frozenExpression.summaries[0].nativeExecutions===5&&frozenExpression.summaries[0].functionalRejections===5
  &&frozenExpression.summaries[1].arm==="EXPRESSION_GRAPH"&&frozenExpression.summaries[1].irRejections===1
  &&frozenExpression.summaries[1].nativeExecutions===7&&frozenExpression.summaries[1].functionalRejections===3
  &&frozenExpression.summaries[1].outcomes.CERTIFICATE_SCHEMA_REJECTION===4,
  "fewer native rejections cannot hide new certificate-schema failures or unchanged zero acceptance");
check(frozenExpression.rows.filter((r:any)=>r.run.attempts.some((a:any)=>a.outcome==="FUNCTIONAL_REJECTION")).length===6
  &&expressionReceipt.accounting.mathematicallyGradedStages===6&&expressionReceipt.accounting.ungradedAttemptedStages===2
  &&expressionReceipt.accounting.acceptanceEvaluatedStages===8&&frozenExpression.summaries.reduce((n:number,s:any)=>n+s.graded,0)===8
  &&expressionReceipt.frozenMetadataAnnotation.frozenOutcomeAltered===false,
  "schema-only stages are acceptance-evaluated but not mathematically graded; frozen counters remain intact and annotated");
check(expressionObserved.filter((a:any)=>a.call===1&&a.outcome==="FUNCTIONAL_REJECTION").length===4
  &&expressionObserved.filter((a:any)=>a.call===2&&a.outcome==="FUNCTIONAL_REJECTION").length===4
  &&expressionObserved.filter((a:any)=>a.outcome==="CERTIFICATE_SCHEMA_REJECTION").length===4
  &&expressionReceipt.accounting.firstAttempts.correct===0&&expressionReceipt.accounting.secondAttempts.correct===0,
  "initial and second mathematical proposal failures stay separate from certificate-shape failures");
check(frozenExpression.complete&&frozenExpression.sourceUnchanged&&frozenExpression.emissionSignal&&!frozenExpression.scopedFunctionalSignal
  &&frozenExpression.summaries.every((s:any)=>s.accepted===0&&s.nativeAuthorizationRejections===0)
  &&frozenExpression.pairs.every((p:any)=>!p.realizedComputeMatched&&p.boundedNoMoreModelCompute)
  &&frozenExpression.summaries[0].usage.reportedTokens===40545&&frozenExpression.summaries[1].usage.reportedTokens===35676
  &&expressionReceipt.diagnosis.cognitiveGainDemonstrated===false&&expressionReceipt.diagnosis.defaultChanged===false,
  "narrow emission and lower model compute signal does not become functional, default, authority or recursion promotion");
// Separate development reproduction, not any frozen interpolation/network case.
const outputTask={taskId:"DEV-OUTPUT-CONTRACT",objective:"Compute sum=x+y and product=x*y exactly.",outputLabels:["sum","product"],
  problem:{kind:"EXACT_QUANTITATIVE_DERIVATION" as const,constants:[{id:"zero",value:"0"},{id:"x",value:"5"},{id:"y",value:"-11"}]}};
const outputProgram:QuantitativeExpressionGraph={schemaVersion:4,expressions:[{op:"ADD",left:"x",right:"y"},{op:"MUL",left:"x",right:"y"}],
  outputs:[{label:"sum",source:0},{label:"product",source:1}]};
const partialOutputProgram={...outputProgram,outputs:outputProgram.outputs.slice(0,1)};
let outputOracleCalls=0;
const outputOracle=(certificate:unknown)=>{
  outputOracleCalls++;const c=snapshotBoundedReasoningData(certificate) as {outputs?:{label:string;value:string}[];confidence?:number};
  const shaped=!!c&&Object.keys(c).sort().join() === "confidence,outputs"&&typeof c.confidence==="number"&&Number.isFinite(c.confidence)
    &&c.confidence>=0&&c.confidence<=1&&Array.isArray(c.outputs)&&c.outputs.length===2&&new Set(c.outputs.map(o=>o.label)).size===2
    &&c.outputs.every(o=>Object.keys(o).sort().join()==="label,value"&&typeof o.label==="string"&&typeof o.value==="string");
  // Independent integer specification: no native arithmetic/compiler helper.
  const x=BigInt(outputTask.problem.constants[1].value),y=BigInt(outputTask.problem.constants[2].value);
  const expected={sum:String(x+y),product:String(x*y)};
  const accepted=!!shaped&&Object.entries(expected).every(([label,value])=>c.outputs!.some(o=>o.label===label&&o.value===value));
  return {accepted,findings:accepted?[]:[shaped?"EXACT_OBJECTIVE_MISMATCH":"CERTIFICATE_SCHEMA_INVALID"],verificationDigest:theoryDigest({certificate,accepted})};
};
const outputInput={...outputTask,arm:"REASONING_WITH_WORKBENCH" as const,nativeExpressionGraph:true,limits:reuseLimits,verify:outputOracle,now:()=>1000};
const outputExchange=(program:unknown)=>({action:"SUBMIT_DERIVATION",analysisRequest:{problemDigest:theoryDigest(outputTask.problem),program},certificate:{confidence:0.8}});
let legacyOutputRequest:any,observedOutputRequest:any;
const legacyOutputRun=await runNyxQuantitativeTask({...outputInput,complete:async request=>{legacyOutputRequest=request;return responseFor(outputExchange(partialOutputProgram));}});
const observedOutputRun=await runNyxQuantitativeTask({...outputInput,objectiveOutputContract:"OBSERVE",complete:async request=>{observedOutputRequest=request;return responseFor(outputExchange(partialOutputProgram));}});
check(legacyOutputRun.outcome==="CERTIFICATE_SCHEMA_REJECTION"&&legacyOutputRun.toolRequests===1&&!legacyOutputRun.attempts[0].outputStructure
  &&observedOutputRun.outcome===legacyOutputRun.outcome&&observedOutputRun.toolRequests===1&&outputOracleCalls===2,
  "separate task reproduces missing-output schema rejection after native construction; observation alone changes no admission");
check(JSON.stringify(legacyOutputRequest)===JSON.stringify(observedOutputRequest)&&observedOutputRun.attempts[0].outputStructure?.actualCount===1
  &&observedOutputRun.attempts[0].outputStructure?.missingLabels===1,
  "counts-only observation preserves default model prompt, schema, budget and legacy classification exactly");
const enforcedOutputRun=await runNyxQuantitativeTask({...outputInput,objectiveOutputContract:"ENFORCE",complete:async()=>responseFor(outputExchange(partialOutputProgram))});
check(enforcedOutputRun.outcome==="OUTPUT_CONTRACT_REJECTION"&&enforcedOutputRun.toolRequests===0&&outputOracleCalls===2
  &&enforcedOutputRun.attempts[0].computation===null&&enforcedOutputRun.attempts[0].executedProgram===null,
  "enforcement rejects an incomplete objective before execution or oracle use, never supplies the omitted quantity");
let outputRepairCalls=0;
const repairedOutputs=await runNyxQuantitativeTask({...outputInput,objectiveOutputContract:"ENFORCE",limits:{...reuseLimits,maxCalls:2},complete:async request=>{
  outputRepairCalls++;const prompt=JSON.parse(request.messages[1].content);
  check(prompt.objectiveOutputContract.requiredCount===2&&prompt.objectiveOutputContract.requiredLabels.join() === "sum,product",
    "trusted opt-in exposes the public objective contract, not evaluator answers");
  if(outputRepairCalls===2)check(prompt.verificationFeedback.includes("OBJECTIVE_OUTPUT_LABEL_SET_INVALID")&&!prompt.previousObservation,
    "rejected output shape yields bounded actionable feedback without manufacturing a computed observation");
  return responseFor(outputExchange(outputRepairCalls===1?partialOutputProgram:outputProgram));}});
check(repairedOutputs.accepted&&repairedOutputs.calls===2&&repairedOutputs.toolRequests===1
  &&repairedOutputs.attempts[0].outcome==="OUTPUT_CONTRACT_REJECTION"&&repairedOutputs.attempts[1].outcome==="ACCEPTED",
  "E3 repair composes an independently supplied correct proposal; it is not a live reasoning-improvement claim");
const wrongOutputMath={...outputProgram,expressions:[{op:"SUB" as const,left:"x",right:"y"},outputProgram.expressions[1]]};
const wrongOutputRun=await runNyxQuantitativeTask({...outputInput,objectiveOutputContract:"ENFORCE",complete:async()=>responseFor(outputExchange(wrongOutputMath))});
check(!wrongOutputRun.accepted&&wrongOutputRun.outcome==="FUNCTIONAL_REJECTION"&&wrongOutputRun.toolRequests===1
  &&wrongOutputRun.attempts[0].outputStructure?.matches,
  "complete output shape is not evidence of correct equations and cannot override the independent mathematical oracle");
const reorderedOutputRun=await runNyxQuantitativeTask({...outputInput,objectiveOutputContract:"ENFORCE",complete:async()=>responseFor(outputExchange({...outputProgram,outputs:[...outputProgram.outputs].reverse()}))});
check(reorderedOutputRun.accepted,"objective set contract does not invent a fixed output-order requirement");
for(const badOutputs of [[outputProgram.outputs[0],outputProgram.outputs[0]],[{label:"unexpected",source:0},outputProgram.outputs[1]],[],null]){
  const r=await runNyxQuantitativeTask({...outputInput,objectiveOutputContract:"ENFORCE",complete:async()=>responseFor(outputExchange({...outputProgram,outputs:badOutputs}))});
  check(r.outcome==="OUTPUT_CONTRACT_REJECTION"&&r.toolRequests===0,"duplicate, unexpected, absent and non-array outputs fail closed before execution");
}
const manualMissing=await runNyxQuantitativeTask({...outputInput,arm:"CURRENT_DIRECT",nativeExpressionGraph:false,objectiveOutputContract:"ENFORCE",
  complete:async()=>responseFor({action:"SUBMIT",analysisRequest:null,certificate:{confidence:0.8,outputs:[{label:"sum",value:"-6"}]}})});
check(manualMissing.outcome==="OUTPUT_CONTRACT_REJECTION"&&manualMissing.toolRequests===0
  &&manualMissing.attempts[0].outputStructure?.origin==="CERTIFICATE_OUTPUTS","manual certificates obey the same output set without granting a control computation tool");
const staleOutputRun=await runNyxQuantitativeTask({...outputInput,objectiveOutputContract:"ENFORCE",complete:async()=>responseFor({...outputExchange(outputProgram),
  analysisRequest:{problemDigest:"stale",program:outputProgram}})});
check(staleOutputRun.outcome==="AUTHORIZATION_OR_IR_REJECTION"&&staleOutputRun.toolRequests===0,
  "output contract does not bypass native problem binding, expiry or authority");
let hostileOutputReads=0;
const hostileOutputs=[{get label(){hostileOutputReads++;return "sum";},source:0}];
check(quantitativeOutputStructure(outputTask.outputLabels,hostileOutputs).inputState==="UNINSPECTABLE_DATA"&&hostileOutputReads===0,
  "structural diagnostics reuse the native guard and reject accessors without invocation");
const cyclicOutputs:any=[];cyclicOutputs.push({label:"sum",source:cyclicOutputs});
check(quantitativeOutputStructure(outputTask.outputLabels,cyclicOutputs).inputState==="UNINSPECTABLE_DATA",
  "cyclic data cannot become an output-shape observation");
const opaqueShape=quantitativeOutputStructure(outputTask.outputLabels,[{label:"sum",value:"opaque_fixture_value"},{label:"product",value:"not_a_number"}]);
check(opaqueShape.matches&&!JSON.stringify(opaqueShape).includes("opaque_fixture_value")&&!JSON.stringify(opaqueShape).includes("sum"),
  "shape observations contain no values or candidate label strings and do not pretend to validate numerical content");
for(let size=1;size<=16;size++){
  const labels=Array.from({length:size},(_,i)=>`answer${i}`),entries=labels.map(label=>({label,source:"zero"}));
  check(quantitativeOutputStructure(labels,[...entries].reverse()).matches,"all native-supported output arities admit a complete set in any order");
  check(!quantitativeOutputStructure(labels,entries.slice(1)).matches,"all output arities reject omitted quantities");
  const duplicates=[...entries];duplicates[duplicates.length-1]=entries[0];
  check(size===1||!quantitativeOutputStructure(labels,duplicates).matches,"same count cannot hide a duplicated and missing quantity");
  check(!quantitativeOutputStructure(labels,[...entries,{label:"extra",source:"zero"}]).matches,"unrequested quantities do not enlarge the objective contract");
}
check(!quantitativeOutputStructure(["answer"],Array.from({length:17},()=>({label:"answer",source:"zero"}))).inspectionComplete,
  "oversized output arrays are bounded observations, not fully inspected or matching contracts");
for(const badLabels of [[],["a","a"],["invalid label"],Array.from({length:17},(_,i)=>`a${i}`)])
  check(throws(()=>quantitativeOutputStructure(badLabels,[])),"host objective label sets must be nonempty, distinct, bounded native identifiers");
const strictOutputSchema=quantitativeExchangeSchema(outputTask.outputLabels,true,false,theoryDigest(outputTask.problem),["zero","x","y"],null,null,false,true,true);
const strictOutputValidator=new graphSchemaValidator({allErrors:true}).compile(strictOutputSchema);
check(strictOutputValidator(outputExchange(outputProgram))&&!strictOutputValidator(outputExchange(partialOutputProgram)),
  "guided schema mirrors exact output cardinality without replacing local set/authority validation");
check(strictOutputValidator(outputExchange({...outputProgram,outputs:[outputProgram.outputs[0],outputProgram.outputs[0]]}))
  &&!quantitativeOutputStructure(outputTask.outputLabels,[outputProgram.outputs[0],outputProgram.outputs[0]]).matches,
  "JSON-schema collection count is not label uniqueness; local contract remains mandatory");
let invalidOutputSettingCalled=false;
try{await runNyxQuantitativeTask({...outputInput,objectiveOutputContract:"MODEL_CHOSEN" as any,complete:async()=>{
  invalidOutputSettingCalled=true;return responseFor(outputExchange(outputProgram));}});check(false,"invalid output mode must reject");}
catch{check(!invalidOutputSettingCalled,"model text cannot create an output-policy mode or new authority");}
const outputEvidenceProjection=JSON.stringify(publicRunForOutput(enforcedOutputRun));
function publicRunForOutput(run:typeof enforcedOutputRun){return {attempts:run.attempts.map(a=>({outcome:a.outcome,structure:a.outputStructure}))};}
check(!outputEvidenceProjection.includes("source")&&!outputEvidenceProjection.includes("sum")&&!outputEvidenceProjection.includes("-11")
  &&OBJECTIVE_OUTPUT_POLICY.authorityGranted===false&&OBJECTIVE_OUTPUT_POLICY.mathematicsSupplied===false,
  "count diagnosis does not persist raw programs, candidate names/values or become a mathematical generator");
check(REPAIR_CONTEXT_CASES.every(t=>![...EXPRESSION_TRANSFER_CASES,...NATIVE_GENERATION_CASES,...PROCEDURE_FAMILIES.flatMap(f=>[f.seed,...f.fresh])]
  .some(old=>theoryDigest(old.problem)===theoryDigest(t.problem))),"repair-context comparison does not reuse any exposed parameter set");
for(const task of REPAIR_CONTEXT_CASES){
  const s=BoundedReasoningSession.create(task.problem,graphLimits,Date.now,{expressionGraphs:true});
  const result=s.analyze({schemaVersion:1,operation:"ANALYZE_FINITE_PROBLEM",problemDigest:s.problemDigest,program:testExpressionWitness(task)});s.revoke();
  check(result.status==="CONSTRUCTED"&&verifyProcedureOutputs(task,{outputs:result.payload!.outputs,confidence:0.8}).accepted,
    "new context case is representable under the unchanged independent oracle and native resource bounds");
}
let contextEpochCalls=0;
const contextEpoch=await runNativeGenerationEpoch(async(request,stage)=>{
  contextEpochCalls++;const prompt=JSON.parse(request.messages[1].content),task=REPAIR_CONTEXT_CASES.find(t=>t.taskId===prompt.taskId)!;
  const treatment=stage.endsWith("GRAPH_WITH_ADMITTED_CONTEXT"),second=prompt.verificationFeedback.length>0;
  check(prompt.objectiveOutputContract.requiredCount===task.outputLabels.length&&prompt.nativeExpressionGraph.schemaVersion===4
    &&request.reasoningControl==="SUPER_HOSTED_NATIVE"&&request.reasoningBudgetTokens===2048&&request.maxTokens===8192,
    "both context arms share model, tool representation, objective completeness and inference caps");
  check(Boolean(prompt.lastAdmittedDerivation) === (treatment&&second),
    "only a later treatment call receives its own admitted candidate; no first-call or control state injection");
  if(prompt.lastAdmittedDerivation)check(prompt.lastAdmittedDerivation.independentEvaluation.accepted===false
    &&prompt.lastAdmittedDerivation.independentEvaluation.findings.includes("EXACT_OBJECTIVE_MISMATCH")
    &&prompt.lastAdmittedDerivation.grantsAuthority===false&&JSON.stringify(prompt.lastAdmittedDerivation).length<=REPAIR_CONTEXT_EPOCH.maxAdmittedContextBytes,
    "bounded repair context carries original falsification and provenance, never oracle answers or authority");
  const wrong={schemaVersion:4,expressions:[],outputs:task.outputLabels.map(label=>({label,source:"zero"}))};
  const program=treatment&&second?testExpressionWitness(task):wrong;
  return responseFor({action:"SUBMIT_DERIVATION",analysisRequest:{problemDigest:theoryDigest(task.problem),program},certificate:{confidence:0.8}});
},{candidate:"0".repeat(40),sourceDigests:{}},Date.now,async()=>{},"REPAIR_CONTEXT");
check(contextEpochCalls===16&&contextEpoch.summaries[0].accepted===0&&contextEpoch.summaries[1].accepted===4
  &&contextEpoch.summaries[1].firstAttemptAccepted===0&&contextEpoch.summaries[1].repairedAccepted===4
  &&contextEpoch.summaries[0].admittedContextAttempts===0&&contextEpoch.summaries[1].admittedContextAttempts===4,
  "E3 injected corrector validates context custody and separate first/repair accounting, not actual model capability");
check(contextEpoch.scopedRepairSignal&&contextEpoch.pairs.every(p=>p.realizedComputeMatched&&p.addedAcceptedRepairAgainstGradedFailure)
  &&contextEpoch.promotion.startsWith("NONE_"),"E3 scoring recognizes a supported repaired-outcome pattern but never automatically promotes it");
check(DIRECT_NATIVE_CASES.length===4&&DIRECT_NATIVE_CASES.every(t=>![...REPAIR_CONTEXT_CASES,...EXPRESSION_TRANSFER_CASES,
  ...NATIVE_GENERATION_CASES,...PROCEDURE_FAMILIES.flatMap(f=>[f.seed,...f.fresh])]
  .some(old=>theoryDigest(old.problem)===theoryDigest(t.problem))),
  "direct/native diagnosis freezes fresh parameter values, never a replay of failed old objectives");
for(const task of DIRECT_NATIVE_CASES){
  const s=BoundedReasoningSession.create(task.problem,graphLimits,Date.now,{expressionGraphs:true});
  const result=s.analyze({schemaVersion:1,operation:"ANALYZE_FINITE_PROBLEM",problemDigest:s.problemDigest,program:testExpressionWitness(task)});s.revoke();
  check(result.status==="CONSTRUCTED"&&verifyProcedureOutputs(task,{outputs:result.payload!.outputs,confidence:0.8}).accepted,
    "direct/native fresh objective is representable under unchanged interpreter and independent oracle");
}
function directNativeProposal(prompt:any,direct:boolean,correct:boolean){
  const task=DIRECT_NATIVE_CASES.find(t=>t.taskId===prompt.taskId)!;
  if(direct)return{action:"SUBMIT",analysisRequest:null,certificate:{outputs:correct?expectedProcedureOutputs(task):
    task.outputLabels.map(label=>({label,value:"0"})),confidence:0.8}};
  return{action:"SUBMIT_DERIVATION",analysisRequest:{problemDigest:theoryDigest(task.problem),
    program:correct?testExpressionWitness(task):{schemaVersion:4,expressions:[],outputs:task.outputLabels.map(label=>({label,source:"zero"}))}},
    certificate:{confidence:0.8}};
}
for(const winner of ["BOTH","DIRECT","NATIVE","NEITHER"] as const){
  const wirePolicies:string[]=[],requestCounts=new Map<string,number>();
  const e=await runNativeGenerationEpoch(async(request,stage)=>{
    const prompt=JSON.parse(request.messages[1].content),direct=stage.endsWith("DIRECT_REASONED");
    requestCounts.set(stage,(requestCounts.get(stage)??0)+1);
    check(request.inferencePolicy==="REASONING_JSON"&&request.reasoningControl==="SUPER_HOSTED_NATIVE"
      &&request.reasoningEffort===undefined&&request.reasoningBudgetTokens===2048&&request.maxTokens===8192,
      "direct control is reasoning-enabled under identical Super wire controls, not reasoning-disabled CURRENT_DIRECT");
    wirePolicies.push(JSON.stringify({policy:request.inferencePolicy,control:request.reasoningControl,
      budget:request.reasoningBudgetTokens,output:request.maxTokens,temperature:request.temperature}));
    check(Boolean(prompt.availableTool)===!direct&&Boolean(prompt.nativeExpressionGraph)===!direct
      &&prompt.objectiveOutputContract.requiredCount===prompt.outputLabels.length&&!prompt.lastAdmittedDerivation,
      "deliberate tool-availability difference shares public objective, exact output set and no hidden repair context");
    const schema=request.responseFormat as any;
    check(schema.schema.anyOf.length===(direct?1:prompt.artifactReference?4:2),
      "direct exposes only submission; native retains existing bound-artifact choices after actual execution");
    return responseFor(directNativeProposal(prompt,direct,winner==="BOTH"||winner===(direct?"DIRECT":"NATIVE")));
  },{candidate:"0".repeat(40),sourceDigests:{}},Date.now,async()=>{},"DIRECT_NATIVE");
  check(new Set(wirePolicies).size===1&&e.complete&&e.providerStable&&e.summaries[0].nativeExecutions===0
    &&e.summaries[0].usage.toolRequests===0&&e.summaries.every(s=>s.firstAttemptAccepted===(winner==="BOTH"
      ||winner===(s.arm==="DIRECT_REASONED"?"DIRECT":"NATIVE")?4:0)),
    "E3 injected witnesses prove matched configuration and distinct accounting, not live cognitive success");
  const expected=winner==="BOTH"?"BOTH_ACCEPTED":winner==="DIRECT"?"DIRECT_ONLY_ACCEPTED":
    winner==="NATIVE"?"NATIVE_ONLY_ACCEPTED":"BOTH_REJECTED_MATHEMATICS";
  check(e.diagnosticContrasts?.every(d=>d.contrast===expected&&d.directMathematicallyGraded&&d.nativeMathematicallyGraded)
    &&e.summaries.every(s=>s.mathematicallyGraded===4),
    "diagnostic distinguishes direct/native acceptance from two wrong valid mathematical paths");
  check(e.directCertificateSignal===(winner==="DIRECT")&&e.scopedFunctionalSignal===(winner==="NATIVE")
    &&e.promotion.startsWith("NONE_")&&e.logicalCalls<=(DIRECT_NATIVE_EPOCH.maxLogicalCalls),
    "cost-bounded scoped patterns are diagnosable, never automatic authority/default or broad promotion");
  check([...requestCounts.values()].every(n=>n<=2)&&e.summaries.every(s=>s.repairedAccepted===0),
    "first-pass successes and two rejected attempts cannot be merged into an invented repaired success");
}
const directAuthorizationEpoch=await runNativeGenerationEpoch(async(request,stage)=>{
  const prompt=JSON.parse(request.messages[1].content),direct=stage.endsWith("DIRECT_REASONED");
  return responseFor(directNativeProposal(prompt,false,direct));
},{candidate:"0".repeat(40),sourceDigests:{}},Date.now,async()=>{},"DIRECT_NATIVE");
check(directAuthorizationEpoch.summaries[0].nativeAuthorizationRejections===8&&directAuthorizationEpoch.summaries[0].graded===0
  &&directAuthorizationEpoch.summaries[0].usage.toolRequests===0&&directAuthorizationEpoch.summaries[1].functionalRejections===8
  &&directAuthorizationEpoch.diagnosticContrasts?.every(d=>d.contrast==="NEITHER_ACCEPTED_WITH_UNGRADED_BOUNDARY"),
  "attempting native execution in direct control fails closed; unreached direct grades are not reasoning failures");
const manualNativeEpoch=await runNativeGenerationEpoch(async request=>{
  const prompt=JSON.parse(request.messages[1].content);return responseFor(directNativeProposal(prompt,true,true));
},{candidate:"0".repeat(40),sourceDigests:{}},Date.now,async()=>{},"DIRECT_NATIVE");
check(manualNativeEpoch.summaries.every(s=>s.accepted===4&&s.nativeExecutions===0&&s.manualGradedProposals===4)
  &&manualNativeEpoch.diagnosticContrasts?.every(d=>d.contrast==="BOTH_ACCEPTED")&&!manualNativeEpoch.scopedFunctionalSignal,
  "manual success in the native-available arm is not misrepresented as executed native-program success");
for(const task of DIRECT_REFORMULATION_CASES){
  check(![...DIRECT_NATIVE_CASES,...REPAIR_CONTEXT_CASES,...EXPRESSION_TRANSFER_CASES,...NATIVE_GENERATION_CASES,
    ...PROCEDURE_FAMILIES.flatMap(f=>[f.seed,...f.fresh])].some(old=>theoryDigest(old.problem)===theoryDigest(task.problem)),
    "public-model repair freezes new parameters, never the exposed direct/native answers");
  const witness=testExpressionWitness(task),session=BoundedReasoningSession.create(task.problem,
    {maxRequests:1,maxWorkUnits:100000,maxElapsedMs:2000,expiresAtEpochMs:Date.now()+10000},Date.now,{expressionGraphs:true});
  try{const execution=session.analyze({schemaVersion:1,operation:"ANALYZE_FINITE_PROBLEM",problemDigest:session.problemDigest,program:witness});
    check(execution.status==="CONSTRUCTED"&&verifyProcedureOutputs(task,{outputs:execution.payload!.outputs,confidence:0.5}).accepted,
      "separately authored development witness confirms fresh-task solvability under unchanged independent oracle");
  }finally{session.revoke();}
}
check(theoryDigest(DIRECT_REFORMULATION_CASES)===DIRECT_REFORMULATION_CORPUS_DIGEST
  &&DIRECT_REFORMULATION_EPOCH.maxLogicalCalls===32&&DIRECT_REFORMULATION_EPOCH.maxPhysicalLogicalCalls===28
  &&DIRECT_REFORMULATION_EPOCH.maxHttpAttemptsPerEpoch===28,"shared-prefix physical and allocated ceilings are explicit and distinct");
for(const succeeds of [true,false]){
  const firstRequests=new Map<string,number>(),calls=new Map<string,number>();
  const epoch=await runNativeGenerationEpoch(async(request,stage)=>{
    const prompt=JSON.parse(request.messages[1].content),task=DIRECT_REFORMULATION_CASES.find(t=>t.taskId===prompt.taskId)!;
    calls.set(stage,(calls.get(stage)??0)+1);
    const formulation=typeof request.responseFormat==="object"&&request.responseFormat.name==="nyx_public_model_formulation";
    if(!formulation){check(prompt.availableTool===null&&prompt.artifactReference===null
      &&(request.responseFormat as any).schema.anyOf.length===1,
      "both repair arms expose only manual certificates, not native actions or accepted artifacts");
      if(!prompt.verificationFeedback.length)firstRequests.set(task.taskId,(firstRequests.get(task.taskId)??0)+1);
    }else check(prompt.authority==="NONE_PUBLIC_MODEL_PROPOSAL_ONLY"&&prompt.independentFeedback.includes("EXACT_OBJECTIVE_MISMATCH")
      &&prompt.lastAdmittedEquations===null,"formulation receives original rejection, not an oracle answer or invented executed program");
    check(request.inferencePolicy==="REASONING_JSON"&&request.reasoningControl==="SUPER_HOSTED_NATIVE"
      &&request.reasoningBudgetTokens===2048&&request.maxTokens===8192,"shared repair arms retain identical reasoning-enabled model wire controls");
    return responseFor(formulation?{problemDigest:theoryDigest(task.problem),equations:task.outputLabels.map(label=>({label,expression:`public definition of ${label}`})),assumptions:[]}:
      {action:"SUBMIT",analysisRequest:null,certificate:{outputs:succeeds&&prompt.publicModelRevision?expectedProcedureOutputs(task):
        task.outputLabels.map(label=>({label,value:"0"})),confidence:0.5}});
  },{candidate:"0".repeat(40),sourceDigests:{}},Date.now,async()=>{},"DIRECT_REFORMULATION");
  check(epoch.complete&&epoch.providerStable&&epoch.repairAssessment?.firstProposalMatched
    &&firstRequests.size===4&&[...firstRequests.values()].every(n=>n===1),"one actual common proposal is replayed into independent sessions for each task");
  check(epoch.repairAssessment?.exposures.length===4&&epoch.summaries[0].accepted===0
    &&epoch.summaries[1].accepted===(succeeds?4:0)&&epoch.scopedRepairSignal===succeeds,
    "E3 composition/scoring distinguishes delivered repair benefit from an unhelpful public formulation");
  check(epoch.summaries.every(s=>s.firstAttemptAccepted===0&&s.usage.toolRequests===0&&s.nativeExecutions===0)
    &&epoch.summaries[1].repairedAccepted===(succeeds?4:0)&&epoch.summaries[1].formulationCalls===4,
    "no fresh first-attempt or tool capability is fabricated from a scripted repair");
  check(epoch.physicalInferenceTotals?.calls===(succeeds?24:28)&&epoch.physicalLogicalCalls===(succeeds?24:28)
    &&epoch.logicalCalls===(succeeds?28:32)&&epoch.totals.calls===epoch.logicalCalls
    &&[...calls.values()].every(n=>n<=4)&&epoch.pairs.every(p=>p.boundedNoMoreModelCompute),
    "common inference is physically counted once but charged to both arms, including formulation cost");
  check(!JSON.stringify(epoch).includes("public definition of")&&epoch.promotion.startsWith("NONE_"),
    "raw public equations/private reasoning are not persisted; successful test doubles cannot promote cognition");
}
const firstSuccess=await runNativeGenerationEpoch(async request=>{
  const prompt=JSON.parse(request.messages[1].content),task=DIRECT_REFORMULATION_CASES.find(t=>t.taskId===prompt.taskId)!;
  check(typeof request.responseFormat!=="object"||request.responseFormat.name!=="nyx_public_model_formulation","accepted first proposals must not trigger extra mathematical formulation");
  return responseFor({action:"SUBMIT",analysisRequest:null,certificate:{outputs:expectedProcedureOutputs(task),confidence:0.5}});
},{candidate:"0".repeat(40),sourceDigests:{}},Date.now,async()=>{},"DIRECT_REFORMULATION");
check(firstSuccess.physicalLogicalCalls===4&&firstSuccess.logicalCalls===8&&firstSuccess.summaries.every(s=>s.firstAttemptAccepted===4&&s.formulationCalls===0)
  &&firstSuccess.repairAssessment?.exposures.length===0&&!firstSuccess.scopedRepairSignal,
  "already-correct shared first answers are retained without attribution to an unexercised repair mechanism");
let prefixClock=Date.now(),prefixCalls=0;
const exhaustedPrefix=await runNativeGenerationEpoch(async request=>{
  prefixCalls++;prefixClock+=DIRECT_REFORMULATION_EPOCH.maxStageMs+1;
  const prompt=JSON.parse(request.messages[1].content),task=DIRECT_REFORMULATION_CASES.find(t=>t.taskId===prompt.taskId)!;
  return responseFor({action:"SUBMIT",analysisRequest:null,certificate:{outputs:expectedProcedureOutputs(task),confidence:0.5}});
},{candidate:"0".repeat(40),sourceDigests:{}},()=>prefixClock,async()=>{},"DIRECT_REFORMULATION");
check(prefixCalls===4&&exhaustedPrefix.rows.filter(r=>r.blocked==="SHARED_PREFIX_TASK_BUDGET_EXHAUSTED").length===4
  &&exhaustedPrefix.rows.filter(r=>r.run).every(r=>r.run!.outcome==="LATE_RESPONSE_NOT_ADMITTED")
  &&!exhaustedPrefix.complete&&!exhaustedPrefix.scopedRepairSignal,
  "replaying common inference cannot replenish an exhausted original stage lease or admit a late correct answer");
// Terminal live evidence is immutable; these checks bind custody and accounting,
// not a claim that a successful E3 test double establishes model reasoning.
const contextReceipt=JSON.parse(readFileSync("docs/omega/evidence/nyx-repair-context-e6682829.json","utf8"));
const frozenContext=contextReceipt.frozenReport,contextReceiptBytes=Buffer.from(JSON.stringify(frozenContext,null,2)+"\n");
check(createHash("sha256").update(contextReceiptBytes).digest("hex")===contextReceipt.integrity.reportSha256
  &&contextReceiptBytes.length===contextReceipt.integrity.reportBytes&&theoryDigest(frozenContext.freeze)===frozenContext.freezeDigest,
  "context receipt reconstructs exact verified artifact bytes and freeze without modifying outcomes");
for(const [path,digest] of Object.entries(frozenContext.freeze.sourceDigests)){
  if(!/^(?:src|scripts)\/[A-Za-z0-9_./-]+\.ts$/.test(path)||path.split("/").includes(".."))throw Error("unsafe_context_receipt_source_path");
  check(theoryDigest(execFileSync("git",["show",`${contextReceipt.evaluatedCandidate}:${path}`],{encoding:"utf8"}))===digest,
    `context receipt binds historical source ${path}`);
}
check(theoryDigest(frozenContext.freeze.configuration)===theoryDigest(REPAIR_CONTEXT_EPOCH)
  &&frozenContext.freeze.tasks.length===4&&frozenContext.freeze.tasks.every((b:any)=>REPAIR_CONTEXT_CASES.some(t=>t.taskId===b.taskId&&theoryDigest(t)===b.digest)),
  "context model, controls, fresh corpus, oracle and caps remain frozen");
const contextObserved=frozenContext.rows.flatMap((r:any)=>r.run.attempts);
check(contextObserved.length===16&&contextObserved.every((a:any)=>a.modelEvidence.evidenceClass==="E4"
  &&a.modelEvidence.model===REPAIR_CONTEXT_EPOCH.model&&a.modelEvidence.finishReason==="stop"&&a.modelEvidence.usage.totalTokens!==null)
  &&frozenContext.totals.calls===16&&frozenContext.totals.httpAttempts===16&&frozenContext.totals.reportedTokens===75599
  &&frozenContext.totals.unknownUsageCalls===0&&frozenContext.totals.unknownUsageHttpAttempts===0&&frozenContext.providerStable,
  "sixteen stable deliveries and complete usage cannot be mislabeled as provider failure or cognitive improvement");
check(contextObserved.every((a:any)=>a.outputStructure?.matches&&a.outputStructure.inspectionComplete
  &&a.outputStructure.missingLabels===0&&a.outputStructure.duplicateLabels===0&&a.outputStructure.unexpectedLabels===0)
  &&frozenContext.summaries.every((s:any)=>s.outputContractRejections===0&&!s.outcomes.CERTIFICATE_SCHEMA_REJECTION),
  "every output set was complete in this corpus; common interface success is not a between-epoch causal gain");
check(frozenContext.summaries[0].arm==="GRAPH_WITH_OUTPUT_CONTRACT"&&frozenContext.summaries[0].irRejections===1
  &&frozenContext.summaries[0].nativeExecutions===7&&frozenContext.summaries[0].functionalRejections===7
  &&frozenContext.summaries[1].arm==="GRAPH_WITH_ADMITTED_CONTEXT"&&frozenContext.summaries[1].irRejections===3
  &&frozenContext.summaries[1].nativeExecutions===5&&frozenContext.summaries[1].functionalRejections===5,
  "control and treatment execution failures remain distinct from native IR rejection");
check(contextObserved.filter((a:any)=>a.outcome==="AUTHORIZATION_OR_IR_REJECTION"&&a.findings[0].endsWith(":SOURCE_NOT_BOUND")).length===2
  &&contextObserved.filter((a:any)=>a.outcome==="AUTHORIZATION_OR_IR_REJECTION"&&a.findings[0].endsWith(":OUTPUT_BINDING")).length===2
  &&frozenContext.summaries.every((s:any)=>s.nativeAuthorizationRejections===0),
  "invalid expression references and output bindings are interface failures, not authority refusals or reasoning grades");
check(frozenContext.rows.filter((r:any)=>r.run.attempts.some((a:any)=>a.outcome==="FUNCTIONAL_REJECTION")).length===7
  &&contextReceipt.accounting.mathematicallyGradedStages===7&&contextReceipt.accounting.ungradedAttemptedStages===1
  &&contextReceipt.accounting.acceptanceEvaluatedStages===7&&contextReceipt.frozenMetadataAnnotation.frozenOutcomeAltered===false,
  "one IR-only stage remains ungraded; twelve wrong proposals are not twelve distinct tasks");
check(contextObserved.filter((a:any)=>a.call===1&&a.outcome==="FUNCTIONAL_REJECTION").length===5
  &&contextObserved.filter((a:any)=>a.call===2&&a.outcome==="FUNCTIONAL_REJECTION").length===7
  &&contextReceipt.accounting.firstAttempts.correct===0&&contextReceipt.accounting.secondAttempts.correct===0,
  "first and repaired mathematical outcomes remain separate with no ever-correct accumulation");
const actualContext=contextObserved.filter((a:any)=>typeof a.repairContextProgramDigest==="string");
check(actualContext.length===2&&actualContext.every((a:any)=>a.call===2&&a.outcome==="FUNCTIONAL_REJECTION")
  &&frozenContext.summaries[0].admittedContextAttempts===0&&frozenContext.summaries[1].admittedContextAttempts===2
  &&frozenContext.pairs.filter((p:any)=>p.boundedAdmittedContextUsed).length===2,
  "only two admitted-context repairs were exercised; enabled configuration does not prove every task consumed it");
check(frozenContext.complete&&frozenContext.sourceUnchanged&&!frozenContext.scopedRepairSignal&&!frozenContext.scopedFunctionalSignal
  &&frozenContext.summaries.every((s:any)=>s.accepted===0&&s.firstAttemptAccepted===0&&s.repairedAccepted===0)
  &&frozenContext.pairs.every((p:any)=>!p.realizedComputeMatched&&!p.addedAcceptedRepairAgainstGradedFailure)
  &&frozenContext.pairs.filter((p:any)=>p.boundedNoMoreModelCompute).length===2
  &&frozenContext.summaries[0].usage.reportedTokens===38349&&frozenContext.summaries[1].usage.reportedTokens===37250
  &&contextReceipt.diagnosis.cognitiveGainDemonstrated===false&&contextReceipt.diagnosis.defaultChanged===false,
  "zero accepted outcomes and unmatched pairs prohibit repair, cognition, default, authority or recursion promotion");
const directReceipt=JSON.parse(readFileSync("docs/omega/evidence/nyx-direct-native-ad83dc8e.json","utf8"));
const frozenDirect=directReceipt.frozenReport,directReceiptBytes=Buffer.from(JSON.stringify(frozenDirect,null,2)+"\n");
check(createHash("sha256").update(directReceiptBytes).digest("hex")===directReceipt.integrity.reportSha256
  &&directReceiptBytes.length===directReceipt.integrity.reportBytes&&theoryDigest(frozenDirect.freeze)===frozenDirect.freezeDigest,
  "direct/native receipt reconstructs independently verified exact report bytes and frozen identity");
for(const [path,digest] of Object.entries(frozenDirect.freeze.sourceDigests)){
  if(!/^(?:src|scripts)\/[A-Za-z0-9_./-]+\.ts$/.test(path)||path.split("/").includes(".."))throw Error("unsafe_direct_receipt_source_path");
  check(theoryDigest(execFileSync("git",["show",`${directReceipt.evaluatedCandidate}:${path}`],{encoding:"utf8"}))===digest,
    `direct/native receipt binds historical source ${path}`);
}
check(theoryDigest(frozenDirect.freeze.configuration)===theoryDigest(DIRECT_NATIVE_EPOCH)
  &&frozenDirect.freeze.tasks.length===4&&frozenDirect.freeze.tasks.every((b:any)=>DIRECT_NATIVE_CASES.some(t=>t.taskId===b.taskId&&theoryDigest(t)===b.digest)),
  "direct/native model, oracle, task identity and finite controls remain frozen");
const directObserved=frozenDirect.rows.flatMap((r:any)=>r.run.attempts),directSummary=frozenDirect.summaries[0],nativeSummary=frozenDirect.summaries[1];
check(directObserved.length===15&&directObserved.every((a:any)=>a.modelEvidence.evidenceClass==="E4"
  &&a.modelEvidence.model===DIRECT_NATIVE_EPOCH.model&&a.modelEvidence.finishReason==="stop"&&a.modelEvidence.usage.totalTokens!==null)
  &&frozenDirect.totals.calls===15&&frozenDirect.totals.httpAttempts===15&&frozenDirect.totals.reportedTokens===55474
  &&frozenDirect.totals.unknownUsageCalls===0&&frozenDirect.totals.unknownUsageHttpAttempts===0&&frozenDirect.providerStable,
  "fifteen stable live deliveries and known compute cannot be mislabeled as delivery failure or cognition gain");
check(directObserved.every((a:any)=>a.outputStructure?.matches&&a.outputStructure.inspectionComplete)
  &&frozenDirect.summaries.every((s:any)=>s.outputContractRejections===0&&!s.outcomes.CERTIFICATE_SCHEMA_REJECTION),
  "all fifteen original output sets are complete; no schema or output contract is weakened for credit");
check(directSummary.arm==="DIRECT_REASONED"&&directSummary.accepted===1&&directSummary.firstAttemptAccepted===1
  &&directSummary.repairedAccepted===0&&directSummary.manualGradedProposals===7&&directSummary.nativeExecutions===0
  &&directSummary.functionalRejections===6&&directSummary.usage.calls===7&&directSummary.usage.reportedTokens===19231,
  "one direct first-attempt success and six exact-certificate failures remain separate from successful repairs");
check(nativeSummary.arm==="NATIVE_GRAPH"&&nativeSummary.accepted===0&&nativeSummary.irRejections===5
  &&nativeSummary.nativeExecutions===3&&nativeSummary.constructedNativeProposals===2&&nativeSummary.functionalRejections===2
  &&nativeSummary.outcomes.DERIVATION_INSUFFICIENT===1&&nativeSummary.manualGradedProposals===0
  &&nativeSummary.usage.calls===8&&nativeSummary.usage.reportedTokens===36243,
  "tool availability is distinguished from three actual executions, two graded native candidates and one insufficient derivation");
check(directObserved.filter((a:any)=>a.outcome==="AUTHORIZATION_OR_IR_REJECTION"&&a.findings[0].endsWith(":SOURCE_NOT_BOUND")).length===5
  &&frozenDirect.summaries.every((s:any)=>s.nativeAuthorizationRejections===0)
  &&frozenDirect.rows.filter((r:any)=>r.run.attempts.some((a:any)=>["ACCEPTED","FUNCTIONAL_REJECTION"].includes(a.outcome))).length===6
  &&directReceipt.accounting.ungradedAttemptedStages===2&&directReceipt.accounting.unexecutedStages===0,
  "five interface failures are not authorization failures; two unreached mathematical stages stay ungraded");
check(directObserved.filter((a:any)=>a.call===1&&a.outcome==="ACCEPTED").length===1
  &&directObserved.filter((a:any)=>a.call===1&&a.outcome==="FUNCTIONAL_REJECTION").length===5
  &&directObserved.filter((a:any)=>a.call===2&&a.outcome==="FUNCTIONAL_REJECTION").length===3
  &&directReceipt.accounting.firstAttempts.correct===1&&directReceipt.accounting.secondAttempts.correct===0,
  "initial and second-attempt outcomes are preserved without best-of accumulation");
const directCerts=frozenDirect.rows.filter((r:any)=>r.arm==="DIRECT_REASONED").flatMap((r:any)=>r.run.attempts);
check(directCerts.length===7&&directCerts.every((a:any)=>a.confidence===1)
  &&directReceipt.frozenMetadataAnnotation.gradedCounterMeaning==="EXACT_ACCEPTANCE_CALLBACK_REACHED_NOT_DIRECT_NONCANONICAL_EQUIVALENCE_CLASSIFICATION",
  "observed confidence does not overrule exact acceptance; noncanonical-equivalence uncertainty is retained");
check(frozenDirect.complete&&frozenDirect.sourceUnchanged&&frozenDirect.directCertificateSignal
  &&!frozenDirect.scopedFunctionalSignal&&!frozenDirect.scopedRepairSignal
  &&frozenDirect.pairs.every((p:any)=>p.originalNoMoreModelCompute&&!p.realizedComputeMatched)
  &&frozenDirect.diagnosticContrasts.filter((d:any)=>d.contrast==="DIRECT_ONLY_ACCEPTED").length===1
  &&directReceipt.diagnosis.cognitiveGainDemonstrated===false&&!directReceipt.diagnosis.defaultChanged
  &&directReceipt.frozenMetadataAnnotation.frozenOutcomeAltered===false,
  "one lower-compute diagnostic success is not causal, cognitive, default, authority or recursive promotion");
const reformReceipt=JSON.parse(readFileSync("docs/omega/evidence/nyx-direct-model-repair-3da83e22.json","utf8"));
const frozenReform=reformReceipt.frozenReport,reformBytes=Buffer.from(JSON.stringify(frozenReform,null,2)+"\n");
check(createHash("sha256").update(reformBytes).digest("hex")===reformReceipt.integrity.reportSha256
  &&reformBytes.length===reformReceipt.integrity.reportBytes&&theoryDigest(frozenReform.freeze)===frozenReform.freezeDigest,
  "public-model repair receipt reconstructs the exact verified artifact, not a regraded epoch");
for(const [path,digest] of Object.entries(frozenReform.freeze.sourceDigests)){
  if(!/^(?:src|scripts)\/[A-Za-z0-9_./-]+\.ts$/.test(path)||path.split("/").includes(".."))throw Error("unsafe_reform_receipt_source_path");
  check(theoryDigest(execFileSync("git",["show",`${reformReceipt.evaluatedCandidate}:${path}`],{encoding:"utf8"}))===digest,
    `public-model repair receipt binds historical source ${path}`);
}
check(theoryDigest(frozenReform.freeze.configuration)===theoryDigest(DIRECT_REFORMULATION_EPOCH)
  &&frozenReform.freeze.tasks.length===4&&frozenReform.freeze.tasks.every((b:any)=>DIRECT_REFORMULATION_CASES.some(t=>t.taskId===b.taskId&&theoryDigest(t)===b.digest)),
  "shared repair comparison retains the frozen fresh inputs, model, exact oracle and finite limits");
const reformAllocated=frozenReform.rows.flatMap((r:any)=>r.run.attempts);
const reformPhysical=frozenReform.rows.flatMap((r:any)=>r.run.attempts.filter((_:any,i:number)=>!(i===0&&r.sharedProposal.replayed)));
const reformPrefixes=frozenReform.rows.filter((r:any)=>r.sharedProposal.replayed);
check(reformPrefixes.length===4&&reformPrefixes.every((r:any)=>{
  const original=frozenReform.rows.find((a:any)=>a.taskId===r.taskId&&!a.sharedProposal.replayed);
  return original&&theoryDigest(original.run.attempts[0])===theoryDigest(r.run.attempts[0])
    &&original.sharedProposal.intentDigest===r.sharedProposal.intentDigest
    &&original.sharedProposal.sourceEvidenceId===r.sharedProposal.sourceEvidenceId
    &&r.sharedPrefixChargedMs===r.sharedProposal.prefixElapsedMs&&r.allocatedElapsedMs===r.run.usage.elapsedMs+r.sharedPrefixChargedMs;
}),"both owned sessions receive the identical first model proposal and charge its inference time without renewing the original budget");
check(reformAllocated.length===32&&reformPhysical.length===28&&frozenReform.logicalCalls===32&&frozenReform.physicalLogicalCalls===28
  &&frozenReform.totals.calls===32&&frozenReform.physicalInferenceTotals.calls===28
  &&frozenReform.totals.reportedTokens===84418&&frozenReform.physicalInferenceTotals.reportedTokens===73397
  &&reformPhysical.reduce((n:number,a:any)=>n+a.modelEvidence.usage.totalTokens,0)===73397
  &&reformPrefixes.reduce((n:number,r:any)=>n+r.run.attempts[0].modelEvidence.usage.totalTokens,0)===11021,
  "four shared-prefix replays are fully charged to both arms but are not invented as four additional physical model calls");
check(reformPhysical.every((a:any)=>a.modelEvidence.evidenceClass==="E4"&&a.modelEvidence.model===DIRECT_REFORMULATION_EPOCH.model
  &&a.modelEvidence.statusCode===200&&a.modelEvidence.finishReason==="stop"&&a.modelEvidence.usage.totalTokens!==null
  &&a.modelEvidence.delivery.httpAttempts===1&&!a.modelEvidence.delivery.authorityRenewed)
  &&frozenReform.providerStable&&frozenReform.totals.unknownUsageCalls===0&&frozenReform.totals.unknownUsageHttpAttempts===0
  &&reformReceipt.accounting.physicalUnknownUsageHttpAttempts===0,
  "all twenty-eight physical deliveries have known usage; the negative result is not a provider or truncation failure");
check(frozenReform.rows.length===8&&frozenReform.rows.every((r:any)=>r.blocked===null&&r.run.usage.calls===4
  &&r.run.usage.toolRequests===0&&r.run.attempts.every((a:any)=>a.nativeExecution===null))
  &&frozenReform.summaries.every((s:any)=>s.graded===4&&s.accepted===0&&s.firstAttemptAccepted===0&&s.repairedAccepted===0&&s.unexecuted===0),
  "all eight stages reached exact acceptance with no tools, ungraded boundary, first success or successful repair");
check(reformAllocated.filter((a:any)=>a.call===1&&a.outcome==="FUNCTIONAL_REJECTION").length===8
  &&reformAllocated.filter((a:any)=>a.call>1&&a.outcome==="FUNCTIONAL_REJECTION").length===20
  &&reformPhysical.filter((a:any)=>a.outcome==="FUNCTIONAL_REJECTION").length===24
  &&reformReceipt.accounting.firstAttempts.physicallyGeneratedProposals===4,
  "allocated first and later failures are not conflated with independent physical proposals or distinct tasks");
check(frozenReform.summaries[0].formulationCalls===0&&frozenReform.summaries[0].functionalRejections===16
  &&frozenReform.summaries[1].formulationCalls===4&&frozenReform.summaries[1].admittedFormulations===1
  &&frozenReform.summaries[1].functionalRejections===12&&frozenReform.summaries[1].outcomes.MODEL_FORMULATION_REJECTION===3
  &&frozenReform.repairAssessment.firstProposalMatched&&frozenReform.repairAssessment.exposures.length===1
  &&frozenReform.repairAssessment.exposures[0].repaired===false,
  "one delivered unverified formulation failed to repair; three contract rejections remain separate interface failures of unknown precise cause");
check(reformAllocated.filter((a:any)=>a.confidence!==null).length===28
  &&reformAllocated.filter((a:any)=>a.confidence!==null).every((a:any)=>a.confidence===1&&a.outputStructure.matches&&a.outputStructure.inspectionComplete)
  &&reformReceipt.frozenMetadataAnnotation.gradedCounterMeaning==="EXACT_ACCEPTANCE_CALLBACK_REACHED_NOT_DIRECT_NONCANONICAL_EQUIVALENCE_CLASSIFICATION",
  "complete output sets and confidence one do not overrule exact acceptance or establish whether noncanonical values were equivalent");
check(frozenReform.summaries[0].usage.reportedTokens===44197&&frozenReform.summaries[1].usage.reportedTokens===40221
  &&frozenReform.pairs.every((p:any)=>p.boundedNoMoreModelCompute)
  &&frozenReform.pairs.filter((p:any)=>p.realizedComputeMatched).length===1
  &&frozenReform.pairs.filter((p:any)=>p.repairComputeMatched).length===1
  &&frozenReform.repairAssessment.verdict==="NO_COMPUTE_DEFENSIBLE_FEEDBACK_ADVANTAGE"
  &&!frozenReform.repairAssessment.causalPromotionEligible&&!frozenReform.scopedFunctionalSignal&&!frozenReform.scopedRepairSignal
  &&frozenReform.sourceUnchanged&&frozenReform.complete&&!reformReceipt.diagnosis.cognitiveGainDemonstrated
  &&!reformReceipt.diagnosis.defaultChanged&&!reformReceipt.diagnosis.authorityChanged,
  "lower tokens without accepted solutions support no cognitive, efficiency, default, authority or recursion promotion");
check(QUANTITATIVE_DIAGNOSIS_CASES.length===2&&QUANTITATIVE_DIAGNOSIS_EPOCH.maxLogicalCalls===12
  &&QUANTITATIVE_DIAGNOSIS_EPOCH.maxPhysicalLogicalCalls===10&&QUANTITATIVE_DIAGNOSIS_EPOCH.maxHttpAttemptsPerEpoch===10
  &&QUANTITATIVE_DIAGNOSIS_EPOCH.maxCallsPerStage===3&&QUANTITATIVE_DIAGNOSIS_EPOCH.diagnosticOnly
  &&QUANTITATIVE_DIAGNOSIS_CASES.every(t=>![...DIRECT_REFORMULATION_CASES,...DIRECT_NATIVE_CASES,...REPAIR_CONTEXT_CASES]
    .some(prior=>theoryDigest(t.problem)===theoryDigest(prior.problem))),
  "prospective failure diagnosis uses fresh parameters and smaller finite limits, not a regrade or a benchmark promotion");
for(const successfulTreatment of [false,true]){
  let physicalDiagnosticCalls=0;const diagnosticInputs:unknown[]=[];
  const diagnosticEpoch=await runNativeGenerationEpoch(async(request)=>{
    physicalDiagnosticCalls++;const prompt=JSON.parse(request.messages[1].content);
    diagnosticInputs.push(prompt);const t=QUANTITATIVE_DIAGNOSIS_CASES.find(task=>task.taskId===prompt.taskId)!;
    check(prompt.availableTool===null||prompt.authority==="NONE_PUBLIC_MODEL_PROPOSAL_ONLY",
      "direct diagnostic does not give either arm native or general execution authority");
    if(prompt.authority==="NONE_PUBLIC_MODEL_PROPOSAL_ONLY")return responseFor({problemDigest:theoryDigest(t.problem),
      equations:t.outputLabels.map(label=>({label,expression:"public definition fixture"})),assumptions:[]});
    const expected=expectedProcedureOutputs(t);
    const callOrdinal=Number(/-(\d+)-[a-f0-9]{12}$/.exec(request.requestId)?.[1]);
    check(callOrdinal>=1&&callOrdinal<=3,"E3 diagnostic fixture binds its scripted response to the actual call identity");
    const outputs=prompt.publicModelRevision&&successfulTreatment?expected:callOrdinal===1?
      expected.map(v=>({...v,value:"0"})):expected.map(v=>{const [n,d="1"]=v.value.split("/");
        return {...v,value:`${BigInt(n)*2n}/${BigInt(d)*2n}`};});
    return responseFor({action:"SUBMIT",analysisRequest:null,certificate:{outputs,confidence:1}});
  },{candidate:"0".repeat(40),sourceDigests:{}},()=>1000,async()=>{},"FAILURE_DIAGNOSIS");
  check(diagnosticEpoch.complete&&diagnosticEpoch.diagnosticOnly&&diagnosticEpoch.freeze.corpusDigest===QUANTITATIVE_DIAGNOSIS_CORPUS_DIGEST
    &&diagnosticEpoch.rows.length===4&&diagnosticEpoch.logicalCalls===12&&physicalDiagnosticCalls===10
    &&diagnosticEpoch.physicalLogicalCalls===10&&diagnosticEpoch.physicalInferenceTotals!.calls===10,
    "diagnostic still charges twelve owned calls, ten actual calls and the shared prefix separately");
  check(!diagnosticEpoch.scopedFunctionalSignal&&!diagnosticEpoch.scopedRepairSignal&&!diagnosticEpoch.repairAssessment!.causalPromotionEligible
    &&diagnosticEpoch.repairAssessment!.verdict==="DIAGNOSTIC_ONLY_NOT_A_PROMOTION_EPOCH",
    "even a scripted successful repair cannot promote a counts-only diagnosis into a cognitive gain");
  check(diagnosticEpoch.rows.filter(r=>r.sharedProposal?.replayed).length===2
    &&diagnosticEpoch.summaries[1].formulationCalls===2&&diagnosticEpoch.summaries[1].admittedFormulations===2
    &&diagnosticEpoch.rows.every(r=>r.run!.usage.toolRequests===0&&r.run!.attempts.every(a=>a.nativeExecution===null)),
    "two actual formulation observations remain unverified proposals within the existing no-tool boundary");
  check(diagnosticEpoch.rows.every(r=>r.certificateValueDiagnostics!.length===r.run!.attempts
    .filter(a=>["ACCEPTED","FUNCTIONAL_REJECTION","CERTIFICATE_SCHEMA_REJECTION"].includes(a.outcome)).length
    &&r.certificateValueDiagnostics!.every(d=>d.call>=1&&d.call<=3&&!d.value.admissionChanged)),
    "each certificate diagnostic binds its original call; formulation turns are never falsely graded as answers");
  check(diagnosticEpoch.rows.every(r=>r.certificateValueDiagnostics![0].value.verdict==="AS_WRITTEN_NUMERIC_MISMATCH")
    &&diagnosticEpoch.rows.filter(r=>r.arm==="DIRECT_REPAIR").every(r=>r.certificateValueDiagnostics!.slice(1)
      .every(d=>d.value.verdict==="EQUIVALENT_NONCANONICAL"&&!d.value.admissionChanged))
    &&diagnosticEpoch.totals.reportedTokens===diagnosticEpoch.physicalInferenceTotals!.reportedTokens+2*150,
    "scripted mathematical failure, noncanonical equivalence and replay-token accounting stay distinct without normalizing answers");
  check(diagnosticInputs.every(p=>!JSON.stringify(p).includes("certificateValueDiagnostics")
    &&!JSON.stringify(p).includes("formulationStructure")&&!JSON.stringify(p).includes("canonicalExactMatchCount")),
    "private value/contract observations are not added to model feedback, reference answers or authority");
  check(diagnosticEpoch.rows.every(r=>r.run!.attempts.filter(a=>a.cognitiveStage==="MODEL_FORMULATION")
    .every(a=>a.formulationStructure!.structurallyValid&&!a.formulationStructure!.grantsAuthority)),
    "public evidence projection retains bounded formulation counts but no equation text");
}
const diagnosisReceipt=JSON.parse(readFileSync("docs/omega/evidence/nyx-quantitative-diagnosis-6ba3d859.json","utf8"));
const frozenDiagnosis=diagnosisReceipt.frozenReport,diagnosisBytes=Buffer.from(JSON.stringify(frozenDiagnosis,null,2)+"\n");
check(createHash("sha256").update(diagnosisBytes).digest("hex")===diagnosisReceipt.integrity.reportSha256
  &&diagnosisBytes.length===diagnosisReceipt.integrity.reportBytes&&theoryDigest(frozenDiagnosis.freeze)===frozenDiagnosis.freezeDigest,
  "counts-only diagnosis receipt reconstructs the exact archive report and frozen identity");
for(const [path,digest] of Object.entries(frozenDiagnosis.freeze.sourceDigests)){
  if(!/^(?:src|scripts)\/[A-Za-z0-9_./-]+\.ts$/.test(path)||path.split("/").includes(".."))throw Error("unsafe_diagnosis_receipt_source_path");
  check(theoryDigest(execFileSync("git",["show",`${diagnosisReceipt.evaluatedCandidate}:${path}`],{encoding:"utf8"}))===digest,
    `counts-only diagnosis retains historical source ${path}`);
}
check(theoryDigest(frozenDiagnosis.freeze.configuration)===theoryDigest(QUANTITATIVE_DIAGNOSIS_EPOCH)
  &&frozenDiagnosis.freeze.corpusDigest===QUANTITATIVE_DIAGNOSIS_CORPUS_DIGEST
  &&frozenDiagnosis.freeze.tasks.length===2&&frozenDiagnosis.freeze.tasks.every((b:any)=>QUANTITATIVE_DIAGNOSIS_CASES.some(t=>t.taskId===b.taskId&&theoryDigest(t)===b.digest)),
  "diagnosis freezes two prospective cases, unchanged exact oracle, model and finite limits");
const diagnosticAllocated=frozenDiagnosis.rows.flatMap((r:any)=>r.run.attempts);
const diagnosticPhysical=frozenDiagnosis.rows.flatMap((r:any)=>r.run.attempts.filter((_:any,i:number)=>!(i===0&&r.sharedProposal.replayed)));
check(diagnosticAllocated.length===12&&diagnosticPhysical.length===10&&frozenDiagnosis.totals.calls===12
  &&frozenDiagnosis.physicalInferenceTotals.calls===10&&frozenDiagnosis.totals.reportedTokens===30834
  &&frozenDiagnosis.physicalInferenceTotals.reportedTokens===25309
  &&diagnosticPhysical.reduce((n:number,a:any)=>n+a.modelEvidence.usage.totalTokens,0)===25309,
  "twelve allocated calls are ten physical calls; 5525 common-prefix tokens are charged twice, not invented compute");
check(frozenDiagnosis.rows.filter((r:any)=>r.sharedProposal.replayed).length===2
  &&frozenDiagnosis.rows.filter((r:any)=>r.sharedProposal.replayed).every((r:any)=>{const original=frozenDiagnosis.rows.find((a:any)=>a.taskId===r.taskId&&!a.sharedProposal.replayed);
    return theoryDigest(original.run.attempts[0])===theoryDigest(r.run.attempts[0])&&original.sharedProposal.sourceEvidenceId===r.sharedProposal.sourceEvidenceId
      &&r.sharedPrefixChargedMs===r.sharedProposal.prefixElapsedMs&&r.allocatedElapsedMs===r.run.usage.elapsedMs+r.sharedPrefixChargedMs;}),
  "diagnostic common starts preserve owned sessions, identical evidence and original elapsed budgets");
check(diagnosticPhysical.every((a:any)=>a.modelEvidence.evidenceClass==="E4"&&a.modelEvidence.model===QUANTITATIVE_DIAGNOSIS_EPOCH.model
  &&a.modelEvidence.statusCode===200&&a.modelEvidence.finishReason==="stop"&&a.modelEvidence.delivery.httpAttempts===1)
  &&frozenDiagnosis.providerStable&&frozenDiagnosis.totals.unknownUsageCalls===0&&frozenDiagnosis.totals.unknownUsageHttpAttempts===0,
  "ten stable deliveries leave observed mathematical and formulation failures separate from provider failures");
const numericObservations=frozenDiagnosis.rows.flatMap((r:any)=>r.certificateValueDiagnostics);
check(numericObservations.length===10&&numericObservations.every((d:any)=>d.value.verdict==="AS_WRITTEN_NUMERIC_MISMATCH"
  &&d.value.incorrectExactValueCount===d.value.expectedOutputs&&d.value.canonicalExactMatchCount===0
  &&d.value.equivalentNoncanonicalCount===0&&d.value.unclassifiedValueTextCount===0&&!d.value.admissionChanged)
  &&numericObservations.reduce((n:number,d:any)=>n+d.value.incorrectExactValueCount,0)===25,
  "all allocated values are wrong as written, not unclassified text or equivalent noncanonical serialization");
const structuralObservations=diagnosticAllocated.filter((a:any)=>a.formulationStructure);
const missingForm=structuralObservations.find((a:any)=>a.outcome==="MODEL_FORMULATION_REJECTION")?.formulationStructure;
check(structuralObservations.length===2&&structuralObservations.filter((a:any)=>a.outcome==="MODEL_FORMULATION_READY_NOT_EXECUTED").length===1
  &&missingForm?.problemBinding==="MATCH"&&missingForm.actualEquations===0&&missingForm.expectedOutputs===3&&missingForm.missingLabels===3
  &&missingForm.inspectionComplete&&theoryDigest(missingForm.reasons)===theoryDigest(["EQUATION_COUNT","OUTPUT_LABEL_SET"]),
  "one public formulation is structurally admitted; the other omitted all original outputs under otherwise valid bounds");
check(frozenDiagnosis.complete&&frozenDiagnosis.sourceUnchanged&&frozenDiagnosis.rows.every((r:any)=>r.blocked===null&&r.run.usage.toolRequests===0)
  &&frozenDiagnosis.summaries.every((s:any)=>s.attempted===2&&s.graded===2&&s.accepted===0&&s.firstAttemptAccepted===0&&s.repairedAccepted===0)
  &&frozenDiagnosis.pairs.every((p:any)=>p.boundedNoMoreModelCompute&&!p.realizedComputeMatched&&!p.repairComputeMatched)
  &&frozenDiagnosis.diagnosticOnly&&!frozenDiagnosis.scopedFunctionalSignal&&!frozenDiagnosis.scopedRepairSignal
  &&frozenDiagnosis.repairAssessment.verdict==="DIAGNOSTIC_ONLY_NOT_A_PROMOTION_EPOCH"&&!frozenDiagnosis.repairAssessment.causalPromotionEligible,
  "complete negative diagnosis, fewer tokens and a valid public shape never imply cognitive or default promotion");
check(FORMULATION_BOUNDS_CASES.length===4&&theoryDigest(FORMULATION_BOUNDS_CASES)===FORMULATION_BOUNDS_CORPUS_DIGEST
  &&FORMULATION_BOUNDS_EPOCH.maxLogicalCalls===24&&FORMULATION_BOUNDS_EPOCH.maxPhysicalLogicalCalls===20
  &&FORMULATION_BOUNDS_EPOCH.maxHttpAttemptsPerEpoch===20&&FORMULATION_BOUNDS_EPOCH.maxCallsPerStage===3
  &&FORMULATION_BOUNDS_CASES.every(t=>![...NATIVE_GENERATION_CASES,...EXPRESSION_TRANSFER_CASES,...REPAIR_CONTEXT_CASES,
    ...DIRECT_NATIVE_CASES,...DIRECT_REFORMULATION_CASES,...QUANTITATIVE_DIAGNOSIS_CASES]
    .some(prior=>theoryDigest(prior.problem)===theoryDigest(t.problem))),
  "formulation generation comparison freezes four new values and finite caps without recycling exposed inputs");
for(const mode of ["IGNORED_GUIDANCE","STRUCTURE_ONLY","EXACT_REPAIR"] as const){
  const firstCalls=new Map<string,number>(),formulationCalls=new Map<string,number>();let physicalCalls=0;
  const boundEpoch=await runNativeGenerationEpoch(async(request,stage)=>{
    physicalCalls++;const prompt=JSON.parse(request.messages[1].content),task=FORMULATION_BOUNDS_CASES.find(t=>t.taskId===prompt.taskId)!;
    const formulation=typeof request.responseFormat==="object"&&request.responseFormat.name==="nyx_public_model_formulation";
    const bounded=stage.endsWith("/BOUNDED_FORMULATION_GUIDANCE");
    check(request.inferencePolicy==="REASONING_JSON"&&request.reasoningControl==="SUPER_HOSTED_NATIVE"
      &&request.reasoningBudgetTokens===2048&&request.maxTokens===8192,
      "both formulation arms have the identical provider reasoning and output caps");
    if(formulation){formulationCalls.set(stage,(formulationCalls.get(stage)??0)+1);
      const schema=(request.responseFormat as any).schema,contract=prompt.formulationContract;
      check(bounded?schema.properties.equations.minItems===task.outputLabels.length&&contract.requiredCount===task.outputLabels.length:
        !("minItems" in schema.properties.equations)&&contract===undefined,
        "only the formulation step changes original-output generation guidance; no answer is inserted");
      check(prompt.authority==="NONE_PUBLIC_MODEL_PROPOSAL_ONLY"&&prompt.lastAdmittedEquations===null
        &&prompt.independentFeedback.includes("EXACT_OBJECTIVE_MISMATCH"),"both formulation arms receive their own real falsification, not oracle values");
      return responseFor({problemDigest:theoryDigest(task.problem),equations:bounded&&mode!=="IGNORED_GUIDANCE"?
        task.outputLabels.map(label=>({label,expression:"development-only model definition"})):[],assumptions:[]});
    }
    check(prompt.availableTool===null&&prompt.artifactReference===null&&(request.responseFormat as any).schema.anyOf.length===1,
      "formulation comparison retains manual certificates only, not arithmetic, shell or other authority");
    if(!prompt.verificationFeedback.length)firstCalls.set(task.taskId,(firstCalls.get(task.taskId)??0)+1);
    check(!("formulationContract" in prompt),"generation bounds are not silently added to first or later intent calls");
    return responseFor({action:"SUBMIT",analysisRequest:null,certificate:{outputs:bounded&&mode==="EXACT_REPAIR"&&prompt.publicModelRevision?
      expectedProcedureOutputs(task):task.outputLabels.map(label=>({label,value:"0"})),confidence:0.5}});
  },{candidate:"0".repeat(40),sourceDigests:{}},()=>1000,async()=>{},"FORMULATION_BOUNDS");
  check(boundEpoch.complete&&boundEpoch.providerStable&&firstCalls.size===4&&[...firstCalls.values()].every(n=>n===1)
    &&physicalCalls===20&&boundEpoch.physicalInferenceTotals!.calls===20&&boundEpoch.logicalCalls===24,
    "shared first proposals are physically generated once while twenty-four allocations charge both owned sessions");
  check(formulationCalls.size===8&&[...formulationCalls.values()].every(n=>n===1)
    &&boundEpoch.summaries.every(s=>s.formulationCalls===4&&s.firstAttemptAccepted===0&&s.usage.toolRequests===0),
    "both arms spend one existing call per falsified case on formulation; no free added cognition or tool call");
  check(boundEpoch.summaries[0].accepted===0&&boundEpoch.summaries[1].accepted===(mode==="EXACT_REPAIR"?4:0)
    &&boundEpoch.summaries[0].admittedFormulations===0&&boundEpoch.summaries[1].admittedFormulations===(mode==="IGNORED_GUIDANCE"?0:4),
    "structural admission is distinct from exact acceptance; ignored guidance still fails closed");
  check(boundEpoch.formulationGenerationSignal===(mode!=="IGNORED_GUIDANCE")&&boundEpoch.scopedFunctionalSignal===(mode==="EXACT_REPAIR")
    &&boundEpoch.pairs.every(p=>p.realizedComputeMatched&&p.repairComputeMatched&&p.boundedNoMoreModelCompute)
    &&boundEpoch.promotion.startsWith("NONE_")&&!boundEpoch.safety.authorityIncrease,
    "E3 scoring separates a formulation-only signal from independently correct repair and never promotes cognition");
  check(!JSON.stringify(boundEpoch).includes("development-only model definition")
    &&boundEpoch.rows.every(r=>r.run!.attempts.filter(a=>a.cognitiveStage==="MODEL_FORMULATION")
      .every(a=>!!a.formulationStructure&&!a.formulationStructure.grantsAuthority)),
    "comparison keeps bounded contract observations and provenance, not raw public equations");
}
let boundFirstCalls=0;
const boundsAlreadyCorrect=await runNativeGenerationEpoch(async request=>{boundFirstCalls++;
  const prompt=JSON.parse(request.messages[1].content),task=FORMULATION_BOUNDS_CASES.find(t=>t.taskId===prompt.taskId)!;
  check(typeof request.responseFormat!=="object"||request.responseFormat.name!=="nyx_public_model_formulation",
    "passing common first proposals never spend a gratuitous formulation call");
  return responseFor({action:"SUBMIT",analysisRequest:null,certificate:{outputs:expectedProcedureOutputs(task),confidence:0.5}});
},{candidate:"0".repeat(40),sourceDigests:{}},()=>1000,async()=>{},"FORMULATION_BOUNDS");
check(boundFirstCalls===4&&boundsAlreadyCorrect.logicalCalls===8&&boundsAlreadyCorrect.summaries.every(s=>s.firstAttemptAccepted===4&&s.formulationCalls===0)
  &&!boundsAlreadyCorrect.formulationGenerationSignal&&!boundsAlreadyCorrect.scopedFunctionalSignal,
  "first successes stay first successes, not evidence for an unexercised repair profile");
const formBoundsReceipt=JSON.parse(readFileSync("docs/omega/evidence/nyx-formulation-bounds-162e958c.json","utf8"));
const formBoundsFrozen=formBoundsReceipt.frozenReport,formBoundsBytes=Buffer.from(JSON.stringify(formBoundsFrozen,null,2)+"\n");
check(formBoundsReceipt.evaluatedCandidate==="162e958cfdd5fcd842454f77c8483098aeeaeb08"
  &&formBoundsReceipt.runId===38282997508&&formBoundsReceipt.jobId===114924542787
  &&formBoundsFrozen.candidate===formBoundsReceipt.evaluatedCandidate&&formBoundsBytes.length===113659
  &&createHash("sha256").update(formBoundsBytes).digest("hex")===formBoundsReceipt.integrity.reportSha256
  &&formBoundsReceipt.integrity.reportSha256==="fbddf2f300dbc79cbb7d96120c4b262c584d7bb3bf70ff9a6584e1c8d76efd17"
  &&formBoundsReceipt.integrity.archiveSha256==="7b82c99dbfcf175583ad2c5f721a2f5717011340ddc760fdb9454a6b23116d52"
  &&theoryDigest(formBoundsFrozen.freeze)===formBoundsFrozen.freezeDigest,
  "formulation transfer receipt reconstructs the exact terminal artifact and frozen candidate");
for(const [path,digest] of Object.entries(formBoundsFrozen.freeze.sourceDigests)){
  if(!/^(?:src|scripts)\/[A-Za-z0-9_./-]+\.ts$/.test(path)||path.split("/").includes(".."))throw Error("unsafe_formulation_bounds_source_path");
  check(theoryDigest(execFileSync("git",["show",`${formBoundsReceipt.evaluatedCandidate}:${path}`],{encoding:"utf8"}))===digest,
    `formulation comparison retains historical source ${path}`);
}
check(theoryDigest(formBoundsFrozen.freeze.configuration)===theoryDigest(FORMULATION_BOUNDS_EPOCH)
  &&formBoundsFrozen.freeze.corpusDigest===FORMULATION_BOUNDS_CORPUS_DIGEST
  &&formBoundsFrozen.freeze.tasks.length===4&&formBoundsFrozen.freeze.tasks.every((b:any)=>
    FORMULATION_BOUNDS_CASES.some(t=>t.taskId===b.taskId&&theoryDigest(t)===b.digest)),
  "formulation comparison freezes the actual four new inputs, unchanged model, call caps and independent oracle");
const formBoundsAllocated=formBoundsFrozen.rows.flatMap((r:any)=>r.run.attempts);
const formBoundsPhysical=formBoundsFrozen.rows.flatMap((r:any)=>r.run.attempts.filter((_:any,i:number)=>!(i===0&&r.sharedProposal.replayed)));
check(formBoundsAllocated.length===24&&formBoundsPhysical.length===20&&formBoundsFrozen.logicalCalls===24
  &&formBoundsFrozen.physicalLogicalCalls===20&&formBoundsFrozen.totals.reportedTokens===61234
  &&formBoundsFrozen.physicalInferenceTotals.reportedTokens===50216
  &&formBoundsPhysical.reduce((n:number,a:any)=>n+a.modelEvidence.usage.totalTokens,0)===50216,
  "twenty actual calls and 50216 tokens remain distinct from twenty-four allocations and 61234 charged tokens");
check(formBoundsPhysical.every((a:any)=>a.modelEvidence.evidenceClass==="E4"&&a.modelEvidence.model===FORMULATION_BOUNDS_EPOCH.model
  &&a.modelEvidence.statusCode===200&&a.modelEvidence.finishReason==="stop"&&a.modelEvidence.delivery.httpAttempts===1)
  &&formBoundsFrozen.providerStable&&formBoundsFrozen.totals.unknownUsageCalls===0&&formBoundsFrozen.totals.unknownUsageHttpAttempts===0,
  "stable provider delivery leaves mathematical and canonical serialization failures observable rather than speculative");
check(formBoundsFrozen.rows.filter((r:any)=>r.sharedProposal.replayed).length===4
  &&formBoundsFrozen.rows.filter((r:any)=>r.sharedProposal.replayed).every((r:any)=>{
    const original=formBoundsFrozen.rows.find((a:any)=>a.taskId===r.taskId&&!a.sharedProposal.replayed);
    return theoryDigest(original.run.attempts[0])===theoryDigest(r.run.attempts[0])
      &&original.sharedProposal.sourceEvidenceId===r.sharedProposal.sourceEvidenceId
      &&r.sharedPrefixChargedMs===r.sharedProposal.prefixElapsedMs
      &&r.allocatedElapsedMs===r.run.usage.elapsedMs+r.sharedPrefixChargedMs;
  }),"comparison shares identical first evidence without giving the replay arm free inference or extra task lifetime");
const formBoundsValues=formBoundsFrozen.rows.flatMap((r:any)=>r.certificateValueDiagnostics);
check(formBoundsValues.length===16&&formBoundsValues.filter((d:any)=>d.value.verdict==="AS_WRITTEN_NUMERIC_MISMATCH").length===15
  &&formBoundsValues.filter((d:any)=>d.value.verdict==="EQUIVALENT_NONCANONICAL").length===1
  &&formBoundsValues.reduce((n:number,d:any)=>n+d.value.incorrectExactValueCount,0)===31
  &&formBoundsValues.reduce((n:number,d:any)=>n+d.value.canonicalExactMatchCount,0)===8
  &&formBoundsValues.reduce((n:number,d:any)=>n+d.value.equivalentNoncanonicalCount,0)===1
  &&formBoundsValues.every((d:any)=>!d.value.admissionChanged&&d.value.unclassifiedValueTextCount===0),
  "fifteen incorrect certificates and one equivalent noncanonical certificate retain distinct unchanged grades");
const noncanonicalFormRow=formBoundsFrozen.rows.find((r:any)=>r.taskId==="FORM-NETWORK-2"&&r.arm==="BOUNDED_FORMULATION_GUIDANCE");
check(noncanonicalFormRow.certificateValueDiagnostics.at(-1).value.verdict==="EQUIVALENT_NONCANONICAL"
  &&noncanonicalFormRow.run.attempts.at(-1).outcome==="FUNCTIONAL_REJECTION"&&!noncanonicalFormRow.run.accepted,
  "a prospectively observed formatting-only issue is not retroactively converted into a passing frozen candidate");
const formBoundsPublicDefinitions=formBoundsAllocated.filter((a:any)=>a.cognitiveStage==="MODEL_FORMULATION");
check(formBoundsPublicDefinitions.length===8&&formBoundsPublicDefinitions.filter((a:any)=>a.formulationStructure.structurallyValid).length===7
  &&formBoundsFrozen.summaries[0].admittedFormulations===3&&formBoundsFrozen.summaries[1].admittedFormulations===4
  &&formBoundsPublicDefinitions.filter((a:any)=>a.outcome==="MODEL_FORMULATION_REJECTION").every((a:any)=>
    a.formulationStructure.actualEquations===0&&a.formulationStructure.expectedOutputs===3&&a.formulationStructure.missingLabels===3
    &&theoryDigest(a.formulationStructure.reasons)===theoryDigest(["EQUATION_COUNT","OUTPUT_LABEL_SET"])),
  "a complete but empty legacy formulation is separate from four structurally admitted treatment hypotheses");
check(formBoundsFrozen.complete&&formBoundsFrozen.sourceUnchanged&&formBoundsFrozen.stopReason==="PREDECLARED_PAIRS_COMPLETE"
  &&formBoundsFrozen.summaries.every((s:any)=>s.attempted===4&&s.mathematicallyGraded===4&&s.accepted===0
    &&s.firstAttemptAccepted===0&&s.repairedAccepted===0&&s.formulationCalls===4&&s.usage.toolRequests===0)
  &&formBoundsFrozen.summaries[0].usage.reportedTokens===28792&&formBoundsFrozen.summaries[1].usage.reportedTokens===32442
  &&formBoundsFrozen.pairs.filter((p:any)=>p.realizedComputeMatched).length===2
  &&formBoundsFrozen.pairs.filter((p:any)=>p.repairComputeMatched).length===2
  &&formBoundsFrozen.pairs.filter((p:any)=>p.boundedNoMoreModelCompute).length===1
  &&!formBoundsFrozen.formulationGenerationSignal&&!formBoundsFrozen.scopedFunctionalSignal&&!formBoundsFrozen.scopedRepairSignal
  &&formBoundsReceipt.assessment.newCapabilityGained==="NONE"&&!formBoundsReceipt.assessment.cognitiveGainDemonstrated,
  "all eight stages were evaluated, but extra treatment tokens and shape counts establish no accepted capability gain");
// Development-only compiler witnesses. These expressions/expected values are
// NEVER passed to live cognition or used as benchmark answer-specific repairs.
const algebraProblem:QuantitativeProblem={kind:"EXACT_QUANTITATIVE_DERIVATION",constants:[
  {id:"zero",value:"0"},{id:"one",value:"1"},{id:"two",value:"2"},{id:"x",value:"6"},{id:"y",value:"3"},{id:"z",value:"2"}]};
const algebraForm=(expression:string,definitions:QuantitativeAlgebraicForm["definitions"]=[]):QuantitativeAlgebraicForm=>
  ({schemaVersion:5,definitions,outputs:[{label:"result",expression}]});
const algebraLimits=()=>({maxWorkUnits:100000,maxElapsedMs:2000,maxRequests:2,expiresAtEpochMs:Date.now()+120000});
function algebraSession(problem=algebraProblem,limits=algebraLimits()){
  return BoundedReasoningSession.create(problem,limits,Date.now,{expressionGraphs:false,algebraicForms:true});
}
function computeAlgebra(program:QuantitativeAlgebraicForm,problem=algebraProblem){
  const session=algebraSession(problem);
  try{return session.analyze({schemaVersion:1,operation:"ANALYZE_FINITE_PROBLEM",problemDigest:session.problemDigest,program});}
  finally{session.revoke();}
}
for(const [expression,expected] of [
  ["x+y*z","12"],["(x+y)*z","18"],["x/y*z","4"],["x/(y*z)","1"],["x-y-z","1"],
  ["x-(y-z)","5"],["-x+y","-3"],["-(x+y)*z","-18"],["x--y","9"],["+x","6"],
  ["MIN(x,y)","3"],["MAX(x,y)","6"],["BINOMIAL(x,z)","15"],["MAX(MIN(x,y),z)","3"],
  [" x \t +\n y ","9"],["x/(y-y)",null],
] as const){
  const r=computeAlgebra(algebraForm(expression));
  check(expected===null?r.status==="INSUFFICIENT_EVIDENCE":r.status==="CONSTRUCTED"
    &&(r.payload?.outputs as {value:string}[])[0].value===expected,`surface precedence/function/arithmetic boundary: ${expression}`);
  check(r.loweringVersion===ALGEBRAIC_COMPILER_POLICY.version&&r.grantsAuthority===false&&r.acceptanceRequiresIndependentVerifier
    &&r.workUnits>expression.length,"surface parsing and exact execution are charged without self-certification");
}
const namedForm=algebraForm("square+delta",[{id:"delta",expression:"x-y"},{id:"square",expression:"delta*delta"}]);
const beforeNamed=theoryDigest(namedForm),namedResult=computeAlgebra(namedForm);
check((namedResult.payload?.outputs as {value:string}[])[0].value==="12"&&theoryDigest(namedForm)===beforeNamed,
  "named immutable references compile without mutating input or inserting equations");
check(theoryDigest(lowerQuantitativeAlgebraicForm(algebraProblem,namedForm))===theoryDigest(lowerQuantitativeAlgebraicForm(algebraProblem,namedForm)),
  "surface compilation is deterministic");
const unusedFault=computeAlgebra(algebraForm("x",[{id:"unused",expression:"one/zero"}]));
check(unusedFault.status==="INSUFFICIENT_EVIDENCE","unused arithmetic errors are not eliminated to conceal invalid model mathematics");
for(const expression of ["", " ", "1", "x+1", "x^two", "x**two", "x(y)", "x y", "SIN(x,y)", "Math.max(x,y)",
  "x=one", "x;one", "x//y", "x/*y*/", "x[zero]", "unknown", "y) ", "(x", "MIN(x)", "MAX(x,y,z)",
  "MIN(,x)", "x+", "x, y", "x%y", "x\u0000", "α", "x\u00a0+y", "process.exit()", "import(x)"]){
  check(throws(()=>computeAlgebra(algebraForm(expression))),"unsupported/malformed mathematical text fails closed");
}
for(const definitions of [
  [{id:"x",expression:"one"}], [{id:"MIN",expression:"one"}], [{id:"a",expression:"b"},{id:"b",expression:"one"}],
  [{id:"a",expression:"a"}], [{id:"a",expression:"one"},{id:"a",expression:"two"}], [{id:"bad-name",expression:"one"}],
])check(throws(()=>computeAlgebra(algebraForm("x",definitions))),"shadowing, cyclic/forward names and duplicate assignments reject");
check(throws(()=>computeAlgebra({schemaVersion:5,definitions:[],outputs:[{label:"a",expression:"one"},{label:"b",expression:"a"}]})),
  "output labels do not implicitly expand the variable namespace");
const disabledAlgebra=BoundedReasoningSession.create(algebraProblem,algebraLimits());
check(!("algebraicPolicy" in disabledAlgebra.descriptor())&&throws(()=>disabledAlgebra.analyze({schemaVersion:1,
  operation:"ANALYZE_FINITE_PROBLEM",problemDigest:disabledAlgebra.problemDigest,program:namedForm}))&&disabledAlgebra.usage().requests===0,
  "schema five stays unavailable without explicit host opt-in; a model cannot enable it");disabledAlgebra.revoke();
check(throws(()=>computeAlgebra(algebraForm("-x"),{...algebraProblem,constants:algebraProblem.constants.filter(c=>c.id!=="zero")})),
  "unary minus never fabricates a zero constant outside the authorized problem");
for(const [expression,allowed] of [["(".repeat(16)+"one"+")".repeat(16),true],["(".repeat(17)+"one"+")".repeat(17),false],
  ["one+".repeat(64)+"one",true],["one+".repeat(65)+"one",false],[" ".repeat(509)+"one",true],[" ".repeat(510)+"one",false]] as const)
  check(throws(()=>computeAlgebra(algebraForm(expression)))!==allowed,"parse depth, operation and character boundaries are exact");
check(throws(()=>computeAlgebra(algebraForm("one",Array.from({length:8},(_,i)=>({id:`d${i}`,expression:" ".repeat(509)+"one"}))))),
  "the aggregate expression character ceiling is enforced, not only per-string limits");
check(throws(()=>computeAlgebra(algebraForm("one",Array.from({length:33},(_,i)=>({id:`d${i}`,expression:"one"}))))),"definition count is bounded");
let algebraGetterRead=false;const hostileForm={schemaVersion:5,definitions:[],outputs:[{label:"result",get expression(){algebraGetterRead=true;return "one";}}]};
check(throws(()=>computeAlgebra(hostileForm as QuantitativeAlgebraicForm))&&!algebraGetterRead,"native data guard rejects accessors before lexical inspection");
const lowAlgebra=algebraSession(algebraProblem,{...algebraLimits(),maxWorkUnits:5});
const lowResult=lowAlgebra.analyze({schemaVersion:1,operation:"ANALYZE_FINITE_PROBLEM",problemDigest:lowAlgebra.problemDigest,program:namedForm});
check(lowResult.status==="BUDGET_EXHAUSTED"&&lowAlgebra.usage().requests===1&&lowAlgebra.usage().workUnits>0,
  "parser exhaustion is bounded and accounted in the original lease");lowAlgebra.revoke();
const badAlgebra=algebraSession();
check(throws(()=>badAlgebra.analyze({schemaVersion:1,operation:"ANALYZE_FINITE_PROBLEM",problemDigest:badAlgebra.problemDigest,program:algebraForm("unknown")}))
  &&badAlgebra.usage().requests===1&&badAlgebra.usage().workUnits>0,"rejected parser work is not omitted from host resource accounting");
badAlgebra.revoke();check(throws(()=>badAlgebra.analyze({schemaVersion:1,operation:"ANALYZE_FINITE_PROBLEM",problemDigest:badAlgebra.problemDigest,program:namedForm})),
  "surface notation cannot bypass revocation");
let algebraClock=100;const timedAlgebra=BoundedReasoningSession.create(algebraProblem,{...algebraLimits(),expiresAtEpochMs:120},()=>algebraClock,
  {expressionGraphs:false,algebraicForms:true});algebraClock=121;
check(throws(()=>timedAlgebra.analyze({schemaVersion:1,operation:"ANALYZE_FINITE_PROBLEM",problemDigest:timedAlgebra.problemDigest,program:namedForm})),
  "surface notation cannot bypass expiry");timedAlgebra.revoke();
// Independent integer arithmetic property oracle; not the compiler or interpreter.
for(let x=-8;x<=8;x++)for(let y=-4;y<=4;y++){
  const problem:QuantitativeProblem={kind:"EXACT_QUANTITATIVE_DERIVATION",constants:[{id:"zero",value:"0"},{id:"x",value:String(x)},{id:"y",value:String(y)}]};
  const r=computeAlgebra(algebraForm("s*s-x*y",[{id:"s",expression:"x+y"}]),problem);
  check((r.payload?.outputs as {value:string}[])[0].value===String((BigInt(x)+BigInt(y))**2n-BigInt(x)*BigInt(y)),
    "signed input property agrees with independent direct integer oracle");
}
const sumForm:QuantitativeAlgebraicForm={schemaVersion:5,definitions:[],outputs:[{label:"sum",expression:"x+y"}]};
check(throws(()=>BoundQuantitativeProcedure.admit({task:sumTask,program:sumForm,parameterIds:["x","y"],modelEvidenceDigest:theoryDigest("algebra-development"),
  limits:algebraLimits(),verify:sumCheck("5")})),"procedure admission cannot enable a new representation from model data alone");
const algebraBound=BoundQuantitativeProcedure.admit({task:sumTask,program:sumForm,parameterIds:["x","y"],
  modelEvidenceDigest:theoryDigest("algebra-development"),algebraicForms:true,limits:algebraLimits(),verify:sumCheck("5")}).procedure!;
check(BoundQuantitativeProcedure.isOwned(algebraBound)&&algebraBound.matches(freshSum)&&algebraBound.descriptor().grantsAuthority===false,
  "seed validation reuses the existing owned procedure, fixed constants, scope and independent replay");
const algebraTaskInput={...sumTask,taskId:"ALGEBRA-DEVELOPMENT",arm:"REASONING_WITH_WORKBENCH" as const,
  nativeAlgebraicForm:true,objectiveOutputContract:"ENFORCE" as const,limits:{maxCalls:2,maxOutputTokens:1024,maxTaskMs:30000,
    expiresAtEpochMs:Date.now()+60000,maxToolRequests:2,maxToolWorkUnits:100000,maxToolElapsedMs:2000},verify:sumCheck("5")};
let algebraRequests=0;
const algebraRun=await runNyxQuantitativeTask({...algebraTaskInput,complete:async request=>{
  const prompt=JSON.parse(request.messages[1].content),schema=JSON.stringify(request.responseFormat);
  check(schema.includes("nyx_quantitative_algebraic_exchange")&&schema.includes('"enum":[5]')&&!schema.includes('"enum":[4]')
    &&prompt.nativeAlgebraicForm.grantsAuthority===false,"host-selected surface exchange advertises only its actual bounded grammar");
  return responseFor({action:"SUBMIT_DERIVATION",analysisRequest:{problemDigest:theoryDigest(sumTask.problem),
    program:{...sumForm,outputs:[{label:"sum",expression:++algebraRequests===1?"x-y":"x+y"}]}},certificate:{confidence:0.8}});
}});
check(algebraRun.accepted&&algebraRun.calls===2&&algebraRun.attempts[0].outcome==="FUNCTIONAL_REJECTION"
  &&algebraRun.attempts[1].outcome==="ACCEPTED"&&algebraRun.toolRequests===2&&algebraRun.toolWorkUnits>0,
  "wrong model-authored mathematics is independently rejected; finite repair does not erase the first failure");
const syntaxRun=await runNyxQuantitativeTask({...algebraTaskInput,complete:async()=>responseFor({action:"SUBMIT_DERIVATION",
  analysisRequest:{problemDigest:theoryDigest(sumTask.problem),program:{...sumForm,outputs:[{label:"sum",expression:"x+1"}]}},certificate:{confidence:0.8}})});
check(!syntaxRun.accepted&&syntaxRun.toolRequests===2&&syntaxRun.toolWorkUnits>0&&syntaxRun.attempts.every(a=>
  a.outcome==="AUTHORIZATION_OR_IR_REJECTION"&&a.findings.includes("quantitative_algebraic_invalid:LEXICAL_TOKEN")),
  "invalid source is classified independently of reasoning failure and rejected parsing still counts");
const reusedAlgebra=await runNyxQuantitativeTask({...algebraTaskInput,...freshSum,verify:sumCheck("8"),
  procedure:{artifact:algebraBound,mode:"BOUND_INVOCATION"},complete:async()=>responseFor({action:"SUBMIT_PROCEDURE",
    analysisRequest:{problemDigest:theoryDigest(freshSum.problem),procedureId:algebraBound.descriptor().procedureId},certificate:{confidence:0.8}})});
check(reusedAlgebra.accepted&&reusedAlgebra.calls===1&&reusedAlgebra.toolRequests===1&&reusedAlgebra.attempts[0].procedureReference!==undefined,
  "model can explicitly select an unchanged owned formula procedure on fresh parameters using the existing lease and oracle");
algebraBound.revoke();check(!algebraBound.matches(freshSum),"reusable formula objects retain revocation");
check(throws(()=>quantitativeExchangeSchema(["sum"],true,false,theoryDigest(sumTask.problem),[],null,null,false,true,true,true)),
  "mutually inconsistent representation profiles cannot be requested");
check((quantitativeAlgebraicSchema(["sum"],true).properties.outputs as {minItems:number}).minItems===1&&ALGEBRAIC_COMPILER_POLICY.grantsAuthority===false,
  "generation guidance does not weaken local validation or add execution authority");
check(ALGEBRAIC_TRANSFER_CASES.length===4&&theoryDigest(ALGEBRAIC_TRANSFER_CASES)===ALGEBRAIC_TRANSFER_CORPUS_DIGEST
  &&ALGEBRAIC_TRANSFER_EPOCH.maxLogicalCalls===16&&ALGEBRAIC_TRANSFER_EPOCH.arms.length===2
  &&ALGEBRAIC_TRANSFER_CASES.every(t=>!FORMULATION_BOUNDS_CASES.some(old=>theoryDigest(t.problem)===theoryDigest(old.problem))),
  "new comparison freezes four nonduplicate parameter problems with unchanged budget/oracle and distinct first/repair outcomes");
const algebraSynthetic=await runNativeGenerationEpoch(async request=>{
  const prompt=JSON.parse(request.messages[1].content);return responseFor({action:"SUBMIT",analysisRequest:null,
    certificate:{outputs:expectedProcedureOutputs(ALGEBRAIC_TRANSFER_CASES.find(t=>t.taskId===prompt.taskId)!),confidence:0.8}});
},{candidate:"a".repeat(40),sourceDigests:{}},Date.now,async()=>{},"ALGEBRAIC_FORM");
check(algebraSynthetic.complete&&algebraSynthetic.rows.length===8&&algebraSynthetic.summaries.every(s=>s.accepted===4&&s.firstAttemptAccepted===4)
  &&algebraSynthetic.pairs.every(p=>p.realizedComputeMatched)&&!algebraSynthetic.scopedFunctionalSignal&&algebraSynthetic.promotion.startsWith("NONE"),
  "equal synthetic outcomes cannot establish a surface-notation gain or promote cognition");
for(const task of ALGEBRAIC_TRANSFER_CASES){
  const program:QuantitativeAlgebraicForm=task.family==="INTERPOLATION"?{schemaVersion:5,
    definitions:[{id:"a",expression:"y0/((x0-x1)*(x0-x2))"},{id:"b",expression:"y1/((x1-x0)*(x1-x2))"},
      {id:"c",expression:"y2/((x2-x0)*(x2-x1))"}],
    outputs:[{label:"value",expression:"a*(t-x1)*(t-x2)+b*(t-x0)*(t-x2)+c*(t-x0)*(t-x1)"},
      {label:"slope",expression:"a*((t-x1)+(t-x2))+b*((t-x0)+(t-x2))+c*((t-x0)+(t-x1))"}]}:
    {schemaVersion:5,definitions:[{id:"A",expression:"g0+g01"},{id:"B",expression:"g1+g01"},
      {id:"det",expression:"A*B-g01*g01"},{id:"v",expression:"(B*i0+g01*i1)/det"},
      {id:"w",expression:"(A*i1+g01*i0)/det"},{id:"delta",expression:"v-w"}],
    outputs:[{label:"voltage0",expression:"v"},{label:"voltage1",expression:"w"},
      {label:"loss",expression:"g0*v*v+g1*w*w+g01*delta*delta"}]};
  const result=computeAlgebra(program,task.problem);
  check(result.status==="CONSTRUCTED"&&verifyProcedureOutputs(task,{outputs:result.payload!.outputs,confidence:0.8}).accepted,
    "development Lagrange/Cramer witnesses agree with independent Gaussian/energy oracle without entering live prompts");
}
// Separate development-only interface probes. No frozen live formulas or
// benchmark answers are recovered; authoritative admission remains unchanged.
const emissionProbe=(form:unknown)=>{try{lowerQuantitativeAlgebraicForm(sumTask.problem,form);return null;}
  catch(error){return {message:error instanceof Error?error.message:"",diagnostic:algebraicEmissionDiagnostic(error)};}};
const emissionExpression=(expression:string)=>({...sumForm,outputs:[{label:"sum",expression}]});
const lexicalProbes:readonly[ string,AlgebraicEmissionDiagnostic["category"] ][]=[
  ["x+2","NUMERIC_LITERAL"],["x+.25","NUMERIC_LITERAL"],["x^two","POWER_TOKEN"],["x**two","POWER_TOKEN"],
  ["x×y","NON_ASCII_TOKEN"],["x−y","NON_ASCII_TOKEN"],["x\u00a0+y","NON_ASCII_TOKEN"],
  ["x=y","ASSIGNMENT_TOKEN"],["x.y","HOST_OR_MARKUP_TOKEN"],["`x+y`","HOST_OR_MARKUP_TOKEN"],
  ["globalThis[x]","HOST_OR_MARKUP_TOKEN"],["x%y","OTHER_LEXICAL_TOKEN"],
  ["X+y","CASE_MISMATCH"],["sum+y","OUTPUT_LABEL_REFERENCE"],["undisclosedIdentifier+y","UNKNOWN_NAME"]];
for(const [expression,category] of lexicalProbes){
  const rejected=emissionProbe(emissionExpression(expression));
  check(rejected?.diagnostic?.category===category&&rejected.diagnostic.region==="OUTPUT"&&rejected.diagnostic.index===0,
    "development emission diagnosis identifies a finite category and bounded location");
  check(rejected?.diagnostic?.admissionChanged===false&&Object.isFrozen(rejected.diagnostic)
    &&!JSON.stringify(rejected.diagnostic).includes(expression)&&Object.keys(rejected.diagnostic).length===5,
    "diagnosis is immutable enums/indices only, never an expression/name/token or permission");
}
check(emissionProbe({...sumForm,definitions:[{id:"later",expression:"future+x"},{id:"future",expression:"x+y"}]})?.diagnostic?.category==="FORWARD_DEFINITION",
  "forward references retain their original rejection; no definition reordering repairs them");
const definitionProbes:readonly[unknown,AlgebraicEmissionDiagnostic["category"]][]=[
  [{id:"x",expression:"x+y"},"CONSTANT_SHADOW"],[{id:"MIN",expression:"x+y"},"RESERVED_NAME"],
  [{id:"1bad",expression:"x+y"},"INVALID_IDENTIFIER"],[{id:"a",expression:"x+y",confidence:1},"ENTRY_FIELDS"],
  [{id:"a",expression:""},"EXPRESSION_BOUND"],[{id:"a",expression:"x".repeat(513)},"EXPRESSION_BOUND"]];
for(const [definition,category] of definitionProbes){const rejected=emissionProbe({...sumForm,definitions:[definition]});
  check(rejected?.message==="quantitative_algebraic_invalid:DEFINITION_SHAPE_OR_BOUND"&&rejected.diagnostic?.category===category
    &&rejected.diagnostic.region==="DEFINITION"&&rejected.diagnostic.index===0,"definition subcategories preserve legacy rejection messages and the same shape/limits");}
check(emissionProbe({...sumForm,definitions:[{id:"a",expression:"x+y"},{id:"a",expression:"x-y"}]})?.diagnostic?.category==="DUPLICATE_DEFINITION",
  "duplicate bindings are not accepted or implicitly renamed");
check(algebraicEmissionDiagnostic(Error("quantitative_algebraic_invalid:LEXICAL_TOKEN"))===null
  &&algebraicEmissionDiagnostic({message:"quantitative_algebraic_invalid:LEXICAL_TOKEN"})===null,
  "arbitrary exception text and model data cannot manufacture an authoritative compiler diagnosis");
const lexicalPattern=new RegExp(ALGEBRAIC_EMISSION_POLICY.tokenPattern);
for(const expression of ["x+y","x1*data_2","MIN(x,y)","(x-y)/x","x\t+\ny","-x","x*y*x"])
  check(lexicalPattern.test(expression),"optional provider pattern permits the authoritative ASCII token language");
for(const expression of ["1","x+2","x^two","x×y","x=y","x\u00a0+y","x.y","`x`","_x"])
  check(!lexicalPattern.test(expression),"optional provider pattern excludes unsupported lexical forms, not mathematical outcomes");
for(const expression of ["a".repeat(48),"a1".repeat(24),"x+"+"a".repeat(48),"x,"+"B".repeat(48)])
  check(lexicalPattern.test(expression),"lexical guidance preserves identifiers at their exact length limit");
for(const expression of ["a".repeat(49),"x+"+"a".repeat(49),"a".repeat(512)+"^",("abc+".repeat(120))+"^",("x ".repeat(240))+"_"])
  check(!lexicalPattern.test(expression),"long invalid names/suffixes reject without ambiguous name partitioning");
check(lexicalPattern.test("x**y")&&emissionProbe(emissionExpression("x**y"))?.message==="quantitative_algebraic_invalid:SYNTAX",
  "token-compatible guidance is not a substitute for the authoritative parser");
const emissionSchemaExpression=(guided:boolean)=>(quantitativeAlgebraicSchema(["sum"],true,guided).properties.outputs as
  {items:{properties:{expression:{pattern?:string}}}}).items.properties.expression;
check(!("pattern" in emissionSchemaExpression(false))
  &&emissionSchemaExpression(true).pattern===ALGEBRAIC_EMISSION_POLICY.tokenPattern,
  "legacy schemas are unchanged and the new provider guide is explicit opt-in");
const observeRequests:string[]=[],legacyRequests:string[]=[];
const captureEmission=(requests:string[])=>async(request:NvidiaNimCompletionRequest)=>{
  requests.push(JSON.stringify(request));return responseFor({action:"SUBMIT_DERIVATION",analysisRequest:{problemDigest:theoryDigest(sumTask.problem),
    program:emissionExpression("x+2")},certificate:{confidence:0.8}});};
const legacyEmission=await runNyxQuantitativeTask({...algebraTaskInput,now:()=>12345,complete:captureEmission(legacyRequests)});
const observedEmission=await runNyxQuantitativeTask({...algebraTaskInput,now:()=>12345,observeAlgebraicEmission:true,complete:captureEmission(observeRequests)});
check(JSON.stringify(legacyRequests)===JSON.stringify(observeRequests)&&legacyEmission.accepted===observedEmission.accepted
  &&JSON.stringify(legacyEmission.attempts.map(a=>a.findings))===JSON.stringify(observedEmission.attempts.map(a=>a.findings)),
  "counts-only observation leaves every cognitive request, feedback, admission and verdict unchanged");
check(legacyEmission.attempts.every(a=>a.algebraicEmissionDiagnostic===undefined)&&observedEmission.attempts.every(a=>
  a.algebraicEmissionDiagnostic?.category==="NUMERIC_LITERAL")&&observedEmission.toolWorkUnits===legacyEmission.toolWorkUnits,
  "diagnostic opt-in preserves charged parser work and does not relabel syntax rejection as reasoning failure");
let guidedCalls=0;
const guidedEmission=await runNyxQuantitativeTask({...algebraTaskInput,observeAlgebraicEmission:true,algebraicEmissionGuide:true,
  complete:async request=>{guidedCalls++;const p=JSON.parse(request.messages[1].content);
    check(p.algebraicEmissionGuide.version===ALGEBRAIC_EMISSION_POLICY.version&&JSON.stringify(request.responseFormat).includes("pattern"),
      "experimental generation advertises its reviewed lexical guide, never a mathematical solution");
    if(guidedCalls===2)check(p.verificationFeedback.some((f:string)=>f.startsWith("ALGEBRAIC_EMISSION_NUMERIC_LITERAL")),
      "bounded repair receives the authoritative sanitized failure class without hidden answer information");
    return responseFor({action:"SUBMIT_DERIVATION",analysisRequest:{problemDigest:theoryDigest(sumTask.problem),
      program:emissionExpression(guidedCalls===1?"x+2":"x+y")},certificate:{confidence:0.8}});}});
check(guidedEmission.accepted&&guidedEmission.calls===2&&guidedEmission.attempts[0].outcome==="AUTHORIZATION_OR_IR_REJECTION"
  &&guidedEmission.attempts[1].outcome==="ACCEPTED"&&guidedEmission.toolRequests===2,
  "synthetic repair preserves the failed first attempt and spends only the existing lease/calls");
const ignoredGuidance=await runNyxQuantitativeTask({...algebraTaskInput,algebraicEmissionGuide:true,
  complete:captureEmission([])});
check(!ignoredGuidance.accepted&&ignoredGuidance.attempts.every(a=>a.outcome==="AUTHORIZATION_OR_IR_REJECTION"),
  "a provider ignoring its regex cannot bypass local syntax admission or the independent oracle");
const ignoredWrongMath=await runNyxQuantitativeTask({...algebraTaskInput,algebraicEmissionGuide:true,complete:async()=>responseFor({action:"SUBMIT_DERIVATION",
  analysisRequest:{problemDigest:theoryDigest(sumTask.problem),program:emissionExpression("x-y")},certificate:{confidence:0.8}})});
check(!ignoredWrongMath.accepted&&ignoredWrongMath.attempts.every(a=>a.outcome==="FUNCTIONAL_REJECTION"),
  "valid serialization still has to pass exactly the unchanged mathematical oracle");
for(const option of ["observeAlgebraicEmission","algebraicEmissionGuide"] as const){
  let denied=false;try{await runNyxQuantitativeTask({...algebraTaskInput,nativeAlgebraicForm:false,[option]:true,complete:captureEmission([])});}catch{denied=true;}
  check(denied,"emission settings cannot silently enable a native capability or apply to an unavailable representation");
}
const publicEmission=publicRun(observedEmission);
check(publicEmission.attempts.every(a=>a.algebraicEmissionDiagnostic?.category==="NUMERIC_LITERAL")
  &&!JSON.stringify(publicEmission).includes('"expression"')&&!JSON.stringify(publicEmission).includes('"executedProgram"'),
  "public evidence retains sanitized diagnostics but no rejected/accepted source or model reasoning");
check(ALGEBRAIC_EMISSION_CASES.length===4&&theoryDigest(ALGEBRAIC_EMISSION_CASES)===ALGEBRAIC_EMISSION_CORPUS_DIGEST
  &&ALGEBRAIC_EMISSION_EPOCH.maxLogicalCalls===16&&ALGEBRAIC_EMISSION_EPOCH.maxCallsPerStage===2
  &&ALGEBRAIC_EMISSION_EPOCH.maxHttpAttemptsPerEpoch===16&&ALGEBRAIC_EMISSION_EPOCH.authorityIncrease===false,
  "fresh emission comparison has frozen identities and the unchanged sixteen-call finite authority envelope");
for(const task of ALGEBRAIC_EMISSION_CASES)check(![...ALGEBRAIC_TRANSFER_CASES,...FORMULATION_BOUNDS_CASES,
  ...EXPRESSION_TRANSFER_CASES,...REPAIR_CONTEXT_CASES,...DIRECT_NATIVE_CASES,...DIRECT_REFORMULATION_CASES,
  ...QUANTITATIVE_DIAGNOSIS_CASES,...NATIVE_GENERATION_CASES,...PROCEDURE_FAMILIES.flatMap(f=>[f.seed,...f.fresh])]
  .some(old=>theoryDigest(old.problem)===theoryDigest(task.problem)),
  "new parameter cases are not a replay of exposed evaluation inputs");
const emissionEpoch=await runNativeGenerationEpoch(async request=>{
  const prompt=JSON.parse(request.messages[1].content),task=ALGEBRAIC_EMISSION_CASES.find(t=>t.taskId===prompt.taskId)!;
  check(prompt.availableTool.algebraicPolicy.schemaVersion===5&&prompt.nativeAlgebraicForm.schemaVersion===5
    &&prompt.objectiveOutputContract.requiredCount===task.outputLabels.length,
    "both comparison arms receive the same actual tool/output capability contract");
  return responseFor({action:"SUBMIT",analysisRequest:null,certificate:{outputs:expectedProcedureOutputs(task),confidence:0.8}});
},{candidate:"a".repeat(40),sourceDigests:{}},Date.now,async()=>{},"ALGEBRAIC_EMISSION");
check(emissionEpoch.complete&&emissionEpoch.logicalCalls===8&&emissionEpoch.summaries.every(s=>s.accepted===4&&s.firstAttemptAccepted===4)
  &&!emissionEpoch.scopedFunctionalSignal&&!emissionEpoch.emissionSignal&&emissionEpoch.promotion.startsWith("NONE"),
  "equal deterministic test-double outcomes cannot establish a model or emission improvement");
const failedEmissionEpoch=await runNativeGenerationEpoch(async request=>{
  const prompt=JSON.parse(request.messages[1].content);return responseFor({action:"SUBMIT_DERIVATION",
    analysisRequest:{problemDigest:theoryDigest(prompt.problem),program:{schemaVersion:5,definitions:[],
      outputs:prompt.outputLabels.map((label:string)=>({label,expression:"zero+1"}))}},certificate:{confidence:0.8}});
},{candidate:"a".repeat(40),sourceDigests:{}},Date.now,async()=>{},"ALGEBRAIC_EMISSION");
check(failedEmissionEpoch.complete&&failedEmissionEpoch.logicalCalls===16&&failedEmissionEpoch.summaries.every(s=>s.accepted===0
  &&s.irRejections===8&&s.emissionFailureCategories?.NUMERIC_LITERAL===8&&s.mathematicallyGraded===0),
  "both arms preserve all ignored-schema emissions as ungraded syntax failures, not sixteen mathematical errors");
const algebraReceipt=JSON.parse(readFileSync("docs/omega/evidence/nyx-algebraic-transfer-8eea3a41.json","utf8")),algebraFrozen=algebraReceipt.frozenReport;
check(algebraReceipt.candidate==="8eea3a4165d07126e60009f7aa1a35b953a902d5"&&algebraReceipt.actions.runId===38287509428
  &&algebraReceipt.actions.jobId===114939300305&&algebraFrozen.candidate===algebraReceipt.candidate
  &&algebraFrozen.freeze.candidate===algebraReceipt.candidate,"live formula receipt binds the original frozen candidate, not the later package fix");
check(algebraReceipt.custody.artifactId===11764093190&&algebraReceipt.custody.archiveBytes===9247
  &&algebraReceipt.custody.archiveSha256==="b3987d59adb0e43e8f3dc772835f9b7251c8e2a4a8f9e0c9262f77334ee640e4"
  &&algebraReceipt.custody.reportBytes===75645&&algebraReceipt.custody.crc32===2886101699&&algebraReceipt.custody.reportLogAgreement,
  "formula artifact has verified ZIP identity, CRC, size and terminal agreement");
check(createHash("sha256").update(JSON.stringify(algebraFrozen,null,2)+"\n").digest("hex")===algebraReceipt.custody.reportSha256
  &&algebraReceipt.custody.reportSha256==="d29a277d1202ce8d6632969b1db9c5849c41b266bccd17ea18880f62271729f6",
  "committed sanitized report reproduces the artifact report bytes without raw generated formulas");
check(theoryDigest(algebraFrozen.freeze)===algebraFrozen.freezeDigest&&theoryDigest(algebraFrozen.freeze.configuration)===theoryDigest(ALGEBRAIC_TRANSFER_EPOCH)
  &&algebraFrozen.freeze.corpusDigest===ALGEBRAIC_TRANSFER_CORPUS_DIGEST&&algebraFrozen.freeze.tasks.every((t:any)=>
    ALGEBRAIC_TRANSFER_CASES.some(c=>t.taskId===c.taskId&&t.family===c.family&&t.digest===theoryDigest(c))),
  "four fresh known-family cases, same exact oracle and generation budgets remain frozen");
check(Object.keys(algebraFrozen.freeze.sourceDigests).length===14&&"src/lib/codelab/research/quantitativeAlgebraicCompiler.ts" in algebraFrozen.freeze.sourceDigests,
  "source custody includes the new compiler and the existing execution/oracle/inference closure");
for(const [path,digest] of Object.entries(algebraFrozen.freeze.sourceDigests)){
  check(/^(?:src|scripts)\/[A-Za-z0-9_./-]+$/.test(path)&&!path.includes(".."),"historical source lookup path is bounded repository data");
  check(theoryDigest(execFileSync("git",["show",`${algebraReceipt.candidate}:${path}`],{encoding:"utf8"}))===digest,
    "formula evidence retains actual historical source identity instead of binding to the new tip");
}
const algebraLiveAttempts=algebraFrozen.rows.flatMap((r:any)=>r.run.attempts);
check(algebraLiveAttempts.length===16&&algebraLiveAttempts.every((a:any)=>a.modelEvidence.evidenceClass==="E4"
  &&a.modelEvidence.model==="nvidia/nemotron-3-super-120b-a12b"&&a.modelEvidence.finishReason==="stop"
  &&a.modelEvidence.usage.totalTokens!==null&&!Object.hasOwn(a,"executedProgram")),
  "all sixteen actual Super completions are full, measured and sanitized; default Ultra identity is not relabeled");
check(algebraFrozen.complete&&algebraFrozen.providerStable&&algebraFrozen.sourceUnchanged&&algebraFrozen.stopReason==="PREDECLARED_PAIRS_COMPLETE"
  &&algebraFrozen.summaries.every((s:any)=>s.attempted===4&&s.accepted===1&&s.firstAttemptAccepted===0&&s.repairedAccepted===1&&s.usage.calls===8),
  "both arms accepted the same one of four cases only after repair, not on first attempt");
check(algebraFrozen.summaries[0].mathematicallyGraded===3&&algebraFrozen.summaries[1].mathematicallyGraded===1
  &&algebraReceipt.accounting.mathematicallyGradedStages===4&&algebraReceipt.accounting.ungradedAttemptedStages===4
  &&algebraFrozen.summaries[0].functionalRejections===2&&algebraFrozen.summaries[1].functionalRejections===0,
  "unreached mathematics stays separate from two independently rejected constructed candidates");
check(algebraFrozen.totals.calls===16&&algebraFrozen.totals.reportedTokens===69744&&algebraFrozen.totals.httpAttempts===16
  &&algebraFrozen.totals.unknownUsageCalls===0&&algebraFrozen.totals.unknownUsageHttpAttempts===0
  &&algebraFrozen.totals.providerFailures===0&&algebraFrozen.totals.recoveredDisruptions===0&&algebraFrozen.totals.toolRequests===11
  &&algebraFrozen.totals.toolWorkUnits===4027,"physical compute, failed parser work and actual native construction are distinguished");
check(algebraFrozen.summaries[0].usage.reportedTokens===36332&&algebraFrozen.summaries[1].usage.reportedTokens===33412
  &&algebraFrozen.pairs.filter((p:any)=>p.realizedComputeMatched).length===2&&algebraFrozen.pairs.filter((p:any)=>p.boundedNoMoreModelCompute).length===3
  &&algebraFrozen.summaries[0].irRejections===5&&algebraFrozen.summaries[1].irRejections===7,
  "less aggregate treatment compute does not imply matched realized pairs or improved source reliability");
check(algebraReceipt.accounting.reasonCodes["quantitative_algebraic_invalid:LEXICAL_TOKEN"]===5
  &&algebraReceipt.accounting.reasonCodes["quantitative_algebraic_invalid:NAME_NOT_BOUND"]===1
  &&algebraReceipt.accounting.reasonCodes["quantitative_algebraic_invalid:DEFINITION_SHAPE_OR_BOUND"]===1
  &&algebraReceipt.accounting.reasonCodes["quantitative_expressions_invalid:SOURCE_NOT_BOUND"]===5,
  "observed general failure codes remain distinct without reconstructing a raw model proposal");
check(!algebraFrozen.scopedFunctionalSignal&&!algebraFrozen.emissionSignal&&!algebraFrozen.scopedRepairSignal
  &&algebraReceipt.assessment.decision==="NO_PROMOTION"&&!algebraReceipt.assessment.cognitiveGainDemonstrated
  &&algebraReceipt.assessment.restrictedToolSynthesisObserved&&algebraFrozen.safety.defaultUltraChanged===false
  &&algebraFrozen.safety.authorityIncrease===false&&algebraFrozen.safety.acceptanceWeakened===false,
  "one accepted authored formula proves bounded integration, not comparative reasoning gain, recursion or authority promotion");
console.log(`OMEGA_BOUNDED_REASONING_WORKBENCH_TEST_SUMMARY passed: ${passed}, failed: ${failed}`);
if (failed) process.exitCode = 1;
