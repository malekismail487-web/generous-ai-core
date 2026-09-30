import { readFileSync } from "node:fs";
import { BoundedReasoningSession, type ReasoningProblem, type ColoringProblem, type ReachabilityProblem,
  type ExperimentSelectionProblem, type HypothesisEliminationProblem } from "../src/lib/codelab/research/boundedReasoningWorkbench";
import { theoryDigest } from "../src/lib/codelab/research/theoryContracts";
import { createFrontierWorkbench, parseFrontierExchange, frontierExchangeSchema,
  materializeFrontierArtifact } from "./omega/nyx-frontier-workbench";
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
function candidate(result: Readonly<Record<string, unknown>>, decision: string) {
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
const coreSource = readFileSync("src/lib/codelab/research/boundedReasoningWorkbench.ts", "utf8");
const adapterSource = readFileSync("scripts/omega/nyx-frontier-workbench.ts", "utf8");
check(!coreSource.includes("frontier-reasoning-fixtures") && !adapterSource.includes("referenceGraph")
  && !adapterSource.includes("CAUSAL_TARGET") && !adapterSource.includes("verifyProtocolSubmission"),
  "constructors cannot read verifier reference answers or hidden causal target");
console.log(`NYX_WORKBENCH_DIFFERENTIAL_EVIDENCE ${JSON.stringify({ graphTasks: 32, satisfiable,
  greedyBaselineSolved: baselineSolved, workbenchSolved: constructed, graphOracleMismatches: mismatches,
  stateTasks: 24, reachabilityMismatches, experimentTasks: 24, selectionMismatches,
  scope: "GENERATED_FINITE_TASKS_NOT_LIVE_MODEL_OR_FRONTIER_CERTIFICATION" })}`);
console.log(`OMEGA_BOUNDED_REASONING_WORKBENCH_TEST_SUMMARY passed: ${passed}, failed: ${failed}`);
if (failed) process.exitCode = 1;
