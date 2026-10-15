import assert from "node:assert/strict";
import {NVIDIA_STREAM_LIMITS, newNvidiaStreamDiagnostics, readNvidiaEventStream} from "../src/lib/codelab/model/nvidiaEventStream";
import {NvidiaNimProvider, type NvidiaNimCompletionRequest} from "../src/lib/codelab/model/nvidiaNimProvider";
import {sanitizedTextResult} from "./omega/benchmarks/nyxTextBenchmark";
import {mathematicsPublicResult} from "./omega/nyx-aime26-live-eval";
let passed = 0, failed = 0;
async function check(label: string, fn: () => unknown) {
  try { await fn(); passed++; } catch { failed++; console.error(`FAIL ${label}`); }
}
const frame = (delta: unknown, finish_reason: unknown = null) => `data: ${JSON.stringify({choices: [{index: 0, delta, finish_reason}]})}\n\n`;
const usage = `data: ${JSON.stringify({choices: [], usage: {prompt_tokens: 10, completion_tokens: 20, total_tokens: 30}})}\n\n`;
const done = "data: [DONE]\n\n";
const prefix = frame({role: "assistant"}) + frame({reasoning_content: "SYNTHETIC_INTERNAL_SENTINEL"});
const complete = prefix + frame({content: '{"kind":"REPLY","message":"Ω🦉"}'}) + frame({}, "stop") + usage + done;
const response = (wire: string | Uint8Array, chunkSize = 4096, cancelled?: () => void) => {
  const bytes = typeof wire === "string" ? new TextEncoder().encode(wire) : wire;
  let offset = 0;
  return new Response(new ReadableStream<Uint8Array>({pull(controller) {
    if (offset >= bytes.length) {controller.close(); return;}
    const end = Math.min(bytes.length, offset + chunkSize);
    controller.enqueue(bytes.slice(offset, end)); offset = end;
  }, cancel() {cancelled?.();}}), {headers: {"content-type": "text/event-stream; charset=utf-8"}});
};
for (const chunkSize of [1, 2, 3, 7, 31, 4096]) for (const crlf of [false, true]) {
  await check(`UTF-8 and event framing survive chunk size ${chunkSize} CRLF=${crlf}`, async () => {
    const stats = newNvidiaStreamDiagnostics(); let clock = 0;
    const result = await readNvidiaEventStream(response(crlf ? complete.replaceAll("\n", "\r\n") : complete, chunkSize),
      new AbortController().signal, stats, () => ++clock);
    assert.equal(result.choices[0].message.content, '{"kind":"REPLY","message":"Ω🦉"}');
    assert.equal(result.choices[0].finish_reason, "stop"); assert.equal(stats.terminal, "DONE");
    assert.equal(stats.events, 6); assert(stats.reasoningDeltaBytes > 0 && stats.firstReasoningAfterMs !== null);
    assert.equal(stats.timingOrigin, "RESPONSE_HEADERS_RECEIVED_NOT_DISPATCH");
    assert(stats.firstContentAfterMs! > stats.firstReasoningAfterMs!); assert(stats.usageReceived);
    assert.deepEqual(stats.reportedUsage, {promptTokens: 10, completionTokens: 20, totalTokens: 30});
    assert(!JSON.stringify({result, stats}).includes("SYNTHETIC_INTERNAL_SENTINEL"));
  });
}
for (const [label, wire] of [
  ["unfinished content", prefix + frame({content: "partial"})],
  ["finish without DONE", frame({content: "partial"}, "stop")],
  ["DONE without finish", frame({content: "partial"}) + done],
  ["invalid JSON", "data: invalid\n\n" + done],
  ["provider error", 'data: {"error":{"message":"synthetic"},"choices":[]}\n\n' + done],
  ["multiple choices", 'data: {"choices":[{},{}]}\n\n' + done],
  ["wrong choice identity", 'data: {"choices":[{"index":1,"delta":{}}]}\n\n' + done],
  ["missing delta", 'data: {"choices":[{"index":0}]}\n\n' + done],
  ["non-text content", frame({content: {code: "x"}}) + done],
  ["unknown finish", frame({content: "x"}, "unknown") + done],
  ["content after finish", frame({content: "x"}, "stop") + frame({content: "y"}) + done],
  ["multiple usage", frame({content: "x"}, "stop") + usage + usage + done],
  ["foreign SSE field", "event: executable\n\n" + done],
  ["tool call is not text authority", frame({tool_calls: [{function: {name: "shell"}}]}, "tool_calls") + done],
  ["data after DONE", frame({content: "x"}, "stop") + done + "data: extra\n\n"],
] as const) await check(`${label} never becomes a completion`, async () => {
  const stats = newNvidiaStreamDiagnostics();
  await assert.rejects(readNvidiaEventStream(response(wire), new AbortController().signal, stats));
  assert.notEqual(stats.terminal, "DONE");
});
await check("Usage remains unknown when the server supplies none; no token estimate from bytes", async () => {
  const stats = newNvidiaStreamDiagnostics();
  await readNvidiaEventStream(response(frame({content: "x"}, "stop") + done), new AbortController().signal, stats);
  assert.equal(stats.usageReceived, false); assert.equal(stats.reportedUsage.totalTokens, null);
});
await check("Reported usage survives an incomplete transport without accepting the content", async () => {
  const stats = newNvidiaStreamDiagnostics();
  await assert.rejects(readNvidiaEventStream(response(frame({content: "x"}, "stop") + usage), new AbortController().signal, stats));
  assert.equal(stats.terminal, "INCOMPLETE"); assert.equal(stats.reportedUsage.totalTokens, 30);
});
await check("Malformed UTF-8, including an incomplete tail, is rejected", async () => {
  for (const bytes of [new Uint8Array([255]), new Uint8Array([...new TextEncoder().encode(complete), 0xf0])])
    await assert.rejects(readNvidiaEventStream(response(bytes), new AbortController().signal, newNvidiaStreamDiagnostics()));
});
await check("Comments and multiline SSE data do not become model output", async () => {
  const wire = ': heartbeat\n\ndata: {"choices":\ndata: [{"index":0,"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\n' + done;
  const r = await readNvidiaEventStream(response(wire), new AbortController().signal, newNvidiaStreamDiagnostics());
  assert.equal(r.choices[0].message.content, "ok");
});
await check("Wire, frame, content and event limits are enforced independently", async () => {
  const cases = [":" + "x".repeat(NVIDIA_STREAM_LIMITS.wireBytes),
    "data: " + "x".repeat(NVIDIA_STREAM_LIMITS.eventBytes + 1) + "\n\n",
    Array.from({length: 5}, () => frame({content: "x".repeat(65536)})).join(""),
    frame({}) .repeat(NVIDIA_STREAM_LIMITS.events + 1)];
  for (const wire of cases) {
    const stats = newNvidiaStreamDiagnostics();
    await assert.rejects(readNvidiaEventStream(response(wire, wire.length), new AbortController().signal, stats));
    assert.equal(stats.terminal, "LIMIT_EXCEEDED");
  }
});
await check("Abort releases a hanging reader without accepting its partial prefix", async () => {
  const controller = new AbortController(), stats = newNvidiaStreamDiagnostics(); let cancelled = false;
  const res = new Response(new ReadableStream({start(c) {c.enqueue(new TextEncoder().encode(prefix));}, cancel() {cancelled = true;}}),
    {headers: {"content-type": "text/event-stream"}});
  const pending = readNvidiaEventStream(res, controller.signal, stats); setTimeout(() => controller.abort(), 5);
  await assert.rejects(pending); await Promise.resolve(); assert(cancelled); assert.equal(stats.terminal, "ABORTED");
});
await check("Zero-byte chunks cannot starve the deadline timer in an endless microtask loop", async () => {
  const stats = newNvidiaStreamDiagnostics(); let cancelled = false;
  const res = new Response(new ReadableStream({pull(c) {c.enqueue(new Uint8Array());}, cancel() {cancelled = true;}}),
    {headers: {"content-type": "text/event-stream"}});
  await assert.rejects(readNvidiaEventStream(res, new AbortController().signal, stats));
  assert.equal(stats.terminal, "LIMIT_EXCEEDED"); assert(cancelled); assert(stats.chunks < 100);
});
const request: NvidiaNimCompletionRequest = {schemaVersion: 1, requestId: "STREAM-TEST", messages: [{role: "user", content: "Return a JSON reply."}],
  maxTokens: 128, temperature: 0, observedAtEpochMs: Date.now()};
const config = {providerId: "STREAM-TEST", model: "nvidia/nemotron-3-ultra-550b-a55b", authorityMode: "TEST_DOUBLE_ONLY" as const,
  credentialSource: {sourceIdentity: "test-double", read: () => "synthetic-credential-not-a-real-key"}, maxPromptBytes: 4096, maxOutputTokens: 128, timeoutMs: 100};
await check("The existing provider composes streaming with unchanged strict output and authority semantics", async () => {
  let payload: Record<string, unknown> = {}, accept = "";
  const provider = NvidiaNimProvider.create({...config, responseMode: "BOUNDED_SSE", transport: async (_url, init) => {
    payload = JSON.parse(String(init?.body)); accept = new Headers(init?.headers).get("accept")!; return response(complete);
  }});
  const r = await provider.withHttpAttemptBudget(1).complete(request);
  assert.equal(r.decision, "COMPLETED"); assert.equal(payload.stream, true); assert.equal(accept, "text/event-stream");
  assert.equal(r.evidence.streamDelivery?.terminal, "DONE"); assert.equal(r.evidence.usage.totalTokens, 30);
  assert.equal(r.evidence.delivery?.httpAttempts, 1); assert.equal(r.executorAuthorityGranted, false);
  assert(!JSON.stringify(r).includes("SYNTHETIC_INTERNAL_SENTINEL")); assert.equal(r.evidence.evidenceClass, "E3");
  const row = sanitizedTextResult({taskId: "STREAM-DEVELOPMENT", family: "DEVELOPMENT_DIAGNOSTIC", question: "synthetic", answer: "1"},
    null, [r.evidence], null, 1);
  assert.equal(row.modelEvidence[0].streamDelivery?.terminal, "DONE");
  assert(!JSON.stringify(row).includes("SYNTHETIC_INTERNAL_SENTINEL"));
  const safe = mathematicsPublicResult(row);
  assert.equal(safe.modelEvidence[0].responseDigest, null);
  assert(!("predictionDigest" in safe)); assert(!("privateOracleDigest" in safe));
});
await check("A streaming timeout preserves partial progress, not an answer or a renewed deadline", async () => {
  const provider = NvidiaNimProvider.create({...config, responseMode: "BOUNDED_SSE", transport: async () =>
    new Response(new ReadableStream({start(c) {c.enqueue(new TextEncoder().encode(prefix));}}), {headers: {"content-type": "text/event-stream"}})});
  const r = await provider.withHttpAttemptBudget(1).complete({...request, deadlineEpochMs: Date.now() + 1000});
  assert.notEqual(r.decision, "COMPLETED"); assert.equal(r.content, null); assert.equal(r.evidence.statusCode, 200);
  assert.equal(r.evidence.failureCategory, "PROVIDER_TIMEOUT"); assert.equal(r.evidence.streamDelivery?.terminal, "ABORTED");
  assert(r.evidence.streamDelivery!.reasoningDeltaBytes > 0); assert.equal(r.evidence.usage.totalTokens, null);
  assert.equal(r.evidence.delivery?.httpAttempts, 1); assert.equal(r.evidence.delivery?.authorityRenewed, false);
});
await check("Streaming never silently falls back to accepting an ordinary JSON response", async () => {
  let cancelled = false;
  const provider = NvidiaNimProvider.create({...config, responseMode: "BOUNDED_SSE", transport: async () =>
    new Response(new ReadableStream({start(c) {c.enqueue(new TextEncoder().encode("synthetic non-SSE prefix"));}, cancel() {cancelled = true;}}),
      {headers: {"content-type": "application/json"}})});
  const r = await provider.complete(request); assert.equal(r.content, null);
  assert.equal(r.evidence.failureCategory, "PROVIDER_RESPONSE_SCHEMA_ERROR"); assert.equal(r.executorAuthorityGranted, false);
  await Promise.resolve(); assert(cancelled);
});
await check("A broken socket is a transport failure, not a schema or reasoning failure", async () => {
  const provider = NvidiaNimProvider.create({...config, responseMode: "BOUNDED_SSE", transport: async () =>
    new Response(new ReadableStream({start(c) {c.error(new TypeError("synthetic connection reset"));}}),
      {headers: {"content-type": "text/event-stream"}})});
  const r = await provider.complete(request); assert.equal(r.content, null);
  assert.equal(r.evidence.failureCategory, "PROVIDER_TRANSPORT_ERROR"); assert.equal(r.evidence.statusCode, 200);
});
console.log(`OMEGA_NVIDIA_EVENT_STREAM_TEST_SUMMARY passed: ${passed}, failed: ${failed}`);
if (failed) process.exitCode = 1;
