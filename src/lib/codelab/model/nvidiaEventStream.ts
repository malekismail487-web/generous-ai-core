/** Delivery parsing only, not cognition, authorization, JSON repair or a grader.
 * Reasoning deltas are counted then discarded; partial public content is never
 * returned as a completion. All reads remain inside the caller's abort domain. */
export const NVIDIA_STREAM_LIMITS = Object.freeze({wireBytes: 8 * 1024 * 1024,
  eventBytes: 262144, contentBytes: 262144, events: 65536, chunks: 131072, consecutiveEmptyChunks: 32});
export interface NvidiaStreamDiagnostics {
  mode: "BOUNDED_SSE"; scope: "LAST_HTTP_ATTEMPT_ONLY";
  timingOrigin: "RESPONSE_HEADERS_RECEIVED_NOT_DISPATCH";
  wireBytes: number; chunks: number; events: number; reasoningDeltaBytes: number; contentDeltaBytes: number;
  firstEventAfterMs: number | null; firstReasoningAfterMs: number | null; firstContentAfterMs: number | null;
  lastEventAfterMs: number | null; usageReceived: boolean;
  reportedUsage: {promptTokens: number | null; completionTokens: number | null; totalTokens: number | null};
  failureCode: string | null; providerErrorStatusCode: number | null;
  terminal: "PENDING" | "DONE" | "INCOMPLETE" | "MALFORMED" | "LIMIT_EXCEEDED" | "ABORTED" | "PROVIDER_ERROR";
}
export function newNvidiaStreamDiagnostics(): NvidiaStreamDiagnostics {
  return {mode: "BOUNDED_SSE", scope: "LAST_HTTP_ATTEMPT_ONLY", timingOrigin: "RESPONSE_HEADERS_RECEIVED_NOT_DISPATCH",
    wireBytes: 0, chunks: 0, events: 0,
    reasoningDeltaBytes: 0, contentDeltaBytes: 0, firstEventAfterMs: null, firstReasoningAfterMs: null,
    firstContentAfterMs: null, lastEventAfterMs: null, usageReceived: false,
    reportedUsage: {promptTokens: null, completionTokens: null, totalTokens: null},
    failureCode: null, providerErrorStatusCode: null, terminal: "PENDING"};
}
const record = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const finishReasons = new Set(["stop", "length", "content_filter", "tool_calls", "function_call"]);
const finite = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

export async function readNvidiaEventStream(response: Response, signal: AbortSignal,
  stats: NvidiaStreamDiagnostics, now: () => number = Date.now) {
  const began = now();
  const fail = (state: "MALFORMED" | "LIMIT_EXCEEDED", code: string): never => {
    stats.terminal = state; stats.failureCode = code; throw Error(code);
  };
  if (response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "text/event-stream" || !response.body) {
    try { void response.body?.cancel().catch(() => undefined); } catch { /* best effort */ }
    fail("MALFORMED", "nvidia_stream_media_type_invalid");
  }
  const reader = response.body!.getReader(), decoder = new TextDecoder("utf-8", {fatal: true});
  let pending = "", event = "", content = "", terminal: string | null = null, done = false, emptyChunks = 0;
  let usage: {prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown} | undefined;
  const elapsed = () => Math.max(0, now() - began);
  const consumeEvent = () => {
    if (!event) return;
    const data = event.slice(0, -1); event = "";
    if (++stats.events > NVIDIA_STREAM_LIMITS.events) fail("LIMIT_EXCEEDED", "nvidia_stream_event_limit");
    stats.firstEventAfterMs ??= elapsed(); stats.lastEventAfterMs = elapsed();
    if (data === "[DONE]") {
      if (terminal === null) fail("MALFORMED", "nvidia_stream_missing_finish_reason");
      done = true; stats.terminal = "DONE"; return;
    }
    let raw: unknown;
    try { raw = JSON.parse(data); } catch { fail("MALFORMED", "nvidia_stream_event_not_json"); }
    const frame = record(raw);
    if (frame && "error" in frame) {
      const error = record(frame.error), code = error?.code ?? error?.status_code;
      // Only a numeric status is retained, never a provider message or a model
      // delta. A JSON-looking string inside delta.content is NOT this envelope.
      const status = typeof code === "number" ? code : typeof code === "string" && /^[45][0-9]{2}$/.test(code) ? Number(code) : null;
      stats.providerErrorStatusCode = Number.isSafeInteger(status) && status! >= 400 && status! <= 599 ? status : null;
      stats.terminal = "PROVIDER_ERROR"; stats.failureCode = "nvidia_stream_provider_error";
      throw Error("nvidia_stream_provider_error");
    }
    if (!frame || !Array.isArray(frame.choices) || frame.choices.length > 1)
      fail("MALFORMED", "nvidia_stream_event_shape_invalid");
    if (frame!.usage !== undefined && frame!.usage !== null) {
      const value = record(frame!.usage);
      if (!value || usage !== undefined) fail("MALFORMED", "nvidia_stream_usage_invalid");
      usage = value!;
      stats.usageReceived = [usage.prompt_tokens, usage.completion_tokens, usage.total_tokens].every(finite);
      stats.reportedUsage = {promptTokens: finite(usage.prompt_tokens) ? usage.prompt_tokens as number : null,
        completionTokens: finite(usage.completion_tokens) ? usage.completion_tokens as number : null,
        totalTokens: finite(usage.total_tokens) ? usage.total_tokens as number : null};
    }
    const choices = frame!.choices as unknown[];
    if (choices.length === 0) {
      if (frame!.usage === undefined || frame!.usage === null) fail("MALFORMED", "nvidia_stream_empty_event");
      return;
    }
    const choice = record(choices[0]), delta = record(choice?.delta);
    if (!choice || choice.index !== 0 || !delta || terminal !== null
      || delta.role !== undefined && delta.role !== "assistant"
      || delta.tool_calls !== undefined || delta.function_call !== undefined)
      fail("MALFORMED", "nvidia_stream_choice_invalid");
    for (const key of ["content", "reasoning_content"] as const) {
      const text = delta![key];
      if (text === undefined || text === null) continue;
      if (typeof text !== "string") fail("MALFORMED", "nvidia_stream_delta_invalid");
      const bytes = Buffer.byteLength(text as string, "utf8");
      if (key === "reasoning_content") {
        stats.reasoningDeltaBytes += bytes;
        if (bytes) stats.firstReasoningAfterMs ??= elapsed();
      } else {
        stats.contentDeltaBytes += bytes;
        if (stats.contentDeltaBytes > NVIDIA_STREAM_LIMITS.contentBytes) fail("LIMIT_EXCEEDED", "nvidia_stream_content_limit");
        content += text;
        if (bytes) stats.firstContentAfterMs ??= elapsed();
      }
    }
    if (choice!.finish_reason !== undefined && choice!.finish_reason !== null) {
      if (typeof choice!.finish_reason !== "string" || !finishReasons.has(choice!.finish_reason))
        fail("MALFORMED", "nvidia_stream_finish_reason_invalid");
      terminal = choice!.finish_reason as string;
    }
  };
  const read = () => new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
    const abort = () => { cleanup(); reject(new DOMException("Aborted", "AbortError")); };
    const cleanup = () => signal.removeEventListener("abort", abort);
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, {once: true});
    reader.read().then(value => {cleanup(); resolve(value);}, error => {cleanup(); reject(error);});
  });
  try {
    while (!done) {
      signal.throwIfAborted();
      const chunk = await read();
      if (chunk.done) break;
      if (++stats.chunks > NVIDIA_STREAM_LIMITS.chunks) fail("LIMIT_EXCEEDED", "nvidia_stream_chunk_limit");
      emptyChunks = chunk.value.byteLength ? 0 : emptyChunks + 1;
      if (emptyChunks > NVIDIA_STREAM_LIMITS.consecutiveEmptyChunks) fail("LIMIT_EXCEEDED", "nvidia_stream_empty_chunk_limit");
      stats.wireBytes += chunk.value.byteLength;
      if (stats.wireBytes > NVIDIA_STREAM_LIMITS.wireBytes) fail("LIMIT_EXCEEDED", "nvidia_stream_wire_limit");
      try { pending += decoder.decode(chunk.value, {stream: true}); }
      catch { fail("MALFORMED", "nvidia_stream_utf8_invalid"); }
      let index: number;
      while ((index = pending.indexOf("\n")) >= 0 && !done) {
        let line = pending.slice(0, index); pending = pending.slice(index + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line === "") consumeEvent();
        else if (line.startsWith("data:")) event += line.slice(5).replace(/^ /, "") + "\n";
        else if (!line.startsWith(":")) fail("MALFORMED", "nvidia_stream_field_invalid");
        if (Buffer.byteLength(event, "utf8") > NVIDIA_STREAM_LIMITS.eventBytes) fail("LIMIT_EXCEEDED", "nvidia_stream_frame_limit");
      }
      if (Buffer.byteLength(pending, "utf8") > NVIDIA_STREAM_LIMITS.eventBytes) fail("LIMIT_EXCEEDED", "nvidia_stream_frame_limit");
      if (done && pending.trim()) fail("MALFORMED", "nvidia_stream_data_after_done");
    }
    if (!done) { stats.terminal = "INCOMPLETE"; stats.failureCode = "nvidia_stream_incomplete"; throw Error("nvidia_stream_incomplete"); }
    try { if (decoder.decode().trim()) fail("MALFORMED", "nvidia_stream_data_after_done"); }
    catch { fail("MALFORMED", "nvidia_stream_utf8_invalid"); }
    signal.throwIfAborted();
    return {choices: [{message: {content}, finish_reason: terminal}], usage};
  } finally {
    if (signal.aborted) stats.terminal = "ABORTED";
    else if (stats.terminal === "PENDING") stats.terminal = "INCOMPLETE";
    // Never wait for a broken server's cancellation acknowledgment.
    try { void reader.cancel().catch(() => undefined); } catch { /* best effort */ }
    try { reader.releaseLock(); } catch { /* cancellation may still be settling */ }
  }
}
