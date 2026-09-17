import {
  DENDRITIC_COMPARTMENTS,
  DIGITAL_NEURON_AUTHORITY,
  DIGITAL_NEURON_SCHEMA_VERSION,
  connectomeDigest,
  connectomeId,
  connectomeKeys,
  immutableConnectomeValue,
  validCandidateBinding,
  type DigitalNeuronGenome,
  type NeuronEvidenceClass,
  type NeuronReplicationRequest,
  type NeuronSignal,
  type PopulationBlueprint,
  type PopulationGenome,
  type PopulationSnapshot,
  type SynapseProjectionRule,
} from "./digitalNeuronContracts";
import { compileCognitivePopulation, estimatePopulationFootprint } from "./cognitivePopulationCompiler";
import { CognitivePopulationRuntime, type PopulationRunResult } from "./cognitivePopulationRuntime";

export interface EpistemicEvidenceChannel {
  readonly channelId: string;
  readonly description: string;
}

export interface EpistemicHypothesisDefinition {
  readonly hypothesisId: string;
  readonly statement: string;
  readonly supportChannels: readonly string[];
  readonly contradictionChannels: readonly string[];
  readonly competitionGroup: string;
  readonly proposedAction: string;
}

export interface EpistemicCircuitScale {
  readonly evidenceCopies: number;
  readonly hypothesisCopies: number;
  readonly falsifierCopies: number;
  readonly integratorCopies: number;
  readonly inhibitoryCopies: number;
  readonly uncertaintyCopies: number;
  readonly actionCopies: number;
}

export interface EpistemicMicrocircuitDefinition {
  readonly circuitId: string;
  readonly objective: string;
  readonly candidateBinding: string;
  readonly addressCapacity: string;
  readonly seed: string;
  readonly channels: readonly EpistemicEvidenceChannel[];
  readonly hypotheses: readonly EpistemicHypothesisDefinition[];
  readonly scale: EpistemicCircuitScale;
}

export interface EpistemicEvidencePacket {
  readonly evidenceId: string;
  readonly channelId: string;
  readonly magnitude: number;
  readonly confidence: number;
  readonly evidenceClass: NeuronEvidenceClass;
  readonly provenanceRoot: string;
  readonly correlationGroup: string;
  readonly candidateBinding: string;
}

export interface HypothesisPopulationAssessment {
  readonly hypothesisId: string;
  readonly statement: string;
  readonly meanActivation: number;
  readonly peakActivation: number;
  readonly activeCells: number;
  readonly firedCells: number;
  readonly averageGuardianReliability: number;
  readonly evidenceRoots: readonly string[];
  readonly proposedAction: string;
  readonly actionCellsFired: number;
}

export interface EpistemicCircuitDecision {
  readonly state: "SUPPORTED_CANDIDATE" | "CONFLICTED" | "INSUFFICIENT_EVIDENCE";
  readonly selectedHypothesis: string | null;
  readonly selectedAction: string | null;
  readonly confidenceMargin: number;
  readonly assessments: readonly HypothesisPopulationAssessment[];
  readonly independentEvidenceRoots: number;
  readonly run: PopulationRunResult;
  readonly authority: typeof DIGITAL_NEURON_AUTHORITY;
  readonly grantsAuthority: false;
}

const DEFAULT_SCALE: EpistemicCircuitScale = Object.freeze({ evidenceCopies: 64, hypothesisCopies: 128,
  falsifierCopies: 64, integratorCopies: 32, inhibitoryCopies: 16, uncertaintyCopies: 32, actionCopies: 8 });

function rounded(value: number): number { return Math.round((value + Number.EPSILON) * 1e12) / 1e12; }

function weights(overrides: Partial<Record<typeof DENDRITIC_COMPARTMENTS[number], number>> = {}) {
  return Object.freeze(Object.fromEntries(DENDRITIC_COMPARTMENTS.map((compartment) =>
    [compartment, overrides[compartment] ?? 0])) as Record<typeof DENDRITIC_COMPARTMENTS[number], number>);
}

function neuronTemplate(templateId: string, role: DigitalNeuronGenome["role"], semanticFamily: string,
  competitionGroup: string | null, compartmentWeights: DigitalNeuronGenome["compartmentWeights"],
  options: Partial<Pick<DigitalNeuronGenome, "bias" | "activationThreshold" | "firingThreshold"
    | "refractoryCycles" | "leakRate" | "homeostaticTarget">> = {}): DigitalNeuronGenome {
  return immutableConnectomeValue({ schemaVersion: DIGITAL_NEURON_SCHEMA_VERSION, templateId, role, semanticFamily,
    competitionGroup, compartments: DENDRITIC_COMPARTMENTS.map((compartment) => ({ compartment,
      gain: 1, floor: 0.000_001, saturation: 8, minimumDistinctRoots: 1 })), compartmentWeights,
    bias: options.bias ?? -1, activationThreshold: options.activationThreshold ?? 0.52,
    firingThreshold: options.firingThreshold ?? 0.65, refractoryCycles: options.refractoryCycles ?? 1,
    leakRate: options.leakRate ?? 0.45, homeostaticTarget: options.homeostaticTarget ?? 0.08,
    plasticity: { enabled: true, learningRate: 0.16, decayRate: 0.002,
      minimumWeight: -4, maximumWeight: 4, maximumStep: 0.2 },
    tags: [role.toLowerCase(), semanticFamily.replace(/[^A-Za-z0-9:._/-]/g, "-")],
    authority: DIGITAL_NEURON_AUTHORITY });
}

function validateDefinition(definition: EpistemicMicrocircuitDefinition): void {
  const scale = definition?.scale;
  const scaleValues = scale && Object.values(scale);
  if (!definition || !connectomeKeys(definition, ["circuitId", "objective", "candidateBinding", "addressCapacity",
    "seed", "channels", "hypotheses", "scale"])
    || !connectomeId(definition.circuitId) || !connectomeId(definition.seed)
    || !validCandidateBinding(definition.candidateBinding) || !/^[1-9][0-9]{0,29}$/.test(definition.addressCapacity)
    || typeof definition.objective !== "string" || definition.objective.trim().length < 8
    || definition.objective.length > 2_000 || !Array.isArray(definition.channels) || definition.channels.length < 2
    || definition.channels.length > 64 || !definition.channels.every((item) =>
      connectomeKeys(item, ["channelId", "description"]) && connectomeId(item.channelId)
      && typeof item.description === "string" && item.description.length > 0 && item.description.length <= 500)
    || new Set(definition.channels.map((item) => item.channelId)).size !== definition.channels.length
    || !Array.isArray(definition.hypotheses) || definition.hypotheses.length < 2 || definition.hypotheses.length > 32
    || !scaleValues || !connectomeKeys(scale, ["evidenceCopies", "hypothesisCopies", "falsifierCopies",
      "integratorCopies", "inhibitoryCopies", "uncertaintyCopies", "actionCopies"])
    || scaleValues.some((value) => !Number.isSafeInteger(value) || value < 1 || value > 4_096)) {
    throw new Error("epistemic_microcircuit_definition_invalid");
  }
  const channelIds = new Set(definition.channels.map((item) => item.channelId));
  for (const hypothesis of definition.hypotheses) {
    if (!connectomeKeys(hypothesis, ["hypothesisId", "statement", "supportChannels", "contradictionChannels",
      "competitionGroup", "proposedAction"])
      || !connectomeId(hypothesis.hypothesisId) || !connectomeId(hypothesis.competitionGroup)
      || typeof hypothesis.statement !== "string" || hypothesis.statement.length < 8 || hypothesis.statement.length > 2_000
      || typeof hypothesis.proposedAction !== "string" || hypothesis.proposedAction.length < 3
      || hypothesis.proposedAction.length > 1_000 || hypothesis.supportChannels.length < 1
      || hypothesis.supportChannels.some((channel) => !channelIds.has(channel))
      || hypothesis.contradictionChannels.some((channel) => !channelIds.has(channel))
      || new Set([...hypothesis.supportChannels, ...hypothesis.contradictionChannels]).size
        !== hypothesis.supportChannels.length + hypothesis.contradictionChannels.length) {
      throw new Error("epistemic_microcircuit_definition_invalid");
    }
  }
  if (new Set(definition.hypotheses.map((item) => item.hypothesisId)).size !== definition.hypotheses.length) {
    throw new Error("epistemic_microcircuit_definition_invalid");
  }
}

function templateIds(definition: EpistemicMicrocircuitDefinition) {
  return {
    evidence: (channel: string) => `evidence:${channel}`,
    hypothesis: (hypothesis: string) => `hypothesis:${hypothesis}`,
    falsifier: (hypothesis: string) => `falsifier:${hypothesis}`,
    integrator: (hypothesis: string) => `integrator:${hypothesis}`,
    inhibitor: (group: string) => `inhibitor:${group}`,
    uncertainty: "uncertainty:global",
    action: (hypothesis: string) => `action:${hypothesis}`,
  };
}

function templates(definition: EpistemicMicrocircuitDefinition): readonly DigitalNeuronGenome[] {
  const ids = templateIds(definition);
  const result: DigitalNeuronGenome[] = [];
  for (const channel of definition.channels) result.push(neuronTemplate(ids.evidence(channel.channelId), "EVIDENCE",
    `evidence-${channel.channelId}`, null, weights({ SUPPORT: 2.2, CONTEXT: 0.5, CONTRADICTION: -0.5 }),
    { bias: -0.9, firingThreshold: 0.64, refractoryCycles: 0, leakRate: 0.8 }));
  for (const hypothesis of definition.hypotheses) {
    result.push(neuronTemplate(ids.hypothesis(hypothesis.hypothesisId), "HYPOTHESIS",
      `hypothesis-${hypothesis.hypothesisId}`, hypothesis.competitionGroup,
      weights({ SUPPORT: 4, CONTRADICTION: -4.5, CONTEXT: 0.5, NOVELTY: 0.35,
        UNCERTAINTY: -1.5, INHIBITION: -3.5, PREDICTION_ERROR: -2 }),
      { bias: -1, firingThreshold: 0.64, refractoryCycles: 1, leakRate: 0.5 }));
    result.push(neuronTemplate(ids.falsifier(hypothesis.hypothesisId), "FALSIFIER",
      `falsifier-${hypothesis.hypothesisId}`, null,
      weights({ SUPPORT: 1.2, CONTRADICTION: 3.5, CONTEXT: 0.6, NOVELTY: 0.8 }),
      { bias: -1.1, firingThreshold: 0.62, refractoryCycles: 1 }));
    result.push(neuronTemplate(ids.integrator(hypothesis.hypothesisId), "INTEGRATOR",
      `integrator-${hypothesis.hypothesisId}`, hypothesis.competitionGroup,
      weights({ SUPPORT: 4, CONTRADICTION: -5, UNCERTAINTY: -2, INHIBITION: -2 }),
      { bias: -1.1, firingThreshold: 0.66, refractoryCycles: 1, leakRate: 0.55 }));
    result.push(neuronTemplate(ids.action(hypothesis.hypothesisId), "ACTION_PROPOSAL",
      `action-${hypothesis.hypothesisId}`, hypothesis.competitionGroup,
      weights({ SUPPORT: 4.5, CONTRADICTION: -6, UNCERTAINTY: -3, INHIBITION: -3 }),
      { bias: -1.2, firingThreshold: 0.68, refractoryCycles: 2, leakRate: 0.7 }));
  }
  for (const group of [...new Set(definition.hypotheses.map((item) => item.competitionGroup))]) {
    result.push(neuronTemplate(ids.inhibitor(group), "INHIBITORY", `inhibitor-${group}`, null,
      weights({ SUPPORT: 3, CONTEXT: 0.5 }), { bias: -1, firingThreshold: 0.62, refractoryCycles: 0, leakRate: 0.8 }));
  }
  result.push(neuronTemplate(ids.uncertainty, "UNCERTAINTY", "uncertainty-global", null,
    weights({ UNCERTAINTY: 3.5, CONTRADICTION: 1.5, SUPPORT: -0.5 }),
    { bias: -1.2, firingThreshold: 0.68, refractoryCycles: 1 }));
  return Object.freeze(result);
}

function replications(definition: EpistemicMicrocircuitDefinition,
  neuronTemplates: readonly DigitalNeuronGenome[]): readonly NeuronReplicationRequest[] {
  const scale = definition.scale;
  let offset = 0;
  return Object.freeze(neuronTemplates.map((template) => {
    const count = template.role === "EVIDENCE" ? scale.evidenceCopies
      : template.role === "HYPOTHESIS" ? scale.hypothesisCopies
        : template.role === "FALSIFIER" ? scale.falsifierCopies
          : template.role === "INTEGRATOR" ? scale.integratorCopies
            : template.role === "INHIBITORY" ? scale.inhibitoryCopies
              : template.role === "UNCERTAINTY" ? scale.uncertaintyCopies : scale.actionCopies;
    const replication = { templateId: template.templateId, count, generation: 0,
      ordinalStride: 1, ordinalOffset: offset };
    offset += count;
    return Object.freeze(replication);
  }));
}

function projection(ruleId: string, sourceTemplateId: string, targetTemplateId: string,
  targetCompartment: SynapseProjectionRule["targetCompartment"], signalKind: SynapseProjectionRule["signalKind"],
  relation: SynapseProjectionRule["relation"], weight: number, fanout: number,
  topology: SynapseProjectionRule["topology"] = "HASHED_SPARSE"): SynapseProjectionRule {
  return Object.freeze({ ruleId, sourceTemplateId, targetTemplateId, targetCompartment, signalKind,
    relation, weight, delayCycles: 0, plastic: true, fanout, topology });
}

function projections(definition: EpistemicMicrocircuitDefinition): readonly SynapseProjectionRule[] {
  const ids = templateIds(definition);
  const result: SynapseProjectionRule[] = [];
  for (const hypothesis of definition.hypotheses) {
    for (const channel of hypothesis.supportChannels) {
      result.push(projection(`support:${channel}:${hypothesis.hypothesisId}`, ids.evidence(channel),
        ids.hypothesis(hypothesis.hypothesisId), "SUPPORT", "EXCITATION", "SUPPORTS", 1.25, 8));
    }
    for (const channel of hypothesis.contradictionChannels) {
      result.push(projection(`contradict:${channel}:${hypothesis.hypothesisId}`, ids.evidence(channel),
        ids.hypothesis(hypothesis.hypothesisId), "CONTRADICTION", "CONTRADICTION", "CONTRADICTS", 1.3, 8));
      result.push(projection(`falsify:${channel}:${hypothesis.hypothesisId}`, ids.evidence(channel),
        ids.falsifier(hypothesis.hypothesisId), "CONTRADICTION", "CONTRADICTION", "CONTRADICTS", 1.2, 6));
    }
    result.push(projection(`hypothesis-integrator:${hypothesis.hypothesisId}`,
      ids.hypothesis(hypothesis.hypothesisId), ids.integrator(hypothesis.hypothesisId),
      "SUPPORT", "EXCITATION", "REFINES", 3, 8));
    result.push(projection(`falsifier-integrator:${hypothesis.hypothesisId}`,
      ids.falsifier(hypothesis.hypothesisId), ids.integrator(hypothesis.hypothesisId),
      "CONTRADICTION", "CONTRADICTION", "CONTRADICTS", 1.4, 4));
    result.push(projection(`integrator-action:${hypothesis.hypothesisId}`,
      ids.integrator(hypothesis.hypothesisId), ids.action(hypothesis.hypothesisId),
      "SUPPORT", "EXCITATION", "PROPOSES", 3, 8));
    result.push(projection(`hypothesis-inhibitor:${hypothesis.hypothesisId}`,
      ids.hypothesis(hypothesis.hypothesisId), ids.inhibitor(hypothesis.competitionGroup),
      "SUPPORT", "EXCITATION", "SUPPORTS", 0.9, 2));
    result.push(projection(`inhibitor-hypothesis:${hypothesis.hypothesisId}`,
      ids.inhibitor(hypothesis.competitionGroup), ids.hypothesis(hypothesis.hypothesisId),
      "INHIBITION", "INHIBITION", "INHIBITS", 1.1, 8));
  }
  return Object.freeze(result);
}

export function createEpistemicMicrocircuitBlueprint(input: Omit<EpistemicMicrocircuitDefinition, "scale">
  & { readonly scale?: Partial<EpistemicCircuitScale> }): PopulationBlueprint {
  const definition: EpistemicMicrocircuitDefinition = immutableConnectomeValue({ ...input,
    scale: { ...DEFAULT_SCALE, ...(input.scale ?? {}) } });
  validateDefinition(definition);
  const neuronTemplates = templates(definition);
  const populationGenome: PopulationGenome = immutableConnectomeValue({
    schemaVersion: DIGITAL_NEURON_SCHEMA_VERSION, populationId: definition.circuitId,
    namespace: definition.circuitId, addressCapacity: definition.addressCapacity,
    candidateBinding: definition.candidateBinding, seed: definition.seed, neuronTemplates,
    limits: { maximumMaterializedNeurons: 100_000, maximumSynapses: 2_000_000,
      maximumExternalSignals: 100_000, maximumQueuedSignals: 2_000_000,
      maximumCyclesPerRun: 128, maximumFiringsPerCycle: 256,
      maximumFiringsPerSemanticFamily: 8, maximumTraceEvents: 1_000_000, maximumFanout: 64 },
    policy: { activeFractionTarget: 0.05, duplicateCorrelationThreshold: 0.3,
      winnerMargin: 0.03, preserveMinorityPerCompetitionGroup: 1, signalAttenuationPerHop: 0.95,
      requireIndependentRootsForAction: 2, authority: DIGITAL_NEURON_AUTHORITY },
    authority: DIGITAL_NEURON_AUTHORITY,
  });
  return immutableConnectomeValue({ genome: populationGenome,
    replications: replications(definition, neuronTemplates), projections: projections(definition) });
}

export class EpistemicMicrocircuit {
  readonly #definition: EpistemicMicrocircuitDefinition;
  readonly #blueprint: PopulationBlueprint;
  readonly #compiled: ReturnType<typeof compileCognitivePopulation>;
  readonly #runtime: CognitivePopulationRuntime;
  readonly #templateNeurons = new Map<string, readonly string[]>();
  readonly #evidencePackets: EpistemicEvidencePacket[] = [];

  constructor(input: Omit<EpistemicMicrocircuitDefinition, "scale">
    & { readonly scale?: Partial<EpistemicCircuitScale> }) {
    this.#definition = immutableConnectomeValue({ ...input, scale: { ...DEFAULT_SCALE, ...(input.scale ?? {}) } });
    validateDefinition(this.#definition);
    this.#blueprint = createEpistemicMicrocircuitBlueprint(input);
    this.#compiled = compileCognitivePopulation(this.#blueprint);
    this.#runtime = new CognitivePopulationRuntime(this.#compiled);
    this.#compiled.templateByOrdinal.forEach((template, ordinal) => {
      const ids = this.#templateNeurons.get(template) ?? [];
      this.#templateNeurons.set(template, Object.freeze([...ids, this.#compiled.identities[ordinal].neuronId]));
    });
  }

  footprint() { return estimatePopulationFootprint(this.#blueprint); }

  admitEvidence(packet: EpistemicEvidencePacket): number {
    const channel = this.#definition.channels.find((item) => item.channelId === packet?.channelId);
    if (!channel || !connectomeKeys(packet, ["evidenceId", "channelId", "magnitude", "confidence", "evidenceClass",
      "provenanceRoot", "correlationGroup", "candidateBinding"])
      || !connectomeId(packet.evidenceId) || !validCandidateBinding(packet.candidateBinding)
      || packet.candidateBinding !== this.#definition.candidateBinding
      || typeof packet.magnitude !== "number" || !Number.isFinite(packet.magnitude)
      || packet.magnitude < 0 || packet.magnitude > 1 || typeof packet.confidence !== "number"
      || !Number.isFinite(packet.confidence) || packet.confidence < 0 || packet.confidence > 1
      || !["E1", "E2", "E3", "E4", "E5"].includes(packet.evidenceClass)
      || !connectomeId(packet.provenanceRoot) || !connectomeId(packet.correlationGroup)
      || this.#evidencePackets.some((item) => item.evidenceId === packet.evidenceId)) {
      throw new Error("epistemic_evidence_packet_invalid");
    }
    const targets = this.#templateNeurons.get(`evidence:${channel.channelId}`) ?? [];
    for (const targetId of targets) {
      const signal: NeuronSignal = immutableConnectomeValue({
        signalId: connectomeDigest([packet.evidenceId, targetId]), cycle: this.#runtime.cycle,
        sourceId: `external:evidence:${packet.evidenceId}`, targetId, kind: "EVIDENCE",
        compartment: "SUPPORT", magnitude: packet.magnitude, confidence: packet.confidence,
        evidenceClass: packet.evidenceClass, provenanceRoot: packet.provenanceRoot,
        evidenceRoots: [packet.provenanceRoot], correlationGroup: packet.correlationGroup,
        candidateBinding: packet.candidateBinding, expiresAfterCycle: this.#runtime.cycle + 2,
        grantsAuthority: false,
      });
      this.#runtime.inject(signal);
    }
    this.#evidencePackets.push(immutableConnectomeValue(packet));
    return targets.length;
  }

  run(maximumCycles = 32): EpistemicCircuitDecision {
    const run = this.#runtime.runUntilQuiescent(maximumCycles);
    return this.#decision(run);
  }

  #decision(run: PopulationRunResult): EpistemicCircuitDecision {
    const ids = templateIds(this.#definition);
    const firedIds = new Set(run.snapshot.cycleRecords.flatMap((record) => record.firingIds));
    const allRoots = new Set(this.#evidencePackets.map((packet) => packet.provenanceRoot));
    const assessments = this.#definition.hypotheses.map((hypothesis): HypothesisPopulationAssessment => {
      const hypothesisIds = this.#templateNeurons.get(ids.hypothesis(hypothesis.hypothesisId)) ?? [];
      const actionIds = this.#templateNeurons.get(ids.action(hypothesis.hypothesisId)) ?? [];
      const states = hypothesisIds.map((id) => this.#runtime.neuron(id));
      const activations = states.map((state) => state.activation);
      const roots = new Set(states.flatMap((state) => state.lastIntegration
        .flatMap((integration) => integration.admittedProvenanceRoots)));
      return immutableConnectomeValue({ hypothesisId: hypothesis.hypothesisId, statement: hypothesis.statement,
        meanActivation: rounded(activations.reduce((sum, value) => sum + value, 0) / Math.max(1, activations.length)),
        peakActivation: rounded(Math.max(0, ...activations)),
        activeCells: states.filter((state) => state.activation >= 0.52).length,
        firedCells: hypothesisIds.filter((id) => firedIds.has(id)).length,
        averageGuardianReliability: rounded(states.reduce((sum, state) =>
          sum + state.guardian.calibratedReliability, 0) / Math.max(1, states.length)),
        evidenceRoots: [...roots].sort(), proposedAction: hypothesis.proposedAction,
        actionCellsFired: actionIds.filter((id) => firedIds.has(id)).length });
    }).sort((left, right) => right.peakActivation - left.peakActivation
      || right.meanActivation - left.meanActivation || left.hypothesisId.localeCompare(right.hypothesisId));

    const first = assessments[0];
    const second = assessments[1];
    const margin = rounded((first?.peakActivation ?? 0) - (second?.peakActivation ?? 0));
    const actionReady = Boolean(first && first.actionCellsFired > 0
      && first.evidenceRoots.length >= this.#compiled.policy.requireIndependentRootsForAction);
    const conflicted = Boolean(first && second && Math.abs(margin) < this.#compiled.policy.winnerMargin
      && first.peakActivation >= 0.52 && second.peakActivation >= 0.52);
    const state: EpistemicCircuitDecision["state"] = conflicted ? "CONFLICTED"
      : actionReady ? "SUPPORTED_CANDIDATE" : "INSUFFICIENT_EVIDENCE";
    return immutableConnectomeValue({ state, selectedHypothesis: state === "SUPPORTED_CANDIDATE" ? first.hypothesisId : null,
      selectedAction: state === "SUPPORTED_CANDIDATE" ? first.proposedAction : null,
      confidenceMargin: margin, assessments, independentEvidenceRoots: allRoots.size,
      run, authority: DIGITAL_NEURON_AUTHORITY, grantsAuthority: false });
  }

  snapshot(): PopulationSnapshot { return this.#runtime.snapshot(); }
  metrics() { return this.#runtime.metrics(); }
}

/** Intentionally simple ablation: no correlation discount, inhibition, guardians, or provenance gate. */
export function scoreFlatEvidenceBaseline(definition: EpistemicMicrocircuitDefinition,
  evidence: readonly EpistemicEvidencePacket[]): Readonly<{ selectedHypothesis: string | null; scores: Readonly<Record<string, number>> }> {
  validateDefinition(definition);
  const scores: Record<string, number> = {};
  for (const hypothesis of definition.hypotheses) {
    scores[hypothesis.hypothesisId] = rounded(evidence.reduce((score, packet) => {
      const contribution = packet.magnitude * packet.confidence;
      return score + (hypothesis.supportChannels.includes(packet.channelId) ? contribution : 0)
        - (hypothesis.contradictionChannels.includes(packet.channelId) ? contribution : 0);
    }, 0));
  }
  const ranked = Object.entries(scores).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  return immutableConnectomeValue({ selectedHypothesis: ranked[0]?.[1] > 0 ? ranked[0][0] : null, scores });
}
