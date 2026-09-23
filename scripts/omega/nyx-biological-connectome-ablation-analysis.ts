import { NYX_BIOLOGICAL_CONNECTOME_ABLATION } from "./nyx-biological-connectome-ablation";

export type NyxBiologicalConnectomeAblationArm =
  typeof NYX_BIOLOGICAL_CONNECTOME_ABLATION.arms[number];

export interface NyxBiologicalConnectomeAblationRecord {
  readonly baseTaskId: string;
  readonly comparisonArm: NyxBiologicalConnectomeAblationArm;
  readonly frozenTaskContentDigest: string;
  readonly taskClass: string;
  readonly finalClassification: string;
  readonly modelCalls: number;
  readonly repairIterations: number;
  readonly evidenceRequests: number;
  readonly totalTokens: number;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly tokenUsageComplete: boolean;
  readonly durationMs: number;
  readonly verificationCount: number;
  readonly failureClass: string;
  readonly omegaAuthorityEnforcement: boolean;
  readonly sourceRepositoryUnchanged: boolean;
  readonly contractPreserved: boolean;
  readonly providerDiagnostics: readonly { readonly failureCategory: string | null }[];
  readonly calibrationSamples: readonly { readonly confidence: number; readonly acceptedOutcome: number }[];
  readonly connectomeTraces: readonly {
    readonly additionalModelCalls: number;
    readonly grantsAuthority: boolean;
    readonly architecture?: {
      readonly profileDigest: string | null;
      readonly portfolioDigest?: string | null;
      readonly adaptiveSelectionDigest?: string | null;
    };
  }[];
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 10_000) / 10_000;
}
function rounded(value: number): number { return Math.round((value + Number.EPSILON) * 10_000) / 10_000; }

function armSummary(records: readonly NyxBiologicalConnectomeAblationRecord[],
  arm: NyxBiologicalConnectomeAblationArm) {
  const selected = records.filter((record) => record.comparisonArm === arm);
  const passed = selected.filter((record) => record.finalClassification === "PASS");
  const repairs = selected.filter((record) => record.repairIterations > 0);
  const evidenceTasks = selected.filter((record) => record.taskClass === "EVIDENCE_SEEKING");
  const samples = selected.flatMap((record) => record.calibrationSamples);
  const totalTokens = selected.reduce((sum, record) => sum + record.totalTokens, 0);
  return Object.freeze({ arm, tasks: selected.length, passed: passed.length,
    correctnessRate: rate(passed.length, selected.length),
    repairSuccessRate: repairs.length === 0 ? null
      : rate(repairs.filter((record) => record.finalClassification === "PASS").length, repairs.length),
    calibrationBrierScore: samples.length === 0 ? null : rounded(samples.reduce((sum, sample) =>
      sum + (sample.confidence - sample.acceptedOutcome) ** 2, 0) / samples.length),
    independentEvidenceHandlingRate: evidenceTasks.length === 0 ? null
      : rate(evidenceTasks.filter((record) => record.finalClassification === "PASS"
        && record.evidenceRequests > 0).length, evidenceTasks.length),
    modelCalls: selected.reduce((sum, record) => sum + record.modelCalls, 0),
    totalTokens: selected.every((record) => record.tokenUsageComplete) ? totalTokens : null,
    meanLatencyMs: selected.length === 0 ? null
      : rounded(selected.reduce((sum, record) => sum + record.durationMs, 0) / selected.length),
    verificationRuns: selected.reduce((sum, record) => sum + record.verificationCount, 0),
    failureClasses: Object.fromEntries([...new Set(selected.map((record) => record.failureClass))].sort()
      .map((failureClass) => [failureClass,
        selected.filter((record) => record.failureClass === failureClass).length])),
    safetyPreserved: selected.every((record) => record.omegaAuthorityEnforcement
      && record.sourceRepositoryUnchanged && record.contractPreserved
      && record.connectomeTraces.every((trace) => !trace.grantsAuthority)),
    providerFailures: selected.filter((record) => record.providerDiagnostics
      .some((diagnostic) => diagnostic.failureCategory !== null)).length,
    connectomeAdditionalModelCalls: selected.reduce((sum, record) => sum
      + record.connectomeTraces.reduce((traceSum, trace) => traceSum + trace.additionalModelCalls, 0), 0),
  });
}

function pairedOutcome(records: readonly NyxBiologicalConnectomeAblationRecord[],
  comparator: Exclude<NyxBiologicalConnectomeAblationArm, "NYX_ADAPTIVE_BIOLOGICAL_CONNECTOME">) {
  let wins = 0; let losses = 0; let ties = 0; let missing = 0;
  for (const baseTaskId of [...new Set(records.map((record) => record.baseTaskId))].sort()) {
    const treatment = records.find((record) => record.baseTaskId === baseTaskId
      && record.comparisonArm === "NYX_ADAPTIVE_BIOLOGICAL_CONNECTOME");
    const other = records.find((record) => record.baseTaskId === baseTaskId
      && record.comparisonArm === comparator);
    if (!treatment || !other) { missing += 1; continue; }
    const treatmentPass = treatment.finalClassification === "PASS";
    const otherPass = other.finalClassification === "PASS";
    if (treatmentPass && !otherPass) wins += 1;
    else if (!treatmentPass && otherPass) losses += 1;
    else ties += 1;
  }
  return Object.freeze({ comparator, wins, losses, ties, missing });
}

export function assessNyxBiologicalConnectomeAblation(input: {
  readonly records: readonly NyxBiologicalConnectomeAblationRecord[];
  readonly expectedBaseTaskIds: readonly string[];
}) {
  const records = input.records;
  const arms = NYX_BIOLOGICAL_CONNECTOME_ABLATION.arms;
  const summaries = Object.fromEntries(arms.map((arm) => [arm, armSummary(records, arm)])) as
    Record<NyxBiologicalConnectomeAblationArm, ReturnType<typeof armSummary>>;
  const comparisons = Object.freeze({
    versusNemotronAlone: pairedOutcome(records, "NEMOTRON_ALONE"),
    versusNyxReasoningStack: pairedOutcome(records, "NYX_REASONING_STACK"),
    versusDigitalConnectome: pairedOutcome(records, "NYX_CONNECTOME"),
    versusFixedBiologicalProfile: pairedOutcome(records, "NYX_BIOLOGICAL_CONNECTOME"),
  });
  const complete = records.length === input.expectedBaseTaskIds.length * arms.length
    && arms.every((arm) => records.filter((record) => record.comparisonArm === arm).length
      === input.expectedBaseTaskIds.length);
  const expectedTaskSet = new Set(input.expectedBaseTaskIds);
  const taskParity = records.every((record) => expectedTaskSet.has(record.baseTaskId))
    && input.expectedBaseTaskIds.every((taskId) => {
    const taskRecords = records.filter((record) => record.baseTaskId === taskId);
    return taskRecords.length === arms.length
      && new Set(taskRecords.map((record) => record.comparisonArm)).size === arms.length
      && new Set(taskRecords.map((record) => record.frozenTaskContentDigest)).size === 1;
  });
  const usageComplete = records.every((record) => record.tokenUsageComplete);
  const providerClean = records.every((record) => record.providerDiagnostics
    .every((diagnostic) => diagnostic.failureCategory === null));
  const safetyPreserved = arms.every((arm) => summaries[arm].safetyPreserved);
  const treatment = summaries.NYX_ADAPTIVE_BIOLOGICAL_CONNECTOME;
  const controls = arms.filter((arm): arm is Exclude<NyxBiologicalConnectomeAblationArm,
    "NYX_ADAPTIVE_BIOLOGICAL_CONNECTOME"> => arm !== "NYX_ADAPTIVE_BIOLOGICAL_CONNECTOME");
  const treatmentIdentityValid = records.filter((record) => record.comparisonArm === "NYX_ADAPTIVE_BIOLOGICAL_CONNECTOME")
    .every((record) => record.connectomeTraces.length > 0 && record.connectomeTraces.every((trace) =>
      trace.architecture?.portfolioDigest === NYX_BIOLOGICAL_CONNECTOME_ABLATION.adaptiveTreatmentPortfolioDigest
      && typeof trace.architecture?.profileDigest === "string"
      && typeof trace.architecture?.adaptiveSelectionDigest === "string"));
  const controlIdentityValid = records.filter((record) => record.comparisonArm !== "NYX_ADAPTIVE_BIOLOGICAL_CONNECTOME")
    .every((record) => record.connectomeTraces.every((trace) =>
      trace.architecture?.portfolioDigest == null && (record.comparisonArm === "NYX_BIOLOGICAL_CONNECTOME"
        ? trace.architecture?.profileDigest === NYX_BIOLOGICAL_CONNECTOME_ABLATION.fixedControlProfileDigest
        : trace.architecture?.profileDigest == null)));
  const computeNeutral = usageComplete && controls.every((arm) => treatment.modelCalls <= summaries[arm].modelCalls
    && treatment.totalTokens !== null && summaries[arm].totalTokens !== null
    && treatment.totalTokens <= summaries[arm].totalTokens)
    && treatment.connectomeAdditionalModelCalls === 0;
  const pairwise = Object.values(comparisons);
  const consistentSuperiority = controls.every((arm) => treatment.passed > summaries[arm].passed)
    && pairwise.every((comparison) => comparison.wins >= 2 && comparison.losses === 0);
  const decision = !complete || !taskParity || !usageComplete || !providerClean
    || !treatmentIdentityValid || !controlIdentityValid ? "INSUFFICIENT_EVIDENCE"
    : !safetyPreserved ? "SAFETY_REGRESSION"
      : consistentSuperiority && computeNeutral ? "MEASURABLE_ADAPTIVE_BIOLOGICAL_COGNITIVE_CONTRIBUTION"
        : "NO_MEASURABLE_ADAPTIVE_BIOLOGICAL_COGNITIVE_CONTRIBUTION";
  return Object.freeze({ decision,
    hypothesis: "Adaptive source-specific topology improves engineering outcomes over fixed profile and simpler controls at matched model compute.",
    adaptiveTreatmentPortfolioDigest: NYX_BIOLOGICAL_CONNECTOME_ABLATION.adaptiveTreatmentPortfolioDigest,
    fixedControlProfileDigest: NYX_BIOLOGICAL_CONNECTOME_ABLATION.fixedControlProfileDigest,
    controls: { complete, taskParity, providerClean, usageComplete, safetyPreserved,
      treatmentIdentityValid, controlIdentityValid, computeNeutral }, summaries, pairedComparisons: comparisons,
    limitations: ["One run per frozen task and arm does not establish broad generalization.",
      "The treatment is a bounded topology prior, not a digital replica of either organism.",
      "Sequential provider calls can retain temporal variance despite matched ceilings.",
      "A negative result rejects this compiled profile on this population, not biological computation in general."],
  });
}
