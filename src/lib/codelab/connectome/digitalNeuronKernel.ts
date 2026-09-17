import {
  DENDRITIC_COMPARTMENTS,
  DIGITAL_NEURON_AUTHORITY,
  connectomeDigest,
  connectomeId,
  connectomeKeys,
  finiteBounded,
  immutableConnectomeValue,
  initialGuardianCalibration,
  validGuardianFeedback,
  validNeuronGenome,
  validNeuronSignal,
  type DendriticCompartment,
  type DendriticIntegration,
  type DigitalNeuronGenome,
  type DigitalNeuronIdentity,
  type DigitalNeuronState,
  type GuardianCalibrationState,
  type GuardianFeedback,
  type NeuronEvidenceClass,
  type NeuronFiring,
  type NeuronSignal,
  type NeuronSynapse,
} from "./digitalNeuronContracts";

const EVIDENCE_STRENGTH: Readonly<Record<NeuronEvidenceClass, number>> = Object.freeze({
  E1: 0.35,
  E2: 0.65,
  E3: 1,
  E4: 1.1,
  E5: 1.2,
});

export interface NeuronEvaluationContext {
  readonly cycle: number;
  readonly candidateBinding: string;
  readonly correlationDiscount: number;
  readonly globalActivityFraction: number;
}

export interface NeuronEvaluationResult {
  readonly state: DigitalNeuronState;
  readonly firing: NeuronFiring | null;
  readonly admittedSignals: number;
  readonly rejectedSignals: number;
  readonly suppressionReason: "REFRACTORY" | "BELOW_THRESHOLD" | null;
}

export interface NeuronSuppressionResult {
  readonly state: DigitalNeuronState;
  readonly suppressedFiring: NeuronFiring;
  readonly reason: "GLOBAL_BUDGET" | "FAMILY_BUDGET" | "COMPETITION" | "DUPLICATE";
}

function stableSigmoid(value: number): number {
  if (value >= 0) {
    const exponential = Math.exp(-Math.min(value, 60));
    return 1 / (1 + exponential);
  }
  const exponential = Math.exp(Math.max(value, -60));
  return exponential / (1 + exponential);
}

function round(value: number, precision = 12): number {
  const scale = 10 ** precision;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function validIdentity(identity: DigitalNeuronIdentity, genome: DigitalNeuronGenome): boolean {
  return Boolean(identity && connectomeKeys(identity, ["neuronId", "guardianId", "populationId", "ordinal",
    "generation", "genomeDigest", "lineageDigest"])
    && connectomeId(identity.neuronId) && connectomeId(identity.guardianId)
    && connectomeId(identity.populationId) && Number.isSafeInteger(identity.ordinal) && identity.ordinal >= 0
    && Number.isSafeInteger(identity.generation) && identity.generation >= 0
    && identity.genomeDigest === connectomeDigest(genome) && /^[a-f0-9]{64}$/.test(identity.lineageDigest));
}

function stateDigest(input: Omit<DigitalNeuronState, "stateDigest">): string {
  return connectomeDigest(input);
}

function makeState(input: Omit<DigitalNeuronState, "stateDigest">): DigitalNeuronState {
  return immutableConnectomeValue({ ...input, stateDigest: stateDigest(input) });
}

function correlationAwareMagnitude(signals: readonly NeuronSignal[], discount: number): {
  readonly raw: number;
  readonly correlated: number;
  readonly roots: Set<string>;
  readonly groups: Set<string>;
} {
  const byGroup = new Map<string, number[]>();
  const roots = new Set<string>();
  const evidenceGroups = new Set<string>();
  for (const signal of signals) {
    for (const root of signal.evidenceRoots) roots.add(root);
    for (const group of signal.evidenceCorrelationGroups) evidenceGroups.add(group);
    const weighted = signal.magnitude * signal.confidence * EVIDENCE_STRENGTH[signal.evidenceClass];
    const bucket = byGroup.get(signal.correlationGroup) ?? [];
    bucket.push(weighted);
    byGroup.set(signal.correlationGroup, bucket);
  }
  let raw = 0;
  let correlated = 0;
  for (const values of byGroup.values()) {
    raw += values.reduce((sum, value) => sum + value, 0);
    const ordered = [...values].sort((left, right) => Math.abs(right) - Math.abs(left));
    correlated += ordered.reduce((sum, value, index) => sum + value * (index === 0 ? 1 : discount ** index), 0);
  }
  return { raw: round(raw), correlated: round(correlated), roots, groups: evidenceGroups };
}

function integrateCompartment(genome: DigitalNeuronGenome, compartment: DendriticCompartment,
  signals: readonly NeuronSignal[], correlationDiscount: number): DendriticIntegration {
  const definition = genome.compartments.find((item) => item.compartment === compartment);
  if (!definition) return immutableConnectomeValue({ compartment, rawMagnitude: 0, correlatedMagnitude: 0,
    effectiveMagnitude: 0, distinctRoots: 0, distinctCorrelationGroups: 0,
    admittedProvenanceRoots: [], admittedCorrelationGroups: [],
    admittedSignalIds: [], rejectedSignalIds: signals.map((signal) => signal.signalId) });

  const eligible = signals.filter((signal) => Math.abs(signal.magnitude) >= definition.floor);
  const aggregate = correlationAwareMagnitude(eligible, correlationDiscount);
  const enoughRoots = aggregate.roots.size >= definition.minimumDistinctRoots;
  const effective = enoughRoots
    ? Math.max(-definition.saturation, Math.min(definition.saturation, aggregate.correlated * definition.gain)) : 0;
  return immutableConnectomeValue({ compartment, rawMagnitude: aggregate.raw,
    correlatedMagnitude: aggregate.correlated, effectiveMagnitude: round(effective),
    distinctRoots: aggregate.roots.size, distinctCorrelationGroups: aggregate.groups.size,
    admittedProvenanceRoots: enoughRoots ? [...aggregate.roots].sort() : [],
    admittedCorrelationGroups: enoughRoots ? [...aggregate.groups].sort() : [],
    admittedSignalIds: enoughRoots ? eligible.map((signal) => signal.signalId) : [],
    rejectedSignalIds: [
      ...signals.filter((signal) => Math.abs(signal.magnitude) < definition.floor).map((signal) => signal.signalId),
      ...(!enoughRoots ? eligible.map((signal) => signal.signalId) : []),
    ] });
}

function activationInput(genome: DigitalNeuronGenome, integrations: readonly DendriticIntegration[],
  priorPotential: number, reliability: number, globalActivityFraction: number): number {
  const dendritic = integrations.reduce((sum, integration) =>
    sum + integration.effectiveMagnitude * genome.compartmentWeights[integration.compartment], 0);
  const retained = priorPotential * (1 - genome.leakRate);
  // Homeostatic pressure is local negative feedback, not an acceptance signal.
  const homeostaticPressure = Math.max(-1, Math.min(1, globalActivityFraction - genome.homeostaticTarget));
  const calibratedGain = 0.5 + reliability;
  return round(genome.bias + retained + dendritic * calibratedGain - homeostaticPressure);
}

function allEvidenceRoots(integrations: readonly DendriticIntegration[]): readonly string[] {
  return [...new Set(integrations.flatMap((item) => item.admittedProvenanceRoots))].sort();
}

function allEvidenceCorrelationGroups(integrations: readonly DendriticIntegration[]): readonly string[] {
  return [...new Set(integrations.flatMap((item) => item.admittedCorrelationGroups))].sort();
}

export class DigitalNeuronKernel {
  readonly #identity: DigitalNeuronIdentity;
  readonly #genome: DigitalNeuronGenome;
  #state: DigitalNeuronState;
  readonly #feedbackIds = new Set<string>();
  readonly #feedbackRoots = new Set<string>();
  readonly #feedbackGroups = new Set<string>();
  #retired = false;

  private constructor(identity: DigitalNeuronIdentity, genome: DigitalNeuronGenome) {
    this.#identity = immutableConnectomeValue(identity);
    this.#genome = immutableConnectomeValue(genome);
    this.#state = makeState({ identity: this.#identity, lifecycle: "DORMANT", membranePotential: 0,
      activation: 0, lastFiredCycle: null, refractoryUntilCycle: 0, firingCount: 0, suppressedCount: 0,
      guardian: initialGuardianCalibration(), lastIntegration: [] });
  }

  static create(identity: DigitalNeuronIdentity, genome: DigitalNeuronGenome): DigitalNeuronKernel {
    if (!validNeuronGenome(genome) || !validIdentity(identity, genome)) throw new Error("digital_neuron_definition_invalid");
    return new DigitalNeuronKernel(identity, genome);
  }

  get identity(): DigitalNeuronIdentity { return this.#identity; }
  get genome(): DigitalNeuronGenome { return this.#genome; }
  snapshot(): DigitalNeuronState { return immutableConnectomeValue(this.#state); }

  evaluate(signals: readonly NeuronSignal[], context: NeuronEvaluationContext): NeuronEvaluationResult {
    if (this.#retired) throw new Error("retired_neuron_cannot_evaluate");
    if (!Number.isSafeInteger(context.cycle) || context.cycle < 0
      || !finiteBounded(context.correlationDiscount, 0, 1)
      || !finiteBounded(context.globalActivityFraction, 0, 1)) throw new Error("neuron_evaluation_context_invalid");

    const seen = new Set<string>();
    let rejectedSignals = 0;
    const admitted: NeuronSignal[] = [];
    for (const signal of signals) {
      if (!validNeuronSignal(signal, context.candidateBinding) || signal.targetId !== this.#identity.neuronId
        || signal.cycle > context.cycle || signal.expiresAfterCycle < context.cycle || seen.has(signal.signalId)) {
        rejectedSignals += 1;
        continue;
      }
      seen.add(signal.signalId);
      admitted.push(signal);
    }

    const byCompartment = new Map<DendriticCompartment, NeuronSignal[]>();
    for (const compartment of DENDRITIC_COMPARTMENTS) byCompartment.set(compartment, []);
    for (const signal of admitted) byCompartment.get(signal.compartment)!.push(signal);
    const integrations = DENDRITIC_COMPARTMENTS.map((compartment) =>
      integrateCompartment(this.#genome, compartment, byCompartment.get(compartment)!, context.correlationDiscount));

    const input = activationInput(this.#genome, integrations, this.#state.membranePotential,
      this.#state.guardian.calibratedReliability, context.globalActivityFraction);
    const activation = round(stableSigmoid(input));
    const refractory = context.cycle < this.#state.refractoryUntilCycle;
    const lifecycle = refractory ? "REFRACTORY" as const
      : activation >= this.#genome.activationThreshold ? "ACTIVE" as const : "READY" as const;
    const fires = !refractory && activation >= this.#genome.firingThreshold;
    const next = makeState({ identity: this.#identity, lifecycle,
      membranePotential: round(input), activation, lastFiredCycle: fires ? context.cycle : this.#state.lastFiredCycle,
      refractoryUntilCycle: fires ? context.cycle + this.#genome.refractoryCycles + 1 : this.#state.refractoryUntilCycle,
      firingCount: this.#state.firingCount + (fires ? 1 : 0), suppressedCount: this.#state.suppressedCount,
      guardian: this.#state.guardian, lastIntegration: integrations });
    this.#state = next;
    const firingRoots = allEvidenceRoots(integrations);
    const firingGroups = allEvidenceCorrelationGroups(integrations);
    const integrationDigest = connectomeDigest({ templateId: this.#genome.templateId, role: this.#genome.role,
      semanticFamily: this.#genome.semanticFamily, competitionGroup: this.#genome.competitionGroup,
      integrations });
    const firing: NeuronFiring | null = fires ? immutableConnectomeValue({ neuronId: this.#identity.neuronId,
      guardianId: this.#identity.guardianId, cycle: context.cycle, activation,
      membranePotential: next.membranePotential, role: this.#genome.role,
      semanticFamily: this.#genome.semanticFamily, evidenceRoots: firingRoots,
      evidenceCorrelationGroups: firingGroups, integrationDigest, grantsAuthority: false }) : null;
    return immutableConnectomeValue({ state: next, firing, admittedSignals: admitted.length, rejectedSignals,
      suppressionReason: refractory ? "REFRACTORY" : fires ? null : "BELOW_THRESHOLD" });
  }

  suppress(firing: NeuronFiring,
    reason: NeuronSuppressionResult["reason"]): NeuronSuppressionResult {
    if (this.#retired || firing.neuronId !== this.#identity.neuronId
      || firing.cycle !== this.#state.lastFiredCycle) throw new Error("neuron_suppression_binding_invalid");
    this.#state = makeState({ ...this.#state, lifecycle: "READY", activation: 0,
      membranePotential: round(this.#state.membranePotential * (1 - this.#genome.leakRate)),
      firingCount: Math.max(0, this.#state.firingCount - 1), suppressedCount: this.#state.suppressedCount + 1 });
    return immutableConnectomeValue({ state: this.#state, suppressedFiring: firing, reason });
  }

  applyFeedback(feedback: GuardianFeedback): GuardianCalibrationState {
    if (this.#retired) throw new Error("retired_neuron_cannot_learn");
    if (!validGuardianFeedback(feedback, feedback.candidateBinding)
      || feedback.neuronId !== this.#identity.neuronId) throw new Error("guardian_feedback_invalid");
    if (this.#feedbackIds.has(feedback.feedbackId)) throw new Error("guardian_feedback_duplicate");
    this.#feedbackIds.add(feedback.feedbackId);
    this.#feedbackRoots.add(feedback.provenanceRoot);
    this.#feedbackGroups.add(feedback.correlationGroup);

    const previous = this.#state.guardian;
    const error = Math.abs(feedback.observedValue - feedback.predictedValue);
    const confirmed = feedback.disposition === "CONFIRMED" ? 1 : 0;
    const falsified = feedback.disposition === "FALSIFIED" ? 1 : 0;
    const inconclusive = feedback.disposition === "INCONCLUSIVE" ? 1 : 0;
    const alpha = previous.alpha + confirmed + inconclusive * 0.25;
    const beta = previous.beta + falsified + inconclusive * 0.25;
    const guardian: GuardianCalibrationState = immutableConnectomeValue({
      confirmedOutcomes: previous.confirmedOutcomes + confirmed,
      falsifiedOutcomes: previous.falsifiedOutcomes + falsified,
      inconclusiveOutcomes: previous.inconclusiveOutcomes + inconclusive,
      alpha: round(alpha), beta: round(beta), calibratedReliability: round(alpha / (alpha + beta)),
      predictionErrorEma: round(previous.predictionErrorEma * 0.8 + error * 0.2),
      lastEvidenceId: feedback.evidenceId, lastEvidenceClass: feedback.evidenceClass,
      independenceEstablished: this.#feedbackRoots.size >= 2 && this.#feedbackGroups.size >= 2,
      grantsAuthority: false,
    });
    this.#state = makeState({ ...this.#state, guardian });
    return guardian;
  }

  retire(): DigitalNeuronState {
    if (this.#retired) return this.snapshot();
    this.#retired = true;
    this.#state = makeState({ ...this.#state, lifecycle: "RETIRED", activation: 0, membranePotential: 0 });
    return this.snapshot();
  }
}

export function plasticSynapseWeight(synapse: NeuronSynapse, genome: DigitalNeuronGenome,
  feedback: GuardianFeedback): number {
  if (!synapse.plastic || !genome.plasticity.enabled || feedback.disposition === "INCONCLUSIVE") return synapse.weight;
  const direction = feedback.disposition === "CONFIRMED" ? 1 : -1;
  const predictionError = Math.abs(feedback.observedValue - feedback.predictedValue);
  const rawStep = direction * genome.plasticity.learningRate * Math.max(0.05, predictionError);
  const boundedStep = Math.max(-genome.plasticity.maximumStep, Math.min(genome.plasticity.maximumStep, rawStep));
  const decayed = synapse.weight * (1 - genome.plasticity.decayRate);
  return round(Math.max(genome.plasticity.minimumWeight,
    Math.min(genome.plasticity.maximumWeight, decayed + boundedStep)));
}

export function emittedSignalFromFiring(firing: NeuronFiring, synapse: NeuronSynapse,
  candidateBinding: string, attenuation: number): NeuronSignal {
  if (firing.neuronId !== synapse.sourceId || !finiteBounded(attenuation, 0, 1)) {
    throw new Error("firing_synapse_binding_invalid");
  }
  const cycle = firing.cycle + synapse.delayCycles + 1;
  const magnitude = round(firing.activation * synapse.weight * attenuation);
  const inheritedRoot = firing.evidenceRoots.length === 1 ? firing.evidenceRoots[0] : firing.integrationDigest;
  const inheritedGroup = firing.evidenceCorrelationGroups.length === 1 ? firing.evidenceCorrelationGroups[0]
    : `evidence-set:${connectomeDigest(firing.evidenceCorrelationGroups).slice(0, 24)}`;
  return immutableConnectomeValue({ signalId: connectomeDigest([synapse.synapseId, firing.integrationDigest, cycle]),
    cycle, sourceId: firing.neuronId, targetId: synapse.targetId, kind: synapse.signalKind,
    compartment: synapse.targetCompartment, magnitude, confidence: firing.activation,
    evidenceClass: "E1", provenanceRoot: inheritedRoot, evidenceRoots: firing.evidenceRoots.length > 0
      ? firing.evidenceRoots : [firing.integrationDigest],
    evidenceCorrelationGroups: firing.evidenceCorrelationGroups.length > 0
      ? firing.evidenceCorrelationGroups : [inheritedGroup],
    correlationGroup: inheritedGroup, candidateBinding, expiresAfterCycle: cycle + 8,
    grantsAuthority: false });
}

export function digitalNeuronAuthorityInvariant(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const serialized = JSON.stringify(value);
  return serialized.includes(DIGITAL_NEURON_AUTHORITY)
    && !/RUN_SHELL|WRITE_REPOSITORY|DEPLOY|CREDENTIAL_ACCESS|NETWORK_REQUEST/.test(serialized);
}
