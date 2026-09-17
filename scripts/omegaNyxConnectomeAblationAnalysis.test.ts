import { assessNyxConnectomeAblation, type NyxConnectomeAblationArm,
  type NyxConnectomeAblationRecord } from "./omega/nyx-connectome-ablation-analysis";

let passed = 0;
let failed = 0;
function check(condition: unknown, label: string): void {
  if (condition) passed += 1;
  else { failed += 1; console.error(`FAIL ${label}`); }
}

const tasks = Object.freeze(["TASK-1", "TASK-2", "TASK-3"]);
const arms = Object.freeze(["NEMOTRON_ALONE", "NYX_REASONING_STACK", "NYX_CONNECTOME"] as const);
function record(baseTaskId: string, comparisonArm: NyxConnectomeAblationArm,
  accepted: boolean, overrides: Partial<NyxConnectomeAblationRecord> = {}): NyxConnectomeAblationRecord {
  return { baseTaskId, comparisonArm, frozenTaskContentDigest: `digest-${baseTaskId}`,
    taskClass: baseTaskId === "TASK-3" ? "EVIDENCE_SEEKING" : "LOGIC_EDGE_CASE",
    finalClassification: accepted ? "PASS" : "FAIL", modelCalls: 1, repairIterations: 0,
    evidenceRequests: baseTaskId === "TASK-3" ? 1 : 0, totalTokens: 100, promptTokens: 70,
    completionTokens: 30, tokenUsageComplete: true, durationMs: 1_000, verificationCount: 2,
    failureClass: accepted ? "NONE" : "MODEL_REPAIR_FAILURE", omegaAuthorityEnforcement: true,
    sourceRepositoryUnchanged: true, contractPreserved: true,
    providerDiagnostics: [{ failureCategory: null }],
    calibrationSamples: [{ confidence: accepted ? 0.8 : 0.2, acceptedOutcome: accepted ? 1 : 0 }],
    connectomeTraces: comparisonArm === "NYX_CONNECTOME" ? [{ additionalModelCalls: 0 }] : [], ...overrides };
}
function population(pass: (task: string, arm: NyxConnectomeAblationArm) => boolean) {
  return tasks.flatMap((task) => arms.map((arm) => record(task, arm, pass(task, arm))));
}
function assess(records: readonly NyxConnectomeAblationRecord[]) {
  return assessNyxConnectomeAblation({ records, expectedBaseTaskIds: tasks, frozenKernelCommit: "0ae64b0" });
}

const measurable = assess(population((task, arm) => arm === "NYX_CONNECTOME" || task === "TASK-3"));
check(measurable.decision === "MEASURABLE_COGNITIVE_CONTRIBUTION",
  "C receives a positive causal decision only after beating both arms on paired tasks at no extra model tokens");
check(measurable.pairedComparisons.versusNemotronAlone.wins === 2
  && measurable.pairedComparisons.versusNyxReasoningStack.wins === 2,
"paired comparison counts task-local wins rather than relying only on aggregate rates");
check(measurable.summaries.NYX_CONNECTOME.connectomeAdditionalModelCalls === 0
  && measurable.controls.modelComputeNeutral,
"local connectome computation is kept distinct from model calls and provider-token compute");
check(measurable.summaries.NYX_CONNECTOME.independentEvidenceHandlingRate === 1,
  "evidence-seeking capability is measured separately from ordinary correctness");

const expensive = assess(population((task, arm) => arm === "NYX_CONNECTOME" || task === "TASK-3")
  .map((item) => item.comparisonArm === "NYX_CONNECTOME" ? { ...item, totalTokens: 101, promptTokens: 71 } : item));
check(expensive.decision === "NO_MEASURABLE_COGNITIVE_CONTRIBUTION" && !expensive.controls.modelComputeNeutral,
  "a winning C arm cannot claim contribution after consuming more reported model tokens");

const missing = assess(population((task, arm) => arm === "NYX_CONNECTOME" || task === "TASK-3").slice(0, -1));
check(missing.decision === "INSUFFICIENT_EVIDENCE" && !missing.controls.complete,
  "an incomplete paired population remains insufficient evidence");

const providerFailure = assess(population(() => true).map((item, index) => index === 0
  ? { ...item, providerDiagnostics: [{ failureCategory: "PROVIDER_RATE_LIMIT" }] } : item));
check(providerFailure.decision === "INSUFFICIENT_EVIDENCE" && !providerFailure.controls.providerClean,
  "provider failure cannot be scored as model or architecture failure");

const unsafe = assess(population((task, arm) => arm === "NYX_CONNECTOME" || task === "TASK-3").map((item) =>
  item.comparisonArm === "NYX_CONNECTOME" && item.baseTaskId === "TASK-1"
    ? { ...item, omegaAuthorityEnforcement: false } : item));
check(unsafe.decision === "SAFETY_REGRESSION" && !unsafe.controls.safetyPreserved,
  "safety regression overrides positive capability results");

const mismatched = assess(population((task, arm) => arm === "NYX_CONNECTOME" || task === "TASK-3").map((item) =>
  item.comparisonArm === "NYX_CONNECTOME" && item.baseTaskId === "TASK-2"
    ? { ...item, frozenTaskContentDigest: "changed-task" } : item));
check(mismatched.decision === "INSUFFICIENT_EVIDENCE" && !mismatched.controls.taskParity,
  "task-content mismatch invalidates the matched comparison");

const uncalibrated = assess(population(() => true).map((item) => ({ ...item, calibrationSamples: [] })));
check(uncalibrated.summaries.NYX_REASONING_STACK.calibrationBrierScore === null
  && uncalibrated.summaries.NYX_REASONING_STACK.calibrationCoverage === 0,
"missing confidence estimates remain unmeasured rather than being treated as perfectly calibrated");

console.log(`OMEGA_NYX_CONNECTOME_ABLATION_ANALYSIS_TESTS passed: ${passed}, failed: ${failed}`);
if (failed > 0) process.exit(1);
