import { createHash } from "node:crypto";
import {
  BIOLOGICAL_CIRCUIT_AUTHORITY,
  BIOLOGICAL_CIRCUIT_SCHEMA_VERSION,
  analyzeBiologicalTopology,
  compileEpistemicArchitectureProfileFromMetrics,
  sealEpistemicArchitectureProfile,
  validBiologicalCircuit,
  validEpistemicArchitectureProfile,
  type BiologicalCircuitIR,
  type BiologicalTopologyMetrics,
  type EpistemicArchitectureProfile,
  type EpistemicArchitectureProfileDraft,
} from "./biologicalCircuitIR";

export const BIOLOGICAL_ARCHITECTURE_PORTFOLIO_VERSION = 1 as const;

export const BIOLOGICAL_SIGNAL_METRICS = Object.freeze([
  "sparsity",
  "inputFraction",
  "outputFraction",
  "inhibitoryEdgeFraction",
  "electricalEdgeFraction",
  "reciprocalEdgeFraction",
  "recurrentCoreFraction",
  "meanNormalizedWeight",
  "outDegreeCoefficientOfVariation",
  "inDegreeCoefficientOfVariation",
  "hubOutflowConcentration",
] as const satisfies readonly (keyof BiologicalTopologyMetrics)[]);

export type BiologicalSignalMetric = typeof BIOLOGICAL_SIGNAL_METRICS[number];

const PROFILE_MULTIPLIER_FIELDS = Object.freeze([
  "evidenceCopiesMultiplier",
  "hypothesisCopiesMultiplier",
  "falsifierCopiesMultiplier",
  "integratorCopiesMultiplier",
  "inhibitoryCopiesMultiplier",
  "uncertaintyCopiesMultiplier",
  "actionCopiesMultiplier",
  "routingFanoutMultiplier",
  "recurrenceCyclesMultiplier",
] as const satisfies readonly (keyof EpistemicArchitectureProfile)[]);

export type ArchitectureMultiplierField = typeof PROFILE_MULTIPLIER_FIELDS[number];

export interface BiologicalAnnotationCoverage {
  readonly nodeRoles: number;
  readonly edgeSigns: number;
  readonly edgeModalities: number;
}

export interface BiologicalMetricObservation {
  readonly datasetId: string;
  readonly organism: string;
  readonly value: number;
  readonly sourceConfidence: number;
  readonly normalizedWeight: number;
  readonly annotationCoverage: number;
}

export interface BiologicalMetricConsensus {
  readonly metric: BiologicalSignalMetric;
  readonly observations: readonly BiologicalMetricObservation[];
  readonly weightedMean: number;
  readonly median: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly normalizedDispersion: number;
  readonly agreement: number;
  /** Heuristic source/annotation coverage score; never a calibrated probability of correctness. */
  readonly confidence: number;
}

export interface BiologicalPortfolioMember {
  readonly datasetId: string;
  readonly organism: string;
  readonly nervousSystemRegion: string;
  readonly circuitDigest: string;
  readonly sourceConfidence: number;
  readonly topology: BiologicalTopologyMetrics;
  readonly annotationCoverage: BiologicalAnnotationCoverage;
  readonly architectureProfile: EpistemicArchitectureProfile;
}

export interface BiologicalPortfolioSourceSummary {
  readonly datasetId: string;
  readonly organism: string;
  readonly nervousSystemRegion: string;
  readonly circuitDigest: string;
  readonly sourceConfidence: number;
  readonly topology: BiologicalTopologyMetrics;
  readonly annotationCoverage: BiologicalAnnotationCoverage;
}

export interface BiologicalHomeostaticEnvelope {
  readonly multiplierBounds: Readonly<Record<ArchitectureMultiplierField,
    Readonly<{ minimum: number; maximum: number }>>>;
  readonly maximumPopulationBudgetRatio: number;
  readonly maximumRoutingRecurrenceProduct: number;
  readonly maximumSourceSpecificInfluence: number;
  readonly minimumConsensusInfluence: number;
}

export interface BiologicalArchitecturePortfolio {
  readonly schemaVersion: typeof BIOLOGICAL_ARCHITECTURE_PORTFOLIO_VERSION;
  readonly portfolioId: string;
  readonly sourceCircuitDigests: readonly string[];
  readonly sourceDatasetIds: readonly string[];
  readonly sourceOrganisms: readonly string[];
  readonly members: readonly BiologicalPortfolioMember[];
  readonly metricConsensus: readonly BiologicalMetricConsensus[];
  readonly conservativeConsensusProfile: EpistemicArchitectureProfile;
  readonly envelope: BiologicalHomeostaticEnvelope;
  readonly portfolioDigest: string;
  readonly authority: typeof BIOLOGICAL_CIRCUIT_AUTHORITY;
  readonly modelCallsAdded: 0;
  readonly toolsAdded: 0;
  readonly grantsAuthority: false;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");
}

function immutable<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) immutable(child);
    Object.freeze(value);
  }
  return value;
}

function rounded(value: number): number {
  return Math.round((value + Number.EPSILON) * 1e12) / 1e12;
}

function bounded(value: number): number {
  return rounded(Math.min(1, Math.max(0, value)));
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= 240
    && /^[A-Za-z0-9][A-Za-z0-9:._/-]*$/.test(value);
}

function validSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function metricUnitScale(metric: BiologicalSignalMetric): number {
  if (metric === "outDegreeCoefficientOfVariation" || metric === "inDegreeCoefficientOfVariation") return 3;
  return 1;
}

function coverageFor(metric: BiologicalSignalMetric, coverage: BiologicalAnnotationCoverage): number {
  if (metric === "inputFraction" || metric === "outputFraction") return coverage.nodeRoles;
  if (metric === "inhibitoryEdgeFraction") return coverage.edgeSigns;
  if (metric === "electricalEdgeFraction") return coverage.edgeModalities;
  return 1;
}

/** A missing annotation is unknown, never an observed zero. */
export function knownMetricValue(member: BiologicalPortfolioMember, metric: BiologicalSignalMetric): number | null {
  const coverage = coverageFor(metric, member.annotationCoverage);
  return coverage === 0 ? null : rounded(member.topology[metric] / coverage);
}

function profileMetrics(topology: BiologicalTopologyMetrics,
  coverage: BiologicalAnnotationCoverage): BiologicalTopologyMetrics {
  const value = (metric: "inputFraction" | "outputFraction" | "inhibitoryEdgeFraction" | "electricalEdgeFraction") => {
    const fraction = coverageFor(metric, coverage);
    return fraction === 0 ? 0.5 : bounded(topology[metric] / fraction);
  };
  return immutable({ ...topology, inputFraction: value("inputFraction"), outputFraction: value("outputFraction"),
    inhibitoryEdgeFraction: value("inhibitoryEdgeFraction"), electricalEdgeFraction: value("electricalEdgeFraction") });
}

function weightedMedian(observations: readonly BiologicalMetricObservation[]): number {
  const ordered = [...observations].sort((left, right) => left.value - right.value
    || left.datasetId.localeCompare(right.datasetId));
  let cumulative = 0;
  for (const observation of ordered) {
    cumulative += observation.normalizedWeight;
    if (cumulative >= 0.5) return observation.value;
  }
  return ordered.at(-1)?.value ?? 0;
}

function consensus(metric: BiologicalSignalMetric,
  members: readonly BiologicalPortfolioMember[]): BiologicalMetricConsensus {
  const admitted = members.filter((member) => coverageFor(metric, member.annotationCoverage) > 0);
  const rawWeights = admitted.map((member) => Math.max(0.05, member.sourceConfidence)
    * coverageFor(metric, member.annotationCoverage));
  const weightSum = rawWeights.reduce((sum, value) => sum + value, 0);
  const observations = immutable(admitted.map((member, index) => ({
    datasetId: member.datasetId,
    organism: member.organism,
    value: knownMetricValue(member, metric)!,
    sourceConfidence: member.sourceConfidence,
    normalizedWeight: rounded(rawWeights[index] / weightSum),
    annotationCoverage: coverageFor(metric, member.annotationCoverage),
  })).sort((left, right) => left.datasetId.localeCompare(right.datasetId)));
  if (observations.length === 0) return immutable({ metric, observations, weightedMean: 0.5,
    median: 0.5, minimum: 0.5, maximum: 0.5, normalizedDispersion: 0, agreement: 0, confidence: 0 });
  const weightedMean = rounded(observations.reduce((sum, item) => sum + item.value * item.normalizedWeight, 0));
  const minimum = Math.min(...observations.map((item) => item.value));
  const maximum = Math.max(...observations.map((item) => item.value));
  const normalizedDispersion = bounded((maximum - minimum) / metricUnitScale(metric));
  const agreement = bounded(1 - normalizedDispersion);
  const meanSourceConfidence = observations.reduce((sum, item) => sum + item.sourceConfidence, 0)
    / observations.length;
  const diversityFactor = bounded(new Set(observations.map((item) => item.organism)).size / 3);
  const coverageFactor = admitted.length / members.length;
  return immutable({ metric, observations, weightedMean, median: rounded(weightedMedian(observations)),
    minimum: rounded(minimum), maximum: rounded(maximum), normalizedDispersion, agreement,
    confidence: bounded(meanSourceConfidence * (0.7 + 0.3 * diversityFactor)
      * (0.5 + 0.5 * agreement) * coverageFactor),
  });
}

function conservativeMetrics(consensusValues: readonly BiologicalMetricConsensus[],
  members: readonly BiologicalPortfolioMember[]): BiologicalTopologyMetrics {
  const byMetric = new Map(consensusValues.map((item) => [item.metric, item]));
  const conservative = (metric: BiologicalSignalMetric): number => {
    const item = byMetric.get(metric)!;
    const scale = metricUnitScale(metric);
    const normalizedMean = bounded(item.weightedMean / scale);
    const shrunk = 0.5 + (normalizedMean - 0.5) * item.agreement * item.confidence;
    return rounded(shrunk * scale);
  };
  const nodeMean = members.reduce((sum, member) => sum + member.topology.nodes, 0) / members.length;
  const edgeMean = members.reduce((sum, member) => sum + member.topology.edges, 0) / members.length;
  const maxOutMean = members.reduce((sum, member) => sum + member.topology.maximumOutDegree, 0) / members.length;
  const maxInMean = members.reduce((sum, member) => sum + member.topology.maximumInDegree, 0) / members.length;
  const sparsity = conservative("sparsity");
  return immutable({
    nodes: Math.max(2, Math.round(nodeMean)),
    edges: Math.max(1, Math.round(edgeMean)),
    density: rounded(1 - sparsity),
    sparsity,
    inputFraction: conservative("inputFraction"),
    outputFraction: conservative("outputFraction"),
    inhibitoryEdgeFraction: conservative("inhibitoryEdgeFraction"),
    electricalEdgeFraction: conservative("electricalEdgeFraction"),
    reciprocalEdgeFraction: conservative("reciprocalEdgeFraction"),
    recurrentCoreFraction: conservative("recurrentCoreFraction"),
    meanNormalizedWeight: conservative("meanNormalizedWeight"),
    outDegreeCoefficientOfVariation: conservative("outDegreeCoefficientOfVariation"),
    inDegreeCoefficientOfVariation: conservative("inDegreeCoefficientOfVariation"),
    hubOutflowConcentration: conservative("hubOutflowConcentration"),
    maximumOutDegree: Math.max(0, Math.round(maxOutMean)),
    maximumInDegree: Math.max(0, Math.round(maxInMean)),
  });
}

function memberBounds(members: readonly BiologicalPortfolioMember[],
  consensusProfile: EpistemicArchitectureProfile): BiologicalHomeostaticEnvelope {
  const entries = PROFILE_MULTIPLIER_FIELDS.map((field) => {
    const values = [...members.map((member) => member.architectureProfile[field]), consensusProfile[field]];
    const observedMinimum = Math.min(...values);
    const observedMaximum = Math.max(...values);
    return [field, immutable({
      minimum: rounded(Math.max(0.65, observedMinimum - 0.08)),
      maximum: rounded(Math.min(1.35, observedMaximum + 0.08)),
    })] as const;
  });
  return immutable({ multiplierBounds: Object.fromEntries(entries) as BiologicalHomeostaticEnvelope["multiplierBounds"],
    maximumPopulationBudgetRatio: 1.2,
    maximumRoutingRecurrenceProduct: 1.35,
    maximumSourceSpecificInfluence: 0.3,
    minimumConsensusInfluence: 0.7,
  });
}

function validTopology(topology: BiologicalTopologyMetrics): boolean {
  return Boolean(topology && Number.isSafeInteger(topology.nodes) && topology.nodes >= 2
    && Number.isSafeInteger(topology.edges) && topology.edges >= 1
    && Object.values(topology).every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0)
    && [topology.density, topology.sparsity, topology.inputFraction, topology.outputFraction,
      topology.inhibitoryEdgeFraction, topology.electricalEdgeFraction,
      topology.reciprocalEdgeFraction, topology.recurrentCoreFraction,
      topology.meanNormalizedWeight, topology.hubOutflowConcentration].every((value) => value <= 1)
    && Math.abs(topology.density + topology.sparsity - 1) <= 1e-9);
}

function validCoverage(coverage: BiologicalAnnotationCoverage): boolean {
  return Boolean(coverage && [coverage.nodeRoles, coverage.edgeSigns, coverage.edgeModalities]
    .every((value) => Number.isFinite(value) && value >= 0 && value <= 1));
}

function topologyCompatibleWithCoverage(topology: BiologicalTopologyMetrics,
  coverage: BiologicalAnnotationCoverage): boolean {
  return topology.inputFraction <= coverage.nodeRoles + 1e-9
    && topology.outputFraction <= coverage.nodeRoles + 1e-9
    && topology.inhibitoryEdgeFraction <= coverage.edgeSigns + 1e-9
    && topology.electricalEdgeFraction <= coverage.edgeModalities + 1e-9;
}

export function compileBiologicalArchitecturePortfolioFromSummaries(input: {
  readonly portfolioId: string;
  readonly sources: readonly BiologicalPortfolioSourceSummary[];
}): BiologicalArchitecturePortfolio {
  if (!validId(input.portfolioId) || input.sources.length < 2
    || input.sources.some((source) => !validId(source.datasetId) || !validSha256(source.circuitDigest)
      || typeof source.organism !== "string" || source.organism.trim().length < 3
      || typeof source.nervousSystemRegion !== "string" || source.nervousSystemRegion.trim().length < 3
      || !Number.isFinite(source.sourceConfidence) || source.sourceConfidence <= 0
      || source.sourceConfidence > 1 || !validTopology(source.topology)
      || !validCoverage(source.annotationCoverage)
      || !topologyCompatibleWithCoverage(source.topology, source.annotationCoverage))
    || new Set(input.sources.map((source) => source.datasetId)).size !== input.sources.length
    || new Set(input.sources.map((source) => source.organism)).size < 2) {
    throw new Error("biological_architecture_portfolio_sources_invalid");
  }
  const sources = [...input.sources].sort((left, right) => left.datasetId.localeCompare(right.datasetId));
  const members = immutable(sources.map((source): BiologicalPortfolioMember => {
    const topology = immutable({ ...source.topology });
    return immutable({
      datasetId: source.datasetId,
      organism: source.organism,
      nervousSystemRegion: source.nervousSystemRegion,
      circuitDigest: source.circuitDigest,
      sourceConfidence: source.sourceConfidence,
      topology,
      annotationCoverage: immutable({ ...source.annotationCoverage }),
      architectureProfile: compileEpistemicArchitectureProfileFromMetrics({
        profileId: `${input.portfolioId}:source:${source.datasetId}`,
        sourceDigest: source.circuitDigest,
        metrics: profileMetrics(topology, source.annotationCoverage),
      }),
    });
  }));
  const metricConsensus = immutable(BIOLOGICAL_SIGNAL_METRICS.map((metric) => consensus(metric, members)));
  const sourceDigest = sha256(members.map((member) => ({
    datasetId: member.datasetId,
    circuitDigest: member.circuitDigest,
    profileDigest: member.architectureProfile.profileDigest,
  })));
  const conservativeConsensusProfile = compileEpistemicArchitectureProfileFromMetrics({
    profileId: `${input.portfolioId}:conservative-consensus`,
    sourceDigest,
    metrics: conservativeMetrics(metricConsensus, members),
  });
  const body = {
    schemaVersion: BIOLOGICAL_ARCHITECTURE_PORTFOLIO_VERSION,
    portfolioId: input.portfolioId,
    sourceCircuitDigests: immutable(members.map((member) => member.circuitDigest)),
    sourceDatasetIds: immutable(members.map((member) => member.datasetId)),
    sourceOrganisms: immutable([...new Set(members.map((member) => member.organism))].sort()),
    members,
    metricConsensus,
    conservativeConsensusProfile,
    envelope: memberBounds(members, conservativeConsensusProfile),
    authority: BIOLOGICAL_CIRCUIT_AUTHORITY,
    modelCallsAdded: 0 as const,
    toolsAdded: 0 as const,
    grantsAuthority: false as const,
  };
  return immutable({ ...body, portfolioDigest: sha256(body) });
}

export function compileBiologicalArchitecturePortfolio(input: {
  readonly portfolioId: string;
  readonly circuits: readonly BiologicalCircuitIR[];
}): BiologicalArchitecturePortfolio {
  if (input.circuits.some((circuit) => !validBiologicalCircuit(circuit))) {
    throw new Error("biological_architecture_portfolio_sources_invalid");
  }
  return compileBiologicalArchitecturePortfolioFromSummaries({
    portfolioId: input.portfolioId,
    sources: input.circuits.map((circuit) => ({
      datasetId: circuit.provenance.datasetId,
      organism: circuit.provenance.organism,
      nervousSystemRegion: circuit.provenance.nervousSystemRegion,
      circuitDigest: circuit.circuitDigest,
      sourceConfidence: circuit.provenance.sourceConfidence,
      topology: analyzeBiologicalTopology(circuit),
      annotationCoverage: {
        nodeRoles: rounded(circuit.nodes.filter((node) => node.role !== "UNKNOWN").length / circuit.nodes.length),
        edgeSigns: rounded(circuit.edges.filter((edge) => edge.sign !== "UNKNOWN").length / circuit.edges.length),
        edgeModalities: rounded(circuit.edges.filter((edge) => edge.modality !== "UNKNOWN").length / circuit.edges.length),
      },
    })),
  });
}

function validBounds(envelope: BiologicalHomeostaticEnvelope): boolean {
  if (!envelope || envelope.maximumPopulationBudgetRatio < 1 || envelope.maximumPopulationBudgetRatio > 2
    || envelope.maximumRoutingRecurrenceProduct < 1 || envelope.maximumRoutingRecurrenceProduct > 2
    || envelope.maximumSourceSpecificInfluence < 0 || envelope.maximumSourceSpecificInfluence > 0.5
    || envelope.minimumConsensusInfluence < 0.5 || envelope.minimumConsensusInfluence > 1
    || rounded(envelope.maximumSourceSpecificInfluence + envelope.minimumConsensusInfluence) !== 1) return false;
  return PROFILE_MULTIPLIER_FIELDS.every((field) => {
    const bounds = envelope.multiplierBounds[field];
    return bounds && Number.isFinite(bounds.minimum) && Number.isFinite(bounds.maximum)
      && bounds.minimum >= 0.5 && bounds.maximum <= 1.5 && bounds.minimum <= bounds.maximum;
  });
}

export function validBiologicalArchitecturePortfolio(portfolio: BiologicalArchitecturePortfolio): boolean {
  if (!portfolio || portfolio.schemaVersion !== BIOLOGICAL_ARCHITECTURE_PORTFOLIO_VERSION
    || portfolio.authority !== BIOLOGICAL_CIRCUIT_AUTHORITY || portfolio.modelCallsAdded !== 0
    || portfolio.toolsAdded !== 0 || portfolio.grantsAuthority !== false || !validId(portfolio.portfolioId)
    || !validSha256(portfolio.portfolioDigest) || portfolio.members.length < 2
    || new Set(portfolio.members.map((member) => member.datasetId)).size !== portfolio.members.length
    || new Set(portfolio.members.map((member) => member.organism)).size < 2
    || portfolio.metricConsensus.length !== BIOLOGICAL_SIGNAL_METRICS.length
    || !validEpistemicArchitectureProfile(portfolio.conservativeConsensusProfile)
    || !validBounds(portfolio.envelope)) return false;
  for (const member of portfolio.members) {
    if (!validId(member.datasetId) || !validSha256(member.circuitDigest)
      || !validEpistemicArchitectureProfile(member.architectureProfile)
      || member.architectureProfile.sourcePriorDigest !== member.circuitDigest
      || !validCoverage(member.annotationCoverage)
      || !validTopology(member.topology)
      || !topologyCompatibleWithCoverage(member.topology, member.annotationCoverage)
      || !Number.isFinite(member.sourceConfidence) || member.sourceConfidence <= 0
      || member.sourceConfidence > 1) return false;
  }
  for (const item of portfolio.metricConsensus) {
    if (!BIOLOGICAL_SIGNAL_METRICS.includes(item.metric) || item.observations.length > portfolio.members.length
      || [item.weightedMean, item.median, item.minimum, item.maximum, item.normalizedDispersion,
        item.agreement, item.confidence].some((value) => !Number.isFinite(value) || value < 0)
      || item.agreement > 1 || item.confidence > 1 || item.normalizedDispersion > 1
      || (item.observations.length > 0
        && Math.abs(item.observations.reduce((sum, observation) => sum + observation.normalizedWeight, 0) - 1)
          > 1e-9)) {
      return false;
    }
  }
  const { portfolioDigest: _digest, ...body } = portfolio;
  return sha256(body) === portfolio.portfolioDigest;
}

export function sealAdaptiveBiologicalProfile(input: {
  readonly portfolio: BiologicalArchitecturePortfolio;
  readonly profileId: string;
  readonly multipliers: Readonly<Record<ArchitectureMultiplierField, number>>;
}): EpistemicArchitectureProfile {
  if (!validBiologicalArchitecturePortfolio(input.portfolio) || !validId(input.profileId)) {
    throw new Error("adaptive_biological_profile_input_invalid");
  }
  const boundedMultipliers = Object.fromEntries(PROFILE_MULTIPLIER_FIELDS.map((field) => {
    const value = input.multipliers[field];
    const bounds = input.portfolio.envelope.multiplierBounds[field];
    if (!Number.isFinite(value)) throw new Error("adaptive_biological_profile_multiplier_invalid");
    return [field, rounded(Math.max(bounds.minimum, Math.min(bounds.maximum, value)))] as const;
  })) as Readonly<Record<ArchitectureMultiplierField, number>>;
  const routingRecurrenceProduct = boundedMultipliers.routingFanoutMultiplier
    * boundedMultipliers.recurrenceCyclesMultiplier;
  const recurrenceCorrection = routingRecurrenceProduct > input.portfolio.envelope.maximumRoutingRecurrenceProduct
    ? input.portfolio.envelope.maximumRoutingRecurrenceProduct / boundedMultipliers.routingFanoutMultiplier : null;
  const draft: EpistemicArchitectureProfileDraft = {
    schemaVersion: BIOLOGICAL_CIRCUIT_SCHEMA_VERSION,
    profileId: input.profileId,
    sourcePriorDigest: input.portfolio.portfolioDigest,
    ...boundedMultipliers,
    ...(recurrenceCorrection === null ? {} : {
      recurrenceCyclesMultiplier: rounded(recurrenceCorrection),
    }),
    authority: BIOLOGICAL_CIRCUIT_AUTHORITY,
    modelCallsAdded: 0,
    toolsAdded: 0,
    grantsAuthority: false,
  };
  return sealEpistemicArchitectureProfile(draft);
}

export const BIOLOGICAL_ARCHITECTURE_PORTFOLIO_CONTRACT = Object.freeze({
  version: "nyx-biological-architecture-portfolio/1",
  sourceSpecificTopologyPreserved: true,
  disagreementShrinksTowardNeutral: true,
  authorityIncrease: false,
  additionalModelCalls: 0,
  additionalTools: 0,
  rawConnectomeRequiredAtInference: false,
  intendedClaim: "EXPERIMENTAL_COMPUTATIONAL_PRIOR",
  forbiddenClaim: "BIOLOGICAL_EMULATION_OR_ESTABLISHED_INTELLIGENCE",
});
