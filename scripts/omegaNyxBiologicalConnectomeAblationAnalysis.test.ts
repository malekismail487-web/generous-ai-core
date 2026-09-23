import { NYX_BIOLOGICAL_CONNECTOME_ABLATION } from "./omega/nyx-biological-connectome-ablation";
import { assessNyxBiologicalConnectomeAblation, type NyxBiologicalConnectomeAblationArm,
  type NyxBiologicalConnectomeAblationRecord } from "./omega/nyx-biological-connectome-ablation-analysis";

let passed = 0;
let failed = 0;
function check(condition: unknown, label: string): void {
  if (condition) passed += 1;
  else { failed += 1; console.error(`FAIL ${label}`); }
}

const tasks = Object.freeze(["TASK-1", "TASK-2", "TASK-3"]);
const arms = NYX_BIOLOGICAL_CONNECTOME_ABLATION.arms;
check(NYX_BIOLOGICAL_CONNECTOME_ABLATION.sourceRepresentation === "LINES"
  && NYX_BIOLOGICAL_CONNECTOME_ABLATION.intentCompilationMode === "SAFE_CANONICALIZATION"
  && NYX_BIOLOGICAL_CONNECTOME_ABLATION.integrationDefectControl.appliesEquallyToAllArms,
"the experiment controls the observed schema-integration defect equally across every arm");
function record(baseTaskId: string, comparisonArm: NyxBiologicalConnectomeAblationArm,
  accepted: boolean, overrides: Partial<NyxBiologicalConnectomeAblationRecord> = {}):
  NyxBiologicalConnectomeAblationRecord {
  const profiled = comparisonArm === "NYX_BIOLOGICAL_CONNECTOME";
  const adaptive = comparisonArm === "NYX_ADAPTIVE_BIOLOGICAL_CONNECTOME";
  const connected = comparisonArm === "NYX_CONNECTOME" || profiled || adaptive;
  return { baseTaskId, comparisonArm, frozenTaskContentDigest: `digest-${baseTaskId}`,
    taskClass: baseTaskId === "TASK-3" ? "EVIDENCE_SEEKING" : "LOGIC_EDGE_CASE",
    finalClassification: accepted ? "PASS" : "FAIL", modelCalls: 1, repairIterations: 0,
    evidenceRequests: baseTaskId === "TASK-3" ? 1 : 0, totalTokens: 100, promptTokens: 70,
    completionTokens: 30, tokenUsageComplete: true, durationMs: 1_000, verificationCount: 2,
    failureClass: accepted ? "NONE" : "MODEL_REPAIR_FAILURE", omegaAuthorityEnforcement: true,
    sourceRepositoryUnchanged: true, contractPreserved: true,
    providerDiagnostics: [{ failureCategory: null }],
    calibrationSamples: [{ confidence: accepted ? 0.8 : 0.2, acceptedOutcome: accepted ? 1 : 0 }],
    connectomeTraces: connected ? [{ additionalModelCalls: 0, grantsAuthority: false,
      architecture: { profileDigest: profiled
        ? NYX_BIOLOGICAL_CONNECTOME_ABLATION.fixedControlProfileDigest : adaptive ? "a".repeat(64) : null,
      portfolioDigest: adaptive ? NYX_BIOLOGICAL_CONNECTOME_ABLATION.adaptiveTreatmentPortfolioDigest : null,
      adaptiveSelectionDigest: adaptive ? "b".repeat(64) : null } }] : [], ...overrides };
}
function population(pass: (task: string, arm: NyxBiologicalConnectomeAblationArm) => boolean) {
  return tasks.flatMap((task) => arms.map((arm) => record(task, arm, pass(task, arm))));
}
const assess = (records: readonly NyxBiologicalConnectomeAblationRecord[]) =>
  assessNyxBiologicalConnectomeAblation({ records, expectedBaseTaskIds: tasks });

const measurable = assess(population((task, arm) => arm === "NYX_ADAPTIVE_BIOLOGICAL_CONNECTOME" || task === "TASK-3"));
check(measurable.decision === "MEASURABLE_ADAPTIVE_BIOLOGICAL_COGNITIVE_CONTRIBUTION",
  "adaptive treatment must beat all four controls on paired tasks without extra model compute");
check(measurable.controls.treatmentIdentityValid && measurable.controls.controlIdentityValid,
  "scoring binds the exact portfolio to E and fixed profile to D");
check(Object.values(measurable.pairedComparisons).every((comparison) => comparison.wins === 2
  && comparison.losses === 0), "causal rule requires task-local superiority over A, B, C, and D");

const extraCompute = assess(population((task, arm) => arm === "NYX_ADAPTIVE_BIOLOGICAL_CONNECTOME" || task === "TASK-3")
  .map((item) => item.comparisonArm === "NYX_ADAPTIVE_BIOLOGICAL_CONNECTOME" ? { ...item, totalTokens: 101 } : item));
check(extraCompute.decision === "NO_MEASURABLE_ADAPTIVE_BIOLOGICAL_COGNITIVE_CONTRIBUTION"
  && !extraCompute.controls.computeNeutral,
"a capability win cannot be attributed to biology after consuming more provider tokens");

const wrongProfile = assess(population(() => true).map((item) => item.comparisonArm === "NYX_ADAPTIVE_BIOLOGICAL_CONNECTOME"
  ? { ...item, connectomeTraces: [{ additionalModelCalls: 0, grantsAuthority: false,
    architecture: { profileDigest: "a".repeat(64), portfolioDigest: "f".repeat(64),
      adaptiveSelectionDigest: "b".repeat(64) } }] } : item));
check(wrongProfile.decision === "INSUFFICIENT_EVIDENCE" && !wrongProfile.controls.treatmentIdentityValid,
  "wrong portfolio identity invalidates the experiment instead of being scored as architecture failure");

const leakedProfile = assess(population(() => true).map((item) => item.comparisonArm === "NYX_CONNECTOME"
  ? { ...item, connectomeTraces: [{ additionalModelCalls: 0, grantsAuthority: false,
    architecture: { profileDigest: "a".repeat(64),
      portfolioDigest: NYX_BIOLOGICAL_CONNECTOME_ABLATION.adaptiveTreatmentPortfolioDigest } }] } : item));
check(leakedProfile.decision === "INSUFFICIENT_EVIDENCE" && !leakedProfile.controls.controlIdentityValid,
  "portfolio leakage into a control arm invalidates causal attribution");

const unsafe = assess(population((task, arm) => arm === "NYX_ADAPTIVE_BIOLOGICAL_CONNECTOME" || task === "TASK-3")
  .map((item) => item.comparisonArm === "NYX_ADAPTIVE_BIOLOGICAL_CONNECTOME" && item.baseTaskId === "TASK-1"
    ? { ...item, connectomeTraces: [{ ...item.connectomeTraces[0], grantsAuthority: true }] } : item));
check(unsafe.decision === "SAFETY_REGRESSION" && !unsafe.controls.safetyPreserved,
  "authority regression overrides an otherwise positive biological result");

const incomplete = assess(population(() => true).slice(0, -1));
check(incomplete.decision === "INSUFFICIENT_EVIDENCE" && !incomplete.controls.complete,
  "missing paired observations remain insufficient evidence");

const duplicateArms = assess(population(() => true).map((item) => {
  if (item.baseTaskId === "TASK-1" && item.comparisonArm === "NYX_REASONING_STACK") {
    return { ...item, comparisonArm: "NEMOTRON_ALONE" as const };
  }
  if (item.baseTaskId === "TASK-2" && item.comparisonArm === "NEMOTRON_ALONE") {
    return { ...item, comparisonArm: "NYX_REASONING_STACK" as const };
  }
  return item;
}));
check(duplicateArms.decision === "INSUFFICIENT_EVIDENCE" && !duplicateArms.controls.taskParity,
  "globally balanced arm counts cannot conceal missing task-local arms");

console.log(`OMEGA_NYX_BIOLOGICAL_CONNECTOME_ABLATION_ANALYSIS_TESTS passed: ${passed}, failed: ${failed}`);
if (failed > 0) process.exit(1);
