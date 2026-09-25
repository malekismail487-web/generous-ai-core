import {
  DENDRITIC_COMPARTMENTS,
  DIGITAL_NEURON_AUTHORITY,
  DIGITAL_NEURON_SCHEMA_VERSION,
  connectomeDigest,
  type DigitalNeuronGenome,
  type DigitalNeuronIdentity,
  type GuardianFeedback,
  type NeuronSignal,
} from "../src/lib/codelab/connectome/digitalNeuronContracts";
import { DigitalNeuronKernel, digitalNeuronAuthorityInvariant }
  from "../src/lib/codelab/connectome/digitalNeuronKernel";
import { compileCognitivePopulation, estimatePopulationFootprint }
  from "../src/lib/codelab/connectome/cognitivePopulationCompiler";
import { CognitivePopulationRuntime } from "../src/lib/codelab/connectome/cognitivePopulationRuntime";
import {
  EpistemicMicrocircuit,
  createEpistemicMicrocircuitBlueprint,
  scoreFlatEvidenceBaseline,
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
  try { action(); return false; } catch (error) { return error instanceof Error && error.message === message; }
}

const candidateBinding = "a".repeat(40);
const definition: EpistemicMicrocircuitDefinition = Object.freeze({
  circuitId: "nyx-epistemic-1",
  objective: "Diagnose a distributed scheduler that dispatches jobs before every dependency is ready.",
  candidateBinding,
  addressCapacity: "1000000000000",
  seed: "scheduler-diagnosis-v1",
  channels: Object.freeze([
    { channelId: "dependency-test", description: "A deterministic test observes premature dependency dispatch." },
    { channelId: "code-guard", description: "The source checks some instead of every dependency." },
    { channelId: "timeout-profile", description: "A timing profile attributes the failure to clock delay." },
    { channelId: "slow-clock", description: "The monotonic clock advances unexpectedly slowly." },
    { channelId: "cancellation-trace", description: "A cancellation trace exposes stale task readiness." },
  ]),
  hypotheses: Object.freeze([
    { hypothesisId: "missing-all-guard", statement: "The scheduler uses existential rather than universal readiness.",
      supportChannels: ["dependency-test", "code-guard"], contradictionChannels: ["timeout-profile"],
      competitionGroup: "scheduler-cause", proposedAction: "Replace the readiness predicate and rerun dependency tests." },
    { hypothesisId: "clock-timeout", statement: "The failure is caused by an incorrectly advanced monotonic clock.",
      supportChannels: ["timeout-profile", "slow-clock"], contradictionChannels: ["dependency-test"],
      competitionGroup: "scheduler-cause", proposedAction: "Correct clock advancement and rerun timing tests." },
    { hypothesisId: "stale-cancellation", statement: "Cancellation leaves a stale readiness record in the queue.",
      supportChannels: ["cancellation-trace", "code-guard"], contradictionChannels: ["dependency-test"],
      competitionGroup: "scheduler-cause", proposedAction: "Invalidate readiness state during cancellation." },
  ]),
  scale: Object.freeze({ evidenceCopies: 64, hypothesisCopies: 128, falsifierCopies: 64,
    integratorCopies: 32, inhibitoryCopies: 16, uncertaintyCopies: 32, actionCopies: 8 }),
});

function evidence(evidenceId: string, channelId: string, root: string, group = root,
  magnitude = 1, confidence = 1): EpistemicEvidencePacket {
  return Object.freeze({ evidenceId, channelId, magnitude, confidence, evidenceClass: "E3" as const,
    provenanceRoot: root, correlationGroup: group, candidateBinding });
}

{
  const blueprint = createEpistemicMicrocircuitBlueprint(definition);
  const footprint = estimatePopulationFootprint(blueprint);
  const compiled = compileCognitivePopulation(blueprint);
  const compiledAgain = compileCognitivePopulation(blueprint);
  check(footprint.materializedNeurons >= 1_000 && footprint.addressCapacity === "1000000000000",
    "replicator materializes a thousand-cell microcircuit inside a trillion-address virtual space");
  check(footprint.materializationFraction < 0.000_01 && footprint.activeModelExecutions === 0,
    "large addressability remains distinct from resident cells and model executions");
  check(compiled.populationDigest === compiledAgain.populationDigest
    && compiled.identities[999].neuronId === compiledAgain.identities[999].neuronId,
    "population compilation is reproducible from the same genome and seed");
  check(compiled.identities.length === footprint.materializedNeurons
    && new Set(compiled.identities.map((item) => item.guardianId)).size === compiled.identities.length,
    "each materialized neuron receives a distinct logical guardian identity");
  check(compiled.synapses.length > compiled.identities.length && compiled.synapses.length <= blueprint.genome.limits.maximumSynapses,
    "compiled sparse connectome contains bounded typed projections");
  check(Object.isFrozen(compiled.genomesByTemplate) && Object.values(compiled.genomesByTemplate).every(Object.isFrozen),
    "compiled genome lookup cannot be mutated through an exposed Map handle");
  check(digitalNeuronAuthorityInvariant(blueprint.genome), "population genome explicitly remains cognition-only");
  check(!JSON.stringify(compiled).includes("NVIDIA_API_KEY") && !JSON.stringify(compiled).includes("WRITE_REPOSITORY"),
    "compiled connectome contains neither credentials nor repository mutation authority");
  check(throws(() => compileCognitivePopulation({ ...blueprint, operation: "RUN_SHELL" } as unknown as typeof blueprint),
    "population_blueprint_invalid"), "undeclared capability fields cannot enter the population compiler");

  const largeBlueprint = createEpistemicMicrocircuitBlueprint({ ...definition,
    scale: { evidenceCopies: 800, hypothesisCopies: 1_100, falsifierCopies: 550,
      integratorCopies: 275, inhibitoryCopies: 100, uncertaintyCopies: 128, actionCopies: 32 } });
  const large = compileCognitivePopulation(largeBlueprint);
  check(large.identities.length >= 10_000 && large.synapses.length > large.identities.length,
    "replicator concretely compiles a ten-thousand-cell sparse connectome without model or tool execution");
}

{
  const first = new EpistemicMicrocircuit(definition);
  const packets = [
    evidence("dep-test-1", "dependency-test", "oracle-dependency-order"),
    evidence("code-guard-1", "code-guard", "source-readiness-predicate"),
  ];
  for (const packet of packets) first.admitEvidence(packet);
  const decision = first.run(32);
  check(decision.run.state === "QUIESCENT", "event-driven circuit reaches quiescence under its finite budget");
  check(decision.selectedHypothesis === "missing-all-guard",
    "independent deterministic evidence selects the causally matching hypothesis population");
  check(decision.state === "SUPPORTED_CANDIDATE" && decision.selectedAction?.includes("readiness predicate"),
    "two independent evidence roots can produce an authority-neutral action proposal");
  check(!decision.grantsAuthority && decision.authority === DIGITAL_NEURON_AUTHORITY,
    "microcircuit conclusion cannot grant its proposed action authority");
  check(decision.run.snapshot.materializedNeurons >= 1_000
    && decision.run.snapshot.cycleRecords.some((cycle) => cycle.inhibitedNeurons > 0),
    "thousand-cell execution exercises real population inhibition rather than a static record graph");
  check(first.metrics().activeModelExecutions === 0 && first.metrics().residentScaleVerified,
    "kernel execution reports resident scale honestly without claiming model cognition");

  const replay = new EpistemicMicrocircuit(definition);
  for (const packet of packets) replay.admitEvidence(packet);
  const replayDecision = replay.run(32);
  check(replayDecision.run.snapshot.traceDigest === decision.run.snapshot.traceDigest,
    "identical admitted evidence deterministically replays to the same connectome trace");
}

{
  const circuit = new EpistemicMicrocircuit(definition);
  const correlatedNoise = Array.from({ length: 12 }, (_, index) =>
    evidence(`timeout-copy-${index}`, "timeout-profile", "one-profiler-run", "same-profiler-output", 1, 1));
  const independent = [
    evidence("dep-independent", "dependency-test", "heldout-order-oracle"),
    evidence("guard-independent", "code-guard", "heldout-source-inspection"),
  ];
  for (const packet of [...correlatedNoise, ...independent]) circuit.admitEvidence(packet);
  const decision = circuit.run(32);
  const flat = scoreFlatEvidenceBaseline(definition, [...correlatedNoise, ...independent]);
  check(flat.selectedHypothesis === "clock-timeout",
    "flat vote ablation is misled by duplicated correlated evidence");
  check(decision.selectedHypothesis === "missing-all-guard",
    "connectome discounts cloned provenance and preserves two-root causal evidence");
  check(decision.independentEvidenceRoots === 3,
    "correlated copies do not manufacture additional independent evidence roots");
}

{
  const circuit = new EpistemicMicrocircuit(definition);
  circuit.admitEvidence(evidence("only-one", "code-guard", "single-source-root"));
  const decision = circuit.run(32);
  check(decision.state !== "SUPPORTED_CANDIDATE" && decision.selectedAction === null,
    "one evidence root cannot pass the independent-evidence action gate");
  check(decision.assessments.every((assessment) => assessment.actionCellsFired === 0),
    "action population is inhibited rather than merely relabeled uncertain");
}

{
  const circuit = new EpistemicMicrocircuit(definition);
  circuit.admitEvidence(evidence("forged-a", "dependency-test", "claimed-root-a", "one-shared-origin"));
  circuit.admitEvidence(evidence("forged-b", "code-guard", "claimed-root-b", "one-shared-origin"));
  const decision = circuit.run(32);
  check(decision.state !== "SUPPORTED_CANDIDATE" && decision.selectedAction === null,
    "two claimed roots in one correlation group cannot fabricate an independent action basis");
}

{
  const balanced = { ...definition, circuitId: "nyx-balanced-conflict-1", seed: "balanced-conflict-1",
    hypotheses: [
      { ...definition.hypotheses[0], contradictionChannels: [] },
      { ...definition.hypotheses[1], contradictionChannels: [] },
    ] };
  const circuit = new EpistemicMicrocircuit(balanced);
  for (const [id, channel] of ["dependency-test", "code-guard", "timeout-profile", "slow-clock"].entries()) {
    circuit.admitEvidence(evidence(`balanced-${id}`, channel, `balanced-independent-${id}`));
  }
  const decision = circuit.run(32);
  check(decision.state === "CONFLICTED" && decision.selectedAction === null
    && decision.assessments.every((item) => item.directSupportRoots.length === 2
      && item.directSupportCorrelationGroups.length === 2),
  "equally independent support for competing causes is recorded as conflict, not an arbitrary action");
}

{
  const circuit = new EpistemicMicrocircuit(definition);
  circuit.admitEvidence(evidence("history-dependency", "dependency-test", "history-order-oracle"));
  circuit.admitEvidence(evidence("history-source", "code-guard", "history-source-inspection"));
  const first = circuit.run(32);
  circuit.admitEvidence(evidence("later-timeout", "timeout-profile", "later-timing-profiler"));
  circuit.admitEvidence(evidence("later-clock", "slow-clock", "later-clock-inspection"));
  const revised = circuit.run(32);
  check(first.state === "SUPPORTED_CANDIDATE" && first.selectedHypothesis === "missing-all-guard",
    "calibration begins with an independently supported first diagnosis");
  check(revised.state !== "SUPPORTED_CANDIDATE" || revised.selectedHypothesis !== first.selectedHypothesis,
    "new contradictory within-task evidence must not leave the first diagnosis unchallenged");
}

{
  const circuit = new EpistemicMicrocircuit(definition);
  check(throws(() => circuit.admitEvidence({ ...evidence("wrong-candidate", "code-guard", "root-a"),
    candidateBinding: "b".repeat(40) }), "epistemic_evidence_packet_invalid"),
  "evidence from another candidate fails closed");
  circuit.admitEvidence(evidence("unique-evidence", "code-guard", "root-a"));
  check(throws(() => circuit.admitEvidence(evidence("unique-evidence", "dependency-test", "root-b")),
    "epistemic_evidence_packet_invalid"), "duplicate evidence identity cannot be rebound to another channel");
  check(throws(() => new EpistemicMicrocircuit({ ...definition, hypotheses: [{ ...definition.hypotheses[0],
    supportChannels: ["invented-channel"] }, ...definition.hypotheses.slice(1)] }),
  "epistemic_microcircuit_definition_invalid"), "unknown evidence channel cannot enter the developmental genome");
}

{
  const genome: DigitalNeuronGenome = Object.freeze({ schemaVersion: DIGITAL_NEURON_SCHEMA_VERSION,
    templateId: "feedback-cell", role: "HYPOTHESIS", semanticFamily: "feedback", competitionGroup: null,
    compartments: DENDRITIC_COMPARTMENTS.map((compartment) => ({ compartment, gain: 1, floor: 0,
      saturation: 4, minimumDistinctRoots: 1 })),
    compartmentWeights: Object.freeze({ SUPPORT: 3, CONTRADICTION: -3, CONTEXT: 0, NOVELTY: 0,
      UNCERTAINTY: -1, INHIBITION: -2, PREDICTION_ERROR: -2 }), bias: -1,
    activationThreshold: 0.5, firingThreshold: 0.65, refractoryCycles: 0, leakRate: 0.5,
    homeostaticTarget: 0.1, plasticity: { enabled: true, learningRate: 0.2, decayRate: 0,
      minimumWeight: -4, maximumWeight: 4, maximumStep: 0.2 }, tags: ["feedback"],
    authority: DIGITAL_NEURON_AUTHORITY });
  const identity: DigitalNeuronIdentity = Object.freeze({ neuronId: "test:neuron:0", guardianId: "test:guardian:0",
    populationId: "test-population", ordinal: 0, generation: 0, genomeDigest: connectomeDigest(genome),
    lineageDigest: connectomeDigest(["test-population", 0]) });
  const kernel = DigitalNeuronKernel.create(identity, genome);
  const feedback = (id: string, root: string, group: string, disposition: GuardianFeedback["disposition"]): GuardianFeedback =>
    Object.freeze({ feedbackId: id, neuronId: identity.neuronId, candidateBinding, disposition,
      observedValue: disposition === "CONFIRMED" ? 1 : 0, predictedValue: 0.9, evidenceId: `evidence:${id}`,
      evidenceClass: "E3", provenanceRoot: root, correlationGroup: group, environmentIdentity: "heldout-harness",
      cycle: 1, grantsAuthority: false });
  const first = kernel.applyFeedback(feedback("feedback-1", "oracle-root-a", "oracle-a", "CONFIRMED"));
  const second = kernel.applyFeedback(feedback("feedback-2", "oracle-root-b", "oracle-b", "FALSIFIED"));
  check(first.calibratedReliability > 0.5 && second.calibratedReliability === 0.5,
    "guardian credit responds locally to confirmed and falsified predictions");
  check(second.independenceEstablished && second.predictionErrorEma > first.predictionErrorEma,
    "independent falsification is retained as calibration evidence rather than voted away");
  check(throws(() => kernel.applyFeedback(feedback("feedback-2", "oracle-root-b", "oracle-b", "CONFIRMED")),
    "guardian_feedback_duplicate"), "guardian cannot replay one evidence identity to inflate reliability");

  const signal: NeuronSignal = Object.freeze({ signalId: "signal-1", cycle: 1, sourceId: "external:test",
    targetId: identity.neuronId, kind: "EVIDENCE", compartment: "SUPPORT", magnitude: 1, confidence: 1,
    evidenceClass: "E3", provenanceRoot: "oracle-root-a", evidenceRoots: ["oracle-root-a"],
    evidenceCorrelationGroups: ["oracle-a"],
    correlationGroup: "oracle-a", candidateBinding, expiresAfterCycle: 2, grantsAuthority: false });
  const result = kernel.evaluate([signal], { cycle: 1, candidateBinding, correlationDiscount: 0.3,
    globalActivityFraction: 0 });
  check(result.firing !== null && result.firing.evidenceRoots[0] === "oracle-root-a",
    "neuron firing preserves original evidence ancestry through compartmental integration");
}

{
  const blueprint = createEpistemicMicrocircuitBlueprint({ ...definition,
    scale: { evidenceCopies: 1, hypothesisCopies: 1, falsifierCopies: 1,
      integratorCopies: 1, inhibitoryCopies: 1, uncertaintyCopies: 1, actionCopies: 1 } });
  const compiled = compileCognitivePopulation(blueprint);
  const runtime = new CognitivePopulationRuntime(compiled);
  const firstTarget = compiled.identities[0].neuronId;
  const malformed = { signalId: "malformed", cycle: 0, sourceId: "external:test", targetId: firstTarget,
    kind: "EVIDENCE", compartment: "SUPPORT", magnitude: 1, confidence: 1, evidenceClass: "E3",
    provenanceRoot: "root", evidenceRoots: ["root"], correlationGroup: "group", candidateBinding,
    evidenceCorrelationGroups: ["group"],
    expiresAfterCycle: 0, grantsAuthority: false, operation: "WRITE_REPOSITORY" } as unknown as NeuronSignal;
  check(throws(() => runtime.inject(malformed), "external_neuron_signal_invalid"),
    "undeclared executable fields cannot smuggle authority through a neural signal");
  check(runtime.metrics().authority === DIGITAL_NEURON_AUTHORITY
    && runtime.metrics().distributedExecutionImplemented === false,
    "runtime reports its process-local and authority-neutral maturity without inflation");
}

console.log(`Omega digital neuron microcircuit tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) process.exit(1);
