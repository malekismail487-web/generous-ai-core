import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { FRONTIER_WORKBENCH_EPOCH } from "./nyx-frontier-workbench";

const candidate = process.env.GITHUB_SHA?.trim() || execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const root = process.env.RUNNER_TEMP?.trim() || tmpdir();
const read = (variant: string) => JSON.parse(readFileSync(join(root,
  `nyx-frontier-reasoning-${variant.toLowerCase()}-${candidate.slice(0, 12)}.json`), "utf8"));
const baseline = read("BASELINE"); const workbench = read("WORKBENCH");
const stages = ["FRONTIER_GRAPH", "FRONTIER_PROTOCOL", "FRONTIER_CAUSAL_PLAN", "FRONTIER_CAUSAL_CONCLUSION"];
for (const [variant, report] of [["BASELINE", baseline], ["WORKBENCH", workbench]] as const) {
  if (report.candidateCommit !== candidate || report.experimentVariant !== variant
    || report.evaluatorVersion !== FRONTIER_WORKBENCH_EPOCH.version || report.stages.length !== 4
    || report.stages.some((stage: { stageId: string }, at: number) => stage.stageId !== stages[at])
    || report.authority.sourceRepositoryMutation || report.authority.productionAuthority
    || !report.aggregate.sourceRepositoryUnchanged || !report.resourceUsage.outputBudgetPreserved)
    throw new Error("frontier_comparison_binding_invalid");
}
if (baseline.model !== workbench.model) throw new Error("frontier_comparison_model_mismatch");
function summarize(report: typeof baseline) {
  const confidences = report.stages.flatMap((stage: typeof baseline.stages[number]) => stage.attempts)
    .filter((attempt: { confidence: number | null }) => attempt.confidence !== null);
  return { acceptedStages: report.aggregate.acceptedStages, allFourAccepted: report.aggregate.acceptedStages === 4,
    modelCalls: report.resourceUsage.modelCalls, totalTokens: report.resourceUsage.totalTokens,
    elapsedMs: report.resourceUsage.elapsedMs, providerFailures: report.aggregate.providerFailures,
    protocolFailures: report.protocolFailures.length,
    toolRequests: report.computationalEvidence.length,
    toolWorkUnits: report.computationalEvidence.reduce((sum: number, item: { workUnits: number }) => sum + item.workUnits, 0),
    toolElapsedMs: report.computationalEvidence.reduce((sum: number, item: { elapsedMs: number }) => sum + item.elapsedMs, 0),
    correctedStages: report.aggregate.correctedAfterFeedback,
    certificateBrierScore: confidences.length ? confidences.reduce((sum: number,
      attempt: { confidence: number; accepted: boolean }) => sum + (attempt.confidence - Number(attempt.accepted)) ** 2, 0) / confidences.length : null,
    calibrationScope: "DEPENDENT_CERTIFICATE_ATTEMPTS_NOT_CALIBRATION_CERTIFICATION",
    stageOutcomes: report.stages.map((stage: typeof baseline.stages[number]) => ({ stageId: stage.stageId,
      accepted: stage.accepted, calls: stage.modelCalls, corrected: stage.correctedAfterFeedback,
      lastFindings: stage.attempts.at(-1)?.findings ?? [] })) };
}
const a = summarize(baseline); const b = summarize(workbench);
const comparison = { schemaVersion: 1, chunkId: "NYX-CONSTRUCTIVE-REASONING-WORKBENCH-001", candidate,
  version: FRONTIER_WORKBENCH_EPOCH.version, baseline: a, workbench: b,
  decision: a.providerFailures || b.providerFailures ? "INCONCLUSIVE_PROVIDER_CONTAMINATED"
    : a.protocolFailures || b.protocolFailures ? "INCONCLUSIVE_PROTOCOL_CONTAMINATED"
    : b.acceptedStages > a.acceptedStages ? "OBSERVED_TOOL_ABLATION_ADVANTAGE_REPLICATION_REQUIRED"
    : "NO_OBSERVED_TOOL_ABLATION_ADVANTAGE",
  conditions: { sameModel: true, sameCandidate: true, samePublicProblems: true, sameAcceptanceOracles: true,
    sameModelBudget: true, matchedToolCompute: false,
    realizedModelCallsEqual: a.modelCalls === b.modelCalls, realizedTokensEqual: a.totalTokens === b.totalTokens },
  promotion: { defaultChanged: false, broadCapabilityCertified: false, confidence70PercentEstablished: false },
  limitations: ["Four bounded stages are not all frontier benchmarks.", "Tools add measured non-model algorithmic compute.",
    "Public problem transcriptions are assumptions checked by unchanged independent oracles.",
    "One frozen run cannot establish a calibrated probability or generalization."] };
writeFileSync(join(root, `nyx-frontier-workbench-comparison-${candidate.slice(0, 12)}.json`), `${JSON.stringify(comparison, null, 2)}\n`);
console.log(`NYX_FRONTIER_WORKBENCH_COMPARISON ${JSON.stringify(comparison)}`);
