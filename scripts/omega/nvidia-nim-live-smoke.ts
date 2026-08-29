import { NvidiaNimProvider, nvidiaNimCredentialFromEnvironment } from "../../src/lib/codelab/model/nvidiaNimProvider";

if (process.env.OMEGA_ALLOW_NVIDIA_NETWORK !== "1") {
  console.error("NVIDIA_NIM_SMOKE result=BLOCKED reason=explicit_network_authorization_missing");
  process.exit(2);
}

const model = process.env.NVIDIA_NIM_MODEL?.trim() || "openai/gpt-oss-20b";
const provider = NvidiaNimProvider.create({
  providerId: "NVIDIA-NIM-LIVE-SMOKE",
  model,
  authorityMode: "EXPLICIT_LIVE_NVIDIA_NIM",
  credentialSource: nvidiaNimCredentialFromEnvironment(process.env),
  maxPromptBytes: 1024,
  maxOutputTokens: 32,
  timeoutMs: 30_000,
});

const result = await provider.complete({
  schemaVersion: 1,
  requestId: `NVIDIA-NIM-LIVE-${Date.now()}`,
  messages: [{ role: "user", content: "Respond with exactly OMEGA_NVIDIA_NIM_OK and nothing else." }],
  maxTokens: 24,
  temperature: 0,
  observedAtEpochMs: Date.now(),
});

const sentinelObserved = result.content?.trim() === "OMEGA_NVIDIA_NIM_OK";
console.log(`NVIDIA_NIM_SMOKE result=${result.decision} sentinel=${sentinelObserved ? "OBSERVED" : "NOT_OBSERVED"} model=${model} status=${result.evidence.statusCode ?? "NONE"} evidence=${result.evidence.evidenceId}`);
if (result.decision !== "COMPLETED" || !sentinelObserved) process.exit(1);
