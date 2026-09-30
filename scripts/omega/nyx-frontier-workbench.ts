import { BoundedReasoningSession, NYX_REASONING_WORKBENCH, type ColoringProblem,
  type PredictionTable, type ReachabilityProblem, type ReasoningProblem, type ReasoningToolResult } from
  "../../src/lib/codelab/research/boundedReasoningWorkbench";
import { immutableTheoryValue, theoryDigest } from "../../src/lib/codelab/research/theoryContracts";
import { verifyFiniteRefutation, type FiniteRefutation } from "../../src/lib/codelab/research/finiteRefutationVerifier";

/** Lossless proof stays in the native artifact; cognition receives the checked obstruction, not repetitive serialization. */
export function verifiedRefutationObservation(problem: ReasoningProblem, supplied: unknown) {
  const verification = verifyFiniteRefutation(problem, supplied);
  if (verification.decision !== "SUPPORTED") return immutableTheoryValue({verification, modelObservation:null});
  const proof = supplied as FiniteRefutation;
  let obstruction: Readonly<Record<string, unknown>>;
  if (proof.kind === "COLORING_CLIQUE_OBSTRUCTION" && problem.kind === "COLORING") obstruction = {
    mutuallyAdjacentVertices:proof.vertices, distinctColorsRequired:proof.vertices.length,
    availableColors:problem.colors, implication:"Pairwise adjacent vertices need distinct colors; this clique exceeds the palette, so no proper coloring exists." };
  else if (proof.kind === "COLORING_SEARCH_REFUTATION" && problem.kind === "COLORING") obstruction = {
    checkedNodes:proof.nodes.length, checkedColorBranches:proof.nodes.reduce((n,node)=>n+node.branches.length,0),
    palette:problem.colors, implication:"Every possible palette choice is covered at each decision node. Every terminal branch has an actual edge-color conflict; all recursive branches are refuted. Therefore no full proper coloring exists." };
  else if (proof.kind === "REACHABILITY_CLOSED_INVARIANT") obstruction = {closedStates:proof.states,
    implication:"The set contains the initial state, is closed under all supplied transitions, and contains no unsafe state. Thus none is reachable in this graph."};
  else if (proof.kind === "PREDICTION_NON_IDENTIFIABILITY") obstruction = {indistinguishableMechanisms:proof.mechanismIds,
    implication:"These two distinct mechanisms have identical forecasts in every declared experiment. No subset can distinguish them."};
  else if (proof.kind === "HYPOTHESIS_CONFLICT") obstruction = {falsifierFields:["mechanism","experiment","expected","observed","evidenceRef"],
    falsifiers:proof.witnesses.map(w=>[w.mechanismId,w.experimentId,w.expectedOutcome,w.observedOutcome,w.evidenceRef]),
    implication:"Every declared mechanism contradicts an admitted observation. An empty survivor set is a supported conflict report, not a supported theory."};
  else throw new Error("verified_refutation_presentation_domain_mismatch");
  return immutableTheoryValue({verification, modelObservation:{property:verification.property, obstruction,
    proofDigest:verification.proofDigest, evidenceDigest:verification.evidenceDigest,
    evidenceClass:"E3",verificationState:"SUPPORTED",scope:verification.scope,
    taskAcceptanceRequiresSeparateVerifier:true,grantsAuthority:false}});
}

export const FRONTIER_WORKBENCH_EPOCH = Object.freeze({
  version: "nyx-frontier-workbench-epoch/3", modelCallsPerStage: 5, candidateSubmissionsPerStage: 3,
  previousEvaluatedCandidate: "70727b5f096334f9ab24ba109d94b41fa9c31bb2",
  correction: "SEPARATE_ARTIFACT_REVIEW_FROM_CERTIFICATE_GENERATION",
  reviewProtocol: "EXPLICIT_SUBMIT_OR_DECLINE_NO_REGENERATION",
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
const FRONTIER_ARTIFACT_SCHEMA = Object.freeze({ type: "object", additionalProperties: false,
  required: ["schemaVersion", "operation", "problemDigest", "resultDigest", "confidence"], properties: {
    schemaVersion: { type: "integer", enum: [1] }, operation: { type: "string", enum: ["SUBMIT_ANALYSIS_ARTIFACT"] },
    problemDigest: { type: "string" }, resultDigest: { type: "string" }, confidence: { type: "number" },
  } });

export const ARTIFACT_DECLINE_REASONS = Object.freeze([
  "INSUFFICIENT_EVIDENCE", "CONFLICTING_EVIDENCE", "INVALID_ARTIFACT", "SCOPE_MISMATCH",
  "UNVERIFIED_TOOL_RESULT", "OTHER",
] as const);
export interface ArtifactDeclineDiagnostic {
  readonly reasonCode: typeof ARTIFACT_DECLINE_REASONS[number];
  readonly blockingFacts: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly confidence: number;
}
const DECLINE_SCHEMA = Object.freeze({ type: "object", additionalProperties: false,
  required: ["schemaVersion", "operation", "problemDigest", "resultDigest", "reasonCode", "blockingFacts", "evidenceRefs", "confidence"],
  properties: { schemaVersion: { type: "integer", enum: [1] },
    operation: { type: "string", enum: ["DECLINE_ANALYSIS_ARTIFACT"] },
    problemDigest: { type: "string" }, resultDigest: { type: "string" },
    reasonCode: { type: "string", enum: ARTIFACT_DECLINE_REASONS },
    blockingFacts: { type: "array", items: { type: "string" } },
    evidenceRefs: { type: "array", items: { type: "string" } }, confidence: { type: "number" } } });

/** Bounded externally inspectable reasons, not private reasoning or an acceptance override. */
export function parseArtifactDecline(observation: Readonly<Record<string, unknown>>, value: unknown): ArtifactDeclineDiagnostic {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("artifact_decline_invalid");
  if (Object.getPrototypeOf(value) !== Object.prototype || Object.values(Object.getOwnPropertyDescriptors(value))
    .some(property => !Object.hasOwn(property, "value"))) throw new Error("artifact_decline_invalid");
  const request = value as Record<string, unknown>;
  const strings = (items: unknown, maximum: number) => Array.isArray(items) && items.length <= maximum
    && items.every(item => typeof item === "string" && item.length > 0 && item.length <= 240 && !item.includes("\0"))
    && new Set(items).size === items.length;
  if (Object.keys(request).sort().join(",") !== "blockingFacts,confidence,evidenceRefs,operation,problemDigest,reasonCode,resultDigest,schemaVersion"
    || request.schemaVersion !== 1 || request.operation !== "DECLINE_ANALYSIS_ARTIFACT"
    || request.problemDigest !== observation.problemDigest || request.resultDigest !== theoryDigest(observation)
    || !ARTIFACT_DECLINE_REASONS.includes(request.reasonCode as ArtifactDeclineDiagnostic["reasonCode"])
    || !strings(request.blockingFacts, 4) || !(request.blockingFacts as string[]).length
    || !strings(request.evidenceRefs, 8) || typeof request.confidence !== "number"
    || !Number.isFinite(request.confidence) || request.confidence < 0 || request.confidence > 1)
    throw new Error("artifact_decline_invalid");
  return immutableTheoryValue({ reasonCode: request.reasonCode, blockingFacts: request.blockingFacts,
    evidenceRefs: request.evidenceRefs, confidence: request.confidence }) as ArtifactDeclineDiagnostic;
}

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

export function frontierExchangeSchema(certificateSchema: Readonly<Record<string, unknown>>, toolsAvailable: boolean,
  artifactAvailable = false, diagnosticReview = false) {
  if (artifactAvailable) return { type: "object", additionalProperties: false,
    required: ["action", "analysisRequest", "certificate"], properties: {
      action: { type: "string", enum: ["SUBMIT_ANALYSIS_ARTIFACT", "DECLINE_ANALYSIS_ARTIFACT"] },
      analysisRequest: { anyOf: [FRONTIER_ARTIFACT_SCHEMA, diagnosticReview ? DECLINE_SCHEMA : { type: "null" }] },
      certificate: { type: "null" } } };
  return { type: "object", additionalProperties: false, required: ["action", "analysisRequest", "certificate"],
    properties: { action: { type: "string", enum: ["SUBMIT_CERTIFICATE", ...(toolsAvailable ? ["REQUEST_ANALYSIS"] : []),
      ...(artifactAvailable ? ["SUBMIT_ANALYSIS_ARTIFACT"] : [])] },
      analysisRequest: { anyOf: [FRONTIER_TOOL_SCHEMA, FRONTIER_ARTIFACT_SCHEMA, { type: "null" }] },
      certificate: { anyOf: [certificateSchema, { type: "null" }] } } };
}

export function parseFrontierExchange(value: unknown, toolsAvailable: boolean, artifactAvailable = false,
  diagnosticReview = false):
  { readonly action: "SUBMIT_CERTIFICATE"; readonly certificate: unknown }
  | { readonly action: "DECLINE_ANALYSIS_ARTIFACT"; readonly request?: unknown }
  | { readonly action: "REQUEST_ANALYSIS" | "SUBMIT_ANALYSIS_ARTIFACT"; readonly request: unknown } {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).sort().join(",") !== "action,analysisRequest,certificate") throw new Error("frontier_exchange_malformed");
  const exchange = value as { action: string; analysisRequest: unknown; certificate: unknown };
  if (artifactAvailable) {
    if (diagnosticReview && exchange.action === "DECLINE_ANALYSIS_ARTIFACT" && exchange.certificate === null
      && exchange.analysisRequest && typeof exchange.analysisRequest === "object") return {
        action: "DECLINE_ANALYSIS_ARTIFACT", request: exchange.analysisRequest };
    if (exchange.action === "DECLINE_ANALYSIS_ARTIFACT" && exchange.analysisRequest === null
      && exchange.certificate === null && !diagnosticReview) return { action: "DECLINE_ANALYSIS_ARTIFACT" };
    if (exchange.action === "SUBMIT_ANALYSIS_ARTIFACT" && exchange.certificate === null
      && exchange.analysisRequest && typeof exchange.analysisRequest === "object") return {
        action: "SUBMIT_ANALYSIS_ARTIFACT", request: exchange.analysisRequest };
    throw new Error("frontier_artifact_review_requires_reference_or_decline");
  }
  if (exchange.action === "SUBMIT_CERTIFICATE" && exchange.analysisRequest === null && exchange.certificate
    && typeof exchange.certificate === "object" && !Array.isArray(exchange.certificate)) return {
      action: "SUBMIT_CERTIFICATE", certificate: exchange.certificate };
  if (toolsAvailable && exchange.action === "REQUEST_ANALYSIS" && exchange.certificate === null
    && exchange.analysisRequest && typeof exchange.analysisRequest === "object") return {
      action: "REQUEST_ANALYSIS", request: exchange.analysisRequest };
  throw new Error("frontier_exchange_not_authorized");
}

/** Review is an explicit model choice, not another request to regenerate a constructed solution. */
export function frontierArtifactReviewPrompt(problem: Readonly<Record<string, unknown>>,
  observation: Readonly<Record<string, unknown>>, feedback: readonly string[], diagnosticReview = false) {
  return immutableTheoryValue({ phase: "REVIEW_CONSTRUCTED_ARTIFACT", problem,
    computationalObservation: observation, verifierFeedback: feedback,
    artifactReference: { schemaVersion: 1, operation: "SUBMIT_ANALYSIS_ARTIFACT",
      problemDigest: observation.problemDigest, resultDigest: theoryDigest(observation) },
    outputContract: "Choose SUBMIT_ANALYSIS_ARTIFACT or DECLINE_ANALYSIS_ARTIFACT. Return only {action,analysisRequest,certificate:null}. To submit, analysisRequest is the exact artifactReference plus confidence in [0,1]. To decline, analysisRequest=null. Do not emit certificate fields or generate a replacement solution in this review phase. Submission proposes the immutable artifact; the unchanged independent verifier may still reject it. Confidence and a valid digest are not acceptance.",
    ...(diagnosticReview ? { outputContract: "Choose SUBMIT_ANALYSIS_ARTIFACT or DECLINE_ANALYSIS_ARTIFACT. Return only {action,analysisRequest,certificate:null}. To submit, use the exact artifactReference plus confidence in [0,1]. To decline, use those same digests with operation DECLINE_ANALYSIS_ARTIFACT, reasonCode from the supplied list, 1..4 short blockingFacts, 0..8 evidenceRefs, and confidence in [0,1]. Do not regenerate certificate fields. Report the specific obstruction, not a demand for certainty. Submission proposes a conditional finite-domain result for independent verification; it does not assert universal real-world truth or grant authority.",
      declineReasonCodes: ARTIFACT_DECLINE_REASONS,
      epistemicContract: "A truthful structured report of INSUFFICIENT_EVIDENCE, multiple survivors, zero survivors, or conflicting admitted observations can itself be a correct answer. Submitting such a report does not establish a hypothesis as true, repair the conflict, or manufacture certainty. Decline when the proposed report violates the objective or evidence contract, not merely because its conclusion reports uncertainty." } : {}),
    grantsAuthority: false });
}

/** A reference selects a prebound proposal; it never replaces the independent acceptance check. */
export function materializeFrontierArtifact(observation: Readonly<Record<string, unknown>>,
  schema: Readonly<Record<string, unknown>>, value: unknown): Readonly<Record<string, unknown>> {
  const request = value as Record<string, unknown>;
  if (!request || typeof request !== "object" || Array.isArray(request)
    || Object.keys(request).sort().join(",") !== "confidence,operation,problemDigest,resultDigest,schemaVersion"
    || request.schemaVersion !== 1 || request.operation !== "SUBMIT_ANALYSIS_ARTIFACT"
    || request.problemDigest !== observation.problemDigest || request.resultDigest !== theoryDigest(observation)
    || typeof request.confidence !== "number" || !Number.isFinite(request.confidence)
    || request.confidence < 0 || request.confidence > 1
    || observation.decision !== "CANDIDATE_CONSTRUCTED_NOT_ACCEPTED" || !observation.certificateFields)
    throw new Error("frontier_artifact_reference_not_authorized");
  const properties = schema.properties as Record<string, { enum?: unknown[] }>;
  return immutableTheoryValue({ schemaVersion: properties.schemaVersion.enum![0],
    decision: properties.decision.enum![0], ...(observation.certificateFields as object),
    uncertainties: observation.assumptions, confidence: request.confidence });
}
