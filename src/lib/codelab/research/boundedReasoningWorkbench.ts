import { immutableTheoryValue, theoryDigest } from "./theoryContracts";
import type { FiniteRefutation, ColoringRefutationNode } from "./finiteRefutationVerifier";

/** Constructive algorithms, not a second model or an acceptance authority. */
export const NYX_REASONING_WORKBENCH = Object.freeze({
  version: "nyx-bounded-reasoning-workbench/2",
  grantsAuthority: false,
  maxInputBytes: 128_000,
  planCoverage: Object.freeze({ status: "PARTIAL_JUST_IN_TIME",
    direct: ["DIFFERENT_HARDNESSES_REQUIRE_DIFFERENT_COMPUTATION", "SEMANTIC_SEARCH_EFFICIENCY",
      "EXECUTABLE_EVIDENCE_OUTRANKS_CONFIDENCE", "INSUFFICIENT_EVIDENCE_IS_VALID"],
    supporting: ["GENERATOR_REQUIRES_DETECTOR", "INTERNAL_COMPLEXITY_MUST_PAY_RENT"],
    deferred: ["FOUNDATION_MODEL_TRAINING", "OPEN_ENDED_PROOF", "DEVICE_AUTHORITY"],
    conflicts: [], superseded: ["REPEATING_CERTIFICATE_GUESSES_WITHOUT_COMPUTATIONAL_HELP"] }),
});

export interface ColoringProblem {
  readonly kind: "COLORING";
  readonly vertices: readonly string[];
  readonly edges: readonly (readonly [string, string])[];
  readonly colors: readonly number[];
  readonly cliqueSize: number;
}
export interface ReachabilityProblem {
  readonly kind: "REACHABILITY";
  readonly states: readonly string[];
  readonly initialState: string;
  readonly unsafeStates: readonly string[];
  readonly transitions: readonly { readonly from: string; readonly to: string; readonly action: string }[];
}
export interface PredictionTable {
  readonly mechanismIds: readonly string[];
  readonly experimentIds: readonly string[];
  readonly predictions: readonly { readonly mechanismId: string; readonly outcomes: readonly string[] }[];
}
export interface ExperimentSelectionProblem extends PredictionTable { readonly kind: "EXPERIMENT_SELECTION" }
export interface HypothesisEliminationProblem extends PredictionTable {
  readonly kind: "HYPOTHESIS_ELIMINATION";
  readonly observations: readonly { readonly experimentId: string; readonly outcome: string;
    readonly evidenceRef: string }[];
}
export type ReasoningProblem = ColoringProblem | ReachabilityProblem | ExperimentSelectionProblem
  | HypothesisEliminationProblem;
export interface ReasoningLimits {
  readonly maxWorkUnits: number;
  readonly maxElapsedMs: number;
  readonly maxRequests: number;
  readonly expiresAtEpochMs: number;
}
export interface ReasoningToolRequest {
  readonly schemaVersion: 1;
  readonly operation: "ANALYZE_FINITE_PROBLEM";
  readonly problemDigest: string;
}
export interface ReasoningToolResult {
  readonly version: string;
  readonly inputDigest: string;
  readonly requestDigest: string;
  readonly resultDigest: string;
  readonly status: "CONSTRUCTED" | "EXHAUSTIVE_NO_WITNESS" | "INSUFFICIENT_EVIDENCE" | "BUDGET_EXHAUSTED";
  readonly payload: Readonly<Record<string, unknown>> | null;
  readonly workUnits: number;
  readonly elapsedMs: number;
  readonly evidenceClass: "E3";
  readonly acceptanceRequiresIndependentVerifier: true;
  readonly grantsAuthority: false;
}

function keys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\0") === [...expected].sort().join("\0");
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256 && !value.includes("\0");
}
function strings(value: unknown, maximum: number, allowEmpty = false): value is string[] {
  return Array.isArray(value) && (allowEmpty || value.length > 0) && value.length <= maximum
    && value.every(text) && new Set(value).size === value.length;
}
function integer(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}
/** Reject cyclic/host objects, accessors and oversized trees before cloning. */
function plainData(value: unknown, ancestors = new Set<object>(), counter = { nodes: 0 }, depth = 0): boolean {
  if (++counter.nodes > 30_000 || depth > 10) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (!value || typeof value !== "object" || ancestors.has(value)) return false;
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype
    && Object.getPrototypeOf(value) !== null) return false;
  if (Array.isArray(value) && Reflect.ownKeys(value).length !== value.length + 1) return false;
  if (Reflect.ownKeys(value).some((key) => typeof key !== "string")) return false;
  ancestors.add(value);
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (key === "length" && Array.isArray(value)) continue;
    if (!descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, "value")
      || !plainData(descriptor.value, ancestors, counter, depth + 1)) return false;
  }
  ancestors.delete(value);
  return true;
}
function validTable(value: PredictionTable): boolean {
  return strings(value.mechanismIds, 64) && strings(value.experimentIds, 12)
    && Array.isArray(value.predictions) && value.predictions.length === value.mechanismIds.length
    && new Set(value.predictions.map((row) => row?.mechanismId)).size === value.mechanismIds.length
    && value.predictions.every((row) => keys(row, ["mechanismId", "outcomes"])
      && text(row.mechanismId) && value.mechanismIds.includes(row.mechanismId) && Array.isArray(row.outcomes)
      && row.outcomes.length === value.experimentIds.length && row.outcomes.every(text));
}
function validProblem(value: unknown): value is ReasoningProblem {
  if (!plainData(value) || new TextEncoder().encode(JSON.stringify(value)).byteLength
    > NYX_REASONING_WORKBENCH.maxInputBytes) return false;
  const p = value as ReasoningProblem;
  if (p?.kind === "COLORING") return keys(p, ["kind", "vertices", "edges", "colors", "cliqueSize"])
    && strings(p.vertices, 96) && Array.isArray(p.colors) && p.colors.length > 0 && p.colors.length <= 8
    && p.colors.every((color) => integer(color, 1, 256)) && new Set(p.colors).size === p.colors.length
    && integer(p.cliqueSize, 1, Math.min(8, p.vertices.length)) && Array.isArray(p.edges)
    && p.edges.length <= 4_560 && p.edges.every((edge) => Array.isArray(edge) && edge.length === 2
      && p.vertices.includes(edge[0]) && p.vertices.includes(edge[1]) && edge[0] !== edge[1])
    && new Set(p.edges.map(([a, b]) => JSON.stringify([a, b].sort()))).size === p.edges.length;
  if (p?.kind === "REACHABILITY") return keys(p, ["kind", "states", "initialState", "unsafeStates", "transitions"])
    && strings(p.states, 2_048) && p.states.includes(p.initialState) && strings(p.unsafeStates, 2_048, true)
    && p.unsafeStates.every((state) => p.states.includes(state)) && Array.isArray(p.transitions)
    && p.transitions.length <= 8_192 && p.transitions.every((transition) => keys(transition, ["from", "to", "action"])
      && text(transition.from) && text(transition.to)
      && p.states.includes(transition.from) && p.states.includes(transition.to) && text(transition.action));
  if (p?.kind === "EXPERIMENT_SELECTION") return keys(p, ["kind", "mechanismIds", "experimentIds", "predictions"])
    && validTable(p);
  if (p?.kind === "HYPOTHESIS_ELIMINATION") return keys(p,
    ["kind", "mechanismIds", "experimentIds", "predictions", "observations"]) && validTable(p)
    && Array.isArray(p.observations) && p.observations.length <= p.experimentIds.length
    && new Set(p.observations.map((item) => item?.experimentId)).size === p.observations.length
    && new Set(p.observations.map((item) => item?.evidenceRef)).size === p.observations.length
    && p.observations.every((item) => keys(item, ["experimentId", "outcome", "evidenceRef"])
      && text(item.experimentId) && p.experimentIds.includes(item.experimentId) && text(item.outcome) && text(item.evidenceRef));
  return false;
}

class SearchBudgetExceeded extends Error {}
class WorkBudget {
  units = 0;
  readonly started: number;
  readonly maximum: number;
  readonly duration: number;
  readonly expires: number;
  readonly now: () => number;
  constructor(maximum: number, duration: number, expires: number, now: () => number) {
    this.maximum = maximum; this.duration = duration; this.expires = expires; this.now = now; this.started = now();
  }
  tick(): void {
    if (this.units >= this.maximum || this.now() >= this.expires
      || this.now() - this.started >= this.duration) throw new SearchBudgetExceeded();
    this.units += 1;
  }
}
interface Construction { readonly status: ReasoningToolResult["status"]; readonly payload: Record<string, unknown> }
function noWitness(refutation?: FiniteRefutation): Construction {
  return { status: "EXHAUSTIVE_NO_WITNESS", payload: { finiteDomainExhausted: true,
    ...(refutation ? { refutation } : {}) } };
}

function colorGraph(problem: ColoringProblem, budget: WorkBudget): Construction {
  const adjacent = problem.vertices.map(() => new Set<number>());
  const index = new Map(problem.vertices.map((vertex, at) => [vertex, at]));
  for (const [a, b] of problem.edges) { budget.tick(); adjacent[index.get(a)!].add(index.get(b)!); adjacent[index.get(b)!].add(index.get(a)!); }
  function clique(size: number, selected: number[], available: number[]): number[] | null {
    budget.tick();
    if (selected.length === size) return selected;
    if (selected.length + available.length < size) return null;
    for (let at = 0; at < available.length; at += 1) {
      budget.tick();
      const vertex = available[at];
      const found = clique(size, [...selected, vertex], available.slice(at + 1).filter((next) => adjacent[vertex].has(next)));
      if (found) return found;
    }
    return null;
  }
  // A bounded structural obstruction is stronger than an opaque "search finished" flag.
  // Limit this preliminary search: failure to find a clique is never itself an absence proof.
  const obstructionBudgetStart = budget.units;
  function obstruction(selected: number[], available: number[]): number[] | null {
    budget.tick();
    if (selected.length > problem.colors.length) return selected;
    if (budget.units - obstructionBudgetStart >= 128
      || selected.length + available.length <= problem.colors.length) return null;
    for (let at = 0; at < available.length; at++) {
      budget.tick();
      if (budget.units - obstructionBudgetStart >= 128) return null;
      const vertex = available[at];
      const found = obstruction([...selected, vertex], available.slice(at + 1).filter(next => adjacent[vertex].has(next)));
      if (found) return found;
    }
    return null;
  }
  const blocked = obstruction([], problem.vertices.map((_, at) => at));
  if (blocked) return noWitness({ schemaVersion: 1, kind: "COLORING_CLIQUE_OBSTRUCTION",
    problemDigest: theoryDigest(problem), vertices: blocked.map(at => problem.vertices[at]) });
  const assignment = Array<number>(problem.vertices.length).fill(-1);
  const nodes: ColoringRefutationNode[] = [];
  let proofBoundExceeded = false;
  let lastFailedNode: number | null = null;
  function search(remaining: number): boolean {
    budget.tick();
    if (remaining === 0) return true;
    let chosen = -1;
    let saturation = -1;
    for (let vertex = 0; vertex < assignment.length; vertex += 1) {
      budget.tick();
      if (assignment[vertex] !== -1) continue;
      const used = new Set([...adjacent[vertex]].map((neighbor) => assignment[neighbor]).filter((color) => color !== -1));
      if (used.size > saturation || used.size === saturation && adjacent[vertex].size > adjacent[chosen]?.size) {
        chosen = vertex; saturation = used.size;
      }
    }
    const forbidden = new Set([...adjacent[chosen]].map((neighbor) => assignment[neighbor]));
    const branches: ColoringRefutationNode["branches"][number][] = [];
    for (const color of problem.colors) {
      budget.tick();
      if (forbidden.has(color)) {
        const neighbor = [...adjacent[chosen]].find(next => assignment[next] === color)!;
        branches.push({ color, child: null, conflictWith: problem.vertices[neighbor] }); continue;
      }
      assignment[chosen] = color;
      if (search(remaining - 1)) return true;
      branches.push({ color, child: lastFailedNode, conflictWith: null });
      assignment[chosen] = -1;
    }
    // Resource-limited proof emission does not change the solver's truth claim or its verifier.
    if (nodes.length >= 1024 || proofBoundExceeded) { proofBoundExceeded = true; lastFailedNode = null; }
    else { lastFailedNode = nodes.length; nodes.push({ vertex: problem.vertices[chosen], branches }); }
    return false;
  }
  if (!search(assignment.length)) return noWitness(!proofBoundExceeded && lastFailedNode !== null
    ? { schemaVersion: 1, kind: "COLORING_SEARCH_REFUTATION", problemDigest: theoryDigest(problem), nodes, root: lastFailedNode }
    : undefined);
  const witness = clique(problem.cliqueSize, [], problem.vertices.map((_, at) => at));
  if (!witness) return noWitness();
  return { status: "CONSTRUCTED", payload: {
    coloring: problem.vertices.map((vertex, at) => ({ vertex, color: assignment[at] })),
    clique: witness.map((at) => problem.vertices[at]),
    scope: "COLORING_AND_REQUESTED_CLIQUE_NOT_UNRESTRICTED_OPTIMALITY" } };
}

function explore(problem: ReachabilityProblem, budget: WorkBudget): Construction {
  const outgoing = new Map<string, ReachabilityProblem["transitions"][number][]>();
  for (const edge of problem.transitions) {
    budget.tick(); const bucket = outgoing.get(edge.from) ?? []; bucket.push(edge); outgoing.set(edge.from, bucket);
  }
  const queue = [problem.initialState];
  const parent = new Map<string, { state: string; action: string } | null>([[problem.initialState, null]]);
  const unsafe = new Set(problem.unsafeStates);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    budget.tick(); const state = queue[cursor];
    if (unsafe.has(state)) {
      const trace: string[] = []; const stateTrace = [state]; let current = state;
      while (parent.get(current)) {
        budget.tick(); const previous = parent.get(current)!;
        trace.push(previous.action); stateTrace.push(previous.state); current = previous.state;
      }
      return { status: "CONSTRUCTED", payload: { trace: trace.reverse(), stateTrace: stateTrace.reverse(),
        shortestInDeclaredGraph: true, reachedUnsafeState: state, exploredStates: parent.size } };
    }
    for (const edge of outgoing.get(state) ?? []) {
      budget.tick(); if (parent.has(edge.to)) continue;
      parent.set(edge.to, { state, action: edge.action }); queue.push(edge.to);
    }
  }
  return { status: "EXHAUSTIVE_NO_WITNESS", payload: { finiteDomainExhausted: true,
    refutation: { schemaVersion: 1, kind: "REACHABILITY_CLOSED_INVARIANT", problemDigest: theoryDigest(problem), states: queue },
    exploredStates: parent.size, scope: "SUPPLIED_FINITE_GRAPH_ONLY_NOT_REAL_SYSTEM_SAFETY" } };
}

function selectExperiments(problem: ExperimentSelectionProblem, budget: WorkBudget): Construction {
  // Check information-theoretic nonidentifiability before enumerating experiment subsets.
  const fullForecasts = new Map<string, string>();
  for (const row of problem.predictions) {
    budget.tick(); const signature = JSON.stringify(row.outcomes); const previous = fullForecasts.get(signature);
    if (previous !== undefined) return noWitness({ schemaVersion: 1, kind: "PREDICTION_NON_IDENTIFIABILITY",
      problemDigest: theoryDigest(problem), mechanismIds: [previous, row.mechanismId] });
    fullForecasts.set(signature, row.mechanismId);
  }
  function separates(indices: number[]): boolean {
    const seen = new Set<string>();
    for (const row of problem.predictions) {
      budget.tick(); const signature = JSON.stringify(indices.map((at) => row.outcomes[at]));
      if (seen.has(signature)) return false; seen.add(signature);
    }
    return true;
  }
  function choose(size: number, selected: number[], start: number): number[] | null {
    budget.tick();
    if (selected.length === size) return separates(selected) ? selected : null;
    for (let at = start; at <= problem.experimentIds.length - (size - selected.length); at += 1) {
      budget.tick(); const result = choose(size, [...selected, at], at + 1); if (result) return result;
    }
    return null;
  }
  for (let size = 0; size <= problem.experimentIds.length; size += 1) {
    const indices = choose(size, [], 0);
    if (indices) return { status: "CONSTRUCTED", payload: {
      experimentIds: indices.map((at) => problem.experimentIds[at]), minimumCardinality: size,
      forecasts: problem.predictions.flatMap((row) => indices.map((at) => ({ mechanismId: row.mechanismId,
        experimentId: problem.experimentIds[at], expectedOutcome: row.outcomes[at] }))),
      scope: "DECLARED_PREDICTIONS_NOT_EMPIRICAL_MECHANISM_TRUTH" } };
  }
  return noWitness();
}

function eliminate(problem: HypothesisEliminationProblem, budget: WorkBudget): Construction {
  const survivors: string[] = []; const ruledOutMechanismIds: string[] = [];
  const witnesses: { mechanismId: string; experimentId: string; evidenceRef: string; expectedOutcome: string; observedOutcome: string }[] = [];
  for (const row of problem.predictions) {
    let consistent = true;
    for (const observation of problem.observations) {
      budget.tick();
      const expectedOutcome = row.outcomes[problem.experimentIds.indexOf(observation.experimentId)];
      if (expectedOutcome !== observation.outcome) {
        if (consistent) witnesses.push({ mechanismId: row.mechanismId, experimentId: observation.experimentId,
          evidenceRef: observation.evidenceRef, expectedOutcome, observedOutcome: observation.outcome });
        consistent = false;
      }
    }
    (consistent ? survivors : ruledOutMechanismIds).push(row.mechanismId);
  }
  return { status: survivors.length === 1 ? "CONSTRUCTED" : "INSUFFICIENT_EVIDENCE", payload: {
    mechanismId: survivors.length === 1 ? survivors[0] : null, survivors, ruledOutMechanismIds,
    evidenceRefs: problem.observations.map((observation) => observation.evidenceRef),
    ...(survivors.length === 0 ? { refutation: { schemaVersion: 1, kind: "HYPOTHESIS_CONFLICT",
      problemDigest: theoryDigest(problem), witnesses } } : {}),
    conflict: survivors.length === 0, scope: "CONDITIONAL_ON_SUPPLIED_FORECASTS_AND_ADMITTED_OBSERVATIONS" } };
}

/** Process-local prebound data; the model can request computation, never replace its scope or budget. */
export class BoundedReasoningSession {
  readonly #problem: ReasoningProblem;
  readonly #limits: ReasoningLimits;
  readonly #now: () => number;
  #requests = 0;
  #workUnits = 0;
  #revoked = false;
  readonly problemDigest: string;
  private constructor(problem: ReasoningProblem, limits: ReasoningLimits, now: () => number) {
    this.#problem = immutableTheoryValue(JSON.parse(JSON.stringify(problem)));
    this.#limits = Object.freeze({ ...limits }); this.#now = now; this.problemDigest = theoryDigest(this.#problem);
  }
  static create(problem: ReasoningProblem, limits: ReasoningLimits, now = () => Date.now()): BoundedReasoningSession {
    if (!validProblem(problem)) throw new Error("reasoning_problem_invalid");
    if (!keys(limits, ["maxWorkUnits", "maxElapsedMs", "maxRequests", "expiresAtEpochMs"])
      || !integer(limits.maxWorkUnits, 1, 1_000_000) || !integer(limits.maxElapsedMs, 1, 10_000)
      || !integer(limits.maxRequests, 1, 8) || !integer(limits.expiresAtEpochMs, 1, Number.MAX_SAFE_INTEGER)
      || !Number.isFinite(now()) || limits.expiresAtEpochMs <= now()) throw new Error("reasoning_limits_invalid");
    return new BoundedReasoningSession(problem, limits, now);
  }
  descriptor(): Readonly<Record<string, unknown>> {
    return Object.freeze({ schemaVersion: 1, operation: "ANALYZE_FINITE_PROBLEM", problemDigest: this.problemDigest,
      kind: this.#problem.kind, maxWorkUnits: this.#limits.maxWorkUnits, maxRequests: this.#limits.maxRequests,
      grantsAuthority: false, outputIsNotAcceptance: true });
  }
  revoke(): void { this.#revoked = true; }
  analyze(request: unknown): ReasoningToolResult {
    if (this.#revoked || this.#now() >= this.#limits.expiresAtEpochMs) throw new Error("reasoning_session_unavailable");
    if (!plainData(request) || !keys(request, ["schemaVersion", "operation", "problemDigest"])
      || request.schemaVersion !== 1 || request.operation !== "ANALYZE_FINITE_PROBLEM"
      || request.problemDigest !== this.problemDigest) throw new Error("reasoning_request_not_authorized");
    if (this.#requests >= this.#limits.maxRequests || this.#workUnits >= this.#limits.maxWorkUnits)
      throw new Error("reasoning_session_budget_exhausted");
    this.#requests += 1;
    const budget = new WorkBudget(this.#limits.maxWorkUnits - this.#workUnits, this.#limits.maxElapsedMs,
      this.#limits.expiresAtEpochMs, this.#now);
    let construction: Construction | null = null;
    try {
      if (this.#problem.kind === "COLORING") construction = colorGraph(this.#problem, budget);
      else if (this.#problem.kind === "REACHABILITY") construction = explore(this.#problem, budget);
      else if (this.#problem.kind === "EXPERIMENT_SELECTION") construction = selectExperiments(this.#problem, budget);
      else construction = eliminate(this.#problem, budget);
    } catch (error) { if (!(error instanceof SearchBudgetExceeded)) throw error; }
    this.#workUnits += budget.units;
    const result = { version: NYX_REASONING_WORKBENCH.version, inputDigest: this.problemDigest,
      requestDigest: theoryDigest(request), status: construction?.status ?? "BUDGET_EXHAUSTED" as const,
      payload: construction?.payload ?? null, workUnits: budget.units, elapsedMs: Math.max(0, this.#now() - budget.started),
      evidenceClass: "E3" as const, acceptanceRequiresIndependentVerifier: true as const, grantsAuthority: false as const };
    return immutableTheoryValue({ ...result, resultDigest: theoryDigest(result) });
  }
}
