import { NvidiaNimProvider } from "../src/lib/codelab/model/nvidiaNimProvider";
import { runFlatTheoryBaseline } from "../src/lib/codelab/research/flatTheoryBaseline";
import { NYX_NVIDIA_THEORY_INTENT_JSON_SCHEMA, NYX_THEORY_INTENT_JSON_SCHEMA,
  NyxNemotronTheoryCognition } from "../src/lib/codelab/research/nyxNemotronTheoryCognition";
import { assureResearchParty } from "../src/lib/codelab/research/researchPartyAssurance";
import { immutableResearchValue, researchObjectiveDigest, validResearchLimits, validResearchObjective,
  type ResearchExperimentObservation, type ResearchPartyLimits, type ResearchPartyObjective,
  type TheoryCognitionIntent, type TheoryCognitionRequest, type TheoryCognitionResult,
  type TheoryContribution } from "../src/lib/codelab/research/researchPartyContracts";
import { ResearchEvidenceGraph } from "../src/lib/codelab/research/researchEvidenceGraph";
import { TheoryNetwork } from "../src/lib/codelab/research/theoryNetwork";
import { immutableTheoryValue, theoryDigest } from "../src/lib/codelab/research/theoryContracts";
import { TheoryResearchParty, type TheoryCognitionEngine } from "../src/lib/codelab/research/theoryResearchParty";
import { fixedTheoryPerspectiveRouter, routeFixedTheoryPerspectives, routeSparseTheoryPerspectives,
  validTheoryPerspectiveRoute }
  from "../src/lib/codelab/research/sparseTheoryRouter";

let checks = 0;
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  checks += 1;
}
async function rejects(action: () => unknown | Promise<unknown>, pattern: RegExp, message: string): Promise<void> {
  try { await action(); throw new Error("expected_rejection_missing"); }
  catch (error) { check(pattern.test(String(error)), message); }
}

function schemaKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(schemaKeys);
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, item]) => [key, ...schemaKeys(item)]);
}

const CANDIDATE = "b".repeat(40);
let now = 1_000;
const limits: ResearchPartyLimits = Object.freeze({ maxEntities: 8, maxModelCalls: 11, maxExperiments: 3,
  maxEvidenceItems: 64, maxWallClockMs: 120_000, maxPromptBytesPerCall: 64_000,
  maxOutputTokensPerCall: 512, maxTotalOutputTokens: 5_632, maxCostUnits: 10 });

const outcomeFor = (mechanismId: string, experimentId: string): string => {
  if (experimentId === "EXP-A-FAILED") return mechanismId === "FAILED_AS_COMPLETE" ? "DISPATCHED" : "BLOCKED";
  if (experimentId === "EXP-B-CANCELLED") return mechanismId === "CANCELLED_AS_COMPLETE" ? "DISPATCHED" : "BLOCKED";
  if (experimentId === "EXP-C-PENDING") return mechanismId === "PENDING_AS_COMPLETE" ? "DISPATCHED" : "BLOCKED";
  throw new Error("unknown_experiment");
};

function evidence(evidenceId: string, kind: "REQUIREMENT" | "SOURCE", summary: string) {
  return Object.freeze({ evidenceId, evidenceClass: "E3" as const, kind, summary, contentDigest: theoryDigest(summary),
    provenanceRoot: `ORACLE-${evidenceId}`, freshnessDependencies: [`CANDIDATE:${CANDIDATE}`], observedAtEpochMs: now,
    candidateBinding: CANDIDATE, grantsAuthority: false as const });
}

function objective(): ResearchPartyObjective {
  return immutableResearchValue({ schemaVersion: 1, researchId: "HELDOUT-SCHEDULER-READINESS",
    objective: "Identify why a dependent job dispatches despite a non-completed prerequisite.", domain: "SOFTWARE",
    candidateBinding: CANDIDATE, scope: ["scheduler.ts"], mechanismCatalog: [
      { mechanismId: "STRICT", description: "Only COMPLETED prerequisites permit dispatch." },
      { mechanismId: "PENDING_AS_COMPLETE", description: "PENDING is incorrectly accepted as complete." },
      { mechanismId: "FAILED_AS_COMPLETE", description: "FAILED is incorrectly accepted as complete." },
      { mechanismId: "CANCELLED_AS_COMPLETE", description: "CANCELLED is incorrectly accepted as complete." },
    ], admittedEvidence: [
      evidence("E-REQUIREMENT", "REQUIREMENT", "A dependent job must dispatch only after every prerequisite completes successfully."),
      evidence("E-SOURCE", "SOURCE", "The scheduler uses a compact terminal-state mask before dispatch; one terminal state appears misclassified."),
    ], experimentCatalog: [
      { experimentId: "EXP-A-FAILED", toolId: "SCHEDULER-PROBE-FAILED", question: "Does a FAILED prerequisite permit dispatch?",
        possibleOutcomes: ["BLOCKED", "DISPATCHED"], costUnits: 1, authority: "RUN_TEST_IN_SANDBOX",
        scope: ["scheduler.ts"], mutatesCandidate: false },
      { experimentId: "EXP-B-CANCELLED", toolId: "SCHEDULER-PROBE-CANCELLED", question: "Does a CANCELLED prerequisite permit dispatch?",
        possibleOutcomes: ["BLOCKED", "DISPATCHED"], costUnits: 1, authority: "RUN_TEST_IN_SANDBOX",
        scope: ["scheduler.ts"], mutatesCandidate: false },
      { experimentId: "EXP-C-PENDING", toolId: "SCHEDULER-PROBE-PENDING", question: "Does a PENDING prerequisite permit dispatch?",
        possibleOutcomes: ["BLOCKED", "DISPATCHED"], costUnits: 1, authority: "RUN_TEST_IN_SANDBOX",
        scope: ["scheduler.ts"], mutatesCandidate: false },
    ], successCriteria: ["Identify the one mechanism consistent with every authorized probe."], expiryEpochMs: 100_000 });
}

function intentFor(mechanismId: string, decision: "PROPOSE_HYPOTHESIS" | "REVISE_HYPOTHESIS",
  theoryId: string, observed: readonly ResearchExperimentObservation[] = []): TheoryCognitionIntent {
  const observedIds = new Set(observed.map((item) => item.experimentId));
  const experiments = objective().experimentCatalog.filter((item) => !observedIds.has(item.experimentId));
  return immutableTheoryValue({ schemaVersion: 1, decision, thesis: `${mechanismId} best explains the bounded symptom.`,
    mechanismId, causalMechanism: objective().mechanismCatalog.find((item) => item.mechanismId === mechanismId)!.description,
    evidenceRefs: ["E-SOURCE", ...observed.map((item) => item.evidence.evidenceId)],
    assumptions: ["The true defect is inside the modeled single-fault family."],
    uncertainties: ["Other scheduler defects are outside this bounded evaluation."],
    forecasts: experiments.map((item) => ({ experimentId: item.experimentId,
      expectedOutcome: outcomeFor(mechanismId, item.experimentId), rationale: "This follows from the selected terminal-state classification." })),
    counterexamples: [], requestedExperimentIds: experiments.map((item) => item.experimentId),
    revisionOfTheoryId: decision === "REVISE_HYPOTHESIS" ? theoryId : null, modelEstimate: 0.7 });
}

function cognitionResult(request: TheoryCognitionRequest, intent: TheoryCognitionIntent): TheoryCognitionResult {
  const digest = theoryDigest([request.requestId, intent]);
  return immutableTheoryValue({ decision: "CONTRIBUTION", reason: "scripted_valid_contribution", intent,
    evidence: { evidenceId: `MODEL-${digest.slice(0, 40)}`, evidenceClass: "E3", providerId: "SCRIPTED-PROVIDER",
      model: "nvidia/nemotron-3-ultra-550b-a55b", requestDigest: digest, responseDigest: theoryDigest(intent),
      statusCode: 200, promptTokens: 100, completionTokens: 100, totalTokens: 200, finishReason: "stop",
      grantsAuthority: false }, diagnostics: [], grantsAuthority: false });
}

class ScriptedPartyCognition implements TheoryCognitionEngine {
  #investigator = 0;
  readonly calls: TheoryCognitionRequest[] = [];
  profile() { return Object.freeze({ model: "nvidia/nemotron-3-ultra-550b-a55b" }); }
  async think(request: TheoryCognitionRequest): Promise<TheoryCognitionResult> {
    this.calls.push(immutableTheoryValue(request));
    if (request.role === "INVESTIGATOR") {
      const mechanism = ["STRICT", "FAILED_AS_COMPLETE", "CANCELLED_AS_COMPLETE"][this.#investigator++ % 3];
      return cognitionResult(request, intentFor(mechanism, "PROPOSE_HYPOTHESIS", request.theoryId));
    }
    if (request.role === "FALSIFIER") {
      const counterexamples = request.peerContributions.map((item) => {
        const forecast = item.intent.forecasts.find((candidate) => candidate.experimentId === "EXP-A-FAILED")!;
        return { targetTheoryId: item.theoryId, experimentId: forecast.experimentId,
          disconfirmingOutcome: forecast.expectedOutcome === "BLOCKED" ? "DISPATCHED" : "BLOCKED",
          rationale: "The opposite observed dispatch decision would falsify this mechanism." };
      });
      return cognitionResult(request, immutableTheoryValue({ schemaVersion: 1, decision: "CHALLENGE",
        thesis: "Each hypothesis must survive a terminal-state probe.", mechanismId: null, causalMechanism: null,
        evidenceRefs: ["E-SOURCE"], assumptions: [], uncertainties: ["One probe may not distinguish every pair."],
        forecasts: [], counterexamples, requestedExperimentIds: [], revisionOfTheoryId: null, modelEstimate: null }));
    }
    if (request.role === "REVISER") {
      return cognitionResult(request, intentFor("FAILED_AS_COMPLETE", "REVISE_HYPOTHESIS",
        request.theoryId, request.experimentObservations));
    }
    return cognitionResult(request, immutableTheoryValue({ schemaVersion: 1, decision: "NO_CONCLUSION",
      thesis: "Deterministic evidence, not this meta-review, controls acceptance.", mechanismId: null,
      causalMechanism: null, evidenceRefs: request.experimentObservations.map((item) => item.evidence.evidenceId),
      assumptions: [], uncertainties: ["The modeled family may be incomplete."], forecasts: [], counterexamples: [],
      requestedExperimentIds: [], revisionOfTheoryId: null, modelEstimate: null }));
  }
}

function makeObservation(experimentId: string, mechanism = "FAILED_AS_COMPLETE"): ResearchExperimentObservation {
  const experiment = objective().experimentCatalog.find((item) => item.experimentId === experimentId)!;
  const outcome = outcomeFor(mechanism, experimentId);
  const executionIdentity = `EXEC-${experimentId}`;
  const outputDigest = theoryDigest({ experimentId, outcome });
  const content = { experimentId, toolId: experiment.toolId, outcome, executionIdentity, outputDigest };
  return immutableResearchValue({ observationId: `OBS-${experimentId}`, experimentId, toolId: experiment.toolId,
    outcome, evidence: { evidenceId: `EVIDENCE-${experimentId}`, evidenceClass: "E3", kind: "EXPERIMENT_RESULT",
      summary: "Sanitized deterministic scheduler probe result.", contentDigest: theoryDigest(content),
      provenanceRoot: `OMEGA-RUNNER-${experimentId}`, freshnessDependencies: [`CANDIDATE:${CANDIDATE}`],
      observedAtEpochMs: now, candidateBinding: CANDIDATE, grantsAuthority: false },
    executionIdentity, outputDigest, authorityGranted: false });
}

function network() {
  const coordinator = {};
  const value = TheoryNetwork.create({ namespace: "nyx-party", addressCapacity: "1000000000000",
    maxAssignedPairs: 100, maxConcurrentActivations: 8, maxTotalActivations: 100,
    maxEvents: 1_000, maxPredictionsPerTheory: 32, maxObservationsPerTheory: 64,
    maxRelations: 1_000, maxFanout: 16, maxMessages: 1_000, activationLifetimeMs: 60_000, now: () => now }, coordinator);
  return { value, coordinator };
}

check(validResearchLimits(limits), "research-party limits are valid");
check(validResearchObjective(objective(), now), "research objective is valid");
check(researchObjectiveDigest(objective()).length === 64, "objective has canonical digest");
check(objective().mechanismCatalog.length === 4, "bounded mechanism family is explicit");
check(objective().experimentCatalog.every((item) => item.mutatesCandidate === false), "experiments cannot mutate the candidate");
check(objective().admittedEvidence.every((item) => item.grantsAuthority === false), "evidence grants no authority");
check(!validResearchObjective({ ...objective(), expiryEpochMs: now } as ResearchPartyObjective, now), "expired objective is rejected");
check(!validResearchLimits({ ...limits, maxModelCalls: 65 }), "unbounded model-call policy is rejected");

{
  const fullKeys = new Set(schemaKeys(NYX_THEORY_INTENT_JSON_SCHEMA));
  const providerKeys = new Set(schemaKeys(NYX_NVIDIA_THEORY_INTENT_JSON_SCHEMA));
  const locallyEnforcedOnly = ["minimum", "maximum", "minLength", "maxLength", "maxItems", "uniqueItems"];
  check(locallyEnforcedOnly.every((key) => fullKeys.has(key) && !providerKeys.has(key)),
    "hosted theory schema removes incompatible bounds retained by local admission");
  const providerRoot = NYX_NVIDIA_THEORY_INTENT_JSON_SCHEMA as {
    required?: unknown; additionalProperties?: unknown; properties?: Record<string, unknown>;
  };
  check(Array.isArray(providerRoot.required) && providerRoot.additionalProperties === false
    && providerRoot.properties?.decision !== undefined && providerRoot.properties?.forecasts !== undefined,
  "provider theory schema preserves the closed intent structure and required semantic fields");
}

const directGraph = new ResearchEvidenceGraph(objective(), now);
await rejects(() => directGraph.recordObservation(makeObservation("EXP-A-FAILED")), /without_precommitted_prediction/,
  "observation before prediction is rejected");
const graphTheory = "nyx-party:theory:direct";
const directIntent = intentFor("FAILED_AS_COMPLETE", "PROPOSE_HYPOTHESIS", graphTheory);
const directEvidence = immutableResearchValue({ evidenceId: "E1-DIRECT", evidenceClass: "E1", kind: "MODEL_CONTRIBUTION",
  summary: "Model-generated claim, not truth evidence.", contentDigest: theoryDigest(directIntent), provenanceRoot: "MODEL-NEMOTRON",
  freshnessDependencies: [`CANDIDATE:${CANDIDATE}`], observedAtEpochMs: now, candidateBinding: CANDIDATE,
  grantsAuthority: false as const });
const directBase = { contributionId: "CONTRIBUTION-DIRECT", theoryId: graphTheory, guardianId: "nyx-party:guardian:direct",
  role: "INVESTIGATOR" as const, objectiveDigest: researchObjectiveDigest(objective()), intent: directIntent,
  modelEvidence: directEvidence, committedAtEpochMs: now };
const directContribution: TheoryContribution = immutableResearchValue({ ...directBase,
  contributionDigest: theoryDigest({ contributionId: directBase.contributionId, theoryId: directBase.theoryId,
    guardianId: directBase.guardianId, role: directBase.role, objectiveDigest: directBase.objectiveDigest,
    intent: directBase.intent, modelEvidenceId: directEvidence.evidenceId, committedAtEpochMs: now }), grantsAuthority: false });
directGraph.commitContribution(directContribution);
check(directGraph.assessment(graphTheory).state === "INSUFFICIENT_EVIDENCE", "model claim alone is insufficient evidence");
check(directGraph.selectNextExperiment(10)?.experimentId === "EXP-A-FAILED", "graph chooses a deterministic covered experiment");
directGraph.recordObservation(makeObservation("EXP-A-FAILED"));
check(directGraph.assessment(graphTheory).supportingObservationIds.length === 1, "matching prediction records support");
check(directGraph.assessment(graphTheory).distinctEvidenceRoots === 1, "one tool observation is one evidence root");
check(directGraph.decision().state === "INSUFFICIENT_EVIDENCE", "untested forecasts prevent premature acceptance");
directGraph.recordObservation(makeObservation("EXP-B-CANCELLED"));
directGraph.recordObservation(makeObservation("EXP-C-PENDING"));
check(directGraph.assessment(graphTheory).state === "SUPPORTED", "complete precommitted forecasts can become supported");
check(directGraph.decision().state === "SUPPORTED_WITHIN_MODELED_FAMILY", "one surviving mechanism receives bounded support");
check(directGraph.decision().independentAcceptance === false, "evidence graph cannot self-certify");
check(directGraph.chainComplete(), "claim/evidence chain is complete");
const invalidated = directGraph.invalidateDependency(`CANDIDATE:${CANDIDATE}`);
check(invalidated.length >= 4, "dependency invalidation reaches source, claim, and experiment evidence");
check(directGraph.assessment(graphTheory).state === "STALE", "changed candidate makes prior claim stale, not refuted");
check(directGraph.snapshot().grantsAuthority === false, "evidence graph grants no authority");

const runtime = network();
const scripted = new ScriptedPartyCognition();
const party = TheoryResearchParty.create({ partyId: "PARTY-HELDOUT-SCHEDULER", network: runtime.value,
  coordinator: runtime.coordinator, cognition: scripted, limits, investigatorCount: 3, now: () => now,
  experiments: { run: async (experiment) => { now += 1; return makeObservation(experiment.experimentId); } } });
const result = await party.investigate(objective());
check(result.decision.state === "SUPPORTED_WITHIN_MODELED_FAMILY", "research party reaches a bounded supported decision");
check(result.decision.selectedMechanismId === "FAILED_AS_COMPLETE", "research party identifies hidden mechanism");
check(result.contributions.filter((item) => item.role === "INVESTIGATOR").length === 3,
  "three initial investigator contributions are preserved");
check(result.contributions.filter((item) => item.role === "REVISER").length === 6,
  "each specialist revises after each non-decisive experiment");
check(result.contributions.some((item) => item.role === "FALSIFIER"), "falsifier contributes counterexamples");
check(result.contributions.some((item) => item.role === "META_REVIEWER"), "meta-reviewer audits uncertainty");
check(result.observations.length === 3, "party executes the bounded experiment set");
check(result.resourceUsage.modelCalls === 11, "party uses the declared eleven-call budget");
check(result.resourceUsage.totalTokens === 2_200, "party reports complete model usage");
check(result.resourceUsage.experimentCostUnits === 3, "experiment cost is accounted");
check(result.addressability.reservedTheorySlots === "5", "party materializes only its five reserved identities");
check(result.addressability.materializedTheoryGuardianPairs === 5, "every entity has exactly one guardian");
check(result.addressability.peakActiveReasoners === 5, "active population is reported separately from addressability");
check(result.addressability.simultaneousModelExecutions === 3, "parallel cognition width is reported honestly");
check(result.addressability.distributedExecutionImplemented === false, "process-local party does not claim distributed execution");
check(result.actualReasoningEngine === "TEST_DOUBLE", "scripted test does not claim live Nemotron reasoning");
check(result.cognitiveRouting?.algorithmId === "SPARSE_RELEVANCE_DIVERSITY_V1",
  "research party uses sparse objective-linked cognitive routing by default");
check(result.cognitiveRouting?.assignments.length === 3 && result.cognitiveRouting.sparseActivationRatio === 0.25,
  "three investigators activate three of twelve available reasoning compartments");
check(result.cognitiveRouting?.grantsAuthority === false, "cognitive routing grants no Omega authority");
check(scripted.calls.slice(0, 3).every((item, index) =>
  item.instruction.includes(result.cognitiveRouting!.assignments[index].perspectiveId)),
"each investigator receives its independently recorded compartment instruction");
check(result.evidenceChainComplete, "party builds evidence chains at contribution time");
check(result.authorityGranted === false, "research party grants no authority");
check(scripted.calls.slice(0, 3).every((item) => item.peerContributions.length === 0),
  "initial hypotheses are generated without peer contamination");
check(scripted.calls.filter((item) => item.role === "REVISER").every((item) => item.experimentObservations.length >= 1),
  "revisions receive actual experiment evidence");
check(result.contributions.every((item) => item.modelEvidence.evidenceClass === "E1"),
  "all model contributions remain E1 claims regardless of provider transport");
check(new Set(result.contributions.map((item) => item.modelEvidence.provenanceRoot)).size === 1,
  "same-model contributions preserve their correlation root");

const assurance = assureResearchParty({ objective: objective(), limits, result,
  groundTruth: { taskId: objective().researchId, expectedMechanismId: "FAILED_AS_COMPLETE",
    oracleDigest: theoryDigest("hidden-scheduler-oracle"), oracleProvenanceRoot: "HIDDEN-SCHEDULER-ORACLE",
    hiddenFromCognition: true } });
check(assurance.decision === "ACCEPT", "independent hidden oracle accepts the correct party result");
check(assurance.functionalAcceptance, "functional mechanism acceptance is separate");
check(assurance.evidenceIntegrityAcceptance, "evidence integrity is separately accepted");
check(assurance.authorityBoundaryAcceptance, "authority boundary is separately accepted");
check(assurance.resourceAcceptance, "resource bounds are separately accepted");
check(assurance.independence === "INDEPENDENT_ORACLE_IMPLEMENTATION_SAME_REPOSITORY",
  "assurance independence class is explicit");
check(assurance.grantsAuthority === false, "assurance result grants no authority");
const wrongAssurance = assureResearchParty({ objective: objective(), limits, result,
  groundTruth: { taskId: objective().researchId, expectedMechanismId: "CANCELLED_AS_COMPLETE",
    oracleDigest: theoryDigest("alternate-hidden-oracle"), oracleProvenanceRoot: "ALTERNATE-HIDDEN-ORACLE",
    hiddenFromCognition: true } });
check(wrongAssurance.decision === "REJECT", "hidden oracle can reject a party's supported but incorrect answer");
check(wrongAssurance.findings.includes("HIDDEN_ORACLE_DISAGREES_WITH_SELECTED_MECHANISM"),
  "oracle disagreement is preserved as falsification");

class ScriptedFlatCognition implements TheoryCognitionEngine {
  #index = 0;
  profile() { return Object.freeze({ model: "nvidia/nemotron-3-ultra-550b-a55b" }); }
  async think(request: TheoryCognitionRequest): Promise<TheoryCognitionResult> {
    const sequence = ["CANCELLED_AS_COMPLETE", "CANCELLED_AS_COMPLETE", "STRICT", "FAILED_AS_COMPLETE",
      "CANCELLED_AS_COMPLETE", "PENDING_AS_COMPLETE", "STRICT", "FAILED_AS_COMPLETE"];
    const mechanism = sequence[this.#index++ % sequence.length];
    return cognitionResult(request, intentFor(mechanism, "PROPOSE_HYPOTHESIS", request.theoryId));
  }
}
const flat = await runFlatTheoryBaseline({ baselineId: "FLAT-BASELINE", cognition: new ScriptedFlatCognition(),
  objective: objective(), limits, now: () => now });
check(flat.resourceUsage.modelCalls === result.resourceUsage.modelCalls, "party and flat baseline have matched model-call ceilings");
check(flat.selectedMechanismId === "CANCELLED_AS_COMPLETE", "flat plurality preserves its incorrect result");
check(flat.experiments === 0 && !flat.counterexampleRevision && !flat.evidenceGraph,
  "flat baseline lacks the three ablated research mechanisms");
check(flat.authorityGranted === false, "flat comparison grants no authority");

function routingObjective(researchId: string, domain: ResearchPartyObjective["domain"], description: string): ResearchPartyObjective {
  const candidate = "c".repeat(40);
  const source = { evidenceId: `E-${researchId}`, evidenceClass: "E3" as const, kind: "SOURCE" as const,
    summary: description, contentDigest: theoryDigest(description), provenanceRoot: `HELDOUT-${researchId}`,
    freshnessDependencies: [`CANDIDATE:${candidate}`], observedAtEpochMs: now, candidateBinding: candidate,
    grantsAuthority: false as const };
  return immutableResearchValue({ schemaVersion: 1, researchId, objective: description, domain,
    candidateBinding: candidate, scope: [`${researchId.toLowerCase()}.fixture`], mechanismCatalog: [
      { mechanismId: "TARGET", description },
      { mechanismId: "ALTERNATE", description: "A generic alternative mechanism without task-specific explanatory structure." },
    ], admittedEvidence: [source], experimentCatalog: [
      { experimentId: `EXP-${researchId}`, toolId: `PROBE-${researchId}`, question: `Which mechanism explains: ${description}`,
        possibleOutcomes: ["TARGET", "ALTERNATE"], costUnits: 1, authority: "RUN_TEST_IN_SANDBOX" as const,
        scope: [`${researchId.toLowerCase()}.fixture`], mutatesCandidate: false as const },
    ], successCriteria: ["Activate a reasoning lens capable of forming a falsifiable target hypothesis."],
    expiryEpochMs: 100_000 });
}

const routingHeldout = [
  ["ROUTE-CONCURRENCY", "SOFTWARE", "Concurrent interleavings lose updates unless atomic lock ordering is preserved.", "CONCURRENCY_ORDERING"],
  ["ROUTE-RESOURCE", "SOFTWARE", "Resource handle acquisition lacks deterministic release, cleanup, disposal, and ownership.", "RESOURCE_LIFECYCLE"],
  ["ROUTE-IDENTITY", "SOFTWARE", "Credential identity authentication and token authorization ignore capability scope and revocation.", "IDENTITY_AUTHORIZATION"],
  ["ROUTE-TEMPORAL", "SOFTWARE", "Clock deadline expiry, timeout retry, stale freshness, and TOCTOU behavior conflict.", "TEMPORAL_EXPIRY"],
  ["ROUTE-NUMERICAL", "MATHEMATICS", "Numerical precision breaks a conservation equation, dimensional range, and stability invariant.", "NUMERICAL_INVARIANT"],
  ["ROUTE-CAUSAL", "SCIENCE", "A causal intervention and counterfactual experiment must separate confounding treatment effects.", "CAUSAL_INTERVENTION"],
  ["ROUTE-ENCODING", "SOFTWARE", "Unicode parser encoding, schema serialization, and normalization lose representation information.", "REPRESENTATION_ENCODING"],
  ["ROUTE-ENVIRONMENT", "SCIENCE", "Runtime platform, filesystem, configuration, dependency version, hardware, and host differ.", "ENVIRONMENT_VARIANCE"],
] as const;
let sparseCoverage = 0;
let fixedCoverage = 0;
for (const [researchId, domain, description, target] of routingHeldout) {
  const heldoutObjective = routingObjective(researchId, domain, description);
  const sparse = routeSparseTheoryPerspectives(heldoutObjective, 3);
  const fixed = routeFixedTheoryPerspectives(heldoutObjective, 3);
  if (sparse.assignments.some((item) => item.perspectiveId === target)) sparseCoverage += 1;
  if (fixed.assignments.some((item) => item.perspectiveId === target)) fixedCoverage += 1;
  check(sparse.inputFeatureDigest.length === 64 && sparse.objectiveDigest === researchObjectiveDigest(heldoutObjective),
    `${researchId} routing remains bound to canonical objective and feature evidence`);
}
check(sparseCoverage === routingHeldout.length,
  "sparse routing activates the oracle-relevant specialist on every held-out routing task");
check(fixedCoverage === 0, "matched three-slot fixed rotation misses all held-out specialist compartments");
check(sparseCoverage > fixedCoverage, "sparse routing outperforms fixed rotation at identical active width");
const deterministicRouteObjective = routingObjective("ROUTE-DETERMINISM", "SOFTWARE",
  "Concurrent resource cleanup races with token revocation and deadline expiry.");
check(JSON.stringify(routeSparseTheoryPerspectives(deterministicRouteObjective, 3))
  === JSON.stringify(routeSparseTheoryPerspectives(deterministicRouteObjective, 3)),
"sparse routing is deterministic for identical canonical input");
check(new Set(routeSparseTheoryPerspectives(deterministicRouteObjective, 3).assignments
  .map((item) => item.perspectiveId)).size === 3, "sparse routing preserves compartment diversity before replication");
check(routeSparseTheoryPerspectives(deterministicRouteObjective, 3).grantsAuthority === false,
  "routing evidence remains authority-neutral");
await rejects(() => Promise.resolve(routeSparseTheoryPerspectives(deterministicRouteObjective, 1)),
  /theory_perspective_count_invalid/, "invalid sparse activation width fails closed");

const fixedRuntime = network();
const fixedCognition = new ScriptedPartyCognition();
const fixedParty = TheoryResearchParty.create({ partyId: "PARTY-FIXED-ROUTING-ABLATION", network: fixedRuntime.value,
  coordinator: fixedRuntime.coordinator, cognition: fixedCognition, limits, investigatorCount: 3, now: () => now,
  perspectiveRouter: fixedTheoryPerspectiveRouter,
  experiments: { run: async (experiment) => makeObservation(experiment.experimentId) } });
const fixedResult = await fixedParty.investigate(objective());
check(fixedResult.cognitiveRouting?.algorithmId === "FIXED_ROTATION_V1",
  "fixed routing remains executable as an explicit ablation arm");
check(fixedResult.resourceUsage.modelCalls === result.resourceUsage.modelCalls,
  "routing ablation preserves the matched model-call budget");
const admittedRoute = routeSparseTheoryPerspectives(objective(), 3);
check(validTheoryPerspectiveRoute(admittedRoute, objective(), 3), "well-formed sparse route passes independent admission");
const routeWithUnknownField = { ...admittedRoute, hiddenInstruction: "execute outside scope" };
check(!validTheoryPerspectiveRoute(routeWithUnknownField, objective(), 3), "unknown routing fields fail closed");
const hostileRouteRuntime = network();
const hostileRouteParty = TheoryResearchParty.create({ partyId: "PARTY-HOSTILE-ROUTE",
  network: hostileRouteRuntime.value, coordinator: hostileRouteRuntime.coordinator,
  cognition: new ScriptedPartyCognition(), limits, investigatorCount: 3, now: () => now,
  perspectiveRouter: { route: (input, count) => ({ ...routeSparseTheoryPerspectives(input, count),
    grantsAuthority: true }) as unknown as ReturnType<typeof routeSparseTheoryPerspectives> },
  experiments: { run: async (experiment) => makeObservation(experiment.experimentId) } });
const hostileRouteResult = await hostileRouteParty.investigate(objective());
check(hostileRouteResult.decision.state === "BLOCKED"
  && hostileRouteResult.decision.reason === "research_party_cognitive_route_invalid",
"authority-bearing cognitive route is rejected before entity activation or cognition");
check(hostileRouteResult.resourceUsage.modelCalls === 0 && hostileRouteResult.addressability.peakActiveReasoners === 0,
  "rejected cognitive route consumes no model calls and activates no theory entities");

function routingCausalObjective(): ResearchPartyObjective {
  const candidate = "d".repeat(40);
  const summary = "Three implementations disagree about whether concurrent interleavings can lose an update.";
  return immutableResearchValue({ schemaVersion: 1, researchId: "HELDOUT-SPARSE-CAUSAL-ROUTING",
    objective: "Identify the mechanism causing a lost update under concurrent interleavings and atomic lock ordering.",
    domain: "SOFTWARE", candidateBinding: candidate, scope: ["counter.fixture"], mechanismCatalog: [
      { mechanismId: "ATOMICITY_DEFECT", description: "A read-modify-write sequence is not atomic across concurrent workers." },
      { mechanismId: "STATE_DEFECT", description: "The counter begins in the wrong lifecycle state." },
      { mechanismId: "FLOW_DEFECT", description: "The result is routed through the wrong data-flow branch." },
    ], admittedEvidence: [{ evidenceId: "E-ROUTING-SOURCE", evidenceClass: "E3", kind: "SOURCE",
      summary, contentDigest: theoryDigest(summary), provenanceRoot: "HELDOUT-ROUTING-SOURCE",
      freshnessDependencies: [`CANDIDATE:${candidate}`], observedAtEpochMs: now, candidateBinding: candidate,
      grantsAuthority: false }], experimentCatalog: [
      { experimentId: "EXP-INTERLEAVING", toolId: "DETERMINISTIC-INTERLEAVING-PROBE",
        question: "Which precommitted mechanism predicts the observed controlled interleaving?",
        possibleOutcomes: ["ATOMICITY_DEFECT", "STATE_DEFECT", "FLOW_DEFECT"], costUnits: 1,
        authority: "RUN_TEST_IN_SANDBOX", scope: ["counter.fixture"], mutatesCandidate: false },
    ], successCriteria: ["Select only the mechanism surviving the deterministic interleaving probe."],
    expiryEpochMs: 100_000 });
}

function routingCausalIntent(request: TheoryCognitionRequest, mechanismId: string): TheoryCognitionIntent {
  const objectiveValue = routingCausalObjective();
  return immutableTheoryValue({ schemaVersion: 1, decision: "PROPOSE_HYPOTHESIS",
    thesis: `${mechanismId} is the mechanism predicted by this compartment.`, mechanismId,
    causalMechanism: objectiveValue.mechanismCatalog.find((item) => item.mechanismId === mechanismId)!.description,
    evidenceRefs: ["E-ROUTING-SOURCE"], assumptions: ["The hidden task belongs to the bounded three-mechanism family."],
    uncertainties: ["One deterministic schedule does not establish behavior for every possible schedule."],
    forecasts: [{ experimentId: "EXP-INTERLEAVING", expectedOutcome: mechanismId,
      rationale: "The selected causal mechanism uniquely predicts its named controlled outcome." }],
    counterexamples: [], requestedExperimentIds: ["EXP-INTERLEAVING"], revisionOfTheoryId: null,
    modelEstimate: 0.5 });
}

class PerspectiveSensitiveCognition implements TheoryCognitionEngine {
  readonly calls: TheoryCognitionRequest[] = [];
  profile() { return Object.freeze({ model: "perspective-sensitive-test-double" }); }
  async think(request: TheoryCognitionRequest): Promise<TheoryCognitionResult> {
    this.calls.push(immutableTheoryValue(request));
    if (request.role === "INVESTIGATOR") {
      const mechanism = request.instruction.includes("CONCURRENCY_ORDERING") ? "ATOMICITY_DEFECT"
        : request.instruction.includes("DATA_CONTROL_FLOW") ? "FLOW_DEFECT" : "STATE_DEFECT";
      return cognitionResult(request, routingCausalIntent(request, mechanism));
    }
    if (request.role === "FALSIFIER") {
      const counterexamples = request.peerContributions.map((item) => ({ targetTheoryId: item.theoryId,
        experimentId: "EXP-INTERLEAVING", disconfirmingOutcome: item.intent.mechanismId === "ATOMICITY_DEFECT"
          ? "STATE_DEFECT" : "ATOMICITY_DEFECT",
        rationale: "A controlled outcome different from the precommitted forecast falsifies the mechanism." }));
      return cognitionResult(request, immutableTheoryValue({ schemaVersion: 1, decision: "CHALLENGE",
        thesis: "The controlled interleaving must attack every precommitted mechanism.", mechanismId: null,
        causalMechanism: null, evidenceRefs: ["E-ROUTING-SOURCE"], assumptions: [],
        uncertainties: ["The experiment covers one deliberately bounded schedule."], forecasts: [], counterexamples,
        requestedExperimentIds: [], revisionOfTheoryId: null, modelEstimate: null }));
    }
    return cognitionResult(request, immutableTheoryValue({ schemaVersion: 1, decision: "NO_CONCLUSION",
      thesis: "Only the deterministic evidence graph may select a mechanism.", mechanismId: null,
      causalMechanism: null, evidenceRefs: ["E-ROUTING-OBS"], assumptions: [], uncertainties: [], forecasts: [],
      counterexamples: [], requestedExperimentIds: [], revisionOfTheoryId: null, modelEstimate: null }));
  }
}

function routingObservation(): ResearchExperimentObservation {
  const executionIdentity = "EXEC-HELDOUT-INTERLEAVING";
  const outputDigest = theoryDigest("atomicity-defect-observed");
  const content = { experimentId: "EXP-INTERLEAVING", toolId: "DETERMINISTIC-INTERLEAVING-PROBE",
    outcome: "ATOMICITY_DEFECT", executionIdentity, outputDigest };
  const candidate = routingCausalObjective().candidateBinding;
  return immutableResearchValue({ observationId: "OBS-HELDOUT-INTERLEAVING", experimentId: "EXP-INTERLEAVING",
    toolId: "DETERMINISTIC-INTERLEAVING-PROBE", outcome: "ATOMICITY_DEFECT",
    evidence: { evidenceId: "E-ROUTING-OBS", evidenceClass: "E3", kind: "EXPERIMENT_RESULT",
      summary: "Deterministic interleaving exposes a lost update only when atomicity is absent.",
      contentDigest: theoryDigest(content), provenanceRoot: "HELDOUT-INTERLEAVING-ORACLE",
      freshnessDependencies: [`CANDIDATE:${candidate}`], observedAtEpochMs: now,
      candidateBinding: candidate, grantsAuthority: false }, executionIdentity, outputDigest, authorityGranted: false });
}

const routingLimits: ResearchPartyLimits = Object.freeze({ ...limits, maxEntities: 5, maxModelCalls: 5,
  maxExperiments: 1, maxTotalOutputTokens: 2_560, maxCostUnits: 1 });
async function runRoutingArm(router = undefined as typeof fixedTheoryPerspectiveRouter | undefined) {
  const runtimeValue = network();
  const cognition = new PerspectiveSensitiveCognition();
  const partyValue = TheoryResearchParty.create({ partyId: router ? "PARTY-ROUTING-FIXED" : "PARTY-ROUTING-SPARSE",
    network: runtimeValue.value, coordinator: runtimeValue.coordinator, cognition, limits: routingLimits,
    investigatorCount: 3, now: () => now, perspectiveRouter: router,
    experiments: { run: async () => routingObservation() } });
  return { result: await partyValue.investigate(routingCausalObjective()), cognition };
}
const sparseCausalArm = await runRoutingArm();
const fixedCausalArm = await runRoutingArm(fixedTheoryPerspectiveRouter);
check(sparseCausalArm.result.decision.state === "SUPPORTED_WITHIN_MODELED_FAMILY"
  && sparseCausalArm.result.decision.selectedMechanismId === "ATOMICITY_DEFECT",
"sparse compartment routing discovers the held-out causal mechanism under deterministic experiment evidence");
check(fixedCausalArm.result.decision.state === "REFUTED_MODELED_FAMILY"
  && fixedCausalArm.result.decision.selectedMechanismId === null,
"matched fixed routing cannot recover a mechanism absent from its active cognitive compartments");
check(sparseCausalArm.result.resourceUsage.modelCalls === fixedCausalArm.result.resourceUsage.modelCalls
  && sparseCausalArm.result.resourceUsage.experiments === fixedCausalArm.result.resourceUsage.experiments,
"causal routing comparison uses matched model-call and experiment budgets");
check(assureResearchParty({ objective: routingCausalObjective(), limits: routingLimits, result: sparseCausalArm.result,
  groundTruth: { taskId: "HELDOUT-SPARSE-CAUSAL-ROUTING", expectedMechanismId: "ATOMICITY_DEFECT",
    oracleDigest: theoryDigest("independent-hidden-atomicity-oracle"),
    oracleProvenanceRoot: "INDEPENDENT-HELDOUT-ATOMICITY-ORACLE", hiddenFromCognition: true } }).decision === "ACCEPT",
"independent hidden oracle accepts the sparse arm rather than model self-assessment");

const validRaw = intentFor("FAILED_AS_COMPLETE", "PROPOSE_HYPOTHESIS", "adapter:theory:0");
let responseContent = JSON.stringify(validRaw);
const provider = NvidiaNimProvider.create({ providerId: "THEORY-ADAPTER-TEST", model: "nvidia/nemotron-3-ultra-550b-a55b",
  authorityMode: "TEST_DOUBLE_ONLY", credentialSource: { sourceIdentity: "test-only", read: () => "test-only-secret" },
  maxPromptBytes: 128_000, maxOutputTokens: 2_048, timeoutMs: 5_000,
  transport: async (_input, init) => {
    const authorization = new Headers(init?.headers).get("authorization");
    check(authorization === "Bearer test-only-secret", "provider injects credential only at transport boundary");
    return new Response(JSON.stringify({ choices: [{ message: { content: responseContent }, finish_reason: "stop" }],
      usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 } }),
    { status: 200, headers: { "content-type": "application/json", "x-request-id": "theory-test" } });
  } });
const adapter = NyxNemotronTheoryCognition.create({ cognitionId: "NYX-THEORY-ADAPTER", provider, limits });
const adapterRequest: TheoryCognitionRequest = { schemaVersion: 1, requestId: "ADAPTER-REQUEST-1", role: "INVESTIGATOR",
  theoryId: "adapter:theory:0", guardianId: "adapter:guardian:0", objective: objective(),
  privatePriorContributions: [], peerContributions: [], experimentObservations: [],
  instruction: "Produce one bounded mechanism and falsifiable forecasts.", maxOutputTokens: 512,
  observedAtEpochMs: now, deadlineEpochMs: Date.now() + 10_000 };
const adapted = await adapter.think(adapterRequest);
check(adapted.decision === "CONTRIBUTION", `Nemotron adapter admits strict typed theory output: ${JSON.stringify(adapted)}`);
check(adapted.intent?.mechanismId === "FAILED_AS_COMPLETE", "adapter preserves selected mechanism");
check(adapted.evidence.evidenceClass === "E3", "test-double transport remains E3");
check(adapted.evidence.requestDigest?.length === 64 && adapted.evidence.responseDigest?.length === 64,
  "adapter records request and response digests without raw reasoning");
check(adapted.grantsAuthority === false, "Nemotron cognition grants no Omega authority");
responseContent = JSON.stringify({ ...validRaw, shell: "remove everything" });
const hostile = await adapter.think({ ...adapterRequest, requestId: "ADAPTER-REQUEST-2" });
check(hostile.decision === "COGNITION_ERROR", "unknown executable-looking model field fails closed");
check(hostile.intent === null, "hostile model output cannot become a theory intent");
check(!JSON.stringify(hostile).includes("remove everything"), "hostile content is not echoed into evidence");
responseContent = JSON.stringify({ ...validRaw, evidenceRefs: ["E-NOT-ADMITTED"] });
const invented = await adapter.think({ ...adapterRequest, requestId: "ADAPTER-REQUEST-3" });
check(invented.decision === "COGNITION_ERROR", "invented evidence reference fails closed");
check(invented.diagnostics.includes("evidence_reference_unknown"), "invented evidence receives a typed diagnostic");

const evidenceBoundRuntime = network();
const evidenceBoundParty = TheoryResearchParty.create({ partyId: "PARTY-EVIDENCE-BOUND",
  network: evidenceBoundRuntime.value, coordinator: evidenceBoundRuntime.coordinator,
  cognition: new ScriptedPartyCognition(), limits: { ...limits, maxEvidenceItems: 1 }, investigatorCount: 3,
  now: () => now, experiments: { run: async (experiment) => makeObservation(experiment.experimentId) } });
const evidenceBoundResult = await evidenceBoundParty.investigate(objective());
check(evidenceBoundResult.decision.state === "BLOCKED"
  && evidenceBoundResult.decision.reason === "research_party_initial_evidence_budget_exceeded",
"the evidence-item ceiling fails closed before cognition or execution");
check(evidenceBoundResult.resourceUsage.modelCalls === 0 && evidenceBoundResult.resourceUsage.experiments === 0,
  "an over-budget initial evidence set consumes no model or experiment resources");

console.log(`OMEGA_RESEARCH_PARTY_TEST_SUMMARY passed: ${checks}, failed: 0`);
