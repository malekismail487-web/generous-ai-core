import { z } from "zod";
import { immutableTheoryValue, theoryDigest } from "../../../src/lib/codelab/research/theoryContracts";
import { jsonValue, validateReceipt, type AttemptContext, type CampaignSpec, type Evaluation, type Usage } from "./contracts";
import { arcPredictionSchema, type PreparedTask } from "./tasks";

const text = z.string().min(1).max(2_000_000);
export function exportPrediction(task: PreparedTask, artifact: unknown, model: string): unknown {
  switch (task.manifest.family) {
    case "SWE_BENCH": return immutableTheoryValue({ instance_id: task.manifest.taskId,
      model_name_or_path: text.parse(model), model_patch: text.parse(artifact) });
    case "ARC_AGI": {
      const predictions = arcPredictionSchema.parse(jsonValue(artifact));
      if (predictions.length !== (task.input.test as unknown[]).length) throw Error("benchmark_arc_prediction_count");
      return immutableTheoryValue({ [task.manifest.taskId]: predictions });
    }
    case "HLE": return immutableTheoryValue({ [task.manifest.taskId]: {
      model: text.parse(model), response: text.parse(artifact) } });
    case "FRONTIER_MATH": return immutableTheoryValue({ taskId: task.manifest.taskId,
      response: text.parse(artifact), format: "NYX_EXPORT_REQUIRES_AUTHORIZED_EPOCH_ADAPTER" });
    case "TERMINAL_BENCH": throw Error("benchmark_terminal_requires_real_harbor_agent_not_text_commands");
  }
}

export interface ExternalReport { readonly receipt: unknown; readonly report: unknown; readonly usage?: Usage | null; }
/** Parses pinned upstream fields, not a candidate's claim of success. No artifact executes here. */
export function gradeExternalReport(task: PreparedTask, external: ExternalReport, context: AttemptContext,
  campaign: CampaignSpec): Evaluation {
  const report = jsonValue(external.report);
  const receipt = validateReceipt(external.receipt, report, context, campaign);
  let state: Evaluation["state"]; let confidence: number | null = null;
  let metric: string; let quality: Evaluation["quality"] = "NOT_APPLICABLE";
  switch (task.manifest.family) {
    case "SWE_BENCH": {
      // Per-instance report from swebench/harness/grading.py, not aggregate resolved count.
      const reports = z.record(z.object({ patch_is_None: z.boolean(), patch_exists: z.boolean(),
        patch_successfully_applied: z.boolean(), resolved: z.boolean(),
        infra_failure: z.boolean().optional() }).passthrough()).parse(report);
      if (Object.keys(reports).length !== 1 || !reports[task.manifest.taskId]) throw Error("benchmark_swe_report_identity");
      const r = reports[task.manifest.taskId];
      if (r.resolved && (r.patch_is_None || !r.patch_exists || !r.patch_successfully_applied || r.infra_failure))
        throw Error("benchmark_inconsistent_swe_report");
      state = r.infra_failure ? "INSUFFICIENT_EVIDENCE" : r.resolved ? "PASS" : "FAIL";
      metric = "SWE_OFFICIAL_RESOLVED_PER_INSTANCE";
      quality = "NOT_EVALUATED"; // Official functional resolution does not certify engineering quality.
      break;
    }
    case "TERMINAL_BENCH": {
      const r = z.object({ task_name: text, task_checksum: text, trial_name: text,
        verifier_result: z.object({ rewards: z.record(z.number().finite()).nullable() }).nullable(),
        exception_info: z.unknown().nullable(), step_results: z.array(z.unknown()).nullable().optional() }).passthrough().parse(report);
      const rawChecksum = task.manifest.privateOracleDigest;
      if (r.task_name !== task.manifest.taskId || theoryDigest({ task_checksum: r.task_checksum }) !== rawChecksum
        || r.trial_name !== context.evaluationRunId) throw Error("benchmark_harbor_identity");
      if (r.step_results?.length) throw Error("benchmark_multistep_harbor_requires_explicit_adapter");
      const reward = r.verifier_result?.rewards?.reward;
      if (reward !== undefined && reward !== 0 && reward !== 1) throw Error("benchmark_nonbinary_terminal_reward");
      state = r.exception_info !== null || reward === undefined ? "INSUFFICIENT_EVIDENCE" : reward === 1 ? "PASS" : "FAIL";
      metric = "TERMINAL_BENCH_BINARY_REWARD";
      break;
    }
    case "HLE": {
      const records = z.record(z.object({ model: text, response: text,
        judge_response: z.object({ correct: z.enum(["yes", "no"]), confidence: z.number().int().min(0).max(100) })
          .passthrough() }).passthrough()).parse(report);
      const r = records[task.manifest.taskId];
      if (Object.keys(records).length !== 1 || !r || theoryDigest(r.response) !== context.artifactDigest
        || r.model !== campaign.model) throw Error("benchmark_hle_response_binding");
      state = r.judge_response.correct === "yes" ? "PASS" : "FAIL";
      confidence = r.judge_response.confidence / 100;
      metric = "HLE_OFFICIAL_INDEPENDENT_JUDGE_CORRECTNESS";
      break;
    }
    case "FRONTIER_MATH": {
      // Epoch does not publish one universal report schema. This is a normalized operator receipt, not an invented official format.
      const r = z.object({ format: z.literal("AUTHORIZED_EPOCH_NORMALIZED_V1"), taskDigest: z.string(),
        responseDigest: z.string(), accepted: z.boolean(), verifierAvailable: z.boolean() }).strict().parse(report);
      if (r.taskDigest !== context.taskDigest || r.responseDigest !== context.artifactDigest) throw Error("benchmark_epoch_identity");
      state = !r.verifierAvailable ? "INSUFFICIENT_EVIDENCE" : r.accepted ? "PASS" : "FAIL";
      metric = "AUTHORIZED_EPOCH_RECEIPT_NOT_OFFICIAL_LEADERBOARD_CLAIM";
      break;
    }
    default: throw Error("benchmark_arc_uses_local_exact_oracle");
  }
  return immutableTheoryValue({ state, correct: state === "PASS" ? 1 : 0, total: 1, quality, metric,
    confidence, evidenceDigest: theoryDigest({ receipt, state, metric }) });
}
