import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { BoundedReasoningSession, type ReasoningProblem, type ColoringProblem, type ReachabilityProblem,
  type ExperimentSelectionProblem, type HypothesisEliminationProblem } from "../src/lib/codelab/research/boundedReasoningWorkbench";
import { theoryDigest } from "../src/lib/codelab/research/theoryContracts";
import { QUANTITATIVE_TASKS, expectedQuantities, referenceQuantitativeProgram, verifyQuantitativeSubmission } from "./omega/nyx-quantitative-transfer-fixtures";
import type { QuantitativeProblem, QuantitativeProgram } from "../src/lib/codelab/research/exactQuantitativeDerivation";
import { runNyxQuantitativeTask, quantitativeExchangeSchema } from "../src/lib/codelab/research/nyxQuantitativeReasoning";
import { FRESH_QUANTITATIVE_TASKS,referenceFreshQuantitativeProgram,verifyFreshQuantitativeSubmission } from "./omega/nyx-quantitative-fresh-fixtures";
import { NvidiaNimProvider } from "../src/lib/codelab/model/nvidiaNimProvider";
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
check(JSON.stringify(controlSchema.properties.action)==='{"type":"string","enum":["SUBMIT"]}'
  && !JSON.stringify(controlSchema).includes("ANALYZE_FINITE_PROBLEM"),"control provider schema exposes only existing action rather than tempting unavailable tool use");
for(const task of FRESH_QUANTITATIVE_TASKS) {
  const result=calculation(task.problem,referenceFreshQuantitativeProgram(task));
  check(verifyFreshQuantitativeSubmission(task,{outputs:result.payload!.outputs,confidence:1}).accepted,
    `unchanged exact engine transfers to unseen parameters for ${task.taskId}`);
}
const preservedNegative=JSON.parse(readFileSync("scripts/omega/checkpoints/quantitative-protocol-v1/comparison.json","utf8"));
check(preservedNegative.complete&&preservedNegative.providerStable&&preservedNegative.results.length===12
  &&preservedNegative.summaries.every((s:{accepted:number})=>s.accepted===0),"first negative live protocol experiment preserved without rewriting its result");
check(preservedNegative.candidate==="c2a69187cea0280db2f3060326df50ba5e3f38d2"
  &&preservedNegative.matchedRealizedCompute===false&&!preservedNegative.broadPromotion,
  "failed quantitative comparison stays bound to actual candidate, with no broader capability promotion");
check(theoryDigest(preservedNegative)==="304945fdd03eae04dcf3416eb5998370232753d7af799bbfb8a43953d6c0de64","negative live report remains byte-semantically faithful to immutable E4 job logs");
for(const [path,digest] of Object.entries(preservedNegative.sourceDigests)) {
  if(typeof path!=="string"||path.includes("..")||!path.endsWith(".ts")||!path.startsWith("src/")&&!path.startsWith("scripts/"))
    throw Error("invalid_archived_source_path");
  check(theoryDigest(execFileSync("git",["show",`${preservedNegative.candidate}:${path}`],{encoding:"utf8"}))===digest,
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
console.log(`OMEGA_BOUNDED_REASONING_WORKBENCH_TEST_SUMMARY passed: ${passed}, failed: ${failed}`);
if (failed) process.exitCode = 1;
