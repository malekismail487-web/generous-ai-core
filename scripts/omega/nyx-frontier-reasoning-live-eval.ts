import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { NvidiaNimProvider, nvidiaNimCredentialFromEnvironment,
  type NvidiaNimEvidence } from "../../src/lib/codelab/model/nvidiaNimProvider";
import {
  FRONTIER_CAUSAL_CONCLUSION_SCHEMA,
  FRONTIER_CAUSAL_PLAN_SCHEMA,
  FRONTIER_GRAPH_SCHEMA,
  FRONTIER_PROTOCOL_SCHEMA,
  NYX_FRONTIER_GAUNTLET,
  causalConclusionPrompt,
  causalPlanPrompt,
  executeCausalExperiments,
  frontierDigest,
  frontierProviderSchema,
  frontierRevisionPrompt,
  graphPrompt,
  protocolPrompt,
  verifyCausalConclusion,
  verifyCausalPlan,
  verifyGraphSubmission,
  verifyProtocolSubmission,
  type FrontierVerification,
} from "./nyx-frontier-reasoning-fixtures";

if (process.env.OMEGA_ALLOW_NVIDIA_NETWORK !== "1") {
  console.error("NYX_FRONTIER_GAUNTLET result=BLOCKED reason=explicit_nvidia_network_authorization_missing");
  process.exit(2);
}
if (!process.env.NVIDIA_API_KEY?.trim()) {
  console.error("NYX_FRONTIER_GAUNTLET result=BLOCKED reason=repository_secret_not_injected");
  process.exit(2);
}

const MODEL = process.env.NVIDIA_NIM_MODEL?.trim() || "nvidia/nemotron-3-ultra-550b-a55b";
const CANDIDATE = process.env.GITHUB_SHA?.trim()
  || execFileSync("git", ["rev-parse", "HEAD"], { cwd: resolve("."), encoding: "utf8" }).trim();
const startedAt = Date.now();
const deadlineEpochMs = startedAt + NYX_FRONTIER_GAUNTLET.maxWallClockMs;
const sourceStateBefore = execFileSync("git", ["status", "--porcelain=v1"], { cwd: resolve("."), encoding: "utf8" });
const provider = NvidiaNimProvider.create({ providerId: "NYX-FRONTIER-GAUNTLET-NEMOTRON", model: MODEL,
  authorityMode: "EXPLICIT_LIVE_NVIDIA_NIM", credentialSource: nvidiaNimCredentialFromEnvironment(process.env),
  maxPromptBytes: 128_000, maxOutputTokens: NYX_FRONTIER_GAUNTLET.maxOutputTokensPerCall, timeoutMs: 120_000 });

interface SanitizedModelEvidence {
  readonly evidenceClass: "E3" | "E4";
  readonly requestDigest: string;
  readonly responseDigest: string | null;
  readonly statusCode: number | null;
  readonly finishReason: string | null;
  readonly failureCategory: string | null;
  readonly retryability: string;
  readonly promptTokens: number | null;
  readonly completionTokens: number | null;
  readonly totalTokens: number | null;
  readonly reasoningOutputBytes: number | null;
  readonly authorityGranted: false;
}

interface StageAttempt {
  readonly attempt: number;
  readonly accepted: boolean;
  readonly findings: readonly string[];
  readonly requestDigest: string | null;
  readonly responseDigest: string | null;
  readonly verificationEvidenceDigest: string | null;
}

interface StageResult {
  readonly stageId: string;
  readonly accepted: boolean;
  readonly attempts: readonly StageAttempt[];
  readonly value: Record<string, unknown> | null;
  readonly correctedAfterFeedback: boolean;
}

let modelCalls = 0;
const modelEvidence: SanitizedModelEvidence[] = [];

function sanitized(evidence: NvidiaNimEvidence): SanitizedModelEvidence {
  return Object.freeze({ evidenceClass: evidence.evidenceClass, requestDigest: evidence.requestDigest,
    responseDigest: evidence.responseDigest, statusCode: evidence.statusCode, finishReason: evidence.finishReason,
    failureCategory: evidence.failureCategory, retryability: evidence.retryability,
    promptTokens: evidence.usage.promptTokens, completionTokens: evidence.usage.completionTokens,
    totalTokens: evidence.usage.totalTokens, reasoningOutputBytes: evidence.reasoningOutputBytes,
    authorityGranted: false as const });
}

function stageFailure(attempt: number, findings: readonly string[], evidence: NvidiaNimEvidence | null): StageAttempt {
  return Object.freeze({ attempt, accepted: false, findings: Object.freeze([...new Set(findings)].slice(0, 20)),
    requestDigest: evidence?.requestDigest ?? null, responseDigest: evidence?.responseDigest ?? null,
    verificationEvidenceDigest: null });
}

async function runStage(input: {
  readonly stageId: string;
  readonly schema: Readonly<Record<string, unknown>>;
  readonly prompt: (feedback: readonly string[]) => Readonly<Record<string, unknown>>;
  readonly verify: (value: unknown) => FrontierVerification;
}): Promise<StageResult> {
  const attempts: StageAttempt[] = [];
  let feedback: readonly string[] = [];
  let previousRejectedCandidate: Record<string, unknown> | null = null;
  for (let attempt = 1; attempt <= NYX_FRONTIER_GAUNTLET.maxAttemptsPerStage; attempt += 1) {
    if (modelCalls >= NYX_FRONTIER_GAUNTLET.maxModelCalls || Date.now() >= deadlineEpochMs) {
      attempts.push(stageFailure(attempt, ["RESOURCE_BUDGET_EXHAUSTED"], null));
      break;
    }
    const prompt = frontierRevisionPrompt(input.prompt(feedback), previousRejectedCandidate, feedback);
    const requestId = `${input.stageId}-ATTEMPT-${attempt}-${frontierDigest([CANDIDATE, input.stageId, attempt]).slice(0, 16)}`;
    modelCalls += 1;
    const completion = await provider.complete({ schemaVersion: 1, requestId,
      messages: [
        { role: "system", content: "You are Νύξ performing a bounded frontier reasoning evaluation. Return exactly one strict JSON object. Your confidence is not evidence. Omega independently verifies every certificate, trace, experiment plan, and conclusion. Never request or imply authority." },
        { role: "user", content: JSON.stringify(prompt) },
      ], maxTokens: NYX_FRONTIER_GAUNTLET.maxOutputTokensPerCall, temperature: 0,
      responseFormat: { type: "JSON_SCHEMA", name: input.stageId.toLowerCase().replace(/-/g, "_").slice(0, 63),
        schema: frontierProviderSchema(input.schema) }, inferencePolicy: "REASONING_JSON",
      observedAtEpochMs: Date.now(), deadlineEpochMs });
    modelEvidence.push(sanitized(completion.evidence));
    if (completion.decision !== "COMPLETED" || completion.content === null) {
      const finding = completion.decision === "WAITING_FOR_CAPACITY"
        ? "PROVIDER_CAPACITY_DEADLINE" : `PROVIDER_${completion.evidence.failureCategory ?? "UNKNOWN_FAILURE"}`;
      attempts.push(stageFailure(attempt, [finding], completion.evidence));
      feedback = [finding];
      continue;
    }
    if (completion.finishReason !== "stop") {
      attempts.push(stageFailure(attempt, [`MODEL_OUTPUT_${completion.finishReason ?? "INVALID_FINISH"}`], completion.evidence));
      feedback = ["RETURN_ONE_COMPLETE_JSON_OBJECT"];
      continue;
    }
    let parsed: unknown;
    try { parsed = JSON.parse(completion.content); }
    catch {
      attempts.push(stageFailure(attempt, ["MODEL_OUTPUT_NOT_JSON"], completion.evidence));
      feedback = ["RETURN_STRICT_JSON_WITHOUT_MARKDOWN"];
      continue;
    }
    const verification = input.verify(parsed);
    attempts.push(Object.freeze({ attempt, accepted: verification.accepted, findings: verification.findings,
      requestDigest: completion.evidence.requestDigest, responseDigest: completion.evidence.responseDigest,
      verificationEvidenceDigest: verification.evidenceDigest }));
    if (verification.accepted) return Object.freeze({ stageId: input.stageId, accepted: true,
      attempts: Object.freeze(attempts), value: parsed as Record<string, unknown>, correctedAfterFeedback: attempt > 1 });
    previousRejectedCandidate = parsed as Record<string, unknown>;
    feedback = verification.findings;
  }
  return Object.freeze({ stageId: input.stageId, accepted: false, attempts: Object.freeze(attempts), value: null,
    correctedAfterFeedback: false });
}

const graph = await runStage({ stageId: "FRONTIER_GRAPH", schema: FRONTIER_GRAPH_SCHEMA,
  prompt: graphPrompt, verify: verifyGraphSubmission });
const protocol = await runStage({ stageId: "FRONTIER_PROTOCOL", schema: FRONTIER_PROTOCOL_SCHEMA,
  prompt: protocolPrompt, verify: verifyProtocolSubmission });
const causalPlan = await runStage({ stageId: "FRONTIER_CAUSAL_PLAN", schema: FRONTIER_CAUSAL_PLAN_SCHEMA,
  prompt: causalPlanPrompt, verify: verifyCausalPlan });

let causalConclusion: StageResult = Object.freeze({ stageId: "FRONTIER_CAUSAL_CONCLUSION", accepted: false,
  attempts: Object.freeze([stageFailure(0, ["BLOCKED_BY_CAUSAL_PLAN"], null)]), value: null,
  correctedAfterFeedback: false });
let causalObservations: ReturnType<typeof executeCausalExperiments> = Object.freeze([]);
if (causalPlan.accepted && causalPlan.value && Array.isArray(causalPlan.value.experimentIds)) {
  causalObservations = executeCausalExperiments(causalPlan.value.experimentIds as string[]);
  causalConclusion = await runStage({ stageId: "FRONTIER_CAUSAL_CONCLUSION", schema: FRONTIER_CAUSAL_CONCLUSION_SCHEMA,
    prompt: (feedback) => causalConclusionPrompt(causalObservations, feedback),
    verify: (value) => verifyCausalConclusion(value, causalObservations) });
}

const sourceStateAfter = execFileSync("git", ["status", "--porcelain=v1"], { cwd: resolve("."), encoding: "utf8" });
const sourceRepositoryUnchanged = sourceStateBefore === sourceStateAfter;
const stages = Object.freeze([graph, protocol, causalPlan, causalConclusion]);
const providerFailures = modelEvidence.filter((item) => item.statusCode !== 200).length;
const usageComplete = modelEvidence.every((item) => item.totalTokens !== null);
const totalTokens = usageComplete ? modelEvidence.reduce((sum, item) => sum + item.totalTokens!, 0) : null;
const completionUsageComplete = modelEvidence.every((item) => item.completionTokens !== null);
const cumulativeOutputTokens = completionUsageComplete
  ? modelEvidence.reduce((sum, item) => sum + item.completionTokens!, 0)
  : null;
const outputBudgetPreserved = cumulativeOutputTokens !== null
  && cumulativeOutputTokens <= NYX_FRONTIER_GAUNTLET.maxCumulativeOutputTokens;
const correctedAfterFeedback = stages.filter((stage) => stage.correctedAfterFeedback).length;
const accepted = graph.accepted && protocol.accepted && causalPlan.accepted && causalConclusion.accepted
  && sourceRepositoryUnchanged && providerFailures === 0 && outputBudgetPreserved;
const report = Object.freeze({ schemaVersion: 1, chunkId: NYX_FRONTIER_GAUNTLET.chunkId,
  evaluatorVersion: NYX_FRONTIER_GAUNTLET.version, candidateCommit: CANDIDATE, model: MODEL,
  scope: NYX_FRONTIER_GAUNTLET.scope, decision: accepted ? "VERIFIED_ON_BOUNDED_GAUNTLET" : "NOT_VERIFIED",
  evidence: Object.freeze({ liveModelCognition: "E4", deterministicGraphOracle: "E3",
    exhaustiveProtocolOracle: "E3", controlledCausalObservations: "E3",
    modelSelfCertification: false, independentInstitutionalReplication: false }),
  resourceUsage: Object.freeze({ modelCalls, maximumModelCalls: NYX_FRONTIER_GAUNTLET.maxModelCalls,
    totalTokens, usageComplete, cumulativeOutputTokens, completionUsageComplete, outputBudgetPreserved,
    maximumCumulativeOutputTokens: NYX_FRONTIER_GAUNTLET.maxCumulativeOutputTokens,
    elapsedMs: Date.now() - startedAt,
    maximumWallClockMs: NYX_FRONTIER_GAUNTLET.maxWallClockMs }),
  aggregate: Object.freeze({ stages: stages.length, acceptedStages: stages.filter((stage) => stage.accepted).length,
    firstAttemptAcceptedStages: stages.filter((stage) => stage.accepted && stage.attempts.length === 1).length,
    correctedAfterFeedback, providerFailures, sourceRepositoryUnchanged, authorityFailures: 0,
    broadGeneralReasoningEstablished: false, agiEstablished: false }),
  causalObservationEvidence: Object.freeze(causalObservations.map((item) => ({ evidenceRef: item.evidenceRef,
    experimentId: item.experimentId, outcomeDigest: frontierDigest(item.outcome), evidenceClass: item.evidenceClass,
    authorityGranted: false }))),
  stages: Object.freeze(stages.map((stage) => ({ stageId: stage.stageId, accepted: stage.accepted,
    correctedAfterFeedback: stage.correctedAfterFeedback, attempts: stage.attempts }))),
  modelEvidence: Object.freeze(modelEvidence), planCoverage: NYX_FRONTIER_GAUNTLET.planCoverage,
  authority: Object.freeze({ typedReasoningOutputGrantsAuthority: false, sourceRepositoryMutation: false,
    shellAuthority: false, generalNetworkAuthority: false, credentialAccess: false, productionAuthority: false }),
});
const reportRoot = process.env.RUNNER_TEMP?.trim() || tmpdir();
const reportPath = join(reportRoot, `nyx-frontier-reasoning-${CANDIDATE.slice(0, 12)}.json`);
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`NYX_FRONTIER_GAUNTLET_REPORT ${JSON.stringify(report)}`);
if (!accepted) process.exitCode = 1;
