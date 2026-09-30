import { BoundedReasoningSession, NYX_REASONING_WORKBENCH, type ColoringProblem,
  type PredictionTable, type ReachabilityProblem, type ReasoningProblem, type ReasoningToolResult } from
  "../../src/lib/codelab/research/boundedReasoningWorkbench";
import { immutableTheoryValue, theoryDigest } from "../../src/lib/codelab/research/theoryContracts";

export const FRONTIER_WORKBENCH_EPOCH = Object.freeze({
  version: "nyx-frontier-workbench-epoch/1", modelCallsPerStage: 5, candidateSubmissionsPerStage: 3,
  toolRequestsPerStage: 1, maxWorkUnitsPerSession: 50_000, maxElapsedMsPerSession: 2_000,
  independentInstitutionalReplication: false, comparisonScope: "TOOL_ABLATION_NOT_MATCHED_TOOL_COMPUTE",
});

interface LeaseState { phase: string; owner: string; positiveLease: boolean; voteA: string; voteB: string }
const actions = ["PREPARE_A", "PREPARE_B", "VOTE_A", "VOTE_B", "TRANSFER_A", "TRANSFER_B", "COMMIT", "ABORT", "RESET"];
const initial: LeaseState = { phase: "IDLE", owner: "NONE", positiveLease: false, voteA: "NONE", voteB: "NONE" };

/** Independent public-semantics transcription, not an import of the verifier's transition function. */
function leaseGraph(guard: string): ReachabilityProblem {
  function allows(s: LeaseState): boolean {
    switch (guard) {
      case "GUARD_NONEMPTY": return s.voteA !== "NONE" && s.voteB !== "NONE";
      case "GUARD_OWNER_BOUND": return s.owner !== "NONE" && s.voteA === s.owner && s.voteB === s.owner;
      case "GUARD_LEASE_ONLY": return s.positiveLease;
      case "GUARD_ANY_OWNER_VOTE": return s.voteA === s.owner || s.voteB === s.owner;
      default: throw new Error("public_protocol_guard_not_supported");
    }
  }
  function step(s: LeaseState, action: string): LeaseState {
    if (action === "RESET" && ["ABORTED", "COMMITTED"].includes(s.phase)) return { ...initial };
    if (action.startsWith("PREPARE_") && s.phase === "IDLE") return { phase: "PREPARED",
      owner: action.slice(-1), positiveLease: true, voteA: "NONE", voteB: "NONE" };
    if (s.phase !== "PREPARED") return s;
    if (action === "VOTE_A") return { ...s, voteA: s.owner };
    if (action === "VOTE_B") return { ...s, voteB: s.owner };
    if (action.startsWith("TRANSFER_")) return { ...s, owner: action.slice(-1), positiveLease: true };
    if (action === "COMMIT" && allows(s)) return { ...s, phase: "COMMITTED" };
    if (action === "ABORT") return { ...s, phase: "ABORTED" };
    return s;
  }
  const identity = (state: LeaseState): string => JSON.stringify(state);
  const queue = [{ ...initial }]; const visited = new Set([identity(initial)]);
  const transitions: Array<{ from: string; to: string; action: string }> = []; const unsafeStates: string[] = [];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    if (queue.length > 256) throw new Error("public_protocol_compilation_bound");
    const state = queue[cursor]; const from = identity(state);
    if (state.phase === "COMMITTED" && (state.owner === "NONE" || state.voteA !== state.owner
      || state.voteB !== state.owner)) unsafeStates.push(from);
    for (const action of actions) {
      const next = step(state, action); const to = identity(next); transitions.push({ from, to, action });
      if (!visited.has(to)) { visited.add(to); queue.push(next); }
    }
  }
  return { kind: "REACHABILITY", initialState: identity(initial), states: [...visited], transitions, unsafeStates };
}

function table(prompt: Record<string, unknown>): PredictionTable {
  const mechanisms = prompt.mechanisms as Array<{ mechanismId: string }>;
  const matrix = (prompt.forecastMatrix ?? prompt.precommittedForecastMatrix) as Record<string, Record<string, string>>;
  const mechanismIds = mechanisms.map((item) => item.mechanismId);
  const experimentIds = Object.keys(matrix[mechanismIds[0]]);
  return { mechanismIds, experimentIds, predictions: mechanismIds.map((mechanismId) => ({ mechanismId,
    outcomes: experimentIds.map((experimentId) => matrix[mechanismId][experimentId]) })) };
}

export const FRONTIER_TOOL_SCHEMA = Object.freeze({ type: "object", additionalProperties: false,
  required: ["schemaVersion", "operation", "problemDigest"], properties: {
    schemaVersion: { type: "integer", enum: [1] }, operation: { type: "string", enum: ["ANALYZE_FINITE_PROBLEM"] },
    problemDigest: { type: "string" },
  } });

/** Evaluation adapter owns only predeclared public problem data. No reference answers or hidden target access. */
export function createFrontierWorkbench(stageId: string, sourcePrompt: Readonly<Record<string, unknown>>,
  deadlineEpochMs: number) {
  const prompt = immutableTheoryValue(JSON.parse(JSON.stringify(sourcePrompt))) as Record<string, unknown>;
  const problemDigest = theoryDigest({ stageId, prompt });
  let used = false; let revoked = false;
  const evidence: ReasoningToolResult[] = [];
  function run(problem: ReasoningProblem): ReasoningToolResult {
    const session = BoundedReasoningSession.create(problem, { maxWorkUnits: 50_000, maxElapsedMs: 2_000,
      maxRequests: 1, expiresAtEpochMs: deadlineEpochMs });
    try {
      const result = session.analyze({ schemaVersion: 1, operation: "ANALYZE_FINITE_PROBLEM", problemDigest: session.problemDigest });
      evidence.push(result); return result;
    } finally { session.revoke(); }
  }
  function analyze(request: unknown): Readonly<Record<string, unknown>> {
    if (revoked || used || Date.now() >= deadlineEpochMs) throw new Error("frontier_workbench_unavailable");
    if (!request || typeof request !== "object" || Array.isArray(request)
      || Object.keys(request).sort().join(",") !== "operation,problemDigest,schemaVersion"
      || (request as { schemaVersion: number }).schemaVersion !== 1
      || (request as { operation: string }).operation !== "ANALYZE_FINITE_PROBLEM"
      || (request as { problemDigest: string }).problemDigest !== problemDigest) throw new Error("frontier_tool_request_not_authorized");
    used = true;
    let certificateFields: Record<string, unknown> | null = null;
    const assumptions: string[] = [];
    if (stageId === "FRONTIER_GRAPH") {
      // Domain 1..4 and four-clique are published in the frozen graph objective/output law.
      const result = run({ kind: "COLORING", vertices: prompt.vertices, edges: prompt.edges,
        colors: [1, 2, 3, 4], cliqueSize: 4 } as ColoringProblem);
      if (result.status === "CONSTRUCTED") certificateFields = {
        coloring: result.payload!.coloring, clique: result.payload!.clique };
    } else if (stageId === "FRONTIER_PROTOCOL") {
      const protocol = prompt.protocol as { currentGuardId: string; guardCatalog: Array<{ guardId: string }>; safetyInvariant: string };
      const current = run(leaseGraph(protocol.currentGuardId));
      let replacement: string | null = null;
      for (const guard of protocol.guardCatalog) {
        const candidate = run(leaseGraph(guard.guardId));
        if (candidate.status === "EXHAUSTIVE_NO_WITNESS") { replacement = guard.guardId; break; }
      }
      assumptions.push("The public lease abstraction distinguishes zero from positive only; epoch magnitudes are irrelevant to the published guards.",
        "The independently transcribed finite graph must still be checked by the existing protocol oracle.");
      if (current.status === "CONSTRUCTED" && replacement) certificateFields = {
        trace: current.payload!.trace, replacementGuardId: replacement, invariant: protocol.safetyInvariant };
    } else if (stageId === "FRONTIER_CAUSAL_PLAN") {
      const result = run({ kind: "EXPERIMENT_SELECTION", ...table(prompt) });
      if (result.status === "CONSTRUCTED") certificateFields = {
        experimentIds: result.payload!.experimentIds, forecasts: result.payload!.forecasts };
      assumptions.push("Forecasts are declared predictions, not observed evidence.");
    } else if (stageId === "FRONTIER_CAUSAL_CONCLUSION") {
      const observations = prompt.observations as Array<{ experimentId: string; outcome: string; evidenceRef: string }>;
      const result = run({ kind: "HYPOTHESIS_ELIMINATION", ...table(prompt),
        observations: observations.map(({ experimentId, outcome, evidenceRef }) => ({ experimentId, outcome, evidenceRef })) });
      if (result.status === "CONSTRUCTED") certificateFields = { mechanismId: result.payload!.mechanismId,
        evidenceRefs: result.payload!.evidenceRefs, ruledOutMechanismIds: result.payload!.ruledOutMechanismIds };
      assumptions.push("Conclusion is conditional on the admitted observations and the supplied mechanism catalog.");
    } else throw new Error("frontier_problem_not_supported");
    return immutableTheoryValue({ version: NYX_REASONING_WORKBENCH.version, problemDigest,
      decision: certificateFields ? "CANDIDATE_CONSTRUCTED_NOT_ACCEPTED" : "INSUFFICIENT_EVIDENCE",
      certificateFields, assumptions, evidenceDigests: evidence.map((item) => item.resultDigest),
      workUnits: evidence.reduce((sum, item) => sum + item.workUnits, 0),
      elapsedMs: evidence.reduce((sum, item) => sum + item.elapsedMs, 0), grantsAuthority: false });
  }
  return Object.freeze({ descriptor: Object.freeze({ schemaVersion: 1, operation: "ANALYZE_FINITE_PROBLEM",
    problemDigest, maxRequests: 1, grantsAuthority: false, outputIsNotAcceptance: true }),
    analyze, evidence: () => Object.freeze([...evidence]), revoke: () => { revoked = true; } });
}

export function frontierExchangeSchema(certificateSchema: Readonly<Record<string, unknown>>, toolsAvailable: boolean) {
  return { type: "object", additionalProperties: false, required: ["action", "analysisRequest", "certificate"],
    properties: { action: { type: "string", enum: toolsAvailable ? ["SUBMIT_CERTIFICATE", "REQUEST_ANALYSIS"] : ["SUBMIT_CERTIFICATE"] },
      analysisRequest: { anyOf: [FRONTIER_TOOL_SCHEMA, { type: "null" }] },
      certificate: { anyOf: [certificateSchema, { type: "null" }] } } };
}

export function parseFrontierExchange(value: unknown, toolsAvailable: boolean):
  { readonly action: "SUBMIT_CERTIFICATE"; readonly certificate: unknown }
  | { readonly action: "REQUEST_ANALYSIS"; readonly request: unknown } {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).sort().join(",") !== "action,analysisRequest,certificate") throw new Error("frontier_exchange_malformed");
  const exchange = value as { action: string; analysisRequest: unknown; certificate: unknown };
  if (exchange.action === "SUBMIT_CERTIFICATE" && exchange.analysisRequest === null && exchange.certificate
    && typeof exchange.certificate === "object" && !Array.isArray(exchange.certificate)) return {
      action: "SUBMIT_CERTIFICATE", certificate: exchange.certificate };
  if (toolsAvailable && exchange.action === "REQUEST_ANALYSIS" && exchange.certificate === null
    && exchange.analysisRequest && typeof exchange.analysisRequest === "object") return {
      action: "REQUEST_ANALYSIS", request: exchange.analysisRequest };
  throw new Error("frontier_exchange_not_authorized");
}
