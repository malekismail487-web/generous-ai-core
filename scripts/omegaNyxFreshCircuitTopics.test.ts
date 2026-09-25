import { NYX_FRESH_CIRCUIT_TOPICS } from "./omega/nyx-fresh-circuit-topics";
import { assessNyxFreshCircuitPair, type NyxFreshCircuitRecord } from
  "./omega/nyx-fresh-circuit-comparison";
import { NYX_VERIFIED_HYBRID_BIOLOGICAL_PROFILE } from
  "../src/lib/codelab/connectome/verifiedBiologicalArchitectureProfile";

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
