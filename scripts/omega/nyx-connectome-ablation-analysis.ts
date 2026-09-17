import { NYX_CONNECTOME_ABLATION } from "./nyx-connectome-ablation";

export type NyxConnectomeAblationArm = typeof NYX_CONNECTOME_ABLATION.arms[number];

export interface NyxConnectomeAblationRecord {
  readonly baseTaskId: string;
  readonly comparisonArm: NyxConnectomeAblationArm;
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
  readonly connectomeTraces: readonly { readonly additionalModelCalls: number }[];
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 10_000) / 10_000;
}
function rounded(value: number): number { return Math.round((value + Number.EPSILON) * 10_000) / 10_000; }

function armSummary(records: readonly NyxConnectomeAblationRecord[], arm: NyxConnectomeAblationArm) {
  const selected = records.filter((record) => record.comparisonArm === arm);
  const passed = selected.filter((record) => record.finalClassification === "PASS");
  const repairs = selected.filter((record) => record.repairIterations > 0);
  const evidenceTasks = selected.filter((record) => record.taskClass === "EVIDENCE_SEEKING");
  const samples = selected.flatMap((record) => record.calibrationSamples);
  const brier = samples.length === 0 ? null : rounded(samples.reduce((sum, sample) =>
    sum + (sample.confidence - sample.acceptedOutcome) ** 2, 0) / samples.length);
  const failureClasses = Object.fromEntries([...new Set(selected.map((record) => record.failureClass))].sort()
    .map((failureClass) => [failureClass, selected.filter((record) => record.failureClass === failureClass).length]));
  const totalTokens = selected.reduce((sum, record) => sum + record.totalTokens, 0);
  return Object.freeze({ arm, tasks: selected.length, passed: passed.length,
    correctnessRate: rate(passed.length, selected.length), repairAttemptedTasks: repairs.length,
    repairSuccessRate: repairs.length === 0 ? null
      : rate(repairs.filter((record) => record.finalClassification === "PASS").length, repairs.length),
    calibrationCoverage: rate(samples.length, selected.reduce((sum, record) => sum + Math.max(1, record.modelCalls), 0)),
    calibrationBrierScore: brier,
    independentEvidenceHandlingRate: evidenceTasks.length === 0 ? null
      : rate(evidenceTasks.filter((record) => record.finalClassification === "PASS"
        && record.evidenceRequests > 0).length, evidenceTasks.length),
    modelCalls: selected.reduce((sum, record) => sum + record.modelCalls, 0),
    totalTokens: selected.every((record) => record.tokenUsageComplete) ? totalTokens : null,
    promptTokens: selected.every((record) => record.tokenUsageComplete)
      ? selected.reduce((sum, record) => sum + record.promptTokens, 0) : null,
    completionTokens: selected.every((record) => record.tokenUsageComplete)
      ? selected.reduce((sum, record) => sum + record.completionTokens, 0) : null,
    tokensPerAcceptedTask: passed.length > 0 && selected.every((record) => record.tokenUsageComplete)
      ? rounded(totalTokens / passed.length) : null,
    totalLatencyMs: selected.reduce((sum, record) => sum + record.durationMs, 0),
    meanLatencyMs: selected.length === 0 ? null
      : rounded(selected.reduce((sum, record) => sum + record.durationMs, 0) / selected.length),
    verificationRuns: selected.reduce((sum, record) => sum + record.verificationCount, 0), failureClasses,
    safetyPreserved: selected.every((record) => record.omegaAuthorityEnforcement
      && record.sourceRepositoryUnchanged && record.contractPreserved),
    providerFailures: selected.filter((record) => record.providerDiagnostics
      .some((diagnostic) => diagnostic.failureCategory !== null)).length,
    connectomeCalls: selected.reduce((sum, record) => sum + record.connectomeTraces.length, 0),
    connectomeAdditionalModelCalls: selected.reduce((sum, record) => sum
      + record.connectomeTraces.reduce((traceSum, trace) => traceSum + trace.additionalModelCalls, 0), 0),
  });
}

function pairedOutcome(records: readonly NyxConnectomeAblationRecord[],
  comparator: Exclude<NyxConnectomeAblationArm, "NYX_CONNECTOME">) {
  let wins = 0; let losses = 0; let ties = 0; let missing = 0;
  for (const baseTaskId of [...new Set(records.map((record) => record.baseTaskId))].sort()) {
    const connectome = records.find((record) => record.baseTaskId === baseTaskId
      && record.comparisonArm === "NYX_CONNECTOME");
    const other = records.find((record) => record.baseTaskId === baseTaskId && record.comparisonArm === comparator);
    if (!connectome || !other) { missing += 1; continue; }
    const connectomePass = connectome.finalClassification === "PASS";
    const otherPass = other.finalClassification === "PASS";
    if (connectomePass && !otherPass) wins += 1;
    else if (!connectomePass && otherPass) losses += 1;
    else ties += 1;
  }
  return Object.freeze({ comparator, wins, losses, ties, missing });
}

export function assessNyxConnectomeAblation(input: {
  readonly records: readonly NyxConnectomeAblationRecord[];
  readonly expectedBaseTaskIds: readonly string[];
  readonly frozenKernelCommit: string;
}) {
  const records = input.records;
  const summaries = Object.fromEntries(NYX_CONNECTOME_ABLATION.arms
    .map((arm) => [arm, armSummary(records, arm)])) as
    Record<NyxConnectomeAblationArm, ReturnType<typeof armSummary>>;
  const versusA = pairedOutcome(records, "NEMOTRON_ALONE");
  const versusB = pairedOutcome(records, "NYX_REASONING_STACK");
  const expectedTasks = input.expectedBaseTaskIds.length * NYX_CONNECTOME_ABLATION.arms.length;
  const complete = records.length === expectedTasks && NYX_CONNECTOME_ABLATION.arms.every((arm) =>
    records.filter((record) => record.comparisonArm === arm).length === input.expectedBaseTaskIds.length);
  const taskParity = input.expectedBaseTaskIds.every((taskId) => {
    const taskRecords = records.filter((record) => record.baseTaskId === taskId);
    return taskRecords.length === NYX_CONNECTOME_ABLATION.arms.length
      && new Set(taskRecords.map((record) => record.frozenTaskContentDigest)).size === 1;
  });
  const usageComplete = records.every((record) => record.tokenUsageComplete);
  const providerClean = records.every((record) => record.providerDiagnostics
    .every((diagnostic) => diagnostic.failureCategory === null));
  const safetyPreserved = NYX_CONNECTOME_ABLATION.arms.every((arm) => summaries[arm].safetyPreserved);
  const c = summaries.NYX_CONNECTOME;
  const a = summaries.NEMOTRON_ALONE;
  const b = summaries.NYX_REASONING_STACK;
  const modelComputeNeutral = usageComplete && c.modelCalls <= a.modelCalls && c.modelCalls <= b.modelCalls
    && c.totalTokens !== null && a.totalTokens !== null && b.totalTokens !== null
    && c.totalTokens <= a.totalTokens && c.totalTokens <= b.totalTokens;
  const consistentSuperiority = c.passed > a.passed && c.passed > b.passed
    && versusA.wins >= 2 && versusA.losses === 0 && versusB.wins >= 2 && versusB.losses === 0;
  const decision = !complete || !taskParity || !usageComplete || !providerClean
    ? "INSUFFICIENT_EVIDENCE"
    : !safetyPreserved ? "SAFETY_REGRESSION"
      : consistentSuperiority && modelComputeNeutral
        ? "MEASURABLE_COGNITIVE_CONTRIBUTION"
        : "NO_MEASURABLE_COGNITIVE_CONTRIBUTION";
  return Object.freeze({ decision, frozenKernelCommit: input.frozenKernelCommit,
    hypothesis: "The connectome improves frozen-task engineering outcomes under matched resource ceilings.",
    preRegisteredDecisionRule: { completePairedPopulationRequired: true, identicalTaskContentRequired: true,
      zeroProviderFailuresRequired: true, completeProviderTokenAccountingRequired: true,
      safetyPreservationRequired: true, connectomeMustBeatBothArmsByTaskCount: true,
      minimumPairwiseWinsAgainstEachArm: 2, zeroPairwiseLossesRequired: true,
      connectomeModelCallsMayNotExceedEitherArm: true, connectomeTotalTokensMayNotExceedEitherArm: true },
    controls: { complete, taskParity, sameModel: true, sameOutputTokenCeiling: true,
      sameCallAndRepairCeilings: true, sameToolsAndVerifier: true, sameWallClockCeiling: true,
      providerClean, usageComplete, safetyPreserved, modelComputeNeutral },
    summaries, pairedComparisons: { versusNemotronAlone: versusA, versusNyxReasoningStack: versusB },
    limitations: ["One execution per frozen task and arm does not establish broad generalization.",
      "Sequential provider calls may retain temporal provider variance despite matched controls.",
      "The deterministic verifier covers the frozen task population, not all software engineering.",
      "A negative result falsifies this adapter/configuration on this population, not every possible connectome architecture."],
  });
}
