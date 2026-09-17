import {
  DENDRITIC_COMPARTMENTS,
  DIGITAL_NEURON_AUTHORITY,
  DIGITAL_NEURON_SCHEMA_VERSION,
  connectomeDigest,
  type CompiledPopulation,
  type DigitalNeuronGenome,
  type DigitalNeuronIdentity,
  type GuardianFeedback,
  type NeuronSignal,
  type NeuronSynapse,
  type PopulationBlueprint,
} from "../src/lib/codelab/connectome/digitalNeuronContracts";
import {
  compileCognitivePopulation,
  estimatePopulationFootprint,
  validCompiledPopulation,
} from "../src/lib/codelab/connectome/cognitivePopulationCompiler";
import { CognitivePopulationRuntime } from "../src/lib/codelab/connectome/cognitivePopulationRuntime";
import {
  DigitalNeuronKernel,
  plasticSynapseWeight,
} from "../src/lib/codelab/connectome/digitalNeuronKernel";
import {
  EpistemicMicrocircuit,
  createEpistemicMicrocircuitBlueprint,
  type EpistemicEvidencePacket,
  type EpistemicMicrocircuitDefinition,
} from "../src/lib/codelab/connectome/epistemicMicrocircuit";

let passed = 0;
let failed = 0;

function check(condition: unknown, label: string): void {
  if (condition) passed += 1;
  else { failed += 1; console.error(`FAIL ${label}`); }
}

function throws(action: () => unknown, message: string): boolean {
  try { action(); return false; }
  catch (error) { return error instanceof Error && error.message === message; }
}

const candidateBinding = "c".repeat(40);
const compactScale = Object.freeze({ evidenceCopies: 8, hypothesisCopies: 16, falsifierCopies: 8,
  integratorCopies: 8, inhibitoryCopies: 4, uncertaintyCopies: 4, actionCopies: 4 });

function definition(suffix = "base", seed = `stability-${suffix}`): EpistemicMicrocircuitDefinition {
  return Object.freeze({
    circuitId: `stability-${suffix}`,
    objective: "Identify the causal fault without allowing correlated observations to manufacture certainty.",
    candidateBinding,
    addressCapacity: "1000000000000000000",
    seed,
    channels: Object.freeze([
      { channelId: "alpha-static", description: "Static analysis supports causal family alpha." },
      { channelId: "alpha-runtime", description: "Runtime observation supports causal family alpha." },
      { channelId: "beta-static", description: "Static analysis supports causal family beta." },
      { channelId: "beta-runtime", description: "Runtime observation supports causal family beta." },
    ]),
    hypotheses: Object.freeze([
      { hypothesisId: "cause-alpha", statement: "The alpha implementation violates the required invariant.",
        supportChannels: ["alpha-static", "alpha-runtime"],
        contradictionChannels: ["beta-runtime"], competitionGroup: "root-cause",
        proposedAction: "Repair the alpha invariant and rerun both independent checks." },
      { hypothesisId: "cause-beta", statement: "The beta runtime path violates the required invariant.",
        supportChannels: ["beta-static", "beta-runtime"],
        contradictionChannels: ["alpha-runtime"], competitionGroup: "root-cause",
        proposedAction: "Repair the beta path and rerun both independent checks." },
    ]),
    scale: compactScale,
  });
}

function evidence(evidenceId: string, channelId: string, root: string, group: string,
  magnitude = 1, confidence = 1): EpistemicEvidencePacket {
  return Object.freeze({ evidenceId, channelId, magnitude, confidence, evidenceClass: "E3" as const,
    provenanceRoot: root, correlationGroup: group, candidateBinding });
}

function externalSignal(compiled: CompiledPopulation, targetId: string, overrides: Partial<NeuronSignal> = {}): NeuronSignal {
  return Object.freeze({ signalId: "external-signal", cycle: 0, sourceId: "external:stability",
    targetId, kind: "EVIDENCE", compartment: "SUPPORT", magnitude: 1, confidence: 1,
    evidenceClass: "E3", provenanceRoot: "stability-root", evidenceRoots: ["stability-root"],
    evidenceCorrelationGroups: ["stability-group"], correlationGroup: "stability-group",
    candidateBinding: compiled.candidateBinding, expiresAfterCycle: 2, grantsAuthority: false,
    ...overrides });
}

function withLimits(blueprint: PopulationBlueprint,
  limits: Partial<PopulationBlueprint["genome"]["limits"]>): PopulationBlueprint {
  return { ...blueprint, genome: { ...blueprint.genome,
    limits: { ...blueprint.genome.limits, ...limits } } };
}

// Compiler output is a trust-boundary artifact, not an implicitly trusted in-memory object.
{
  const blueprint = createEpistemicMicrocircuitBlueprint(definition("compiled-integrity"));
  const compiled = compileCognitivePopulation(blueprint);
  check(validCompiledPopulation(compiled), "fresh compiler output passes deep compiled-population validation");

  const firstSynapse = compiled.synapses[0];
  const forgedSynapses = [{ ...firstSynapse, weight: firstSynapse.weight + 0.25 }, ...compiled.synapses.slice(1)];
  const forgedWeights = { ...compiled, synapses: forgedSynapses } as CompiledPopulation;
  check(!validCompiledPopulation(forgedWeights)
    && throws(() => new CognitivePopulationRuntime(forgedWeights), "compiled_population_invalid"),
  "runtime rejects a compiled artifact whose security-relevant synapse changed after digesting");

  const forgedRanges = { ...compiled,
    outgoingRanges: compiled.outgoingRanges.map((range, index) => index === 0
      ? { start: range.start, end: Math.min(compiled.synapses.length, range.end + 1) } : range) } as CompiledPopulation;
  check(!validCompiledPopulation(forgedRanges)
    && throws(() => new CognitivePopulationRuntime(forgedRanges), "compiled_population_invalid"),
  "runtime rejects forged outgoing ranges even when the population digest field is retained");

  const templateId = Object.keys(compiled.genomesByTemplate)[0];
  const forgedGenomes = { ...compiled.genomesByTemplate,
    [templateId]: { ...compiled.genomesByTemplate[templateId], operation: "RUN_SHELL" } };
  const forgedCapability = { ...compiled, genomesByTemplate: forgedGenomes } as unknown as CompiledPopulation;
  check(!validCompiledPopulation(forgedCapability)
    && throws(() => new CognitivePopulationRuntime(forgedCapability), "compiled_population_invalid"),
  "compiled genome tables reject undeclared executable capability fields");

  check(throws(() => estimatePopulationFootprint({ ...blueprint, operation: "DEPLOY" } as unknown as PopulationBlueprint),
    "population_blueprint_invalid"), "footprint estimation enforces the same exact blueprint schema as compilation");
  const invalidAddress = { ...blueprint, replications: blueprint.replications.map((item, index) => index === 0
    ? { ...item, ordinalOffset: Number.MAX_SAFE_INTEGER } : item) };
  check(throws(() => estimatePopulationFootprint(invalidAddress), "neuron_address_capacity_exhausted"),
    "footprint estimation rejects populations whose last resident address exceeds capacity");
}

// Independence requires both distinct provenance and distinct correlation groups.
{
  const correlatedRoots = new EpistemicMicrocircuit(definition("correlated-roots"));
  correlatedRoots.admitEvidence(evidence("corr-a", "alpha-static", "root-a", "shared-observation"));
  correlatedRoots.admitEvidence(evidence("corr-b", "alpha-runtime", "root-b", "shared-observation"));
  const correlatedDecision = correlatedRoots.run(32);
  check(correlatedDecision.independentEvidenceRoots === 2
    && correlatedDecision.independentEvidenceCorrelationGroups === 1,
  "decision evidence reports provenance diversity separately from correlation independence");
  check(correlatedDecision.state !== "SUPPORTED_CANDIDATE" && correlatedDecision.selectedAction === null,
    "two renamed roots from one correlated observation cannot authorize an action proposal");

  const aliasedRoot = new EpistemicMicrocircuit(definition("aliased-root"));
  aliasedRoot.admitEvidence(evidence("alias-a", "alpha-static", "shared-root", "instrument-a"));
  aliasedRoot.admitEvidence(evidence("alias-b", "alpha-runtime", "shared-root", "instrument-b"));
  const aliasedDecision = aliasedRoot.run(32);
  check(aliasedDecision.independentEvidenceRoots === 1
    && aliasedDecision.independentEvidenceCorrelationGroups === 2,
  "decision evidence detects one provenance root presented through multiple labels");
  check(aliasedDecision.state !== "SUPPORTED_CANDIDATE" && aliasedDecision.selectedAction === null,
    "multiple group labels cannot compensate for a single provenance root");

  const independent = new EpistemicMicrocircuit(definition("independent"));
  independent.admitEvidence(evidence("independent-a", "alpha-static", "static-root", "static-instrument"));
  independent.admitEvidence(evidence("independent-b", "alpha-runtime", "runtime-root", "runtime-instrument"));
  const independentDecision = independent.run(32);
  check(independentDecision.state === "SUPPORTED_CANDIDATE"
    && independentDecision.selectedHypothesis === "cause-alpha",
  "two independently rooted and independently grouped observations can support the causal candidate");
  const selected = independentDecision.assessments.find((item) => item.hypothesisId === "cause-alpha");
  check((selected?.actionEvidenceRoots.length ?? 0) >= 2
    && (selected?.actionEvidenceCorrelationGroups.length ?? 0) >= 2,
  "action evidence preserves both independence dimensions through every neural hop");
}

// Equivalent evidence order must not change the epistemic conclusion.
{
  const packets = [
    evidence("perm-a", "alpha-static", "perm-root-a", "perm-group-a"),
    evidence("perm-b", "alpha-runtime", "perm-root-b", "perm-group-b"),
    evidence("perm-c", "beta-runtime", "perm-root-c", "perm-group-c", 0.2, 0.8),
  ];
  const permutations = [packets, [packets[1], packets[0], packets[2]], [packets[2], packets[1], packets[0]],
    [packets[0], packets[2], packets[1]], [packets[1], packets[2], packets[0]], [packets[2], packets[0], packets[1]]];
  const outcomes = permutations.map((ordered) => {
    const circuit = new EpistemicMicrocircuit(definition("permutation", "permutation-shared-seed"));
    for (const packet of ordered) circuit.admitEvidence(packet);
    const decision = circuit.run(32);
    return { state: decision.state, selectedHypothesis: decision.selectedHypothesis,
      action: decision.selectedAction, margin: decision.confidenceMargin,
      assessments: decision.assessments.map((item) => [item.hypothesisId, item.peakActivation]) };
  });
  const canonical = JSON.stringify(outcomes[0]);
  const permutationInvariant = outcomes.every((outcome) => JSON.stringify(outcome) === canonical);
  if (!permutationInvariant) console.error("PERMUTATION_DIAGNOSTIC", JSON.stringify(outcomes));
  check(permutationInvariant,
    "all six admission-order permutations produce the same epistemic outcome");
}

// Budget failures are fail-closed and transactional at the runtime boundary.
{
  const base = createEpistemicMicrocircuitBlueprint(definition("transactional-budget"));
  const traceCompiled = compileCognitivePopulation(withLimits(base, { maximumTraceEvents: 1 }));
  const traceRuntime = new CognitivePopulationRuntime(traceCompiled);
  const traceTarget = traceCompiled.identities[0].neuronId;
  check(throws(() => traceRuntime.inject(externalSignal(traceCompiled, traceTarget)),
    "population_trace_budget_exhausted"), "trace exhaustion is detected before external admission mutates state");
  check(traceRuntime.snapshot().pendingSignals === 0
    && traceRuntime.metrics().externalSignalsAdmitted === 0 && traceRuntime.cycle === 0,
  "failed trace admission leaves queue, counters, and cycle unchanged");

  const queueCompiled = compileCognitivePopulation(withLimits(base, { maximumQueuedSignals: 1 }));
  const evidenceOrdinal = queueCompiled.templateByOrdinal.findIndex((template) => template === "evidence:alpha-static");
  const queueTarget = queueCompiled.identities[evidenceOrdinal].neuronId;
  const queueRuntime = new CognitivePopulationRuntime(queueCompiled);
  queueRuntime.inject(externalSignal(queueCompiled, queueTarget));
  check(throws(() => queueRuntime.step(), "population_step_queue_budget_exhausted"),
    "outgoing queue exhaustion is detected before a cycle mutates neuron state");
  const afterQueueFailure = queueRuntime.snapshot();
  check(afterQueueFailure.cycle === 0 && afterQueueFailure.pendingSignals === 1
    && afterQueueFailure.cycleRecords.length === 0
    && queueRuntime.neuron(queueTarget).firingCount === 0,
  "failed cycle preflight preserves the complete pre-step state for diagnosis or retry");

  const ordinaryCompiled = compileCognitivePopulation(base);
  const ordinaryRuntime = new CognitivePopulationRuntime(ordinaryCompiled);
  const impossibleFuture = externalSignal(ordinaryCompiled, ordinaryCompiled.identities[0].neuronId,
    { signalId: "future-outside-horizon", cycle: ordinaryCompiled.limits.maximumCyclesPerRun,
      expiresAfterCycle: ordinaryCompiled.limits.maximumCyclesPerRun });
  check(throws(() => ordinaryRuntime.inject(impossibleFuture), "external_neuron_signal_invalid"),
    "signals outside the executable cycle horizon are rejected rather than queued forever");
}

// Guardian calibration cannot manufacture independence, and plasticity remains bounded under long feedback streams.
{
  const genome: DigitalNeuronGenome = Object.freeze({ schemaVersion: DIGITAL_NEURON_SCHEMA_VERSION,
    templateId: "stability-feedback", role: "HYPOTHESIS", semanticFamily: "stability-feedback",
    competitionGroup: null, compartments: DENDRITIC_COMPARTMENTS.map((compartment) => ({ compartment,
      gain: 1, floor: 0, saturation: 4, minimumDistinctRoots: 1 })),
    compartmentWeights: Object.freeze({ SUPPORT: 3, CONTRADICTION: -3, CONTEXT: 0, NOVELTY: 0,
      UNCERTAINTY: -1, INHIBITION: -2, PREDICTION_ERROR: -2 }), bias: -1,
    activationThreshold: 0.5, firingThreshold: 0.65, refractoryCycles: 0, leakRate: 0.5,
    homeostaticTarget: 0.1, plasticity: { enabled: true, learningRate: 1, decayRate: 0,
      minimumWeight: -2, maximumWeight: 2, maximumStep: 0.1 }, tags: ["stability"],
    authority: DIGITAL_NEURON_AUTHORITY });
  const identity: DigitalNeuronIdentity = Object.freeze({ neuronId: "stability:neuron:0",
    guardianId: "stability:guardian:0", populationId: "stability-feedback", ordinal: 0, generation: 0,
    genomeDigest: connectomeDigest(genome), lineageDigest: connectomeDigest(["stability-feedback", 0]) });
  const kernel = DigitalNeuronKernel.create(identity, genome);
  const feedback = (index: number, root: string, group: string): GuardianFeedback => Object.freeze({
    feedbackId: `feedback-${index}`, neuronId: identity.neuronId, candidateBinding,
    disposition: "CONFIRMED", observedValue: 1, predictedValue: 0, evidenceId: `oracle-${index}`,
    evidenceClass: "E3", provenanceRoot: root, correlationGroup: group,
    environmentIdentity: "stability-harness", cycle: index, grantsAuthority: false });
  kernel.applyFeedback(feedback(0, "same-root", "group-a"));
  const oneRoot = kernel.applyFeedback(feedback(1, "same-root", "group-b"));
  check(!oneRoot.independenceEstablished,
    "guardian does not call one provenance root independent merely because group labels differ");
  const independent = kernel.applyFeedback(feedback(2, "second-root", "group-c"));
  check(independent.independenceEstablished,
    "guardian establishes independence only after both roots and groups diversify");

  const synapse: NeuronSynapse = Object.freeze({ synapseId: "d".repeat(64), sourceId: identity.neuronId,
    targetId: "stability:neuron:1", targetCompartment: "SUPPORT", signalKind: "EXCITATION",
    weight: 0, delayCycles: 0, plastic: true, relation: "SUPPORTS" });
  let weight = synapse.weight;
  for (let index = 0; index < 1_000; index += 1) {
    weight = plasticSynapseWeight({ ...synapse, weight }, genome, feedback(index + 10,
      `plastic-root-${index}`, `plastic-group-${index}`));
  }
  check(weight === genome.plasticity.maximumWeight,
    "one thousand confirming updates converge at, but never exceed, the configured maximum weight");
  let negativeWeight = weight;
  for (let index = 0; index < 1_000; index += 1) {
    const negative: GuardianFeedback = { ...feedback(index + 2_000, `negative-root-${index}`,
      `negative-group-${index}`), disposition: "FALSIFIED", observedValue: 0, predictedValue: 1 };
    negativeWeight = plasticSynapseWeight({ ...synapse, weight: negativeWeight }, genome, negative);
  }
  check(negativeWeight === genome.plasticity.minimumWeight,
    "one thousand falsifying updates converge at, but never exceed, the configured minimum weight");

  const invalidIdentity = { ...identity, operation: "WRITE_REPOSITORY" } as unknown as DigitalNeuronIdentity;
  check(throws(() => DigitalNeuronKernel.create(invalidIdentity, genome), "digital_neuron_definition_invalid"),
    "kernel identity validation rejects undeclared authority-bearing fields");
}

// Deterministic compiler stress across varied seeds and resident scales.
{
  const digests = new Set<string>();
  let allValid = true;
  for (let index = 0; index < 24; index += 1) {
    const base = definition(`matrix-${index}`, `matrix-seed-${index}`);
    const varied = { ...base, scale: { ...base.scale,
      evidenceCopies: 2 + index % 7, hypothesisCopies: 4 + index % 11,
      falsifierCopies: 2 + index % 5, integratorCopies: 2 + index % 6,
      inhibitoryCopies: 1 + index % 4, uncertaintyCopies: 1 + index % 3,
      actionCopies: 1 + index % 5 } };
    const blueprint = createEpistemicMicrocircuitBlueprint(varied);
    const first = compileCognitivePopulation(blueprint);
    const second = compileCognitivePopulation(blueprint);
    allValid = allValid && validCompiledPopulation(first)
      && first.populationDigest === second.populationDigest
      && first.identities.length === estimatePopulationFootprint(blueprint).materializedNeurons;
    digests.add(first.populationDigest);
  }
  check(allValid, "twenty-four varied populations compile reproducibly and survive deep validation");
  check(digests.size === 24, "distinct population seeds and identities produce distinct population digests");
}

// Sparse execution remains operational after crossing ten thousand resident cells.
{
  const base = definition("large-resident-runtime", "large-resident-runtime-seed");
  const largeDefinition = { ...base, scale: { evidenceCopies: 1_100, hypothesisCopies: 1_500,
    falsifierCopies: 750, integratorCopies: 400, inhibitoryCopies: 128,
    uncertaintyCopies: 128, actionCopies: 64 } };
  const blueprint = createEpistemicMicrocircuitBlueprint(largeDefinition);
  const compiled = compileCognitivePopulation(blueprint);
  const runtime = new CognitivePopulationRuntime(compiled);
  const targetOrdinal = compiled.templateByOrdinal.findIndex((template) => template === "evidence:alpha-static");
  runtime.inject(externalSignal(compiled, compiled.identities[targetOrdinal].neuronId));
  const result = runtime.runUntilQuiescent(16);
  check(compiled.identities.length >= 10_000 && validCompiledPopulation(compiled),
    "ten-thousand-cell resident population survives deep artifact validation and runtime construction");
  check(result.state === "QUIESCENT" && result.snapshot.pendingSignals === 0
    && result.snapshot.cycleRecords.reduce((sum, cycle) => sum + cycle.evaluatedNeurons, 0)
      < compiled.identities.length,
  "ten-thousand-cell population executes one bounded evidence cascade sparsely to quiescence");
  check(runtime.metrics().activeModelExecutions === 0
    && runtime.metrics().distributedExecutionImplemented === false,
  "large resident execution does not inflate process-local neurons into model or distributed compute claims");
}

console.log(`Omega digital neuron stability tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) process.exit(1);
