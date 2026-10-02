import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { assessEngineeringQuality } from "../src/lib/codelab/assurance/engineeringQualityOracle";
import { NYX_ADMISSION_GUIDANCE, NYX_ADMISSION_GUIDANCE_FROZEN_CORE,
  NYX_ADMISSION_GUIDANCE_TASKS } from "./omega/nyx-admission-guidance-fixtures";
import { assessNyxTransferEpoch, nyxTransferReportIdentity,
  type EpochReport } from "./omega/nyx-transfer-epoch-compare";
import { assessNyxAdmissionReference, requireAdmissibleReferenceGates } from "./omega/nyx-quality-reference-preflight";
import { NYX_GATE_RECOVERY, NYX_GATE_RECOVERY_FROZEN_CORE, NYX_GATE_RECOVERY_TASKS,
  NYX_GATE_RECOVERY_TRANSPORT_REVISION, NYX_GATE_RECOVERY_DEADLINE_REVISION,
  NYX_GATE_RECOVERY_SERVER_ERROR_REVISION, NYX_GATE_RECOVERY_BOUNDED_OUTPUT_REVISION,
  NYX_GATE_RECOVERY_ANSWER_RESERVATION_REVISION } from "./omega/nyx-gate-recovery-fixtures";

let passed = 0;
const failures: string[] = [];
function check(value: unknown, label: string): void {
  if (value) passed += 1;
  else { failures.push(label); console.error(`  x ${label}`); }
}
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
async function fromSource(source: string): Promise<Record<string, (...args: unknown[]) => unknown>> {
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}
function satisfies(fn: (...args: unknown[]) => unknown,
  testCase: typeof NYX_ADMISSION_GUIDANCE_TASKS[number]["hiddenCases"][number]): boolean {
  const args = structuredClone(testCase.args) as unknown[];
  const before = JSON.stringify(args);
  try {
    const value = fn(...args);
    return testCase.expectation.kind === "RETURN" && JSON.stringify(value) === JSON.stringify(testCase.expectation.value)
      && JSON.stringify(args) === before;
  } catch (error) {
    return testCase.expectation.kind === "THROW" && error instanceof Error
      && error.name === testCase.expectation.errorName && JSON.stringify(args) === before;
  }
}
check(Object.entries(NYX_ADMISSION_GUIDANCE_FROZEN_CORE.files).every(([path, expected]) =>
  digest(execFileSync("git", ["show", `${NYX_ADMISSION_GUIDANCE_FROZEN_CORE.commit}:${path}`])) === expected),
  "historical scored core remains reproducible at its immutable pinned source");
check(Object.entries(NYX_GATE_RECOVERY_FROZEN_CORE.files).every(([path, expected]) =>
  digest(execFileSync("git", ["show", `${NYX_GATE_RECOVERY_FROZEN_CORE.commit}:${path}`])) === expected),
  "historical ownership-repair core remains immutable and reproducible");
check(Object.entries(NYX_GATE_RECOVERY_FROZEN_CORE.files).every(([path, expected]) =>
  digest(readFileSync(path)) === (path === NYX_GATE_RECOVERY_TRANSPORT_REVISION.changedPath
    ? NYX_GATE_RECOVERY_ANSWER_RESERVATION_REVISION.sourceSha256 : expected)),
  "current ownership-repair core admits only the exact registered answer-reservation transport revision");
const boundedProvider = execFileSync("git", ["show",
  `${NYX_GATE_RECOVERY_ANSWER_RESERVATION_REVISION.predecessor}:${NYX_GATE_RECOVERY_ANSWER_RESERVATION_REVISION.changedPath}`],
{ encoding: "utf8" });
check(digest(Buffer.from(boundedProvider)) === NYX_GATE_RECOVERY_BOUNDED_OUTPUT_REVISION.sourceSha256,
  "historical medium-effort provider is preserved at its exact predecessor rather than rebaselined");
const reservationAdditions = [
  "  /** Explicit hosted Ultra reasoning_budget. Nonnegative and strictly below maxTokens; never unlimited. */\n  readonly reasoningBudgetTokens?: number;\n",
  "      ...(request.reasoningBudgetTokens !== undefined ? { reasoning_budget: request.reasoningBudgetTokens } : {}),\n",
  "    if (request.reasoningBudgetTokens !== undefined && (!Number.isSafeInteger(request.reasoningBudgetTokens)\n      || request.reasoningBudgetTokens < 0 || request.reasoningBudgetTokens >= request.maxTokens\n      || request.inferencePolicy !== \"REASONING_JSON\"\n      || this.#config.model !== \"nvidia/nemotron-3-ultra-550b-a55b\")) issues.push(\"completion_reasoning_budget_invalid\");\n",
];
const currentProvider = readFileSync(NYX_GATE_RECOVERY_ANSWER_RESERVATION_REVISION.changedPath, "utf8");
check(reservationAdditions.every(addition => currentProvider.split(addition).length === 2)
  && reservationAdditions.reduce((source, addition) => source.replace(addition, ""), currentProvider) === boundedProvider,
"answer reservation changes only its typed field, digest-bound payload, and fail-closed validation; retries, authority, and evidence remain unchanged");
check(!NYX_GATE_RECOVERY_ANSWER_RESERVATION_REVISION.historicalScoresComparable
  && !NYX_GATE_RECOVERY_ANSWER_RESERVATION_REVISION.acceptanceOracleChanged
  && !NYX_GATE_RECOVERY_ANSWER_RESERVATION_REVISION.outputCeilingChanged
  && !NYX_GATE_RECOVERY_ANSWER_RESERVATION_REVISION.authorityIncrease,
"new reservation cannot inherit historical scores or weaken compute and acceptance gates");
const originalProvider = execFileSync("git", ["show",
  `${NYX_GATE_RECOVERY_FROZEN_CORE.commit}:${NYX_GATE_RECOVERY_TRANSPORT_REVISION.changedPath}`], { encoding: "utf8" });
const oldRetryBlock = "&& transientUnavailableResponses <= NVIDIA_CAPACITY_POLICY.maxTransientUnavailableRetries) {\n          this.#capacity.defer(null);\n";
const oldHeaderHandling = "        if (response.status === 429) this.#capacity?.defer(response.headers.get(\"retry-after\"));";
const newHeaderHandling = [
  "        // Respect server recovery timing for transient outages as well as 429.",
  "        // Apply it even when this request exhausts its retry allowance so other",
  "        // queued requests cannot immediately stampede an unavailable endpoint.",
  "        if ([429, 502, 503, 504].includes(response.status)) {",
  "          this.#capacity?.defer(response.headers.get(\"retry-after\"));",
  "        }",
].join("\n");
check(originalProvider.split(oldRetryBlock).length === 2 && originalProvider.split(oldHeaderHandling).length === 2,
  "registered transport correction binds exactly two unique historical source locations");
const reviewedProvider = originalProvider.replace(oldRetryBlock,
  "&& transientUnavailableResponses <= NVIDIA_CAPACITY_POLICY.maxTransientUnavailableRetries) {\n")
  .replace(oldHeaderHandling, newHeaderHandling);
const recoveryProvider = execFileSync("git", ["show",
  `${NYX_GATE_RECOVERY_DEADLINE_REVISION.predecessor}:${NYX_GATE_RECOVERY_TRANSPORT_REVISION.changedPath}`], { encoding: "utf8" });
check(recoveryProvider === reviewedProvider && digest(Buffer.from(recoveryProvider)) === NYX_GATE_RECOVERY_TRANSPORT_REVISION.sourceSha256,
  "previous exact two-hunk recovery revision remains reproducible without rewriting history");
const deadlineProvider = execFileSync("git", ["show",
  `${NYX_GATE_RECOVERY_SERVER_ERROR_REVISION.predecessor}:${NYX_GATE_RECOVERY_DEADLINE_REVISION.changedPath}`], { encoding: "utf8" });
const attemptStart = "  async #attempt("; const resultStart = "  #result(";
check(deadlineProvider.split(attemptStart)[0] === recoveryProvider.split(attemptStart)[0]
  && deadlineProvider.split(resultStart)[1] === recoveryProvider.split(resultStart)[1],
  "deadline repair cannot change prompts, parsers, model budgets, retry allowances, or evidence/authority contracts");
check(digest(Buffer.from(deadlineProvider)) === NYX_GATE_RECOVERY_DEADLINE_REVISION.sourceSha256,
  "the preceding deadline revision remains immutable rather than rebaselined to the newer retry policy");
const serverProvider = execFileSync("git", ["show",
  `${NYX_GATE_RECOVERY_BOUNDED_OUTPUT_REVISION.predecessor}:${NYX_GATE_RECOVERY_SERVER_ERROR_REVISION.changedPath}`], { encoding: "utf8" });
const serverRetryBefore = "[502, 503, 504].includes(previous.evidence.statusCode ?? 0)";
const serverCooldownBefore = "[429, 502, 503, 504].includes(response.status)";
check(deadlineProvider.split(serverRetryBefore).length === 2
  && deadlineProvider.split(serverCooldownBefore).length === 2,
  "server-error recovery binds exactly two unique reviewed predecessor locations");
check(serverProvider === deadlineProvider.replace(serverRetryBefore,
  "[500, 502, 503, 504].includes(previous.evidence.statusCode ?? 0)")
  .replace(serverCooldownBefore, "[429, 500, 502, 503, 504].includes(response.status)"),
"HTTP 500 recovery changes only existing status membership, not retry count, payload, parser, budget, or authority");
check(!NYX_GATE_RECOVERY_SERVER_ERROR_REVISION.historicalScoresComparable
  && !NYX_GATE_RECOVERY_SERVER_ERROR_REVISION.acceptanceOracleChanged
  && !NYX_GATE_RECOVERY_SERVER_ERROR_REVISION.authorityIncrease,
"server-error recovery cannot inherit historical scores or promote authority");
check(digest(Buffer.from(serverProvider)) === NYX_GATE_RECOVERY_SERVER_ERROR_REVISION.sourceSha256
  && !NYX_GATE_RECOVERY_BOUNDED_OUTPUT_REVISION.historicalScoresComparable
  && !NYX_GATE_RECOVERY_BOUNDED_OUTPUT_REVISION.acceptanceOracleChanged
  && !NYX_GATE_RECOVERY_BOUNDED_OUTPUT_REVISION.outputCeilingChanged
  && !NYX_GATE_RECOVERY_BOUNDED_OUTPUT_REVISION.authorityIncrease,
  "new output policy cannot rebaseline old server-recovery scores, acceptance, compute ceilings or authority");
check(!NYX_GATE_RECOVERY_TRANSPORT_REVISION.historicalScoresComparable
  && !NYX_GATE_RECOVERY_TRANSPORT_REVISION.acceptanceOracleChanged
  && !NYX_GATE_RECOVERY_TRANSPORT_REVISION.authorityIncrease,
  "new transport source cannot inherit an old comparison identity or relax acceptance");
check(!NYX_GATE_RECOVERY_DEADLINE_REVISION.historicalScoresComparable
  && !NYX_GATE_RECOVERY_DEADLINE_REVISION.acceptanceOracleChanged && !NYX_GATE_RECOVERY_DEADLINE_REVISION.authorityIncrease,
  "deadline repair is a new source identity, not retroactive capability or authority promotion");
check(NYX_ADMISSION_GUIDANCE_TASKS.length === 3
  && new Set(NYX_ADMISSION_GUIDANCE_TASKS.map((task) => task.taskClass)).size === 3
  && NYX_ADMISSION_GUIDANCE.arms.join() === "CURRENT,REASONING_ENABLED"
  && NYX_ADMISSION_GUIDANCE.sourceRepresentation === "TEXT", "three fresh domains and paired control are frozen");
for (const task of NYX_ADMISSION_GUIDANCE_TASKS) {
  const good = await fromSource(task.correctFiles[task.candidateModule]);
  const bad = await fromSource(task.faultyFiles[task.candidateModule]);
  check(task.hiddenCases.length >= 5 && task.hiddenCases.every((item) => satisfies(good[task.exportName], item)),
    `${task.taskId}: reference satisfies every hidden case without input mutation`);
  check(task.hiddenCases.filter((item) => !satisfies(bad[task.exportName], item)).length >= 2,
    `${task.taskId}: faulty source fails at least two hidden cases`);
  const quality = assessEngineeringQuality({ assessmentId: `REFERENCE-${task.taskId}`,
    evaluatorVersion: "admission-guidance-preflight/1", baselineFiles: task.faultyFiles,
    candidateFiles: task.correctFiles, changedPaths: task.mutationPaths,
    functionalAcceptance: "PASS", regressionAcceptance: "PASS", policy: task.qualityPolicy });
  if (quality.decision !== "ACCEPTED") console.error(`${task.taskId}: ${JSON.stringify(quality.failedDimensions.map(
    (dimension) => [dimension, quality.dimensions[dimension].findings]))}`);
  check(quality.decision === "ACCEPTED", `${task.taskId}: reference passes unchanged engineering-quality oracle`);
}
check(NYX_ADMISSION_GUIDANCE_TASKS.every((task) => assessNyxAdmissionReference(task).decision === "REJECTED_REFERENCE"),
"historical guidance references are inadmissible at the earlier static gate despite passing final task quality");
let blockedBeforeInference = false;
try { requireAdmissibleReferenceGates(NYX_ADMISSION_GUIDANCE_TASKS); }
catch (error) { blockedBeforeInference = String(error).includes("nyx_admission_reference_not_admissible:"); }
check(blockedBeforeInference, "incompatible evaluation gates abort before provider inference");
requireAdmissibleReferenceGates(NYX_GATE_RECOVERY_TASKS);
check(NYX_GATE_RECOVERY.comparedWithHistoricalRun === false,
  "modular reissued sources are not represented as comparable historical baselines");
for (const task of NYX_GATE_RECOVERY_TASKS) {
  const helperPath = task.qualityPolicy.readonlyPaths[0];
  const importPath = `./${helperPath.split("/").at(-1)}`;
  const helperUrl = `data:text/javascript;base64,${Buffer.from(task.correctFiles[helperPath]).toString("base64")}`;
  const load = (source: string) => fromSource(source.replace(JSON.stringify(importPath), JSON.stringify(helperUrl)));
  const good = await load(task.correctFiles[task.candidateModule]);
  const bad = await load(task.faultyFiles[task.candidateModule]);
  check(task.hiddenCases.every((item) => satisfies(good[task.exportName], item)),
    `${task.taskId}: modular reference satisfies unchanged hidden oracle`);
  check(task.hiddenCases.filter((item) => !satisfies(bad[task.exportName], item)).length >= 2,
    `${task.taskId}: faulty modular baseline retains real behavior defects`);
  check(!task.mutationPaths.includes(helperPath) && task.initiallyAdmittedPaths.includes(helperPath)
    && task.publicQualityObligations?.length === 3,
    `${task.taskId}: immutable helper is visible and architecture obligations are public`);
  check(assessNyxAdmissionReference(task).decision === "ADMISSIBLE",
    `${task.taskId}: reference survives unchanged public static gate`);
}
check(nyxTransferReportIdentity("ADMISSION_GUIDANCE", "CURRENT", "f".repeat(40)).fileName
  === "nyx-quality-admission_guidance-current-ffffffffffff.json",
"paired report identity is deterministic");
function report(arm: "CURRENT" | "REASONING_ENABLED"): EpochReport {
  return { suiteIdentity: "ADMISSION_GUIDANCE", candidateCommit: "f".repeat(40), modelId: "frozen-model",
    evaluatorDigest: "e".repeat(64), experimentVariant: arm, sourceRepresentation: "TEXT",
    intentCompilationMode: "SAFE_CANONICALIZATION", taskFixtureDigests: Object.fromEntries(
      NYX_ADMISSION_GUIDANCE_TASKS.map((task) => [task.taskId, "d".repeat(64)])),
    configuredBudget: { maxOutputTokensPerCall: 3_072, modelCallsPerTask: 3 },
    frozenCorePreserved: true, contractChangedDuringScoredEval: false,
    authority: { authorityIncrease: false, sourceRepositoryMutation: false },
    aggregateMetrics: { falseAcceptanceRate: 0, falseQualityAcceptanceRate: 0 },
    tasks: NYX_ADMISSION_GUIDANCE_TASKS.map((task) => ({ taskId: task.taskId,
      frozenTaskContentDigest: "d".repeat(64), comparisonArm: arm,
      finalClassification: "FAIL", hiddenAcceptance: "NOT_EXECUTED", engineeringQuality: "NOT_EVALUATED",
      modelCalls: 1, totalTokens: 1_000, tokenUsageComplete: true, durationMs: 1_000,
      repairIterations: 0, publicQualityRevisionCycles: 0, failureClass: "SOURCE_SYNTAX_REJECTION",
      providerDiagnostics: [], sourceRepositoryUnchanged: true, omegaAuthorityEnforcement: true })),
  };
}
const noAdvantage = assessNyxTransferEpoch([report("CURRENT"), report("REASONING_ENABLED")]);
check(noAdvantage.decision === "NO_OBSERVED_REASONING_QUALITY_ADVANTAGE"
  && noAdvantage.reasoningLayerPromoted === false,
"new suite cannot promote reasoning without observed accepted-task gain");
const recoveryReports = (["CURRENT", "REASONING_ENABLED"] as const).map((arm) => ({ ...report(arm),
  suiteIdentity: "GATE_RECOVERY", taskFixtureDigests: Object.fromEntries(NYX_GATE_RECOVERY_TASKS.map(
    (task) => [task.taskId, "d".repeat(64)])), tasks: report(arm).tasks.map((result, index) => ({
    ...result, taskId: NYX_GATE_RECOVERY_TASKS[index].taskId })) }));
const recoveryComparison = assessNyxTransferEpoch(recoveryReports);
check(recoveryComparison.decision === "NO_OBSERVED_REASONING_QUALITY_ADVANTAGE"
  && recoveryComparison.reasoningLayerPromoted === false,
  "recovery comparison preserves no-promotion rule under equal failing outcomes");
let mixedEpochRejected = false;
try { assessNyxTransferEpoch([recoveryReports[0], report("REASONING_ENABLED")]); }
catch (error) { mixedEpochRejected = String(error).includes("transfer_epoch_unmatched_conditions"); }
check(mixedEpochRejected, "recovery and historical task populations cannot be mixed for comparison");
let unboundImportRejected = false;
try { requireAdmissibleReferenceGates([{ ...NYX_GATE_RECOVERY_TASKS[0],
  objective: NYX_GATE_RECOVERY_TASKS[0].objective.replace("'./window-input.mjs'", "its module") }]); }
catch (error) { unboundImportRejected = String(error).includes("nyx_reference_public_obligations_invalid"); }
check(unboundImportRejected, "unbound public import obligation aborts before inference");
check(assessNyxTransferEpoch(recoveryReports.map((r) => ({ ...r,
  tasks: r.tasks.map((t) => ({ ...t, modelCalls: 0, totalTokens: 0, failureClass: "INTEGRATION_FAILURE" })) })))
  .decision === "INCONCLUSIVE_INTEGRATION", "zero-inference integration failure cannot become a model-quality conclusion");
console.log(`OMEGA_NYX_ADMISSION_GUIDANCE passed: ${passed}, failed: ${failures.length}`);
if (failures.length) process.exitCode = 1;
