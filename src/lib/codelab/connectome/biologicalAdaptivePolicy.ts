import { createHash } from "node:crypto";
import type { NyxRepairCognitionRequest } from "../cognition/nyxNemotronEngineeringCognition";
import {
  knownMetricValue,
  sealAdaptiveBiologicalProfile,
  validBiologicalArchitecturePortfolio,
  type ArchitectureMultiplierField,
  type BiologicalArchitecturePortfolio,
  type BiologicalPortfolioMember,
} from "./biologicalArchitecturePortfolio";
import type { EpistemicArchitectureProfile } from "./biologicalCircuitIR";

export const BIOLOGICAL_ADAPTIVE_POLICY_VERSION = 1 as const;

export type BiologicalCognitiveMode = "EVIDENCE_ACQUISITION" | "HYPOTHESIS_DIVERSIFICATION"
  | "ADVERSARIAL_FALSIFICATION" | "CAUSAL_INTEGRATION" | "REPAIR_CONVERGENCE";

export interface BiologicalCognitiveDemand {
  readonly evidence: number;
  readonly hypothesisDiversity: number;
  readonly falsification: number;
  readonly integration: number;
  readonly inhibition: number;
  readonly uncertainty: number;
  readonly action: number;
  readonly routing: number;
  readonly recurrence: number;
}

export interface BiologicalSourceSelection {
  readonly datasetId: string;
  readonly organism: string;
  readonly affinity: number;
  readonly normalizedWeight: number;
  readonly profileDigest: string;
}

export interface BiologicalAdaptiveSelection {
  readonly schemaVersion: typeof BIOLOGICAL_ADAPTIVE_POLICY_VERSION;
  readonly selectionId: string;
  readonly portfolioDigest: string;
  readonly requestDigest: string;
  readonly primaryMode: BiologicalCognitiveMode;
  readonly secondaryModes: readonly BiologicalCognitiveMode[];
  readonly demand: BiologicalCognitiveDemand;
  readonly sourceSelections: readonly BiologicalSourceSelection[];
  readonly profile: EpistemicArchitectureProfile;
  readonly homeostasis: Readonly<{
    populationBudgetRatio: number;
    routingRecurrenceProduct: number;
    actionSuppressedForUncertainty: boolean;
    boundedByPortfolioEnvelope: true;
  }>;
  readonly reasons: readonly string[];
  readonly selectionDigest: string;
  readonly additionalModelCalls: 0;
  readonly additionalTools: 0;
  readonly grantsAuthority: false;
}

const PROFILE_FIELDS = Object.freeze([
  "evidenceCopiesMultiplier",
  "hypothesisCopiesMultiplier",
  "falsifierCopiesMultiplier",
  "integratorCopiesMultiplier",
  "inhibitoryCopiesMultiplier",
  "uncertaintyCopiesMultiplier",
  "actionCopiesMultiplier",
  "routingFanoutMultiplier",
  "recurrenceCyclesMultiplier",
] as const satisfies readonly ArchitectureMultiplierField[]);

const POPULATION_WEIGHTS: Readonly<Record<Exclude<ArchitectureMultiplierField,
  "routingFanoutMultiplier" | "recurrenceCyclesMultiplier">, number>> = Object.freeze({
    evidenceCopiesMultiplier: 4,
    hypothesisCopiesMultiplier: 8,
    falsifierCopiesMultiplier: 4,
    integratorCopiesMultiplier: 4,
    inhibitoryCopiesMultiplier: 2,
    uncertaintyCopiesMultiplier: 2,
    actionCopiesMultiplier: 2,
  });

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

function rounded(value: number): number {
  return Math.round((value + Number.EPSILON) * 1e12) / 1e12;
}

function bounded(value: number): number {
  return rounded(Math.min(1, Math.max(0, value)));
}

function immutable<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) immutable(child);
    Object.freeze(value);
  }
  return value;
}

function fraction(value: number, saturation: number): number {
  return bounded(value / Math.max(1, saturation));
}

function requestSignals(request: NyxRepairCognitionRequest) {
  const observation = request.observation;
  const hypotheses = request.priorHypotheses;
  const falsified = hypotheses.filter((item) => item.disposition === "FALSIFIED").length;
  const partial = hypotheses.filter((item) => item.disposition === "PARTIALLY_SUPPORTED").length;
  const unresolved = hypotheses.filter((item) => item.disposition === "INSUFFICIENT_EVIDENCE").length;
  const qualityFindings = request.candidateQualityFeedback?.findings.length ?? 0;
  const evidenceDeficit = request.availableEvidence.length === 0 ? 1
    : bounded(1 - request.availableEvidence.length / Math.max(1, request.files.length + 2));
  const epistemicUncertainty = observation.epistemicState === "SUPPORTED" ? 0.1
    : observation.epistemicState === "CONFLICTED" ? 1 : 0.8;
  const failurePressure = observation.state.endsWith("_FAIL") ? 0.8
    : observation.state === "TIMEOUT" || observation.state === "INFRASTRUCTURE_ERROR" ? 1 : 0.2;
  return immutable({
    contradictions: observation.contradictions.length,
    unknowns: observation.unknowns.length,
    diagnostics: observation.diagnostics.length,
    priorHypotheses: hypotheses.length,
    falsified,
    partial,
    unresolved,
    cognitionFailures: request.priorCognitionFailures.length,
    qualityFindings,
    evidenceDeficit,
    epistemicUncertainty,
    attributionUncertainty: bounded(1 - observation.attributionConfidence),
    failurePressure,
    hasCandidateQualityFeedback: request.candidateQualityFeedback !== null,
    repeatedFailure: falsified + request.priorCognitionFailures.length >= 2,
  });
}

export function deriveBiologicalCognitiveDemand(
  request: NyxRepairCognitionRequest,
): BiologicalCognitiveDemand {
  const signal = requestSignals(request);
  const contradictionPressure = bounded(fraction(signal.contradictions, 4)
    + fraction(signal.falsified, 3) * 0.5);
  const unresolvedPressure = bounded(fraction(signal.unknowns + signal.unresolved, 5)
    + signal.evidenceDeficit * 0.5);
  const retryPressure = bounded(fraction(signal.cognitionFailures + signal.falsified, 4));
  const diagnosticPressure = bounded(fraction(signal.diagnostics + signal.qualityFindings, 8));
  const convergenceEvidence = bounded((1 - signal.evidenceDeficit)
    * (1 - signal.epistemicUncertainty * 0.6)
    * (1 - contradictionPressure * 0.5));
  return immutable({
    evidence: bounded(0.25 + unresolvedPressure * 0.6 + signal.attributionUncertainty * 0.15),
    hypothesisDiversity: bounded(0.25 + retryPressure * 0.55 + diagnosticPressure * 0.2),
    falsification: bounded(0.3 + contradictionPressure * 0.55 + signal.failurePressure * 0.15),
    integration: bounded(0.35 + diagnosticPressure * 0.35 + contradictionPressure * 0.3),
    inhibition: bounded(0.25 + contradictionPressure * 0.5 + retryPressure * 0.25),
    uncertainty: bounded(0.2 + unresolvedPressure * 0.45 + signal.epistemicUncertainty * 0.35),
    action: bounded(0.15 + convergenceEvidence * 0.75 + (signal.hasCandidateQualityFeedback ? 0.1 : 0)),
    routing: bounded(0.3 + diagnosticPressure * 0.3 + unresolvedPressure * 0.2
      + fraction(request.files.length, 8) * 0.2),
    recurrence: bounded(0.25 + retryPressure * 0.35 + contradictionPressure * 0.2
      + unresolvedPressure * 0.2),
  });
}

const MODE_AXES = Object.freeze({
    EVIDENCE_ACQUISITION: Object.freeze(["evidence", "uncertainty", "routing"]),
    HYPOTHESIS_DIVERSIFICATION: Object.freeze(["hypothesisDiversity", "recurrence", "routing"]),
    ADVERSARIAL_FALSIFICATION: Object.freeze(["falsification", "inhibition", "recurrence"]),
    CAUSAL_INTEGRATION: Object.freeze(["integration", "evidence", "recurrence"]),
    REPAIR_CONVERGENCE: Object.freeze(["action", "integration", "inhibition"]),
  } as const satisfies Record<BiologicalCognitiveMode, readonly (keyof BiologicalCognitiveDemand)[]>);

function modeScores(demand: BiologicalCognitiveDemand): readonly Readonly<{
  mode: BiologicalCognitiveMode;
  score: number;
}>[] {
  return immutable((Object.entries(MODE_AXES) as [BiologicalCognitiveMode,
    readonly (keyof BiologicalCognitiveDemand)[]][]).map(([mode, axes]) => ({
      mode,
      score: rounded(axes.reduce((sum, axis) => sum + demand[axis], 0) / axes.length),
    })).sort((left, right) => right.score - left.score || left.mode.localeCompare(right.mode)));
}

function sourceAffinity(member: BiologicalPortfolioMember, demand: BiologicalCognitiveDemand): number {
  const topology = member.topology;
  const recurrent = topology.recurrentCoreFraction;
  const reciprocal = topology.reciprocalEdgeFraction;
  const inhibition = knownMetricValue(member, "inhibitoryEdgeFraction") ?? 0.5;
  const convergence = bounded(topology.inDegreeCoefficientOfVariation / 3);
  const routing = bounded(topology.sparsity * 0.65 + (1 - topology.hubOutflowConcentration) * 0.35);
  const uncertainty = bounded(1 - topology.meanNormalizedWeight);
  const action = bounded((knownMetricValue(member, "outputFraction") ?? 0.5) * 0.5
    + topology.hubOutflowConcentration * 0.5);
  const score = demand.evidence * topology.sparsity
    + demand.hypothesisDiversity * recurrent
    + demand.falsification * inhibition
    + demand.integration * convergence
    + demand.inhibition * bounded(inhibition + reciprocal * 0.25)
    + demand.uncertainty * uncertainty
    + demand.action * action
    + demand.routing * routing
    + demand.recurrence * bounded(recurrent * 0.7 + reciprocal * 0.3);
  return rounded(Math.max(0.000001, score * member.sourceConfidence));
}

function selectSources(portfolio: BiologicalArchitecturePortfolio,
  demand: BiologicalCognitiveDemand): readonly BiologicalSourceSelection[] {
  const raw = portfolio.members.map((member) => ({ member, affinity: sourceAffinity(member, demand) }));
  const total = raw.reduce((sum, item) => sum + item.affinity, 0);
  return immutable(raw.map(({ member, affinity }) => ({
    datasetId: member.datasetId,
    organism: member.organism,
    affinity,
    normalizedWeight: rounded(affinity / total),
    profileDigest: member.architectureProfile.profileDigest,
  })).sort((left, right) => right.normalizedWeight - left.normalizedWeight
    || left.datasetId.localeCompare(right.datasetId)));
}

function profileBlend(portfolio: BiologicalArchitecturePortfolio,
  selections: readonly BiologicalSourceSelection[]): Record<ArchitectureMultiplierField, number> {
  const members = new Map(portfolio.members.map((member) => [member.datasetId, member]));
  return Object.fromEntries(PROFILE_FIELDS.map((field) => {
    const selected = selections.reduce((sum, selection) => sum
      + members.get(selection.datasetId)!.architectureProfile[field] * selection.normalizedWeight, 0);
    const envelope = portfolio.envelope;
    const blended = portfolio.conservativeConsensusProfile[field] * envelope.minimumConsensusInfluence
      + selected * envelope.maximumSourceSpecificInfluence;
    return [field, rounded(blended)];
  })) as Record<ArchitectureMultiplierField, number>;
}

function demandOffsets(demand: BiologicalCognitiveDemand): Readonly<Record<ArchitectureMultiplierField, number>> {
  const centered = (value: number, amplitude: number) => (value - 0.5) * amplitude;
  return Object.freeze({
    evidenceCopiesMultiplier: centered(demand.evidence, 0.12),
    hypothesisCopiesMultiplier: centered(demand.hypothesisDiversity, 0.12),
    falsifierCopiesMultiplier: centered(demand.falsification, 0.12),
    integratorCopiesMultiplier: centered(demand.integration, 0.1),
    inhibitoryCopiesMultiplier: centered(demand.inhibition, 0.1),
    uncertaintyCopiesMultiplier: centered(demand.uncertainty, 0.1),
    actionCopiesMultiplier: centered(demand.action, 0.1),
    routingFanoutMultiplier: centered(demand.routing, 0.08),
    recurrenceCyclesMultiplier: centered(demand.recurrence, 0.1),
  });
}

function enforcePopulationBudget(multipliers: Record<ArchitectureMultiplierField, number>,
  maximumRatio: number): Record<ArchitectureMultiplierField, number> {
  const populationFields = Object.keys(POPULATION_WEIGHTS) as (keyof typeof POPULATION_WEIGHTS)[];
  const base = populationFields.reduce((sum, field) => sum + POPULATION_WEIGHTS[field], 0);
  const requested = populationFields.reduce((sum, field) =>
    sum + POPULATION_WEIGHTS[field] * multipliers[field], 0);
  if (requested / base <= maximumRatio) return multipliers;
  const excessScale = (maximumRatio * base - base) / Math.max(0.000001, requested - base);
  const corrected = { ...multipliers };
  for (const field of populationFields) corrected[field] = rounded(1 + (multipliers[field] - 1) * excessScale);
  return corrected;
}

function populationBudgetRatio(profile: EpistemicArchitectureProfile): number {
  const fields = Object.keys(POPULATION_WEIGHTS) as (keyof typeof POPULATION_WEIGHTS)[];
  const base = fields.reduce((sum, field) => sum + POPULATION_WEIGHTS[field], 0);
  const actual = fields.reduce((sum, field) => sum + POPULATION_WEIGHTS[field] * profile[field], 0);
  return rounded(actual / base);
}

function reasonsFor(demand: BiologicalCognitiveDemand, modes: ReturnType<typeof modeScores>): readonly string[] {
  const reasons = [`primary-mode:${modes[0].mode.toLowerCase()}`];
  if (demand.uncertainty >= 0.65) reasons.push("epistemic-uncertainty-elevated");
  if (demand.falsification >= 0.65) reasons.push("counterexample-pressure-elevated");
  if (demand.hypothesisDiversity >= 0.65) reasons.push("strategy-diversification-required");
  if (demand.action >= 0.65) reasons.push("evidence-supports-bounded-convergence");
  if (demand.recurrence >= 0.65) reasons.push("bounded-revision-pressure-elevated");
  return immutable(reasons);
}

export function selectAdaptiveBiologicalArchitecture(input: {
  readonly portfolio: BiologicalArchitecturePortfolio;
  readonly request: NyxRepairCognitionRequest;
}): BiologicalAdaptiveSelection {
  if (!validBiologicalArchitecturePortfolio(input.portfolio)) {
    throw new Error("biological_adaptive_portfolio_invalid");
  }
  const demand = deriveBiologicalCognitiveDemand(input.request);
  const modes = modeScores(demand);
  const selections = selectSources(input.portfolio, demand);
  const multipliers = profileBlend(input.portfolio, selections);
  const offsets = demandOffsets(demand);
  for (const field of PROFILE_FIELDS) multipliers[field] = rounded(multipliers[field] + offsets[field]);
  let actionSuppressedForUncertainty = false;
  if (demand.uncertainty > demand.action && multipliers.actionCopiesMultiplier > 1) {
    multipliers.actionCopiesMultiplier = 1;
    actionSuppressedForUncertainty = true;
  }
  const budgeted = enforcePopulationBudget(multipliers, input.portfolio.envelope.maximumPopulationBudgetRatio);
  const requestDigest = sha256({
    cognitionRequestId: input.request.cognitionRequestId,
    observationId: input.request.observation.observationId,
    candidateCommit: input.request.observation.candidateCommit,
    observationState: input.request.observation.state,
    epistemicState: input.request.observation.epistemicState,
    diagnostics: input.request.observation.diagnostics.map((item) => ({ category: item.category, code: item.code })),
    unknownCount: input.request.observation.unknowns.length,
    contradictionCount: input.request.observation.contradictions.length,
    priorHypotheses: input.request.priorHypotheses.map((item) => ({
      hypothesisId: item.hypothesisId,
      disposition: item.disposition,
      strategyDigest: item.strategyDigest,
    })),
    priorCognitionFailureCount: input.request.priorCognitionFailures.length,
    qualityFindingCodes: input.request.candidateQualityFeedback?.findings.map((item) => item.code) ?? [],
  });
  const selectionId = `bio-selection:${sha256({
    portfolioDigest: input.portfolio.portfolioDigest,
    requestDigest,
    demand,
    selections,
  }).slice(0, 32)}`;
  const profile = sealAdaptiveBiologicalProfile({
    portfolio: input.portfolio,
    profileId: `${input.portfolio.portfolioId}:adaptive:${selectionId.slice(-32)}`,
    multipliers: budgeted,
  });
  const body = {
    schemaVersion: BIOLOGICAL_ADAPTIVE_POLICY_VERSION,
    selectionId,
    portfolioDigest: input.portfolio.portfolioDigest,
    requestDigest,
    primaryMode: modes[0].mode,
    secondaryModes: immutable(modes.slice(1, 3).map((item) => item.mode)),
    demand,
    sourceSelections: selections,
    profile,
    homeostasis: immutable({
      populationBudgetRatio: populationBudgetRatio(profile),
      routingRecurrenceProduct: rounded(profile.routingFanoutMultiplier * profile.recurrenceCyclesMultiplier),
      actionSuppressedForUncertainty,
      boundedByPortfolioEnvelope: true as const,
    }),
    reasons: reasonsFor(demand, modes),
    additionalModelCalls: 0 as const,
    additionalTools: 0 as const,
    grantsAuthority: false as const,
  };
  return immutable({ ...body, selectionDigest: sha256(body) });
}

export function validBiologicalAdaptiveSelection(selection: BiologicalAdaptiveSelection,
  portfolio: BiologicalArchitecturePortfolio): boolean {
  if (!selection || selection.schemaVersion !== BIOLOGICAL_ADAPTIVE_POLICY_VERSION
    || selection.portfolioDigest !== portfolio.portfolioDigest || selection.additionalModelCalls !== 0
    || selection.additionalTools !== 0 || selection.grantsAuthority !== false
    || !/^bio-selection:[a-f0-9]{32}$/.test(selection.selectionId)
    || !/^[a-f0-9]{64}$/.test(selection.requestDigest)
    || !/^[a-f0-9]{64}$/.test(selection.selectionDigest)
    || !validBiologicalArchitecturePortfolio(portfolio)
    || selection.sourceSelections.length !== portfolio.members.length
    || Math.abs(selection.sourceSelections.reduce((sum, item) => sum + item.normalizedWeight, 0) - 1) > 1e-9
    || selection.homeostasis.populationBudgetRatio > portfolio.envelope.maximumPopulationBudgetRatio
    || selection.homeostasis.routingRecurrenceProduct > portfolio.envelope.maximumRoutingRecurrenceProduct
    || selection.profile.sourcePriorDigest !== portfolio.portfolioDigest) return false;
  const { selectionDigest: _digest, ...body } = selection;
  return sha256(body) === selection.selectionDigest;
}

export const BIOLOGICAL_ADAPTIVE_POLICY_CONTRACT = Object.freeze({
  version: "nyx-biological-adaptive-policy/1",
  inputAuthority: "OMEGA_ADMITTED_EVIDENCE_ONLY",
  sourceSpecificReasoning: true,
  deterministicSelection: true,
  homeostaticPopulationBound: true,
  homeostaticRoutingRecurrenceBound: true,
  uncertaintyCanSuppressAction: true,
  additionalModelCalls: 0,
  additionalTools: 0,
  authorityIncrease: false,
});
