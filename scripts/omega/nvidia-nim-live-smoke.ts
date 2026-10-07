import { NvidiaNimProvider, nvidiaNimCredentialFromEnvironment } from "../../src/lib/codelab/model/nvidiaNimProvider";
import { textDiagnosticTransport, textRejectionHint } from "./benchmarks/nyxTextBenchmark";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

if (process.env.OMEGA_ALLOW_NVIDIA_NETWORK !== "1") {
  console.error("NVIDIA_NIM_SMOKE result=BLOCKED reason=explicit_network_authorization_missing");
  process.exit(2);
}

const SENTINEL = "OMEGA_NVIDIA_NIM_OK";
const model = process.env.NVIDIA_NIM_MODEL?.trim() || "nvidia/nemotron-3-ultra-550b-a55b";
// A three-call configuration diagnosis, not a capability benchmark. All arms
// use identical synthetic input/schema/total budget; no provider error bodies
// or private reasoning are retained. Only the documented control differs.
const compatibility = process.env.OMEGA_NVIDIA_REQUEST_COMPATIBILITY;
if (compatibility !== undefined && !["1", "HOSTED_NATIVE_ISOLATION"].includes(compatibility))
  throw Error("nvidia_request_compatibility_invalid");
if (compatibility !== undefined) {
  const nativeIsolation = compatibility === "HOSTED_NATIVE_ISOLATION";
  const maxTokens = nativeIsolation ? 8192 : 1536;
  const rejections: (ReturnType<typeof textRejectionHint> & {status: number})[] = [];
  const diagnostic = NvidiaNimProvider.create({ providerId: "NVIDIA-NIM-REQUEST-COMPATIBILITY", model,
    authorityMode: "EXPLICIT_LIVE_NVIDIA_NIM", credentialSource: nvidiaNimCredentialFromEnvironment(process.env),
    maxPromptBytes: 1024, maxOutputTokens: maxTokens, timeoutMs: nativeIsolation ? 120_000 : 90_000,
    transport: textDiagnosticTransport(hint => rejections.push(hint)) });
  const started = Date.now(); const deadline = started + (nativeIsolation ? 6 : 5) * 60_000;
  const records = [];
  const variants = nativeIsolation ? ["HOSTED_NATIVE_BUDGET", "HOSTED_NATIVE_EFFORT", "MEDIUM_REASONING"] as const
    : ["MEDIUM_REASONING", "BUDGETED_REASONING", "DIRECT_JSON"] as const;
  for (const variant of variants) {
    if (Date.now() >= deadline) break;
    const observedAtEpochMs = Date.now();
    const rejectionStart = rejections.length;
    // Isolation has exactly one physical attempt per arm. It cannot conceal a
    // rejected native request by falling back or replenishing the task budget.
    const client = nativeIsolation ? diagnostic.withHttpAttemptBudget(1) : diagnostic;
    const result = await client.complete({ schemaVersion: 1,
      requestId: `COMPATIBILITY-${variant}-${started}`,
      messages: [{ role: "user", content: 'Return exactly {"ready":true} as a JSON object.' }],
      maxTokens, temperature: 0,
      responseFormat: { type: "JSON_SCHEMA", name: "nyx_compatibility", schema: { type: "object",
        additionalProperties: false, required: ["ready"], properties: { ready: { type: "boolean" } } } },
      inferencePolicy: variant === "DIRECT_JSON" ? "CONSTRAINED_JSON" : "REASONING_JSON",
      ...(variant === "DIRECT_JSON" ? {} : { reasoningEffort: "MEDIUM" as const }),
      ...(variant.startsWith("HOSTED_NATIVE") ? {reasoningControl: "ULTRA_HOSTED_NATIVE" as const} : {}),
      ...(variant === "HOSTED_NATIVE_BUDGET" ? {reasoningBudgetTokens: 2048}
        : variant === "BUDGETED_REASONING" ? { reasoningBudgetTokens: 256 } : {}),
      observedAtEpochMs, deadlineEpochMs: nativeIsolation ? Math.min(deadline, observedAtEpochMs + 180_000) : deadline });
    let exactSyntheticAnswer = false;
    try { exactSyntheticAnswer = result.finishReason === "stop" && result.content !== null
      && JSON.stringify(JSON.parse(result.content)) === '{"ready":true}'; } catch { /* failure remains evidence */ }
    records.push({ variant, decision: result.decision, reason: result.reason, evidence: result.evidence,
      requestRejections: rejections.slice(rejectionStart), exactSyntheticAnswer,
      elapsedMs: Date.now() - observedAtEpochMs, grantsAuthority: false });
    if (["PROVIDER_UNAVAILABLE", "PROVIDER_TIMEOUT", "PROVIDER_AUTH_FAILURE", "PROVIDER_RATE_LIMIT"]
      .includes(result.evidence.failureCategory ?? "")
      // An exhausted owned attempt budget retains the last HTTP status even
      // when its terminal category is local RESOURCE_EXHAUSTION.
      || [401, 403, 429, 500, 502, 503, 504].includes(result.evidence.statusCode ?? 0)
      || nativeIsolation && result.decision !== "COMPLETED" && ![400, 422].includes(result.evidence.statusCode ?? 0)
      || Date.now() >= deadline) break;
  }
  const report = { schemaVersion: 1,
    candidateCommit: process.env.GITHUB_SHA ?? null, model, records, maximumModelCalls: 3,
    maxOutputTokensPerCall: maxTokens, authorityIncrease: false, rawContentPersisted: false,
    capabilityPromotion: false, compatibilityProfile: compatibility,
    physicalAttemptLimitPerArm: nativeIsolation ? 1 : null,
    scope: "CONFIGURATION_DIAGNOSIS_NOT_TASK_SUCCESS" };
  if (nativeIsolation && process.env.RUNNER_TEMP) await writeFile(join(process.env.RUNNER_TEMP,
    `nyx-request-compatibility-${process.env.GITHUB_SHA ?? started}.json`), JSON.stringify(report));
  console.log(`NVIDIA_REQUEST_COMPATIBILITY_REPORT ${JSON.stringify(report)}`);
  process.exit(nativeIsolation && (records.length !== variants.length
    || records.some(record => !record.exactSyntheticAnswer || record.evidence.statusCode !== 200)) ? 1 : 0);
}
const provider = NvidiaNimProvider.create({
  providerId: "NVIDIA-NIM-LIVE-SMOKE",
  model,
  authorityMode: "EXPLICIT_LIVE_NVIDIA_NIM",
  credentialSource: nvidiaNimCredentialFromEnvironment(process.env),
  maxPromptBytes: 1024,
  maxOutputTokens: 512,
  timeoutMs: 90_000,
});

const result = await provider.complete({
  schemaVersion: 1,
  requestId: `NVIDIA-NIM-LIVE-${Date.now()}`,
  messages: [{ role: "user", content: `After any internal reasoning, end your response with exactly ${SENTINEL} and output nothing after it.` }],
  maxTokens: 256,
  temperature: 0,
  observedAtEpochMs: Date.now(),
});

const normalizedContent = result.content?.trim() ?? "";
const sentinelObserved = normalizedContent.endsWith(SENTINEL);
console.log(`NVIDIA_NIM_SMOKE result=${result.decision} sentinel=${sentinelObserved ? "OBSERVED" : "NOT_OBSERVED"} model=${model} status=${result.evidence.statusCode ?? "NONE"} finish=${result.finishReason ?? "NONE"} tokens=${result.evidence.usage.totalTokens ?? "UNKNOWN"} evidence=${result.evidence.evidenceId}`);
if (result.decision !== "COMPLETED" || !sentinelObserved) process.exit(1);
