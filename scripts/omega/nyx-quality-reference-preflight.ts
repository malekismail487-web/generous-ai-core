import { assessEngineeringQuality, type EngineeringQualityPolicy,
  type EngineeringQualityDimension } from "../../src/lib/codelab/assurance/engineeringQualityOracle";

export interface NyxQualityReferenceTask {
  readonly taskId: string;
  readonly baseTaskId?: string;
  readonly faultyFiles: Readonly<Record<string, string>>;
  readonly correctFiles: Readonly<Record<string, string>>;
  readonly mutationPaths: readonly string[];
  readonly qualityPolicy: EngineeringQualityPolicy;
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
    baselineFiles: task.faultyFiles,
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
