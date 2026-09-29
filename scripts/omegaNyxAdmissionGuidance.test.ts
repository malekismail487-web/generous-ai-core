import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { assessEngineeringQuality } from "../src/lib/codelab/assurance/engineeringQualityOracle";
import { NYX_ADMISSION_GUIDANCE, NYX_ADMISSION_GUIDANCE_FROZEN_CORE,
  NYX_ADMISSION_GUIDANCE_TASKS } from "./omega/nyx-admission-guidance-fixtures";
import { assessNyxTransferEpoch, nyxTransferReportIdentity,
  type EpochReport } from "./omega/nyx-transfer-epoch-compare";

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
  digest(execFileSync("git", ["show", `${NYX_ADMISSION_GUIDANCE_FROZEN_CORE.commit}:${path}`])) === expected
  && digest(readFileSync(path)) === expected), "new scored core matches its immutable pinned source");
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
console.log(`OMEGA_NYX_ADMISSION_GUIDANCE passed: ${passed}, failed: ${failures.length}`);
if (failures.length) process.exitCode = 1;
