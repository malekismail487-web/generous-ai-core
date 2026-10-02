import { createRequire } from "node:module";
import { NvidiaNimProvider } from "../src/lib/codelab/model/nvidiaNimProvider";
import { runFlatTheoryBaseline } from "../src/lib/codelab/research/flatTheoryBaseline";
import { NYX_DERIVATION_CHECK_INSTRUCTION, NYX_NVIDIA_THEORY_INTENT_JSON_SCHEMA, NYX_THEORY_INTENT_JSON_SCHEMA,
  NyxNemotronTheoryCognition, theoryIntentSchemaForRequest } from "../src/lib/codelab/research/nyxNemotronTheoryCognition";
import { assureResearchParty } from "../src/lib/codelab/research/researchPartyAssurance";
import { immutableResearchValue, researchObjectiveDigest, researchCognitionOutcomeClass, researchPredictionId, validResearchLimits, validResearchObjective,
  type ResearchExperimentObservation, type ResearchPartyLimits, type ResearchPartyObjective,
  type TheoryCognitionIntent, type TheoryCognitionRequest, type TheoryCognitionResult,
  type TheoryContribution } from "../src/lib/codelab/research/researchPartyContracts";
import { ResearchEvidenceGraph } from "../src/lib/codelab/research/researchEvidenceGraph";
import { TheoryNetwork } from "../src/lib/codelab/research/theoryNetwork";
import { immutableTheoryValue, theoryDigest } from "../src/lib/codelab/research/theoryContracts";
import { TheoryResearchParty, type TheoryCognitionEngine } from "../src/lib/codelab/research/theoryResearchParty";
import { allocateHypothesisCoverage, validHypothesisAllocation } from "../src/lib/codelab/research/hypothesisCoverage";
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

function network(maxPredictionsPerTheory = 32) {
  const coordinator = {};
  const value = TheoryNetwork.create({ namespace: "nyx-party", addressCapacity: "1000000000000",
    maxAssignedPairs: 100, maxConcurrentActivations: 8, maxTotalActivations: 100,
    maxEvents: 1_000, maxPredictionsPerTheory, maxObservationsPerTheory: 64,
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
const directEvidence = immutableResearchValue({ evidenceId: "E1-DIRECT", evidenceClass: "E1" as const, kind: "MODEL_CONTRIBUTION" as const,
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

// Counterexample targets are causal claims, not merely materialized entity IDs.
// A reviewer or abstaining entity has no hypothesis for the graph to falsify.
function counterexampleContribution(id: string, target: string | null): TheoryContribution {
  const intent: TheoryCognitionIntent = { ...directIntent, decision: target ? "CHALLENGE" : "NO_CONCLUSION",
    mechanismId: null, causalMechanism: null, forecasts: [], requestedExperimentIds: [], revisionOfTheoryId: null,
    counterexamples: target ? [{ targetTheoryId: target, experimentId: "EXP-A-FAILED",
      disconfirmingOutcome: "BLOCKED", rationale: "This outcome would contradict the dispatch forecast." }] : [] };
  const modelEvidence = { ...directEvidence, evidenceId: `E1-${id}`, contentDigest: theoryDigest(intent) };
  const base = { ...directBase, contributionId: id, theoryId: `nyx-party:theory:${id}`, role: "FALSIFIER" as const,
    intent, modelEvidence };
  return immutableResearchValue({ ...base, contributionDigest: theoryDigest({ contributionId: base.contributionId,
    theoryId: base.theoryId, guardianId: base.guardianId, role: base.role, objectiveDigest: base.objectiveDigest,
    intent, modelEvidenceId: modelEvidence.evidenceId, committedAtEpochMs: base.committedAtEpochMs }), grantsAuthority: false });
}
{
  const graph = new ResearchEvidenceGraph(objective(), now);
  graph.commitContribution(directContribution);
  const reviewer = counterexampleContribution("REVIEWER-WITHOUT-HYPOTHESIS", null);
  graph.commitContribution(reviewer);
  for (const target of ["nyx-party:theory:unknown", reviewer.theoryId]) {
    const before = theoryDigest(graph.snapshot());
    await rejects(() => graph.commitContribution(counterexampleContribution(`INVALID-${target.split(":").at(-1)}`, target)),
      /research_contribution_invalid/, "unknown and non-hypothesis targets are rejected at graph admission");
    check(theoryDigest(graph.snapshot()) === before && graph.chainComplete(),
      "rejected counterexample leaves evidence and contribution custody unchanged");
  }
  graph.commitContribution(counterexampleContribution("VALID-CHALLENGE", directContribution.theoryId));
  check(graph.chainComplete() && graph.snapshot().contributions.length === 3,
    "valid challenges retain the full admitted causal evidence chain");
}

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
check(scripted.calls.slice(0, 3).every((item) => item.predictionFeedback.length === 0),
  "initial investigators cannot see forecast outcomes or peer-derived feedback");
check(scripted.calls.filter((item) => item.role === "REVISER").every((item) =>
  item.predictionFeedback.every((feedback) => {
    const own = item.privatePriorContributions.at(-1);
    const observed = item.experimentObservations.find((observation) => observation.experimentId === feedback.experimentId);
    return own?.contributionId === feedback.contributionId
      && feedback.predictionId === `${own?.contributionId}-${feedback.experimentId}`
      && observed?.observationId === feedback.observationId
      && observed?.evidence.evidenceId === feedback.evidenceId
      && feedback.disposition === (feedback.expectedOutcome === observed?.outcome
        ? "SUPPORTED_WITHIN_TEST_SCOPE" : "FALSIFIED_PREDICTION")
      && feedback.grantsAuthority === false;
  })), "each reviser receives only its own forecast-error signal bound to actual Omega evidence");
check(scripted.calls.some((item) => item.predictionFeedback.some((feedback) =>
  feedback.disposition === "FALSIFIED_PREDICTION")),
"at least one specialist receives a concrete falsifier instead of only a generic experiment result");
check(result.contributions.every((item) => item.modelEvidence.evidenceClass === "E1"),
  "all model contributions remain E1 claims regardless of provider transport");
check(result.cognitionOutcomes?.length === result.resourceUsage.modelCalls
  && new Set(result.cognitionOutcomes.map(item => item.requestId)).size === result.resourceUsage.modelCalls,
  "every cognition call has distinct sanitized outcome provenance, including rejected calls");
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
let responseFinishReason = "stop";
const modelPrompts: Record<string, unknown>[] = [];
const requestedOutputBudgets: number[] = [];
const templateControls: unknown[] = [];
const requestedThinkingBudgets: (number | undefined)[] = [];
const provider = NvidiaNimProvider.create({ providerId: "THEORY-ADAPTER-TEST", model: "nvidia/nemotron-3-ultra-550b-a55b",
  authorityMode: "TEST_DOUBLE_ONLY", credentialSource: { sourceIdentity: "test-only", read: () => "test-only-secret" },
  maxPromptBytes: 128_000, maxOutputTokens: 2_048, timeoutMs: 5_000,
  transport: async (_input, init) => {
    const authorization = new Headers(init?.headers).get("authorization");
    check(authorization === "Bearer test-only-secret", "provider injects credential only at transport boundary");
    const body = JSON.parse(String(init?.body));
    requestedOutputBudgets.push(body.max_tokens);
    requestedThinkingBudgets.push(body.chat_template_kwargs?.reasoning_budget);
    templateControls.push(body.chat_template_kwargs);
    modelPrompts.push(JSON.parse(body.messages[1].content));
    return new Response(JSON.stringify({ choices: [{ message: { content: responseContent }, finish_reason: responseFinishReason }],
      usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 } }),
    { status: 200, headers: { "content-type": "application/json", "x-request-id": "theory-test" } });
  } });
const adapter = NyxNemotronTheoryCognition.create({ cognitionId: "NYX-THEORY-ADAPTER", provider, limits });
const adapterRequest: TheoryCognitionRequest = { schemaVersion: 1, requestId: "ADAPTER-REQUEST-1", role: "INVESTIGATOR",
  theoryId: "adapter:theory:0", guardianId: "adapter:guardian:0", objective: objective(),
  privatePriorContributions: [], peerContributions: [], experimentObservations: [], predictionFeedback: [],
  instruction: "Produce one bounded mechanism and falsifiable forecasts.", maxOutputTokens: 512,
  observedAtEpochMs: now, deadlineEpochMs: Date.now() + 10_000 };
// Existing frozen ESLint dependency; an external schema implementation, not our intent parser.
const require = createRequire(import.meta.url);
const Ajv = require("ajv");
check(require("ajv/package.json").version === "6.12.6", "schema oracle uses the frozen Ajv dependency");
const schemaOracle = new Ajv({ allErrors: true });
const constrained = schemaOracle.compile(theoryIntentSchemaForRequest(adapterRequest));
check(constrained(validRaw), "request-bound schema accepts a valid investigator hypothesis");
const noConclusion = { ...validRaw, decision: "NO_CONCLUSION", mechanismId: null, causalMechanism: null,
  forecasts: [], requestedExperimentIds: [], revisionOfTheoryId: null };
check(constrained(noConclusion), "request-bound schema preserves honest uncertainty");
check(!constrained({ ...validRaw, decision: "NO_CONCLUSION" }), "decode schema rejects mixed decision fields");
check(!constrained({ ...validRaw, revisionOfTheoryId: adapterRequest.theoryId }),
  "decode schema rejects invented proposal revision lineage");
check(!constrained({ ...validRaw, evidenceRefs: ["E-NOT-ADMITTED"] }), "decode schema binds admitted evidence vocabulary");
check(!constrained({ ...validRaw, counterexamples: [{ targetTheoryId: adapterRequest.theoryId,
  experimentId: "EXP-A-FAILED", disconfirmingOutcome: "BLOCKED", rationale: "Not a supplied peer." }] }),
  "decode schema represents an empty peer set as an empty counterexample array");
check(!constrained({ ...validRaw, forecasts: [{ experimentId: "EXP-NOT-ADMITTED",
  expectedOutcome: "BLOCKED", rationale: "Unknown experiment." }] }), "decode schema rejects unknown experiments");
check(!constrained({ ...validRaw, forecasts: [{ experimentId: "EXP-A-FAILED",
  expectedOutcome: "UNKNOWN-OUTCOME", rationale: "Unknown outcome." }] }), "decode schema binds each experiment's own outcomes");
check(schemaOracle.compile(theoryIntentSchemaForRequest({ ...adapterRequest, role: "META_REVIEWER" }))(noConclusion)
  && !schemaOracle.compile(theoryIntentSchemaForRequest({ ...adapterRequest, role: "META_REVIEWER" }))(validRaw),
  "meta-reviewer schema cannot become a hypothesis generator or authoritative verifier");
check(!schemaKeys(theoryIntentSchemaForRequest(adapterRequest)).some(key =>
  ["minLength", "maxLength", "minItems", "maxItems", "uniqueItems", "minimum", "maximum"].includes(key)),
  "request-bound decoding retains the supported transport subset while local bounds stay authoritative");
const falsifierSchema = schemaOracle.compile(theoryIntentSchemaForRequest({ ...adapterRequest,
  role: "FALSIFIER", peerContributions: [directContribution] }));
const challenge = { ...noConclusion, decision: "CHALLENGE", counterexamples: [{
  targetTheoryId: directContribution.theoryId, experimentId: "EXP-A-FAILED",
  disconfirmingOutcome: "BLOCKED", rationale: "A blocking outcome falsifies the precommitted dispatch prediction." }] };
check(falsifierSchema(challenge), "falsifier can issue a concrete counterexample against a supplied peer");
check(!falsifierSchema({ ...challenge, counterexamples: [{ ...challenge.counterexamples[0],
  targetTheoryId: "ANOTHER-THEORY" }] }), "falsifier cannot widen its peer target set through generation");
const commentaryPeer = counterexampleContribution("COMMENTARY-PEER", null);
const mixedPeerRequest: TheoryCognitionRequest = { ...adapterRequest, role: "META_REVIEWER",
  requestId: "ADAPTER-COUNTEREXAMPLE-TARGETS", peerContributions: [directContribution, commentaryPeer]
    .map(item => ({ ...item, objectiveDigest: researchObjectiveDigest(adapterRequest.objective) })) };
const mixedPeerSchema = schemaOracle.compile(theoryIntentSchemaForRequest(mixedPeerRequest));
const reviewChallenge = { ...noConclusion, counterexamples: challenge.counterexamples };
check(mixedPeerSchema(reviewChallenge), "reviewer can challenge an actual precommitted peer hypothesis");
const commentaryChallenge = { ...reviewChallenge, counterexamples: [{ ...challenge.counterexamples[0],
  targetTheoryId: commentaryPeer.theoryId }] };
check(!mixedPeerSchema(commentaryChallenge), "decode schema excludes commentary-only peer targets");
check(!schemaOracle.compile(theoryIntentSchemaForRequest({ ...mixedPeerRequest,
  peerContributions: mixedPeerRequest.peerContributions.slice(1) }))(commentaryChallenge),
  "no hypothesis peers means no counterexample edges even when entity IDs exist");
responseContent = JSON.stringify(commentaryChallenge);
const rejectedCommentaryTarget = await adapter.think(mixedPeerRequest);
check(rejectedCommentaryTarget.decision === "COGNITION_ERROR"
  && rejectedCommentaryTarget.diagnostics.includes("counterexample_binding_invalid"),
  "semantic parser independently rejects reviewer targets rather than trusting guided decoding");
check(JSON.stringify((modelPrompts.at(-1)?.outputContract as Record<string, unknown>).counterexampleTargetTheoryIds)
  === JSON.stringify([directContribution.theoryId]), "model sees the same hypothesis-only target contract as admission");
responseContent = JSON.stringify(reviewChallenge);
const admittedReviewTarget = await adapter.think({ ...mixedPeerRequest, requestId: "ADAPTER-VALID-REVIEW-TARGET" });
check(admittedReviewTarget.decision === "CONTRIBUTION" && admittedReviewTarget.intent?.counterexamples.length === 1,
  "restricting invalid edges preserves real hypothesis falsification");
responseContent = JSON.stringify(validRaw);
const priorObservation = makeObservation("EXP-A-FAILED");
const revisedIntent = intentFor("FAILED_AS_COMPLETE", "REVISE_HYPOTHESIS", adapterRequest.theoryId, [priorObservation]);
const revisionSchema = schemaOracle.compile(theoryIntentSchemaForRequest({ ...adapterRequest,
  role: "REVISER", experimentObservations: [priorObservation] }));
check(revisionSchema(revisedIntent), "reviser can precommit fresh forecasts under its own lineage");
check(!revisionSchema({ ...revisedIntent, revisionOfTheoryId: "ANOTHER-THEORY" }),
  "reviser cannot steal another theory's lineage");
check(!revisionSchema({ ...revisedIntent, forecasts: validRaw.forecasts }),
  "generation schema forbids predicting an outcome already observed");
check(Buffer.byteLength(JSON.stringify(theoryIntentSchemaForRequest(adapterRequest)), "utf8") < 32_768,
  "bounded fixture schema stays within the existing provider schema-byte envelope");
const adapted = await adapter.think(adapterRequest);
check(adapted.evidence.delivery?.httpAttempts === 1 && adapted.evidence.delivery.transientUnavailableResponses === 0
  && adapted.evidence.delivery.authorityRenewed === false,
  "research cognition preserves provider delivery telemetry without renewing authority");
check(adapted.decision === "CONTRIBUTION", `Nemotron adapter admits strict typed theory output: ${JSON.stringify(adapted)}`);
check(adapted.intent?.mechanismId === "FAILED_AS_COMPLETE", "adapter preserves selected mechanism");
check(adapted.evidence.evidenceClass === "E3", "test-double transport remains E3");
check(adapted.evidence.requestDigest?.length === 64 && adapted.evidence.responseDigest?.length === 64,
  "adapter records request and response digests without raw reasoning");
check(adapted.grantsAuthority === false, "Nemotron cognition grants no Omega authority");
const suppliedContract = modelPrompts.at(-1)?.outputContract as Record<string, unknown>;
check(JSON.stringify(suppliedContract.allowedDecisions) === JSON.stringify(["PROPOSE_HYPOTHESIS", "NO_CONCLUSION"])
  && JSON.stringify(suppliedContract.counterexampleTargetTheoryIds) === "[]",
  "isolated investigator prompt explicitly forbids imaginary peer targets without restricting honest uncertainty");
check(JSON.stringify(suppliedContract.nonHypothesisFields) === JSON.stringify({ mechanismId: null,
  causalMechanism: null, forecasts: [], requestedExperimentIds: [], revisionOfTheoryId: null }),
  "non-hypothesis field rules are advertised before inference rather than relaxed after malformed output");
check((modelPrompts.at(-1)?.laws as string[]).some(law => law.includes("tentative conjecture"))
  && (modelPrompts.at(-1)?.laws as string[]).some(law => law.includes("Only observed evidence may support it")),
  "investigation can propose uncertainty-bearing experiments without promoting a conjecture into evidence");
responseFinishReason = "length";
const truncated = await adapter.think({ ...adapterRequest, requestId: "ADAPTER-TRUNCATED-JSON" });
check(truncated.decision === "COGNITION_ERROR" && truncated.intent === null
  && truncated.diagnostics.includes("finish_reason_not_stop"),
  "HTTP 200 with length termination fails closed even when the visible JSON happens to parse");
check(truncated.evidence.finishReason === "length" && truncated.grantsAuthority === false,
  "output truncation remains distinct, observable, and authority-neutral");
responseFinishReason = "stop";
const compactAdapter = NyxNemotronTheoryCognition.create({ cognitionId: "NYX-COMPACT-EMISSION",
  provider, limits, boundedOutput: true });
for (const role of ["INVESTIGATOR", "FALSIFIER", "REVISER", "META_REVIEWER"] as const) {
  const roleRequest = role === "REVISER" ? scripted.calls.find(item => item.role === "REVISER")!
    : { ...adapterRequest, role, peerContributions: role === "INVESTIGATOR" ? [] : [{ ...directContribution,
      objectiveDigest: researchObjectiveDigest(adapterRequest.objective) }] };
  responseContent = JSON.stringify(role === "INVESTIGATOR" ? validRaw : role === "FALSIFIER" ? challenge
    : role === "REVISER" ? intentFor("FAILED_AS_COMPLETE", "REVISE_HYPOTHESIS", roleRequest.theoryId,
      roleRequest.experimentObservations) : noConclusion);
  const result = await compactAdapter.think({ ...roleRequest, requestId: `COMPACT-${role}`,
    observedAtEpochMs: now, deadlineEpochMs: Date.now() + 10_000, signal: new AbortController().signal });
  const budget = (modelPrompts.at(-1)?.outputContract as Record<string, unknown>).completionBudget as Record<string, unknown>;
  check(result.decision === "CONTRIBUTION" && !result.grantsAuthority,
    `compact emission preserves valid ${role} contributions and independent authority`);
  check(budget.maxTokens === roleRequest.maxOutputTokens && budget.hardThinkingTokenLimit === false
    && String(budget.instruction).includes("genuine uncertainty"),
    "all roles see the actual total budget and compactness cannot erase uncertainty");
  check(JSON.stringify(templateControls.at(-1)) === JSON.stringify({ enable_thinking: true,
    force_nonempty_content: true, medium_effort: true }) && requestedOutputBudgets.at(-1) === roleRequest.maxOutputTokens,
    "bounded output uses documented effort with unchanged per-call token ceiling");
}
responseContent = JSON.stringify(validRaw);
responseFinishReason = "length";
const compactTruncation = await compactAdapter.think({ ...adapterRequest, requestId: "COMPACT-LENGTH" });
check(compactTruncation.intent === null && compactTruncation.diagnostics.includes("finish_reason_not_stop"),
  "compact policy never salvages a truncated but parseable candidate");
responseFinishReason = "stop";
responseContent = JSON.stringify({ ...validRaw, evidenceRefs: ["FABRICATED-EVIDENCE"] });
check((await compactAdapter.think({ ...adapterRequest, requestId: "COMPACT-FABRICATION" })).diagnostics
  .includes("evidence_reference_unknown"), "compact policy never weakens local evidence validation");
responseContent = JSON.stringify(validRaw);
const diagnosticAdapter = NyxNemotronTheoryCognition.create({ cognitionId: "NYX-THEORY-DIAGNOSTIC",
  provider, limits: { ...limits, maxOutputTokensPerCall: 1_536, maxTotalOutputTokens: 16_896 } });
for (const outputBudget of [768, 1_536]) {
  const result = await diagnosticAdapter.think({ ...adapterRequest,
    requestId: `ADAPTER-BUDGET-${outputBudget}`, maxOutputTokens: outputBudget });
  check(result.decision === "CONTRIBUTION" && requestedOutputBudgets.at(-1) === outputBudget,
    `diagnostic ${outputBudget}-token arm preserves the typed contract and requested provider budget`);
  check(result.grantsAuthority === false && result.intent?.mechanismId === validRaw.mechanismId,
    "changing a test output ceiling neither grants authority nor substitutes a hidden answer");
}
const reservedAdapter = NyxNemotronTheoryCognition.create({ cognitionId: "NYX-RESERVED-EMISSION",
  provider, limits, boundedOutput: true, reasoningBudgetTokens: 256 });
const reservationCallsBefore = modelPrompts.length;
const reservedResult = await reservedAdapter.think({ ...adapterRequest, requestId: "RESERVED-EMISSION" });
const reservationBudget = (modelPrompts.at(-1)!.outputContract as Record<string, unknown>).completionBudget as Record<string, unknown>;
check(reservedResult.decision === "CONTRIBUTION" && modelPrompts.length === reservationCallsBefore + 1
  && requestedThinkingBudgets.at(-1) === 256 && requestedOutputBudgets.at(-1) === adapterRequest.maxOutputTokens,
"thinking reservation reuses one shared inference call and preserves the existing completion ceiling");
check(reservationBudget.requestedThinkingBudgetTokens === 256 && reservationBudget.enforcementMeasured === false
  && reservationBudget.nominalAnswerReservationTokens === adapterRequest.maxOutputTokens - 256,
"cognition advertises an explicit answer reservation without pretending to measure server enforcement");
const beforeTooSmall = modelPrompts.length;
check((await reservedAdapter.think({ ...adapterRequest, requestId: "RESERVATION-TOO-SMALL", maxOutputTokens: 256 })).decision === "REJECTED"
  && modelPrompts.length === beforeTooSmall, "a request smaller than its reservation fails before inference rather than increasing compute");
responseFinishReason = "length";
check((await reservedAdapter.think({ ...adapterRequest, requestId: "RESERVATION-STILL-TRUNCATED" })).intent === null,
"a requested thinking budget never licenses admission of length-terminated output");
responseFinishReason = "stop";
responseContent = JSON.stringify({ ...validRaw, evidenceRefs: ["FABRICATED-EVIDENCE"] });
check((await reservedAdapter.think({ ...adapterRequest, requestId: "RESERVATION-FABRICATION" })).diagnostics.includes("evidence_reference_unknown"),
"answer reservation preserves the unchanged evidence oracle and strict intent parser");
for (const overrides of [{ boundedOutput: false }, { reasoningBudgetTokens: -1 }, { reasoningBudgetTokens: 1.5 },
  { reasoningBudgetTokens: limits.maxOutputTokensPerCall }]) {
  let rejected = false;
  try { NyxNemotronTheoryCognition.create({ cognitionId: "NYX-INVALID-RESERVATION", provider, limits,
    boundedOutput: true, reasoningBudgetTokens: 256, ...overrides }); } catch { rejected = true; }
  check(rejected, "invalid cognition reservation fails closed at configuration");
}
responseContent = JSON.stringify(validRaw);
const directAdapter = NyxNemotronTheoryCognition.create({ cognitionId: "NYX-DIRECT-EMISSION",
  provider, limits, boundedOutput: true, emissionMode: "CONSTRAINED_JSON" });
const beforeDirect = modelPrompts.length;
const directResult = await directAdapter.think({ ...adapterRequest, requestId: "DIRECT-EMISSION" });
check(directResult.decision === "CONTRIBUTION" && !directResult.grantsAuthority
  && modelPrompts.length === beforeDirect + 1, "explicit direct emission preserves one inference and typed admission");
check(JSON.stringify(templateControls.at(-1)) === JSON.stringify({ enable_thinking: false, force_nonempty_content: true })
  && requestedThinkingBudgets.at(-1) === undefined && requestedOutputBudgets.at(-1) === adapterRequest.maxOutputTokens,
  "direct configuration cannot carry thinking effort or unsupported reservation and does not increase compute");
check(((modelPrompts.at(-1)!.outputContract as Record<string, unknown>).completionBudget as Record<string, unknown>)
  .emissionMode === "CONSTRAINED_JSON", "prompt explicitly binds the chosen output configuration");
responseFinishReason = "length";
const beforeDirectLength = modelPrompts.length;
check((await directAdapter.think({ ...adapterRequest, requestId: "DIRECT-LENGTH" })).intent === null
  && modelPrompts.length === beforeDirectLength + 1, "direct truncation fails without fallback inference or admission");
responseFinishReason = "stop";
responseContent = JSON.stringify({ ...validRaw, evidenceRefs: ["FABRICATED-EVIDENCE"] });
check((await directAdapter.think({ ...adapterRequest, requestId: "DIRECT-FABRICATION" })).diagnostics.includes("evidence_reference_unknown"),
  "direct emission retains independent evidence admission");
for (const overrides of [{ boundedOutput: false }, { reasoningBudgetTokens: 256 }, { emissionMode: "UNKNOWN" as "CONSTRAINED_JSON" }]) {
  let rejected = false;
  try { NyxNemotronTheoryCognition.create({ cognitionId: "NYX-INVALID-DIRECT", provider, limits,
    boundedOutput: true, emissionMode: "CONSTRAINED_JSON", ...overrides }); } catch { rejected = true; }
  check(rejected, "direct emission rejects incompatible configuration before inference");
}
responseContent = JSON.stringify(validRaw);
const reviserRequest = scripted.calls.find((item) => item.role === "REVISER"
  && item.predictionFeedback.some((feedback) => feedback.disposition === "FALSIFIED_PREDICTION"))!;
const reviserResponse = await adapter.think({ ...reviserRequest,
  requestId: "ADAPTER-REVISER-PREDICTION-FEEDBACK", observedAtEpochMs: now,
  deadlineEpochMs: Date.now() + 10_000, signal: new AbortController().signal });
check(reviserResponse.evidence.statusCode === 200
  && JSON.stringify(modelPrompts.at(-1)?.predictionFeedback) === JSON.stringify(reviserRequest.predictionFeedback)
  && String(modelPrompts.at(-1)?.roleInstruction).includes("Revise falsified claims"),
  "admitted model prompt exposes evidence-bound forecast errors to the specialist reviser");
const promptCountBeforeForgery = modelPrompts.length;
const forgedFeedback = await adapter.think({ ...reviserRequest, requestId: "ADAPTER-FORGED-FEEDBACK",
  predictionFeedback: reviserRequest.predictionFeedback.map((feedback) => ({ ...feedback,
    disposition: "SUPPORTED_WITHIN_TEST_SCOPE" as const })), signal: new AbortController().signal });
check(forgedFeedback.decision === "REJECTED" && forgedFeedback.diagnostics.includes("prediction_feedback_invalid")
  && modelPrompts.length === promptCountBeforeForgery,
  "cognition boundary rejects a forged favorable disposition before model inference");
const crossEntityFeedback = await adapter.think({ ...reviserRequest, requestId: "ADAPTER-CROSS-ENTITY-FEEDBACK",
  predictionFeedback: reviserRequest.predictionFeedback.map((feedback) => ({ ...feedback,
    contributionId: "CONTRIBUTION-OTHER-ENTITY" })), signal: new AbortController().signal });
check(crossEntityFeedback.decision === "REJECTED" && modelPrompts.length === promptCountBeforeForgery,
  "one specialist cannot import another specialist's forecast as its own evidence");
const modelClaimFeedback = await adapter.think({ ...reviserRequest, requestId: "ADAPTER-MODEL-CLAIM-FEEDBACK",
  predictionFeedback: reviserRequest.predictionFeedback.map((feedback) => ({ ...feedback,
    evidenceClass: "E1" as "E3" })), signal: new AbortController().signal });
check(modelClaimFeedback.decision === "REJECTED" && modelPrompts.length === promptCountBeforeForgery,
  "model self-assessment cannot be relabeled as an executed prediction observation");
responseContent = JSON.stringify({ ...validRaw, shell: "remove everything" });
const hostile = await adapter.think({ ...adapterRequest, requestId: "ADAPTER-REQUEST-2" });
check(hostile.decision === "COGNITION_ERROR", "unknown executable-looking model field fails closed");
check(hostile.intent === null, "hostile model output cannot become a theory intent");
check(!JSON.stringify(hostile).includes("remove everything"), "hostile content is not echoed into evidence");
responseContent = JSON.stringify({ ...validRaw, evidenceRefs: ["E-NOT-ADMITTED"] });
const invented = await adapter.think({ ...adapterRequest, requestId: "ADAPTER-REQUEST-3" });
check(invented.decision === "COGNITION_ERROR", "invented evidence reference fails closed");
check(invented.diagnostics.includes("evidence_reference_unknown"), "invented evidence receives a typed diagnostic");
responseContent = JSON.stringify({ ...validRaw, counterexamples: [{ targetTheoryId: adapterRequest.theoryId,
  experimentId: "EXP-A-FAILED", disconfirmingOutcome: "BLOCKED", rationale: "A self-target is not a supplied peer." }] });
const selfTarget = await adapter.think({ ...adapterRequest, requestId: "ADAPTER-SELF-TARGET" });
check(selfTarget.decision === "COGNITION_ERROR" && selfTarget.diagnostics.includes("counterexample_binding_invalid"),
  "explicit prompt guidance does not make self-targeted counterexamples admissible");
responseContent = JSON.stringify({ ...validRaw, decision: "NO_CONCLUSION" });
const mixedDecision = await adapter.think({ ...adapterRequest, requestId: "ADAPTER-MIXED-DECISION" });
check(mixedDecision.decision === "COGNITION_ERROR"
  && mixedDecision.diagnostics.includes("non_hypothesis_contains_hypothesis_fields"),
  "a NO_CONCLUSION response with hypothesis fields still fails the unchanged semantic parser");
responseContent = JSON.stringify({ ...validRaw, decision: "NO_CONCLUSION", mechanismId: null,
  causalMechanism: null, forecasts: [], requestedExperimentIds: [], revisionOfTheoryId: null });
const uncertainty = await adapter.think({ ...adapterRequest, requestId: "ADAPTER-HONEST-UNCERTAINTY" });
check(uncertainty.decision === "CONTRIBUTION" && uncertainty.intent?.decision === "NO_CONCLUSION",
  "well-formed uncertainty remains a valid contribution and is never manufactured into a supported hypothesis");

for (const width of [1, 2, 3]) {
  const scheduledRuntime = network(); const base = new ScriptedPartyCognition();
  let active = 0; let peak = 0;
  const cognition: TheoryCognitionEngine = { profile: () => base.profile(), think: async request => {
    active += 1; peak = Math.max(peak, active);
    try { await Promise.resolve(); return await base.think(request); } finally { active -= 1; }
  } };
  const scheduledResult = await TheoryResearchParty.create({ partyId: `PARTY-SCHEDULE-${width}`,
    network: scheduledRuntime.value, coordinator: scheduledRuntime.coordinator, cognition,
    limits, investigatorCount: 3, maxParallelModelExecutions: width, now: () => now,
    experiments: { run: async experiment => makeObservation(experiment.experimentId) } }).investigate(objective());
  check(peak === width && scheduledResult.addressability.simultaneousModelExecutions === width && active === 0,
    "configured inference width is enforced and reported as real overlap, not entity population");
  check(scheduledResult.resourceUsage.modelCalls === result.resourceUsage.modelCalls
    && scheduledResult.resourceUsage.totalTokens === result.resourceUsage.totalTokens,
    "serial delivery cannot obtain more scripted model calls or tokens than parallel delivery");
  check(scheduledResult.decision.selectedMechanismId === result.decision.selectedMechanismId
    && scheduledResult.evidenceChainComplete && !scheduledResult.authorityGranted,
    "delivery width preserves causal selection, evidence custody, and zero authority");
  const peerSignature = (request: TheoryCognitionRequest) => [request.role, request.experimentObservations.length,
    request.peerContributions.map(item => [item.theoryId, item.role, item.intent.mechanismId, item.intent.forecasts])];
  check(JSON.stringify(base.calls.map(peerSignature)) === JSON.stringify(scripted.calls.map(peerSignature)),
    "serial revisers cannot see earlier same-phase revisions that parallel revisers never saw");
  check(base.calls.slice(0, 3).every(request => request.peerContributions.length === 0
    && request.experimentObservations.length === 0), "serial investigators remain independent before observation");
}
for (const width of [0, -1, 4, 1.5, NaN]) {
  const invalidRuntime = network();
  await rejects(() => TheoryResearchParty.create({ partyId: "PARTY-INVALID-WIDTH", network: invalidRuntime.value,
    coordinator: invalidRuntime.coordinator, cognition: new ScriptedPartyCognition(), limits,
    investigatorCount: 3, maxParallelModelExecutions: width, now: () => now,
    experiments: { run: async experiment => makeObservation(experiment.experimentId) } }),
  /configuration_invalid/, "invalid or excessive delivery concurrency fails closed");
}

// A live provider failure exposed a scheduler bug: the blank investigator was
// asked to revise twice, consuming reservations for requests rejected locally.
// Exercise both failed inference and honest abstention without task-specific repair.
for (const blankMode of ["FAILED", "ABSTAINED"] as const) {
  const partialRuntime = network();
  const base = new ScriptedPartyCognition();
  let investigatorIndex = 0;
  let blankTheoryId = "";
  const requests: TheoryCognitionRequest[] = [];
  const partialCognition: TheoryCognitionEngine = { profile: () => base.profile(), think: async request => {
    requests.push(request);
    const normal = await base.think(request);
    if (request.role !== "INVESTIGATOR" || investigatorIndex++ !== 1) return normal;
    blankTheoryId = request.theoryId;
    if (blankMode === "ABSTAINED") return cognitionResult(request, { ...normal.intent!, decision: "NO_CONCLUSION",
      mechanismId: null, causalMechanism: null, forecasts: [], counterexamples: [], requestedExperimentIds: [] });
    return { ...normal, decision: "COGNITION_ERROR", reason: "nvidia_provider_http_503", intent: null,
      evidence: { ...normal.evidence, evidenceClass: "E4", responseDigest: null, statusCode: 503,
        promptTokens: null, completionTokens: null, totalTokens: null, finishReason: null } };
  } };
  const partialLimits = { ...limits, maxModelCalls: 9, maxTotalOutputTokens: 9 * limits.maxOutputTokensPerCall };
  const partialResult = await TheoryResearchParty.create({ partyId: `PARTY-PARTIAL-${blankMode}`,
    network: partialRuntime.value, coordinator: partialRuntime.coordinator, cognition: partialCognition,
    limits: partialLimits, investigatorCount: 3, now: () => now,
    experiments: { run: async experiment => makeObservation(experiment.experimentId) } }).investigate(objective());
  check(!requests.some(request => request.role === "REVISER" && request.theoryId === blankTheoryId),
    "a blank specialist is never revised with invented private history");
  check(requests.filter(request => request.role === "REVISER").every(request =>
    request.privatePriorContributions.length > 0 && request.experimentObservations.length > 0),
    "each scheduled revision has actual own history and external evidence");
  check(partialResult.resourceUsage.modelCalls === 9 && requests.length === 9,
    "partial-party scheduling avoids the two invalid call reservations within the same ceiling");
  const partialAssurance = assureResearchParty({ objective: objective(), limits: partialLimits, result: partialResult,
    groundTruth: { taskId: objective().researchId, expectedMechanismId: "FAILED_AS_COMPLETE",
      oracleDigest: theoryDigest("partial-party-independent-oracle"), oracleProvenanceRoot: "PARTIAL-PARTY-ORACLE",
      hiddenFromCognition: true } });
  check(partialAssurance.decision === "ACCEPT" && partialResult.resourceUsage.experiments === 3,
    "two valid hypotheses still require all oracle evidence and unchanged independent acceptance");
  check(!partialResult.authorityGranted && partialResult.evidenceChainComplete,
    "partial-party recovery cannot grant authority or omit evidence");
  check(partialResult.cognitionOutcomes?.filter(item => item.outcomeClass === "PROVIDER_FAILURE").length
    === (blankMode === "FAILED" ? 1 : 0), "provider failure and honest abstention remain separate");
}
check(researchCognitionOutcomeClass(hostile) === "MODEL_OUTPUT_REJECTION",
  "HTTP-200 schema rejection is not classified as provider unavailability");
check(researchCognitionOutcomeClass(truncated) === "OUTPUT_TRUNCATION",
  "truncated output is distinct from invalid schema and functional reasoning failure");
check(researchCognitionOutcomeClass(forgedFeedback) === "INTEGRATION_REJECTION",
  "a local authority/evidence rejection with no HTTP status is not a provider failure");

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

// Allocation is a bounded, reproducible scheduling hint, never a hidden answer.
const cohortIds = [adapterRequest.theoryId, "adapter:theory:1", "adapter:theory:2"];
const allocationInput = { objective: adapterRequest.objective, cohortTheoryIds: cohortIds,
  contributions: [], observations: [], phaseOrdinal: 0, policy: "COVERAGE_AWARE" as const };
const allocation = allocateHypothesisCoverage(allocationInput);
check(allocation.length === 3 && new Set(allocation.flatMap(item => item.preferredMechanismIds)).size === 4,
  "every catalogued alternative is allocated without materializing extra entities or model calls");
check(allocation.every(item => item.grantsAuthority === false
  && item.interpretation === "EXPLORATION_GUIDANCE_NOT_EVIDENCE"), "allocation has no evidence or authority status");
check(theoryDigest(allocation) === theoryDigest(allocateHypothesisCoverage(allocationInput)),
  "coverage allocation is deterministic and independent of model confidence");
check(Object.isFrozen(allocation) && Object.isFrozen(allocation[0].preferredMechanismIds),
  "allocation and nested exploration scope are immutable");
const allocatedRequest = { ...adapterRequest, hypothesisAllocation: allocation[0] };
check(validHypothesisAllocation(allocatedRequest), "request-bound allocation recomputes from independent initial context");
for (const mutation of [
  { theoryId: cohortIds[1] }, { contextDigest: "a".repeat(64) }, { objectiveDigest: "b".repeat(64) },
  { preferredMechanismIds: ["INVENTED"] }, { grantsAuthority: true }, { policy: "MAGIC" },
  { phaseOrdinal: 1 }, { observedExperimentIds: ["EXP-A-FAILED"] },
  { cohortTheoryIds: [cohortIds[0], cohortIds[0]] }, { rankedMechanismIds: [...allocation[0].rankedMechanismIds].reverse() },
]) {
  const malformed = { ...allocatedRequest, hypothesisAllocation: { ...allocation[0], ...mutation } } as TheoryCognitionRequest;
  const before = modelPrompts.length;
  const rejected = await adapter.think(malformed);
  check(rejected.decision === "REJECTED" && rejected.diagnostics.includes("hypothesis_allocation_invalid")
    && modelPrompts.length === before, "tampered allocation is rejected before provider dispatch");
}
responseContent = JSON.stringify(validRaw); responseFinishReason = "stop";
const guided = await adapter.think(allocatedRequest);
check(guided.decision === "CONTRIBUTION" && modelPrompts.at(-1)?.hypothesisAllocation !== undefined,
  "Nemotron receives structured allocation while retaining the original intent/parser contract");
check(guided.intent?.mechanismId === validRaw.mechanismId,
  "valid alternatives remain admissible; exploration guidance cannot override acceptance or force an answer");
check(modelPrompts.at(-1)?.derivationInstruction === undefined,
  "legacy cognition prompts remain unchanged unless the derivation control is explicitly enabled");
const controlConfig = { cognitionId: "NYX-DERIVATION-CONTROL", provider, limits, derivationChecks: true };
const controlledAdapter = NyxNemotronTheoryCognition.create(controlConfig);
controlConfig.derivationChecks = false;
const controlPlain = await controlledAdapter.think(adapterRequest);
const plainPrompt = modelPrompts.at(-1)!;
const controlAllocated = await controlledAdapter.think(allocatedRequest);
const allocatedPrompt = modelPrompts.at(-1)!;
check(plainPrompt.derivationInstruction === NYX_DERIVATION_CHECK_INSTRUCTION
  && allocatedPrompt.derivationInstruction === plainPrompt.derivationInstruction,
"both ablation arms receive byte-identical derivation guidance from an immutable configuration snapshot");
const { hypothesisAllocation: ignoredAllocation, allocationInstruction: ignoredInstruction, ...sharedPrompt } = allocatedPrompt;
check(theoryDigest(sharedPrompt) === theoryDigest(plainPrompt) && ignoredAllocation !== undefined
  && typeof ignoredInstruction === "string" && !ignoredInstruction.includes("Recheck arithmetic"),
"coverage ablation changes only explicit allocation fields, not the remaining task, evidence or derivation prompt");
check(controlPlain.decision === "CONTRIBUTION" && controlAllocated.decision === "CONTRIBUTION"
  && controlPlain.grantsAuthority === false && controlAllocated.grantsAuthority === false
  && controlPlain.evidence.totalTokens === controlAllocated.evidence.totalTokens
  && requestedOutputBudgets.at(-1) === requestedOutputBudgets.at(-2),
"controlled guidance retains the unchanged strict intent parser, model budget, and authority boundary");
await rejects(() => NyxNemotronTheoryCognition.create({ ...controlConfig, derivationChecks: "true" as unknown as boolean }),
  /configuration_invalid/, "malformed derivation configuration cannot silently enable a treatment");
for (const invalid of [
  { cohortTheoryIds: [cohortIds[0]] }, { phaseOrdinal: -1 }, { phaseOrdinal: 65 },
  { phaseOrdinal: Number.NaN }, { policy: "MAGIC" }, { contributions: [directContribution] },
]) {
  await rejects(() => allocateHypothesisCoverage({ ...allocationInput, ...invalid } as typeof allocationInput),
    /hypothesis_allocation_/, "malformed, unbounded or contaminated initial allocations fail closed");
}
const duplicated = [0, 1, 2].map((index) => ({ ...directContribution,
  objectiveDigest: researchObjectiveDigest(adapterRequest.objective),
  theoryId: cohortIds[index], contributionId: `DUPLICATE-${index}` }));
const revisedAllocation = allocateHypothesisCoverage({ ...allocationInput, contributions: duplicated,
  observations: [makeObservation("EXP-A-FAILED")], phaseOrdinal: 1 });
check(revisedAllocation.every(item => item.rankedMechanismIds.at(-1) === directIntent.mechanismId),
  "three duplicate conjectures shift exploration toward unrepresented alternatives");
check(revisedAllocation.every(item => item.rankedMechanismIds.includes(directIntent.mechanismId)),
  "a forecast mismatch never blacklists its mechanism or deletes evidence");
check(allocateHypothesisCoverage({ ...allocationInput, contributions: duplicated.map(item => ({ ...item,
  intent: { ...item.intent, modelEstimate: 0 } })), observations: [makeObservation("EXP-A-FAILED")],
  phaseOrdinal: 1 }).every((item, index) => theoryDigest(item) === theoryDigest(revisedAllocation[index])),
"uncalibrated confidence cannot alter coverage scheduling or its context binding");
const overSubscribed = allocateHypothesisCoverage({ ...allocationInput, cohortTheoryIds: Array.from({ length: 6 },
  (_, index) => `oversubscribed:${index}`) });
check(overSubscribed.every(item => item.preferredMechanismIds.length > 0),
  "more investigators than hypotheses yields explicit bounded reuse, not a false diversity claim");
// Field names are diagnostic metadata; malformed values and raw reasoning are not.
for (const [field, value, diagnostic] of [
  ["schemaVersion", 2, "schema_version"], ["decision", "INVALID", "decision"],
  ["thesis", " ", "thesis"], ["evidenceRefs", ["E-SOURCE", "E-SOURCE"], "evidence_refs"],
  ["assumptions", [""], "assumptions"], ["uncertainties", Array(17).fill("x"), "uncertainties"],
  ["requestedExperimentIds", "invalid-array", "requested_experiment_ids"],
  ["modelEstimate", 80, "model_estimate"], ["modelEstimate", -1, "model_estimate"],
] as const) {
  responseContent = JSON.stringify({ ...validRaw, [field]: value });
  const result = await adapter.think({ ...adapterRequest, requestId: `ADAPTER-SCALAR-${field}` });
  check(result.decision === "COGNITION_ERROR" && result.intent === null
    && result.diagnostics.includes("intent_scalar_invalid")
    && result.diagnostics.includes(`intent_scalar_${diagnostic}_invalid`),
  "strict scalar rejection identifies the affected field without substituting or coercing a value");
  check(result.diagnostics.every(item => /^[a-z_]+$/.test(item)) && !result.grantsAuthority,
    "diagnostics contain only bounded contract codes, not raw content or execution authority");
}
for (const modelEstimate of [0, 1, null]) {
  responseContent = JSON.stringify({ ...validRaw, modelEstimate });
  check((await adapter.think(adapterRequest)).decision === "CONTRIBUTION",
    "scalar diagnostics preserve the exact previously allowed confidence endpoints and abstention");
}
const scalarRules = (modelPrompts.at(-1)!.outputContract as Record<string, unknown>).scalarRules as {
  thesis: { maxCharacters: number }; modelEstimate: { minimum: number; maximum: number };
  stringLists: { assumptions: number; uncertainties: number }; maxCharactersPerStringListItem: number };
check(scalarRules.thesis.maxCharacters === NYX_THEORY_INTENT_JSON_SCHEMA.properties.thesis.maxLength
  && scalarRules.modelEstimate.minimum === NYX_THEORY_INTENT_JSON_SCHEMA.properties.modelEstimate.anyOf[0].minimum
  && scalarRules.modelEstimate.maximum === NYX_THEORY_INTENT_JSON_SCHEMA.properties.modelEstimate.anyOf[0].maximum
  && scalarRules.stringLists.assumptions === NYX_THEORY_INTENT_JSON_SCHEMA.properties.assumptions.maxItems
  && scalarRules.stringLists.uncertainties === NYX_THEORY_INTENT_JSON_SCHEMA.properties.uncertainties.maxItems
  && scalarRules.maxCharactersPerStringListItem === NYX_THEORY_INTENT_JSON_SCHEMA.properties.uncertainties.items.maxLength,
"advertised scalar bounds match the unchanged local admission schema");
responseContent = JSON.stringify(validRaw);
for (const attempts of [1, 2]) {
  const accountingRuntime = network(); const scriptedAccounting = new ScriptedPartyCognition();
  const accountingCognition: TheoryCognitionEngine = {
    profile: () => scriptedAccounting.profile(), think: async request => {
      const result = await scriptedAccounting.think(request);
      return { ...result, evidence: { ...result.evidence, delivery: { policy: "nvidia-capacity/1",
        requestsPerMinute: 40, scope: "PROCESS_LOCAL_FIXED_NVIDIA_ENDPOINT", httpAttempts: attempts,
        transientUnavailableResponses: attempts - 1, rateLimitedResponses: 0, timedOutAttempts: 0,
        capacityWaitMs: 0, state: "DELIVERED", notBeforeEpochMs: null, authorityRenewed: false } } };
    } };
  const result = await TheoryResearchParty.create({ partyId: `PARTY-ATTEMPT-USAGE-${attempts}`,
    network: accountingRuntime.value, coordinator: accountingRuntime.coordinator, cognition: accountingCognition,
    limits, investigatorCount: 3, now: () => now,
    experiments: { run: async experiment => makeObservation(experiment.experimentId) } }).investigate(objective());
  const flat = await runFlatTheoryBaseline({ baselineId: `FLAT-ATTEMPT-USAGE-${attempts}`,
    cognition: accountingCognition, objective: objective(), limits, now: () => now });
  check((attempts === 1 ? result.resourceUsage.totalTokens !== null : result.resourceUsage.totalTokens === null)
    && (attempts === 1 ? flat.resourceUsage.totalTokens !== null : flat.resourceUsage.totalTokens === null),
  "successful retry usage is incomplete in both arms, rather than a false exact compute match");
  check(result.cognitionEvidence.every(item => item.totalTokens === 200)
    && result.cognitionEvidence.every(item => item.delivery?.httpAttempts === attempts),
  "final-attempt usage and transport attempts remain available for descriptive lower bounds");
}
// A live delivery crossed the activation lifetime after its pre-dispatch check.
// Reproduce independently of task content, transport speed, or hidden answers.
for (const mode of ["LEASE_EXPIRED", "LEASE_RETIRED", "CANCELLED", "OBJECTIVE_EXPIRED"] as const) {
  const savedNow = now; const delayedRuntime = network(); const controller = new AbortController();
  const scripted = new ScriptedPartyCognition(); const requests: TheoryCognitionRequest[] = [];
  const delayed: TheoryCognitionEngine = { profile: () => scripted.profile(), think: async request => {
    requests.push(request); const response = await scripted.think(request);
    if (mode === "LEASE_EXPIRED") now = request.deadlineEpochMs!;
    if (mode === "LEASE_RETIRED") delayedRuntime.value.retire(delayedRuntime.coordinator, request.theoryId);
    if (mode === "CANCELLED") controller.abort();
    if (mode === "OBJECTIVE_EXPIRED") now = 100_000;
    return response;
  } };
  const delayedResult = await TheoryResearchParty.create({ partyId: `PARTY-LATE-${mode}`,
    network: delayedRuntime.value, coordinator: delayedRuntime.coordinator, cognition: delayed,
    limits, investigatorCount: 3, maxParallelModelExecutions: 1, now: () => now,
    experiments: { run: async experiment => makeObservation(experiment.experimentId) } })
    .investigate(objective(), controller.signal);
  check(requests.length === 1 && requests[0].deadlineEpochMs === savedNow + 60_000,
    "cognition deadline is narrowed to the existing lease, never a renewed party lifetime");
  check(delayedResult.decision.state === "BLOCKED" && delayedResult.contributions.length === 0
    && delayedResult.observations.length === 0 && !delayedResult.evidenceChainComplete,
  "late, retired, or cancelled cognition cannot partially enter the evidence graph");
  check(delayedResult.decision.reason === (mode === "CANCELLED" ? "research_party_cancelled"
    : mode === "OBJECTIVE_EXPIRED" ? "research_party_time_budget_exhausted"
    : "research_party_entity_lease_invalid_after_cognition"),
  "lease expiry, cancellation and objective expiry remain explicit rather than a generic precommit failure");
  check(delayedResult.cognitionEvidence.length === 1 && delayedResult.resourceUsage.modelCalls === 1
    && delayedResult.resourceUsage.totalTokens === 200 && !delayedResult.authorityGranted,
  "discarded late cognition still retains delivery evidence and actual resource accounting");
  check(delayedRuntime.value.metrics().activePairs === 0,
    "late-result rejection releases all owned activations without renewing them");
  now = savedNow;
}
for (const wallClockMs of [10_000, 120_000]) {
  const savedNow = now; const timelyRuntime = network(); const scripted = new ScriptedPartyCognition();
  const expectedDeadline = Math.min(savedNow + wallClockMs, savedNow + 60_000, 100_000);
  const requests: TheoryCognitionRequest[] = []; const stableObjective = objective();
  const timely: TheoryCognitionEngine = { profile: () => scripted.profile(), think: async request => {
    requests.push(request); now = expectedDeadline - 1; return scripted.think(request);
  } };
  const timelyLimits = { ...limits, maxWallClockMs: wallClockMs };
  const timelyResult = await TheoryResearchParty.create({ partyId: `PARTY-TIMELY-${wallClockMs}`,
    network: timelyRuntime.value, coordinator: timelyRuntime.coordinator, cognition: timely,
    limits: timelyLimits, investigatorCount: 3, maxParallelModelExecutions: 1, now: () => now,
    experiments: { run: async experiment => makeObservation(experiment.experimentId) } }).investigate(stableObjective);
  check(requests.length > 1 && requests.every(request => request.deadlineEpochMs === expectedDeadline),
    "the earliest party or lease deadline binds every call without silently widening it");
  check(assureResearchParty({ objective: stableObjective, limits: timelyLimits, result: timelyResult,
    groundTruth: { taskId: stableObjective.researchId, expectedMechanismId: "FAILED_AS_COMPLETE",
      oracleDigest: theoryDigest("timely-response-oracle"), oracleProvenanceRoot: "TIMELY-ORACLE",
      hiddenFromCognition: true } }).decision === "ACCEPT" && timelyResult.evidenceChainComplete,
  "valid responses strictly before expiry still require and pass the unchanged independent oracle");
  check(timelyRuntime.value.metrics().activePairs === 0 && !timelyResult.authorityGranted,
    "timely acceptance cannot renew leases or retain active authority after termination");
  now = savedNow;
}
for (const lateRole of ["FALSIFIER", "REVISER", "META_REVIEWER"] as const) {
  const savedNow = now; const runtime = network(); const scripted = new ScriptedPartyCognition();
  const originalObjective = objective();
  const cognition: TheoryCognitionEngine = { profile: () => scripted.profile(), think: async request => {
    const response = await scripted.think(request);
    if (request.role === lateRole) now = request.deadlineEpochMs!;
    return response;
  } };
  const result = await TheoryResearchParty.create({ partyId: `PARTY-LATE-ROLE-${lateRole}`,
    network: runtime.value, coordinator: runtime.coordinator, cognition, limits,
    investigatorCount: 3, maxParallelModelExecutions: 1, now: () => now,
    experiments: { run: async experiment => makeObservation(experiment.experimentId) } }).investigate(originalObjective);
  check(result.decision.state === "BLOCKED"
    && result.decision.reason === "research_party_entity_lease_invalid_after_cognition"
    && !result.contributions.some(item => item.role === lateRole),
  "post-delivery ownership applies to challenge, revision and no-conclusion review, not just forecasts");
  check(result.cognitionOutcomes?.at(-1)?.role === lateRole
    && result.cognitionEvidence.length === result.contributions.length + 1,
  "rejected late-role delivery remains attributable without deleting previously committed contributions");
  check(assureResearchParty({ objective: originalObjective, limits, result,
    groundTruth: { taskId: originalObjective.researchId, expectedMechanismId: "FAILED_AS_COMPLETE",
      oracleDigest: theoryDigest("late-role-oracle"), oracleProvenanceRoot: "LATE-ROLE-ORACLE",
      hiddenFromCognition: true } }).decision === "REJECT"
    && runtime.value.metrics().activePairs === 0 && !result.authorityGranted,
  "an otherwise correct mechanism cannot override a failed ownership/evidence-chain requirement");
  now = savedNow;
}
// Regression: locally valid output must also fit the downstream prediction
// contract. No truncation/coercion of a model's uncertainty is permitted.
for (const field of ["assumptions", "uncertainties"] as const) {
  responseContent = JSON.stringify({ ...validRaw, [field]: Array.from({ length: 11 }, (_, i) => `bounded-item-${i}`) });
  const rejected = await adapter.think(adapterRequest);
  check(rejected.intent === null && rejected.diagnostics.includes(`intent_scalar_${field}_invalid`),
    "generation admission rejects lists that cannot be precommitted by the theory network");
}
responseContent = JSON.stringify(validRaw);
for (const [value, code] of [[null, "type_invalid"], [" \t", "blank"], ["x".repeat(2_001), "bound_exceeded"]] as const) {
  responseContent = JSON.stringify({ ...noConclusion, thesis: value });
  const rejected = await adapter.think({ ...adapterRequest, role: "META_REVIEWER" });
  check(rejected.intent === null && rejected.diagnostics.includes(`intent_scalar_thesis_${code}`),
    "abstention rejects invalid thesis values with precise sanitized diagnosis, not fabricated replacement text");
  check(!JSON.stringify(rejected.diagnostics).includes("xxx"), "diagnosis never returns rejected model content");
}
for (const count of [20, 21]) {
  const supplied = Array.from({ length: count }, (_, index) => evidence(`REF-${index}`, "SOURCE", `Source ${index}`));
  const currentObjective = { ...objective(), admittedEvidence: supplied };
  responseContent = JSON.stringify({ ...validRaw, evidenceRefs: supplied.map(item => item.evidenceId),
    assumptions: Array.from({ length: 10 }, (_, index) => `Assumption ${index}`),
    uncertainties: Array.from({ length: 10 }, (_, index) => `Uncertainty ${index}`) });
  const parsed = await adapter.think({ ...adapterRequest, objective: currentObjective });
  check((parsed.intent !== null) === (count === 20),
    "exact custody list endpoints are admitted; one excess item is rejected without truncation");
}
responseContent = JSON.stringify(validRaw);
const undersizedRuntime = network(1);
const undersized = await TheoryResearchParty.create({ partyId: "PARTY-PREFLIGHT-BUDGET",
  network: undersizedRuntime.value, coordinator: undersizedRuntime.coordinator,
  cognition: new ScriptedPartyCognition(), experiments: { run: async item => makeObservation(item.experimentId) },
  limits, investigatorCount: 3, maxParallelModelExecutions: 1, now: () => now }).investigate(objective());
check(undersized.decision.reason === "research_party_prediction_not_precommitted"
  && undersized.contributions.length === 0 && undersized.observations.length === 0,
"forecast batch exceeding custody capacity is rejected before partial graph admission or experimentation");
check(undersized.resourceUsage.modelCalls === 1 && undersizedRuntime.value.metrics().activePairs === 0,
  "preflight preserves spent compute and releases leases on rejection");
const longExperimentId = "PROBE-" + "a".repeat(194);
const longObjective = { ...objective(), experimentCatalog: [{ ...objective().experimentCatalog[0],
  experimentId: longExperimentId }] };
check(validResearchObjective(longObjective, now), "maximal legal experiment identity remains supported");
const longRuntime = network(); let longCalls = 0;
const longCognition: TheoryCognitionEngine = { profile: () => ({ model: "identity-test-double" }), think: async request => {
  longCalls++;
  const conclusion = { ...noConclusion, evidenceRefs: ["E-SOURCE"], counterexamples: [] } as TheoryCognitionIntent;
  const intent = request.role === "INVESTIGATOR" ? { ...validRaw,
    mechanismId: longCalls === 1 ? "FAILED_AS_COMPLETE" : "STRICT",
    forecasts: [{ experimentId: longExperimentId, expectedOutcome: longCalls === 1 ? "DISPATCHED" : "BLOCKED",
      rationale: "Independent terminal-state prediction." }], requestedExperimentIds: [longExperimentId],
    assumptions: Array.from({ length: 10 }, (_, i) => `Assumption ${i}`),
    uncertainties: Array.from({ length: 10 }, (_, i) => `Uncertainty ${i}`) } as TheoryCognitionIntent : conclusion;
  return cognitionResult(request, intent);
} };
const longResult = await TheoryResearchParty.create({ partyId: "PARTY-LONG-IDENTITY",
  network: longRuntime.value, coordinator: longRuntime.coordinator, cognition: longCognition,
  limits, investigatorCount: 2, maxParallelModelExecutions: 1, now: () => now,
  experiments: { run: async () => {
    const executionIdentity = "EXEC-LONG"; const outputDigest = theoryDigest("DISPATCHED");
    const experiment = longObjective.experimentCatalog[0]; const outcome = "DISPATCHED";
    const content = { experimentId: longExperimentId, toolId: experiment.toolId, outcome, executionIdentity, outputDigest };
    return { ...makeObservation("EXP-A-FAILED"), experimentId: longExperimentId, observationId: "OBS-LONG",
      executionIdentity, outputDigest, evidence: { ...makeObservation("EXP-A-FAILED").evidence,
        contentDigest: theoryDigest(content) } };
  } } }).investigate(longObjective);
check(longResult.decision.state === "SUPPORTED_WITHIN_MODELED_FAMILY" && longResult.observations.length === 1,
  "maximal experiment identities and list bounds survive the complete graph/network/observation loop");
const contributionId = longResult.contributions[0].contributionId;
check(researchPredictionId(contributionId, longExperimentId).length <= 200
  && researchPredictionId(contributionId, longExperimentId) !== researchPredictionId(contributionId, longExperimentId.slice(0, -1))
  && researchPredictionId("CONTRIBUTION-DIRECT", "EXP-A") === "CONTRIBUTION-DIRECT-EXP-A",
"bounded composite identities retain binding and preserve historical short identities");
for (const statusCode of [503, 200]) {
  const runtime = network(); const scripted = new ScriptedPartyCognition(); let calls = 0;
  const cognition: TheoryCognitionEngine = { profile: () => scripted.profile(), think: async request => {
    const result = await scripted.think(request);
    if (++calls !== 1) return result;
    return { ...result, decision: "COGNITION_ERROR", intent: null,
      reason: statusCode === 503 ? "nvidia_nim_http_failure" : "theory_cognition_schema_invalid",
      diagnostics: statusCode === 200 ? ["intent_scalar_thesis_blank"] : [],
      evidence: { ...result.evidence, evidenceClass: "E4", statusCode,
        promptTokens: null, completionTokens: null, totalTokens: null } };
  } };
  const result = await TheoryResearchParty.create({ partyId: `PARTY-DELIVERY-STOP-${statusCode}`,
    network: runtime.value, coordinator: runtime.coordinator, cognition, limits, investigatorCount: 3,
    maxParallelModelExecutions: 1, stopOnProviderFailure: true, now: () => now,
    experiments: { run: async item => makeObservation(item.experimentId) } }).investigate(objective());
  check(statusCode === 503 ? result.resourceUsage.modelCalls === 1
    && result.decision.reason === "research_party_provider_unavailable" : result.resourceUsage.modelCalls > 1
    && result.decision.reason !== "research_party_provider_unavailable",
  "exhausted delivery halts the epoch, but valid HTTP model/schema failure is not misclassified as a provider outage");
  check(result.resourceUsage.totalTokens === null && runtime.value.metrics().activePairs === 0,
    "unknown provider consumption stays unknown and every stopped activation is released");
}
const longRationaleRuntime = network(); const longRationaleScripted = new ScriptedPartyCognition();
let longRationaleInvestigators = 0;
const longRationaleCognition: TheoryCognitionEngine = { profile: () => longRationaleScripted.profile(), think: async request => {
  const response = await longRationaleScripted.think(request);
  if (request.role === "INVESTIGATOR") return cognitionResult(request,
    intentFor(["STRICT", "PENDING_AS_COMPLETE", "CANCELLED_AS_COMPLETE"][longRationaleInvestigators++],
      "PROPOSE_HYPOTHESIS", request.theoryId));
  if (request.role === "REVISER") return cognitionResult(request, { ...response.intent!, counterexamples: [{
    targetTheoryId: request.peerContributions.find(item => item.intent.mechanismId !== null)!.theoryId,
    experimentId: "EXP-A-FAILED", disconfirmingOutcome: "DISPATCHED", rationale: "x".repeat(1_000),
  }] });
  return response;
} };
const longRationaleResult = await TheoryResearchParty.create({ partyId: "PARTY-COUNTEREXAMPLE-REFERENCE",
  network: longRationaleRuntime.value, coordinator: longRationaleRuntime.coordinator, cognition: longRationaleCognition,
  limits, investigatorCount: 3, maxParallelModelExecutions: 1, now: () => now,
  experiments: { run: async item => makeObservation(item.experimentId) } }).investigate(objective());
check(longRationaleResult.decision.state === "SUPPORTED_WITHIN_MODELED_FAMILY"
  && longRationaleResult.contributions.some(item => item.role === "REVISER"
    && item.intent.counterexamples[0].rationale.length === 1_000),
"long legal counterexample rationale survives revision intact while prediction custody uses a bounded digest reference");
check(longRationaleResult.evidenceChainComplete && longRationaleRuntime.value.metrics().activePairs === 0,
  "counterexample references preserve provenance and lease termination without granting authority");
const malformedOwn = { ...directContribution, theoryId: adapterRequest.theoryId, contributionId: "invalid id" };
const malformedObservation = makeObservation("EXP-A-FAILED");
const malformedFeedbackRequest: TheoryCognitionRequest = { ...adapterRequest, role: "REVISER",
  privatePriorContributions: [malformedOwn], experimentObservations: [malformedObservation], predictionFeedback: [{
    contributionId: malformedOwn.contributionId, predictionId: "IGNORED", experimentId: "EXP-A-FAILED",
    expectedOutcome: "DISPATCHED", observedOutcome: "DISPATCHED", observationId: malformedObservation.observationId,
    evidenceId: malformedObservation.evidence.evidenceId, evidenceClass: "E3", disposition: "SUPPORTED_WITHIN_TEST_SCOPE",
    grantsAuthority: false,
  }] };
const callsBeforeMalformed = modelPrompts.length;
const rejectedMalformedFeedback = await adapter.think(malformedFeedbackRequest);
check(rejectedMalformedFeedback.decision === "REJECTED" && rejectedMalformedFeedback.intent === null
  && rejectedMalformedFeedback.diagnostics.includes("prediction_feedback_invalid") && modelPrompts.length === callsBeforeMalformed,
"malformed lineage identities fail closed with a diagnostic before inference, rather than throwing during feedback reconstruction");
const droppedRuntime = network(); let droppedInitial = 0;
const droppedRequests: TheoryCognitionRequest[] = [];
const droppedScripted = new ScriptedPartyCognition();
const droppedCognition: TheoryCognitionEngine = { profile: () => droppedScripted.profile(), think: async request => {
  droppedRequests.push(request);
  if (request.role === "INVESTIGATOR") {
    if (droppedInitial++ === 0) return { ...cognitionResult(request, validRaw as TheoryCognitionIntent),
      decision: "COGNITION_ERROR", intent: null, reason: "theory_cognition_incomplete_output",
      diagnostics: ["finish_reason_not_stop"], evidence: { ...cognitionResult(request, validRaw as TheoryCognitionIntent).evidence,
        finishReason: "length" } };
    return cognitionResult(request, intentFor(droppedInitial === 2 ? "STRICT" : "PENDING_AS_COMPLETE",
      "PROPOSE_HYPOTHESIS", request.theoryId));
  }
  if (request.role === "REVISER") return cognitionResult(request,
    intentFor(request.hypothesisAllocation!.preferredMechanismIds[0], "REVISE_HYPOTHESIS",
      request.theoryId, request.experimentObservations));
  return droppedScripted.think(request);
} };
const droppedResult = await TheoryResearchParty.create({ partyId: "PARTY-REASSIGN-DROPPED-SLOT",
  network: droppedRuntime.value, coordinator: droppedRuntime.coordinator, cognition: droppedCognition,
  limits, investigatorCount: 3, maxParallelModelExecutions: 1, hypothesisAllocationPolicy: "ROTATING_PARTITION",
  experimentPolicy: "EXHAUST_PRECOMMITTED_FORECASTS", now: () => now,
  experiments: { run: async item => makeObservation(item.experimentId) } }).investigate(objective());
const activeRevisionRequests = droppedRequests.filter(request => request.role === "REVISER");
check(activeRevisionRequests.length === 2 && activeRevisionRequests.every(request =>
  request.hypothesisAllocation?.cohortTheoryIds.length === 2 && validHypothesisAllocation(request)),
"repair partitions are bound to actual eligible revisers, not silent or failed logical slots");
check(new Set(activeRevisionRequests.flatMap(request => request.hypothesisAllocation!.preferredMechanismIds)).size
  === objective().mechanismCatalog.length,
"every mechanism retains an active exploration owner after one investigator loses its output");
check(droppedRequests.every(request => Object.isFrozen(request) && Object.isFrozen(request.experimentObservations))
  && activeRevisionRequests.every(request => request.experimentObservations.length < droppedResult.observations.length),
"each cognition request preserves its immutable historical view when later experiments add observations");
check(assureResearchParty({ objective: objective(), limits, result: droppedResult, groundTruth: {
  taskId: objective().researchId, expectedMechanismId: "FAILED_AS_COMPLETE", oracleDigest: theoryDigest("dropped-slot-oracle"),
  oracleProvenanceRoot: "DROPPED-SLOT-ORACLE", hiddenFromCognition: true } }).decision === "ACCEPT"
  && droppedResult.resourceUsage.modelCalls === 7 && !droppedResult.authorityGranted,
"missing-slot correction can recover a simulated interface failure without extra calls, oracle access or weakened acceptance");
const singleReviserAllocation = allocateHypothesisCoverage({ ...allocationInput, cohortTheoryIds: [cohortIds[0]],
  contributions: [duplicated[0]], observations: [makeObservation("EXP-A-FAILED")], phaseOrdinal: 1 });
check(singleReviserAllocation.length === 1 && singleReviserAllocation[0].preferredMechanismIds.length === 4,
  "a single remaining eligible reviser retains coverage without pretending to be two independent reasoners");
console.log(`OMEGA_RESEARCH_PARTY_TEST_SUMMARY passed: ${checks}, failed: 0`);
