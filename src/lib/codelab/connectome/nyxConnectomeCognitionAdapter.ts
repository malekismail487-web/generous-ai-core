import { createHash } from "node:crypto";
import type {
  NyxNemotronEngineeringCognition,
  NyxRepairCognitionRequest,
  NyxRepairCognitionResult,
} from "../cognition/nyxNemotronEngineeringCognition";
import {
  immutableTheoryValue,
  theoryDigest,
  validTheoryResearchContext,
  type TheoryResearchContext,
} from "../research/theoryContracts";
import {
  EpistemicMicrocircuit,
  type EpistemicCircuitScale,
  type EpistemicCircuitDecision,
  type EpistemicEvidencePacket,
} from "./epistemicMicrocircuit";
import {
  validEpistemicArchitectureProfile,
  type EpistemicArchitectureProfile,
} from "./biologicalCircuitIR";
import {
  validBiologicalArchitecturePortfolio,
  type BiologicalArchitecturePortfolio,
} from "./biologicalArchitecturePortfolio";
import {
  selectAdaptiveBiologicalArchitecture,
  validBiologicalAdaptiveSelection,
  type BiologicalAdaptiveSelection,
  type BiologicalCognitiveMode,
} from "./biologicalAdaptivePolicy";

export const NYX_CONNECTOME_COGNITION_ADAPTER_STATUS = Object.freeze({
  chunkId: "OMEGA-NYX-CONNECTOME-ABLATION-001",
  maturity: "EXPERIMENTAL_NOT_YET_CAUSALLY_VALIDATED",
  purpose: "AUTHORITY_NEUTRAL_EPISTEMIC_AUGMENTATION",
  additionalModelCalls: 0,
  additionalTools: 0,
  additionalVerificationRuns: 0,
  additionalMutationAuthority: false,
  grantsAuthority: false,
} as const);

export interface NyxConnectomeCognitionTrace {
  readonly cognitionRequestId: string;
  readonly candidateBinding: string;
  readonly contextDigest: string;
  readonly circuitState: EpistemicCircuitDecision["state"];
  readonly selectedHypothesis: string | null;
  readonly selectedAction: string | null;
  readonly confidenceMargin: number;
  readonly independentEvidenceRoots: number;
  readonly independentEvidenceCorrelationGroups: number;
  readonly rankedHypotheses: readonly Readonly<{
    hypothesisId: string;
    peakActivation: number;
    meanActivation: number;
    actionCellsFired: number;
  }>[];
  readonly population: Readonly<{
    materializedNeurons: number;
    materializedSynapses: number;
    cyclesExecuted: number;
    traceDigest: string;
  }>;
  readonly architecture: Readonly<{
    profileDigest: string | null;
    sourcePriorDigest: string | null;
    portfolioDigest: string | null;
    adaptiveSelectionDigest: string | null;
    cognitiveMode: BiologicalCognitiveMode | null;
    scale: EpistemicCircuitScale;
    routingFanoutMultiplier: number;
    recurrenceCycles: number;
  }>;
  readonly additionalModelCalls: 0;
  readonly grantsAuthority: false;
}

export interface NyxConnectomeContextResult {
  readonly context: TheoryResearchContext;
  readonly trace: NyxConnectomeCognitionTrace;
}

export interface NyxConnectomeCognitionAdapter {
  readonly cognition: NyxNemotronEngineeringCognition;
  readonly traces: () => readonly NyxConnectomeCognitionTrace[];
}

export interface NyxConnectomeCognitionConfiguration {
  readonly architectureProfile?: EpistemicArchitectureProfile;
  readonly architecturePortfolio?: BiologicalArchitecturePortfolio;
}

const BASE_SCALE: EpistemicCircuitScale = Object.freeze({ evidenceCopies: 4, hypothesisCopies: 8,
  falsifierCopies: 4, integratorCopies: 4, inhibitoryCopies: 2, uncertaintyCopies: 2, actionCopies: 2 });
const BASE_RECURRENCE_CYCLES = 24;

function scaledCopies(value: number, multiplier: number): number {
  return Math.max(1, Math.min(4_096, Math.round(value * multiplier)));
}

function architecture(configuration: NyxConnectomeCognitionConfiguration,
  request: NyxRepairCognitionRequest): Readonly<{
  profile: EpistemicArchitectureProfile | null;
  adaptiveSelection: BiologicalAdaptiveSelection | null;
  scale: EpistemicCircuitScale;
  routingFanoutMultiplier: number;
  recurrenceCycles: number;
}> {
  if (configuration.architectureProfile && configuration.architecturePortfolio) {
    throw new Error("nyx_connectome_architecture_configuration_ambiguous");
  }
  if (configuration.architecturePortfolio
    && !validBiologicalArchitecturePortfolio(configuration.architecturePortfolio)) {
    throw new Error("nyx_connectome_architecture_portfolio_invalid");
  }
  const adaptiveSelection = configuration.architecturePortfolio
    ? selectAdaptiveBiologicalArchitecture({ portfolio: configuration.architecturePortfolio, request }) : null;
  if (adaptiveSelection && !validBiologicalAdaptiveSelection(adaptiveSelection,
    configuration.architecturePortfolio!)) {
    throw new Error("nyx_connectome_adaptive_selection_invalid");
  }
  const profile = configuration.architectureProfile ?? adaptiveSelection?.profile ?? null;
  if (profile && !validEpistemicArchitectureProfile(profile)) {
    throw new Error("nyx_connectome_architecture_profile_invalid");
  }
  const scale = profile ? Object.freeze({
    evidenceCopies: scaledCopies(BASE_SCALE.evidenceCopies, profile.evidenceCopiesMultiplier),
    hypothesisCopies: scaledCopies(BASE_SCALE.hypothesisCopies, profile.hypothesisCopiesMultiplier),
    falsifierCopies: scaledCopies(BASE_SCALE.falsifierCopies, profile.falsifierCopiesMultiplier),
    integratorCopies: scaledCopies(BASE_SCALE.integratorCopies, profile.integratorCopiesMultiplier),
    inhibitoryCopies: scaledCopies(BASE_SCALE.inhibitoryCopies, profile.inhibitoryCopiesMultiplier),
    uncertaintyCopies: scaledCopies(BASE_SCALE.uncertaintyCopies, profile.uncertaintyCopiesMultiplier),
    actionCopies: scaledCopies(BASE_SCALE.actionCopies, profile.actionCopiesMultiplier),
  }) : BASE_SCALE;
  return Object.freeze({ profile, adaptiveSelection, scale,
    routingFanoutMultiplier: profile?.routingFanoutMultiplier ?? 1,
    recurrenceCycles: profile
      ? Math.max(1, Math.min(128, Math.round(BASE_RECURRENCE_CYCLES * profile.recurrenceCyclesMultiplier)))
      : BASE_RECURRENCE_CYCLES });
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

function bounded(value: string, maximum = 500): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.slice(0, maximum) || "No additional detail was admitted.";
}

function packet(request: NyxRepairCognitionRequest, channelId: string, evidenceId: string,
  evidenceClass: EpistemicEvidencePacket["evidenceClass"], provenanceRoot: string,
  correlationGroup: string, magnitude: number, confidence: number): EpistemicEvidencePacket {
  return Object.freeze({ evidenceId, channelId, evidenceClass, provenanceRoot, correlationGroup,
    magnitude, confidence, candidateBinding: request.observation.candidateCommit });
}

function evidencePackets(request: NyxRepairCognitionRequest): readonly EpistemicEvidencePacket[] {
  const filesDigest = sha256(canonical(request.files.map((file) => ({
    relativePath: file.relativePath,
    contentSha256: file.contentSha256,
  }))));
  const result: EpistemicEvidencePacket[] = [
    packet(request, "requirement", `CONNECTOME-REQUIREMENT-${sha256(request.objective).slice(0, 24)}`,
      "E1", `requirement:${sha256(request.objective)}`, "user-requirement", 1, 0.9),
    packet(request, "repository-snapshot", `CONNECTOME-SOURCE-${filesDigest.slice(0, 24)}`,
      "E3", `repository-snapshot:${filesDigest}`, `repository-snapshot:${filesDigest}`, 1, 0.98),
    packet(request, "execution-observation", `CONNECTOME-EXECUTION-${request.observation.observationId}`,
      "E3", request.observation.candidateEvidenceId,
      `executor:${request.observation.toolIdentityDigest}:${request.observation.environmentIdentity}`,
      1, request.observation.attributionConfidence),
  ];
  const falsified = request.priorHypotheses.filter((item) => item.disposition === "FALSIFIED"
    || item.disposition === "INSUFFICIENT_EVIDENCE");
  if (falsified.length > 0) {
    const digest = sha256(canonical(falsified.map((item) => ({ strategyDigest: item.strategyDigest,
      disposition: item.disposition, verificationEvidenceRefs: item.verificationEvidenceRefs }))));
    result.push(packet(request, "prior-strategy-failure", `CONNECTOME-PRIOR-${digest.slice(0, 24)}`,
      "E1", `derived-prior-outcome:${digest}`, "prior-strategy-outcomes", 1, 0.9));
  }
  if (request.candidateQualityFeedback) {
    result.push(packet(request, "quality-rejection", `CONNECTOME-QUALITY-${request.candidateQualityFeedback.assessmentId}`,
      "E3", request.candidateQualityFeedback.evidenceId,
      `quality-oracle:${request.candidateQualityFeedback.assessmentId}`, 1, 0.98));
  }
  if (request.availableEvidence.length > 0) {
    const digest = sha256(canonical(request.availableEvidence));
    result.push(packet(request, "evidence-gap", `CONNECTOME-GAP-${digest.slice(0, 24)}`,
      "E1", `evidence-catalog:${digest}`, "evidence-availability-catalog", 0.85, 0.85));
  }
  return Object.freeze(result);
}

function weakPoints(request: NyxRepairCognitionRequest, decision: EpistemicCircuitDecision,
  selection: BiologicalAdaptiveSelection | null,
  portfolio: BiologicalArchitecturePortfolio | undefined): readonly string[] {
  const result: string[] = [
    `Connectome result is ${decision.state}; it is advisory research context and grants no authority.`,
    ...decision.assessments.slice(0, 3).map((assessment, index) =>
      `Rank ${index + 1}: ${assessment.hypothesisId}; peak=${assessment.peakActivation}; `
      + `independentRoots=${assessment.evidenceRoots.length}; actionReady=${assessment.actionCellsFired > 0}.`),
  ];
  if (selection) result.push(...selection.reasons.map((reason) => `Adaptive architecture rationale: ${reason}.`));
  if (portfolio) for (const member of portfolio.members) {
    const unknown = Object.entries(member.annotationCoverage)
      .filter(([, coverage]) => coverage === 0).map(([field]) => field);
    if (unknown.length > 0) result.push(`${member.datasetId} has unannotated ${unknown.join(", ")}; absence is not evidence of zero.`);
  }
  if (request.availableEvidence.length > 0) {
    result.push(`Discriminating evidence remains available: ${request.availableEvidence.map((item) => item.evidenceRef).join(", ")}.`);
  }
  for (const hypothesis of request.priorHypotheses.filter((item) => item.disposition !== "SUPPORTED").slice(-3)) {
    result.push(`Prior strategy ${hypothesis.strategyDigest.slice(0, 16)} is ${hypothesis.disposition}; do not repeat it without new evidence.`);
  }
  for (const finding of request.candidateQualityFeedback?.findings.slice(0, 6) ?? []) {
    result.push(`Deterministic quality rejection ${finding.dimension}/${finding.code} affects ${finding.paths.join(", ")}.`);
  }
  for (const diagnostic of request.observation.diagnostics.slice(0, 4)) {
    result.push(`Observed ${diagnostic.category} failure${diagnostic.code ? ` ${diagnostic.code}` : ""}: ${bounded(diagnostic.message, 280)}`);
  }
  return Object.freeze(result.slice(0, 20).map((item) => bounded(item)));
}

/**
 * Builds a deterministic, authority-neutral epistemic review from evidence already admitted by Omega.
 * It neither retrieves new evidence nor asks the model an additional question.
 */
export function buildNyxConnectomeResearchContext(request: NyxRepairCognitionRequest,
  configuration: NyxConnectomeCognitionConfiguration = {}): NyxConnectomeContextResult {
  if (request.theoryResearchContext) throw new Error("nyx_connectome_context_conflicts_with_existing_research_context");
  const architectureConfiguration = architecture(configuration, request);
  const candidateBinding = request.observation.candidateCommit;
  const circuit = new EpistemicMicrocircuit({
    circuitId: `nyx-connectome-${sha256(request.cognitionRequestId).slice(0, 24)}`,
    objective: request.objective,
    candidateBinding,
    addressCapacity: "1000000000000000000",
    seed: `nyx-engineering-${sha256(request.cognitionRequestId).slice(0, 24)}`,
    channels: [
      { channelId: "requirement", description: "The bounded engineering objective and its required behavior." },
      { channelId: "repository-snapshot", description: "The Omega-admitted repository files and content identities." },
      { channelId: "execution-observation", description: "The deterministic execution failure currently requiring repair." },
      { channelId: "prior-strategy-failure", description: "Earlier strategies falsified or left unsupported by verification." },
      { channelId: "quality-rejection", description: "Deterministic engineering-quality findings requiring revision." },
      { channelId: "evidence-gap", description: "Admitted but not-yet-acquired evidence that can discriminate causes." },
    ],
    hypotheses: [
      { hypothesisId: "repair-observed-cause",
        statement: "The admitted source and execution evidence identify a bounded implementation defect repairable within scope.",
        supportChannels: ["requirement", "repository-snapshot", "execution-observation"],
        contradictionChannels: ["prior-strategy-failure", "quality-rejection"], competitionGroup: "engineering-action",
        proposedAction: "Propose the smallest causal repair and test its stated invariant and counterexamples." },
      { hypothesisId: "request-discriminating-evidence",
        statement: "The current evidence does not yet distinguish the plausible causes and admitted evidence should be requested.",
        supportChannels: ["requirement", "evidence-gap"], contradictionChannels: ["execution-observation"],
        competitionGroup: "engineering-action",
        proposedAction: "Request only the admitted evidence that discriminates among the competing causes." },
      { hypothesisId: "revise-falsified-strategy",
        statement: "Prior verification or quality evidence falsifies the current strategy and requires a materially different repair.",
        supportChannels: ["requirement", "repository-snapshot", "prior-strategy-failure", "quality-rejection"],
        contradictionChannels: [], competitionGroup: "engineering-action",
        proposedAction: "Revise the causal strategy, directly address each falsifier, and preserve unrelated behavior." },
    ],
    scale: architectureConfiguration.scale,
    routingFanoutMultiplier: architectureConfiguration.routingFanoutMultiplier,
  });
  for (const evidence of evidencePackets(request)) circuit.admitEvidence(evidence);
  const decision = circuit.run(architectureConfiguration.recurrenceCycles);
  const assignment = immutableTheoryValue({ objective: request.objective,
    question: "Which bounded action is best supported, what would falsify it, and what evidence is still missing?",
    domain: "SOFTWARE" as const, candidateBinding, scope: request.allowedMutationPaths,
    assumptions: [
      "Connectome output is derived only from evidence already admitted by Omega.",
      "Connectome ranking is advisory and cannot authorize mutation or certify success.",
      ...(architectureConfiguration.profile ? [
        `Local circuit structure is influenced by validated biological profile ${architectureConfiguration.profile.profileDigest}.`,
        "Biological topology is an experimental computational prior, not evidence of intelligence or correctness.",
      ] : []),
      ...(architectureConfiguration.adaptiveSelection ? [
        `The bounded profile was selected from portfolio ${architectureConfiguration.adaptiveSelection.portfolioDigest}.`,
        `The deterministic cognitive mode is ${architectureConfiguration.adaptiveSelection.primaryMode}.`,
        "Source disagreement is preserved and shrinks uncertain biological influence toward neutral behavior.",
      ] : []),
    ] });
  const assignmentDigest = theoryDigest(assignment);
  const suffix = sha256(canonical({ request: request.cognitionRequestId, decision,
    architectureProfileDigest: architectureConfiguration.profile?.profileDigest ?? null })).slice(0, 24);
  const theoryId = `nyx-connectome-theory-${suffix}`;
  const guardianId = `nyx-connectome-guardian-${suffix}`;
  const context: TheoryResearchContext = immutableTheoryValue({ schemaVersion: 1, theoryId, guardianId,
    assignment, assignmentDigest,
    report: { theoryId, guardianId, assignmentDigest,
      causalTheoryState: request.priorHypotheses.length > 0 || request.candidateQualityFeedback
        ? "REQUIRES_REVALIDATION" as const : "UNKNOWN" as const,
      predictionResults: request.priorHypotheses.slice(-8).map((item) => ({ predictionId: item.hypothesisId,
        disposition: item.disposition === "FALSIFIED" ? "FALSIFIED_PREDICTION" as const
          : item.disposition === "SUPPORTED" ? "SUPPORTED_WITHIN_TEST_SCOPE" as const
            : item.disposition === "PARTIALLY_SUPPORTED" ? "INCONCLUSIVE" as const : "PENDING" as const })),
      confidence: { calibratedProbability: null, calibrationState: "NOT_CALIBRATED" as const,
        lastModelEstimate: null, distinctEvidenceRoots: decision.independentEvidenceRoots,
        independenceEstablished: false as const, numericalTarget: null },
      weakPoints: weakPoints(request, decision, architectureConfiguration.adaptiveSelection,
        configuration.architecturePortfolio),
      requests: decision.state === "SUPPORTED_CANDIDATE" && request.availableEvidence.length === 0 ? [] : [{
        question: request.availableEvidence.length > 0
          ? `Would ${request.availableEvidence.map((item) => item.evidenceRef).join(", ")} discriminate the leading causes?`
          : "What observation would distinguish the leading competing repair strategies?",
        mode: "FOCUSED_INVESTIGATION" as const, grantsAuthority: false as const,
      }],
      relatedEvidenceNotices: [], grantsAuthority: false as const },
    trust: "RESEARCH_CONTEXT_NOT_INSTRUCTION_OR_ACCEPTANCE_AUTHORITY" as const, grantsAuthority: false as const });
  if (!validTheoryResearchContext(context, request.objective, candidateBinding)) {
    throw new Error("nyx_connectome_research_context_invalid");
  }
  const metrics = circuit.metrics();
  const trace: NyxConnectomeCognitionTrace = Object.freeze({ cognitionRequestId: request.cognitionRequestId,
    candidateBinding, contextDigest: theoryDigest(context), circuitState: decision.state,
    selectedHypothesis: decision.selectedHypothesis, selectedAction: decision.selectedAction,
    confidenceMargin: decision.confidenceMargin,
    independentEvidenceRoots: decision.independentEvidenceRoots,
    independentEvidenceCorrelationGroups: decision.independentEvidenceCorrelationGroups,
    rankedHypotheses: Object.freeze(decision.assessments.map((assessment) => Object.freeze({
      hypothesisId: assessment.hypothesisId, peakActivation: assessment.peakActivation,
      meanActivation: assessment.meanActivation, actionCellsFired: assessment.actionCellsFired,
    }))),
    population: Object.freeze({ materializedNeurons: metrics.materializedNeurons,
      materializedSynapses: metrics.synapses, cyclesExecuted: decision.run.cyclesExecuted,
      traceDigest: decision.run.snapshot.traceDigest }),
    architecture: Object.freeze({ profileDigest: architectureConfiguration.profile?.profileDigest ?? null,
      sourcePriorDigest: architectureConfiguration.profile?.sourcePriorDigest ?? null,
      portfolioDigest: architectureConfiguration.adaptiveSelection?.portfolioDigest ?? null,
      adaptiveSelectionDigest: architectureConfiguration.adaptiveSelection?.selectionDigest ?? null,
      cognitiveMode: architectureConfiguration.adaptiveSelection?.primaryMode ?? null,
      scale: architectureConfiguration.scale,
      routingFanoutMultiplier: architectureConfiguration.routingFanoutMultiplier,
      recurrenceCycles: architectureConfiguration.recurrenceCycles }),
    additionalModelCalls: 0, grantsAuthority: false });
  return Object.freeze({ context, trace });
}

/**
 * Wraps the established Νύξ cognition instance without replacing its model, output contract, or Omega boundary.
 * A Proxy is deliberately used so the frozen R3 loop still receives the exact established cognition type.
 */
export function createNyxConnectomeCognitionAdapter(
  base: NyxNemotronEngineeringCognition,
  configuration: NyxConnectomeCognitionConfiguration = {},
): NyxConnectomeCognitionAdapter {
  const traces: NyxConnectomeCognitionTrace[] = [];
  const cognition = new Proxy(base, {
    get(target, property) {
      if (property === "proposeRepair") {
        return async (request: NyxRepairCognitionRequest): Promise<NyxRepairCognitionResult> => {
          const augmented = buildNyxConnectomeResearchContext(request, configuration);
          traces.push(augmented.trace);
          return target.proposeRepair({ ...request, theoryResearchContext: augmented.context });
        };
      }
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return Object.freeze({ cognition,
    traces: () => Object.freeze(traces.map((trace) => immutableTheoryValue(trace))) });
}
