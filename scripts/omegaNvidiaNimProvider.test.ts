import {
  NVIDIA_NIM_CHAT_COMPLETIONS_URL,
  NVIDIA_NIM_PROVIDER_STATUS,
  NvidiaNimProvider,
  nvidiaNimCredentialFromEnvironment,
  type NvidiaNimCompletionRequest,
  type NvidiaNimTransport,
} from "../src/lib/codelab/model/nvidiaNimProvider";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(value: unknown, label: string): void {
  if (value) passed += 1;
  else { failed += 1; failures.push(label); console.error(`  x ${label}`); }
}
const assert = check;

const NOW = Date.now();
function request(overrides: Partial<NvidiaNimCompletionRequest> = {}): NvidiaNimCompletionRequest {
  return { schemaVersion: 1, requestId: "NVIDIA-NIM-TEST-1", messages: [
    { role: "system", content: "Return the requested sentinel only." },
    { role: "user", content: "Return OMEGA_NIM_OK." },
  ], maxTokens: 32, temperature: 0, observedAtEpochMs: NOW, ...overrides };
}

function provider(transport: NvidiaNimTransport, credential = "test-credential-not-a-real-secret") {
  return NvidiaNimProvider.create({ providerId: "NVIDIA-NIM-TEST", model: "openai/gpt-oss-20b", authorityMode: "TEST_DOUBLE_ONLY",
    credentialSource: { sourceIdentity: "test-double:credential", read: () => credential }, maxPromptBytes: 4096,
    maxOutputTokens: 128, timeoutMs: 1_000, transport });
}

{
  let observedUrl = "";
  let observedAuthorization = "";
  let observedBody: Record<string, unknown> = {};
  const client = provider(async (input, init) => {
    observedUrl = String(input);
    observedAuthorization = new Headers(init?.headers).get("Authorization") ?? "";
    observedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ choices: [{ message: { content: "OMEGA_NIM_OK" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 } }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  const result = await client.complete(request());
  check(result.decision === "COMPLETED" && result.content === "OMEGA_NIM_OK", "valid NVIDIA NIM response produces a bounded completion");
  check(observedUrl === NVIDIA_NIM_CHAT_COMPLETIONS_URL && observedBody.model === "openai/gpt-oss-20b" && observedBody.stream === false,
    "adapter uses fixed official endpoint and non-streaming model payload");
  check(observedAuthorization === "Bearer test-credential-not-a-real-secret", "credential is placed only in the authorization header");
  check(result.evidence.statusCode === 200 && result.evidence.usage.totalTokens === 14 && result.evidence.responseDigest !== null,
    "completion returns attributable status, usage, and response digest");
  check(result.evidence.evidenceClass === "E3" && !result.executorAuthorityGranted, "test-double evidence remains E3 and grants no executor authority");
  check(!JSON.stringify(result).includes("test-credential-not-a-real-secret"), "result and evidence never serialize the credential");
  check(!JSON.stringify(result.evidence).includes("Return OMEGA_NIM_OK"), "evidence persists prompt digest rather than prompt content");
}

{
  let calls = 0;
  const client = provider(async () => { calls += 1; return new Response("{}", { status: 200 }); }, "");
  const result = await client.complete(request());
  check(result.decision === "BLOCKED" && result.reason === "nvidia_api_credential_unavailable", "missing credential blocks before transport");
  check(calls === 0 && result.evidence.networkAttempted === false, "credential failure cannot attempt transport");
}

{
  let calls = 0;
  const client = provider(async () => { calls += 1; return new Response("{}", { status: 200 }); });
  const invalid = [
    request({ messages: [{ role: "assistant", content: "invalid first role" }] }),
    request({ messages: [{ role: "user", content: "one" }, { role: "user", content: "two" }] }),
    request({ maxTokens: 129 }),
    request({ temperature: 2 }),
  ];
  for (const input of invalid) check((await client.complete(input)).decision === "REJECTED", "invalid completion contract rejects deterministically");
  check(calls === 0, "invalid requests never reach provider transport");
}

{
  const client = provider(async () => new Response(JSON.stringify({ error: { message: "do-not-propagate-provider-detail" } }), { status: 401 }));
  const result = await client.complete(request());
  check(result.decision === "PROVIDER_ERROR" && result.reason === "nvidia_provider_http_401", "provider HTTP failure is classified without raw body propagation");
  check(!JSON.stringify(result).includes("do-not-propagate-provider-detail"), "provider error body is excluded from evidence");
}

{
  const client = provider(async () => new Response(JSON.stringify({ choices: [] }), { status: 200 }));
  const result = await client.complete(request());
  check(result.decision === "PROVIDER_ERROR" && result.reason === "nvidia_provider_response_missing_content", "malformed successful response fails closed");
}

{
  const source = nvidiaNimCredentialFromEnvironment({ NVIDIA_API_KEY: "environment-only-test-value" });
  check(source.sourceIdentity === "environment:NVIDIA_API_KEY" && source.read() === "environment-only-test-value", "environment credential source reads only the designated variable");
  let rejected = "";
  try { NvidiaNimProvider.create({ providerId: "NO-TRANSPORT", model: "openai/gpt-oss-20b", authorityMode: "TEST_DOUBLE_ONLY",
    credentialSource: source, maxPromptBytes: 10, maxOutputTokens: 10, timeoutMs: 1_000 }); }
  catch (error) { rejected = error instanceof Error ? error.message : "unknown"; }
  check(rejected === "test_double_transport_required", "test-double mode cannot silently fall through to real network fetch");
}

assert(NVIDIA_NIM_PROVIDER_STATUS.newCapability === "BOUNDED_NVIDIA_NIM_CHAT_COMPLETION", "chunk reports exact model capability gain");
assert(NVIDIA_NIM_PROVIDER_STATUS.liveNetworkAuthorityGranted === false && !NVIDIA_NIM_PROVIDER_STATUS.productionEligible,
  "provider adapter does not grant live or production authority by construction");

console.log(`Omega NVIDIA NIM provider tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) { console.error("FAILURES:"); for (const failure of failures) console.error(`  - ${failure}`); process.exit(1); }
