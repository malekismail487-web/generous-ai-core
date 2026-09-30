import type { ColoringProblem, PredictionTable, ReasoningProblem, ReachabilityProblem } from
  "../../src/lib/codelab/research/boundedReasoningWorkbench";
import { immutableTheoryValue, theoryDigest } from "../../src/lib/codelab/research/theoryContracts";

export const WORKBENCH_TRANSFER_EPOCH = Object.freeze({
  version: "nyx-workbench-transfer/1", chunkId: "NYX-WORKBENCH-TRANSFER-001",
  seed: 830017, maxCallsPerTask: 3, maxCallsPerArm: 24, maxOutputTokensPerCall: 2048,
  maxWallClockMs: 1_800_000, maxTaskMs: 240_000, maxToolRequestsPerTask: 1,
  maxToolWorkUnits: 50_000, maxToolElapsedMs: 2_000,
  scope: "FRESH_FINITE_STRUCTURAL_TRANSFER_NOT_GENERAL_FRONTIER_CERTIFICATION",
  frozenBeforeFirstLiveRun: true, independentInstitutionalReplication: false,
  planCoverage: { status: "PARTIAL_JUST_IN_TIME", direct: ["FRONTIER_PROGRESS_MUST_SURVIVE_REPLAY",
    "DIFFERENT_HARDNESSES_REQUIRE_DIFFERENT_COMPUTATION", "GENERATOR_REQUIRES_DETECTOR"],
    supporting: ["INSUFFICIENT_EVIDENCE_IS_VALID", "VERIFIED_CAPABILITY_PER_COMPUTE"],
    deferred: ["OPEN_ENDED_RESEARCH", "MODEL_WEIGHT_ADAPTATION", "DEVICE_AUTHORITY"], conflicts: [] },
});
export interface TransferTask { readonly taskId: string; readonly objective: string; readonly problem: ReasoningProblem }
export interface TransferCertificate { readonly schemaVersion: 1; readonly decision: "SUBMIT";
  readonly status: string; readonly payload: Readonly<Record<string, unknown>>;
  readonly confidence: number; readonly uncertainties: readonly string[] }

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
}
function coloredGraph(seed: number, impossible: boolean): ColoringProblem {
  const rng = random(seed); const vertices = Array.from({ length: impossible ? 8 : 14 }, (_, i) => `slot-${seed}-${i}`);
  const colors = [3, 7, 11]; const edges: [string, string][] = [];
  for (let i = 0; i < vertices.length; i += 1) for (let j = i + 1; j < vertices.length; j += 1) {
    const forced = i < (impossible ? 4 : 3) && j < (impossible ? 4 : 3);
    if (forced || i % 3 !== j % 3 && rng() < 0.64) edges.push([vertices[i], vertices[j]]);
  }
  return { kind: "COLORING", vertices, edges, colors, cliqueSize: 3 };
}
function stateGraph(seed: number, safe: boolean): ReachabilityProblem {
  const rng = random(seed); const states = Array.from({ length: 13 }, (_, i) => `phase-${seed}-${i}`);
  const transitions: ReachabilityProblem["transitions"][number][] = [];
  const size = safe ? states.length - 1 : states.length;
  for (let i = 0; i < size; i += 1) for (let j = 0; j < size; j += 1)
    if (j === i + 1 || i !== j && rng() < 0.11)
      transitions.push({ from: states[i], to: states[j], action: `move-${i}-${j}` });
  return { kind: "REACHABILITY", states, initialState: states[0], unsafeStates: [states.at(-1)!], transitions };
}
function predictionTable(seed: number, mechanisms: number): PredictionTable {
  const experiments = Array.from({ length: 6 }, (_, i) => `probe-${seed}-${i}`);
  return { mechanismIds: Array.from({ length: mechanisms }, (_, i) => `theory-${seed}-${i}`), experimentIds: experiments,
    predictions: Array.from({ length: mechanisms }, (_, i) => ({ mechanismId: `theory-${seed}-${i}`,
      outcomes: experiments.map((_, bit) => (i >> (bit % 3) & 1) === 1 ? "high" : "low") })) };
}
const domainLaw = "Answer only about the supplied finite domain. This is a conditional computation, not a claim that a real physical system or open-ended theory is universally true.";
export const WORKBENCH_TRANSFER_TASKS: readonly TransferTask[] = immutableTheoryValue([
  { taskId: "TRANSFER-COLOR-CONSTRUCT", objective: `${domainLaw} Produce a proper coloring and the requested clique; if their conjunction is impossible, return EXHAUSTIVE_NO_WITNESS.`, problem: coloredGraph(830018, false) },
  { taskId: "TRANSFER-COLOR-IMPOSSIBLE", objective: `${domainLaw} Determine whether a proper coloring and the requested clique both exist. Never invent a construction.`, problem: coloredGraph(830019, true) },
  { taskId: "TRANSFER-REACH-COUNTEREXAMPLE", objective: `${domainLaw} Return a shortest executable trace to an unsafe state, with its stateTrace.`, problem: stateGraph(830020, false) },
  { taskId: "TRANSFER-REACH-CONFINED", objective: `${domainLaw} Decide if any unsafe state is reachable; absence is limited to this declared graph.`, problem: stateGraph(830021, true) },
  { taskId: "TRANSFER-EXPERIMENT-DESIGN", objective: `${domainLaw} Choose a minimum-cardinality separating experiment set and precommit every selected forecast.`, problem: { kind: "EXPERIMENT_SELECTION", ...predictionTable(830022, 8) } },
  ...["UNIQUE", "AMBIGUOUS", "CONFLICTED"].map((mode, at) => {
    const data = predictionTable(830023 + at, 6);
    const indices = mode === "UNIQUE" ? [0, 1, 2] : mode === "AMBIGUOUS" ? [0, 1] : [0];
    return { taskId: `TRANSFER-HYPOTHESIS-${mode}`, objective: `${domainLaw} Determine all survivors and ruled-out alternatives from admitted observations. Select a mechanism only if exactly one survives; otherwise return INSUFFICIENT_EVIDENCE with the exact survivor set and conflict flag.`,
      problem: { kind: "HYPOTHESIS_ELIMINATION", ...data, observations: indices.map(i => ({ experimentId: data.experimentIds[i],
        outcome: mode === "CONFLICTED" ? "not-in-predictions" : data.predictions[4].outcomes[i], evidenceRef: `E3:ADMITTED:${mode}:${i}` })) } };
  }),
] as TransferTask[]);
export const WORKBENCH_TRANSFER_CORPUS_DIGEST = theoryDigest(WORKBENCH_TRANSFER_TASKS);

export function transferCertificateSchema() {
  return { type: "object", additionalProperties: false,
    required: ["schemaVersion", "decision", "status", "payload", "confidence", "uncertainties"], properties: {
      schemaVersion: { type: "integer", enum: [1] }, decision: { type: "string", enum: ["SUBMIT"] },
      status: { type: "string", enum: ["CONSTRUCTED", "EXHAUSTIVE_NO_WITNESS", "INSUFFICIENT_EVIDENCE"] },
      payload: { type: "object", additionalProperties: true }, confidence: { type: "number" },
      uncertainties: { type: "array", items: { type: "string" } } } };
}

/** Projection changes representation only; the verifier, not this function, checks truth. */
export function transferPayload(problem: ReasoningProblem, value: Readonly<Record<string, unknown>> | null) {
  const p = value ?? {};
  const fields = p.finiteDomainExhausted === true ? ["finiteDomainExhausted"]
    : problem.kind === "COLORING" ? ["coloring", "clique"]
    : problem.kind === "REACHABILITY" ? ["trace", "stateTrace"]
    : problem.kind === "EXPERIMENT_SELECTION" ? ["experimentIds", "forecasts", "minimumCardinality"]
    : ["mechanismId", "survivors", "ruledOutMechanismIds", "evidenceRefs", "conflict"];
  return immutableTheoryValue(Object.fromEntries(fields.map(field => [field, p[field]])));
}

const hasKeys = (value: unknown, names: string[]): value is Record<string, unknown> => !!value
  && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).sort().join("\0") === [...names].sort().join("\0");
const sameSet = (value: unknown, expected: readonly string[]): boolean => Array.isArray(value)
  && value.every(x => typeof x === "string") && new Set(value).size === value.length
  && value.length === expected.length && expected.every(x => value.includes(x));

/** Independent fixed-order enumeration, not the workbench's saturation/backtracking search. */
function coloringExists(p: ColoringProblem): boolean {
  const assigned: number[] = [];
  function enumerate(index: number): boolean {
    if (index === p.vertices.length) return true;
    for (const color of p.colors) {
      if (p.edges.some(([a, b]) => a === p.vertices[index] && assigned[p.vertices.indexOf(b)] === color
        || b === p.vertices[index] && assigned[p.vertices.indexOf(a)] === color)) continue;
      assigned[index] = color; if (enumerate(index + 1)) return true; assigned.length = index;
    }
    return false;
  }
  return enumerate(0);
}
function isClique(p: ColoringProblem, candidate: unknown): boolean {
  return Array.isArray(candidate) && candidate.length === p.cliqueSize && new Set(candidate).size === candidate.length
    && candidate.every(v => p.vertices.includes(v)) && candidate.every((a, i) => candidate.slice(i + 1)
      .every(b => p.edges.some(([x, y]) => x === a && y === b || y === a && x === b)));
}
function cliqueExists(p: ColoringProblem): boolean {
  // Enumerate subsets independently of adjacency-intersection search.
  for (let mask = 1; mask < 2 ** p.vertices.length; mask += 1) {
    const selected = p.vertices.filter((_, i) => mask >> i & 1);
    if (isClique(p, selected)) return true;
  }
  return false;
}
/** All-pairs distances provide an oracle distinct from the workbench's parent-map BFS. */
function shortestDistance(p: ReachabilityProblem): number {
  const n = p.states.length; const d = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => i === j ? 0 : Infinity));
  for (const edge of p.transitions) {
    const from = p.states.indexOf(edge.from); const to = p.states.indexOf(edge.to);
    d[from][to] = Math.min(d[from][to], 1);
  }
  for (let k = 0; k < n; k += 1) for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1)
    d[i][j] = Math.min(d[i][j], d[i][k] + d[k][j]);
  return Math.min(...p.unsafeStates.map(s => d[p.states.indexOf(p.initialState)][p.states.indexOf(s)]));
}
function minimumExperiments(p: PredictionTable): number {
  let minimum = Infinity;
  for (let mask = 0; mask < 2 ** p.experimentIds.length; mask += 1) {
    const indices = p.experimentIds.flatMap((_, i) => mask >> i & 1 ? [i] : []);
    const signatures = p.predictions.map(row => JSON.stringify(indices.map(i => row.outcomes[i])));
    if (new Set(signatures).size === p.mechanismIds.length) minimum = Math.min(minimum, indices.length);
  }
  return minimum;
}

export function verifyTransferCertificate(task: TransferTask, value: unknown) {
  const findings: string[] = [];
  const serializable = boundedPlainJson(value);
  if (!serializable || !hasKeys(value, ["schemaVersion", "decision", "status", "payload", "confidence", "uncertainties"])
    || value.schemaVersion !== 1 || value.decision !== "SUBMIT" || typeof value.confidence !== "number"
    || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1
    || !Array.isArray(value.uncertainties) || value.uncertainties.length > 8
    || !value.uncertainties.every(x => typeof x === "string" && x.length <= 500)
    || !value.payload || typeof value.payload !== "object" || Array.isArray(value.payload)) findings.push("CERTIFICATE_SCHEMA_INVALID");
  else {
    const p = task.problem; const payload = value.payload as Record<string, unknown>;
    if (value.status === "BUDGET_EXHAUSTED") findings.push("RESOURCE_EXHAUSTION_IS_NOT_A_PROOF");
    else if (p.kind === "COLORING") {
      const possible = coloringExists(p) && cliqueExists(p);
      if (!possible) {
        if (value.status !== "EXHAUSTIVE_NO_WITNESS" || !hasKeys(payload, ["finiteDomainExhausted"])
          || payload.finiteDomainExhausted !== true) findings.push("COLOR_IMPOSSIBILITY_NOT_ESTABLISHED");
      } else {
        const rows = payload.coloring as { vertex: string; color: number }[];
        if (value.status !== "CONSTRUCTED" || !hasKeys(payload, ["coloring", "clique"]) || !Array.isArray(rows)
          || rows.length !== p.vertices.length || rows.some(row => !hasKeys(row, ["vertex", "color"]))
          || !sameSet(rows.map(row => row.vertex), p.vertices) || rows.some(row => !p.colors.includes(row.color)))
          findings.push("COLOR_WITNESS_STRUCTURE_INVALID");
        else if (p.edges.some(([a, b]) => rows.find(row => row.vertex === a)!.color === rows.find(row => row.vertex === b)!.color))
          findings.push("COLOR_EDGE_CONFLICT");
        if (!isClique(p, payload.clique)) findings.push("COLOR_CLIQUE_INVALID");
      }
    } else if (p.kind === "REACHABILITY") {
      const distance = shortestDistance(p);
      if (!Number.isFinite(distance)) {
        if (value.status !== "EXHAUSTIVE_NO_WITNESS" || !hasKeys(payload, ["finiteDomainExhausted"])
          || payload.finiteDomainExhausted !== true) findings.push("REACH_ABSENCE_NOT_ESTABLISHED");
      } else {
        const trace = payload.trace; const states = payload.stateTrace;
        if (value.status !== "CONSTRUCTED" || !hasKeys(payload, ["trace", "stateTrace"])
          || !Array.isArray(trace) || !Array.isArray(states) || trace.length !== distance || states.length !== trace.length + 1
          || states[0] !== p.initialState || !p.unsafeStates.includes(states.at(-1))) findings.push("REACH_SHORTEST_WITNESS_INVALID");
        else if (trace.some((action, i) => !p.transitions.some(edge => edge.action === action && edge.from === states[i] && edge.to === states[i + 1])))
          findings.push("REACH_TRACE_NOT_EXECUTABLE");
      }
    } else if (p.kind === "EXPERIMENT_SELECTION") {
      const selected = payload.experimentIds as string[]; const minimum = minimumExperiments(p);
      if (value.status !== "CONSTRUCTED" || !hasKeys(payload, ["experimentIds", "forecasts", "minimumCardinality"])
        || !Array.isArray(selected) || selected.length !== minimum || new Set(selected).size !== selected.length
        || selected.some(id => !p.experimentIds.includes(id)) || payload.minimumCardinality !== minimum)
        findings.push("EXPERIMENT_CARDINALITY_INVALID");
      else {
        const signatures = p.predictions.map(row => JSON.stringify(selected.map(id => row.outcomes[p.experimentIds.indexOf(id)])));
        if (new Set(signatures).size !== p.mechanismIds.length) findings.push("EXPERIMENT_SET_NOT_SEPARATING");
        const expected = p.predictions.flatMap(row => selected.map(id => JSON.stringify({ mechanismId: row.mechanismId,
          experimentId: id, expectedOutcome: row.outcomes[p.experimentIds.indexOf(id)] })));
        if (!Array.isArray(payload.forecasts) || payload.forecasts.some(row => !hasKeys(row, ["mechanismId", "experimentId", "expectedOutcome"]))
          || !sameSet(payload.forecasts.map(row => { const r = row as Record<string, unknown>; return JSON.stringify({ mechanismId: r.mechanismId,
            experimentId: r.experimentId, expectedOutcome: r.expectedOutcome }); }), expected)) findings.push("EXPERIMENT_FORECASTS_INVALID");
      }
    } else {
      let survivors = new Set(p.mechanismIds);
      for (const observation of p.observations) {
        const column = p.experimentIds.indexOf(observation.experimentId);
        const matches = new Set(p.predictions.filter(row => row.outcomes[column] === observation.outcome).map(row => row.mechanismId));
        survivors = new Set([...survivors].filter(id => matches.has(id)));
      }
      const expected = [...survivors]; const ruledOut = p.mechanismIds.filter(id => !survivors.has(id));
      if (!hasKeys(payload, ["mechanismId", "survivors", "ruledOutMechanismIds", "evidenceRefs", "conflict"])
        || !sameSet(payload.survivors, expected) || !sameSet(payload.ruledOutMechanismIds, ruledOut)) findings.push("HYPOTHESIS_SURVIVORS_INVALID");
      if (!sameSet(payload.evidenceRefs, p.observations.map(item => item.evidenceRef))) findings.push("HYPOTHESIS_EVIDENCE_REFS_INVALID");
      if (value.status !== (expected.length === 1 ? "CONSTRUCTED" : "INSUFFICIENT_EVIDENCE")
        || payload.mechanismId !== (expected.length === 1 ? expected[0] : null) || payload.conflict !== (expected.length === 0))
        findings.push("HYPOTHESIS_EPISTEMIC_STATE_INVALID");
    }
  }
  return immutableTheoryValue({ accepted: findings.length === 0, findings,
    evidenceClass: "E3", evidenceDigest: theoryDigest({ taskId: task.taskId, problem: task.problem,
      value: serializable ? value : "INVALID_NON_JSON_VALUE", findings }),
    grantsAuthority: false });
}

/** Reject accessors/cycles/host objects before reading fields or canonicalizing evidence. */
function boundedPlainJson(value: unknown): boolean {
  const seen = new Set<object>(); let nodes = 0;
  function visit(item: unknown, depth: number): boolean {
    if (++nodes > 4096 || depth > 16) return false;
    if (item === null || typeof item === "boolean") return true;
    if (typeof item === "number") return Number.isFinite(item);
    if (typeof item === "string") return item.length <= 16_384;
    if (!item || typeof item !== "object" || seen.has(item)) return false;
    const prototype = Object.getPrototypeOf(item);
    if (prototype !== Object.prototype && prototype !== Array.prototype) return false;
    seen.add(item);
    const descriptors = Object.getOwnPropertyDescriptors(item);
    return Reflect.ownKeys(descriptors).every(key => typeof key === "string"
      && Object.hasOwn(descriptors[key], "value") && visit(descriptors[key].value, depth + 1));
  }
  return visit(value, 0);
}
