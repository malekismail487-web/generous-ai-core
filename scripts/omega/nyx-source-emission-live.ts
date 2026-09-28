import { createHash } from "node:crypto";
import { NYX_DEFAULT_SOURCE_QUALITY_CONSTRAINTS, NyxNemotronEngineeringCognition } from
  "../../src/lib/codelab/cognition/nyxNemotronEngineeringCognition";
import { NVIDIA_NIM_CHAT_COMPLETIONS_URL, NvidiaNimProvider,
  nvidiaNimCredentialFromEnvironment, type NvidiaNimTransport } from
  "../../src/lib/codelab/model/nvidiaNimProvider";
import type { EngineeringObservation } from "../../src/lib/codelab/observation/r3EngineeringObservation";
import { NYX_TRANSFER_FOLLOWUP_TASKS } from "./nyx-transfer-followup-fixtures";
import { inspectNyxSourceEmission, type NyxEmissionInspection } from "./nyx-source-emission-diagnostics";

const MODEL = process.env.NVIDIA_NIM_MODEL?.trim() || "nvidia/nemotron-3-ultra-550b-a55b";
const TRIALS = Number(process.env.NYX_EMISSION_TRIALS ?? "2");
if (!Number.isSafeInteger(TRIALS) || TRIALS < 1 || TRIALS > 3) throw new Error("emission_trial_count_invalid");
if (process.env.OMEGA_ALLOW_NVIDIA_NETWORK !== "1") throw new Error("emission_network_authority_missing");

function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }

interface CapturedResponse {
  readonly content: string | null;
  readonly finishReason: string | null;
}
const captures: CapturedResponse[] = [];
const transport: NvidiaNimTransport = async (input, init) => {
  if (String(input) !== NVIDIA_NIM_CHAT_COMPLETIONS_URL) throw new Error("emission_endpoint_out_of_scope");
  const response = await fetch(input, init);
  if (response.ok) {
    try {
      const body = await response.clone().json() as { choices?: readonly {
        message?: { content?: unknown }; finish_reason?: unknown }[] };
      const first = body.choices?.[0];
      captures.push({ content: typeof first?.message?.content === "string" ? first.message.content : null,
        finishReason: typeof first?.finish_reason === "string" ? first.finish_reason : null });
    } catch { captures.push({ content: null, finishReason: null }); }
  }
  return response;
};

const provider = NvidiaNimProvider.create({ providerId: "NYX-SOURCE-EMISSION-DEV-ONLY", model: MODEL,
  authorityMode: "EXPLICIT_LIVE_NVIDIA_NIM", credentialSource: nvidiaNimCredentialFromEnvironment(process.env),
  maxPromptBytes: 64_000, maxOutputTokens: 3_072, timeoutMs: 120_000, transport });

const observations: Record<string, unknown>[] = [];
for (const task of NYX_TRANSFER_FOLLOWUP_TASKS.slice(0, 2)) {
  const target = task.mutationPaths[0];
  const source = task.faultyFiles[target];
  if (!target || typeof source !== "string") throw new Error("emission_fixture_invalid");
  for (const representation of ["LINES", "TEXT"] as const) {
    for (let trial = 1; trial <= TRIALS; trial += 1) {
      const now = Date.now();
      const observation: EngineeringObservation = Object.freeze({ schemaVersion: 1,
        observationId: `NYX-EMISSION-${task.taskId}-${representation}-${trial}`,
        evidenceClass: "E3", state: "TEST_FAIL", baselineComparison: "NEW_FAILURE",
        candidateAttribution: "LIKELY_CANDIDATE_ATTRIBUTABLE", attributionConfidence: 0.9,
        epistemicState: "SUPPORTED", candidateCommit: "0".repeat(40),
        disposableRepositoryId: "EMISSION-DIAGNOSTIC-NO-ACTION", applicationId: "EMISSION-DIAGNOSTIC-NO-ACTION",
        proposalDigest: "1".repeat(64), toolId: "TEST", toolKind: "TEST",
        toolIdentityDigest: "2".repeat(64), environmentIdentity: `github-actions-${process.platform}-${process.arch}`,
        diagnostics: Object.freeze([Object.freeze({ category: "TEST", channel: "STDERR", file: target,
          line: 1, column: 1, code: null, testName: "visible fixture failure", message: task.initialDefect })]),
        candidateFailureSignature: "3".repeat(64), baselineFailureSignature: null,
        candidateEvidenceId: "NYX-EMISSION-INITIAL-FAILURE", baselineEvidenceId: null,
        unknowns: Object.freeze([]), contradictions: Object.freeze([]), observedAtEpochMs: now,
        grantsAuthority: false });
      const cognition = NyxNemotronEngineeringCognition.create({ cognitionId: "NYX-SOURCE-EMISSION-DEV-ONLY",
        provider, maxPromptBytes: 48_000, maxOutputTokens: 3_072, sourceRepresentation: representation,
        experimentVariant: "CURRENT", intentCompilationMode: "SAFE_CANONICALIZATION" });
      const captureStart = captures.length;
      const result = await cognition.proposeRepair({ schemaVersion: 1,
        cognitionRequestId: `NYX-EMISSION-${task.taskId}-${representation}-${trial}-${now}`,
        objective: task.objective, observation,
        files: [{ relativePath: target, content: source, contentSha256: sha256(source) }],
        allowedMutationPaths: [target], availableEvidence: [], priorHypotheses: [],
        priorCognitionFailures: [], candidateQualityFeedback: null,
        sourceQualityConstraints: NYX_DEFAULT_SOURCE_QUALITY_CONSTRAINTS,
        allowedVerificationToolIds: ["TEST"], maxChanges: task.maxChanges,
        maxPatchBytes: task.maxPatchBytes, maxDiagnosisCharacters: 1_500,
        maxCounterexamples: 3, observedAtEpochMs: now, deadlineEpochMs: now + 180_000 });
      const captured = captures.slice(captureStart).findLast((item) => item.content !== null) ?? null;
      const inspection: NyxEmissionInspection = await inspectNyxSourceEmission({
        content: captured?.content ?? null, finishReason: result.evidence.modelFinishReason,
        providerResponseDigest: result.evidence.modelResponseDigest,
        expectedTarget: target, representation });
      observations.push({ taskId: task.taskId, taskDigest: sha256(task.objective), representation, trial,
        modelDecision: result.decision, modelReason: result.reason,
        providerStatusCode: result.evidence.modelStatusCode,
        finishReason: result.evidence.modelFinishReason, tokens: result.evidence.modelUsage.totalTokens,
        inspection, sourceRepositoryMutation: false, candidateAdmissionAttempted: false });
    }
  }
}
const counts = Object.fromEntries(["LINES", "TEXT"].map((representation) => [representation,
  Object.fromEntries([...new Set(observations.filter((item) => item.representation === representation)
    .map((item) => (item.inspection as NyxEmissionInspection).outcome))].map((outcome) => [outcome,
    observations.filter((item) => item.representation === representation
      && (item.inspection as NyxEmissionInspection).outcome === outcome).length]))]));
console.log(`NYX_SOURCE_EMISSION_DEV ${JSON.stringify({ schemaVersion: 1,
  purpose: "DEVELOPMENT_ONLY_SOURCE_SYNTAX_DIAGNOSIS", model: MODEL,
  taskCount: 2, trialsPerTaskAndRepresentation: TRIALS,
  controls: { sameModel: true, sameTasks: true, sameMaxOutputTokens: true, sameAuthority: true,
    downstreamAcceptanceUnchanged: true, sourceRepositoryMutation: false,
    rawSourcePersisted: false, credentialPersisted: false }, counts, observations })}`);
