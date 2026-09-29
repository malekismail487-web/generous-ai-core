import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { assessEngineeringQuality } from "../src/lib/codelab/assurance/engineeringQualityOracle";
import { NYX_EMISSION_TRANSFER, NYX_EMISSION_TRANSFER_FROZEN_CORE,
  NYX_EMISSION_TRANSFER_TASKS } from "./omega/nyx-emission-transfer-fixtures";
import { assessNyxTransferEpoch, type EpochReport } from "./omega/nyx-transfer-epoch-compare";
import { NYX_TRANSFER_EPOCH_FROZEN_CORE } from "./omega/nyx-transfer-epoch-fixtures";

let passed = 0;
const failures: string[] = [];
function check(value: unknown, label: string): void {
  if (value) passed += 1;
  else { failures.push(label); console.error(`  x ${label}`); }
}
async function moduleFromSource(source: string): Promise<Record<string, (...args: unknown[]) => unknown>> {
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}
function satisfies(fn: (...args: unknown[]) => unknown, testCase: typeof NYX_EMISSION_TRANSFER_TASKS[number]["hiddenCases"][number]): boolean {
  const args = structuredClone(testCase.args) as unknown[];
  const before = JSON.stringify(args);
  try {
    const result = fn(...args);
    return testCase.expectation.kind === "RETURN"
      && JSON.stringify(result) === JSON.stringify(testCase.expectation.value)
      && JSON.stringify(args) === before;
  } catch (error) {
    return testCase.expectation.kind === "THROW" && error instanceof Error
      && error.name === testCase.expectation.errorName && JSON.stringify(args) === before;
  }
}
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
check(Object.entries(NYX_EMISSION_TRANSFER_FROZEN_CORE.files).every(([path, expected]) =>
  digest(execFileSync("git", ["show", `${NYX_EMISSION_TRANSFER_FROZEN_CORE.commit}:${path}`])) === expected
  && digest(readFileSync(path)) === expected),
"new scored core is pinned to the reviewed emission-repair candidate");
check(NYX_TRANSFER_EPOCH_FROZEN_CORE.files["src/lib/codelab/cognition/nyxRepairIntentCompiler.ts"]
  === digest(execFileSync("git", ["show", `${NYX_TRANSFER_EPOCH_FROZEN_CORE.commit}:src/lib/codelab/cognition/nyxRepairIntentCompiler.ts`]))
  && NYX_TRANSFER_EPOCH_FROZEN_CORE.files["src/lib/codelab/cognition/nyxRepairIntentCompiler.ts"]
    !== NYX_EMISSION_TRANSFER_FROZEN_CORE.files["src/lib/codelab/cognition/nyxRepairIntentCompiler.ts"],
"historical transfer cannot silently adopt the new source compiler while retaining its frozen-core claim");
check(NYX_EMISSION_TRANSFER_TASKS.length === 3
  && new Set(NYX_EMISSION_TRANSFER_TASKS.map((task) => task.taskClass)).size === 3
  && NYX_EMISSION_TRANSFER.sourceRepresentation === "TEXT"
  && NYX_EMISSION_TRANSFER.arms.join() === "CURRENT,REASONING_ENABLED",
"three fresh domains and the paired TEXT-only comparison are frozen");
for (const task of NYX_EMISSION_TRANSFER_TASKS) {
  const good = await moduleFromSource(task.correctFiles[task.candidateModule]);
  const bad = await moduleFromSource(task.faultyFiles[task.candidateModule]);
  check(task.hiddenCases.length >= 5 && task.hiddenCases.every((item) => satisfies(good[task.exportName], item)),
    `${task.taskId}: reference satisfies predeclared hidden cases without input mutation`);
  check(task.hiddenCases.filter((item) => !satisfies(bad[task.exportName], item)).length >= 2,
    `${task.taskId}: faulty state fails at least two independent hidden cases`);
  check(task.mutationPaths.length === 1 && task.mutationPaths[0] === task.candidateModule
    && task.qualityPolicy.allowedChangedPaths.join() === task.mutationPaths.join(),
    `${task.taskId}: executable mutation and quality scopes match`);
  const quality = assessEngineeringQuality({ assessmentId: `REFERENCE-${task.taskId}`,
    evaluatorVersion: "emission-transfer-preflight/1", baselineFiles: task.faultyFiles,
    candidateFiles: task.correctFiles, changedPaths: task.mutationPaths,
    functionalAcceptance: "PASS", regressionAcceptance: "PASS", policy: task.qualityPolicy });
  if (quality.decision !== "ACCEPTED") console.error(`${task.taskId}: ${JSON.stringify(quality.failedDimensions.map(
    (dimension) => [dimension, quality.dimensions[dimension].findings]))}`);
  check(quality.decision === "ACCEPTED", `${task.taskId}: reference is accepted by unchanged engineering quality oracle`);
}
function report(arm: "CURRENT" | "REASONING_ENABLED", extraAccepted: boolean,
  tokensPerTask = 1_000): EpochReport {
  return { suiteIdentity: "EMISSION_TRANSFER", candidateCommit: "f".repeat(40), modelId: "frozen-model",
    evaluatorDigest: "e".repeat(64), experimentVariant: arm, sourceRepresentation: "TEXT",
    intentCompilationMode: "SAFE_CANONICALIZATION", taskFixtureDigests: Object.fromEntries(
      NYX_EMISSION_TRANSFER_TASKS.map((task) => [task.taskId, "d".repeat(64)])),
    configuredBudget: { maxOutputTokensPerCall: 3_072, modelCallsPerTask: 3 },
    frozenCorePreserved: true, contractChangedDuringScoredEval: false,
    authority: { authorityIncrease: false, sourceRepositoryMutation: false },
    aggregateMetrics: { falseAcceptanceRate: 0, falseQualityAcceptanceRate: 0 },
    tasks: NYX_EMISSION_TRANSFER_TASKS.map((task, index) => {
      const accepted = index === 0 || (extraAccepted && index === 1);
      return { taskId: task.taskId, frozenTaskContentDigest: "d".repeat(64), comparisonArm: arm,
        finalClassification: accepted ? "PASS" : "FAIL", hiddenAcceptance: accepted ? "PASS" : "NOT_EXECUTED",
        engineeringQuality: accepted ? "ACCEPTED" : "NOT_EVALUATED", modelCalls: 1,
        totalTokens: tokensPerTask, tokenUsageComplete: true, durationMs: 1_000,
        repairIterations: 0, publicQualityRevisionCycles: 0,
        failureClass: accepted ? "NONE" : "SOURCE_SYNTAX_REJECTION", providerDiagnostics: [],
        sourceRepositoryUnchanged: true, omegaAuthorityEnforcement: true };
    }) };
}
const noAdvantage = assessNyxTransferEpoch([report("CURRENT", false), report("REASONING_ENABLED", false)]);
check(noAdvantage.decision === "NO_OBSERVED_REASONING_QUALITY_ADVANTAGE"
  && noAdvantage.reasoningLayerPromoted === false,
"paired comparison cannot promote reasoning without accepted-task advantage");
const extraCompute = assessNyxTransferEpoch([report("CURRENT", false), report("REASONING_ENABLED", true, 2_000)]);
check(extraCompute.decision === "QUALITY_ADVANTAGE_AT_EXTRA_OR_UNMATCHED_COMPUTE"
  && extraCompute.reasoningLayerPromoted === false,
"reasoning quality gain at double realized tokens is not promoted");
const tentative = assessNyxTransferEpoch([report("CURRENT", false), report("REASONING_ENABLED", true)]);
check(tentative.decision === "TENTATIVE_REASONING_ADVANTAGE_REPLICATION_REQUIRED"
  && tentative.reasoningLayerPromoted === false,
"single matched-compute pass remains tentative pending independent repetition");
console.log(`OMEGA_NYX_EMISSION_TRANSFER passed: ${passed}, failed: ${failures.length}`);
if (failures.length) process.exitCode = 1;
