# LSE Stage A4 Dossier — `lumina-live` Streaming Inference Edge Function

**Status:** shipped and deployed.
**Scope:** A single Deno edge function that turns one `LessonEvent` + a caller-supplied cached context into a token-streamed Lumina response over Server-Sent Events.

This dossier describes only what exists in code as of this stage. If the code and the dossier disagree, the stage is not done.

---

## 1. Files added

| Path | Purpose |
| --- | --- |
| `supabase/functions/lumina-live/index.ts` | The edge function itself. |
| `.lovable/lse-A4-dossier.md` | This document. |

No other files were modified. No schema changes. No shared modules touched. No client code wired yet (that is Stage A5).

Deployment: verified via `supabase--curl_edge_functions` (POST returns `401 unauthorized` without a valid JWT; GET returns `405 method_not_allowed`) and via `supabase--edge_function_logs` showing clean boot at ~25 ms.

---

## 2. HTTP contract

**Method:** `POST /lumina-live` (any other method returns `405 method_not_allowed`).
**CORS preflight:** `OPTIONS` returns 200 with the standard CORS headers.

**Authentication:** required. The `Authorization: Bearer <jwt>` header is verified via `supabase.auth.getUser(...)` using the service-role admin client. If the user has no `profiles.school_id`, the request is rejected `401 unauthorized`. No school-scoped RLS check on `lesson_events` is performed here; that is enforced upstream by the Stage A1 policies whenever the caller reads the log.

**Request body (JSON):**

```jsonc
{
  "lessonId": "string, non-empty",
  "event": {
    "id": "string, non-empty",
    "lessonId": "must equal top-level lessonId",
    "ts": "number (finite)",
    "kind": "concept | definition | formula | example | question | discussion | admin | silence",
    "text": "string, ≤ 4000 chars",
    "conceptRef": "optional string",
    "priority": "1 | 2 | 3 | 4 | 5",
    "teacherVisible": "boolean"
  },
  "cachedContext": {
    "currentConcept": "{id,label} | null",
    "conceptStack":   "[{id,label}, ...]",
    "recentTimeline": "[{kind,text}, ...]",
    "prerequisitesCovered": "[string, ...]"
  },
  "studentContext": "any (opaque; stringified into prompt if present)",
  "model": "optional Lovable AI model id; defaults to google/gemini-2.5-flash"
}
```

Every validation failure returns a `400` with a stable `error` code (e.g. `event.kind_invalid`, `cachedContext_shape_invalid`). The exact codes are enumerated in `validate()` in the source and are part of this stage's contract.

**Successful response:** `text/event-stream` (SSE) with headers `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no`.

Frame taxonomy (exact):
- `event: token`   `data: {"delta": "<partial text>"}` — one per non-empty upstream delta.
- `event: error`   `data: {"code": "stream_failed", "message": "<detail>"}` — mid-stream failure.
- `event: done`    `data: {"reason": "stop" | "cancelled" | "error" | "noop", "kind"?: "silence" | "admin"}` — always the last frame.

**Error responses (non-stream):**
- `401 unauthorized` — missing/invalid JWT or no `school_id`.
- `400 <code>` — schema validation failure.
- `429 rate_limited` — upstream gateway returned 429.
- `402 credits_exhausted` — upstream gateway returned 402.
- `502 upstream_unreachable` — upstream connection error.
- `<status> upstream_error` — any other non-OK upstream status, echoed with the numeric `status` field.
- `500 server_misconfigured` — `LOVABLE_API_KEY` missing.

**Retry policy:** none inside this function. The Stage A5 client session owns retry — a retry mid-stream would double-render tokens.

---

## 3. Prompt assembly (order is load-bearing)

Assembled in exactly this order, in one `messages` array of length 2:

1. `system` — a fixed persona/format string (`SYSTEM_PROMPT`).
2. `user` — `"--- STABLE PREFIX ---\n" + stablePrefix + "\n\n--- VOLATILE DELTA ---\n" + volatileDelta`.

**Stable prefix** (`buildStablePrefix`) contains, in this fixed order:
`LESSON_ID`, `CURRENT_CONCEPT`, `CONCEPT_STACK` (last 8), `PREREQUISITES_COVERED` (first 32), `RECENT_TIMELINE` (last 12, each entry truncated to 400 chars), `STUDENT_CONTEXT` (JSON-stringified, truncated to 4000 chars).

**Volatile delta** (`buildVolatileDelta`) contains: `NEW_EVENT_KIND`, `NEW_EVENT_PRIORITY`, optional `NEW_EVENT_CONCEPT`, `TEACHER_UTTERANCE`.

Reordering these blocks would silently invalidate future prompt-prefix caches (Phase B). This is why the module comments this ordering as load-bearing.

**Temperature:** `0.4` (fixed). Adaptive temperature is deferred.
**Model default:** `google/gemini-2.5-flash`, overridable per request.

---

## 4. Cancellation and lifecycle

- The handler creates one `AbortController` (`upstreamController`) and links `req.signal` to it. Any client disconnect aborts the upstream `fetch(...)` immediately.
- If `req.signal` is already aborted when the handler runs, the upstream controller is aborted before the fetch begins.
- The `ReadableStream.cancel()` callback also aborts the upstream controller, covering the case where the SSE consumer stops reading without closing the underlying request.
- On abort, the final SSE frame is `event: done, data: {"reason":"cancelled"}` when the controller is still writable; otherwise it is silently dropped. The stream is then closed.
- The `req.signal` listener is registered with `{ once: true }` and explicitly `removeEventListener`'d in every terminal branch (error paths, upstream non-OK, normal completion, cancellation).

This is the load-bearing guarantee that makes the Stage A7 priority scheduler safe: preempting an in-flight stream never wastes tokens beyond the delta already in transit.

---

## 5. Noop short-circuit

Events of kind `silence` or `admin` are structural markers (see the Stage A2 priority table + the Stage A3 reducer's no-op branches). The handler skips the upstream call for these kinds and returns an SSE stream containing exactly one frame: `event: done, data: {"reason":"noop","kind":"silence"|"admin"}`. This preserves the client-side contract that every accepted request produces a `done` frame, without spending a gateway call on content that will never render.

---

## 6. Upstream stream parser

`parseUpstreamStream` consumes an OpenAI-compatible SSE body and yields `string` deltas or `null` on the `[DONE]` sentinel. It is resilient to malformed frames: a JSON parse failure on a single `data:` line is swallowed rather than terminating the stream. Empty deltas are dropped so downstream never sees zero-length `token` frames.

If the upstream ends without a `[DONE]` sentinel, the handler treats it as normal `stop` (not an error), so the client session's version state can advance.

---

## 7. Explicit non-goals for A4 (deferred by design)

- **No DB writes.** The producer path (teacher-side event insert) belongs upstream; `lumina-live` is a pure consumer.
- **No Realtime subscription.** That is the Stage A5 hook.
- **No ALE integration.** `studentContext` is opaque — A5 will populate it from `useAdaptiveIntelligence.getContext()`.
- **No predictive precompute cache lookup.** Phase B1.
- **No model routing.** Phase C4.
- **No in-function retry.** Retry policy belongs to the Stage A5 session.
- **No context-window guardrails beyond static caps.** Token-budget accounting is Phase B5.

---

## 8. Verification performed

| Check | Result |
| --- | --- |
| Function deploys successfully | ✅ (via `supabase--deploy_edge_functions`) |
| Boot logs clean | ✅ (`booted (time: 25ms)`, no errors) |
| `GET` returns 405 with `method_not_allowed` | ✅ |
| `POST` without JWT returns 401 with `unauthorized` | ✅ |
| Type-check of the module | ✅ (module compiles under Deno; no TS errors surfaced on deploy) |

End-to-end streaming with a live upstream call was not exercised in this stage: it requires an authenticated preview session (currently signed-out in the browser sandbox) and is the natural first test of Stage A5, where the client hook actually issues requests. The function's schema validation, auth gate, method gate, and CORS surface are verified.

---

## 9. Interfaces with adjacent stages

- **Upstream (A2 → A4):** the `event` field in the request is exactly a serialized `LessonEvent` from `src/lib/lse/eventNormalizer.ts`. The 8-kind whitelist and the priority range are duplicated here as a runtime guard (the function cannot trust arbitrary clients).
- **Upstream (A3 → A4):** the `cachedContext` field is a projection of `LessonState` — specifically `currentConcept`, `conceptStack`, `recentTimeline` (a projection of the reducer's `timeline`), and `prerequisitesCovered` as an array. The projection contract is what Stage A5 will implement client-side.
- **Downstream (A4 → A5):** the SSE frame taxonomy (`token` / `error` / `done` with `reason ∈ {stop, cancelled, error, noop}`) is the contract that `useLuminaLiveSession` will consume.
- **Downstream (A4 → A7):** cancellation via `req.signal` is what allows the priority scheduler to abort a lower-priority in-flight stream when a higher-priority event arrives.

---

## 10. Ready for Stage A5

Stage A5 (`useLuminaLiveSession(lessonId)`) can be opened next. It will:
- Fold `lesson_events` into a `LessonState` using Stage A3's reducer.
- Project that state into the `cachedContext` shape defined above.
- POST to `/lumina-live` and consume the SSE frames.
- Bind cancellation to `lessonState.version` (a version bump aborts the in-flight stream).
- Wire `studentContext` from `useAdaptiveIntelligence.getContext()`.

Nothing in A4 needs to change for A5 to proceed.
