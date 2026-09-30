import { assessEngineeringQuality, type EngineeringQualityPolicy,
  type EngineeringQualityDimension } from "../../src/lib/codelab/assurance/engineeringQualityOracle";
import { OMEGA_PUBLIC_STATIC_CANDIDATE_POLICY_V2,
  OMEGA_TINY_SINGLE_FILE_REPAIR_MAX_ADDED_DECLARATIONS,
  OMEGA_TINY_SINGLE_FILE_REPAIR_MAX_NONBLANK_BASELINE_LINES,
  validPublicQualityObligations,
  type PublicObjectiveQualityObligation } from "../../src/lib/codelab/assurance/candidateEngineeringAdmission";

export interface NyxQualityReferenceTask {
  readonly taskId: string;
  readonly objective?: string;
  readonly baseTaskId?: string;
  readonly faultyFiles: Readonly<Record<string, string>>;
  readonly correctFiles: Readonly<Record<string, string>>;
  readonly mutationPaths: readonly string[];
  readonly qualityPolicy: EngineeringQualityPolicy;
  readonly publicQualityObligations?: readonly PublicObjectiveQualityObligation[];
}

export interface NyxQualityReferenceResult {
  readonly taskId: string;
  readonly decision: "ADMISSIBLE" | "REJECTED_REFERENCE" | "INSUFFICIENT_EVIDENCE";
  readonly failedDimensions: readonly EngineeringQualityDimension[];
  readonly uncertainDimensions: readonly EngineeringQualityDimension[];
  readonly evidenceId: string;
}

/**
 * A reference rejected by the exact policy used to score candidates is not a
 * valid quality benchmark. This is necessary, not sufficient: hidden behavior
 * and oracle independence must still be checked separately.
 */
export function assessNyxQualityReference(task: NyxQualityReferenceTask): NyxQualityReferenceResult {
  const taskId = task.baseTaskId ?? task.taskId;
  const assessment = assessEngineeringQuality({
    assessmentId: `NYX-REFERENCE-PREFLIGHT-${taskId}`,
    evaluatorVersion: "nyx-quality-reference-preflight/1",
    baselineFiles: { ...task.correctFiles, ...task.faultyFiles },
    candidateFiles: task.correctFiles,
    changedPaths: task.mutationPaths,
    functionalAcceptance: "PASS",
    regressionAcceptance: "PASS",
    policy: task.qualityPolicy,
  });
  const uncertainDimensions = Object.values(assessment.dimensions)
    .filter((dimension) => dimension.disposition === "INSUFFICIENT_EVIDENCE")
    .map((dimension) => dimension.dimension);
  return Object.freeze({ taskId, decision: assessment.decision === "ACCEPTED" ? "ADMISSIBLE"
    : assessment.decision === "REJECTED" ? "REJECTED_REFERENCE" : "INSUFFICIENT_EVIDENCE",
    failedDimensions: assessment.failedDimensions, uncertainDimensions, evidenceId: assessment.evidenceId });
}

export function requireAdmissibleQualityReferences(tasks: readonly NyxQualityReferenceTask[]): readonly NyxQualityReferenceResult[] {
  const results: NyxQualityReferenceResult[] = [];
  for (const task of tasks) {
    const taskId = task.baseTaskId ?? task.taskId;
    const result = assessNyxQualityReference(task);
    if (result.decision !== "ADMISSIBLE") {
      throw new Error(`nyx_quality_reference_not_admissible:${taskId}:${result.decision}`
        + `:${[...result.failedDimensions, ...result.uncertainDimensions].join(",")}`);
    }
    results.push(result);
  }
  return Object.freeze(results);
}

/** Viability check only. It cannot authorize a candidate or substitute for provenance-bound admission. */
export function assessNyxAdmissionReference(task: NyxQualityReferenceTask): NyxQualityReferenceResult {
  const taskId = task.baseTaskId ?? task.taskId;
  const original = { ...task.correctFiles, ...task.faultyFiles };
  const reviewedPaths = Object.keys(original).filter((path) => original[path] !== task.correctFiles[path]).sort();
  const tinyRepair = reviewedPaths.length === 1
    && original[reviewedPaths[0]].split(/\r?\n/).filter((line) => line.trim()).length
      <= OMEGA_TINY_SINGLE_FILE_REPAIR_MAX_NONBLANK_BASELINE_LINES;
  const policy: EngineeringQualityPolicy = {
    ...OMEGA_PUBLIC_STATIC_CANDIDATE_POLICY_V2,
    allowedChangedPaths: task.mutationPaths, readonlyPaths: [],
    maxAddedDeclarations: tinyRepair ? OMEGA_TINY_SINGLE_FILE_REPAIR_MAX_ADDED_DECLARATIONS
      : OMEGA_PUBLIC_STATIC_CANDIDATE_POLICY_V2.maxAddedDeclarations,
    invariants: (task.publicQualityObligations ?? []).map((item) => item.invariant),
  };
  const assessment = assessEngineeringQuality({ assessmentId: `NYX-ADMISSION-PREFLIGHT-${taskId}`,
    evaluatorVersion: "nyx-admission-reference-preflight/1",
    baselineFiles: Object.fromEntries(reviewedPaths.map((path) => [path, original[path]])),
    candidateFiles: Object.fromEntries(reviewedPaths.map((path) => [path, task.correctFiles[path]])),
    changedPaths: reviewedPaths, functionalAcceptance: "PASS", regressionAcceptance: "PASS", policy });
  const uncertainDimensions = Object.values(assessment.dimensions)
    .filter((dimension) => dimension.disposition === "INSUFFICIENT_EVIDENCE")
    .map((dimension) => dimension.dimension);
  return Object.freeze({ taskId, decision: assessment.decision === "ACCEPTED" ? "ADMISSIBLE"
    : assessment.decision === "REJECTED" ? "REJECTED_REFERENCE" : "INSUFFICIENT_EVIDENCE",
    failedDimensions: assessment.failedDimensions, uncertainDimensions, evidenceId: assessment.evidenceId });
}

export function requireAdmissibleReferenceGates(tasks: readonly NyxQualityReferenceTask[]): void {
  for (const task of tasks) {
    if (task.publicQualityObligations !== undefined && !validPublicQualityObligations(
      task.objective, task.mutationPaths, task.publicQualityObligations)) {
      throw new Error(`nyx_reference_public_obligations_invalid:${task.taskId}`);
    }
  }
  requireAdmissibleQualityReferences(tasks);
  for (const task of tasks) {
    const result = assessNyxAdmissionReference(task);
    if (result.decision !== "ADMISSIBLE") {
      throw new Error(`nyx_admission_reference_not_admissible:${result.taskId}:${result.decision}`
        + `:${[...result.failedDimensions, ...result.uncertainDimensions].join(",")}`);
    }
  }
}
