# LSE Stage A8 — End-to-End Integration & Synchronization Validation

Status: **Partially shipped — honest.** The client-side pipeline is validated end-to-end in-process (83/83 assertions pass). The wall-clock `p95 teacher→first-token < 1.5 s` metric is **NOT** measured here because it requires a live browser, live Realtime socket, live edge function, and live gateway model — Section 4 spells out exactly what remains and how to close it.

This dossier documents *exactly* what was built for A8, no more, no less. Read Sections 1–3 for what is now proven; read Section 4 before claiming the pipeline is production-ready.

---

## 1. Scope

Stages A1–A7 shipped individual modules with individual test harnesses. A8 stitches them into one pipeline and asserts the invariants Phase A promised as a system:

- Event integrity across the full ingest path.
- Ordering integrity through the intake gate.
- Deterministic replay from the broadcast log.
- Multi-student state convergence on a shared event stream.
- Late-joiner recovery convergence with a live student.
- Priority + starvation behaviour under mixed load.
- Bounded memory on long-running lessons.
- Per-stage latency accounting on the client hot path.

**What A8 does NOT touch:**
- Adds no new subsystems.
- Modifies no existing modules.
- Does not wire the scheduler into `useLuminaLiveSession` (that integration remains a separate, explicitly-approved change — see Stage A7 dossier §7).
- Does not spin up a live browser or edge-function harness.

---

## 2. Files delivered

| Path | Purpose |
| --- | --- |
| `scripts/lseA8Integration.test.ts` | 8-test integration harness. Stitches A2→A3→A5-gate→A6→A7 in one Bun process. Self-reports pass/fail and prints latency breakdowns. |
| `.lovable/lse-A8-dossier.md` | This document. |

No source files were modified. No migrations. No edge-function edits.

---

## 3. What is now proven (in-process, deterministic)

Run: `bun run scripts/lseA8Integration.test.ts` → **83 passed / 0 failed** at ship time.

| # | Invariant validated | Assertions |
| --- | --- | --- |
| T1 | 200-event burst: every payload accepted through the ordering gate, folded into state, cached, and enqueued to the scheduler. Scheduler drains with zero loss. FIFO preserved *within* every priority band. | 12 |
| T2 | Ordering gate: duplicates and gaps are rejected without corrupting reducer state; `lastSeq` advances only on accepted events. | 5 |
| T3 | Multi-student synchronization: 25 independent students consuming an identical 120-event broadcast stream end at byte-identical reducer states AND byte-identical cached projections. | 48 |
| T4 | Recovery convergence: a "late joiner" replaying the entire broadcast log from `seq=1` reaches the same state as an always-connected student; both match `fold(events)` computed directly. | 3 |
| T5 | Determinism: two independent runs over the same input yield byte-identical scheduler emission order, reducer version, timeline length, concept stack, and cached projection JSON. | 1 |
| T6 | Preemption-adjacent behaviour: a P1 "correction" event enqueued behind five P3/P4 filler events emerges from the scheduler *first*, giving the hook the earliest possible tick to fire its `AbortController`. Backlog then drains in strict priority-then-FIFO order. | 7 |
| T7 | Stability: 5 000-event long lesson with continuous drain — every event consumed exactly once, reducer timeline stays ≤ `TIMELINE_CAPACITY`, cache stays ≤ configured capacity. | 4 |
| T8 | Per-stage latency accounting on the client hot path (rehydrate + gate + reduce + cache + schedule). Total <500 µs/event on the test host. Reported per-stage numbers printed to stdout. | 1 (+ printed breakdown) |

### Latency numbers observed at ship time (Bun on sandbox)

```
[T1] pipeline ingest overhead: ~20 µs/event (200 events in ~4 ms)
[T8] client-side per-stage overhead (µs/event, avg over 1000):
       rehydrate  ~2.5
       gate       ~0.3
       reduce     ~2.7
       cache      ~3.7
       schedule   ~0.1
       TOTAL      ~9 µs/event
```

Interpretation: on the client, the entire A2–A7 chain contributes **microseconds** per event. Any p95 breach of the 1.5 s budget lives in one of the four external stages listed in Section 4, not in the code A1–A7 delivered.

---

## 4. What is NOT proven by A8 — and why

The user asked for `p95 teacher-event → first Lumina token < 1.5 s`. That metric spans four surfaces this Bun-process harness cannot exercise:

| Unmeasured surface | Why this harness cannot measure it | Where the measurement must live |
| --- | --- | --- |
| **Postgres `INSERT` + `lesson_events` trigger + Realtime broadcast fan-out** (Stage A1) | Requires the live database and a subscribed WebSocket client. Ordering was proven at the trigger level in A1's dossier, but the fan-out timing was not. | A Playwright/browser harness authenticated as a student, subscribed to `lesson:<uuid>`, with a teacher client `INSERT`ing on a timer. Record client-side timestamp of every received broadcast. |
| **Realtime socket transport** (Stage A5 subscription layer) | The `useLuminaLiveSession` hook runs in a browser and uses `@supabase/supabase-js`'s WebSocket transport. Not present in Bun. | Same Playwright harness. |
| **`POST /lumina-live` network RTT + gateway first-token TTFB** (Stage A4) | Requires a live edge function call with a valid session JWT and consumed gateway credits. Excluded from CI runs. | A dedicated benchmark script that hits the deployed edge function under a test session, records first-`event: token` wall-clock delta, reports p50/p95/p99. |
| **SSE render loop / React paint** (Stage A5 hook) | Requires a browser DOM. | Same Playwright harness, measuring paint-to-token via `performance.mark`. |

**Consequence:** the ≤1.5 s p95 claim is currently supported only by:
- A tight bound on the client-side portion (≤ ~10 µs/event measured).
- No measurement of the four surfaces above.

Any statement stronger than that in user-facing copy would be dishonest until the Playwright harness above is built.

### What the T6 test does and does not prove about cancellation

T6 proves the scheduler emits a newly-arriving P1 *ahead of* queued lower-priority events, which is the *precondition* for fast cancellation. It does **not** prove:

- That `useLuminaLiveSession`'s `AbortController` fires within a bounded time of the P1 emit.
- That the in-flight `fetch` to `/lumina-live` actually terminates promptly on abort.
- That partially-rendered tokens are visually cleared from the UI.

Those three claims each require a live browser harness with a live edge function.

---

## 5. Honest gap summary

What we have, precisely:

- **Deterministic, in-process proof** that A2–A7 form one correct data pipeline with no loss, no duplication, no reorder violations, no state divergence across N clients, and no memory blow-up over 5 000 events.
- **Microsecond-scale bound** on the client-side overhead per event.
- **Structural proof** that scheduler behaviour gives the hook the earliest possible opportunity to preempt.

What we do not have:

- **Any wall-clock number** for the teacher→first-token journey.
- **Any measurement** of Realtime broadcast latency or edge-function TTFB in this project.
- **Any browser-level test** of preview UI paint, token render, or abort responsiveness.
- **Any load test** of the deployed `lumina-live` function under concurrent students.
- **Integration** of the Stage A7 scheduler into `useLuminaLiveSession` — the hook still ingests events directly. A7 shipped as an unlinked module by design; A8 does not change that.

These are not failures of A8; they are the honest edge of what an in-process harness can assert. Closing them is Phase A9 work (browser + live-service benchmark harness) and should be scoped explicitly, not rolled into A8.

---

## 6. Reproducing the run

```bash
bun run scripts/lseA8Integration.test.ts
```

Exit code 0 with `83 passed / 0 failed` is the acceptance criterion. Any change to A2–A7 module semantics that breaks this harness must be treated as a regression against Phase A.

---

## 7. Recommended next stage (A9, if approved)

A live-service benchmark harness:

1. Playwright script that authenticates two browser contexts (teacher + student) against the preview URL.
2. Teacher context issues `insert` calls into `lesson_events` on a controlled timer.
3. Student context subscribes to the lesson channel and instruments:
   - broadcast-received timestamp
   - `POST /lumina-live` request-start timestamp
   - first `event: token` timestamp
   - DOM paint timestamp
4. Emit p50/p95/p99 per-hop and per-total across ≥ 100 events.
5. Repeat under a 200-event burst; assert loss = 0 and p95 total < 1.5 s.

That is the only harness that can honestly answer the question in the user's brief. A8 gives the deterministic floor; A9 gives the wall-clock ceiling.
