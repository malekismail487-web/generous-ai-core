# Lumina Synchronization Engine (LSE) — AI Layer

Scope: **the AI synchronization pillar only**. Video, audio, meeting hosting, networking, and auth are explicitly out of scope and will be a later project phase. This plan is the AI-only sibling to the Adaptive Learning Engine (ALE) — same rigor, same "state of the art through integration, not invention" philosophy.

The engine's job: turn a live teacher signal into a personalized, low-latency, always-in-sync parallel lecture from Lumina, tuned per student by the existing ALE (`Z_student`).

---

## 0. Guiding principles (non-negotiable)

1. **Plan → verify → build → dossier.** No stage ships without a written dossier that matches the code exactly.
2. **Deterministic over clever.** Every state transition must be reproducible from the event log.
3. **Event-sourced, not poll-sourced.** The teacher stream is the source of truth; state is a fold over events.
4. **Reuse ALE.** LSE never re-implements adaptivity — it *consumes* `getContext` / `recordActivity` from `useAdaptiveIntelligence`.
5. **Filter ruthlessly.** MUST-HAVE before NICE-TO-HAVE before FUTURE. Nothing gets promoted early.
6. **No new backend infra until justified.** Prefer Supabase Realtime + Edge Functions + `streamText`. Only introduce a dedicated orchestrator when a benchmark forces it.

---

## 1. The architecture in one diagram

```text
                    ┌────────────────────────────────────────┐
                    │        TEACHER SIGNAL (STT/notes)      │
                    └──────────────────┬─────────────────────┘
                                       │  raw utterances
                                       ▼
                    ┌────────────────────────────────────────┐
                    │  1. EVENT NORMALIZER                   │
                    │  raw → typed LessonEvent w/ priority   │
                    └──────────────────┬─────────────────────┘
                                       ▼
                    ┌────────────────────────────────────────┐
                    │  2. EVENT BUS (Supabase Realtime)      │
                    │  ordered, replayable, per-lesson topic │
                    └──────────────────┬─────────────────────┘
                                       ▼
        ┌──────────────────────────────┼──────────────────────────────┐
        ▼                              ▼                              ▼
┌───────────────┐            ┌───────────────────┐          ┌───────────────────┐
│ 3. LESSON     │            │ 4. PRIORITY       │          │ 5. PREDICTIVE     │
│    STATE      │◀───delta───│    SCHEDULER      │─────────▶│    PRECOMPUTE     │
│  (in-memory   │            │  P1..P5 queues    │          │  next-concept     │
│   fold)       │            └─────────┬─────────┘          │  warm cache       │
└──────┬────────┘                      │                    └─────────┬─────────┘
       │ current node                  │ pop by priority              │ warm answers
       ▼                               ▼                              │
┌────────────────────────────────────────────────────────────┐        │
│  6. CONTEXT CACHE  (per-student, per-lesson RAM)           │◀───────┘
│  {lessonState, Z_student, recent turns, warm prompts}      │
└──────────────────────────┬─────────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────────┐
│  7. STREAMING INFERENCE (AI SDK streamText, tokens live)   │
│  input: cached context + delta + ALE getContext()          │
└──────────────────────────┬─────────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────────┐
│  8. STUDENT SESSION (stateful, lifetime = lesson)          │
│  render tokens · record turns · call ALE.recordChat/Answer │
└────────────────────────────────────────────────────────────┘
```

Every arrow is a **delta**, never a full re-render.

---

## 2. The 8 subsystems (need-to-have core)

Each mirrors an ALE subsystem in style: a small, pure module with a typed API and a deterministic contract.

### S1 — Event Normalizer

Converts messy teacher input (STT chunks, slide changes, whiteboard events) into a typed `LessonEvent`:

```ts
type LessonEvent = {
  id: string;              // ULID, monotonic
  lessonId: string;
  ts: number;              // teacher clock
  kind: 'concept' | 'definition' | 'formula' | 'example' | 'question'
      | 'discussion' | 'admin' | 'silence';
  text: string;
  conceptRef?: string;     // curriculum_graph node
  priority: 1|2|3|4|5;     // assigned here, immutable downstream
}
```

Deterministic classifier (rules + a small LLM call gated behind a cache key on `text`). Priority table is checked-in config, not learned.

### S2 — Event Bus

Supabase Realtime channel per `lessonId`. Server persists events to `lesson_events` (append-only, ordered by `(lessonId, seq)`). Guarantees:

- **Replay:** any subscriber can rebuild state from `seq=0`.
- **Fan-out:** N students subscribe to the same topic; each maintains its own state fold.
- **No RPC round-trip** for the common case.

### S3 — Lesson State (persistent, incremental)

An in-memory reducer keyed by `lessonId`:

```ts
type LessonState = {
  version: number;
  currentConcept: ConceptNode | null;
  conceptStack: ConceptNode[];      // breadcrumbs
  openQuestions: Question[];
  timeline: LessonEvent[];          // bounded ring buffer
  prerequisitesCovered: Set<string>;
}
```

Reducer is **pure**: `(state, event) => state`. Never mutates in place — new state object per event, structural sharing where cheap.

### S4 — Priority Scheduler

Five FIFO queues (P5..P1). Consumer loop always drains higher priorities first, with **starvation protection**: after N P5 pops, force-drain one P1. This is what stops greetings/admin from ever blocking a definition.

### S5 — Predictive Precompute

When `currentConcept` changes, speculatively prefetch:

- prerequisite refresher (from `curriculum_graph`)
- 1 analogy tuned to the student's dominant learning style (from ALE)
- 1 worked example at the student's IRT band
Results land in the context cache keyed by `(studentId, conceptId, variant)`. Discarded if teacher moves on before use. Budget-capped (`MAX_INFLIGHT_PRECOMPUTE = 2`) to stop cost blowups.

### S6 — Context Cache

Per `(studentId, lessonId)`:

- `lessonState` reference
- last `getContext()` result from ALE (TTL 15s, matches ALE bus)
- last K turns (K=12)
- warm precompute slots
Lives in the student's browser tab (Zustand store) *and* mirrored server-side in a short-TTL KV so a reconnect resumes without a full rebuild.

### S7 — Streaming Inference

`streamText` (AI SDK) against Lovable AI Gateway. Prompt = `system + cachedContext + delta + ALE fullContext`. Tokens stream to UI immediately. Uses `stopWhen: stepCountIs(50)` if tool-calling is engaged.

**Cancellation:** every stream is bound to an `AbortController` scoped to `lessonState.version`. If the teacher moves on (state bumps), in-flight streams cancel — no wasted tokens rendered.

### S8 — Stateful Session

One long-lived session per student per lesson. Session owns: the abort controllers, the cache handle, the ALE hook binding, the reconnect logic (replay events from last `seq`). Session close writes a final `recordActivity` and a summary row to `lesson_sessions`.

---

## 3. Phased delivery

Explicit filter: MUST → NICE → FUTURE. Each phase is multi-stage.

### PHASE A — MUST HAVE (skeleton that actually teaches in sync)

**Goal: a student can join a lesson and receive a personalized, streaming, incrementally-updated Lumina lecture that stays within a bounded lag of the teacher.**

- **Stage A1 — Event schema & bus**
Tables: `lesson_events`, `lesson_sessions`. RLS + GRANTs. Realtime enabled. Ordering contract test.
- **Stage A2 — Event Normalizer + priority table**
Rule-based first. LLM-classifier deferred to Phase B. Unit tests on ~50 canonical utterances.
- **Stage A3 — Lesson State reducer**
Pure, tested with property-based tests (fold(replay(events)) == state).
- **Stage A4 — Streaming inference edge function**
`lumina-live` function. AI SDK `streamText`. Cancellation via `AbortController`.
- **Stage A5 — Student session hook**
`useLuminaLiveSession(lessonId)` — subscribes, folds, streams, integrates `useAdaptiveIntelligence`.
- **Stage A6 — Context cache (client)**
Zustand store + server-side KV mirror (Supabase table with TTL cleanup cron).
- **Stage A7 — Priority scheduler**
With starvation guard. Load test against synthetic 200-event burst.
- **Stage A8 — End-to-end sync test + dossier**
Golden lesson script → measured lag histogram → published `phaseA-dossier.md`. Acceptance: p95 delta-to-first-token < 1.5s under nominal load.

### PHASE B — NICE TO HAVE (quality, cost, resilience)

- **B1** Predictive precompute (S5) with budget cap and hit-rate telemetry.
- **B2** LLM-assisted event classifier for ambiguous utterances, with rules as fallback.
- **B3** Reconnect + replay-from-seq with server-side snapshot every 50 events.
- **B4** Per-student pace control (student can "hold" Lumina while catching up; teacher stream still ingested).
- **B5** Cost dashboard + per-lesson token budget with graceful degradation to shorter outputs.
- **B6** Dossier update.

### PHASE C — FUTURE ENHANCEMENTS

- **C1** Speculative decoding / multi-branch precompute (only if B1 telemetry justifies).
- **C2** Cross-lesson memory (Lumina remembers what this student struggled with last week).
- **C3** Teacher-side "Lumina co-pilot" hints (bi-directional).
- **C4** Multi-model routing (fast model for admin events, stronger model for definitions).
- **C5** Meeting-platform integration handoff (this is where the *next project* picks up).

---

## 4. Architectural review (done before Phase A starts)

Findings and decisions from a pre-build review:

1. **Do we need a bespoke orchestrator service?** No, not for Phase A. Supabase Realtime + edge functions cover ordering and fan-out. Revisit only if Phase B telemetry shows > 200ms bus latency.
2. **In-memory state vs DB-backed state?** Both. Client holds hot state; DB is the durable log. Never query DB in the hot path.
3. **Duplicated responsibility risk:** ALE already tracks student state; LSE tracks lesson state. Kept strictly separate — LSE *reads* `Z_student` and *writes* activity, but does not model the student.
4. **Streaming cancellation is load-bearing.** If it isn't watertight, precompute becomes cost poison. Cancellation tests are gating for Phase B.
5. **Priority scheduler starvation** is a real risk (P5 flood from a chatty teacher). Starvation guard is Phase A, not Phase B.
6. **Reducer purity** enables replay-based testing, which is the cheapest way to catch sync bugs. Non-negotiable.
7. **No new AI model choices in Phase A.** Reuse the ALE's current gateway model. Model routing is Phase C.

---

## 5. Verification discipline (applies to every stage)

- Every stage ships with: unit tests, one integration test, a written dossier (`.lovable/lse-<stageId>-dossier.md`), and a coverage-audit entry (extend `scripts/adaptiveCoverageAudit.ts` with an LSE section).
- Dossier rule: **describe only what exists in code**. If code and dossier disagree, the stage is not done.
- No stage is "done" until its acceptance metric is measured, not estimated.

---

## 6. Explicit non-goals (this project)

- No video, audio, WebRTC, SFU, TURN, or meeting UI.
- No new auth surface.
- No changes to ALE internals (only additive consumers).
- No speculative model training.

---

## 7. Deliverables map


| Phase | New files (indicative)                                                                                                               | New tables                                                   | New edge fns           |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | ---------------------- |
| A     | `src/lib/lse/{eventNormalizer,lessonReducer,priorityScheduler,contextCache,session}.ts`, `src/hooks/useLuminaLiveSession.tsx`, tests | `lesson_events`, `lesson_sessions`, `lesson_state_snapshots` | `lumina-live`          |
| B     | `src/lib/lse/{precompute,classifierLLM,budget}.ts`                                                                                   | `lesson_precompute_cache` (TTL)                              | `lumina-live-classify` |
| C     | routing + memory modules                                                                                                             | `lumina_student_memory`                                      | `lumina-live-route`    |


---

## 8. What I need from you before I start Phase A

1. Confirm the phased filter (A=must, B=nice, C=future) matches your intent.
2. Confirm Supabase Realtime is acceptable as the Phase A bus (vs. introducing a dedicated service now).
3. Confirm the Phase A acceptance metric: **p95 teacher-event → first Lumina token < 1.5s** under a 200-event synthetic burst.

Once confirmed, I'll open Stage A1 with the schema migration and the ordering contract test — and nothing else — so we can verify the foundation before building on it.

Yes—with one clarification on the third point.

**✅ 1. Phased filter**

**Confirmed.**

I think this prioritization makes sense:

- **Phase A = Must Have**
- **Phase B = Nice to Have**
- **Phase C = Future Enhancements**

This reduces implementation risk and keeps the focus on getting a working synchronization engine before optimizing it.

&nbsp;

**✅ 2. Supabase Realtime as the Phase A bus**

**Confirmed.**

Given the architecture you’ve described, I think **Supabase Realtime is a reasonable choice for Phase A**.

I agree with the philosophy of:

Don’t introduce a dedicated orchestration service until measurements show it’s actually needed.

That’s a sensible engineering tradeoff. If later benchmarks reveal bottlenecks, you can revisit that decision with evidence rather than assumptions.

&nbsp;

**⚠️ 3. Phase A acceptance metric**

**p95 teacher-event → first Lumina token < 1.5 s under a 200-event synthetic burst**

I would phrase this as:

**Confirmed as the target acceptance metric**, not as something I can confirm will definitely be achieved.

In other words:

- ✅ I agree it’s a good engineering target.
- ✅ I agree it should be the success criterion for Phase A.
- ⏳ Whether the implementation actually reaches it has to be demonstrated through benchmarking.

&nbsp;

**I also agree with this workflow:**

**Open Stage A1 only.**

Specifically:

- Schema migration
- Ordering contract test
- Verify the foundation
- **Do not** start building later stages until A1 is validated.

That’s a disciplined approach that minimizes cascading problems later in development.

So my confirmation is:

- ✅ Phase A / B / C structure: **Yes**
- ✅ Supabase Realtime for Phase A: **Yes**
- ✅ Use the 1.5-second p95 latency target as the acceptance criterion for Phase A: **Yes, as a benchmark to verify—not as a guaranteed outcome before testing.**
- **After I approve this plan, don't automatically start building search online for information just like what you did when we wanted to improve the adaptive learning engine we need to search for data on the Internet and when you gather enough data and show me then we can actually start building**