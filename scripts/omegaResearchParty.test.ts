import { NvidiaNimProvider } from "../src/lib/codelab/model/nvidiaNimProvider";
import { runFlatTheoryBaseline } from "../src/lib/codelab/research/flatTheoryBaseline";
import { NyxNemotronTheoryCognition } from "../src/lib/codelab/research/nyxNemotronTheoryCognition";
import { assureResearchParty } from "../src/lib/codelab/research/researchPartyAssurance";
import { immutableResearchValue, researchObjectiveDigest, validResearchLimits, validResearchObjective,
  type ResearchExperimentObservation, type ResearchPartyLimits, type ResearchPartyObjective,
  type TheoryCognitionIntent, type TheoryCognitionRequest, type TheoryCognitionResult,
  type TheoryContribution } from "../src/lib/codelab/research/researchPartyContracts";
import { ResearchEvidenceGraph } from "../src/lib/codelab/research/researchEvidenceGraph";
import { TheoryNetwork } from "../src/lib/codelab/research/theoryNetwork";
import { immutableTheoryValue, theoryDigest } from "../src/lib/codelab/research/theoryContracts";
import { TheoryResearchParty, type TheoryCognitionEngine } from "../src/lib/codelab/research/theoryResearchParty";

let checks = 0;
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
  checks += 1;
}
async function rejects(action: () => unknown | Promise<unknown>, pattern: RegExp, message: string): Promise<void> {
  try { await action(); throw new Error("expected_rejection_missing"); }
  catch (error) { check(pattern.test(String(error)), message); }
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
