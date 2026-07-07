# LSE Stage A5 Dossier — `useLuminaLiveSession` + Realtime Authorization

**Status:** shipped.
**Scope:** the student-side lifecycle hook, its pure supporting helpers, and the Realtime private-channel authorization policy paired with it (deferred from Stage A1 per that dossier). Nothing about priority scheduling (A7), server-side context cache (A6), or predictive precompute (B1) is touched.

Everything described here is present in code and verified. If code and dossier disagree, the stage is not done.

---

## 1. Files added / modified

| Path | Kind | Purpose |
| --- | --- | --- |
| `supabase/migrations/…_lse_a5_realtime_rls.sql` | migration | RLS policy authorizing subscribers to `lesson:<uuid>` broadcast channels. |
| `src/lib/lse/sessionInternals.ts` | new | Pure helpers: broadcast-payload rehydration, cached-context projection, SSE parser, ordered-intake gate. |
| `src/hooks/useLuminaLiveSession.tsx` | new | The lifecycle hook itself. |
| `scripts/lseSessionInternals.test.ts` | new | 45-assertion test harness. |
| `.lovable/lse-A5-dossier.md` | new | This document. |

No changes to `src/integrations/supabase/*`. No changes to any existing edge function. No changes to Stage A1–A4 files.

---

## 2. Realtime authorization

The A1 broadcast trigger calls `realtime.send(payload, 'lesson_event', 'lesson:<uuid>', TRUE)`. The `TRUE` flag marks the channel private, which means Realtime enforces `SELECT` RLS on `realtime.messages` before delivering any frame to a subscriber.

The migration installs exactly one policy:

```sql
CREATE POLICY "LSE lesson channel authenticated read"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() LIKE 'lesson:%'
  AND (
    -- 1. Student enrolled in the lesson session.
    EXISTS (SELECT 1 FROM public.lesson_sessions ls
             WHERE ls.lesson_id::text = substring(realtime.topic() FROM 8)
               AND ls.student_id = (SELECT auth.uid()))
    OR
    -- 2. Teacher who has authored at least one event for this lesson.
    EXISTS (SELECT 1 FROM public.lesson_events le
             WHERE le.lesson_id::text = substring(realtime.topic() FROM 8)
               AND le.teacher_id = (SELECT auth.uid()))
    OR
    -- 3. School administrator whose school owns the lesson.
    (public.has_role((SELECT auth.uid()), 'admin'::app_role)
     AND EXISTS (SELECT 1 FROM public.lesson_events le
                  JOIN public.profiles p ON p.id = (SELECT auth.uid())
                  WHERE le.lesson_id::text = substring(realtime.topic() FROM 8)
                    AND le.school_id = p.school_id))
  )
);
```

Notes:

- `substring(realtime.topic() FROM 8)` strips the literal prefix `lesson:` (7 chars) and leaves the UUID as text. The comparison uses `::text` on both sides to avoid an implicit cast in the sub-query.
- All three `auth.uid()` calls are wrapped in `(SELECT ...)` so PostgreSQL evaluates them once per policy invocation — the standard Supabase recipe for RLS on hot channels.
- The policy is deliberately narrow: any topic that does not start with `lesson:` falls through and is unaffected by this migration.
- The migration is idempotent (`DROP POLICY IF EXISTS` first) and can be re-run safely.
- A `COMMENT` is attached to the policy explaining the three allowed relationships.

The 139 linter warnings reported after the migration are the pre-existing project-wide issues also seen after Stage A1; none are introduced by this migration.

---

## 3. Pure helpers (`src/lib/lse/sessionInternals.ts`)

All four helpers are total, deterministic, and side-effect-free. They are exercised by the test harness.

### 3.1 `payloadToLessonEvent(lessonId, raw)`

Rehydrates a broadcast payload into the exact `LessonEvent` shape produced by the Stage A2 normalizer.

- The event `id` is derived deterministically as `` `${lessonId}#${seq}` ``. This is what enables the client-side dedup + seq extraction used by `classifyIntake`, and is what makes re-subscribing safe (the same broadcast rehydrates to the same event and folds to the same state).
- Timestamps arrive as ISO-8601 strings (jsonb serialization of `timestamptz`) and are parsed to epoch milliseconds via `Date.parse`.
- Every structural violation (missing field, wrong type, unknown kind, priority out of `{1..5}`, non-parseable ts, seq < 1) returns `null` rather than throwing — a malformed frame must not tear down the subscription.

### 3.2 `projectCachedContext(state)`

Projects a `LessonState` into the exact request-body shape `POST /lumina-live` consumes.

- Caps (`PROJECTION_LIMITS`): stack 8, timeline 12, timeline text 400 chars, prereqs 32. These mirror — and are more conservative than — the server-side caps, so the happy path never bounces off validation.
- Oversize timeline text is truncated to `cap - 1` chars and suffixed with `…` (one code point).
- `prerequisitesCovered` is materialized from the `Set` via `Array.from(...).slice(0, cap)` so ordering is stable relative to insertion order.
- Non-mutating: the input state's `Set` / arrays are read but never modified. Asserted by the test harness.

### 3.3 `parseSseStream(body)` (async generator)

Consumes a `ReadableStream<Uint8Array>` carrying `text/event-stream` frames and yields typed `SseFrame` objects.

- Yields exactly one `SseFrame` per fully-received frame; separator is a blank line (`\n\n`), with CRLF normalized to LF first.
- Multi-line `data:` fields are concatenated per SSE spec.
- Unknown `event:` kinds (anything other than `token`, `error`, `done`) are silently skipped — forward-compatible with future server additions.
- Malformed JSON in `data:` is silently skipped — matches the resilience contract of the server's own upstream parser (`parseUpstreamStream`).
- A trailing frame without the final blank line is flushed on stream end.
- The `ReadableStreamDefaultReader` lock is released on every exit path, including caller `break` inside `for await`.

### 3.4 `classifyIntake(event, lastSeq)` + `seqFromEventId(id)`

The ordered-intake gate. Realtime does not guarantee exactly-once or in-order delivery; the Stage A3 reducer trusts its input order (its caller owns canonical ordering). This helper is the client-side enforcement of that contract.

Return values are exhaustive: `ok`, `duplicate`, `gap`, `invalid`. Gap recovery (durable replay from `public.lesson_events` by `seq`) is a Phase B3 concern; A5 surfaces the gap via `lastGap` on the hook so a future recovery layer can act on it.

---

## 4. `useLuminaLiveSession(lessonId, options?)`

One instance per `(student, lesson)`. Return shape:

```ts
interface UseLuminaLiveSessionResult {
  state: LessonState;               // current folded lesson state (A3)
  latest: LatestStream | null;      // { event, text, status, errorMessage }
  session: SessionStatus;           // idle | subscribing | subscribed | reconnecting | closed
  subscribeError: string | null;
  lastGap: GapInfo | null;          // { expectedSeq, receivedSeq, at } — set on out-of-order frames
  stop: () => void;                 // manual preempt of the in-flight stream
}
```

Options: `{ model?, enabled?, feature? }`. `feature` defaults to `"lecture"` for the ALE `getContext` call.

### 4.1 Lifecycle

- One `supabase.channel(...)` per hook instance, created inside `useEffect` and torn down in the cleanup. This is the pattern the cloud-realtime guidance specifically calls out as required (a bare subscribe at component scope leaks channels).
- Channel is created with `config: { private: true, broadcast: { self: false, ack: false } }` — matches the private-channel wire contract from A1.
- On `lessonId` change: state is reset via `initialState(lessonId)`, `lastSeq` resets to 0, `latest` and `lastGap` clear, and the effect re-runs to open a new channel.
- On unmount: channel removed, in-flight `AbortController` aborted, epoch bumped so any late completion callback is a no-op.

### 4.2 Ordering & fold

Every broadcast payload runs through `payloadToLessonEvent` → `classifyIntake`:

| Classification | Action |
| --- | --- |
| `ok` | `lastSeq` advances, `reduce(state, event)` folds new state, streaming inference kicks off. |
| `duplicate` | Silently dropped. |
| `invalid` | Silently dropped. |
| `gap` | Dropped from the fold; `lastGap` is updated so a future recovery layer can trigger replay from `public.lesson_events`. |

### 4.3 Streaming inference call

`runStreamFor(event)` is invoked for every accepted event:

1. **Preempt.** `stop()` bumps the epoch and aborts the previous stream. This is Refinement-1 in action: the newest teacher signal always wins. Priority-aware preemption arrives with Stage A7.
2. **Fetch ALE context.** `getContext(feature)` best-effort. An ALE failure sets `studentContext = null` but never blocks the request.
3. **Assemble body.** `projectCachedContext(state)` builds the cached context; the event is passed through as-is. Optional `model` override is forwarded.
4. **POST to `/lumina-live`.** JWT is pulled from the current Supabase session; `apikey` is added when the publishable key is available. `signal: controller.signal` binds to the epoch-scoped `AbortController`.
5. **Consume SSE.** `parseSseStream(response.body)` is iterated. Frames route through `applyFrame`:
   - `token` → append `delta` to `latest.text`, mark status `streaming`.
   - `error` → set `latest.status = "error"`, capture message.
   - `done` → map `reason` to one of `done`, `cancelled`, `noop`, `error`.
6. **Cancellation.** An epoch mismatch on the next iteration triggers `controller.abort()` and returns; the outer try/catch classifies the resulting `AbortError` as `cancelled`, not `error`.

Every completion path clears `abortRef.current` iff it still points at the current controller (guarding against overwrite races).

### 4.4 Deliberate non-goals for A5

- No predictive precompute (Phase B1).
- No gap-driven replay from `public.lesson_events` (Phase B3). Gaps are detected and surfaced via `lastGap` only.
- No priority-aware scheduling (Stage A7). The hook naively preempts on the next arrival.
- No snapshot writes to `lesson_state_snapshots` or `lesson_sessions` (Stage A6).
- No teacher-visible filtering on the client. The A1 RLS on `realtime.messages` already scopes access; a per-user visibility filter on top is left to the surface consuming this hook (e.g. student UI hiding `teacherVisible=false` events from render).

---

## 5. Verification performed

| Check | Result |
| --- | --- |
| Migration applied | ✅ (pre-existing 139 linter warnings unchanged) |
| `bun run scripts/lseSessionInternals.test.ts` | ✅ **passed: 45, failed: 0** |
| Full project typecheck (`bunx tsgo --noEmit`) | ✅ no errors on any LSE file |
| Hook wired into an existing surface | ❌ — deferred by design |

The hook is intentionally NOT rendered by any existing screen in this stage. Its consumer is the student-facing "live parallel lecture" surface which is a later UX task; A5 lands the mechanism so the surface can compose without further backend work.

The 45 test assertions cover:

- `payloadToLessonEvent`: 14 assertions — determinism, id/ts shape, concept_ref normalization, and 9 rejection cases (null, wrong types, invalid kind/priority, bad ts, etc.).
- `projectCachedContext`: 6 assertions — stack cap, timeline cap, prereq surfacing, truncation length + ellipsis, non-mutation.
- `classifyIntake` + `seqFromEventId`: 7 assertions — id parsing, accept path, duplicate, same-seq duplicate, gap, invalid-id classification.
- `parseSseStream`: 10 assertions — well-formed stream, CRLF, chunk splits at byte-arbitrary positions, unknown event kinds skipped, malformed JSON tolerated, trailing frame without blank line.
- Round trip: 8 assertions — broadcast payloads rehydrate → fold correctly → project correctly.

React lifecycle is not exercised by the harness — the hook is a thin orchestrator over the pure helpers, and the helpers own every observable transformation.

---

## 6. Interfaces with adjacent stages

- **Consumes A1:** the `lesson:<uuid>` topic, the `lesson_event` broadcast name, and the payload shape emitted by the AFTER-INSERT trigger. The new Realtime RLS is the counterpart to that trigger.
- **Consumes A2:** `LessonEvent` and its `LessonEventKind` union — the payload rehydrator produces the exact shape the reducer expects.
- **Consumes A3:** `initialState`, `reduce`, and the `LessonState` type. State is folded on the client in the same pure way it would be on a server; A6 will add snapshot persistence but the fold itself remains identical.
- **Consumes A4:** the `POST /lumina-live` contract — the request body shape, the JWT auth requirement, and the SSE frame taxonomy (`token`/`error`/`done`).
- **Bridges to Phase B3:** `lastGap` is the seed for future replay-from-seq recovery. When B3 lands, the recovery module can subscribe to `lastGap` changes and issue a `SELECT` on `lesson_events` for the missing range.
- **Bridges to Stage A7:** `stop()` and the epoch-based cancellation are the primitives the priority scheduler will call when preempting a lower-priority in-flight stream.

---

## 7. Ready for Stage A6

Stage A6 (context cache — client Zustand store + short-TTL server-side KV mirror) can be opened next. It will:

- Move `latest` history into a bounded per-lesson store keyed by seq, so a UI can render prior Lumina turns without re-requesting.
- Mirror the last `getContext()` result into a TTL cache to avoid re-fetching within the 15s ALE bus window.
- Snapshot `LessonState` into `public.lesson_state_snapshots` every N events so B3 replay has a short tail to fold rather than a full log.

Nothing in A5 needs to change for A6 to proceed.
