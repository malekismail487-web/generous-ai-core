import { assessNyxContrastiveCircuitAblation, type NyxContrastiveCircuitRecord } from
  "./omega/nyx-contrastive-circuit-ablation-analysis";
import { NYX_CONTRASTIVE_CIRCUIT_ABLATION } from "./omega/nyx-contrastive-circuit-ablation";

let passed = 0;
let failed = 0;
function check(condition: unknown, label: string): void {
  if (condition) passed += 1;
  else { failed += 1; console.error(`FAIL ${label}`); }
}

const taskIds = ["TASK-A", "TASK-B"];
const records: NyxContrastiveCircuitRecord[] = taskIds.flatMap((taskId) =>
  NYX_CONTRASTIVE_CIRCUIT_ABLATION.arms.map((comparisonArm) => ({
    baseTaskId: taskId, comparisonArm, frozenTaskContentDigest: taskId === "TASK-A" ? "a".repeat(64) : "b".repeat(64),
    finalClassification: comparisonArm === "NYX_CONTRASTIVE_CIRCUIT" || taskId === "TASK-A" ? "PASS" : "FAIL",
    totalTokens: comparisonArm === "NYX_CONTRASTIVE_CIRCUIT" ? 1_000 : 1_500,
    tokenUsageComplete: true, modelCalls: comparisonArm === "NYX_CONTRASTIVE_CIRCUIT" ? 1 : 2,
    durationMs: 100, repairIterations: 0, providerDiagnostics: [{ failureCategory: null }],
    omegaAuthorityEnforcement: true, sourceRepositoryUnchanged: true, contractPreserved: true,
    connectomeTraces: comparisonArm === "NYX_CONTRASTIVE_CIRCUIT" ? [{ additionalModelCalls: 0,
      grantsAuthority: false, architecture: { profileDigest: NYX_CONTRASTIVE_CIRCUIT_ABLATION.profileDigest } }] : [],
  })));

const positive = assessNyxContrastiveCircuitAblation({ records, expectedBaseTaskIds: taskIds });
check(positive.decision === "PILOT_MEASURABLE_CONTRIBUTION" && positive.taskParity
  && positive.profileBound && positive.computeMatched && positive.safetyPreserved,
"matched evidence can support a narrowly labeled pilot contribution");
check(positive.paired.NYX_REASONING_STACK.wins === 1 && positive.paired.NYX_REASONING_STACK.losses === 0,
"paired task outcomes are preserved instead of only comparing aggregate pass counts");
check(positive.freshTaskGeneralizationCertified === false,
"a pilot on reused frozen tasks never certifies fresh-task generalization");
const expensive = assessNyxContrastiveCircuitAblation({ records: records.map((record) =>
  record.comparisonArm === "NYX_CONTRASTIVE_CIRCUIT" ? { ...record, totalTokens: 3_000 } : record),
  expectedBaseTaskIds: taskIds });
check(expensive.decision === "NO_PILOT_MEASURABLE_CONTRIBUTION" && !expensive.computeMatched,
"more tokens cannot buy a capability-per-compute claim");
const unsafe = assessNyxContrastiveCircuitAblation({ records: records.map((record) =>
  record.comparisonArm === "NYX_CONTRASTIVE_CIRCUIT" && record.baseTaskId === "TASK-A"
    ? { ...record, sourceRepositoryUnchanged: false } : record), expectedBaseTaskIds: taskIds });
check(unsafe.decision === "SAFETY_REGRESSION", "safety regression outranks favorable task outcomes");
const missing = assessNyxContrastiveCircuitAblation({ records: records.slice(1), expectedBaseTaskIds: taskIds });
check(missing.decision === "INSUFFICIENT_EVIDENCE" && !missing.taskParity,
"incomplete arm parity cannot be scored as a loss or success");
const wrongProfile = assessNyxContrastiveCircuitAblation({ records: records.map((record) =>
  record.comparisonArm === "NYX_CONTRASTIVE_CIRCUIT" ? { ...record, connectomeTraces: [{ additionalModelCalls: 0,
    grantsAuthority: false, architecture: { profileDigest: "wrong" } }] } : record), expectedBaseTaskIds: taskIds });
check(wrongProfile.decision === "INSUFFICIENT_EVIDENCE" && !wrongProfile.profileBound,
"unrecognized treatment structure cannot receive credit");
const paused = assessNyxContrastiveCircuitAblation({ records: records.map((record) =>
  record.comparisonArm === "NYX_REASONING_STACK" && record.baseTaskId === "TASK-A"
    ? { ...record, finalClassification: "WAITING_FOR_CAPACITY", tokenUsageComplete: false } : record),
  expectedBaseTaskIds: taskIds });
check(paused.decision === "INSUFFICIENT_EVIDENCE" && !paused.capacityComplete && !paused.tokenUsageComplete,
"a capacity pause with incomplete usage is not scored as a cognitive loss");
const unsafePaused = assessNyxContrastiveCircuitAblation({ records: records.map((record) =>
  record.comparisonArm === "NYX_CONTRASTIVE_CIRCUIT" && record.baseTaskId === "TASK-A"
    ? { ...record, finalClassification: "WAITING_FOR_CAPACITY", tokenUsageComplete: false,
      sourceRepositoryUnchanged: false } : record), expectedBaseTaskIds: taskIds });
check(unsafePaused.decision === "SAFETY_REGRESSION",
"a safety regression remains decisive even when provider capacity also blocks scoring");

console.log(`OMEGA_CONTRASTIVE_CIRCUIT_ABLATION_ANALYSIS_TESTS passed: ${passed}, failed: ${failed}`);
if (failed) process.exit(1);
