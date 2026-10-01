import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { assureResearchParty } from "../src/lib/codelab/research/researchPartyAssurance";
import { immutableResearchValue, type ResearchExperimentObservation, type ResearchPartyLimits,
  type ResearchPartyObjective, type TheoryCognitionIntent, type TheoryCognitionRequest,
  type TheoryCognitionResult, type TheoryContribution } from "../src/lib/codelab/research/researchPartyContracts";
import { ResearchEvidenceGraph } from "../src/lib/codelab/research/researchEvidenceGraph";
import { TheoryNetwork } from "../src/lib/codelab/research/theoryNetwork";
import { theoryDigest } from "../src/lib/codelab/research/theoryContracts";
import { TheoryResearchParty, type TheoryCognitionEngine,
  type TheoryResearchPartyConfig } from "../src/lib/codelab/research/theoryResearchParty";
import { validHypothesisAllocation } from "../src/lib/codelab/research/hypothesisCoverage";

let checks = 0;
function check(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(label);
  checks += 1;
}

const CANDIDATE = "c".repeat(40);
const NOW = 1_000;
const LIMITS: ResearchPartyLimits = Object.freeze({ maxEntities: 5, maxModelCalls: 11,
  maxExperiments: 3, maxEvidenceItems: 64, maxWallClockMs: 120_000,
  maxPromptBytesPerCall: 64_000, maxOutputTokensPerCall: 512,
  maxTotalOutputTokens: 5_632, maxCostUnits: 3 });
type Policy = NonNullable<TheoryResearchPartyConfig["experimentPolicy"]>;
type Mode = "HEALTHY" | "REVISER_PROVIDER_FAILURE" | "INCOMPLETE_FORECASTS" | "DUPLICATE_SELECTION";
type Table = readonly (readonly string[])[];

// New finite tables, not the scheduler/cache/retry live fixtures. The expected
// mechanism is private to the runner/oracle; cognition sees predictions only.
function objective(table: Table, caseId: string): ResearchPartyObjective {
  return immutableResearchValue({ schemaVersion: 1, researchId: caseId,
    objective: "Identify the one bounded mechanism surviving exact controlled measurements.",
    domain: "SCIENCE", candidateBinding: CANDIDATE, scope: ["probe.ts"],
    mechanismCatalog: table.map((row, index) => ({ mechanismId: `MECHANISM-${index}`,
      description: `Exact deterministic predictions: ${row.join(",")}.` })),
    admittedEvidence: [{ evidenceId: "E-SOURCE", evidenceClass: "E3", kind: "SOURCE",
      summary: "The finite prediction table is available; its hidden active row is not.",
      contentDigest: theoryDigest(table), provenanceRoot: "TABLE-SOURCE",
      freshnessDependencies: [`CANDIDATE:${CANDIDATE}`], observedAtEpochMs: NOW,
      candidateBinding: CANDIDATE, grantsAuthority: false }],
    experimentCatalog: table[0].map((_, index) => ({ experimentId: `EXP-${index}`,
      toolId: `PROBE-${index}`, question: `Measure the exact outcome of probe ${index}.`,
      possibleOutcomes: [...new Set(["ZERO", "ONE", ...table.flat()])], costUnits: 1, authority: "RUN_TEST_IN_SANDBOX",
      scope: ["probe.ts"], mutatesCandidate: false })),
    successCriteria: ["An external oracle accepts a uniquely supported mechanism, not model votes."],
    expiryEpochMs: 100_000 });
}

function hypothesis(request: TheoryCognitionRequest, table: Table, row: number,
  partial = false): TheoryCognitionIntent {
  const unobserved = request.objective.experimentCatalog.filter((experiment) =>
    !request.experimentObservations.some((item) => item.experimentId === experiment.experimentId));
  const selected = partial && request.role === "INVESTIGATOR" ? unobserved.slice(0, 1) : unobserved;
  return immutableResearchValue({ schemaVersion: 1,
    decision: request.role === "REVISER" ? "REVISE_HYPOTHESIS" : "PROPOSE_HYPOTHESIS",
    thesis: "A tentative, falsifiable row of the explicit prediction table.",
    mechanismId: `MECHANISM-${row}`, causalMechanism: request.objective.mechanismCatalog[row].description,
    evidenceRefs: ["E-SOURCE", ...request.experimentObservations.map((item) => item.evidence.evidenceId)],
    assumptions: ["These are exact, deterministic predictions within a finite modeled family."],
    uncertainties: ["The finite family may omit the actual mechanism."],
    forecasts: selected.map((experiment) => ({ experimentId: experiment.experimentId,
      expectedOutcome: table[row][Number(experiment.experimentId.split("-")[1])],
      rationale: "The public table predicts this outcome before its measurement." })),
    counterexamples: [], requestedExperimentIds: selected.map((item) => item.experimentId),
    revisionOfTheoryId: request.role === "REVISER" ? request.theoryId : null,
    modelEstimate: 0.99 });
}

function reply(request: TheoryCognitionRequest, intent: TheoryCognitionIntent | null): TheoryCognitionResult {
  return immutableResearchValue({ decision: intent ? "CONTRIBUTION" : "BLOCKED",
    reason: intent ? "test_double_contribution" : "injected_reviser_provider_failure", intent,
    evidence: { evidenceId: `MODEL-${theoryDigest(request.requestId).slice(0, 40)}`,
      evidenceClass: "E3", providerId: "DETERMINISTIC-SCHEDULING-TEST-DOUBLE",
      model: "scheduling-test-double", requestDigest: theoryDigest(request.requestId),
      responseDigest: intent ? theoryDigest(intent) : null, statusCode: intent ? 200 : 503,
      promptTokens: 128, completionTokens: intent ? 64 : 0, totalTokens: intent ? 192 : 128,
      finishReason: intent ? "stop" : null, grantsAuthority: false },
    diagnostics: [], grantsAuthority: false });
}

class TableCognition implements TheoryCognitionEngine {
  #investigator = 0;
  readonly calls: TheoryCognitionRequest[] = [];
  readonly table: Table;
  readonly mode: Mode;
  constructor(table: Table, mode: Mode) { this.table = table; this.mode = mode; }
  profile() { return Object.freeze({ model: "scheduling-test-double" }); }
  async think(request: TheoryCognitionRequest): Promise<TheoryCognitionResult> {
    this.calls.push(immutableResearchValue(request));
    if (!validHypothesisAllocation(request)) throw new Error("allocation_does_not_match_phase_frozen_context");
    if (request.role === "INVESTIGATOR") {
      const ordinal = this.#investigator++;
      const row = this.mode === "DUPLICATE_SELECTION"
        ? Number(request.hypothesisAllocation?.preferredMechanismIds[0]?.split("-")[1] ?? 0) : ordinal % 3;
      return reply(request, hypothesis(request, this.table, row,
        this.mode === "INCOMPLETE_FORECASTS"));
    }
    if (request.role === "REVISER") {
      if (this.mode === "REVISER_PROVIDER_FAILURE") return reply(request, null);
      // Independent equality filter: no graph selection helpers or hidden row.
      const consistent = this.table.map((_, index) => index).filter((row) =>
        request.experimentObservations.every((observed) =>
          this.table[row][Number(observed.experimentId.split("-")[1])] === observed.outcome));
      if (consistent.length) return reply(request, hypothesis(request, this.table, consistent[0]));
    }
    return reply(request, immutableResearchValue({ schemaVersion: 1,
      decision: request.role === "FALSIFIER" ? "CHALLENGE" : "NO_CONCLUSION",
      thesis: "External experiments and the unchanged oracle, not confidence, determine acceptance.",
      mechanismId: null, causalMechanism: null, evidenceRefs: ["E-SOURCE"],
      assumptions: [], uncertainties: ["The modeled family can be wrong or non-identifiable."],
      forecasts: [], counterexamples: request.role === "FALSIFIER" ? request.peerContributions.map((item) => {
        const forecast = item.intent.forecasts[0];
        return { targetTheoryId: item.theoryId, experimentId: forecast.experimentId,
          disconfirmingOutcome: forecast.expectedOutcome === "ZERO" ? "ONE" : "ZERO",
          rationale: "This opposite exact measurement falsifies the unchanged hypothesis." };
      }) : [], requestedExperimentIds: [], revisionOfTheoryId: null, modelEstimate: null }));
  }
}

function observation(target: ResearchPartyObjective, index: number, outcome: string): ResearchExperimentObservation {
  const experiment = target.experimentCatalog[index];
  const executionIdentity = `EXEC-${target.researchId}-${index}`;
  const outputDigest = theoryDigest({ index, outcome });
  return immutableResearchValue({ observationId: `OBS-${target.researchId}-${index}`,
    experimentId: experiment.experimentId, toolId: experiment.toolId, outcome,
    executionIdentity, outputDigest, authorityGranted: false,
    evidence: { evidenceId: `E-OBS-${target.researchId}-${index}`, evidenceClass: "E3",
      kind: "EXPERIMENT_RESULT", summary: "An independent deterministic fixture emitted this exact outcome.",
      contentDigest: theoryDigest({ experimentId: experiment.experimentId, toolId: experiment.toolId,
        outcome, executionIdentity, outputDigest }), provenanceRoot: `EXTERNAL-PROBE-${index}`,
      freshnessDependencies: [`CANDIDATE:${CANDIDATE}`], observedAtEpochMs: NOW,
      candidateBinding: CANDIDATE, grantsAuthority: false } });
}

async function run(table: Table, actual: readonly string[], caseId: string, policy: Policy,
  mode: Mode = "HEALTHY", overrides: Partial<ResearchPartyLimits> = {},
  corrupt?: (value: ResearchExperimentObservation) => ResearchExperimentObservation,
  hypothesisAllocationPolicy?: TheoryResearchPartyConfig["hypothesisAllocationPolicy"]) {
  const coordinator = {};
  const network = TheoryNetwork.create({ namespace: "evidence-first-test", addressCapacity: "1000000000000",
    maxAssignedPairs: 20, maxConcurrentActivations: 5, maxTotalActivations: 20, maxEvents: 1_000,
    maxPredictionsPerTheory: 32, maxObservationsPerTheory: 64, maxRelations: 20, maxFanout: 8,
    maxMessages: 20, activationLifetimeMs: 60_000, now: () => NOW }, coordinator);
  const target = objective(table, caseId);
  const limits = { ...LIMITS, ...overrides };
  const cognition = new TableCognition(table, mode);
  const config: TheoryResearchPartyConfig = { partyId: `PARTY-${caseId}`, network, coordinator,
    cognition, limits, investigatorCount: 3, now: () => NOW, experimentPolicy: policy, hypothesisAllocationPolicy,
    experiments: { run: async (experiment) => {
      const index = Number(experiment.experimentId.split("-")[1]);
      const value = observation(target, index, actual[index]);
      return corrupt ? corrupt(value) : value;
    } } };
  const result = await TheoryResearchParty.create(config).investigate(target);
  const matches = table.map((_, index) => index).filter((index) =>
    table[index].length === actual.length && table[index].every((value, column) => value === actual[column]));
  const assurance = assureResearchParty({ objective: target, limits, result,
    groundTruth: { taskId: caseId, expectedMechanismId: `MECHANISM-${matches[0] ?? 0}`,
      oracleDigest: theoryDigest({ table, actual }), oracleProvenanceRoot: "INDEPENDENT-ARRAY-EQUALITY-ORACLE",
      hiddenFromCognition: true } });
  check(result.authorityGranted === false && result.actualReasoningEngine === "TEST_DOUBLE",
    `${caseId}: scheduling evidence neither grants authority nor claims live cognition`);
  check(network.metrics().activePairs === 0, `${caseId}: all entity leases are released`);
  check(assurance.decision !== "ACCEPT" || matches.length === 1,
    `${caseId}: no false acceptance of absent or non-identifiable mechanisms`);
  return { config, target, result, assurance, cognition, matches };
}

const REVISE: Policy = "REVISE_AFTER_OBSERVATION";
const EVIDENCE_FIRST: Policy = "EXHAUST_PRECOMMITTED_FORECASTS";
const rows = Array.from({ length: 8 }, (_, mask) => Array.from({ length: 3 }, (_, bit) =>
  ((mask >> bit) & 1) ? "ONE" : "ZERO"));
const aggregate = { pairedCases: 0, legacyHealthyAccepted: 0, evidenceFirstHealthyAccepted: 0,
  legacyInjectedFailureAccepted: 0, evidenceFirstInjectedFailureAccepted: 0,
  legacyHealthyCalls: 0, evidenceFirstHealthyCalls: 0, falseAcceptances: 0 };
const corpus: unknown[] = [];
for (let a = 0; a < rows.length; a += 1) for (let b = a + 1; b < rows.length; b += 1)
  for (let c = b + 1; c < rows.length; c += 1) for (let truth = 0; truth < 3; truth += 1) {
    const table = [rows[a], rows[b], rows[c]];
    const caseId = `UNSEEN-TABLE-${a}-${b}-${c}-${truth}`;
    corpus.push({ table, truth });
    const legacy = await run(table, table[truth], caseId, REVISE);
    const candidate = await run(table, table[truth], caseId, EVIDENCE_FIRST);
    const legacyFault = await run(table, table[truth], `${caseId}-FAULT`, REVISE, "REVISER_PROVIDER_FAILURE");
    const candidateFault = await run(table, table[truth], `${caseId}-FAULT`, EVIDENCE_FIRST, "REVISER_PROVIDER_FAILURE");
    check(candidate.assurance.decision === "ACCEPT"
      && (legacy.assurance.decision !== "ACCEPT" || legacy.result.decision.selectedMechanismId === `MECHANISM-${truth}`),
    `${caseId}: unchanged oracle accepts candidate; baseline misses remain misses`);
    check(candidate.result.resourceUsage.modelCalls === 5
      && candidate.result.resourceUsage.modelCalls < legacy.result.resourceUsage.modelCalls,
    `${caseId}: evidence-first uses fewer calls, not more compute`);
    check(candidate.result.resourceUsage.experiments === legacy.result.resourceUsage.experiments
      && candidate.result.resourceUsage.experiments === 3,
    `${caseId}: no skipped external experiment or weakened coverage`);
    check(candidateFault.assurance.decision === "ACCEPT" && legacyFault.assurance.decision === "REJECT"
      && legacyFault.result.decision.reason === "injected_reviser_provider_failure",
    `${caseId}: unnecessary revision dependency is removed, not retried or hidden`);
    check(candidate.result.decision.assessments.filter((item) => item.mechanismId !== `MECHANISM-${truth}`)
      .every((item) => item.falsifyingObservationIds.length > 0),
    `${caseId}: every competing exact hypothesis has explicit falsification evidence`);
    check(candidate.cognition.calls.filter((item) => item.role === "INVESTIGATOR")
      .every((item) => item.experimentObservations.length === 0 && item.peerContributions.length === 0),
    `${caseId}: initial forecasts remain blind and precommitted`);
    aggregate.pairedCases += 1;
    aggregate.legacyHealthyAccepted += Number(legacy.assurance.decision === "ACCEPT");
    aggregate.evidenceFirstHealthyAccepted += Number(candidate.assurance.decision === "ACCEPT");
    aggregate.legacyInjectedFailureAccepted += Number(legacyFault.assurance.functionalAcceptance);
    aggregate.evidenceFirstInjectedFailureAccepted += Number(candidateFault.assurance.decision === "ACCEPT");
    aggregate.legacyHealthyCalls += legacy.result.resourceUsage.modelCalls;
    aggregate.evidenceFirstHealthyCalls += candidate.result.resourceUsage.modelCalls;
  }

const table = [rows[0], rows[1], rows[2]];
const absent = await run(table, rows[7], "ADVERSARIAL-ABSENT", EVIDENCE_FIRST);
check(absent.assurance.decision !== "ACCEPT" && absent.result.decision.state === "REFUTED_MODELED_FAMILY",
  "absent true mechanism cannot be forced into a supported answer");
const indistinguishable = await run([rows[0], rows[0], rows[0]], rows[0], "ADVERSARIAL-ALIASES", EVIDENCE_FIRST);
check(indistinguishable.result.decision.state === "INSUFFICIENT_EVIDENCE",
  "identical observed predictions do not identify distinct causal mechanisms");
const partialTable = [rows[0], rows[2], rows[4]];
const partial = await run(partialTable, partialTable[1], "ADVERSARIAL-PARTIAL", EVIDENCE_FIRST, "INCOMPLETE_FORECASTS");
check(partial.cognition.calls.some((item) => item.role === "REVISER") && partial.assurance.decision === "ACCEPT",
  "missing forecasts trigger existing bounded revision rather than fabricated evidence");
const oneProbe = await run(table, table[0], "ADVERSARIAL-ONE-PROBE", EVIDENCE_FIRST, "HEALTHY", { maxExperiments: 1 });
check(oneProbe.assurance.decision !== "ACCEPT" && oneProbe.result.resourceUsage.modelCalls === 5,
  "unobserved original predictions prevent acceptance when experiment budget expires");
const costBound = await run(table, table[0], "ADVERSARIAL-COST", EVIDENCE_FIRST, "HEALTHY", { maxCostUnits: 1 });
check(costBound.assurance.decision !== "ACCEPT" && costBound.result.resourceUsage.experimentCostUnits === 1,
  "cost limits remain binding under experimental sequencing");
const callBound = await run(table, table[0], "ADVERSARIAL-CALLS", EVIDENCE_FIRST, "HEALTHY", { maxModelCalls: 4 });
check(callBound.assurance.decision !== "ACCEPT" && callBound.result.resourceUsage.modelCalls === 4,
  "mandatory meta-review cannot silently bypass an exhausted model budget");
for (const [name, corrupt] of [
  ["MODEL-CLAIM", (value: ResearchExperimentObservation) => ({ ...value,
    evidence: { ...value.evidence, evidenceClass: "E1" as const } })],
  ["STALE-CANDIDATE", (value: ResearchExperimentObservation) => ({ ...value,
    evidence: { ...value.evidence, candidateBinding: "d".repeat(40) } })],
  ["UNAUTHORIZED", (value: ResearchExperimentObservation) => ({ ...value, authorityGranted: true })],
  ["UNKNOWN-OUTCOME", (value: ResearchExperimentObservation) => ({ ...value, outcome: "INVENTED" })],
] as const) {
  const malformed = await run(table, table[0], `ADVERSARIAL-${name}`, EVIDENCE_FIRST,
    "HEALTHY", {}, (value) => corrupt(value) as ResearchExperimentObservation);
  check(malformed.result.decision.state === "BLOCKED" && malformed.assurance.decision === "REJECT",
    `${name}: corrupted observation fails closed`);
}
try {
  TheoryResearchParty.create({ ...partial.config, experimentPolicy: "SKIP_VERIFICATION" as Policy });
  throw new Error("invalid_policy_was_accepted");
} catch (error) {
  check(String(error).includes("configuration_invalid"), "unknown scheduling policies are rejected");
}

// Direct graph regression: preserve both positive and negative evidence but do
// not count a deterministic counterexample as a still-viable unchanged claim.
const witness = await run(table, table[0], "MIXED-EVIDENCE-VETO", EVIDENCE_FIRST);
check(witness.result.decision.assessments.some((item) => item.state === "CONFLICTED"
  && item.supportingObservationIds.length > 0 && item.falsifyingObservationIds.length > 0)
  && witness.result.decision.state === "SUPPORTED_WITHIN_MODELED_FAMILY",
"mixed evidence is retained; positive matches cannot vote away a counterexample");
const graph = new ResearchEvidenceGraph(witness.target, NOW);
for (const contribution of witness.result.contributions) graph.commitContribution(contribution);
for (const observed of witness.result.observations) graph.recordObservation(observed);
function changedClaim(previous: TheoryContribution, intent: TheoryCognitionIntent, id: string): TheoryContribution {
  const modelEvidence = { ...previous.modelEvidence, evidenceId: `E1-${id}`, contentDigest: theoryDigest(intent) };
  const base = { ...previous, contributionId: id, intent, modelEvidence, role: "REVISER" as const };
  return immutableResearchValue({ ...base, contributionDigest: theoryDigest({ contributionId: id,
    theoryId: base.theoryId, guardianId: base.guardianId, role: base.role,
    objectiveDigest: base.objectiveDigest, intent, modelEvidenceId: modelEvidence.evidenceId,
    committedAtEpochMs: base.committedAtEpochMs }) });
}
const falsified = witness.result.contributions.find(item => item.intent.mechanismId === "MECHANISM-1")!;
graph.commitContribution(changedClaim(falsified, { ...falsified.intent,
  decision: "REVISE_HYPOTHESIS", revisionOfTheoryId: falsified.theoryId,
  // Deliberately omit the failing probe, retaining only an observed match.
  forecasts: [falsified.intent.forecasts[1]], requestedExperimentIds: ["EXP-1"] }, "REVISION-ERASURE-ATTACK"));
check(graph.assessment(falsified.theoryId).falsifyingObservationIds.length > 0
  && graph.assessment(falsified.theoryId).state === "CONFLICTED",
"same-mechanism revision cannot erase an earlier deterministic counterexample");
graph.commitContribution(changedClaim(falsified, { ...falsified.intent, decision: "NO_CONCLUSION",
  mechanismId: null, causalMechanism: null, forecasts: [], requestedExperimentIds: [],
  revisionOfTheoryId: null }, "ABSTENTION-RETAINS-HISTORY"));
check(graph.assessment(falsified.theoryId).falsifyingObservationIds.length > 0,
  "valid abstention is not an infrastructure error and does not delete prior theory evidence");
graph.invalidateDependency(`CANDIDATE:${CANDIDATE}`);
check(graph.decision().state === "INSUFFICIENT_EVIDENCE" && graph.selectNextExperiment(3) === null,
  "stale evidence neither certifies nor drives another experiment");

const oracleSha256 = createHash("sha256").update(readFileSync(
  new URL("../src/lib/codelab/research/researchPartyAssurance.ts", import.meta.url))).digest("hex");
// Explicit fault injection, not live model capability. A shared simulated model
// collapses its independent selection to one row unless given allocation guidance.
// The simpler rotating partition must receive exactly the same opportunity as C.
const allocationAggregate = { pairedCases: 0, independentAccepted: 0, rotatingAccepted: 0,
  coverageAccepted: 0, realizedCallsMatched: true, realizedTokensMatched: true,
  realizedExperimentsMatched: true, falseAcceptances: 0 };
const permutations = [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
for (const [permutationIndex, permutation] of permutations.entries()) for (let truth = 0; truth < 3; truth++) {
  const values = permutation.map(index => [`VALUE-${index}`]);
  const id = `ALLOCATION-FAULT-${permutationIndex}-${truth}`;
  const armResults = [];
  for (const allocationPolicy of [undefined, "ROTATING_PARTITION", "COVERAGE_AWARE"] as const) {
    const arm = await run(values, values[truth], id, EVIDENCE_FIRST, "DUPLICATE_SELECTION",
      { maxExperiments: 1, maxCostUnits: 1 }, undefined, allocationPolicy);
    armResults.push(arm);
    check(arm.cognition.calls.slice(0, 3).every(request => request.peerContributions.length === 0
      && request.experimentObservations.length === 0), "allocation does not leak peers or hidden experimental outcomes");
    check(arm.result.hypothesisAllocations?.every(item => item.grantsAuthority === false),
      "all executed allocation identities remain authority-neutral");
  }
  const [baseline, rotating, coverage] = armResults;
  check(rotating.assurance.decision === "ACCEPT" && coverage.assurance.decision === "ACCEPT",
    "both generic allocation mechanisms repair injected selection collapse under the unchanged oracle");
  check(coverage.result.resourceUsage.modelCalls === baseline.result.resourceUsage.modelCalls
    && rotating.result.resourceUsage.modelCalls === baseline.result.resourceUsage.modelCalls
    && coverage.result.resourceUsage.totalTokens === baseline.result.resourceUsage.totalTokens
    && rotating.result.resourceUsage.totalTokens === baseline.result.resourceUsage.totalTokens
    && armResults.every(arm => arm.result.resourceUsage.experiments === 1),
  "all three fault-injection arms have matched realized calls, reported tokens and external experiments");
  check(new Set(coverage.result.contributions.filter(item => item.role === "INVESTIGATOR")
    .map(item => item.intent.mechanismId)).size === 3,
  "coverage improvement is observed in generated conjectures, not just allocated identifiers");
  allocationAggregate.pairedCases++;
  allocationAggregate.independentAccepted += Number(baseline.assurance.decision === "ACCEPT");
  allocationAggregate.rotatingAccepted += Number(rotating.assurance.decision === "ACCEPT");
  allocationAggregate.coverageAccepted += Number(coverage.assurance.decision === "ACCEPT");
}
// Exercise adaptation over multiple revisions, including serial and parallel
// delivery. This oracle is unchanged; no performance assertion is manufactured.
for (const policy of ["ROTATING_PARTITION", "COVERAGE_AWARE"] as const) {
  const adaptive = await run([rows[0], rows[2], rows[4], rows[7]], rows[3],
    `ALLOCATION-ABSENT-${policy}`, REVISE, "HEALTHY", {}, undefined, policy);
  check(adaptive.assurance.decision !== "ACCEPT", "exploration cannot certify an absent true mechanism");
  check(adaptive.cognition.calls.some(item => item.hypothesisAllocation?.phaseOrdinal === 1),
    "revision allocation consumes the original revision calls rather than adding model executions");
  check(adaptive.result.observations.length > 0 && adaptive.result.evidenceChainComplete,
    "adaptive allocation preserves failed experiments and the admitted evidence chain");
}
console.log(`NYX_HYPOTHESIS_COVERAGE_E3_REPORT ${JSON.stringify({ schemaVersion: 1,
  chunkId: "NYX-HYPOTHESIS-COVERAGE-001", oracleSha256, allocationAggregate,
  evidenceClass: "E3", actualCognition: "TEST_DOUBLE", liveCapabilityImprovement: "UNVERIFIED",
  interpretation: "Selection-collapse fault injection; C does not beat the simpler partition control. No promotion.",
  broadPromotion: false, authorityGranted: false })}`);
console.log(`NYX_EVIDENCE_FIRST_E3_REPORT ${JSON.stringify({ schemaVersion: 1,
  chunkId: "NYX-EVIDENCE-FIRST-SEQUENCING-001", corpusDigest: theoryDigest(corpus), oracleSha256,
  evidenceClass: "E3", actualCognition: "TEST_DOUBLE", matchedLimits: LIMITS, aggregate,
  interpretation: "Finite deterministic scheduling/contract evidence; not live Nemotron capability or frontier parity.",
  broadPromotion: false, authorityGranted: false })}`);
console.log(`OMEGA_RESEARCH_EVIDENCE_FIRST_TEST_SUMMARY passed: ${checks}, failed: 0`);
