/**
 * LSE — Session Internals (Stage A5)
 * ----------------------------------
 * Pure, side-effect-free helpers consumed by `useLuminaLiveSession`. They
 * are extracted from the hook so that:
 *   1. They can be exercised by a Deno/Bun test harness without a React
 *      test runtime (mirrors the A2/A3 style).
 *   2. The hook itself stays focused on lifecycle and orchestration; every
 *      transformation is deterministic and reviewable in isolation.
 *
 * Nothing here reads from `Date`, `Math.random`, `window`, or the network.
 * Every input is explicit.
 */

import type { LessonEvent } from "./eventNormalizer";
import type {
  LessonEventKind,
  LessonEventPriority,
} from "./priorityTable";
import type { LessonState } from "./lessonReducer";

// ---------------------------------------------------------------------------
// 1. Broadcast payload → LessonEvent
// ---------------------------------------------------------------------------

/**
 * Shape emitted by the Stage A1 broadcast trigger
 * (`realtime.send(jsonb_build_object(...), 'lesson_event', 'lesson:<uuid>')`).
 *
 * The payload intentionally omits `id`, `teacher_id`, `school_id`, and
 * `created_at` — those live in `public.lesson_events` for audit and are
 * recoverable via a durable read.
 */
export interface LessonEventBroadcastPayload {
  seq: number;
  kind: LessonEventKind;
  priority: LessonEventPriority;
  teacher_visible: boolean;
  concept_ref: string | null;
  text: string;
  /** ISO-8601 timestamp string as produced by `to_jsonb(timestamptz)`. */
  ts: string;
}

const VALID_KINDS: ReadonlySet<LessonEventKind> = new Set<LessonEventKind>([
  "concept", "definition", "formula", "example",
  "question", "discussion", "admin", "silence",
]);

/**
 * Rehydrate a broadcast payload into the exact `LessonEvent` shape produced
 * by the Stage A2 normalizer.
 *
 * The `id` is derived deterministically from `(lessonId, seq)` so that:
 *   - Re-subscribing and re-folding the same events yields identical state
 *     (associativity guarantee from Stage A3).
 *   - The client can dedupe by id if the same broadcast is delivered twice
 *     (Realtime does not guarantee exactly-once).
 *
 * Returns `null` for structurally invalid payloads rather than throwing —
 * a malformed frame must not tear down the subscription.
 */
export function payloadToLessonEvent(
  lessonId: string,
  raw: unknown,
): LessonEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<LessonEventBroadcastPayload>;

  if (typeof p.seq !== "number" || !Number.isFinite(p.seq) || p.seq < 1) return null;
  if (typeof p.kind !== "string" || !VALID_KINDS.has(p.kind as LessonEventKind)) return null;
  if (typeof p.priority !== "number" || ![1, 2, 3, 4, 5].includes(p.priority)) return null;
  if (typeof p.teacher_visible !== "boolean") return null;
  if (typeof p.text !== "string") return null;
  if (typeof p.ts !== "string") return null;

  const tsMs = Date.parse(p.ts);
  if (!Number.isFinite(tsMs)) return null;

  const conceptRef =
    typeof p.concept_ref === "string" && p.concept_ref.length > 0
      ? p.concept_ref
      : undefined;

  return {
    id: `${lessonId}#${p.seq}`,
    lessonId,
    ts: tsMs,
    kind: p.kind as LessonEventKind,
    text: p.text,
    conceptRef,
    priority: p.priority as LessonEventPriority,
    teacherVisible: p.teacher_visible,
  };
}

// ---------------------------------------------------------------------------
// 2. LessonState → cachedContext projection
// ---------------------------------------------------------------------------

/**
 * The exact shape `POST /lumina-live` expects under `cachedContext`. Kept in
 * this module so the projection is the single source of truth on the client;
 * the edge function's validator is the single source of truth on the server.
 */
export interface CachedContextProjection {
  currentConcept: { id: string; label: string } | null;
  conceptStack: { id: string; label: string }[];
  recentTimeline: { kind: LessonEventKind; text: string }[];
  prerequisitesCovered: string[];
}

/**
 * Projection caps. These mirror — but are intentionally more conservative
 * than — the server-side caps in `supabase/functions/lumina-live/index.ts`.
 * The server rejects oversize payloads; the client trims first so the
 * happy path never bounces off validation.
 */
export const PROJECTION_LIMITS = Object.freeze({
  stack: 8,
  timeline: 12,
  timelineTextChars: 400,
  prereqs: 32,
});

function truncate(text: string, cap: number): string {
  return text.length <= cap ? text : text.slice(0, cap - 1) + "…";
}

/**
 * Project a `LessonState` (from the Stage A3 reducer) into the request-body
 * shape the edge function consumes. Pure; produces stable outputs for
 * structurally-equal inputs so the projection can be memoized upstream.
 */
export function projectCachedContext(state: LessonState): CachedContextProjection {
  return {
    currentConcept: state.currentConcept
      ? { id: state.currentConcept.id, label: state.currentConcept.label }
      : null,
    conceptStack: state.conceptStack
      .slice(-PROJECTION_LIMITS.stack)
      .map((c) => ({ id: c.id, label: c.label })),
    recentTimeline: state.timeline
      .slice(-PROJECTION_LIMITS.timeline)
      .map((e) => ({
        kind: e.kind,
        text: truncate(e.text, PROJECTION_LIMITS.timelineTextChars),
      })),
    prerequisitesCovered: Array.from(state.prerequisitesCovered).slice(
      0,
      PROJECTION_LIMITS.prereqs,
    ),
  };
}

// ---------------------------------------------------------------------------
// 3. SSE frame parser
// ---------------------------------------------------------------------------

/**
 * The set of `event:` names emitted by `lumina-live`. Enumerated for
 * exhaustiveness so a new server-side frame kind surfaces as a TypeScript
 * error at the switch site in the hook.
 */
export type SseFrameKind = "token" | "error" | "done";

export interface SseFrame {
  event: SseFrameKind;
  data: unknown;
}

/**
 * Consume a `ReadableStream` of UTF-8 bytes carrying SSE frames and yield
 * one `SseFrame` per complete frame. Resilient to:
 *   - Multi-line frames split across chunk boundaries.
 *   - Unknown `event:` names (skipped, so future server additions are
 *     forward-compatible without a client update).
 *   - Malformed JSON in `data:` (skipped, matching the server's own
 *     resilience contract in `parseUpstreamStream`).
 *
 * Frame separator is a blank line (`\n\n` or `\r\n\r\n`), per the SSE spec.
 */
export async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<SseFrame, void, void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Normalize CRLF so a single split character works.
      buffer = buffer.replace(/\r\n/g, "\n");

      let sepIdx: number;
      while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
        const rawFrame = buffer.slice(0, sepIdx);
        buffer = buffer.slice(sepIdx + 2);
        const frame = parseSingleFrame(rawFrame);
        if (frame) yield frame;
      }
    }
    // Flush a trailing frame that lacks the final blank line.
    if (buffer.trim().length > 0) {
      const frame = parseSingleFrame(buffer);
      if (frame) yield frame;
    }
  } finally {
    // Release the underlying reader lock on any exit path (including caller
    // early-return via `break` in a `for await` loop).
    try { reader.releaseLock(); } catch { /* already released */ }
  }
}

const VALID_FRAME_KINDS: ReadonlySet<SseFrameKind> = new Set<SseFrameKind>([
  "token", "error", "done",
]);

function parseSingleFrame(raw: string): SseFrame | null {
  let event: string | null = null;
  let dataPayload: string | null = null;
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      // Concatenate multi-line data per SSE spec.
      const chunk = line.slice(5).trim();
      dataPayload = dataPayload === null ? chunk : dataPayload + "\n" + chunk;
    }
    // Silently ignore comments (`:`) and unknown fields (`id:`, `retry:`).
  }
  if (!event || !VALID_FRAME_KINDS.has(event as SseFrameKind)) return null;
  if (dataPayload === null) return null;
  try {
    return { event: event as SseFrameKind, data: JSON.parse(dataPayload) };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 4. In-order delivery (dedup + gap tracking)
// ---------------------------------------------------------------------------

/**
 * Realtime does not guarantee exactly-once or in-order delivery. Since the
 * Stage A3 reducer trusts its input order (its caller owns canonical
 * ordering), the hook must not fold an out-of-order or duplicate event.
 *
 * This helper is a tiny state machine keyed on the last `seq` folded. It
 * accepts a new event iff its underlying seq is exactly `lastSeq + 1`,
 * rejecting duplicates (`<= lastSeq`) and gaps (`> lastSeq + 1`). Gap
 * recovery (durable replay from `public.lesson_events` by `seq`) is a
 * Stage B3 concern; A5 surfaces the gap so callers can trigger recovery.
 */
export interface OrderedIntakeResult {
  accepted: boolean;
  reason: "ok" | "duplicate" | "gap" | "invalid";
  seq: number | null;
  expectedNext: number;
}

export function seqFromEventId(eventId: string): number | null {
  const hash = eventId.lastIndexOf("#");
  if (hash < 0) return null;
  const parsed = Number(eventId.slice(hash + 1));
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : null;
}

export function classifyIntake(
  event: LessonEvent,
  lastSeq: number,
): OrderedIntakeResult {
  const seq = seqFromEventId(event.id);
  if (seq === null) {
    return { accepted: false, reason: "invalid", seq: null, expectedNext: lastSeq + 1 };
  }
  if (seq <= lastSeq) {
    return { accepted: false, reason: "duplicate", seq, expectedNext: lastSeq + 1 };
  }
  if (seq !== lastSeq + 1) {
    return { accepted: false, reason: "gap", seq, expectedNext: lastSeq + 1 };
  }
  return { accepted: true, reason: "ok", seq, expectedNext: seq + 1 };
}
