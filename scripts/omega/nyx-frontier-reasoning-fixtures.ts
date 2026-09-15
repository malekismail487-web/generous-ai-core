import { createHash } from "node:crypto";
import type { ObligationWorkPacket, ReasoningObligationDefinition } from
  "../../src/lib/codelab/research/reasoningObligationGraph";

export const NYX_FRONTIER_GAUNTLET = Object.freeze({
  chunkId: "NYX-FRONTIER-GAUNTLET-001",
  version: "nyx-frontier-reasoning/3",
  scope: "BOUNDED_FRONTIER_STYLE_EVALUATION_NOT_AGI_CERTIFICATION",
  maxModelCalls: 20,
  maxCallsPerStage: 5,
  maxCandidateSubmissionsPerStage: 3,
  maxProviderFailuresPerStage: 2,
  maxFeedbackFindings: 32,
  maxOutputTokensPerCall: 2_048,
  maxCumulativeOutputTokens: 40_960,
  maxWallClockMs: 30 * 60_000,
  authorityGranted: false,
  planCoverage: Object.freeze({
    status: "PARTIAL_JUST_IN_TIME",
    direct: Object.freeze([
      "VI_SEARCH_AND_FALSIFICATION",
      "IV_ADVERSARIAL_VERIFICATION",
      "VI_RESEARCH_SCIENTIST_ENGINE",
      "DCCL_PROBLEM_DIFFICULTY_FACTORIZATION",
    ]),
    supporting: Object.freeze([
      "EXECUTABLE_EVIDENCE_OUTRANKS_CONFIDENCE",
      "COUNTEREXAMPLE_PRESERVING_REASONING",
      "DIFFERENT_HARDNESSES_REQUIRE_DIFFERENT_COMPUTATION",
    ]),
    deferred: Object.freeze([
      "OPEN_ENDED_DISCOVERY",
      "FOUNDATION_MODEL_TRAINING",
      "INDEPENDENT_INSTITUTIONAL_REPLICATION",
      "PRODUCTION_AUTHORITY",
    ]),
  }),
});

export interface FrontierVerification {
  readonly accepted: boolean;
  readonly findings: readonly string[];
  readonly evidenceDigest: string;
}

export interface FrontierStageObligation {
  readonly definition: ReasoningObligationDefinition;
  readonly findingPrefixes: readonly string[];
}

function obligation(obligationId: string, kind: ReasoningObligationDefinition["kind"], statement: string,
  acceptanceCriterion: string, falsificationCriterion: string, findingPrefixes: readonly string[],
  dependsOn: readonly string[] = []): FrontierStageObligation {
  return Object.freeze({ definition: Object.freeze({ obligationId, kind, priority: "CRITICAL" as const,
    statement, acceptanceCriterion, falsificationCriterion, dependsOn: Object.freeze([...dependsOn]),
    conflictsWith: Object.freeze([]), ownerRoles: Object.freeze(["OMEGA_DETERMINISTIC_VERIFIER"]),
    minimumEvidenceClass: "E3" as const, minimumIndependentRoots: 1,
    freshnessDependencies: Object.freeze(["FRONTIER_TASK_DEFINITION", "CANDIDATE_OUTPUT"]),
    grantsAuthority: false as const }), findingPrefixes: Object.freeze([...findingPrefixes]) });
}

export const FRONTIER_STAGE_OBLIGATIONS: Readonly<Record<string, readonly FrontierStageObligation[]>> = Object.freeze({
  FRONTIER_GRAPH: Object.freeze([
    obligation("GRAPH-WELL-FORMED", "REQUIREMENT", "Return exactly the required graph certificate structure.",
      "Every required scalar and assignment is well formed.", "Any structural, scalar, or assignment diagnostic is emitted.",
      ["GRAPH_STRUCTURE_INVALID", "GRAPH_SCALARS_INVALID", "GRAPH_ASSIGNMENT_INVALID"]),
    obligation("GRAPH-VERTEX-COVERAGE", "COVERAGE", "Assign exactly one allowed color to every named vertex.",
      "Every supplied vertex appears exactly once.", "The vertex coverage diagnostic is emitted.",
      ["GRAPH_VERTEX_COVERAGE_INVALID"], ["GRAPH-WELL-FORMED"]),
    obligation("GRAPH-EDGE-SAFETY", "INVARIANT", "No graph edge may connect equal colors.",
      "The deterministic oracle finds zero edge conflicts.", "Any GRAPH_EDGE_CONFLICT diagnostic is emitted.",
      ["GRAPH_EDGE_CONFLICT"], ["GRAPH-VERTEX-COVERAGE"]),
    obligation("GRAPH-LOWER-BOUND", "COUNTEREXAMPLE", "Supply four pairwise adjacent vertices proving four colors are necessary.",
      "The supplied four vertices form a clique.", "The clique diagnostic is emitted.", ["GRAPH_CLIQUE_INVALID"]),
  ]),
  FRONTIER_PROTOCOL: Object.freeze([
    obligation("PROTOCOL-WELL-FORMED", "REQUIREMENT", "Return one complete protocol certificate.",
      "All required scalar, trace, and guard fields are valid.", "Any structural, scalar, trace, or guard diagnostic is emitted.",
      ["PROTOCOL_STRUCTURE_INVALID", "PROTOCOL_SCALARS_INVALID", "PROTOCOL_TRACE_INVALID", "PROTOCOL_GUARD_INVALID"]),
    obligation("PROTOCOL-UNSAFE-WITNESS", "COUNTEREXAMPLE", "Produce an executable trace that reaches an unsafe committed state.",
      "Executing the trace violates the stated safety invariant.", "The trace remains safe.",
      ["PROTOCOL_TRACE_DOES_NOT_VIOLATE_SAFETY"], ["PROTOCOL-WELL-FORMED"]),
    obligation("PROTOCOL-MINIMAL-WITNESS", "COUNTEREXAMPLE", "The unsafe trace must be shortest.",
      "Its length equals the exhaustive shortest counterexample length.", "A shorter unsafe trace exists.",
      ["PROTOCOL_TRACE_NOT_MINIMAL"], ["PROTOCOL-UNSAFE-WITNESS"]),
    obligation("PROTOCOL-SAFE-REPAIR", "INVARIANT", "Select a replacement guard with no reachable safety violation.",
      "Exhaustive reachability finds no unsafe state under the guard.", "A reachable unsafe state remains.",
      ["PROTOCOL_GUARD_REMAINS_UNSAFE"], ["PROTOCOL-WELL-FORMED"]),
  ]),
  FRONTIER_CAUSAL_PLAN: Object.freeze([
    obligation("CAUSAL-PLAN-WELL-FORMED", "REQUIREMENT", "Return one complete causal experiment plan.",
      "All required plan scalars and forecast records are valid.", "A structure, scalar, or forecast-shape diagnostic is emitted.",
      ["CAUSAL_PLAN_STRUCTURE_INVALID", "CAUSAL_PLAN_SCALARS_INVALID", "CAUSAL_FORECASTS_INVALID"]),
    obligation("CAUSAL-MINIMAL-SEPARATION", "EXPERIMENT", "Choose the minimum experiment set that separates every mechanism pair.",
      "Exactly two selected experiments jointly distinguish all modeled mechanisms.", "The set is nonminimal or nonseparating.",
      ["CAUSAL_EXPERIMENT_SET_NOT_MINIMAL_SEPARATING"], ["CAUSAL-PLAN-WELL-FORMED"]),
    obligation("CAUSAL-FORECAST-CORRECTNESS", "INVARIANT", "Precommit the supplied outcome for each selected experiment and mechanism.",
      "Every forecast equals the hidden deterministic matrix entry.", "Any forecast mismatches the matrix.",
      ["CAUSAL_FORECAST_MISMATCH"], ["CAUSAL-PLAN-WELL-FORMED"]),
    obligation("CAUSAL-FORECAST-COVERAGE", "COVERAGE", "Forecast every selected experiment for every mechanism exactly once.",
      "The forecast Cartesian product is complete.", "Forecast coverage is incomplete.",
      ["CAUSAL_FORECAST_COVERAGE_INCOMPLETE"], ["CAUSAL-PLAN-WELL-FORMED"]),
  ]),
  FRONTIER_CAUSAL_CONCLUSION: Object.freeze([
    obligation("CAUSAL-CONCLUSION-WELL-FORMED", "REQUIREMENT", "Return one complete evidence-bound causal conclusion.",
      "All required conclusion scalars and collections are valid.", "A structure or scalar diagnostic is emitted.",
      ["CAUSAL_CONCLUSION_STRUCTURE_INVALID", "CAUSAL_CONCLUSION_SCALARS_INVALID"]),
    obligation("CAUSAL-UNIQUE-SURVIVOR", "INVARIANT", "Select the unique mechanism consistent with every observation.",
      "Exactly one mechanism survives and is selected.", "The selected mechanism is not uniquely supported.",
      ["CAUSAL_MECHANISM_NOT_SUPPORTED"], ["CAUSAL-CONCLUSION-WELL-FORMED"]),
    obligation("CAUSAL-EVIDENCE-PROVENANCE", "PROVENANCE", "Cite every admitted experiment observation and no invented evidence.",
      "Evidence references exactly equal the observation references.", "Evidence references are missing or invented.",
      ["CAUSAL_EVIDENCE_REFERENCES_INVALID"], ["CAUSAL-CONCLUSION-WELL-FORMED"]),
    obligation("CAUSAL-ELIMINATION-COVERAGE", "COVERAGE", "Identify every mechanism eliminated by the observations.",
      "The ruled-out set is exact and complete.", "The elimination set is incomplete or incorrect.",
      ["CAUSAL_ELIMINATION_INCOMPLETE"], ["CAUSAL-UNIQUE-SURVIVOR"]),
  ]),
});

export function frontierObligationsForStage(stageId: string): readonly FrontierStageObligation[] {
  const obligations = FRONTIER_STAGE_OBLIGATIONS[stageId];
  if (!obligations) throw new Error("frontier_stage_obligations_unknown");
  return obligations;
}

export function frontierObligationFindings(stageId: string, obligationId: string,
  findings: readonly string[]): readonly string[] {
  const obligation = frontierObligationsForStage(stageId).find((item) => item.definition.obligationId === obligationId);
  if (!obligation) throw new Error("frontier_obligation_unknown");
  return Object.freeze(findings.filter((finding) => obligation.findingPrefixes.some((prefix) => finding.startsWith(prefix))));
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const item = value as Record<string, unknown>;
  return `{${Object.keys(item).sort().map((key) => `${JSON.stringify(key)}:${canonical(item[key])}`).join(",")}}`;
}

export function frontierDigest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function exactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value as Record<string, unknown>).sort().join("\0") === [...keys].sort().join("\0"));
}

function uniqueStrings(value: unknown, maximum: number): value is string[] {
  return Array.isArray(value) && value.length <= maximum
    && value.every((item) => typeof item === "string" && item.length > 0 && item.length <= 500)
    && new Set(value).size === value.length;
}

function confidence(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

const HOSTED_UNSUPPORTED_SCHEMA_KEYWORDS = new Set([
  "minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems", "uniqueItems",
]);

export function frontierProviderSchema(value: unknown): Readonly<Record<string, unknown>> {
  const visit = (item: unknown): unknown => {
    if (Array.isArray(item)) return Object.freeze(item.map(visit));
    if (item === null || typeof item !== "object") return item;
    return Object.freeze(Object.fromEntries(Object.entries(item as Record<string, unknown>)
      .filter(([key]) => !HOSTED_UNSUPPORTED_SCHEMA_KEYWORDS.has(key))
      .map(([key, nested]) => [key, visit(nested)])));
  };
  return visit(value) as Readonly<Record<string, unknown>>;
}

export function frontierRevisionPrompt(base: Readonly<Record<string, unknown>>,
  previousRejectedCandidate: Readonly<Record<string, unknown>> | null,
  feedback: readonly string[], obligationPacket: ObligationWorkPacket | null = null): Readonly<Record<string, unknown>> {
  return Object.freeze({ ...base, verifierFeedback: Object.freeze([...feedback]), previousRejectedCandidate,
    obligationPacket,
    revisionInstruction: previousRejectedCandidate === null
      ? "Solve only by discharging every critical obligation with a verifiable certificate."
      : "Revise the previous rejected candidate by resolving every falsified or unresolved obligation while preserving the obligations it already satisfied.",
    authorityGranted: false });
}

/** Preserve deterministic correction evidence when delivery itself fails. */
export function mergeFrontierFeedback(previous: readonly string[], current: readonly string[],
  maximum = NYX_FRONTIER_GAUNTLET.maxFeedbackFindings): readonly string[] {
  if (!Number.isSafeInteger(maximum) || maximum < 1) throw new Error("frontier_feedback_bound_invalid");
  return Object.freeze([...new Set([...previous, ...current])].slice(0, maximum));
}

const GRAPH_VERTICES = Object.freeze([
  "Aster", "Beryl", "Cygnus", "Draco", "Elara", "Fenix", "Gaia", "Helios",
  "Iris", "Juno", "Kepler", "Lyra", "Mira", "Nadir", "Orion", "Pavo",
  "Quill", "Rhea", "Solis", "Triton", "Umbra", "Vela", "Wren", "Xenon",
]);
const GRAPH_REFERENCE_COLORS = Object.freeze([
  1, 2, 3, 4, 2, 4, 1, 3, 3, 1, 4, 2, 4, 3, 2, 1, 2, 1, 3, 4, 4, 2, 1, 3,
]);
const GRAPH_CLIQUE = Object.freeze(["Aster", "Beryl", "Cygnus", "Draco"]);

function graphEdges(): readonly (readonly [string, string])[] {
  const edges: Array<readonly [string, string]> = [];
  for (let left = 0; left < GRAPH_VERTICES.length; left += 1) {
    for (let right = left + 1; right < GRAPH_VERTICES.length; right += 1) {
      if (GRAPH_REFERENCE_COLORS[left] === GRAPH_REFERENCE_COLORS[right]) continue;
      const forcedClique = left < 4 && right < 4;
      const mixed = ((left + 3) * 37 + (right + 5) * 19 + left * right * 11) % 11;
      if (forcedClique || mixed < 7) edges.push(Object.freeze([GRAPH_VERTICES[left], GRAPH_VERTICES[right]]));
    }
  }
  return Object.freeze(edges);
}

export const FRONTIER_GRAPH = Object.freeze({
  taskId: "NYX-FRONTIER-GRAPH-CERTIFICATE-001",
  vertices: GRAPH_VERTICES,
  edges: graphEdges(),
  colorsAvailable: Object.freeze([1, 2, 3, 4]),
  requirement: "Return a proper coloring using colors 1..4 and a four-vertex clique proving that four colors are necessary.",
});

export const FRONTIER_GRAPH_SCHEMA = Object.freeze({
  type: "object", additionalProperties: false,
  required: ["schemaVersion", "decision", "coloring", "clique", "uncertainties", "confidence"],
  properties: {
    schemaVersion: { type: "integer", enum: [1] },
    decision: { type: "string", enum: ["SUBMIT", "ABSTAIN"] },
    coloring: { type: "array", maxItems: GRAPH_VERTICES.length, items: { type: "object", additionalProperties: false,
      required: ["vertex", "color"], properties: { vertex: { type: "string" }, color: { type: "integer" } } } },
    clique: { type: "array", maxItems: 4, uniqueItems: true, items: { type: "string" } },
    uncertainties: { type: "array", maxItems: 8, uniqueItems: true, items: { type: "string", maxLength: 500 } },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
});

export function graphPrompt(feedback: readonly string[] = []): Readonly<Record<string, unknown>> {
  return Object.freeze({
    identity: "NYX_FRONTIER_REASONING_GRAPH_CERTIFICATE",
    objective: FRONTIER_GRAPH.requirement,
    vertices: FRONTIER_GRAPH.vertices,
    edges: FRONTIER_GRAPH.edges,
    outputLaw: "Every vertex appears exactly once. Adjacent vertices differ. The clique has four pairwise adjacent vertices.",
    verifierFeedback: Object.freeze([...feedback]),
    epistemicLaw: "Confidence is not proof; the coloring and clique are the certificate.",
  });
}

export function verifyGraphSubmission(value: unknown): FrontierVerification {
  const findings: string[] = [];
  const keys = ["schemaVersion", "decision", "coloring", "clique", "uncertainties", "confidence"];
  if (!exactKeys(value, keys)) findings.push("GRAPH_STRUCTURE_INVALID");
  const item = value as Record<string, unknown> | null;
  if (!item || item.schemaVersion !== 1 || item.decision !== "SUBMIT" || !confidence(item.confidence)
    || !uniqueStrings(item.uncertainties, 8)) findings.push("GRAPH_SCALARS_INVALID");
  const colors = new Map<string, number>();
  if (!Array.isArray(item?.coloring) || item.coloring.length !== GRAPH_VERTICES.length) {
    findings.push("GRAPH_VERTEX_COVERAGE_INVALID");
  } else {
    for (const assignment of item.coloring) {
      if (!exactKeys(assignment, ["vertex", "color"])) { findings.push("GRAPH_ASSIGNMENT_INVALID"); continue; }
      const vertex = assignment.vertex;
      const colorValue = assignment.color;
      if (typeof vertex !== "string" || !GRAPH_VERTICES.includes(vertex)
        || !Number.isInteger(colorValue) || !FRONTIER_GRAPH.colorsAvailable.includes(colorValue as number)
        || colors.has(vertex)) findings.push("GRAPH_ASSIGNMENT_INVALID");
      else colors.set(vertex, colorValue as number);
    }
  }
  for (const [left, right] of FRONTIER_GRAPH.edges) {
    if (colors.has(left) && colors.get(left) === colors.get(right)) {
      findings.push(`GRAPH_EDGE_CONFLICT:${left}:${right}`);
      if (findings.length >= 16) break;
    }
  }
  if (!uniqueStrings(item?.clique, 4) || item?.clique.length !== 4
    || item.clique.some((vertex) => !GRAPH_VERTICES.includes(vertex))) {
    findings.push("GRAPH_CLIQUE_INVALID");
  } else {
    const edgeSet = new Set(FRONTIER_GRAPH.edges.flatMap(([left, right]) => [`${left}\0${right}`, `${right}\0${left}`]));
    for (let left = 0; left < item.clique.length; left += 1) {
      for (let right = left + 1; right < item.clique.length; right += 1) {
        if (!edgeSet.has(`${item.clique[left]}\0${item.clique[right]}`)) findings.push("GRAPH_CLIQUE_INVALID");
      }
    }
  }
  const unique = Object.freeze([...new Set(findings)].slice(0, 20));
  return Object.freeze({ accepted: unique.length === 0, findings: unique,
    evidenceDigest: frontierDigest({ taskId: FRONTIER_GRAPH.taskId, findings: unique, colors: [...colors] }) });
}

export function referenceGraphSubmission(): Readonly<Record<string, unknown>> {
  return Object.freeze({ schemaVersion: 1, decision: "SUBMIT",
    coloring: Object.freeze(GRAPH_VERTICES.map((vertex, index) => Object.freeze({ vertex, color: GRAPH_REFERENCE_COLORS[index] }))),
    clique: GRAPH_CLIQUE, uncertainties: Object.freeze([]), confidence: 1 });
}

export type ProtocolAction = "PREPARE_A" | "PREPARE_B" | "VOTE_A" | "VOTE_B"
  | "TRANSFER_A" | "TRANSFER_B" | "COMMIT" | "ABORT" | "RESET";
type ProtocolOwner = "NONE" | "A" | "B";
type ProtocolVote = "NONE" | "A" | "B";
type ProtocolPhase = "IDLE" | "PREPARED" | "COMMITTED" | "ABORTED";
interface ProtocolState {
  readonly phase: ProtocolPhase;
  readonly owner: ProtocolOwner;
  readonly lease: number;
  readonly voteA: ProtocolVote;
  readonly voteB: ProtocolVote;
}

const PROTOCOL_ACTIONS: readonly ProtocolAction[] = Object.freeze([
  "PREPARE_A", "PREPARE_B", "VOTE_A", "VOTE_B", "TRANSFER_A", "TRANSFER_B", "COMMIT", "ABORT", "RESET",
]);
const PROTOCOL_GUARDS = Object.freeze([
  { guardId: "GUARD_NONEMPTY", expression: "voteA != NONE && voteB != NONE" },
  { guardId: "GUARD_OWNER_BOUND", expression: "voteA == owner && voteB == owner && owner != NONE" },
  { guardId: "GUARD_LEASE_ONLY", expression: "lease > 0" },
  { guardId: "GUARD_ANY_OWNER_VOTE", expression: "voteA == owner || voteB == owner" },
]);
const PROTOCOL_INITIAL: ProtocolState = Object.freeze({ phase: "IDLE", owner: "NONE", lease: 0,
  voteA: "NONE", voteB: "NONE" });

function commitAllowed(state: ProtocolState, guardId: string): boolean {
  if (guardId === "GUARD_NONEMPTY") return state.voteA !== "NONE" && state.voteB !== "NONE";
  if (guardId === "GUARD_OWNER_BOUND") return state.owner !== "NONE"
    && state.voteA === state.owner && state.voteB === state.owner;
  if (guardId === "GUARD_LEASE_ONLY") return state.lease > 0;
  if (guardId === "GUARD_ANY_OWNER_VOTE") return state.voteA === state.owner || state.voteB === state.owner;
  return false;
}

function protocolStep(state: ProtocolState, action: ProtocolAction, guardId: string): ProtocolState {
  const next = (changes: Partial<ProtocolState>): ProtocolState => Object.freeze({ ...state, ...changes });
  if (action === "PREPARE_A" || action === "PREPARE_B") {
    if (state.phase !== "IDLE") return state;
    return next({ phase: "PREPARED", owner: action === "PREPARE_A" ? "A" : "B", lease: state.lease + 1,
      voteA: "NONE", voteB: "NONE" });
  }
  if (action === "VOTE_A" && state.phase === "PREPARED") return next({ voteA: state.owner });
  if (action === "VOTE_B" && state.phase === "PREPARED") return next({ voteB: state.owner });
  if ((action === "TRANSFER_A" || action === "TRANSFER_B") && state.phase === "PREPARED") {
    // Deliberate defect: transfer changes the lease owner without invalidating prior votes.
    return next({ owner: action === "TRANSFER_A" ? "A" : "B", lease: state.lease + 1 });
  }
  if (action === "COMMIT" && state.phase === "PREPARED" && commitAllowed(state, guardId)) {
    return next({ phase: "COMMITTED" });
  }
  if (action === "ABORT" && state.phase === "PREPARED") return next({ phase: "ABORTED" });
  if (action === "RESET" && (state.phase === "COMMITTED" || state.phase === "ABORTED")) return PROTOCOL_INITIAL;
  return state;
}

function protocolSafe(state: ProtocolState): boolean {
  return state.phase !== "COMMITTED" || state.owner !== "NONE"
    && state.voteA === state.owner && state.voteB === state.owner;
}

function protocolSearchIdentity(state: ProtocolState): string {
  // All guards and transitions distinguish only zero from positive lease values.
  // Collapsing positive epochs therefore preserves every behavior relevant to
  // reachability and safety while making the transition system finite.
  return frontierDigest({ ...state, lease: state.lease > 0 ? "POSITIVE" : "ZERO" });
}

function shortestUnsafeTrace(guardId: string): readonly ProtocolAction[] | null {
  const queue: Array<{ state: ProtocolState; trace: ProtocolAction[] }> = [{ state: PROTOCOL_INITIAL, trace: [] }];
  const seen = new Set([protocolSearchIdentity(PROTOCOL_INITIAL)]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (!protocolSafe(current.state)) return Object.freeze(current.trace);
    for (const action of PROTOCOL_ACTIONS) {
      const state = protocolStep(current.state, action, guardId);
      const identity = protocolSearchIdentity(state);
      if (seen.has(identity)) continue;
      seen.add(identity);
      queue.push({ state, trace: [...current.trace, action] });
    }
  }
  return null;
}

export const FRONTIER_PROTOCOL = Object.freeze({
  taskId: "NYX-FRONTIER-PROTOCOL-COUNTEREXAMPLE-001",
  actions: PROTOCOL_ACTIONS,
  currentGuardId: "GUARD_NONEMPTY",
  guardCatalog: PROTOCOL_GUARDS,
  safetyInvariant: "COMMITTED implies owner != NONE and both votes equal the current owner.",
  transitionSemantics: Object.freeze([
    "PREPARE_A/B starts a lease from IDLE, selects that owner, and clears both votes.",
    "VOTE_A/B records the current owner while PREPARED.",
    "TRANSFER_A/B changes owner and increments lease while PREPARED but currently retains prior votes.",
    "COMMIT uses the selected guard; ABORT ends a prepared lease; RESET returns a terminal state to IDLE.",
    "Inapplicable actions are no-ops.",
  ]),
});

export const FRONTIER_PROTOCOL_SCHEMA = Object.freeze({
  type: "object", additionalProperties: false,
  required: ["schemaVersion", "decision", "trace", "replacementGuardId", "invariant", "uncertainties", "confidence"],
  properties: {
    schemaVersion: { type: "integer", enum: [1] },
    decision: { type: "string", enum: ["SUBMIT", "ABSTAIN"] },
    trace: { type: "array", maxItems: 8, items: { type: "string", enum: PROTOCOL_ACTIONS } },
    replacementGuardId: { type: "string", enum: PROTOCOL_GUARDS.map((item) => item.guardId) },
    invariant: { type: "string", minLength: 1, maxLength: 1_000 },
    uncertainties: { type: "array", maxItems: 8, uniqueItems: true, items: { type: "string", maxLength: 500 } },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
});

export function protocolPrompt(feedback: readonly string[] = []): Readonly<Record<string, unknown>> {
  return Object.freeze({ identity: "NYX_FRONTIER_FORMAL_COUNTEREXAMPLE",
    objective: "Return a shortest executable trace violating the safety invariant under the current guard, then select a guard that eliminates every reachable violation.",
    protocol: FRONTIER_PROTOCOL, verifierFeedback: Object.freeze([...feedback]),
    proofLaw: "The trace is checked by execution and minimality search; the repair is checked by exhaustive reachable-state exploration." });
}

export function verifyProtocolSubmission(value: unknown): FrontierVerification {
  const findings: string[] = [];
  const keys = ["schemaVersion", "decision", "trace", "replacementGuardId", "invariant", "uncertainties", "confidence"];
  if (!exactKeys(value, keys)) findings.push("PROTOCOL_STRUCTURE_INVALID");
  const item = value as Record<string, unknown> | null;
  if (!item || item.schemaVersion !== 1 || item.decision !== "SUBMIT" || !confidence(item.confidence)
    || typeof item.invariant !== "string" || item.invariant.length < 1 || item.invariant.length > 1_000
    || !uniqueStrings(item.uncertainties, 8)) findings.push("PROTOCOL_SCALARS_INVALID");
  const trace = Array.isArray(item?.trace) && item.trace.length <= 8
    && item.trace.every((action) => PROTOCOL_ACTIONS.includes(action as ProtocolAction))
    ? item.trace as ProtocolAction[] : null;
  if (!trace || trace.length === 0) findings.push("PROTOCOL_TRACE_INVALID");
  let state = PROTOCOL_INITIAL;
  for (const action of trace ?? []) state = protocolStep(state, action, FRONTIER_PROTOCOL.currentGuardId);
  if (trace && protocolSafe(state)) findings.push("PROTOCOL_TRACE_DOES_NOT_VIOLATE_SAFETY");
  const shortest = shortestUnsafeTrace(FRONTIER_PROTOCOL.currentGuardId);
  if (trace && shortest && trace.length !== shortest.length) findings.push("PROTOCOL_TRACE_NOT_MINIMAL");
  const guard = item?.replacementGuardId;
  if (typeof guard !== "string" || !PROTOCOL_GUARDS.some((candidate) => candidate.guardId === guard)) {
    findings.push("PROTOCOL_GUARD_INVALID");
  } else if (shortestUnsafeTrace(guard) !== null) findings.push("PROTOCOL_GUARD_REMAINS_UNSAFE");
  const unique = Object.freeze([...new Set(findings)]);
  return Object.freeze({ accepted: unique.length === 0, findings: unique,
    evidenceDigest: frontierDigest({ taskId: FRONTIER_PROTOCOL.taskId, findings: unique,
      finalState: state, shortestLength: shortest?.length ?? null, guard }) });
}

export function referenceProtocolSubmission(): Readonly<Record<string, unknown>> {
  return Object.freeze({ schemaVersion: 1, decision: "SUBMIT",
    trace: Object.freeze(["PREPARE_A", "VOTE_A", "VOTE_B", "TRANSFER_B", "COMMIT"]),
    replacementGuardId: "GUARD_OWNER_BOUND", invariant: FRONTIER_PROTOCOL.safetyInvariant,
    uncertainties: Object.freeze([]), confidence: 1 });
}

const CAUSAL_EXPERIMENTS = Object.freeze([
  { experimentId: "PULSE_SHORT", question: "Short excitation transient class", cost: 2 },
  { experimentId: "PULSE_LONG", question: "Long excitation equilibrium class", cost: 2 },
  { experimentId: "COOLDOWN", question: "Passive cooldown signature", cost: 1 },
  { experimentId: "LOAD_STEP", question: "Load-step response class", cost: 1 },
  { experimentId: "SENSOR_SWAP", question: "Response after calibrated sensor substitution", cost: 1 },
  { experimentId: "AMBIENT_SHIFT", question: "Response to controlled ambient shift", cost: 1 },
]);
const CAUSAL_MECHANISMS = Object.freeze([
  { mechanismId: "M-01", description: "single fast pole with gain drift" },
  { mechanismId: "M-02", description: "fast pole with sensor scale bias" },
  { mechanismId: "M-03", description: "fast pole with delayed feedback" },
  { mechanismId: "M-04", description: "slow pole with load coupling" },
  { mechanismId: "M-05", description: "slow pole with gain drift" },
  { mechanismId: "M-06", description: "slow pole with delayed feedback" },
  { mechanismId: "M-07", description: "dual pole with ambient coupling" },
  { mechanismId: "M-08", description: "dual pole with sensor scale bias" },
]);
const CAUSAL_MATRIX: Readonly<Record<string, Readonly<Record<string, string>>>> = Object.freeze({
  "M-01": Object.freeze({ PULSE_SHORT: "A", PULSE_LONG: "A", COOLDOWN: "0", LOAD_STEP: "X", SENSOR_SWAP: "K", AMBIENT_SHIFT: "U" }),
  "M-02": Object.freeze({ PULSE_SHORT: "A", PULSE_LONG: "B", COOLDOWN: "0", LOAD_STEP: "X", SENSOR_SWAP: "L", AMBIENT_SHIFT: "U" }),
  "M-03": Object.freeze({ PULSE_SHORT: "A", PULSE_LONG: "C", COOLDOWN: "1", LOAD_STEP: "Y", SENSOR_SWAP: "K", AMBIENT_SHIFT: "V" }),
  "M-04": Object.freeze({ PULSE_SHORT: "B", PULSE_LONG: "A", COOLDOWN: "1", LOAD_STEP: "Y", SENSOR_SWAP: "L", AMBIENT_SHIFT: "V" }),
  "M-05": Object.freeze({ PULSE_SHORT: "B", PULSE_LONG: "B", COOLDOWN: "2", LOAD_STEP: "Z", SENSOR_SWAP: "K", AMBIENT_SHIFT: "U" }),
  "M-06": Object.freeze({ PULSE_SHORT: "B", PULSE_LONG: "C", COOLDOWN: "2", LOAD_STEP: "Z", SENSOR_SWAP: "L", AMBIENT_SHIFT: "V" }),
  "M-07": Object.freeze({ PULSE_SHORT: "C", PULSE_LONG: "A", COOLDOWN: "0", LOAD_STEP: "Z", SENSOR_SWAP: "L", AMBIENT_SHIFT: "W" }),
  "M-08": Object.freeze({ PULSE_SHORT: "C", PULSE_LONG: "B", COOLDOWN: "1", LOAD_STEP: "X", SENSOR_SWAP: "K", AMBIENT_SHIFT: "W" }),
});
const CAUSAL_TARGET = "M-07";

export const FRONTIER_CAUSAL = Object.freeze({ taskId: "NYX-FRONTIER-CAUSAL-DESIGN-001",
  mechanisms: CAUSAL_MECHANISMS, experiments: CAUSAL_EXPERIMENTS,
  forecastMatrix: CAUSAL_MATRIX,
  objective: "Choose the minimum number of experiments (at most two) whose joint outcome distinguishes every listed mechanism. Precommit every mechanism/outcome forecast for the chosen experiments." });

export const FRONTIER_CAUSAL_PLAN_SCHEMA = Object.freeze({
  type: "object", additionalProperties: false,
  required: ["schemaVersion", "decision", "experimentIds", "forecasts", "uncertainties", "confidence"],
  properties: {
    schemaVersion: { type: "integer", enum: [1] },
    decision: { type: "string", enum: ["REQUEST_EXPERIMENTS", "ABSTAIN"] },
    experimentIds: { type: "array", maxItems: 2, uniqueItems: true, items: { type: "string" } },
    forecasts: { type: "array", maxItems: 16, items: { type: "object", additionalProperties: false,
      required: ["mechanismId", "experimentId", "expectedOutcome"], properties: {
        mechanismId: { type: "string" }, experimentId: { type: "string" }, expectedOutcome: { type: "string" },
      } } },
    uncertainties: { type: "array", maxItems: 8, uniqueItems: true, items: { type: "string", maxLength: 500 } },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
});

export const FRONTIER_CAUSAL_CONCLUSION_SCHEMA = Object.freeze({
  type: "object", additionalProperties: false,
  required: ["schemaVersion", "decision", "mechanismId", "evidenceRefs", "ruledOutMechanismIds", "uncertainties", "confidence"],
  properties: {
    schemaVersion: { type: "integer", enum: [1] },
    decision: { type: "string", enum: ["SELECT_MECHANISM", "INSUFFICIENT_EVIDENCE"] },
    mechanismId: { type: "string" },
    evidenceRefs: { type: "array", maxItems: 2, uniqueItems: true, items: { type: "string" } },
    ruledOutMechanismIds: { type: "array", maxItems: 7, uniqueItems: true, items: { type: "string" } },
    uncertainties: { type: "array", maxItems: 8, uniqueItems: true, items: { type: "string", maxLength: 500 } },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
});

function separatingExperiments(experimentIds: readonly string[]): boolean {
  const signatures = new Set(CAUSAL_MECHANISMS.map((mechanism) =>
    experimentIds.map((experimentId) => CAUSAL_MATRIX[mechanism.mechanismId][experimentId]).join("\0")));
  return signatures.size === CAUSAL_MECHANISMS.length;
}

export function causalPlanPrompt(feedback: readonly string[] = []): Readonly<Record<string, unknown>> {
  return Object.freeze({ identity: "NYX_FRONTIER_CAUSAL_EXPERIMENT_DESIGN", objective: FRONTIER_CAUSAL.objective,
    mechanisms: FRONTIER_CAUSAL.mechanisms, experiments: FRONTIER_CAUSAL.experiments,
    forecastMatrix: FRONTIER_CAUSAL.forecastMatrix, verifierFeedback: Object.freeze([...feedback]),
    evidenceLaw: "Predictions must be committed before observations. Model confidence is not experimental evidence." });
}

export function verifyCausalPlan(value: unknown): FrontierVerification {
  const findings: string[] = [];
  const keys = ["schemaVersion", "decision", "experimentIds", "forecasts", "uncertainties", "confidence"];
  if (!exactKeys(value, keys)) findings.push("CAUSAL_PLAN_STRUCTURE_INVALID");
  const item = value as Record<string, unknown> | null;
  if (!item || item.schemaVersion !== 1 || item.decision !== "REQUEST_EXPERIMENTS" || !confidence(item.confidence)
    || !uniqueStrings(item.uncertainties, 8)) findings.push("CAUSAL_PLAN_SCALARS_INVALID");
  const experimentIds = uniqueStrings(item?.experimentIds, 2)
    && item!.experimentIds.every((id) => CAUSAL_EXPERIMENTS.some((experiment) => experiment.experimentId === id))
    ? item!.experimentIds : [];
  if (experimentIds.length !== 2 || !separatingExperiments(experimentIds)) findings.push("CAUSAL_EXPERIMENT_SET_NOT_MINIMAL_SEPARATING");
  const expectedForecasts = new Map<string, string>();
  for (const mechanism of CAUSAL_MECHANISMS) {
    for (const experimentId of experimentIds) expectedForecasts.set(`${mechanism.mechanismId}\0${experimentId}`,
      CAUSAL_MATRIX[mechanism.mechanismId][experimentId]);
  }
  const observedForecasts = new Map<string, string>();
  if (!Array.isArray(item?.forecasts)) findings.push("CAUSAL_FORECASTS_INVALID");
  else for (const forecast of item.forecasts) {
    if (!exactKeys(forecast, ["mechanismId", "experimentId", "expectedOutcome"])
      || typeof forecast.mechanismId !== "string" || typeof forecast.experimentId !== "string"
      || typeof forecast.expectedOutcome !== "string") { findings.push("CAUSAL_FORECASTS_INVALID"); continue; }
    const key = `${forecast.mechanismId}\0${forecast.experimentId}`;
    if (!expectedForecasts.has(key) || observedForecasts.has(key)
      || expectedForecasts.get(key) !== forecast.expectedOutcome) findings.push("CAUSAL_FORECAST_MISMATCH");
    else observedForecasts.set(key, forecast.expectedOutcome);
  }
  if (observedForecasts.size !== expectedForecasts.size) findings.push("CAUSAL_FORECAST_COVERAGE_INCOMPLETE");
  const unique = Object.freeze([...new Set(findings)]);
  return Object.freeze({ accepted: unique.length === 0, findings: unique,
    evidenceDigest: frontierDigest({ taskId: FRONTIER_CAUSAL.taskId, findings: unique, experimentIds,
      forecasts: [...observedForecasts] }) });
}

export interface CausalObservation {
  readonly evidenceRef: string;
  readonly experimentId: string;
  readonly outcome: string;
  readonly evidenceClass: "E3";
  readonly grantsAuthority: false;
}

export function executeCausalExperiments(experimentIds: readonly string[]): readonly CausalObservation[] {
  if (experimentIds.length !== 2 || !separatingExperiments(experimentIds)) throw new Error("causal_plan_not_admitted");
  return Object.freeze(experimentIds.map((experimentId) => Object.freeze({
    evidenceRef: `OBSERVATION:${experimentId}:${frontierDigest([experimentId, CAUSAL_MATRIX[CAUSAL_TARGET][experimentId]]).slice(0, 16)}`,
    experimentId, outcome: CAUSAL_MATRIX[CAUSAL_TARGET][experimentId], evidenceClass: "E3" as const,
    grantsAuthority: false as const,
  })));
}

export function causalConclusionPrompt(observations: readonly CausalObservation[],
  feedback: readonly string[] = []): Readonly<Record<string, unknown>> {
  return Object.freeze({ identity: "NYX_FRONTIER_CAUSAL_CONCLUSION",
    objective: "Select the only mechanism consistent with every admitted observation and enumerate every ruled-out alternative.",
    mechanisms: FRONTIER_CAUSAL.mechanisms, precommittedForecastMatrix: FRONTIER_CAUSAL.forecastMatrix,
    observations, verifierFeedback: Object.freeze([...feedback]),
    epistemicLaw: "Use only observation evidence references. Return INSUFFICIENT_EVIDENCE if the observations do not identify one mechanism." });
}

export function verifyCausalConclusion(value: unknown, observations: readonly CausalObservation[]): FrontierVerification {
  const findings: string[] = [];
  const keys = ["schemaVersion", "decision", "mechanismId", "evidenceRefs", "ruledOutMechanismIds", "uncertainties", "confidence"];
  if (!exactKeys(value, keys)) findings.push("CAUSAL_CONCLUSION_STRUCTURE_INVALID");
  const item = value as Record<string, unknown> | null;
  if (!item || item.schemaVersion !== 1 || item.decision !== "SELECT_MECHANISM" || !confidence(item.confidence)
    || !uniqueStrings(item.uncertainties, 8)) findings.push("CAUSAL_CONCLUSION_SCALARS_INVALID");
  const survivors = CAUSAL_MECHANISMS.filter((mechanism) => observations.every((observation) =>
    CAUSAL_MATRIX[mechanism.mechanismId][observation.experimentId] === observation.outcome)).map((item) => item.mechanismId);
  if (survivors.length !== 1 || item?.mechanismId !== survivors[0]) findings.push("CAUSAL_MECHANISM_NOT_SUPPORTED");
  const evidenceRefs = observations.map((observation) => observation.evidenceRef).sort();
  if (!uniqueStrings(item?.evidenceRefs, 2) || [...item!.evidenceRefs].sort().join("\0") !== evidenceRefs.join("\0")) {
    findings.push("CAUSAL_EVIDENCE_REFERENCES_INVALID");
  }
  const ruledOut = CAUSAL_MECHANISMS.map((mechanism) => mechanism.mechanismId).filter((id) => !survivors.includes(id)).sort();
  if (!uniqueStrings(item?.ruledOutMechanismIds, 7)
    || [...item!.ruledOutMechanismIds].sort().join("\0") !== ruledOut.join("\0")) findings.push("CAUSAL_ELIMINATION_INCOMPLETE");
  const unique = Object.freeze([...new Set(findings)]);
  return Object.freeze({ accepted: unique.length === 0, findings: unique,
    evidenceDigest: frontierDigest({ taskId: FRONTIER_CAUSAL.taskId, findings: unique, survivors, evidenceRefs }) });
}

export function referenceCausalPlan(): Readonly<Record<string, unknown>> {
  const experimentIds = ["PULSE_SHORT", "PULSE_LONG"];
  return Object.freeze({ schemaVersion: 1, decision: "REQUEST_EXPERIMENTS", experimentIds: Object.freeze(experimentIds),
    forecasts: Object.freeze(CAUSAL_MECHANISMS.flatMap((mechanism) => experimentIds.map((experimentId) => Object.freeze({
      mechanismId: mechanism.mechanismId, experimentId, expectedOutcome: CAUSAL_MATRIX[mechanism.mechanismId][experimentId],
    })))), uncertainties: Object.freeze([]), confidence: 1 });
}

export function referenceCausalConclusion(observations: readonly CausalObservation[]): Readonly<Record<string, unknown>> {
  return Object.freeze({ schemaVersion: 1, decision: "SELECT_MECHANISM", mechanismId: CAUSAL_TARGET,
    evidenceRefs: Object.freeze(observations.map((item) => item.evidenceRef)),
    ruledOutMechanismIds: Object.freeze(CAUSAL_MECHANISMS.map((item) => item.mechanismId).filter((id) => id !== CAUSAL_TARGET)),
    uncertainties: Object.freeze([]), confidence: 1 });
}
