import {
  DIGITAL_NEURON_AUTHORITY,
  connectomeDigest,
  immutableConnectomeValue,
  validGuardianFeedback,
  validNeuronSignal,
  type CompiledPopulation,
  type DigitalNeuronGenome,
  type GuardianFeedback,
  type NeuronFiring,
  type NeuronSignal,
  type NeuronSynapse,
  type PopulationCycleRecord,
  type PopulationSnapshot,
} from "./digitalNeuronContracts";
import {
  DigitalNeuronKernel,
  emittedSignalFromFiring,
  plasticSynapseWeight,
} from "./digitalNeuronKernel";
import { validCompiledPopulation } from "./cognitivePopulationCompiler";

export interface PopulationRunResult {
  readonly state: "QUIESCENT" | "CYCLE_LIMIT_REACHED";
  readonly cyclesExecuted: number;
  readonly firings: number;
  readonly emittedSignals: number;
  readonly snapshot: PopulationSnapshot;
  readonly grantsAuthority: false;
}

export interface PopulationMetrics {
  readonly populationId: string;
  readonly addressCapacity: string;
  readonly materializedNeurons: number;
  readonly activeNeurons: number;
  readonly synapses: number;
  readonly pendingSignals: number;
  readonly externalSignalsAdmitted: number;
  readonly rejectedSignals: number;
  readonly totalFirings: number;
  readonly suppressedFirings: number;
  readonly guardianFeedbackEvents: number;
  readonly cycles: number;
  readonly activeModelExecutions: 0;
  readonly residentScaleVerified: boolean;
  readonly distributedExecutionImplemented: false;
  readonly authority: typeof DIGITAL_NEURON_AUTHORITY;
}

type SuppressionReason = "GLOBAL_BUDGET" | "FAMILY_BUDGET" | "COMPETITION" | "DUPLICATE";
interface CandidateFiring { readonly firing: NeuronFiring; readonly ordinal: number; readonly genome: DigitalNeuronGenome; }
interface AcceptedAndSuppressed {
  readonly accepted: readonly CandidateFiring[];
  readonly suppressed: readonly { readonly candidate: CandidateFiring; readonly reason: SuppressionReason }[];
}

function traceEvent(kind: string, payload: unknown): Readonly<{ kind: string; digest: string }> {
  return Object.freeze({ kind, digest: connectomeDigest([kind, payload]) });
}

function firingOrder(left: CandidateFiring, right: CandidateFiring): number {
  if (right.firing.activation !== left.firing.activation) return right.firing.activation - left.firing.activation;
  const roots = right.firing.evidenceRoots.length - left.firing.evidenceRoots.length;
  return roots !== 0 ? roots : left.firing.neuronId.localeCompare(right.firing.neuronId);
}

/**
 * Process-local, event-driven connectome simulator. It has no timers, background
 * workers, model calls, filesystem access, network access, or Omega authority.
 */
export class CognitivePopulationRuntime {
  readonly #compiled: CompiledPopulation;
  readonly #kernels: readonly DigitalNeuronKernel[];
  readonly #ordinalById: ReadonlyMap<string, number>;
  readonly #weights: Float64Array;
  readonly #signalQueue = new Map<number, NeuronSignal[]>();
  readonly #externalSignalIds = new Set<string>();
  readonly #allSignalIds = new Set<string>();
  readonly #feedbackIds = new Set<string>();
  readonly #trace: { kind: string; digest: string }[] = [];
  readonly #cycleRecords: PopulationCycleRecord[] = [];
  #cycle = 0;
  #externalSignals = 0;
  #rejectedSignals = 0;
  #totalFirings = 0;
  #suppressedFirings = 0;
  #emittedSignals = 0;
  #previousActiveFraction = 0;
  #pendingSignals = 0;

  constructor(compiled: CompiledPopulation) {
    if (!validCompiledPopulation(compiled)) throw new Error("compiled_population_invalid");
    this.#compiled = compiled;
    this.#ordinalById = new Map(compiled.identities.map((identity, ordinal) => [identity.neuronId, ordinal]));
    this.#kernels = Object.freeze(compiled.identities.map((identity, ordinal) => {
      const template = compiled.templateByOrdinal[ordinal];
      const genome = compiled.genomesByTemplate[template];
      if (!genome) throw new Error("compiled_population_genome_missing");
      return DigitalNeuronKernel.create(identity, genome);
    }));
    this.#weights = new Float64Array(compiled.synapses.map((synapse) => synapse.weight));
    this.#record("POPULATION_CREATED", { populationDigest: compiled.populationDigest,
      neurons: compiled.identities.length, synapses: compiled.synapses.length });
  }

  get cycle(): number { return this.#cycle; }

  #record(kind: string, payload: unknown): void {
    if (this.#trace.length >= this.#compiled.limits.maximumTraceEvents) throw new Error("population_trace_budget_exhausted");
    this.#trace.push(traceEvent(kind, payload));
  }

  #assertTraceCapacity(additional: number): void {
    if (!Number.isSafeInteger(additional) || additional < 0
      || this.#trace.length + additional > this.#compiled.limits.maximumTraceEvents) {
      throw new Error("population_trace_budget_exhausted");
    }
  }

  #enqueue(signal: NeuronSignal, external: boolean): void {
    if (this.#allSignalIds.has(signal.signalId)) throw new Error("population_signal_duplicate");
    if (this.#pendingSignals >= this.#compiled.limits.maximumQueuedSignals) {
      throw new Error("population_signal_queue_exhausted");
    }
    this.#allSignalIds.add(signal.signalId);
    if (external) this.#externalSignalIds.add(signal.signalId);
    const bucket = this.#signalQueue.get(signal.cycle) ?? [];
    bucket.push(immutableConnectomeValue(signal));
    bucket.sort((left, right) => left.targetId.localeCompare(right.targetId)
      || left.signalId.localeCompare(right.signalId));
    this.#signalQueue.set(signal.cycle, bucket);
    this.#pendingSignals += 1;
  }

  inject(signal: NeuronSignal): void {
    if (!validNeuronSignal(signal, this.#compiled.candidateBinding)
      || !this.#ordinalById.has(signal.targetId) || signal.cycle < this.#cycle
      || signal.cycle >= this.#compiled.limits.maximumCyclesPerRun
      || !signal.sourceId.startsWith("external:")) throw new Error("external_neuron_signal_invalid");
    if (this.#externalSignals >= this.#compiled.limits.maximumExternalSignals) {
      throw new Error("population_external_signal_budget_exhausted");
    }
    this.#assertTraceCapacity(1);
    this.#enqueue(signal, true);
    this.#externalSignals += 1;
    this.#record("EXTERNAL_SIGNAL_ADMITTED", { signalId: signal.signalId, targetId: signal.targetId,
      cycle: signal.cycle, provenanceRoot: signal.provenanceRoot, evidenceClass: signal.evidenceClass });
  }

  #candidates(firings: readonly NeuronFiring[]): CandidateFiring[] {
    return firings.map((firing) => {
      const ordinal = this.#ordinalById.get(firing.neuronId);
      if (ordinal === undefined) throw new Error("population_firing_identity_unknown");
      const genome = this.#compiled.genomesByTemplate[this.#compiled.templateByOrdinal[ordinal]];
      if (!genome) throw new Error("population_firing_genome_missing");
      return { firing, ordinal, genome };
    }).sort(firingOrder);
  }

  #selectFirings(firings: readonly NeuronFiring[]): AcceptedAndSuppressed {
    const candidates = this.#candidates(firings);
    const accepted: CandidateFiring[] = [];
    const suppressed: { candidate: CandidateFiring; reason: SuppressionReason }[] = [];
    const familyCounts = new Map<string, number>();
    const groupCandidates = new Map<string, CandidateFiring[]>();

    // Exact integration digests indicate identical admitted evidence and local
    // computation. Keep the strongest representative rather than manufacturing consensus.
    const seenIntegrations = new Set<string>();
    for (const candidate of candidates) {
      if (seenIntegrations.has(candidate.firing.integrationDigest)) {
        suppressed.push({ candidate, reason: "DUPLICATE" });
        continue;
      }
      seenIntegrations.add(candidate.firing.integrationDigest);
      if (candidate.genome.role === "ACTION_PROPOSAL"
        && (candidate.firing.evidenceRoots.length < this.#compiled.policy.requireIndependentRootsForAction
          || candidate.firing.evidenceCorrelationGroups.length
            < this.#compiled.policy.requireIndependentRootsForAction)) {
        suppressed.push({ candidate, reason: "COMPETITION" });
        continue;
      }
      if (candidate.genome.competitionGroup) {
        const competitionKey = `${candidate.genome.role}:${candidate.genome.competitionGroup}`;
        const group = groupCandidates.get(competitionKey) ?? [];
        group.push(candidate);
        groupCandidates.set(competitionKey, group);
      } else accepted.push(candidate);
    }

    for (const group of groupCandidates.values()) {
      group.sort(firingOrder);
      const winner = group[0];
      accepted.push(winner);
      let minorities = 0;
      for (const candidate of group.slice(1)) {
        const distance = winner.firing.activation - candidate.firing.activation;
        const preserve = minorities < this.#compiled.policy.preserveMinorityPerCompetitionGroup
          && distance >= this.#compiled.policy.winnerMargin;
        if (preserve) { accepted.push(candidate); minorities += 1; }
        else suppressed.push({ candidate, reason: "COMPETITION" });
      }
    }

    accepted.sort(firingOrder);
    const afterFamilies: CandidateFiring[] = [];
    for (const candidate of accepted) {
      const count = familyCounts.get(candidate.genome.semanticFamily) ?? 0;
      if (count >= this.#compiled.limits.maximumFiringsPerSemanticFamily) {
        suppressed.push({ candidate, reason: "FAMILY_BUDGET" });
      } else {
        familyCounts.set(candidate.genome.semanticFamily, count + 1);
        afterFamilies.push(candidate);
      }
    }

    const bounded = afterFamilies.slice(0, this.#compiled.limits.maximumFiringsPerCycle);
    for (const candidate of afterFamilies.slice(this.#compiled.limits.maximumFiringsPerCycle)) {
      suppressed.push({ candidate, reason: "GLOBAL_BUDGET" });
    }
    return { accepted: Object.freeze(bounded), suppressed: Object.freeze(suppressed) };
  }

  #outgoing(candidate: CandidateFiring): readonly { synapse: NeuronSynapse; weight: number }[] {
    const range = this.#compiled.outgoingRanges[candidate.ordinal];
    if (!range || range.end <= range.start) return [];
    const outgoing: { synapse: NeuronSynapse; weight: number }[] = [];
    for (let index = range.start; index < range.end; index += 1) {
      const synapse = this.#compiled.synapses[index];
      if (synapse.sourceId === candidate.firing.neuronId) outgoing.push({ synapse, weight: this.#weights[index] });
    }
    return outgoing;
  }

  step(): PopulationCycleRecord {
    if (this.#cycle >= this.#compiled.limits.maximumCyclesPerRun) throw new Error("population_cycle_budget_exhausted");
    const signals = this.#signalQueue.get(this.#cycle) ?? [];
    const byTarget = new Map<string, NeuronSignal[]>();
    let rejected = 0;
    for (const signal of signals) {
      if (signal.expiresAfterCycle < this.#cycle || !this.#ordinalById.has(signal.targetId)) { rejected += 1; continue; }
      const bucket = byTarget.get(signal.targetId) ?? [];
      bucket.push(signal);
      byTarget.set(signal.targetId, bucket);
    }

    // Preflight every bounded side effect before mutating neuron state. The
    // outgoing bound is conservative but makes budget failure transactional.
    const maximumEmissions = [...byTarget.keys()].reduce((sum, targetId) => {
      const ordinal = this.#ordinalById.get(targetId)!;
      const range = this.#compiled.outgoingRanges[ordinal];
      return sum + Math.max(0, range.end - range.start);
    }, 0);
    if (this.#pendingSignals - signals.length + maximumEmissions
      > this.#compiled.limits.maximumQueuedSignals) {
      throw new Error("population_step_queue_budget_exhausted");
    }
    this.#assertTraceCapacity(byTarget.size + 1);
    this.#signalQueue.delete(this.#cycle);
    this.#pendingSignals -= signals.length;

    const firings: NeuronFiring[] = [];
    let admitted = 0;
    for (const [targetId, targetSignals] of [...byTarget.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      const ordinal = this.#ordinalById.get(targetId)!;
      const evaluation = this.#kernels[ordinal].evaluate(targetSignals, { cycle: this.#cycle,
        candidateBinding: this.#compiled.candidateBinding,
        correlationDiscount: this.#compiled.policy.duplicateCorrelationThreshold,
        globalActivityFraction: this.#previousActiveFraction });
      admitted += evaluation.admittedSignals;
      rejected += evaluation.rejectedSignals;
      if (evaluation.firing) firings.push(evaluation.firing);
    }

    const selected = this.#selectFirings(firings);
    for (const item of selected.suppressed) {
      this.#kernels[item.candidate.ordinal].suppress(item.candidate.firing, item.reason);
      this.#suppressedFirings += 1;
      this.#record("FIRING_SUPPRESSED", { neuronId: item.candidate.firing.neuronId,
        cycle: this.#cycle, reason: item.reason });
    }

    let emitted = 0;
    for (const candidate of selected.accepted) {
      this.#record("NEURON_FIRED", candidate.firing);
      for (const edge of this.#outgoing(candidate)) {
        const effectiveSynapse = edge.weight === edge.synapse.weight ? edge.synapse
          : { ...edge.synapse, weight: edge.weight };
        const signal = emittedSignalFromFiring(candidate.firing, effectiveSynapse,
          this.#compiled.candidateBinding, this.#compiled.policy.signalAttenuationPerHop);
        this.#enqueue(signal, false);
        emitted += 1;
      }
    }

    this.#totalFirings += selected.accepted.length;
    this.#emittedSignals += emitted;
    this.#rejectedSignals += rejected;
    const activeFraction = this.#compiled.identities.length === 0 ? 0
      : selected.accepted.length / this.#compiled.identities.length;
    this.#previousActiveFraction = activeFraction;
    const futureSignals = this.#pendingSignals;
    const recordPayload = { cycle: this.#cycle, admittedSignals: admitted, rejectedSignals: rejected,
      evaluatedNeurons: byTarget.size, firedNeurons: selected.accepted.length,
      inhibitedNeurons: selected.suppressed.length, emittedSignals: emitted, activeFraction,
      quiescent: futureSignals === 0, firingIds: selected.accepted.map((item) => item.firing.neuronId),
      firings: selected.accepted.map((item) => item.firing) };
    const record: PopulationCycleRecord = immutableConnectomeValue({ ...recordPayload,
      digest: connectomeDigest(recordPayload) });
    this.#cycleRecords.push(record);
    this.#record("CYCLE_COMPLETED", record);
    this.#cycle += 1;
    return record;
  }

  runUntilQuiescent(maximumCycles = this.#compiled.limits.maximumCyclesPerRun - this.#cycle): PopulationRunResult {
    if (!Number.isSafeInteger(maximumCycles) || maximumCycles < 1
      || this.#cycle + maximumCycles > this.#compiled.limits.maximumCyclesPerRun) {
      throw new Error("population_run_budget_invalid");
    }
    const start = this.#cycle;
    const firingsBefore = this.#totalFirings;
    const emittedBefore = this.#emittedSignals;
    let state: PopulationRunResult["state"] = "CYCLE_LIMIT_REACHED";
    for (let index = 0; index < maximumCycles; index += 1) {
      const record = this.step();
      if (record.quiescent) { state = "QUIESCENT"; break; }
    }
    return immutableConnectomeValue({ state, cyclesExecuted: this.#cycle - start,
      firings: this.#totalFirings - firingsBefore, emittedSignals: this.#emittedSignals - emittedBefore,
      snapshot: this.snapshot(), grantsAuthority: false });
  }

  applyGuardianFeedback(feedback: GuardianFeedback): void {
    if (!validGuardianFeedback(feedback, this.#compiled.candidateBinding)
      || feedback.cycle > this.#cycle || this.#feedbackIds.has(feedback.feedbackId)) {
      throw new Error("population_guardian_feedback_invalid");
    }
    const ordinal = this.#ordinalById.get(feedback.neuronId);
    if (ordinal === undefined) throw new Error("population_guardian_feedback_invalid");
    this.#assertTraceCapacity(1);
    this.#feedbackIds.add(feedback.feedbackId);
    this.#kernels[ordinal].applyFeedback(feedback);
    const genome = this.#compiled.genomesByTemplate[this.#compiled.templateByOrdinal[ordinal]]!;
    const range = this.#compiled.outgoingRanges[ordinal];
    for (let index = range.start; index < range.end; index += 1) {
      this.#weights[index] = plasticSynapseWeight({ ...this.#compiled.synapses[index], weight: this.#weights[index] },
        genome, feedback);
    }
    this.#record("GUARDIAN_FEEDBACK_APPLIED", { feedbackId: feedback.feedbackId, neuronId: feedback.neuronId,
      evidenceId: feedback.evidenceId, disposition: feedback.disposition, evidenceClass: feedback.evidenceClass });
  }

  neuron(neuronId: string) {
    const ordinal = this.#ordinalById.get(neuronId);
    if (ordinal === undefined) throw new Error("population_neuron_unknown");
    return this.#kernels[ordinal].snapshot();
  }

  snapshot(): PopulationSnapshot {
    const neuronStates = this.#kernels.map((kernel) => kernel.snapshot());
    const traceDigest = connectomeDigest({ populationDigest: this.#compiled.populationDigest,
      trace: this.#trace, cycles: this.#cycleRecords, weights: [...this.#weights] });
    return immutableConnectomeValue({ populationId: this.#compiled.populationId,
      populationDigest: this.#compiled.populationDigest, candidateBinding: this.#compiled.candidateBinding,
      cycle: this.#cycle, materializedNeurons: this.#compiled.identities.length,
      addressCapacity: this.#compiled.addressCapacity, synapses: this.#compiled.synapses.length,
      pendingSignals: this.#pendingSignals, neuronStates, cycleRecords: this.#cycleRecords,
      traceDigest, grantsAuthority: false });
  }

  metrics(): PopulationMetrics {
    const states = this.#kernels.map((kernel) => kernel.snapshot());
    return Object.freeze({ populationId: this.#compiled.populationId,
      addressCapacity: this.#compiled.addressCapacity, materializedNeurons: states.length,
      activeNeurons: states.filter((state) => state.lifecycle === "ACTIVE").length,
      synapses: this.#compiled.synapses.length,
      pendingSignals: this.#pendingSignals,
      externalSignalsAdmitted: this.#externalSignals, rejectedSignals: this.#rejectedSignals,
      totalFirings: this.#totalFirings, suppressedFirings: this.#suppressedFirings,
      guardianFeedbackEvents: this.#feedbackIds.size, cycles: this.#cycle,
      activeModelExecutions: 0, residentScaleVerified: states.length >= 1_000,
      distributedExecutionImplemented: false, authority: DIGITAL_NEURON_AUTHORITY });
  }
}
