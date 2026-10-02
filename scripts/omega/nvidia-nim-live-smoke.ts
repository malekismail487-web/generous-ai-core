import { NvidiaNimProvider, nvidiaNimCredentialFromEnvironment } from "../../src/lib/codelab/model/nvidiaNimProvider";

if (process.env.OMEGA_ALLOW_NVIDIA_NETWORK !== "1") {
  console.error("NVIDIA_NIM_SMOKE result=BLOCKED reason=explicit_network_authorization_missing");
  process.exit(2);
}

const SENTINEL = "OMEGA_NVIDIA_NIM_OK";
const model = process.env.NVIDIA_NIM_MODEL?.trim() || "nvidia/nemotron-3-ultra-550b-a55b";
// A three-call configuration diagnosis, not a capability benchmark. All arms
// use identical synthetic input/schema/total budget; no provider error bodies
// or private reasoning are retained. Only the documented control differs.
if (process.env.OMEGA_NVIDIA_REQUEST_COMPATIBILITY === "1") {
  const diagnostic = NvidiaNimProvider.create({ providerId: "NVIDIA-NIM-REQUEST-COMPATIBILITY", model,
    authorityMode: "EXPLICIT_LIVE_NVIDIA_NIM", credentialSource: nvidiaNimCredentialFromEnvironment(process.env),
    maxPromptBytes: 1024, maxOutputTokens: 1536, timeoutMs: 90_000 });
  const started = Date.now(); const deadline = started + 5 * 60_000;
  const records = [];
  for (const variant of ["MEDIUM_REASONING", "BUDGETED_REASONING", "DIRECT_JSON"] as const) {
    const observedAtEpochMs = Date.now();
    const result = await diagnostic.complete({ schemaVersion: 1,
      requestId: `COMPATIBILITY-${variant}-${started}`,
      messages: [{ role: "user", content: 'Return exactly {"ready":true} as a JSON object.' }],
      maxTokens: 1536, temperature: 0,
      responseFormat: { type: "JSON_SCHEMA", name: "nyx_compatibility", schema: { type: "object",
        additionalProperties: false, required: ["ready"], properties: { ready: { type: "boolean" } } } },
      inferencePolicy: variant === "DIRECT_JSON" ? "CONSTRAINED_JSON" : "REASONING_JSON",
      ...(variant === "DIRECT_JSON" ? {} : { reasoningEffort: "MEDIUM" as const }),
      ...(variant === "BUDGETED_REASONING" ? { reasoningBudgetTokens: 256 } : {}),
      observedAtEpochMs, deadlineEpochMs: deadline });
    let exactSyntheticAnswer = false;
    try { exactSyntheticAnswer = result.finishReason === "stop" && result.content !== null
      && JSON.stringify(JSON.parse(result.content)) === '{"ready":true}'; } catch { /* failure remains evidence */ }
    records.push({ variant, decision: result.decision, reason: result.reason, evidence: result.evidence,
      exactSyntheticAnswer, elapsedMs: Date.now() - observedAtEpochMs, grantsAuthority: false });
    if (["PROVIDER_UNAVAILABLE", "PROVIDER_TIMEOUT", "PROVIDER_AUTH_FAILURE", "PROVIDER_RATE_LIMIT"]
      .includes(result.evidence.failureCategory ?? "") || Date.now() >= deadline) break;
  }
  console.log(`NVIDIA_REQUEST_COMPATIBILITY_REPORT ${JSON.stringify({ schemaVersion: 1,
    candidateCommit: process.env.GITHUB_SHA ?? null, model, records, maximumModelCalls: 3,
    maxOutputTokensPerCall: 1536, authorityIncrease: false, rawContentPersisted: false,
    capabilityPromotion: false, scope: "CONFIGURATION_DIAGNOSIS_NOT_TASK_SUCCESS" })}`);
  process.exit(0);
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
