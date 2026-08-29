import { NvidiaNimProvider, nvidiaNimCredentialFromEnvironment } from "../../src/lib/codelab/model/nvidiaNimProvider";

if (process.env.OMEGA_ALLOW_NVIDIA_NETWORK !== "1") {
  console.error("NVIDIA_NIM_SMOKE result=BLOCKED reason=explicit_network_authorization_missing");
  process.exit(2);
}

const SENTINEL = "OMEGA_NVIDIA_NIM_OK";
const model = process.env.NVIDIA_NIM_MODEL?.trim() || "nvidia/nemotron-3-ultra-550b-a55b";
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
