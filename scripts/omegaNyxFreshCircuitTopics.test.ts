import { NYX_FRESH_CIRCUIT_TOPICS } from "./omega/nyx-fresh-circuit-topics";
import { assessNyxFreshCircuitPair, type NyxFreshCircuitRecord } from
  "./omega/nyx-fresh-circuit-comparison";
import { NYX_VERIFIED_HYBRID_BIOLOGICAL_PROFILE } from
  "../src/lib/codelab/connectome/verifiedBiologicalArchitectureProfile";
import { NYX_REPAIR_FEEDBACK_TASK, NYX_REPAIR_FEEDBACK_COMPARISON,
  NYX_REPAIR_FEEDBACK_FROZEN_CORE } from
  "./omega/nyx-repair-feedback-diagnostic";
import { NYX_REPAIR_FEEDBACK_TRANSFER_TASK } from "./omega/nyx-repair-feedback-transfer";
import { assessEngineeringQuality } from "../src/lib/codelab/assurance/engineeringQualityOracle";
import { OMEGA_PUBLIC_STATIC_CANDIDATE_POLICY_V2 } from
  "../src/lib/codelab/assurance/candidateEngineeringAdmission";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

let passed = 0;
let failed = 0;
function check(condition: unknown, label: string): void {
  if (condition) passed += 1;
  else { failed += 1; console.error(`FAIL ${label}`); }
}

async function moduleFromSource(source: string): Promise<Record<string, (...args: unknown[]) => unknown>> {
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

function satisfiesCase(fn: (...args: unknown[]) => unknown,
  testCase: (typeof NYX_FRESH_CIRCUIT_TOPICS)[number]["hiddenCases"][number]): boolean {
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

check(NYX_FRESH_CIRCUIT_TOPICS.length === 2
  && new Set(NYX_FRESH_CIRCUIT_TOPICS.map((task) => task.topic)).size === 2,
"the two topics are frozen as separate, nonduplicated diagnostics");
for (const task of NYX_FRESH_CIRCUIT_TOPICS) {
  const good = await moduleFromSource(task.correctFiles[task.candidateModule]);
  const bad = await moduleFromSource(task.faultyFiles[task.candidateModule]);
  check(typeof good[task.exportName] === "function" && typeof bad[task.exportName] === "function",
    `${task.topic} exports the same named public function in reference and faulty states`);
  check(task.hiddenCases.length >= 5 && task.hiddenCases.every((item) => satisfiesCase(good[task.exportName], item)),
    `${task.topic} reference satisfies every predeclared hidden case without input mutation`);
  check(task.hiddenCases.filter((item) => !satisfiesCase(bad[task.exportName], item)).length >= 2,
    `${task.topic} faulty implementation is rejected by multiple predeclared hidden cases`);
  check(task.mutationPaths.length === 1 && task.mutationPaths[0] === task.candidateModule
    && task.qualityPolicy.allowedChangedPaths.length === 1,
    `${task.topic} mutation and quality scope remain bounded to the candidate module`);
}

const feedbackReference = await moduleFromSource(
  NYX_REPAIR_FEEDBACK_TASK.correctFiles[NYX_REPAIR_FEEDBACK_TASK.candidateModule]);
const feedbackFaulty = await moduleFromSource(
  NYX_REPAIR_FEEDBACK_TASK.faultyFiles[NYX_REPAIR_FEEDBACK_TASK.candidateModule]);
check(NYX_REPAIR_FEEDBACK_TASK.hiddenCases.length >= 5
  && NYX_REPAIR_FEEDBACK_TASK.hiddenCases.every((item) =>
    satisfiesCase(feedbackReference[NYX_REPAIR_FEEDBACK_TASK.exportName], item)),
"fresh feedback diagnostic reference satisfies every predeclared hidden case");
check(NYX_REPAIR_FEEDBACK_TASK.hiddenCases.filter((item) =>
  !satisfiesCase(feedbackFaulty[NYX_REPAIR_FEEDBACK_TASK.exportName], item)).length >= 2,
"fresh feedback diagnostic has independently observable faults");
check(NYX_REPAIR_FEEDBACK_TASK.mutationPaths.length === 1
  && NYX_REPAIR_FEEDBACK_TASK.mutationPaths[0] === NYX_REPAIR_FEEDBACK_TASK.candidateModule
  && NYX_REPAIR_FEEDBACK_COMPARISON.arms.length === 2
  && NYX_REPAIR_FEEDBACK_COMPARISON.maxCognitionCyclesPerTask === 3,
"feedback comparison freezes one mutation scope and equal three-call ceilings");
check(Object.entries(NYX_REPAIR_FEEDBACK_FROZEN_CORE.files).every(([path, digest]) => {
  const historical = execFileSync("git", ["show", `${NYX_REPAIR_FEEDBACK_FROZEN_CORE.commit}:${path}`]);
  const current = readFileSync(path);
  const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
  return sha(historical) === digest && sha(current) === digest;
}), "feedback experiment is bound to the pinned historical core and present source bytes");
const publicReferenceAssessment = (task: typeof NYX_REPAIR_FEEDBACK_TASK
  | typeof NYX_REPAIR_FEEDBACK_TRANSFER_TASK) => assessEngineeringQuality({
  assessmentId: `REFERENCE-${task.taskId}`, evaluatorVersion: "reference-preflight/1",
  baselineFiles: task.faultyFiles, candidateFiles: task.correctFiles,
  changedPaths: task.mutationPaths, functionalAcceptance: "PASS", regressionAcceptance: "PASS",
  policy: { ...OMEGA_PUBLIC_STATIC_CANDIDATE_POLICY_V2,
    allowedChangedPaths: task.mutationPaths, readonlyPaths: [], maxAddedDeclarations: 12, invariants: [] },
});
check(publicReferenceAssessment(NYX_REPAIR_FEEDBACK_TASK).decision === "REJECTED",
  "first scored task retains the discovered reference-versus-public-quality conflict as negative evidence");
const transferReference = await moduleFromSource(NYX_REPAIR_FEEDBACK_TRANSFER_TASK.correctFiles[
  NYX_REPAIR_FEEDBACK_TRANSFER_TASK.candidateModule]);
const transferFaulty = await moduleFromSource(NYX_REPAIR_FEEDBACK_TRANSFER_TASK.faultyFiles[
  NYX_REPAIR_FEEDBACK_TRANSFER_TASK.candidateModule]);
check(publicReferenceAssessment(NYX_REPAIR_FEEDBACK_TRANSFER_TASK).decision === "ACCEPTED",
  "new transfer reference clears the unchanged public static admission policy before inference");
check(NYX_REPAIR_FEEDBACK_TRANSFER_TASK.hiddenCases.length >= 5
  && NYX_REPAIR_FEEDBACK_TRANSFER_TASK.hiddenCases.every((item) =>
    satisfiesCase(transferReference[NYX_REPAIR_FEEDBACK_TRANSFER_TASK.exportName], item)),
  "new transfer reference satisfies every predeclared hidden case");
check(NYX_REPAIR_FEEDBACK_TRANSFER_TASK.hiddenCases.filter((item) =>
  !satisfiesCase(transferFaulty[NYX_REPAIR_FEEDBACK_TRANSFER_TASK.exportName], item)).length >= 2,
  "new transfer faulty implementation fails multiple hidden cases");

const record = (comparisonArm: NyxFreshCircuitRecord["comparisonArm"],
  outcome: string): NyxFreshCircuitRecord => ({
  baseTaskId: "NYX-FRESH-LEDGER-RECONCILIATION", comparisonArm,
  frozenTaskContentDigest: "a".repeat(64), finalClassification: outcome,
  totalTokens: comparisonArm === "NYX_REASONING_STACK" ? 3000 : 2500,
  tokenUsageComplete: true, modelCalls: 2, repairIterations: 1, durationMs: 1000,
  providerDiagnostics: [], omegaAuthorityEnforcement: true, sourceRepositoryUnchanged: true,
  contractPreserved: true,
  connectomeTraces: comparisonArm === "NYX_REASONING_STACK" ? [] : [{
    circuitState: "SUPPORTED_CANDIDATE", selectedAction: "request admitted evidence",
    additionalModelCalls: 0, grantsAuthority: false,
    architecture: { profileDigest: NYX_VERIFIED_HYBRID_BIOLOGICAL_PROFILE.profileDigest },
  }],
});
const control = record("NYX_REASONING_STACK", "FAIL");
const treatment = record("NYX_EVIDENCE_GATED_CIRCUIT", "PASS");
const uplift = assessNyxFreshCircuitPair([control, treatment], "LEDGER");
check(uplift.decision === "TENTATIVE_SINGLE_TASK_UPLIFT" && uplift.generalizationCertified === false,
  "one paired win is only tentative, not a generalization certificate");
check(assessNyxFreshCircuitPair([record("NYX_REASONING_STACK", "PASS"), treatment], "LEDGER")
  .decision === "NO_PAIRED_UPLIFT", "a control success prevents a false uplift claim");
check(assessNyxFreshCircuitPair([control, { ...treatment, tokenUsageComplete: false }], "LEDGER")
  .decision === "INSUFFICIENT_EVIDENCE", "incomplete usage cannot establish a compute-matched benefit");
check(assessNyxFreshCircuitPair([control, { ...treatment, omegaAuthorityEnforcement: false }], "LEDGER")
  .decision === "SAFETY_REGRESSION", "an authority regression outranks a scored success");

console.log(`OMEGA_NYX_FRESH_CIRCUIT_TOPICS_TESTS passed: ${passed}, failed: ${failed}`);
if (failed > 0) process.exit(1);
