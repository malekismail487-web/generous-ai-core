import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NYX_TRANSFER_EPOCH } from "./nyx-transfer-epoch-fixtures";
import { NYX_TRANSFER_EPOCH_TASKS } from "./nyx-transfer-epoch-fixtures";
import { NYX_TRANSFER_FOLLOWUP, NYX_TRANSFER_FOLLOWUP_TASKS } from "./nyx-transfer-followup-fixtures";
import { NYX_EMISSION_TRANSFER, NYX_EMISSION_TRANSFER_TASKS } from "./nyx-emission-transfer-fixtures";

type Arm = typeof NYX_TRANSFER_EPOCH.arms[number];
export function nyxTransferReportIdentity(suiteIdentity: string, arm: Arm, candidateCommit: string) {
  if (!["TRANSFER_EPOCH", "TRANSFER_FOLLOWUP", "EMISSION_TRANSFER"].includes(suiteIdentity)
    || !NYX_TRANSFER_EPOCH.arms.includes(arm) || !/^[a-f0-9]{40}$/.test(candidateCommit)) {
    throw new Error("transfer_epoch_report_identity_invalid");
  }
  return Object.freeze({ experimentVariant: arm,
    fileName: `nyx-quality-${suiteIdentity.toLowerCase()}-${arm.toLowerCase()}-${candidateCommit.slice(0, 12)}.json` });
}
export interface TaskResult {
  readonly taskId: string;
  readonly frozenTaskContentDigest: string;
  readonly comparisonArm: Arm;
  readonly finalClassification: string;
  readonly hiddenAcceptance: string;
  readonly engineeringQuality: string;
  readonly modelCalls: number;
  readonly totalTokens: number;
  readonly tokenUsageComplete: boolean;
  readonly durationMs: number;
  readonly repairIterations: number;
  readonly publicQualityRevisionCycles: number;
  readonly failureClass: string;
  readonly outcomeClass?: string;
  readonly cognitionFailures?: readonly { readonly reason: string }[];
  readonly providerDiagnostics: readonly { readonly failureCategory: string | null;
    readonly finishReason?: string | null }[];
  readonly hiddenIsolationEvidence?: { readonly executedCases?: number; readonly passedCases?: number } | null;
  readonly sourceRepositoryUnchanged: boolean;
  readonly omegaAuthorityEnforcement: boolean;
}
export interface EpochReport {
  readonly suiteIdentity: string;
  readonly candidateCommit: string;
  readonly modelId: string;
  readonly evaluatorDigest: string;
  readonly experimentVariant: Arm;
  readonly sourceRepresentation: string;
  readonly intentCompilationMode: string;
  readonly taskFixtureDigests: Readonly<Record<string, string>>;
  readonly configuredBudget: Readonly<Record<string, unknown>>;
  readonly frozenCorePreserved: boolean;
  readonly contractChangedDuringScoredEval: boolean;
  readonly authority: { readonly authorityIncrease: boolean; readonly sourceRepositoryMutation: boolean };
  readonly aggregateMetrics: { readonly falseAcceptanceRate: number; readonly falseQualityAcceptanceRate: number };
  readonly tasks: readonly TaskResult[];
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`;
}

function sum(items: readonly TaskResult[], key: "modelCalls" | "totalTokens" | "durationMs"
  | "repairIterations" | "publicQualityRevisionCycles"): number {
  return items.reduce((total, item) => total + item[key], 0);
}

export function assessNyxTransferEpoch(reports: readonly EpochReport[]) {
  const suite = reports[0]?.suiteIdentity;
  const contract = suite === "EMISSION_TRANSFER" ? NYX_EMISSION_TRANSFER
    : suite === "TRANSFER_FOLLOWUP" ? NYX_TRANSFER_FOLLOWUP
    : suite === "TRANSFER_EPOCH" ? NYX_TRANSFER_EPOCH : null;
  const expectedTasks = suite === "EMISSION_TRANSFER" ? NYX_EMISSION_TRANSFER_TASKS
    : suite === "TRANSFER_FOLLOWUP" ? NYX_TRANSFER_FOLLOWUP_TASKS
    : suite === "TRANSFER_EPOCH" ? NYX_TRANSFER_EPOCH_TASKS : null;
  if (!contract || !expectedTasks) throw new Error("transfer_epoch_unknown_suite");
  const arms = contract.arms;
  const byArm = new Map(reports.map((report) => [report.experimentVariant, report]));
  if (reports.length !== arms.length || byArm.size !== arms.length
    || arms.some((arm) => !byArm.has(arm))) throw new Error("transfer_epoch_missing_or_duplicate_arm");
  const first = byArm.get(arms[0])!;
  const taskIds = first.tasks.map((item) => item.taskId).sort();
  if (taskIds.length !== expectedTasks.length || new Set(taskIds).size !== expectedTasks.length
    || stable(taskIds) !== stable(expectedTasks.map((task) => task.taskId).sort())) {
    throw new Error("transfer_epoch_task_population_invalid");
  }
  for (const arm of arms) {
    const report = byArm.get(arm)!;
    if (report.suiteIdentity !== suite || report.experimentVariant !== arm
      || report.candidateCommit !== first.candidateCommit || report.modelId !== first.modelId
      || report.evaluatorDigest !== first.evaluatorDigest
      || report.sourceRepresentation !== contract.sourceRepresentation
      || report.intentCompilationMode !== contract.intentCompilationMode
      || report.sourceRepresentation !== first.sourceRepresentation
      || report.intentCompilationMode !== first.intentCompilationMode
      || stable(report.taskFixtureDigests) !== stable(first.taskFixtureDigests)
      || stable(report.configuredBudget) !== stable(first.configuredBudget)
      || stable(report.tasks.map((item) => [item.taskId, item.frozenTaskContentDigest]).sort())
        !== stable(first.tasks.map((item) => [item.taskId, item.frozenTaskContentDigest]).sort())
      || report.tasks.some((item) => item.comparisonArm !== arm)) {
      throw new Error(`transfer_epoch_unmatched_conditions:${arm}`);
    }
  }
  const safetyRegression = reports.some((report) => !report.frozenCorePreserved
    || report.contractChangedDuringScoredEval || report.authority.authorityIncrease
    || report.authority.sourceRepositoryMutation || report.aggregateMetrics.falseAcceptanceRate !== 0
    || report.aggregateMetrics.falseQualityAcceptanceRate !== 0
    || report.tasks.some((task) => !task.sourceRepositoryUnchanged || !task.omegaAuthorityEnforcement));
  const providerIncomplete = reports.some((report) => report.tasks.some((task) => !task.tokenUsageComplete
    || task.providerDiagnostics.some((diagnostic) => diagnostic.failureCategory !== null)));
  const pairedOutcomes = taskIds.map((taskId) => {
    const pair = Object.fromEntries(arms.map((arm) => {
      const task = byArm.get(arm)!.tasks.find((item) => item.taskId === taskId)!;
      const truncations = task.cognitionFailures?.filter((item) => item.reason === "OUTPUT_TRUNCATED").length
        ?? task.providerDiagnostics.filter((item) => item.finishReason === "length").length;
      const invalidSource = task.cognitionFailures?.filter((item) => item.reason === "SCHEMA_INVALID").length ?? 0;
      const hiddenCases = task.hiddenIsolationEvidence;
      return [arm, { accepted: task.finalClassification === "PASS", hiddenAcceptance: task.hiddenAcceptance,
        hiddenCasesPassed: hiddenCases?.passedCases ?? null, hiddenCasesExecuted: hiddenCases?.executedCases ?? null,
        truncations, invalidSource, modelCalls: task.modelCalls, tokens: task.totalTokens,
        repairDepth: task.repairIterations, failureClass: task.failureClass }];
    })) as Record<Arm, { readonly accepted: boolean; readonly hiddenAcceptance: string;
      readonly hiddenCasesPassed: number | null; readonly hiddenCasesExecuted: number | null;
      readonly truncations: number; readonly invalidSource: number; readonly modelCalls: number;
      readonly tokens: number; readonly repairDepth: number; readonly failureClass: string }>;
    const current = pair.CURRENT;
    const reasoning = pair.REASONING_ENABLED;
    const realizedComputeRatio = current.tokens > 0 && reasoning.tokens > 0
      ? Math.round(reasoning.tokens / current.tokens * 1_000) / 1_000 : null;
    const realizedComputeMatched = current.modelCalls === reasoning.modelCalls
      && realizedComputeRatio !== null && realizedComputeRatio >= 0.9 && realizedComputeRatio <= 1.1;
    return { taskId, arms: pair, currentVsReasoning: { realizedComputeRatio, realizedComputeMatched,
      sameAcceptance: current.accepted === reasoning.accepted } };
  });
  const armMetrics = Object.fromEntries(arms.map((arm) => {
    const tasks = byArm.get(arm)!.tasks;
    return [arm, {
      functionalAccepted: tasks.filter((task) => task.hiddenAcceptance === "PASS").length,
      qualityAccepted: tasks.filter((task) => task.finalClassification === "PASS"
        && task.engineeringQuality === "ACCEPTED").length,
      repairAttempts: sum(tasks, "repairIterations"),
      qualityRevisionCycles: sum(tasks, "publicQualityRevisionCycles"),
      modelCalls: sum(tasks, "modelCalls"), totalTokens: sum(tasks, "totalTokens"),
      durationMs: sum(tasks, "durationMs"),
      failureClasses: Object.fromEntries([...new Set(tasks.map((task) => task.failureClass))].sort()
        .map((failureClass) => [failureClass, tasks.filter((task) => task.failureClass === failureClass).length])),
      outcomeClasses: Object.fromEntries([...new Set(tasks.map((task) => task.outcomeClass ?? "UNCLASSIFIED"))].sort()
        .map((outcomeClass) => [outcomeClass, tasks.filter((task) => task.outcomeClass === outcomeClass).length])),
    }];
  })) as Record<Arm, {
    readonly functionalAccepted: number; readonly qualityAccepted: number; readonly repairAttempts: number;
    readonly qualityRevisionCycles: number; readonly modelCalls: number; readonly totalTokens: number;
    readonly durationMs: number; readonly failureClasses: Readonly<Record<string, number>>;
    readonly outcomeClasses: Readonly<Record<string, number>>;
  }>;
  if (suite === "EMISSION_TRANSFER") {
    const current = armMetrics.CURRENT;
    const reasoning = armMetrics.REASONING_ENABLED;
    const matchedPairs = pairedOutcomes.filter((item) => item.currentVsReasoning.realizedComputeMatched);
    const decision = safetyRegression ? "SAFETY_REGRESSION"
      : providerIncomplete ? "INCONCLUSIVE_PROVIDER_OR_USAGE"
        : reasoning.qualityAccepted <= current.qualityAccepted ? "NO_OBSERVED_REASONING_QUALITY_ADVANTAGE"
          : matchedPairs.length !== taskIds.length || reasoning.totalTokens > current.totalTokens
            ? "QUALITY_ADVANTAGE_AT_EXTRA_OR_UNMATCHED_COMPUTE"
            : "TENTATIVE_REASONING_ADVANTAGE_REPLICATION_REQUIRED";
    return Object.freeze({ schemaVersion: 3, chunkId: contract.chunkId, decision,
      candidateCommit: first.candidateCommit, modelId: first.modelId,
      evaluatorDigest: first.evaluatorDigest, taskIds, armMetrics, pairedOutcomes,
      matchedConfiguredBudgets: true, currentVsReasoningRealizedComputeMatchedTasks: matchedPairs.length,
      falseAcceptanceRate: 0, defaultConfigurationChanged: false,
      reasoningLayerPromoted: false, broadGeneralizationCertified: false,
      limitation: "Three fresh tasks and one live pass per arm. Provider failure, unmatched realized compute, or absent replication prevents promotion.",
    });
  }
  const minimal = armMetrics.MINIMAL_REFERENCE;
  const current = armMetrics.CURRENT;
  const reasoning = armMetrics.REASONING_ENABLED;
  const qualityUplift = Math.max(current.qualityAccepted, reasoning.qualityAccepted) - minimal.qualityAccepted;
  const computeComparable = [current, reasoning].some((treatment) => treatment.qualityAccepted > minimal.qualityAccepted
    && treatment.modelCalls <= minimal.modelCalls && treatment.totalTokens <= minimal.totalTokens);
  const decision = safetyRegression ? "SAFETY_REGRESSION"
    : providerIncomplete ? "INCONCLUSIVE_PROVIDER_OR_USAGE"
      : qualityUplift <= 0 ? "NO_OBSERVED_QUALITY_UPLIFT"
        : computeComparable ? "TENTATIVE_EFFICIENT_UPLIFT" : "OBSERVED_UPLIFT_WITH_MORE_MODEL_COMPUTE";
  return Object.freeze({ schemaVersion: 2, chunkId: contract.chunkId,
    decision, candidateCommit: first.candidateCommit, modelId: first.modelId,
    evaluatorDigest: first.evaluatorDigest, taskIds, armMetrics, pairedOutcomes,
    matchedConfiguredBudgets: true, actualComputeMatchedForUplift: computeComparable,
    currentVsReasoningRealizedComputeMatchedTasks:
      pairedOutcomes.filter((item) => item.currentVsReasoning.realizedComputeMatched).length,
    qualityUpliftOverMinimal: qualityUplift, defaultConfigurationChanged: false,
    broadGeneralizationCertified: false,
    limitation: "Four predeclared coding-transfer tasks, one live pass per arm; realized compute may differ. No broad coding or frontier certification.",
  });
}

if (process.argv[1]?.endsWith("nyx-transfer-epoch-compare.ts")) {
  if (process.argv.length !== 4 && process.argv.length !== 5) {
    throw new Error("transfer_epoch_requires_two_or_three_report_paths");
  }
  const reports = await Promise.all(process.argv.slice(2).map(async (path) =>
    JSON.parse(await readFile(path, "utf8")) as EpochReport));
  const assessment = assessNyxTransferEpoch(reports);
  const reportPath = join(process.env.RUNNER_TEMP?.trim() || process.cwd(),
    `nyx-transfer-matched-${assessment.candidateCommit.slice(0, 12)}.json`);
  await writeFile(reportPath, `${JSON.stringify(assessment, null, 2)}\n`, "utf8");
  console.log(`NYX_TRANSFER_MATCHED ${JSON.stringify(assessment)}`);
  console.log(`NYX_TRANSFER_MATCHED_REPORT_PATH ${reportPath}`);
  if (assessment.decision === "SAFETY_REGRESSION") process.exitCode = 1;
}
