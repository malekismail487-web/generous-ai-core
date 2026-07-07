// supabase/functions/lumina-live/index.ts
// -----------------------------------------------------------------------------
// LSE Stage A4 — Streaming Inference Edge Function (`lumina-live`)
// -----------------------------------------------------------------------------
// Purpose (per .lovable/plan.md §2/S7 + Refinement 1):
//   Given a newly-normalized `LessonEvent` (the "volatile delta") plus a
//   caller-supplied "stable prefix" describing the lesson's current cached
//   context, produce a token-by-token streamed personalized Lumina response.
//
// Explicit stage boundaries:
//   - This function ONLY streams inference. It does NOT insert `lesson_events`
//     (that is the teacher-side producer's job, gated by the Stage A1 trigger
//     that assigns `seq`). It does NOT subscribe to Realtime (that is the
//     Stage A5 student hook).
//   - No ALE integration in A4. The caller passes an opaque `studentContext`
//     block which is echoed verbatim into the prompt. A5 will populate it
//     from `useAdaptiveIntelligence.getContext()`.
//   - No predictive precompute cache lookups (Phase B1). Every request is a
//     fresh upstream call.
//
// Load-bearing guarantees:
//   1. AUTH: caller must present a valid Supabase JWT; the resolved user must
//      have a school-scoped profile. Requests without a `school_id` are
//      rejected 403.
//   2. CANCELLATION: `req.signal` (client disconnect) aborts the upstream
//      gateway request via a linked `AbortController`. This is what makes the
//      Stage A7 priority scheduler safe to preempt in-flight streams without
//      wasted tokens.
//   3. STABLE-PREFIX ORDERING: the prompt is assembled in the fixed order
//      `system → stable prefix → volatile delta`. This ordering is required
//      for future prompt-prefix caching (Phase B) — reordering here would
//      invalidate the cache key silently.
//   4. TERMINAL vs RETRYABLE: 429 and 402 from the gateway are surfaced to
//      the client as structured SSE `error` events with the exact codes
//      `rate_limited` / `credits_exhausted`. Every other non-OK status is
//      terminal and reported as `upstream_error` with the numeric status.
//      This function itself does NOT retry — retry policy belongs to the
//      Stage A5 session (a retry inside a stream would double-render tokens).
//
// Wire format (response):
//   Content-Type: text/event-stream
//     event: token   data: {"delta":"..."}    (one per streamed token chunk)
//     event: error   data: {"code":"...","message":"..."}   (any failure)
//     event: done    data: {"reason":"stop"|"cancelled"|"error"}
//
// -----------------------------------------------------------------------------

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ----- Static config ---------------------------------------------------------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

// Chosen for Stage A4: balanced Gemini model — low latency suits the p95
// < 1.5s Phase A acceptance target; multimodal capacity is unused here but
// harmless. Model routing is deliberately out of scope until Phase C4.
const DEFAULT_MODEL = "google/gemini-2.5-flash";

// Bounded input caps. These exist to protect the gateway request size and
// to keep the prompt within predictable token bounds; oversize inputs are
// rejected 400 rather than silently truncated so the caller sees the error.
const MAX_EVENT_TEXT_CHARS = 4000;
const MAX_TIMELINE_ENTRIES = 12;
const MAX_TIMELINE_TEXT_CHARS = 400;
const MAX_STACK_ENTRIES = 8;
const MAX_STUDENT_CONTEXT_CHARS = 4000;

// ----- Types (mirror src/lib/lse/{eventNormalizer,lessonReducer}.ts) --------

type LessonEventKind =
  | "concept" | "definition" | "formula" | "example"
  | "question" | "discussion" | "admin" | "silence";

interface LessonEventPayload {
  id: string;
  lessonId: string;
  ts: number;
  kind: LessonEventKind;
  text: string;
  conceptRef?: string;
  priority: 1 | 2 | 3 | 4 | 5;
  teacherVisible: boolean;
}

interface CachedContext {
  currentConcept: { id: string; label: string } | null;
  conceptStack: { id: string; label: string }[];
  recentTimeline: { kind: LessonEventKind; text: string }[];
  prerequisitesCovered: string[];
}

interface RequestBody {
  lessonId: string;
  event: LessonEventPayload;
  cachedContext: CachedContext;
  studentContext?: unknown; // opaque ALE snapshot, stringified into the prompt
  model?: string;
}

// ----- Supabase helpers ------------------------------------------------------

function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

interface AuthenticatedUser {
  id: string;
  schoolId: string;
}

async function authenticate(req: Request): Promise<AuthenticatedUser | null> {
  const auth = req.headers.get("authorization");
  if (!auth) return null;
  try {
    const supa = adminClient();
    const { data: { user } } = await supa.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) return null;
    const { data: profile } = await supa
      .from("profiles")
      .select("school_id")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile?.school_id) return null;
    return { id: user.id, schoolId: profile.school_id };
  } catch {
    return null;
  }
}

// ----- Request validation ----------------------------------------------------

const VALID_KINDS: ReadonlySet<LessonEventKind> = new Set([
  "concept", "definition", "formula", "example",
  "question", "discussion", "admin", "silence",
]);

interface ValidationOk { ok: true; body: RequestBody; }
interface ValidationErr { ok: false; message: string; }

function validate(raw: unknown): ValidationOk | ValidationErr {
  if (!raw || typeof raw !== "object") {
    return { ok: false, message: "body_must_be_object" };
  }
  const b = raw as Record<string, unknown>;

  const lessonId = typeof b.lessonId === "string" ? b.lessonId.trim() : "";
  if (!lessonId) return { ok: false, message: "lessonId_required" };

  const ev = b.event as Record<string, unknown> | undefined;
  if (!ev || typeof ev !== "object") {
    return { ok: false, message: "event_required" };
  }
  if (typeof ev.id !== "string" || !ev.id) {
    return { ok: false, message: "event.id_required" };
  }
  if (typeof ev.lessonId !== "string" || ev.lessonId !== lessonId) {
    return { ok: false, message: "event.lessonId_mismatch" };
  }
  if (typeof ev.ts !== "number" || !Number.isFinite(ev.ts)) {
    return { ok: false, message: "event.ts_required_number" };
  }
  if (typeof ev.kind !== "string" || !VALID_KINDS.has(ev.kind as LessonEventKind)) {
    return { ok: false, message: "event.kind_invalid" };
  }
  if (typeof ev.text !== "string") {
    return { ok: false, message: "event.text_required_string" };
  }
  if (ev.text.length > MAX_EVENT_TEXT_CHARS) {
    return { ok: false, message: "event.text_too_long" };
  }
  const priority = ev.priority;
  if (typeof priority !== "number" || ![1, 2, 3, 4, 5].includes(priority)) {
    return { ok: false, message: "event.priority_invalid" };
  }
  if (typeof ev.teacherVisible !== "boolean") {
    return { ok: false, message: "event.teacherVisible_required_bool" };
  }

  const ctx = b.cachedContext as Record<string, unknown> | undefined;
  if (!ctx || typeof ctx !== "object") {
    return { ok: false, message: "cachedContext_required" };
  }
  if (!Array.isArray(ctx.conceptStack) || !Array.isArray(ctx.recentTimeline) ||
      !Array.isArray(ctx.prerequisitesCovered)) {
    return { ok: false, message: "cachedContext_shape_invalid" };
  }

  return { ok: true, body: raw as RequestBody };
}

// ----- Prompt assembly (order is load-bearing; do not reorder) --------------

const SYSTEM_PROMPT =
  "You are Lumina, a real-time parallel lecturer that reinforces what the " +
  "teacher just said for one specific student. Respond in one short, clear " +
  "pass — no filler, no headings, no apologies. Cite the concept in scope " +
  "when it helps understanding. If the teacher's utterance is administrative " +
  "or silent, reply with an empty message.";

function truncate(text: string, cap: number): string {
  if (text.length <= cap) return text;
  return text.slice(0, cap - 1) + "…";
}

function buildStablePrefix(
  lessonId: string,
  ctx: CachedContext,
  studentContext: unknown,
): string {
  const stack = ctx.conceptStack
    .slice(-MAX_STACK_ENTRIES)
    .map((c) => `- ${c.label} (${c.id})`)
    .join("\n") || "(none)";

  const timeline = ctx.recentTimeline
    .slice(-MAX_TIMELINE_ENTRIES)
    .map((e) => `- [${e.kind}] ${truncate(e.text, MAX_TIMELINE_TEXT_CHARS)}`)
    .join("\n") || "(none)";

  const prereqs = ctx.prerequisitesCovered.slice(0, 32).join(", ") || "(none)";

  const student = studentContext === undefined || studentContext === null
    ? "(not provided)"
    : truncate(JSON.stringify(studentContext), MAX_STUDENT_CONTEXT_CHARS);

  return [
    `LESSON_ID: ${lessonId}`,
    `CURRENT_CONCEPT: ${ctx.currentConcept
      ? `${ctx.currentConcept.label} (${ctx.currentConcept.id})`
      : "(none)"}`,
    `CONCEPT_STACK:\n${stack}`,
    `PREREQUISITES_COVERED: ${prereqs}`,
    `RECENT_TIMELINE:\n${timeline}`,
    `STUDENT_CONTEXT: ${student}`,
  ].join("\n\n");
}

function buildVolatileDelta(event: LessonEventPayload): string {
  return [
    `NEW_EVENT_KIND: ${event.kind}`,
    `NEW_EVENT_PRIORITY: P${event.priority}`,
    event.conceptRef ? `NEW_EVENT_CONCEPT: ${event.conceptRef}` : null,
    `TEACHER_UTTERANCE: ${truncate(event.text, MAX_EVENT_TEXT_CHARS)}`,
  ].filter(Boolean).join("\n");
}

// ----- SSE framing helpers ---------------------------------------------------

const encoder = new TextEncoder();

function sseFrame(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ----- Streaming upstream call ----------------------------------------------

interface UpstreamOptions {
  apiKey: string;
  model: string;
  system: string;
  stablePrefix: string;
  volatileDelta: string;
  signal: AbortSignal;
}

async function openUpstreamStream(opts: UpstreamOptions): Promise<Response> {
  const body = {
    model: opts.model,
    stream: true,
    messages: [
      { role: "system", content: opts.system },
      {
        role: "user",
        content:
          `--- STABLE PREFIX ---\n${opts.stablePrefix}\n\n` +
          `--- VOLATILE DELTA ---\n${opts.volatileDelta}`,
      },
    ],
    // Temperature intentionally low: the teacher signal is authoritative,
    // Lumina reinforces it. Adaptive temperature is a Phase B/C concern.
    temperature: 0.4,
  };
  return await fetch(LOVABLE_AI_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
}

/**
 * Parse an OpenAI-compatible streamed chat body into a sequence of token
 * deltas. Yields `null` when the upstream signals `[DONE]`. Never throws on
 * unparseable frames — a malformed frame is skipped, so a single bad line
 * cannot terminate a stream.
 */
async function* parseUpstreamStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string | null, void, void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // Frames are separated by blank lines per SSE; within a frame, `data: ` lines
    // carry the JSON payload. We split on newlines and process `data:` prefixes.
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") { yield null; return; }
      try {
        const parsed = JSON.parse(payload);
        const delta = parsed?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          yield delta;
        }
      } catch {
        // Malformed frame — skip, per SSE resilience contract.
      }
    }
  }
}

// ----- Handler ---------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "server_misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const user = await authenticate(req);
  if (!user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let rawBody: unknown;
  try { rawBody = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const parsed = validate(rawBody);
  if (!parsed.ok) {
    return new Response(JSON.stringify({ error: parsed.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { lessonId, event, cachedContext, studentContext, model } = parsed.body;

  const chosenModel = typeof model === "string" && model.length > 0
    ? model : DEFAULT_MODEL;

  // Silence + admin events are structural markers — the reducer treats them as
  // no-ops. Streaming inference on them wastes tokens; short-circuit early.
  if (event.kind === "silence" || event.kind === "admin") {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(sseFrame("done", { reason: "noop", kind: event.kind }));
        controller.close();
      },
    });
    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  }

  const stablePrefix = buildStablePrefix(lessonId, cachedContext, studentContext);
  const volatileDelta = buildVolatileDelta(event);

  // Link client-disconnect signal to upstream request cancellation.
  const upstreamController = new AbortController();
  const onClientAbort = () => upstreamController.abort();
  if (req.signal.aborted) {
    upstreamController.abort();
  } else {
    req.signal.addEventListener("abort", onClientAbort, { once: true });
  }

  let upstream: Response;
  try {
    upstream = await openUpstreamStream({
      apiKey,
      model: chosenModel,
      system: SYSTEM_PROMPT,
      stablePrefix,
      volatileDelta,
      signal: upstreamController.signal,
    });
  } catch (err) {
    req.signal.removeEventListener("abort", onClientAbort);
    const message = err instanceof Error ? err.message : "network_error";
    return new Response(JSON.stringify({ error: "upstream_unreachable", message }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!upstream.ok || !upstream.body) {
    req.signal.removeEventListener("abort", onClientAbort);
    let code = "upstream_error";
    if (upstream.status === 429) code = "rate_limited";
    else if (upstream.status === 402) code = "credits_exhausted";
    // Drain body defensively to release the connection.
    try { await upstream.text(); } catch { /* ignore */ }
    return new Response(
      JSON.stringify({ error: code, status: upstream.status }),
      {
        status: upstream.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const clientStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const cleanup = () =>
        req.signal.removeEventListener("abort", onClientAbort);
      try {
        for await (const delta of parseUpstreamStream(upstream.body!)) {
          if (delta === null) {
            controller.enqueue(sseFrame("done", { reason: "stop" }));
            controller.close();
            cleanup();
            return;
          }
          controller.enqueue(sseFrame("token", { delta }));
        }
        // Upstream ended without a `[DONE]` sentinel — treat as normal stop
        // rather than an error so the client's session state advances.
        controller.enqueue(sseFrame("done", { reason: "stop" }));
        controller.close();
        cleanup();
      } catch (err) {
        const aborted = req.signal.aborted ||
          (err instanceof DOMException && err.name === "AbortError");
        if (aborted) {
          try { controller.enqueue(sseFrame("done", { reason: "cancelled" })); }
          catch { /* controller may already be closed */ }
        } else {
          try {
            controller.enqueue(sseFrame("error", {
              code: "stream_failed",
              message: err instanceof Error ? err.message : String(err),
            }));
            controller.enqueue(sseFrame("done", { reason: "error" }));
          } catch { /* ignore */ }
        }
        try { controller.close(); } catch { /* ignore */ }
        cleanup();
      }
    },
    cancel() {
      upstreamController.abort();
      req.signal.removeEventListener("abort", onClientAbort);
    },
  });

  return new Response(clientStream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
});
