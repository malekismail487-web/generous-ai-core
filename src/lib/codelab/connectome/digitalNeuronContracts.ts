import { immutableTheoryValue, theoryDigest } from "../research/theoryContracts";

/**
 * The connectome is a cognition substrate only. Neither a neuron, a guardian,
 * nor a population owns an Omega capability. Actuation must cross the existing
 * typed Omega authorization boundary.
 */
export const DIGITAL_NEURON_AUTHORITY = "COGNITION_ONLY_NO_EXECUTION_AUTHORITY" as const;
export const DIGITAL_NEURON_SCHEMA_VERSION = 1 as const;

export const NEURON_ROLES = Object.freeze([
  "EVIDENCE",
  "HYPOTHESIS",
  "FALSIFIER",
  "INTEGRATOR",
  "INHIBITORY",
  "UNCERTAINTY",
  "MEMORY",
  "ACTION_PROPOSAL",
] as const);
export type NeuronRole = typeof NEURON_ROLES[number];

export const DENDRITIC_COMPARTMENTS = Object.freeze([
  "SUPPORT",
  "CONTRADICTION",
  "CONTEXT",
  "NOVELTY",
  "UNCERTAINTY",
  "INHIBITION",
  "PREDICTION_ERROR",
] as const);
export type DendriticCompartment = typeof DENDRITIC_COMPARTMENTS[number];

export const NEURON_SIGNAL_KINDS = Object.freeze([
  "EVIDENCE",
  "EXCITATION",
  "INHIBITION",
  "CONTRADICTION",
  "UNCERTAINTY",
  "PREDICTION_ERROR",
  "REPLAY",
] as const);
export type NeuronSignalKind = typeof NEURON_SIGNAL_KINDS[number];

export type NeuronEvidenceClass = "E1" | "E2" | "E3" | "E4" | "E5";
export type NeuronLifecycleState = "DORMANT" | "READY" | "ACTIVE" | "REFRACTORY" | "RETIRED";
export type GuardianFeedbackDisposition = "CONFIRMED" | "FALSIFIED" | "INCONCLUSIVE";

export interface DendriticCompartmentGenome {
  readonly compartment: DendriticCompartment;
  /** Multiplier applied after correlation-aware aggregation. */
  readonly gain: number;
  /** Input below this magnitude is treated as noise. */
  readonly floor: number;
  /** Absolute saturation bound, protecting the circuit from signal floods. */
  readonly saturation: number;
  /** Distinct evidence roots required before this compartment can contribute. */
  readonly minimumDistinctRoots: number;
}

export interface PlasticityGenome {
  readonly enabled: boolean;
  readonly learningRate: number;
  readonly decayRate: number;
  readonly minimumWeight: number;
  readonly maximumWeight: number;
  /** Maximum absolute weight change from one feedback observation. */
  readonly maximumStep: number;
}

export interface DigitalNeuronGenome {
  readonly schemaVersion: typeof DIGITAL_NEURON_SCHEMA_VERSION;
  readonly templateId: string;
  readonly role: NeuronRole;
  readonly semanticFamily: string;
  readonly competitionGroup: string | null;
  readonly compartments: readonly DendriticCompartmentGenome[];
  readonly compartmentWeights: Readonly<Record<DendriticCompartment, number>>;
  readonly bias: number;
  readonly activationThreshold: number;
  readonly firingThreshold: number;
  readonly refractoryCycles: number;
  readonly leakRate: number;
  readonly homeostaticTarget: number;
  readonly plasticity: PlasticityGenome;
  readonly tags: readonly string[];
  readonly authority: typeof DIGITAL_NEURON_AUTHORITY;
}

export interface DigitalNeuronIdentity {
  readonly neuronId: string;
  readonly guardianId: string;
  readonly populationId: string;
  readonly ordinal: number;
  readonly generation: number;
  readonly genomeDigest: string;
  readonly lineageDigest: string;
}

export interface NeuronSignal {
  readonly signalId: string;
  readonly cycle: number;
  readonly sourceId: string;
  readonly targetId: string;
  readonly kind: NeuronSignalKind;
  readonly compartment: DendriticCompartment;
  readonly magnitude: number;
  readonly confidence: number;
  readonly evidenceClass: NeuronEvidenceClass;
  readonly provenanceRoot: string;
  /** Original independent evidence roots retained through derived neural signals. */
  readonly evidenceRoots: readonly string[];
  /** Original correlation groups retained so derived signals cannot manufacture independence. */
  readonly evidenceCorrelationGroups: readonly string[];
  /** Signals in one correlation group are discounted instead of counted as independent votes. */
  readonly correlationGroup: string;
  readonly candidateBinding: string;
  readonly expiresAfterCycle: number;
  readonly grantsAuthority: false;
}

export interface NeuronSynapse {
  readonly synapseId: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly targetCompartment: DendriticCompartment;
  readonly signalKind: NeuronSignalKind;
  readonly weight: number;
  readonly delayCycles: number;
  readonly plastic: boolean;
  readonly relation: "SUPPORTS" | "CONTRADICTS" | "INHIBITS" | "REFINES" | "RECALLS" | "PROPOSES";
}

export interface DendriticIntegration {
  readonly compartment: DendriticCompartment;
  readonly rawMagnitude: number;
  readonly correlatedMagnitude: number;
  readonly effectiveMagnitude: number;
  readonly distinctRoots: number;
  readonly distinctCorrelationGroups: number;
  readonly admittedProvenanceRoots: readonly string[];
  readonly admittedCorrelationGroups: readonly string[];
  readonly admittedSignalIds: readonly string[];
  readonly rejectedSignalIds: readonly string[];
}

export interface DigitalNeuronState {
  readonly identity: DigitalNeuronIdentity;
  readonly lifecycle: NeuronLifecycleState;
  readonly membranePotential: number;
  readonly activation: number;
  readonly lastFiredCycle: number | null;
  readonly refractoryUntilCycle: number;
  readonly firingCount: number;
  readonly suppressedCount: number;
  readonly guardian: GuardianCalibrationState;
  readonly lastIntegration: readonly DendriticIntegration[];
  readonly stateDigest: string;
}

export interface GuardianCalibrationState {
  readonly confirmedOutcomes: number;
  readonly falsifiedOutcomes: number;
  readonly inconclusiveOutcomes: number;
  readonly alpha: number;
  readonly beta: number;
  readonly calibratedReliability: number;
  readonly predictionErrorEma: number;
  readonly lastEvidenceId: string | null;
  readonly lastEvidenceClass: NeuronEvidenceClass | null;
  readonly independenceEstablished: boolean;
  readonly grantsAuthority: false;
}

export interface GuardianFeedback {
  readonly feedbackId: string;
  readonly neuronId: string;
  readonly candidateBinding: string;
  readonly disposition: GuardianFeedbackDisposition;
  readonly observedValue: number;
  readonly predictedValue: number;
  readonly evidenceId: string;
  readonly evidenceClass: "E3" | "E4" | "E5";
  readonly provenanceRoot: string;
  readonly correlationGroup: string;
  readonly environmentIdentity: string;
  readonly cycle: number;
  readonly grantsAuthority: false;
}

export interface NeuronFiring {
  readonly neuronId: string;
  readonly guardianId: string;
  readonly cycle: number;
  readonly activation: number;
  readonly membranePotential: number;
  readonly role: NeuronRole;
  readonly semanticFamily: string;
  readonly evidenceRoots: readonly string[];
  readonly evidenceCorrelationGroups: readonly string[];
  readonly integrationDigest: string;
  readonly grantsAuthority: false;
}

export interface PopulationResourceLimits {
  readonly maximumMaterializedNeurons: number;
  readonly maximumSynapses: number;
  readonly maximumExternalSignals: number;
  readonly maximumQueuedSignals: number;
  readonly maximumCyclesPerRun: number;
  readonly maximumFiringsPerCycle: number;
  readonly maximumFiringsPerSemanticFamily: number;
  readonly maximumTraceEvents: number;
  readonly maximumFanout: number;
}

export interface PopulationRuntimePolicy {
  readonly activeFractionTarget: number;
  readonly duplicateCorrelationThreshold: number;
  readonly winnerMargin: number;
  readonly preserveMinorityPerCompetitionGroup: number;
  readonly signalAttenuationPerHop: number;
  readonly requireIndependentRootsForAction: number;
  readonly authority: typeof DIGITAL_NEURON_AUTHORITY;
}

export interface PopulationGenome {
  readonly schemaVersion: typeof DIGITAL_NEURON_SCHEMA_VERSION;
  readonly populationId: string;
  readonly namespace: string;
  readonly addressCapacity: string;
  readonly candidateBinding: string;
  readonly seed: string;
  readonly neuronTemplates: readonly DigitalNeuronGenome[];
  readonly limits: PopulationResourceLimits;
  readonly policy: PopulationRuntimePolicy;
  readonly authority: typeof DIGITAL_NEURON_AUTHORITY;
}

export interface NeuronReplicationRequest {
  readonly templateId: string;
  readonly count: number;
  readonly generation: number;
  readonly ordinalStride: number;
  readonly ordinalOffset: number;
}

export interface SynapseProjectionRule {
  readonly ruleId: string;
  readonly sourceTemplateId: string;
  readonly targetTemplateId: string;
  readonly targetCompartment: DendriticCompartment;
  readonly signalKind: NeuronSignalKind;
  readonly relation: NeuronSynapse["relation"];
  readonly weight: number;
  readonly delayCycles: number;
  readonly plastic: boolean;
  readonly fanout: number;
  readonly topology: "ONE_TO_ONE" | "HASHED_SPARSE" | "ALL_TO_ALL_BOUNDED" | "RING";
}

export interface PopulationBlueprint {
  readonly genome: PopulationGenome;
  readonly replications: readonly NeuronReplicationRequest[];
  readonly projections: readonly SynapseProjectionRule[];
}

export interface CompiledPopulation {
  readonly populationId: string;
  readonly populationDigest: string;
  readonly candidateBinding: string;
  readonly addressCapacity: string;
  readonly identities: readonly DigitalNeuronIdentity[];
  readonly templateByOrdinal: readonly string[];
  readonly genomesByTemplate: Readonly<Record<string, DigitalNeuronGenome>>;
  readonly synapses: readonly NeuronSynapse[];
  readonly outgoingRanges: readonly { readonly start: number; readonly end: number }[];
  readonly limits: PopulationResourceLimits;
  readonly policy: PopulationRuntimePolicy;
  readonly authority: typeof DIGITAL_NEURON_AUTHORITY;
}

export interface PopulationCycleRecord {
  readonly cycle: number;
  readonly admittedSignals: number;
  readonly rejectedSignals: number;
  readonly evaluatedNeurons: number;
  readonly firedNeurons: number;
  readonly inhibitedNeurons: number;
  readonly emittedSignals: number;
  readonly activeFraction: number;
  readonly quiescent: boolean;
  readonly firingIds: readonly string[];
  readonly firings: readonly NeuronFiring[];
  readonly digest: string;
}

export interface PopulationSnapshot {
  readonly populationId: string;
  readonly populationDigest: string;
  readonly candidateBinding: string;
  readonly cycle: number;
  readonly materializedNeurons: number;
  readonly addressCapacity: string;
  readonly synapses: number;
  readonly pendingSignals: number;
  readonly neuronStates: readonly DigitalNeuronState[];
  readonly cycleRecords: readonly PopulationCycleRecord[];
  readonly traceDigest: string;
  readonly grantsAuthority: false;
}

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,199}$/;
const DIGEST_PATTERN = /^[a-f0-9]{40}$|^[a-f0-9]{64}$/;

export function connectomeText(value: unknown, maximum = 500): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
}

export function connectomeId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

export function connectomeDigest(value: unknown): string {
  return theoryDigest(value);
}

export function connectomeKeys(value: object, allowed: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
}

export function finiteUnit(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function finiteBounded(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

export function safeInteger(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum;
}

export function validCandidateBinding(value: unknown): value is string {
  return typeof value === "string" && DIGEST_PATTERN.test(value);
}

export function validDendriticGenome(value: DendriticCompartmentGenome): boolean {
  return Boolean(value && connectomeKeys(value, ["compartment", "gain", "floor", "saturation", "minimumDistinctRoots"])
    && DENDRITIC_COMPARTMENTS.includes(value.compartment)
    && finiteBounded(value.gain, -16, 16) && finiteBounded(value.floor, 0, 1_000)
    && finiteBounded(value.saturation, 0.000_001, 1_000) && value.floor <= value.saturation
    && safeInteger(value.minimumDistinctRoots, 0, 64));
}

export function validNeuronGenome(value: DigitalNeuronGenome): boolean {
  if (!value || !connectomeKeys(value, ["schemaVersion", "templateId", "role", "semanticFamily", "competitionGroup",
    "compartments", "compartmentWeights", "bias", "activationThreshold", "firingThreshold", "refractoryCycles",
    "leakRate", "homeostaticTarget", "plasticity", "tags", "authority"])
    || value.schemaVersion !== DIGITAL_NEURON_SCHEMA_VERSION || !connectomeId(value.templateId)
    || !NEURON_ROLES.includes(value.role) || !connectomeId(value.semanticFamily)
    || (value.competitionGroup !== null && !connectomeId(value.competitionGroup))
    || value.authority !== DIGITAL_NEURON_AUTHORITY || !Array.isArray(value.compartments)
    || value.compartments.length < 1 || value.compartments.length > DENDRITIC_COMPARTMENTS.length
    || !value.compartments.every(validDendriticGenome)
    || new Set(value.compartments.map((item) => item.compartment)).size !== value.compartments.length
    || !finiteBounded(value.bias, -16, 16) || !finiteBounded(value.activationThreshold, 0, 1)
    || !finiteBounded(value.firingThreshold, 0, 1) || value.firingThreshold < value.activationThreshold
    || !safeInteger(value.refractoryCycles, 0, 1_000) || !finiteUnit(value.leakRate)
    || !finiteUnit(value.homeostaticTarget) || !Array.isArray(value.tags) || value.tags.length > 32
    || new Set(value.tags).size !== value.tags.length || !value.tags.every((tag) => connectomeId(tag))) return false;
  const keys = Object.keys(value.compartmentWeights);
  if (keys.length !== DENDRITIC_COMPARTMENTS.length
    || !DENDRITIC_COMPARTMENTS.every((key) => finiteBounded(value.compartmentWeights[key], -16, 16))) return false;
  const plasticity = value.plasticity;
  return Boolean(plasticity && connectomeKeys(plasticity, ["enabled", "learningRate", "decayRate", "minimumWeight",
    "maximumWeight", "maximumStep"])
    && typeof plasticity.enabled === "boolean" && finiteUnit(plasticity.learningRate)
    && finiteUnit(plasticity.decayRate) && finiteBounded(plasticity.minimumWeight, -16, 16)
    && finiteBounded(plasticity.maximumWeight, -16, 16)
    && plasticity.minimumWeight <= plasticity.maximumWeight && finiteBounded(plasticity.maximumStep, 0, 4));
}

export function validPopulationLimits(value: PopulationResourceLimits): boolean {
  return Boolean(value && connectomeKeys(value, ["maximumMaterializedNeurons", "maximumSynapses",
    "maximumExternalSignals", "maximumQueuedSignals", "maximumCyclesPerRun", "maximumFiringsPerCycle",
    "maximumFiringsPerSemanticFamily", "maximumTraceEvents", "maximumFanout"])
    && safeInteger(value.maximumMaterializedNeurons, 1, 1_000_000)
    && safeInteger(value.maximumSynapses, 0, 20_000_000)
    && safeInteger(value.maximumExternalSignals, 1, 1_000_000)
    && safeInteger(value.maximumQueuedSignals, 1, 20_000_000)
    && safeInteger(value.maximumCyclesPerRun, 1, 10_000)
    && safeInteger(value.maximumFiringsPerCycle, 1, value.maximumMaterializedNeurons)
    && safeInteger(value.maximumFiringsPerSemanticFamily, 1, value.maximumFiringsPerCycle)
    && safeInteger(value.maximumTraceEvents, 1, 10_000_000)
    && safeInteger(value.maximumFanout, 1, 4_096));
}

export function validPopulationPolicy(value: PopulationRuntimePolicy): boolean {
  return Boolean(value && connectomeKeys(value, ["activeFractionTarget", "duplicateCorrelationThreshold",
    "winnerMargin", "preserveMinorityPerCompetitionGroup", "signalAttenuationPerHop",
    "requireIndependentRootsForAction", "authority"])
    && finiteUnit(value.activeFractionTarget)
    && finiteUnit(value.duplicateCorrelationThreshold) && finiteUnit(value.winnerMargin)
    && safeInteger(value.preserveMinorityPerCompetitionGroup, 0, 64)
    && finiteUnit(value.signalAttenuationPerHop)
    && safeInteger(value.requireIndependentRootsForAction, 1, 64)
    && value.authority === DIGITAL_NEURON_AUTHORITY);
}

export function validPopulationGenome(value: PopulationGenome): boolean {
  try {
    const capacity = BigInt(value?.addressCapacity ?? "invalid");
    return Boolean(value && connectomeKeys(value, ["schemaVersion", "populationId", "namespace", "addressCapacity",
      "candidateBinding", "seed", "neuronTemplates", "limits", "policy", "authority"])
      && value.schemaVersion === DIGITAL_NEURON_SCHEMA_VERSION
      && connectomeId(value.populationId) && connectomeId(value.namespace)
      && typeof value.addressCapacity === "string" && /^[1-9][0-9]{0,29}$/.test(value.addressCapacity)
      && capacity > 0n && validCandidateBinding(value.candidateBinding) && connectomeId(value.seed)
      && Array.isArray(value.neuronTemplates) && value.neuronTemplates.length > 0
      && value.neuronTemplates.length <= 1_024 && value.neuronTemplates.every(validNeuronGenome)
      && new Set(value.neuronTemplates.map((item) => item.templateId)).size === value.neuronTemplates.length
      && validPopulationLimits(value.limits) && validPopulationPolicy(value.policy)
      && value.authority === DIGITAL_NEURON_AUTHORITY);
  } catch { return false; }
}

export function validNeuronSignal(value: NeuronSignal, candidateBinding: string): boolean {
  return Boolean(value && connectomeKeys(value, ["signalId", "cycle", "sourceId", "targetId", "kind", "compartment",
    "magnitude", "confidence", "evidenceClass", "provenanceRoot", "evidenceRoots", "evidenceCorrelationGroups", "correlationGroup",
    "candidateBinding", "expiresAfterCycle", "grantsAuthority"])
    && connectomeId(value.signalId) && safeInteger(value.cycle, 0, Number.MAX_SAFE_INTEGER)
    && connectomeId(value.sourceId) && connectomeId(value.targetId) && NEURON_SIGNAL_KINDS.includes(value.kind)
    && DENDRITIC_COMPARTMENTS.includes(value.compartment) && finiteBounded(value.magnitude, -1_000, 1_000)
    && finiteUnit(value.confidence) && ["E1", "E2", "E3", "E4", "E5"].includes(value.evidenceClass)
    && connectomeId(value.provenanceRoot) && Array.isArray(value.evidenceRoots)
    && value.evidenceRoots.length > 0 && value.evidenceRoots.length <= 32
    && value.evidenceRoots.every((root) => connectomeId(root))
    && new Set(value.evidenceRoots).size === value.evidenceRoots.length
    && Array.isArray(value.evidenceCorrelationGroups) && value.evidenceCorrelationGroups.length > 0
    && value.evidenceCorrelationGroups.length <= 32
    && value.evidenceCorrelationGroups.every((group) => connectomeId(group))
    && new Set(value.evidenceCorrelationGroups).size === value.evidenceCorrelationGroups.length
    && connectomeId(value.correlationGroup)
    && value.candidateBinding === candidateBinding && safeInteger(value.expiresAfterCycle, value.cycle, Number.MAX_SAFE_INTEGER)
    && value.grantsAuthority === false);
}

export function validGuardianFeedback(value: GuardianFeedback, candidateBinding: string): boolean {
  return Boolean(value && connectomeKeys(value, ["feedbackId", "neuronId", "candidateBinding", "disposition",
    "observedValue", "predictedValue", "evidenceId", "evidenceClass", "provenanceRoot", "correlationGroup",
    "environmentIdentity", "cycle", "grantsAuthority"])
    && connectomeId(value.feedbackId) && connectomeId(value.neuronId)
    && value.candidateBinding === candidateBinding && ["CONFIRMED", "FALSIFIED", "INCONCLUSIVE"].includes(value.disposition)
    && finiteUnit(value.observedValue) && finiteUnit(value.predictedValue) && connectomeId(value.evidenceId)
    && ["E3", "E4", "E5"].includes(value.evidenceClass) && connectomeId(value.provenanceRoot)
    && connectomeId(value.correlationGroup) && connectomeId(value.environmentIdentity)
    && safeInteger(value.cycle, 0, Number.MAX_SAFE_INTEGER) && value.grantsAuthority === false);
}

export function immutableConnectomeValue<T>(value: T): T {
  return immutableTheoryValue(value);
}

export function initialGuardianCalibration(): GuardianCalibrationState {
  return immutableConnectomeValue({ confirmedOutcomes: 0, falsifiedOutcomes: 0, inconclusiveOutcomes: 0,
    alpha: 1, beta: 1, calibratedReliability: 0.5, predictionErrorEma: 0,
    lastEvidenceId: null, lastEvidenceClass: null, independenceEstablished: false, grantsAuthority: false });
}
