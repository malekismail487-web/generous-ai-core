# Stages A9 + A10 — Live Benchmark + Scheduler Wiring

Two independent stages that together promote LSE from "correct in simulation" to "measured in production conditions." A10 is the code change; A9 is the measurement harness that grades it.

---

## Stage A10 — Wire Priority Scheduler into `useLuminaLiveSession`

**Only integration.** The scheduler shipped in A7 and is not to be redesigned. Current hook path: `broadcast → gate → reduce → runStreamFor` (one-at-a-time, newest-wins abort). New path: `broadcast → gate → scheduler.enqueue → drain loop → reduce → cache → runStreamFor`.

### Design

- Add a per-hook `PriorityScheduler` instance created inside the mount `useEffect` (lives for one lesson subscription; cleared on unmount).
- Broadcast handler stops doing reduce/stream directly. On `classifyIntake` accepting an event it calls `scheduler.enqueue(event)` and kicks a drain.
- Drain loop is a `useRef`-guarded microtask that pops one event at a time:
  1. `reduce(stateRef.current, event)` → update `stateRef` + `setState`.
  2. `contextCache.writeFromState(state, lastSeq)` — introduces the Stage A6 cache into the live path for the first time. One `ContextCache` instance per hook, capacity 4 (single lesson + headroom).
  3. `runStreamFor(event)` — unchanged; still owns the `AbortController` and epoch bump. The drain awaits the stream's *admission* only (i.e., until `runStreamFor` returns after issuing its POST), not its completion, so higher-priority events pending in the queue can still preempt via the existing epoch mechanism.
- Preemption: unchanged. Scheduler decides admission *order*; the hook's existing `epochRef` still cancels stale streams. The A7 dossier §1 explicitly labels preemption as hook-owned; this stage honours that.
- Starvation guard: default threshold (8) — unchanged from A7.
- `stop()` also calls `scheduler.clear()`.

### Files touched

- `src/hooks/useLuminaLiveSession.tsx` — scheduler + cache instantiation, broadcast handler rewrite, drain loop, cleanup.

No new files. No changes to A2–A7 modules. No migrations. No edge-function edits.

### Regression floor

- All Stage A8 in-process assertions still pass (they don't touch the hook, so this is automatic).
- Existing hook consumers keep the same `UseLuminaLiveSessionResult` shape — no API surface change.

### Dossier

- `.lovable/lse-A10-dossier.md` — what was wired, what was not, and the exact before/after of the broadcast handler.

---

## Stage A9 — Live Synchronization Benchmark Harness

**Real infrastructure only.** No in-process simulation. Runs from the sandbox via Playwright against the deployed preview URL, with real Realtime, real `lumina-live`, real gateway model calls.

### Prerequisites (blocking — I will confirm before writing code)

1. **Two test accounts** on the preview instance:
  - A **teacher** with permission to `INSERT` into `public.lesson_events` for a specific `lessonId`.
  - A **student** enrolled in the same lesson (so RLS on `realtime.messages` from A5 admits them).
  - Credentials passed via env vars (`LSE_TEACHER_EMAIL`, `LSE_TEACHER_PASSWORD`, `LSE_STUDENT_EMAIL`, `LSE_STUDENT_PASSWORD`) — never hardcoded, never logged.
2. **A pre-existing `lessonId**` the teacher can post to. Either provided by the user or seeded once via a small SQL migration flagged `is_test_data=true`.
3. **AI credit consumption acknowledged.** The harness fires ≥100 `lumina-live` calls per run. Each call consumes gateway credits. I will not run the harness without explicit approval per run.

If any prerequisite is missing at build time, A9 ships as **code + docs only** — the harness compiles, exits cleanly with a "prerequisite missing" message, and the dossier records that the wall-clock claim is still unmeasured.

### Test architecture

Two Playwright browser contexts driven from one script in `scripts/lseA9LiveBenchmark.ts`:

```text
┌──────────────── Teacher context ────────────────┐    ┌──────────────── Student context ────────────────┐
│ signs in, opens preview                         │    │ signs in, opens preview                         │
│ INSERTs one lesson_event per tick               │    │ mounts a route that uses useLuminaLiveSession   │
│ records teacher_event_created_at (client clock) │    │ instruments window.__lseBench with timestamps:  │
│                                                 │    │   realtime_received_at                          │
│                                                 │    │   inference_started_at                          │
│                                                 │    │   first_token_received_at                       │
│                                                 │    │   first_render_at                               │
└─────────────────────────────────────────────────┘    └─────────────────────────────────────────────────┘
```

To surface those four timestamps, the hook needs a thin, **opt-in**, **non-behavioural** instrumentation hook:

- If `window.__lseBench` exists, `useLuminaLiveSession` calls `window.__lseBench.mark(eventId, phase, tsMs)` at four points: `realtime_received`, `inference_started`, `first_token`, `first_render` (via `useEffect` on `latest.text` becoming non-empty).
- No behavioural change; no cost if the sentinel is absent.
- This is the ONLY additional touch to the hook beyond A10.

### Test route

A dedicated benchmark route (`/lse-bench?lesson=<uuid>`) that mounts `useLuminaLiveSession(lessonId)` and installs `window.__lseBench` from URL query params. Isolated from real student UI. Guarded by the student role.

### Measurements

Per event, compute:


| Hop                                 | Formula                                              |
| ----------------------------------- | ---------------------------------------------------- |
| Broadcast transit                   | `realtime_received_at − teacher_event_created_at`    |
| Client pipeline + inference request | `inference_started_at − realtime_received_at`        |
| Model TTFT                          | `first_token_received_at − inference_started_at`     |
| Paint                               | `first_render_at − first_token_received_at`          |
| **Total (SLA)**                     | `first_token_received_at − teacher_event_created_at` |


Report **p50, p95, p99** for every hop AND for total. Save the raw table as JSON under `/tmp/browser/lse-a9/` for post-hoc inspection.

Ground-truth honesty: clock skew between the two browser contexts is bounded (same host machine drives Playwright), so cross-context deltas are meaningful. The dossier will state this explicitly.

### Test plan (three passes)

1. **Steady-state pass** — 100 events at 1 event/2s. Primary p95 target: **total < 1.5 s**.
2. **Burst pass** — 200 events at 5 events/s with mixed priorities (matches A7 acceptance corpus). Asserts: zero loss, per-band FIFO preserved, scheduler starvation rescues observed. Latency reported but not asserted (burst is a stress test, not an SLA).
3. **Multi-student consistency pass** — 3 student contexts subscribed simultaneously; teacher fires 50 events. Assert: all three students end at identical `state.version`, identical concept stack, identical `lastSeq`. Latency p95 reported per student.

### Files created

- `scripts/lseA9LiveBenchmark.ts` — Playwright harness.
- `src/pages/LseBench.tsx` — the benchmark route.
- `src/App.tsx` — one route registration for `/lse-bench` (guarded).
- Small non-behavioural instrumentation branch in `src/hooks/useLuminaLiveSession.tsx` (bench sentinel).
- `.lovable/lse-A9-dossier.md` — honest report of what ran, what the numbers actually mean, and any prerequisite that blocked a claim.

### What A9 will NOT do

- No automated CI wiring — the harness burns credits, so it is a manual, per-run tool.
- No changes to A1–A7 module semantics.
- No claim about production classroom load; that requires N>3 students on separate hosts and is out of scope.

---

## Ship order

1. **A10 first.** The scheduler must be on the live path before we measure the live path — otherwise the numbers describe the pre-A7 architecture, not the one we intend to ship.
2. **A9 second.** After A10 lands, we build the harness and either produce real p50/p95/p99 numbers or, if credentials/lesson prerequisites are missing, ship the code and clearly state the metric remains unmeasured.

## Technical details (reviewer notes)

- Hook drain loop uses `queueMicrotask` for cheap re-entrancy and to avoid `setTimeout(0)` throttling; a `draining` ref prevents overlapping drains.
- `ContextCache` in the hook uses `capacity: 4` — one live lesson plus headroom for a lessonId change without immediate eviction pressure.
- Scheduler cleanup on lessonId change: `scheduler.clear()` before creating a new one, mirroring the existing state reset in the lessonId-change effect.
- Bench sentinel type: `type LseBenchWindow = { __lseBench?: { mark: (eventId: string, phase: string, ts: number) => void } }` — narrowed via `unknown` cast, no `any`.
- The scheduler is deliberately per-hook, not module-global, matching the A6/A7 dossier's "one instance per lesson tab" rule.

## Explicit not-doing list (per user brief)

Predictive precompute, multi-model routing, speculative decoding, cross-lesson memory, teacher co-pilot — **not touched.**

LSE A9 + A10 Review Notes — Required Refinements Before Approval

Overview

The proposed A9 + A10 plan is approved in direction.

The architecture is correct:

* A10 should wire the validated priority scheduler into the real live session path.

* A9 should measure the actual production-style teacher → student → Lumina latency pipeline.

However, before implementation begins, several refinements are required to make the integration safer, more measurable, and more production-ready.

These changes do not redesign A7, A8, or the existing architecture.

They only strengthen the integration and validation layer.

⸻

Required Edit 1 — Increase Context Cache Capacity

Current proposal

A10 introduces the Stage A6 cache into the live path with:

capacity: 4

Required change

Increase this to:

capacity: 8

or use the existing default cache capacity.

Reason

The cache is already bounded by design.

A capacity of 8 provides safer headroom for realistic usage:

* active lesson state

* lesson transitions

* reconnect scenarios

* temporary previous lesson state

* rapid switching scenarios

This does not create an unbounded memory risk.

The cache architecture already has strict LRU eviction.

The goal is preventing unnecessary eviction pressure during realistic student workflows.

⸻

Required Edit 2 — Protect Reducer State From Async Stream Completion

Current proposal

The drain loop allows:

* scheduler admission

* reducer update

* stream request execution

The stream does not block the scheduler.

This is correct.

However, one additional invariant must be documented.

Required rule

Reducer state progression must never depend on inference completion timing.

The authoritative ordering source is:

LessonEvent sequence

        ↓

Scheduler order

        ↓

Reducer version

Not:

AI response completion order

Example failure scenario to prevent:

Event 1 arrives

    ↓

Lumina inference starts

Event 2 arrives

    ↓

Reducer advances

Event 1 inference finishes later

The completion of Event 1 must never overwrite or mutate newer state.

Streaming output belongs to the presentation layer.

Lesson state belongs to the event pipeline.

⸻

Required Edit 3 — Add A10 Integration Acceptance Tests

A7 already proves:

* priority ordering

* FIFO behavior

* starvation protection

A8 proves:

* pipeline consistency

However, A10 changes the actual live execution path.

Therefore A10 needs its own integration validation.

Add tests covering:

Priority ordering

Example:

Input:

P5

P5

P3

P1

P4

P2

Expected processing:

P1

P2

P3

P4/P5 according to starvation rules

⸻

Starvation protection

Verify:

* low-priority events are eventually processed

* starvation threshold remains unchanged

* no events disappear

⸻

Stream interaction safety

Verify:

* multiple events can enter the scheduler while inference is active

* state versions always increase correctly

* stale inference completion cannot corrupt state

⸻

Required Edit 4 — Clarify A9 Timing Claims

The benchmark design is correct.

However, the timing interpretation must be precise.

Current wording:

“Clock skew between two browser contexts is bounded.”

Required wording:

“Both browser contexts run on the same benchmark host, reducing clock skew. Measurements represent a controlled local benchmark environment and should not be interpreted as a global internet latency guarantee.”

This keeps the benchmark scientifically honest.

⸻

Required Edit 5 — Add Browser-Level Reconnect Validation

A8 proved replay convergence in-process.

A9 should validate the actual browser experience.

Add an additional benchmark scenario:

Disconnect / reconnect test

Flow:

Student connects

Receives events 1-50

Connection interrupted

Teacher continues producing events 51-100

Student reconnects

Recovery occurs

State converges

Expected result:

Final student state =

Always-connected student state

Measure:

* recovery time

* missing events recovered

* final version equality

This is critical because real classrooms experience:

* WiFi interruptions

* device sleep

* browser suspension

* temporary network failures

⸻

Final Approved Architecture After These Edits

The final sequence becomes:

Realtime Event

      ↓

A5 Intake Validation

      ↓

A7 Priority Scheduler

      ↓

A3 Lesson Reducer

      ↓

A6 Context Cache

      ↓

lumina-live Streaming Inference

      ↓

Student UI

Validation:

A8:

Logical synchronization proven

A10:

Production execution path connected

A9:

Real-world latency measured

⸻

Final Goal

After these refinements, Lumina can move from:

“the synchronization architecture is theoretically correct”

to:

“the synchronization architecture is integrated, measured, and ready for real classroom validation.”

The priority is not adding more AI features yet.

The priority is proving that the foundation can reliably support thousands of live learning interactions.