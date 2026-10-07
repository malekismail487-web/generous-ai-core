import {
  NVIDIA_NIM_CHAT_COMPLETIONS_URL,
  NVIDIA_NIM_PROVIDER_STATUS,
  NvidiaNimProvider,
  nvidiaNimCredentialFromEnvironment,
  type NvidiaNimCompletionRequest,
  type NvidiaNimTransport,
  type NvidiaNimCapacityProgress,
} from "../src/lib/codelab/model/nvidiaNimProvider";
import { NvidiaCapacityCoordinator, NVIDIA_CAPACITY_POLICY, nvidiaRetryAfterMs,
  type CapacityClock } from "../src/lib/codelab/model/nvidiaCapacity";
import { execFileSync } from "node:child_process";

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

function provider(transport: NvidiaNimTransport, credential = "test-credential-not-a-real-secret", timeoutMs = 1_000) {
  return NvidiaNimProvider.create({ providerId: "NVIDIA-NIM-TEST", model: "openai/gpt-oss-20b", authorityMode: "TEST_DOUBLE_ONLY",
    credentialSource: { sourceIdentity: "test-double:credential", read: () => credential }, maxPromptBytes: 4096,
    maxOutputTokens: 128, timeoutMs, transport });
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
  const result = await client.complete(request({ responseFormat: "JSON_OBJECT" }));
  check(result.decision === "COMPLETED" && result.content === "OMEGA_NIM_OK", "valid NVIDIA NIM response produces a bounded completion");
  check(observedUrl === NVIDIA_NIM_CHAT_COMPLETIONS_URL && observedBody.model === "openai/gpt-oss-20b" && observedBody.stream === false,
    "adapter uses fixed official endpoint and non-streaming model payload");
  check((observedBody.response_format as { type?: string })?.type === "json_object",
    "adapter transmits the explicitly requested bounded JSON response format");
  check(observedBody.chat_template_kwargs === undefined,
    "default requests preserve the provider chat-template behavior");
  check(observedAuthorization === "Bearer test-credential-not-a-real-secret", "credential is placed only in the authorization header");
  check(result.evidence.statusCode === 200 && result.evidence.usage.totalTokens === 14 && result.evidence.responseDigest !== null,
    "completion returns attributable status, usage, and response digest");
  check(result.finishReason === "stop" && result.evidence.finishReason === "stop",
    "completion evidence binds the sanitized provider finish reason");
  check(result.evidence.evidenceClass === "E3" && !result.executorAuthorityGranted, "test-double evidence remains E3 and grants no executor authority");
  check(!JSON.stringify(result).includes("test-credential-not-a-real-secret"), "result and evidence never serialize the credential");
  check(!JSON.stringify(result.evidence).includes("Return OMEGA_NIM_OK"), "evidence persists prompt digest rather than prompt content");
}

{
  let constrainedBody: Record<string, unknown> = {};
  let defaultDigest = "";
  const transport: NvidiaNimTransport = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    if (body.chat_template_kwargs !== undefined) constrainedBody = body;
    return new Response(JSON.stringify({ choices: [{ message: { content: "{}" }, finish_reason: "stop" }] }), { status: 200 });
  };
  const client = provider(transport);
  defaultDigest = (await client.complete(request({ responseFormat: "JSON_OBJECT" }))).evidence.requestDigest;
  const constrained = await client.complete(request({ responseFormat: "JSON_OBJECT", inferencePolicy: "CONSTRAINED_JSON" }));
  check(JSON.stringify(constrainedBody.chat_template_kwargs) === JSON.stringify({ enable_thinking: false, force_nonempty_content: true }),
    "constrained JSON policy sends only the fixed request-level chat-template controls");
  check(constrained.decision === "COMPLETED" && constrained.evidence.requestDigest !== defaultDigest,
    "request evidence digest binds the constrained-inference controls");
}

{
  let observedBody: Record<string, unknown> = {};
  const client = provider(async (_input, init) => {
    observedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ choices: [{ message: { content: "{}" }, finish_reason: "stop" }] }), { status: 200 });
  });
  const schema = { type: "object", properties: { decision: { type: "string" } }, required: ["decision"], additionalProperties: false };
  const result = await client.complete(request({ responseFormat: { type: "JSON_SCHEMA", name: "nyx_repair_intent", schema } }));
  const format = observedBody.response_format as { type?: string; json_schema?: { name?: string; strict?: boolean; schema?: unknown } };
  check(result.decision === "COMPLETED" && format.type === "json_schema" && format.json_schema?.name === "nyx_repair_intent"
    && format.json_schema.strict === true && JSON.stringify(format.json_schema.schema) === JSON.stringify(schema),
    "adapter transmits a bounded strict JSON-schema response contract");
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
    request({ responseFormat: "INVALID" as "JSON_OBJECT" }),
    request({ inferencePolicy: "INVALID" as "CONSTRAINED_JSON" }),
    request({ inferencePolicy: "CONSTRAINED_JSON" }),
  ];
  for (const input of invalid) check((await client.complete(input)).decision === "REJECTED", "invalid completion contract rejects deterministically");
  check(calls === 0, "invalid requests never reach provider transport");
}

{
  const invalidFinishReasons: unknown[] = [undefined, "provider-internal-secret-reason", { reason: "stop" }];
  for (const finishReason of invalidFinishReasons) {
    const result = await provider(async () => new Response(JSON.stringify({
      choices: [{ message: { content: "content-must-not-be-accepted" }, finish_reason: finishReason }],
    }), { status: 200 })).complete(request());
    check(result.decision === "PROVIDER_ERROR" && result.reason === "nvidia_provider_response_finish_reason_invalid"
      && result.content === null && result.evidence.finishReason === null,
    "missing, unknown, or malformed provider finish reasons fail closed");
    check(!JSON.stringify(result).includes("provider-internal-secret-reason") && !JSON.stringify(result).includes("content-must-not-be-accepted"),
      "invalid termination metadata cannot propagate provider content or raw finish-reason detail");
  }
}

{
  const result = await provider(async () => new Response(JSON.stringify({
    choices: [{ message: { content: "bounded partial result" }, finish_reason: "length" }],
  }), { status: 200 })).complete(request());
  check(result.decision === "COMPLETED" && result.finishReason === "length" && result.evidence.finishReason === "length",
    "allowlisted non-stop termination remains explicit in completion and evidence");
}

{
  const client = provider(async () => new Response(JSON.stringify({ error: { message: "do-not-propagate-provider-detail" } }),
    { status: 401, headers: { "x-request-id": "safe-request-401" } }));
  const result = await client.complete(request());
  check(result.decision === "PROVIDER_ERROR" && result.reason === "nvidia_provider_http_401", "provider HTTP failure is classified without raw body propagation");
  check(result.evidence.failureCategory === "PROVIDER_AUTH_FAILURE" && result.evidence.retryability === "NO"
    && result.evidence.providerRequestId === "safe-request-401", "authentication failure retains bounded status, retryability, and safe request identity");
  check(!JSON.stringify(result).includes("do-not-propagate-provider-detail"), "provider error body is excluded from evidence");
}

{
  const client = provider(async () => new Response(JSON.stringify({ choices: [] }), { status: 200 }));
  const result = await client.complete(request());
  check(result.decision === "PROVIDER_ERROR" && result.reason === "nvidia_provider_response_missing_content", "malformed successful response fails closed");
  check(result.evidence.failureCategory === "PROVIDER_RESPONSE_SCHEMA_ERROR" && result.evidence.retryability === "NO",
    "malformed provider response receives precise schema-failure attribution");
}

{
  const result = await provider(async () => new Response("null", { status: 200 })).complete(request());
  check(result.evidence.statusCode === 200
    && result.evidence.failureCategory === "PROVIDER_RESPONSE_SCHEMA_ERROR",
    "a delivered JSON null is a response-shape failure rather than an invented transport outage");
}
{
  const result = await provider(async () => new Response(JSON.stringify({ choices: [{
    message: { content: null, reasoning_content: "synthetic incomplete reasoning" }, finish_reason: "length" }],
    usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 } }), { status: 200 }))
    .complete(request());
  check(result.decision === "PROVIDER_ERROR" && result.finishReason === "length"
    && result.evidence.usage.totalTokens === 300 && result.evidence.usage.completionTokens === 200,
    "reported compute survives a length-limited response with no final answer content");
}

{
  const expectations = [
    { status: 400, category: "PROVIDER_REQUEST_REJECTED", retryability: "NO" },
    { status: 422, category: "PROVIDER_REQUEST_REJECTED", retryability: "NO" },
    { status: 429, category: "PROVIDER_RATE_LIMIT", retryability: "YES" },
    { status: 500, category: "PROVIDER_SERVER_ERROR", retryability: "YES" },
    { status: 503, category: "PROVIDER_UNAVAILABLE", retryability: "YES" },
  ] as const;
  for (const expected of expectations) {
    const result = await provider(async () => new Response("sensitive-body-must-not-survive", { status: expected.status })).complete(request());
    check(result.evidence.failureCategory === expected.category && result.evidence.retryability === expected.retryability,
      `HTTP ${expected.status} receives precise sanitized provider attribution`);
    check(!JSON.stringify(result).includes("sensitive-body-must-not-survive"), `HTTP ${expected.status} excludes raw provider body`);
  }
}

{
  const result = await provider(async () => { throw new Error("transport detail must remain private"); }).complete(request());
  check(result.evidence.failureCategory === "PROVIDER_TRANSPORT_ERROR" && result.evidence.retryability === "UNKNOWN",
    "transport failure is distinguished from model or schema failure");
  check(!JSON.stringify(result).includes("transport detail must remain private"), "transport exception detail is not persisted");
}

{
  const result = await provider(async (_input, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("timeout private", "AbortError")), { once: true });
  }), "test-credential-not-a-real-secret", 100).complete(request());
  check(result.evidence.failureCategory === "PROVIDER_TIMEOUT" && result.evidence.retryability === "YES",
    "provider timeout is causally distinct and retryable at the delivery layer");
}

{
  const result = await provider(async () => { throw new DOMException("local cancellation private", "AbortError"); }).complete(request());
  check(result.evidence.failureCategory === "PROVIDER_CANCELLED" && result.evidence.retryability === "NO",
    "local cancellation is distinguished from timeout");
}

// A response cleanup or body reader is not trusted to honor AbortSignal.
// Keep this watchdog outside the adapter so a broken bound fails this test.
async function settleBounded<T>(pending: Promise<T>): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([pending, new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 1_000); })]); }
  finally { if (timer) clearTimeout(timer); }
}
{
  let aborted = false; let cleanupAttempted = false;
  const result = await settleBounded(provider(async (_url, init) => {
    init?.signal?.addEventListener("abort", () => { aborted = true; }, { once: true });
    return { ok: false, status: 503, headers: new Headers(), body: { cancel: () => {
      cleanupAttempted = true; return new Promise<void>(() => {});
    } } } as unknown as Response;
  }, undefined, 100).complete(request()));
  check(result?.reason === "nvidia_provider_http_503" && result.evidence.statusCode === 503,
    "unfinished error-body cancellation cannot suppress an observed HTTP failure");
  check(aborted && cleanupAttempted && result?.content === null && !result?.executorAuthorityGranted,
    "error cleanup aborts the transport without exposing content or granting authority");
}
for (const stalledPhase of ["TRANSPORT", "BODY"] as const) {
  let aborted = false;
  const result = await settleBounded(provider(async (_url, init) => {
    init?.signal?.addEventListener("abort", () => { aborted = true; }, { once: true });
    if (stalledPhase === "TRANSPORT") return new Promise<Response>(() => {});
    return { ok: true, status: 200, headers: new Headers(), json: () => new Promise(() => {}) } as unknown as Response;
  }, undefined, 100).complete(request()));
  check(result?.reason === "nvidia_provider_timeout" && result.evidence.failureCategory === "PROVIDER_TIMEOUT",
    `${stalledPhase}: ignored transport abort still settles as timeout, not invalid JSON or cognition`);
  check(aborted && result?.evidence.responseDigest === null && !result?.executorAuthorityGranted,
    `${stalledPhase}: unfinished output cannot survive the timeout as evidence or authority`);
}
{
  const external = new AbortController();
  const pending = provider(async () => ({ ok: true, status: 200, headers: new Headers(),
    json: () => new Promise(() => {}) }) as unknown as Response).complete(request({ signal: external.signal }));
  await new Promise<void>(resolve => setImmediate(resolve)); external.abort();
  const result = await settleBounded(pending);
  check(result?.reason === "nvidia_provider_cancelled" && result.evidence.retryability === "NO",
    "caller cancellation during an unresponsive body read remains cancellation, not retryable timeout");
}
{
  let release: ((value: Response) => void) | undefined;
  const pending = provider(async () => new Promise<Response>(resolve => { release = resolve; }), undefined, 100).complete(request());
  const result = await settleBounded(pending);
  release?.(new Response(JSON.stringify({ choices: [{ message: { content: "late-content" }, finish_reason: "stop" }] })));
  await new Promise<void>(resolve => setImmediate(resolve));
  check(result?.reason === "nvidia_provider_timeout" && result.content === null && result.evidence.responseDigest === null,
    "late transport success cannot replace a settled timeout or certify late generated content");
}
{
  const external = new AbortController(); let dispatches = 0;
  const pending = provider(async () => { dispatches += 1; return new Response("must-not-dispatch"); })
    .complete(request({ signal: external.signal }));
  external.abort(); const result = await settleBounded(pending);
  check(dispatches === 0 && result?.evidence.networkAttempted === false && result.reason === "nvidia_provider_cancelled",
    "cancellation before the dispatch microtask prevents networking and preserves honest attempt attribution");
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

class ManualClock implements CapacityClock {
  time = NOW;
  jobs: { at: number; wake: () => void }[] = [];
  now = () => this.time;
  sleep = (ms: number, signal: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
    const remove = () => { this.jobs = this.jobs.filter((entry) => entry !== job); signal.removeEventListener("abort", abort); };
    const abort = () => { remove(); reject(new DOMException("cancelled", "AbortError")); };
    const job = { at: this.time + ms, wake: () => { remove(); resolve(); } };
    if (signal.aborted) { reject(new DOMException("cancelled", "AbortError")); return; }
    this.jobs.push(job);
    signal.addEventListener("abort", abort, { once: true });
  });
  tick(): void {
    if (!this.jobs.length) return;
    this.time = Math.min(...this.jobs.map((job) => job.at));
    for (const job of [...this.jobs].filter((item) => item.at <= this.time)) job.wake();
  }
}
async function drive<T>(promise: Promise<T>, clock: ManualClock): Promise<T> {
  let settled = false;
  void promise.then(() => { settled = true; }, () => { settled = true; });
  for (let step = 0; step < 2000 && !settled; step += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
    if (!settled) clock.tick();
  }
  if (!settled) throw new Error("capacity_test_failed_to_settle");
  return promise;
}
async function driveWithWallClock<T>(promise: Promise<T>, clock: ManualClock, timeoutMs = 5_000): Promise<T> {
  let settled = false;
  void promise.then(() => { settled = true; }, () => { settled = true; });
  const deadline = Date.now() + timeoutMs;
  while (!settled && Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
    if (!settled) clock.tick();
  }
  if (!settled) throw new Error("capacity_wall_clock_test_failed_to_settle");
  return promise;
}
function capacityProvider(coordinator: NvidiaCapacityCoordinator, transport: NvidiaNimTransport,
  read: () => string | undefined = () => "test-credential-not-a-real-secret",
  onCapacityProgress?: (progress: NvidiaNimCapacityProgress) => void,
  timeoutMs = 1000) {
  return NvidiaNimProvider.create({ providerId: "CAPACITY-TEST", model: "nvidia/test-model", authorityMode: "TEST_DOUBLE_ONLY",
    credentialSource: { sourceIdentity: "test-double:capacity", read }, maxPromptBytes: 4096, maxOutputTokens: 128,
    timeoutMs, transport, testCapacity: coordinator, onCapacityProgress });
}
const success = () => new Response(JSON.stringify({ choices: [{ message: { content: "OMEGA_NIM_OK" }, finish_reason: "stop" }],
  usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 } }), { status: 200 });

{
  const clock = new ManualClock(); const events: NvidiaNimCapacityProgress[] = [];
  const starts: number[] = []; const bodies: string[] = [];
  let earlyRetry = false;
  const client = capacityProvider(new NvidiaCapacityCoordinator(clock), async (_url, init) => {
    starts.push(clock.time); bodies.push(String(init?.body));
    return starts.length === 1 ? new Response("private-rate-limit-response", { status: 429 }) : success();
  }, undefined, (event) => {
    events.push(event);
    if (event.state === "WAITING_FOR_CAPACITY" && starts.length !== 1) earlyRetry = true;
  });
  const result = await drive(client.complete(request()), clock);
  const waits = events.filter((event) => event.state === "WAITING_FOR_CAPACITY");
  check(waits.length === 60 && waits[0].secondsUntilRetry === 60 && waits.at(-1)?.secondsUntilRetry === 1,
    "missing Retry-After exposes an honest sixty-to-one countdown while the same request stays pending");
  check(!earlyRetry && starts.length === 2 && starts[1] - starts[0] === 60000,
    "sixty-second wait performs no pretend inference and resumes immediately at the eligible time");
  check(events.at(-2)?.state === "RESUMING" && events.at(-1)?.state === "COMPLETED"
    && result.decision === "COMPLETED" && result.evidence.delivery?.capacityWaitMs === 60000,
    "countdown automatically transitions to real retry and observed response without human restart");
  check(waits.every((event) => event.automaticResume) && events.every((event) => !event.taskCompletionClaimed && !event.authorityRenewed)
    && events.at(-1)?.automaticResume === false,
    "status never fabricates task progress, task acceptance, or authority renewal");
  check(new Set(bodies).size === 1 && events.every((event) => event.requestDigest === result.evidence.requestDigest)
    && !bodies[0].includes("onCapacityProgress"),
    "wait and resume bind one exact request without injecting host status into model input");
  check(!JSON.stringify(events).includes("test-credential") && !JSON.stringify(events).includes("private-rate-limit-response")
    && !JSON.stringify(events).includes("Return OMEGA_NIM_OK"),
    "in-flight status contains neither credentials nor raw requests, responses, or reasoning");
  check(clock.jobs.length === 0, "completed countdown leaves no background timer");
}
{
  const clock = new ManualClock(); const events: NvidiaNimCapacityProgress[] = []; const starts: number[] = [];
  const client = capacityProvider(new NvidiaCapacityCoordinator(clock), async () => {
    starts.push(clock.time);
    return starts.length < 3 ? new Response(null, { status: 429, headers: { "retry-after": starts.length === 1 ? "75" : "60" } }) : success();
  }, undefined, (event) => { events.push(event); });
  const result = await drive(client.complete(request()), clock);
  check(result.decision === "COMPLETED" && starts[1] - starts[0] === 75000 && starts[2] - starts[1] === 60000,
    "actual server retry time outranks the one-minute estimate and renewed limits wait again");
  check(events.filter((event) => event.state === "RESUMING").length === 2 && result.evidence.delivery?.httpAttempts === 3,
    "each rate-limit recovery is observable without consuming an additional logical cognition cycle");
}
{
  const clock = new ManualClock(); const controller = new AbortController(); const events: NvidiaNimCapacityProgress[] = [];
  let calls = 0;
  const client = capacityProvider(new NvidiaCapacityCoordinator(clock), async () => { calls += 1; return new Response(null, { status: 429 }); },
    undefined, (event) => { events.push(event); if (event.secondsUntilRetry === 59) controller.abort(); });
  const result = await drive(client.complete(request({ signal: controller.signal })), clock);
  check(result.reason === "nvidia_provider_cancelled" && calls === 1 && clock.jobs.length === 0,
    "cancelling from a visible countdown stops without an extra request or leftover timer");
  check(events.at(-1)?.state === "STOPPED" && !events.at(-1)?.automaticResume
    && !events.some((event) => event.state === "RESUMING"),
    "cancelled countdown explicitly stops instead of claiming automatic reactivation");
}
{
  const clock = new ManualClock(); const events: NvidiaNimCapacityProgress[] = []; let calls = 0;
  const client = capacityProvider(new NvidiaCapacityCoordinator(clock), async () => { calls += 1; return new Response(null, { status: 429 }); },
    undefined, (event) => { events.push(event); });
  const result = await drive(client.complete(request({ deadlineEpochMs: NOW + 30000 })), clock);
  check(result.decision === "WAITING_FOR_CAPACITY" && calls === 1 && events.at(-1)?.state === "STOPPED"
    && events.at(-1)?.retryAtEpochMs === NOW + 60000 && !events.at(-1)?.automaticResume,
    "cooldown beyond run expiry cannot misleadingly promise an authorized automatic retry");
}
{
  for (const asynchronous of [false, true]) {
    const clock = new ManualClock(); let calls = 0;
    const client = capacityProvider(new NvidiaCapacityCoordinator(clock), async () => {
      calls += 1; return calls === 1 ? new Response(null, { status: 429, headers: { "retry-after": "2" } }) : success();
    }, undefined, () => {
      if (asynchronous) return Promise.reject(new Error("private-display-exception"));
      throw new Error("private-display-exception");
    });
    const result = await drive(client.complete(request()), clock);
    check(result.decision === "COMPLETED" && calls === 2 && !JSON.stringify(result).includes("private-display-exception"),
      "throwing or rejecting status consumer cannot fail delivery or expose its exception");
  }
}
{
  const clock = new ManualClock(); const controller = new AbortController(); let calls = 0;
  const client = capacityProvider(new NvidiaCapacityCoordinator(clock), async () => {
    calls += 1; return calls === 1 ? new Response(null, { status: 429, headers: { "retry-after": "2" } }) : success();
  }, undefined, (event) => { if (event.state === "RESUMING") controller.abort(); });
  const result = await drive(client.complete(request({ signal: controller.signal })), clock);
  check(result.reason === "nvidia_provider_cancelled" && calls === 1,
    "cancellation at countdown completion is rechecked before credential read or dispatch");
}

{
  const clock = new ManualClock(); const gate = new NvidiaCapacityCoordinator(clock);
  const starts: number[] = []; const bodies: string[] = [];
  const client = capacityProvider(gate, async (_url, init) => {
    starts.push(clock.time); bodies.push(String(init?.body));
    return starts.length === 1 ? new Response(null, { status: 503, headers: { "retry-after": "75" } }) : success();
  });
  const result = await drive(client.complete(request()), clock);
  check(result.decision === "COMPLETED" && starts[1] - starts[0] === 75000,
    "503 recovery honors server Retry-After rather than assuming exactly one minute");
  check(result.evidence.delivery?.capacityWaitMs === 75000 && new Set(bodies).size === 1,
    "transient retry preserves the frozen payload and reports actual server-directed wait");
}
{
  const clock = new ManualClock(); const gate = new NvidiaCapacityCoordinator(clock);
  const starts: number[] = [];
  const client = capacityProvider(gate, async () => {
    starts.push(clock.time);
    return starts.length <= 2 ? new Response(null, { status: 503, headers: { "retry-after": "75" } }) : success();
  });
  const stopped = await drive(client.complete(request()), clock);
  check(stopped.decision === "PROVIDER_ERROR" && starts.length === 2,
    "server timing cannot expand the finite transient retry allowance");
  const following = await drive(client.complete(request({ requestId: "AFTER-EXHAUSTED-503" })), clock);
  check(following.decision === "COMPLETED" && starts[2] - starts[1] === 75000,
    "an exhausted request still protects queued clients with the server cooldown");
}
{
  const clock = new ManualClock(); let calls = 0;
  const client = capacityProvider(new NvidiaCapacityCoordinator(clock), async () => {
    calls += 1; return new Response(null, { status: 504, headers: { "retry-after": "120" } });
  });
  const result = await drive(client.complete(request({ deadlineEpochMs: NOW + 90000 })), clock);
  check(calls === 1 && result.decision === "WAITING_FOR_CAPACITY" && result.content === null,
    "server recovery beyond caller expiry stops without renewing authority or inventing output");
  check(result.evidence.delivery?.notBeforeEpochMs === NOW + 120000 && !result.evidence.delivery.authorityRenewed,
    "blocked transient recovery records the real earliest server resumption time");
}

check(NVIDIA_CAPACITY_POLICY.requestsPerMinute === 40, "configured request ceiling is forty, not four");
for (const [header, expected] of [["12", 12000], ["0", 0], [" 3 ", 3000], [null, 60000], ["-1", 60000],
  ["1.5", 60000], ["1e3", 60000], ["10ms", 60000], ["2026", 2026000], ["nonsense", 60000]] as const) {
  check(nvidiaRetryAfterMs(header, NOW) === expected, `Retry-After handles ${header ?? "missing"} without an early retry`);
}
check(nvidiaRetryAfterMs(new Date(Math.floor(NOW / 1000) * 1000 + 9000).toUTCString(), NOW) >= 8000,
  "HTTP-date cooldown accounts for the actual observation time");
check(nvidiaRetryAfterMs("9999999999999999999999999", NOW) === Number.MAX_SAFE_INTEGER,
  "oversized valid delay cannot overflow into an immediate retry");

{
  const clock = new ManualClock();
  const gate = new NvidiaCapacityCoordinator(clock);
  const starts: number[] = [];
  const bodies: string[] = [];
  const headers: string[] = [];
  const client = capacityProvider(gate, async (_url, init) => {
    starts.push(clock.time); bodies.push(String(init?.body)); headers.push(new Headers(init?.headers).get("Authorization") ?? "");
    return starts.length < 3 ? new Response("secret-provider-detail", { status: 429,
      headers: { "retry-after": starts.length === 1 ? "2" : "3" } }) : success();
  });
  const result = await drive(client.complete(request()), clock);
  check(result.decision === "COMPLETED" && result.content === "OMEGA_NIM_OK", "429 waits and resumes the same NYX request successfully");
  check(starts[1] - starts[0] >= 2000 && starts[2] - starts[1] >= 3000, "both server cooldowns precede subsequent HTTP attempts");
  check(new Set(bodies).size === 1 && new Set(headers).size === 1, "capacity retries preserve the exact logical model payload and credential scope");
  check(result.evidence.delivery?.httpAttempts === 3 && result.evidence.delivery.rateLimitedResponses === 2
    && result.evidence.delivery.capacityWaitMs === 5000 && result.evidence.delivery.state === "DELIVERED",
  "successful resumption reports real HTTP attempts, two rate limits and measured wait separately from model calls");
  check(result.evidence.usage.totalTokens === 14 && result.evidence.failureCategory === null,
    "rate limits do not invent model tokens or remain a coding failure after resumption");
  check(!JSON.stringify(result).includes("secret-provider-detail") && !JSON.stringify(result).includes("test-credential-not-a-real-secret"),
    "retry telemetry excludes credential and raw error response");
}
{
  const clock = new ManualClock();
  const gate = new NvidiaCapacityCoordinator(clock);
  const starts: number[] = [];
  const transport: NvidiaNimTransport = async () => { starts.push(clock.time); return success(); };
  const clients = [capacityProvider(gate, transport), capacityProvider(gate, transport)];
  const results = await drive(Promise.all(Array.from({ length: 81 }, (_, index) =>
    clients[index % 2].complete(request({ requestId: `CONCURRENT-${index}` })))), clock);
  check(results.every((result) => result.decision === "COMPLETED") && starts.length === 81,
    "81 concurrent requests across two provider instances share one capacity policy");
  check(starts.every((start, index) => index === 0 || start - starts[index - 1] >= 1501),
    "concurrent requests cannot reserve the same start slot");
  check(starts.every((start) => starts.filter((other) => other >= start && other < start + 60000).length <= 40),
    "every observed sliding sixty-second window contains at most forty HTTP starts");
  check(clock.jobs.length === 0, "concurrent completion leaves no pending wait timers");
}
{
  const clock = new ManualClock();
  const gate = new NvidiaCapacityCoordinator(clock);
  let calls = 0;
  const client = capacityProvider(gate, async () => { calls += 1; return new Response(null, { status: 429 }); });
  const result = await drive(client.complete(request({ deadlineEpochMs: NOW + 120000 })), clock);
  check(result.decision === "WAITING_FOR_CAPACITY" && result.evidence.delivery?.state === "WAITING_FOR_CAPACITY",
    "persistent 429 pauses for renewed run authority instead of asserting model failure");
  check(calls === 2 && result.content === null && !result.executorAuthorityGranted && !result.evidence.delivery?.authorityRenewed,
    "no retry starts at expiry and no stale result or authority is manufactured");
  check(result.evidence.delivery?.notBeforeEpochMs === NOW + 120000, "pause retains sanitized earliest resumption time");
}
{
  const clock = new ManualClock();
  const gate = new NvidiaCapacityCoordinator(clock);
  gate.defer("60");
  let calls = 0; let credentialReads = 0;
  const client = capacityProvider(gate, async () => { calls += 1; return success(); }, () => { credentialReads += 1; return "test-credential-not-a-real-secret"; });
  const controller = new AbortController();
  const pending = client.complete(request({ signal: controller.signal }));
  controller.abort();
  const result = await drive(pending, clock);
  check(result.decision === "BLOCKED" && result.reason === "nvidia_provider_cancelled", "queued capacity wait is cancellable immediately");
  check(calls === 0 && credentialReads === 0 && clock.jobs.length === 0, "cancelled queue entry reads no credential, performs no request and removes its timer");
  const expired = await drive(client.complete(request({ deadlineEpochMs: NOW })), clock);
  check(expired.decision === "WAITING_FOR_CAPACITY" && calls === 0, "already expired run cannot dispatch");
  const malformed = await client.complete(request({ deadlineEpochMs: NaN }));
  check(malformed.decision === "REJECTED" && calls === 0, "malformed expiry fails closed rather than disabling the deadline");
}
{
  for (const status of [400, 401, 403, 422]) {
    const clock = new ManualClock(); let calls = 0;
    const client = capacityProvider(new NvidiaCapacityCoordinator(clock), async () => { calls += 1; return new Response(null, { status }); });
    const result = await drive(client.complete(request()), clock);
    check(calls === 1 && result.decision === "PROVIDER_ERROR", `HTTP ${status} is not an unbounded rate-limit retry`);
  }
}
{
  const clock = new ManualClock(); const bodies: string[] = []; let calls = 0;
  const client = capacityProvider(new NvidiaCapacityCoordinator(clock), async (_url, init) => {
    calls += 1; bodies.push(String(init?.body));
    return calls === 1 ? new Response(null, { status: 500, headers: { "retry-after": "75" } }) : success();
  });
  const result = await drive(client.complete(request()), clock);
  check(result.decision === "COMPLETED" && calls === 2 && new Set(bodies).size === 1,
    "HTTP 500 can recover through one frozen-payload retry, not regenerated or expanded cognition");
  check(result.evidence.delivery?.transientUnavailableResponses === 1
    && result.evidence.delivery.capacityWaitMs === 75000 && !result.executorAuthorityGranted,
    "server-directed HTTP 500 recovery preserves finite delivery and authority boundaries");
}
{
  const clock = new ManualClock(); let calls = 0;
  const client = capacityProvider(new NvidiaCapacityCoordinator(clock), async () => {
    calls += 1; return new Response(null, { status: 500 });
  });
  const result = await drive(client.complete(request()), clock);
  check(result.decision === "PROVIDER_ERROR" && calls === 2
    && result.evidence.delivery?.transientUnavailableResponses === 2,
    "persistent HTTP 500 remains an observable failure after one bounded retry");
}
{
  const clock = new ManualClock(); let calls = 0;
  const client = capacityProvider(new NvidiaCapacityCoordinator(clock), async () => {
    calls += 1; return new Response(null, { status: 500 });
  });
  const result = await drive(client.complete(request({ deadlineEpochMs: NOW + 30000 })), clock);
  check(result.decision === "WAITING_FOR_CAPACITY" && calls === 1
    && result.evidence.delivery?.notBeforeEpochMs === NOW + 60000,
    "HTTP 500 recovery cannot renew a caller's deadline to force success");
}
{
  const clock = new ManualClock(); const events: NvidiaNimCapacityProgress[] = []; let calls = 0;
  const client = capacityProvider(new NvidiaCapacityCoordinator(clock), async () => {
    calls += 1; return calls === 1 ? new Response(null, { status: 503 }) : success();
  }, undefined, (event) => { events.push(event); });
  const result = await drive(client.complete(request()), clock);
  check(result.decision === "COMPLETED" && calls === 2
    && result.evidence.delivery?.transientUnavailableResponses === 1
    && result.evidence.delivery.capacityWaitMs === 60000,
  "one transient provider-unavailable response waits sixty seconds and resumes the same logical request");
  check(events.some((event) => event.state === "WAITING_FOR_CAPACITY")
    && events.some((event) => event.state === "RESUMING") && events.at(-1)?.state === "COMPLETED",
  "transient provider recovery remains visible and distinguishes waiting from execution");
}
{
  const clock = new ManualClock(); let calls = 0;
  const client = capacityProvider(new NvidiaCapacityCoordinator(clock), async () => {
    calls += 1; return new Response(null, { status: 503 });
  });
  const result = await drive(client.complete(request()), clock);
  check(result.decision === "PROVIDER_ERROR" && calls === 2
    && result.evidence.delivery?.transientUnavailableResponses === 2,
  "persistent provider unavailability stops after one bounded retry rather than looping until success");
}
{
  const clock = new ManualClock(); const gate = new NvidiaCapacityCoordinator(clock);
  const events: NvidiaNimCapacityProgress[] = []; const bodies: string[] = []; let calls = 0;
  const client = capacityProvider(gate, async (_url, init) => {
    calls += 1; bodies.push(String(init?.body));
    if (calls > 1) return success();
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("private timeout", "AbortError")), { once: true });
    });
  }, undefined, (event) => { events.push(event); }, 100);
  const result = await driveWithWallClock(client.complete(request()), clock);
  check(result.decision === "COMPLETED" && calls === 2 && result.content === "OMEGA_NIM_OK",
    "one provider timeout waits and retries the same logical completion successfully");
  check(result.evidence.delivery?.timedOutAttempts === 1 && result.evidence.delivery.httpAttempts === 2
    && result.evidence.delivery.capacityWaitMs === 60000,
  "timeout recovery reports timed-out and HTTP attempts separately from one logical model call");
  check(new Set(bodies).size === 1 && events.some((event) => event.state === "WAITING_FOR_CAPACITY")
    && events.some((event) => event.state === "RESUMING") && events.at(-1)?.state === "COMPLETED",
  "timeout recovery preserves the frozen request and exposes wait, resume, and completion states");
}
{
  const clock = new ManualClock(); const gate = new NvidiaCapacityCoordinator(clock); let calls = 0;
  const client = capacityProvider(gate, async (_url, init) => {
    calls += 1;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("private timeout", "AbortError")), { once: true });
    });
  }, undefined, undefined, 100);
  const result = await driveWithWallClock(client.complete(request()), clock);
  check(result.decision === "PROVIDER_ERROR" && result.reason === "nvidia_provider_timeout" && calls === 2
    && result.evidence.delivery?.timedOutAttempts === 2,
  "persistent provider timeout stops after one bounded retry rather than looping until success");
}
{
  const clock = new ManualClock(); const gate = new NvidiaCapacityCoordinator(clock);
  const controller = new AbortController(); const events: NvidiaNimCapacityProgress[] = []; let calls = 0;
  const client = capacityProvider(gate, async (_url, init) => {
    calls += 1;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("private timeout", "AbortError")), { once: true });
    });
  }, undefined, (event) => {
    events.push(event);
    if (event.state === "WAITING_FOR_CAPACITY" && event.secondsUntilRetry === 59) controller.abort();
  }, 100);
  const result = await driveWithWallClock(client.complete(request({ signal: controller.signal })), clock);
  check(result.decision === "BLOCKED" && result.reason === "nvidia_provider_cancelled" && calls === 1,
    "cancellation during timeout cooldown prevents the recovery request");
  check(result.evidence.delivery?.timedOutAttempts === 1 && events.at(-1)?.state === "STOPPED"
    && !events.some((event) => event.state === "RESUMING"),
  "cancelled timeout recovery remains attributable and cannot claim resumption");
}
{
  const clock = new ManualClock(); const gate = new NvidiaCapacityCoordinator(clock); let calls = 0;
  const client = capacityProvider(gate, async (_url, init) => {
    calls += 1;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("private timeout", "AbortError")), { once: true });
    });
  }, undefined, undefined, 100);
  const result = await driveWithWallClock(client.complete(request({ deadlineEpochMs: NOW + 30_000 })), clock);
  check(result.decision === "WAITING_FOR_CAPACITY" && calls === 1
    && result.evidence.delivery?.timedOutAttempts === 1 && result.evidence.delivery.notBeforeEpochMs === NOW + 60_000,
  "timeout retry cannot renew or exceed the caller-owned run deadline");
}
{
  const clock = new ManualClock(); const gate = new NvidiaCapacityCoordinator(clock);
  gate.defer("2");
  const messages = [{ role: "user" as const, content: "original prompt" }];
  let observed = "";
  const client = capacityProvider(gate, async (_url, init) => { observed = String(init?.body); return success(); });
  const pending = client.complete(request({ messages }));
  messages[0].content = "mutated while waiting";
  await drive(pending, clock);
  check(observed.includes("original prompt") && !observed.includes("mutated while waiting"), "waiting cannot silently rebind the request identity");
}
{
  const clock = new ManualClock(); const gate = new NvidiaCapacityCoordinator(clock);
  gate.defer("1");
  const controller = new AbortController();
  const requests = Array.from({ length: 129 }, () => gate.acquire(NOW + 300000, controller.signal));
  const overflow = await requests[128];
  check(overflow.state === "WAITING_FOR_CAPACITY", "bounded queue reports unavailable capacity rather than allocating indefinitely");
  controller.abort();
  await Promise.all(requests);
  check(clock.jobs.length === 0, "queue cancellation releases every waiter");
}
{
  let rejection = "";
  try { NvidiaNimProvider.create({ providerId: "LIVE", model: "nvidia/test-model", authorityMode: "EXPLICIT_LIVE_NVIDIA_NIM",
    credentialSource: { sourceIdentity: "test", read: () => undefined }, maxPromptBytes: 4096, maxOutputTokens: 128,
    timeoutMs: 1000, testCapacity: new NvidiaCapacityCoordinator(new ManualClock()) }); }
  catch (error) { rejection = (error as Error).message; }
  check(rejection === "test_capacity_cannot_override_live_gate", "live mode cannot replace the shared rate gate with a fake clock");
}

{
  const clock = new ManualClock(); const gate = new NvidiaCapacityCoordinator(clock);
  const signal = new AbortController().signal;
  await gate.acquire(NOW + 300000, signal);
  clock.time += 61000;
  gate.recordDispatch();
  const next = await drive(gate.acquire(NOW + 300000, signal), clock);
  check(next.state === "ADMITTED" && next.waitedMs === 1501,
    "event-loop stall cannot bunch the next request against a delayed actual dispatch");
}
{
  const clock = new ManualClock(); const gate = new NvidiaCapacityCoordinator(clock);
  gate.defer("2");
  const pending = gate.acquire(NOW + 300000, new AbortController().signal);
  gate.defer("10");
  const result = await drive(pending, clock);
  check(result.state === "ADMITTED" && result.waitedMs === 10000, "new server cooldown is rechecked by already queued requests");
}
{
  const clock = new ManualClock(); const controller = new AbortController(); let aborted = false;
  const client = capacityProvider(new NvidiaCapacityCoordinator(clock), async (_url, init) => {
    controller.abort();
    aborted = init?.signal?.aborted === true;
    return success();
  });
  const result = await client.complete(request({ signal: controller.signal }));
  check(aborted && result.decision === "BLOCKED" && result.content === null, "active cancellation discards even a transport that returns a late successful response");
  const failingCredential = capacityProvider(new NvidiaCapacityCoordinator(clock), async () => { throw new Error("must_not_send"); },
    () => { throw new Error("secret-value-never-propagated"); });
  const blocked = await failingCredential.complete(request());
  check(blocked.decision === "BLOCKED" && !blocked.evidence.networkAttempted && !JSON.stringify(blocked).includes("secret-value"),
    "credential source exceptions remain sanitized and do not start a request");
}

{
  const clock = new ManualClock(); let calls = 0;
  const client = capacityProvider(new NvidiaCapacityCoordinator(clock), async () => { calls += 1; return success(); }, () => {
    clock.time += 2000; return "test-credential-not-a-real-secret";
  });
  const result = await client.complete(request({ deadlineEpochMs: NOW + 1000 }));
  check(result.decision === "BLOCKED" && calls === 0 && !result.evidence.networkAttempted,
    "slow credential acquisition cannot dispatch after the run expires");
}

{
  let observed: Record<string, unknown> = {};
  const client = provider(async (_url, init) => {
    observed = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: "{}", reasoning_content: "private-model-reasoning" },
      finish_reason: "stop" }] }), { status: 200 });
  });
  const result = await client.complete(request({ responseFormat: "JSON_OBJECT", inferencePolicy: "REASONING_JSON" }));
  check((observed.chat_template_kwargs as { enable_thinking: boolean }).enable_thinking === true
    && result.evidence.reasoningOutputBytes === Buffer.byteLength("private-model-reasoning"),
  "reasoning-enabled request records presence/size without claiming access to latent cognition");
  check(!JSON.stringify(result).includes("private-model-reasoning"), "raw model reasoning is never persisted in evidence or substituted for code");
  check((await client.complete(request({ inferencePolicy: "REASONING_JSON" }))).decision === "REJECTED",
    "reasoning mode still requires the response contract");
}

{
  const bodies: Record<string, unknown>[] = [];
  const client = NvidiaNimProvider.create({ providerId: "MEDIUM-EFFORT-TEST",
    model: "nvidia/nemotron-3-ultra-550b-a55b", authorityMode: "TEST_DOUBLE_ONLY",
    credentialSource: { sourceIdentity: "test-only", read: () => "synthetic-test-only" },
    maxPromptBytes: 4096, maxOutputTokens: 128, timeoutMs: 1000,
    transport: async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ choices: [{ message: { content: "{}" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 12, completion_tokens: 20, total_tokens: 32 } }), { status: 200 });
    } });
  const base = request({ responseFormat: "JSON_OBJECT", inferencePolicy: "REASONING_JSON" });
  const original = await client.complete(base);
  const compact = await client.complete({ ...base, reasoningEffort: "MEDIUM" });
  check(JSON.stringify(bodies[1].chat_template_kwargs) === JSON.stringify({ enable_thinking: true,
    force_nonempty_content: true, medium_effort: true }), "medium effort retains thinking and nonempty strict output");
  check(bodies.every(body => body.max_tokens === base.maxTokens) && bodies.length === 2,
    "emission policy adds neither model calls nor output tokens");
  check(original.evidence.requestDigest !== compact.evidence.requestDigest
    && compact.evidence.usage.totalTokens === 32 && !compact.executorAuthorityGranted,
    "effort setting is digest-bound and usage remains observed rather than estimated");
  for (const override of [{ inferencePolicy: undefined }, { inferencePolicy: "CONSTRAINED_JSON" },
    { reasoningEffort: "UNBOUNDED" }]) {
    const invalid = await client.complete({ ...base, reasoningEffort: "MEDIUM", ...override } as NvidiaNimCompletionRequest);
    check(invalid.decision === "REJECTED" && invalid.evidence.networkAttempted === false,
      "malformed or incompatible effort request fails before transport");
  }
  check(bodies.length === 2, "rejected effort cannot consume hidden inference");
  check((await provider(async () => { throw new Error("must_not_send"); }).complete({ ...base,
    reasoningEffort: "MEDIUM" })).decision === "REJECTED", "unsupported model cannot silently inherit Ultra template controls");
}

{
  const bodies: Record<string, unknown>[] = [];
  const client = NvidiaNimProvider.create({ providerId: "THINKING-RESERVATION-TEST",
    model: "nvidia/nemotron-3-ultra-550b-a55b", authorityMode: "TEST_DOUBLE_ONLY",
    credentialSource: { sourceIdentity: "test-only", read: () => "synthetic-test-only" },
    maxPromptBytes: 4096, maxOutputTokens: 128, timeoutMs: 1000,
    transport: async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ choices: [{ message: { content: "{}" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 12, completion_tokens: 20, total_tokens: 32 } }), { status: 200 });
    } });
  const base = request({ responseFormat: "JSON_OBJECT", inferencePolicy: "REASONING_JSON", reasoningEffort: "MEDIUM" });
  const original = await client.complete(base);
  const reserved = await client.complete({ ...base, reasoningBudgetTokens: 16 } as NvidiaNimCompletionRequest);
  check((bodies[1].chat_template_kwargs as Record<string, unknown>).reasoning_budget === 16
    && !("reasoning_budget" in bodies[1]) && bodies[1].max_tokens === base.maxTokens,
    "explicit thinking budget reserves answer room without increasing the total completion ceiling");
  check(original.evidence.requestDigest !== reserved.evidence.requestDigest && reserved.evidence.usage.totalTokens === 32,
    "thinking budget is bound to request identity rather than inferred from observed output length");
  check(!("reasoning_budget" in (bodies[0].chat_template_kwargs as Record<string, unknown>)),
    "omission preserves historical provider request behavior");
  for (const value of [-1, 128, 129, 1.5, Number.NaN, Infinity, "16"]) {
    const rejected = await client.complete({ ...base, reasoningBudgetTokens: value } as NvidiaNimCompletionRequest);
    check(rejected.decision === "REJECTED" && !rejected.evidence.networkAttempted,
      "invalid or unbounded thinking reservation fails before transport");
  }
  for (const inferencePolicy of [undefined, "CONSTRAINED_JSON"] as const) {
    check((await client.complete({ ...base, reasoningEffort: undefined, inferencePolicy,
      reasoningBudgetTokens: 16 } as NvidiaNimCompletionRequest)).decision === "REJECTED",
    "thinking reservation requires explicitly enabled reasoning");
  }
  check(bodies.length === 2, "invalid reservations cannot consume hidden model calls");
  check((await provider(async () => { throw new Error("must_not_send"); }).complete({ ...base,
    reasoningEffort: undefined, reasoningBudgetTokens: 16 } as NvidiaNimCompletionRequest)).decision === "REJECTED",
  "Ultra-specific thinking reservation cannot silently transfer to another model");
}

{
  const child = execFileSync(process.execPath, ["--experimental-strip-types", "--import",
    "./scripts/w0rs/register-typescript-loader.mjs", "--input-type=module", "--eval", `
      let calls=0;
      globalThis.fetch=async (url, init)=>{
        if(url!==${JSON.stringify(NVIDIA_NIM_CHAT_COMPLETIONS_URL)}) throw Error('wrong_endpoint');
        const body=JSON.parse(init.body); calls++;
        if(calls>3||body.max_tokens!==1536||body.temperature!==0) throw Error('diagnostic_budget_changed');
        if(body.chat_template_kwargs.reasoning_budget!==undefined) return new Response('{}',{status:400});
        return new Response(JSON.stringify({choices:[{message:{content:'{"ready":true}'},finish_reason:'stop'}],
          usage:{prompt_tokens:10,completion_tokens:5,total_tokens:15}}),{status:200});
      };
      await import('./scripts/omega/nvidia-nim-live-smoke.ts');
    `], { encoding: "utf8", timeout: 10_000, env: { ...process.env,
      OMEGA_ALLOW_NVIDIA_NETWORK: "1", OMEGA_NVIDIA_REQUEST_COMPATIBILITY: "1",
      NVIDIA_NIM_MODEL: "nvidia/nemotron-3-ultra-550b-a55b", NVIDIA_API_KEY: "synthetic-diagnostic-only" } });
  const line = child.split("\n").find(item => item.startsWith("NVIDIA_REQUEST_COMPATIBILITY_REPORT "))!;
  const report = JSON.parse(line.slice("NVIDIA_REQUEST_COMPATIBILITY_REPORT ".length));
  check(report.records.length === 3 && report.maximumModelCalls === 3
    && report.records.map((item: { evidence: { statusCode: number } }) => item.evidence.statusCode).join() === "200,400,200",
  "offline diagnostic fault injection distinguishes a budget-specific HTTP rejection from model failure");
  check(report.records[0].exactSyntheticAnswer && !report.records[1].exactSyntheticAnswer
    && report.records[2].exactSyntheticAnswer && !report.capabilityPromotion && !report.authorityIncrease,
  "configuration diagnosis preserves failed controls and cannot certify task capability");
  check(!child.includes("synthetic-diagnostic-only") && !report.rawContentPersisted,
    "diagnostic output contains neither synthetic credential nor raw model answer or reasoning");
}

{
  for (const scenario of ["BUDGET_REJECTED", "ALL_VALID", "OUTAGE"] as const) {
    let output = ""; let exitCode = 0;
    try {
      output = execFileSync(process.execPath, ["--experimental-strip-types", "--import",
        "./scripts/w0rs/register-typescript-loader.mjs", "--input-type=module", "--eval", `
        let calls=0; let first=null;
        globalThis.fetch=async (url, init)=>{
          if(url!==${JSON.stringify(NVIDIA_NIM_CHAT_COMPLETIONS_URL)}) throw Error('wrong_endpoint');
          const body=JSON.parse(init.body); calls++;
          if(calls>3||body.max_tokens!==8192||body.temperature!==0||body.stream!==false)
            throw Error('diagnostic_budget_changed');
          const invariant=JSON.stringify({model:body.model,messages:body.messages,response_format:body.response_format});
          if(first===null) first=invariant; else if(first!==invariant) throw Error('diagnostic_input_changed');
          if(calls<3 && (body.reasoning_effort!=='medium'||body.chat_template_kwargs!==undefined))
            throw Error('native_control_changed');
          if(calls===1 ? body.reasoning_budget!==2048 : body.reasoning_budget!==undefined)
            throw Error('budget_isolation_changed');
          if(calls===3 && (body.reasoning_effort!==undefined||!body.chat_template_kwargs.enable_thinking
            ||!body.chat_template_kwargs.medium_effort)) throw Error('template_control_changed');
          if(${JSON.stringify(scenario)}==='OUTAGE') return new Response('{}',{status:503});
          if(calls===1 && ${JSON.stringify(scenario)}==='BUDGET_REJECTED')
            return new Response(JSON.stringify({error:{message:'reasoning_budget validation PRIVATE_ECHO'}}),{status:400});
          return new Response(JSON.stringify({choices:[{message:{content:'{"ready":true}'},finish_reason:'stop'}],
            usage:{prompt_tokens:10,completion_tokens:5,total_tokens:15}}),{status:200});
        };
        await import('./scripts/omega/nvidia-nim-live-smoke.ts');
      `], {encoding: "utf8", timeout: 10_000, env: {...process.env,
        OMEGA_ALLOW_NVIDIA_NETWORK: "1", OMEGA_NVIDIA_REQUEST_COMPATIBILITY: "HOSTED_NATIVE_ISOLATION",
        RUNNER_TEMP: "", NVIDIA_NIM_MODEL: "nvidia/nemotron-3-ultra-550b-a55b",
        NVIDIA_API_KEY: "synthetic-diagnostic-only"}});
    } catch (error) {
      const child = error as {stdout?: string; status?: number};
      if (typeof child.stdout !== "string" || typeof child.status !== "number") throw error;
      output = child.stdout; exitCode = child.status;
    }
    const line = output.split("\n").find(item => item.startsWith("NVIDIA_REQUEST_COMPATIBILITY_REPORT "))!;
    const report = JSON.parse(line.slice("NVIDIA_REQUEST_COMPATIBILITY_REPORT ".length));
    check(exitCode === (scenario === "ALL_VALID" ? 0 : 1),
      "native diagnostic cannot exit successfully with rejected or unexecuted configurations");
    check(report.records.length === (scenario === "OUTAGE" ? 1 : 3)
      && report.maximumModelCalls === 3 && report.physicalAttemptLimitPerArm === 1
      && report.records.every((row: {evidence: NvidiaNimEvidence}) => row.evidence.delivery?.httpAttempts === 1),
    "native isolation fixes prompt/schema/total tokens and spends at most one physical request per arm");
    check(!report.capabilityPromotion && !report.authorityIncrease && !report.rawContentPersisted
      && !output.includes("synthetic-diagnostic-only") && !output.includes("PRIVATE_ECHO"),
    "native isolation is sanitized configuration evidence, never task capability or authority");
    if (scenario === "BUDGET_REJECTED") {
      check(report.records.map((row: {evidence: NvidiaNimEvidence}) => row.evidence.statusCode).join() === "400,200,200"
        && report.records[0].requestRejections[0].parameters.join() === "reasoning_budget"
        && report.records.slice(1).every((row: {exactSyntheticAnswer: boolean}) => row.exactSyntheticAnswer),
      "focused isolation preserves failed budget control while distinguishing valid effort and template controls");
    }
  }
}

{
  // Wire configuration is independently inspectable and fail-closed. It does not grant a tool.
  const bodies:Record<string,unknown>[]=[];
  const client=NvidiaNimProvider.create({providerId:"ULTRA-WIRE-DIAGNOSTIC",model:"nvidia/nemotron-3-ultra-550b-a55b",
    authorityMode:"TEST_DOUBLE_ONLY",credentialSource:{sourceIdentity:"test-only",read:()=>"synthetic-test-only"},
    maxPromptBytes:4096,maxOutputTokens:128,timeoutMs:1000,transport:async(_url,init)=>{
      bodies.push(JSON.parse(String(init?.body)));return new Response(JSON.stringify({choices:[{finish_reason:"stop",
        message:{content:"{}",reasoning_content:"private-diagnostic-thinking"}}],
        usage:{prompt_tokens:12,completion_tokens:20,total_tokens:32}}),{status:200});
    }});
  const base=request({responseFormat:"JSON_OBJECT",inferencePolicy:"REASONING_JSON",reasoningEffort:"MEDIUM"});
  const digests:string[]=[];
  for(const reasoningControl of [undefined,"ULTRA_NATIVE"] as const)for(const structuredOutputMode of [undefined,"STRICT_LOCAL"] as const){
    const result=await client.complete({...base,reasoningControl,structuredOutputMode});const body=bodies.at(-1)!;
    digests.push(result.evidence.requestDigest);
    check(result.decision==="COMPLETED"&&!result.executorAuthorityGranted&&result.evidence.usage.totalTokens===32,
      "all configuration cells preserve finite completion accounting, not executor authority");
    check(("response_format" in body)===(structuredOutputMode===undefined),"strict-local changes hosted grammar ONLY");
    check(reasoningControl==="ULTRA_NATIVE"?body.reasoning_effort==="medium"
      &&JSON.stringify(body.chat_template_kwargs)===JSON.stringify({force_nonempty_content:true}):
      body.reasoning_effort===undefined&&JSON.stringify(body.chat_template_kwargs)===JSON.stringify({
        enable_thinking:true,force_nonempty_content:true,medium_effort:true}),"native and legacy settings are separate, not conflicting controls");
    check(body.max_tokens===base.maxTokens&&body.temperature===base.temperature&&bodies.length===digests.length,
      "configuration does not grow completion tokens, retries or model calls");
    check(result.evidence.reasoningOutputBytes===Buffer.byteLength("private-diagnostic-thinking")
      &&!JSON.stringify(result).includes("private-diagnostic-thinking"),"observed thinking size does not persist raw model reasoning");
  }
  check(new Set(digests).size===4,"request custody differentiates all four real wire configurations");
  const hosted=await client.complete({...base,reasoningControl:"ULTRA_HOSTED_NATIVE",reasoningBudgetTokens:16});
  const hostedBody=bodies.at(-1)!;
  check(hosted.decision==="COMPLETED"&&hostedBody.reasoning_effort==="medium"&&hostedBody.reasoning_budget===16,
    "hosted native opt-in uses documented top-level reasoning fields");
  check(!("chat_template_kwargs" in hostedBody)&&JSON.stringify(hostedBody.response_format)===JSON.stringify({type:"json_object"}),
    "hosted native removes self-host template kwargs, not JSON output constraints");
  check(hostedBody.max_tokens===base.maxTokens&&hostedBody.temperature===base.temperature&&!hosted.executorAuthorityGranted,
    "hosted profile cannot grow token ceiling or executor authority");
  check(!digests.includes(hosted.evidence.requestDigest),"custody digest binds the actual hosted-only wire payload");
  for(const override of [{inferencePolicy:undefined},{reasoningBudgetTokens:-1},{reasoningBudgetTokens:32}]) {
    check((await client.complete({...base,reasoningControl:"ULTRA_HOSTED_NATIVE",...override} as NvidiaNimCompletionRequest)).decision==="REJECTED",
      "hosted compatibility cannot weaken finite reasoning or inference-policy validation");
  }
  check((await provider(async()=>{throw Error("must_not_send")}).complete({...base,reasoningEffort:undefined,
    reasoningControl:"ULTRA_HOSTED_NATIVE"})).decision==="REJECTED","hosted native profile remains exact-model scoped");
  const nativeBudget=await client.complete({...base,reasoningControl:"ULTRA_NATIVE",reasoningBudgetTokens:16});
  const budgetBody=bodies.at(-1)!;
  check(nativeBudget.decision==="COMPLETED"&&budgetBody.reasoning_budget===16
    &&!("reasoning_budget" in (budgetBody.chat_template_kwargs as Record<string,unknown>)),"native control uses documented top-level bounded reasoning budget");
  const direct=await client.complete({...base,inferencePolicy:"CONSTRAINED_JSON",reasoningEffort:undefined,reasoningControl:"ULTRA_NATIVE"});
  check(direct.decision==="COMPLETED"&&bodies.at(-1)!.reasoning_effort==="none","native constrained mode never implicitly enables thinking");
  const before=bodies.length;
  for(const fields of [{reasoningControl:"AUTO"},{reasoningControl:"ULTRA_NATIVE",inferencePolicy:undefined},
    {structuredOutputMode:"AUTO"},{structuredOutputMode:"STRICT_LOCAL",inferencePolicy:undefined},
    {structuredOutputMode:"STRICT_LOCAL",responseFormat:undefined}]){
    const rejected=await client.complete({...base,...fields} as NvidiaNimCompletionRequest);
    check(rejected.decision==="REJECTED"&&!rejected.evidence.networkAttempted,"unknown or unconstrained diagnostic intent fails before transport");
  }
  check(bodies.length===before,"malformed diagnostic intent cannot add silent inference");
  check((await provider(async()=>{throw Error("must_not_send")}).complete({...base,reasoningEffort:undefined,
    reasoningControl:"ULTRA_NATIVE"})).decision==="REJECTED","Ultra-native controls cannot migrate to unrelated models");
}

// General development-only dispatch tests: no task IDs, benchmark answers, or real network.
{
  for (const limit of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    try { provider(async () => success()).withHttpAttemptBudget(limit); check(false, "invalid dispatch budget rejects"); }
    catch (error) { check(String(error).includes("nvidia_http_attempt_budget_invalid"), "invalid dispatch budget rejects"); }
  }
  const clock = new ManualClock(); let calls = 0, reads = 0; const bodies: string[] = [];
  const base = capacityProvider(new NvidiaCapacityCoordinator(clock), async (_url, init) => {
    bodies.push(String(init?.body)); calls++;
    return calls === 1 ? new Response(null, {status: 503}) : success();
  }, () => {reads++; return "synthetic-development-credential";});
  const bounded = base.withHttpAttemptBudget(2);
  const first = await drive(bounded.complete(request()), clock);
  const second = await drive(bounded.complete(request({requestId: "NEXT-LOGICAL-CALL"})), clock);
  check(first.decision === "COMPLETED" && first.evidence.delivery?.httpAttempts === 2,
    "transient retry consumes the same task budget, not an additional logical allowance");
  check(second.reason === "nvidia_http_attempt_budget_exhausted" && calls === 2 && reads === 2,
    "next logical completion is blocked before credential read and a third dispatch");
  check(second.evidence.delivery?.httpAttempts === 0 && !second.evidence.networkAttempted
    && second.evidence.usage.totalTokens === null && second.evidence.failureCategory === null,
    "local exhaustion is neither fabricated provider failure nor zero-token inference");
  check(first.evidence.delivery?.httpAttemptBudget?.exhausted && !first.evidence.delivery.httpAttemptBudget.dispatchDenied
    && second.evidence.delivery?.httpAttemptBudget?.dispatchDenied,
    "successful final dispatch is distinguished from a later denied dispatch");
  check(Object.isFrozen(second.evidence.delivery?.httpAttemptBudget) && !second.executorAuthorityGranted
    && !second.evidence.delivery?.httpAttemptBudget?.renewed,
    "dispatch evidence is frozen and cannot renew executor authority or compute");
  check(new Set(bodies).size === 1 && bodies.every(body => !/httpAttemptBudget|remainingAttempts|synthetic-development-credential/.test(body)),
    "retry uses exact payload without leaking budget mechanics or credentials into cognition");
  check(clock.jobs.length === 0, "exhausted retry budget leaves no delayed reactivation");
  const nextTask = await drive(base.withHttpAttemptBudget(2).complete(request()), clock);
  check(nextTask.decision === "COMPLETED" && calls === 3,
    "separate host-issued task scopes do not accidentally share a campaign-wide budget");
  console.log(`NYX_HTTP_BUDGET_DEVELOPMENT ${JSON.stringify({logicalRequests: 2, physicalLimit: 2,
    physicalDispatchesBeforeNextTask: 2, deniedRequests: 1, liveModelCalls: 0, cognitiveGain: false})}`);
}
{
  for (const status of [429, 503]) {
    const clock = new ManualClock(); let calls = 0; const events: NvidiaNimCapacityProgress[] = [];
    const client = capacityProvider(new NvidiaCapacityCoordinator(clock), async () => {
      calls++; return new Response(null, {status});
    }, undefined, event => {events.push(event);}).withHttpAttemptBudget(1);
    const result = await drive(client.complete(request()), clock);
    check(calls === 1 && result.reason === "nvidia_http_attempt_budget_exhausted" && result.evidence.statusCode === status,
      "rate-limit and outage retries cannot exceed frozen physical dispatch count");
    check(result.evidence.delivery?.httpAttempts === 1 && result.evidence.delivery.httpAttemptBudget?.dispatched === 1
      && result.evidence.delivery.httpAttemptBudget.dispatchDenied && result.evidence.usage.totalTokens === null,
      "budget rejection retains observed HTTP failure and unknown compute");
    check(clock.jobs.length === 0 && events.at(-1)?.state === "STOPPED" && !events.at(-1)?.automaticResume,
      "exhaustion never waits or advertises a retry that has no remaining budget");
  }
}
{
  let calls = 0;
  const parent = provider(async () => {calls++; return success();}).withHttpAttemptBudget(2);
  const left = parent.withHttpAttemptBudget(1), right = parent.withHttpAttemptBudget(2);
  await left.complete(request()); await right.complete(request());
  const denied = await right.withHttpAttemptBudget(100).complete(request());
  check(calls === 2 && denied.reason === "nvidia_http_attempt_budget_exhausted",
    "nested and sibling provider scopes share ancestor debits; a new child cannot refill them");
  check(denied.evidence.delivery?.httpAttemptBudget?.dispatched === 0
    && denied.evidence.delivery.httpAttemptBudget.remainingAttempts === 0,
    "child evidence distinguishes its own attempts from inherited exhaustion");
  const outcomes = await Promise.all(Array.from({length: 8}, () =>
    provider(async () => success()).withHttpAttemptBudget(1).complete(request())));
  check(outcomes.every(result => result.decision === "COMPLETED"), "unrelated test scopes remain independent");
  let concurrentCalls = 0;
  const concurrent = provider(async () => {concurrentCalls++; await new Promise(resolve => setImmediate(resolve)); return success();})
    .withHttpAttemptBudget(2);
  const parallel = await Promise.all(Array.from({length: 8}, () => concurrent.complete(request())));
  check(concurrentCalls === 2 && parallel.filter(result => result.decision === "COMPLETED").length === 2,
    "parallel completions atomically debit the last allowed dispatches");
  check(parallel.filter(result => result.reason === "nvidia_http_attempt_budget_exhausted").length === 6,
    "concurrent excess requests fail as local budget denial, not transport corruption");
}
{
  let calls = 0;
  const client = provider(async () => {calls++; throw Error("untrusted-transport-error");}).withHttpAttemptBudget(1);
  const failed = await client.complete(request()), denied = await client.complete(request());
  check(calls === 1 && failed.evidence.networkAttempted && failed.evidence.usage.totalTokens === null,
    "a dispatched transport failure consumes compute budget even without a response");
  check(denied.reason === "nvidia_http_attempt_budget_exhausted" && !denied.evidence.networkAttempted,
    "transport failure does not refund an unknowable provider attempt");
  const invalid = provider(async () => {calls++; return success();}).withHttpAttemptBudget(1);
  const malformed = await invalid.complete(request({maxTokens: -1}));
  const valid = await invalid.complete(request());
  check(malformed.decision === "REJECTED" && valid.decision === "COMPLETED",
    "strict request validation remains unchanged and does not debit an unsent request");
  const cancelled = new AbortController(); cancelled.abort();
  const cancelClient = provider(async () => {calls++; return success();}).withHttpAttemptBudget(1);
  const before = calls;
  const cancelResult = await cancelClient.complete(request({signal: cancelled.signal}));
  check(calls === before && cancelResult.reason === "nvidia_provider_cancelled"
    && cancelResult.evidence.delivery?.httpAttemptBudget?.dispatched === 0,
    "cancellation before dispatch cannot spend or renew a budget");
  const clock = new ManualClock(); let delayedCalls = 0;
  const expired = capacityProvider(new NvidiaCapacityCoordinator(clock), async () => {delayedCalls++; return success();},
    () => {clock.time += 2000; return "synthetic-development-credential";}).withHttpAttemptBudget(1);
  const expiredResult = await drive(expired.complete(request({deadlineEpochMs: NOW + 1000})), clock);
  check(delayedCalls === 0 && expiredResult.reason === "nvidia_completion_run_expired"
    && expiredResult.evidence.delivery?.httpAttemptBudget?.dispatched === 0,
    "expiry between credential read and dispatch cannot consume or authorize a request");
}

// Independent transport reproduction: no benchmark question, answer, live model or secret.
// The delayed response is controlled by this evaluator, not by provider helper functions.
{
  const outcomes: { timeoutMs: number; decision: string; elapsedMs: number; leaseRemainingMs: number }[] = [];
  for (const timeoutMs of [100, 500]) {
    const began = Date.now(), deadline = began + 900;
    let dispatches = 0;
    const client = provider(async () => {
      dispatches++;
      await new Promise<void>(resolve => setTimeout(resolve, 200));
      return new Response(JSON.stringify({choices: [{message: {content: "DEVELOPMENT_DELIVERY"}, finish_reason: "stop"}],
        usage: {prompt_tokens: 6, completion_tokens: 2, total_tokens: 8}}), {status: 200});
    }, "synthetic-development-credential", timeoutMs).withHttpAttemptBudget(1);
    const result = await client.complete(request({deadlineEpochMs: deadline}));
    outcomes.push({timeoutMs, decision: result.decision, elapsedMs: Date.now() - began, leaseRemainingMs: deadline - Date.now()});
    check(dispatches === 1 && result.evidence.delivery?.httpAttemptBudget?.dispatched === 1,
      "independent delayed-response reproduction uses exactly one physical request in either control");
    check(timeoutMs === 100 ? result.evidence.failureCategory === "PROVIDER_TIMEOUT" && Date.now() < deadline
      : result.decision === "COMPLETED" && result.content === "DEVELOPMENT_DELIVERY" && Date.now() < deadline,
    "per-attempt timeout can reject a controlled response while the same finite task lease remains valid");
  }
  console.log(`NYX_TIMEOUT_DEVELOPMENT ${JSON.stringify({outcomes, liveModelCalls: 0, cognitiveGain: false,
    inference: "CONTROLLED_TRANSPORT_ONLY_NOT_PROOF_OF_LIVE_PROVIDER_COMPLETION"})}`);
}

// Matched independent transport controls for the opt-in final-attempt policy.
// Longer waiting is delivery reliability, not extra inference allowance or cognitive improvement.
{
  const make = (transport: NvidiaNimTransport, finalAttemptTimeoutMs?: number,
    read = () => "synthetic-development-credential") => NvidiaNimProvider.create({
    providerId: "DEVELOPMENT-FINAL-ATTEMPT", model: "nvidia/development-model", authorityMode: "TEST_DOUBLE_ONLY",
    credentialSource: {sourceIdentity: "synthetic:final-attempt", read}, maxPromptBytes: 4096,
    maxOutputTokens: 128, timeoutMs: 100, finalAttemptTimeoutMs, transport});
  const outcomes: {phase: string; profile: string; decision: string; physicalCalls: number; elapsedMs: number}[] = [];
  for (const phase of ["FETCH", "BODY"] as const) for (const profile of ["FIXED", "FINAL_LEASE"] as const) {
    const began = Date.now(), deadline = began + 900;
    let calls = 0;
    const raw = {choices: [{message: {content: "DEVELOPMENT_FINAL"}, finish_reason: "stop"}],
      usage: {prompt_tokens: 6, completion_tokens: 2, total_tokens: 8}};
    const delay = () => new Promise<void>(resolve => setTimeout(resolve, 200));
    const client = make(async () => {
      calls++;
      if (phase === "FETCH") { await delay(); return new Response(JSON.stringify(raw), {status: 200}); }
      return {ok: true, status: 200, headers: new Headers(), json: async () => { await delay(); return raw; }} as Response;
    }, profile === "FINAL_LEASE" ? 500 : undefined).withHttpAttemptBudget(1);
    const result = await client.complete(request({deadlineEpochMs: deadline}));
    const refused = await client.complete(request({deadlineEpochMs: deadline}));
    outcomes.push({phase, profile, decision: result.decision, physicalCalls: calls, elapsedMs: Date.now() - began});
    check(profile === "FIXED" ? result.evidence.failureCategory === "PROVIDER_TIMEOUT"
      : result.decision === "COMPLETED" && result.content === "DEVELOPMENT_FINAL",
    `${phase}: opt-in final attempt delivers a controlled response without changing the default cutoff`);
    check(calls === 1 && refused.reason === "nvidia_http_attempt_budget_exhausted"
      && result.evidence.delivery?.authorityRenewed === false,
    `${phase}/${profile}: completion, timeout and repeat cannot refill the shared physical allowance`);
    check(profile === "FIXED" ? result.evidence.delivery?.attemptTimeout === undefined
      : result.evidence.delivery?.attemptTimeout?.callerDeadlineEpochMs === deadline
        && result.evidence.delivery.attemptTimeout.finalAttemptUsed,
    `${phase}/${profile}: evidence identifies the explicit profile and unchanged caller expiry`);
  }
  let reads = 0, calls = 0;
  const read = () => { reads++; return "synthetic-development-credential"; };
  const unowned = make(async () => {calls++; return success();}, 500, read);
  const noBudget = await unowned.complete(request({deadlineEpochMs: Date.now() + 900}));
  const noDeadline = await unowned.withHttpAttemptBudget(1).complete(request());
  check(noBudget.decision === "REJECTED" && noDeadline.decision === "REJECTED" && reads === 0 && calls === 0,
    "extended final attempt requires both host-owned shared allowance and finite caller expiry before credential access");
  const first = make(async () => { await new Promise<void>(resolve => setTimeout(resolve, 200)); return success(); }, 500)
    .withHttpAttemptBudget(2);
  const firstResult = await first.complete(request({deadlineEpochMs: Date.now() + 900}));
  check(firstResult.evidence.failureCategory === "PROVIDER_TIMEOUT"
    && firstResult.evidence.delivery?.attemptTimeout?.finalAttemptUsed === false,
    "non-final physical attempt retains the original timeout even in the experimental profile");
  const deadline = Date.now() + 100;
  const late = make(async () => { await new Promise<void>(resolve => setTimeout(resolve, 200)); return success(); }, 500)
    .withHttpAttemptBudget(1);
  const lateResult = await late.complete(request({deadlineEpochMs: deadline}));
  check(lateResult.decision !== "COMPLETED" && lateResult.content === null && lateResult.evidence.responseDigest === null,
    "extended final attempt cannot accept output after the original shorter task deadline");
  const controller = new AbortController();
  const cancelled = make(async () => { await new Promise<void>(resolve => setTimeout(resolve, 200)); return success(); }, 500)
    .withHttpAttemptBudget(1);
  const timer = setTimeout(() => controller.abort(), 25);
  try {
    const result = await cancelled.complete(request({deadlineEpochMs: Date.now() + 900, signal: controller.signal}));
    check(result.evidence.failureCategory === "PROVIDER_CANCELLED" && result.content === null,
      "caller cancellation still fences transport that ignores abort under the extended final profile");
  } finally { clearTimeout(timer); }
  for (const finalMs of [99, 180001, NaN, 100.5]) {
    let rejected = false;
    try { make(async () => success(), finalMs); } catch { rejected = true; }
    check(rejected, "malformed, shorter or over-ceiling final-attempt policy is rejected");
  }
  let oldCapPreserved = false;
  try { NvidiaNimProvider.create({providerId: "DEFAULT-CAP", model: "nvidia/development-model", authorityMode: "TEST_DOUBLE_ONLY",
    credentialSource: {sourceIdentity: "synthetic:default-cap", read}, maxPromptBytes: 4096, maxOutputTokens: 128,
    timeoutMs: 120001, transport: async () => success()}); } catch { oldCapPreserved = true; }
  check(oldCapPreserved, "ordinary provider timeout ceiling remains 120 seconds; experimental profile is not the default");
  console.log(`NYX_FINAL_ATTEMPT_DEVELOPMENT ${JSON.stringify({outcomes, liveModelCalls: 0, cognitiveGain: false,
    productionDefaultsChanged: false, callerLeaseRenewed: false, inference: "SYNTHETIC_TRANSPORT_NOT_LIVE_TRANSFER"})}`);
}

// Reproduce two consecutive transient failures while the original task still owns
// unused dispatches. No live endpoint, benchmark solution or credential is involved.
{
  for (const recovery of [undefined, "WITHIN_SHARED_BUDGET"] as const) {
    const clock = new ManualClock(); let calls = 0; const bodies: string[] = [];
    const bounded = capacityProvider(new NvidiaCapacityCoordinator(clock), async (_url, init) => {
      bodies.push(String(init?.body)); calls++;
      return calls <= 2 ? new Response(null, {status: 503}) : success();
    }).withHttpAttemptBudget(4, recovery);
    const first = await drive(bounded.complete(request({deadlineEpochMs: NOW + 180000})), clock);
    check(recovery ? first.decision === "COMPLETED" && calls === 3 : first.decision === "PROVIDER_ERROR" && calls === 2,
      "explicit budget recovery survives a two-error schedule; default fixed retry behavior is preserved");
    check(bodies.every(body => body === bodies[0]), "transient recovery retries exactly the frozen request, not a new reasoning prompt");
    check(first.evidence.delivery?.transientUnavailableResponses === 2
      && first.evidence.delivery.httpAttemptBudget?.dispatched === (recovery ? 3 : 2),
      "all unsuccessful physical attempts remain accounted even when recovery succeeds");
    if (recovery) {
      const next = await drive(bounded.complete(request({requestId: "AFTER-RECOVERY", deadlineEpochMs: NOW + 180000})), clock);
      check(next.decision === "COMPLETED" && calls === 4, "the remaining dispatch can deliver the next logical phase under the original lease");
      const denied = await drive(bounded.complete(request({deadlineEpochMs: NOW + 180000})), clock);
      check(denied.reason === "nvidia_http_attempt_budget_exhausted" && calls === 4,
        "recovery cannot refill the shared task budget after a successful next phase");
    }
  }
}
{
  for (const limit of [1, 2, 4]) {
    const clock = new ManualClock(); let calls = 0;
    const bounded = capacityProvider(new NvidiaCapacityCoordinator(clock), async () => {
      calls++; return new Response(null, {status: 503});
    }).withHttpAttemptBudget(limit, "WITHIN_SHARED_BUDGET");
    const result = await drive(bounded.complete(request({deadlineEpochMs: NOW + 180000})), clock);
    check(result.decision !== "COMPLETED" && calls <= limit && clock.time <= NOW + 180000,
      "persistent outage is bounded by both dispatch count and original lifetime, never retried until success");
    check(result.evidence.delivery?.transientUnavailableResponses === calls
      && result.evidence.delivery.httpAttemptBudget?.limit === limit,
      "persistent failure preserves the true attempt count and declared bound");
  }
  let calls = 0, reads = 0;
  const missingLease = provider(async () => {calls++; return success();}).withHttpAttemptBudget(4, "WITHIN_SHARED_BUDGET");
  check((await missingLease.complete(request())).reason === "completion_budget_recovery_requires_caller_deadline" && calls === 0,
    "budget-owned recovery cannot infer or renew an absent caller lease");
  try { missingLease.withHttpAttemptBudget(4, "UNBOUNDED" as never); check(false, "unknown recovery policy rejected"); }
  catch (error) {check(String(error).includes("nvidia_http_attempt_recovery_invalid"), "unknown recovery policy rejected");}
  const clock = new ManualClock(); const controller = new AbortController();
  const cancelled = capacityProvider(new NvidiaCapacityCoordinator(clock), async () => new Response(null, {status: 503}),
    () => {reads++; return "synthetic-development-credential";}, event => {
      if (event.state === "WAITING_FOR_CAPACITY") controller.abort();
    }).withHttpAttemptBudget(4, "WITHIN_SHARED_BUDGET");
  const result = await drive(cancelled.complete(request({signal: controller.signal, deadlineEpochMs: NOW + 180000})), clock);
  check(result.decision === "BLOCKED" && reads === 1 && result.evidence.delivery?.httpAttempts === 1,
    "cancellation revokes opted-in recovery before another credential read or HTTP dispatch");
}
{
  const clock = new ManualClock(); let calls = 0;
  const nested = capacityProvider(new NvidiaCapacityCoordinator(clock), async () => {
    calls++; return calls < 3 ? new Response(null, {status: 503}) : success();
  }).withHttpAttemptBudget(3).withHttpAttemptBudget(4, "WITHIN_SHARED_BUDGET");
  check((await drive(nested.complete(request({deadlineEpochMs: NOW + 180000})), clock)).decision === "COMPLETED",
    "budget recovery composes with a stricter ancestor dispatch limit");
  const blocked = await drive(nested.complete(request({deadlineEpochMs: NOW + 180000})), clock);
  check(blocked.reason === "nvidia_http_attempt_budget_exhausted" && calls === 3,
    "a child recovery scope cannot refill or exceed its ancestor budget");
}
{
  const outputs = ['{"kind":"REPLY","message":"private-generated-value"}', '["private-generated-value"]',
    '"private-generated-value"', '```json\n{"kind":"REPLY"}\n```', '<think>private-reasoning</think>not-json'];
  const expected = ["OBJECT", "ARRAY", "SCALAR", "INVALID", "INVALID"];
  for (const [index, output] of outputs.entries()) {
    const result = await provider(async () => new Response(JSON.stringify({choices: [{message: {content: output}, finish_reason: "stop"}]}),
      {status: 200})).complete(request());
    const shape = result.evidence.contentShape;
    check(shape?.json === expected[index] && shape.leadingMarkdownFence === (index === 3)
      && shape.thinkingDelimiterPresent === (index === 4), "output-shape diagnostics separate syntax, fencing and thinking delimiters");
    check(result.content === output && !JSON.stringify(result.evidence).includes("private-") && Object.isFrozen(shape),
      "shape diagnosis cannot extract, repair, persist, or authorize generated text");
  }
}

assert(NVIDIA_NIM_PROVIDER_STATUS.newCapability === "BOUNDED_NVIDIA_NIM_CHAT_COMPLETION", "chunk reports exact model capability gain");
assert(NVIDIA_NIM_PROVIDER_STATUS.liveNetworkAuthorityGranted === false && !NVIDIA_NIM_PROVIDER_STATUS.productionEligible,
  "provider adapter does not grant live or production authority by construction");

console.log(`Omega NVIDIA NIM provider tests - passed: ${passed}, failed: ${failed}`);
if (failed > 0) { console.error("FAILURES:"); for (const failure of failures) console.error(`  - ${failure}`); process.exit(1); }
