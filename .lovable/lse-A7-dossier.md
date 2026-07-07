# LSE Stage A7 — Priority Scheduler + Starvation Protection

Status: **Shipped**. Verified via `bun run scripts/lsePriorityScheduler.test.ts` — 35/35 assertions pass.

This dossier documents *exactly* what was built, no more. It is the source of truth for reviewers of `src/lib/lse/priorityScheduler.ts` and `scripts/lsePriorityScheduler.test.ts`.

---

## 1. Scope

Stage A7 delivers subsystem **S4** from `.lovable/plan.md`: a deterministic, in-memory, five-band priority scheduler that orders `LessonEvent`s (as normalized in Stage A2 and accepted by the Stage A5 intake gate) into a single service sequence for the streaming inference path.

**In scope**
- Five strict-FIFO queues, one per priority band (`P1..P5`) defined in `src/lib/lse/priorityTable.ts`.
- Greedy highest-priority-first pop order.
- Bounded starvation guard, expressed as a pure "skip counter" on each non-empty queue.
- Telemetry snapshot (`totalSize`, `sizeByPriority`, `skipCounters`, `starvationRescues`, `normalServes`).
- Deterministic test harness including the plan's §3 acceptance criterion (200-event synthetic burst).

**Out of scope (deferred by design)**
- Wall-clock aging. The guard counts `pop`s, not milliseconds, to keep the scheduler reproducible under replay.
- Cross-lesson fairness. One scheduler instance per lesson tab; multi-tab users get independent instances (matches Stage A6 cache model).
- Producer backpressure / per-band caps. Ingress is bounded upstream by the Stage A1 broadcast trigger and A5 intake gate.
- Preemption / cancellation. `useLuminaLiveSession` owns the `AbortController` lifecycle; the scheduler only orders admissions.
- Wiring into `useLuminaLiveSession`. That integration is a separate change and remains pending explicit approval — this stage ships the module and its verification only.

---

## 2. Files delivered

| Path | Purpose |
| --- | --- |
| `src/lib/lse/priorityScheduler.ts` | The scheduler module. Pure, browser-safe, no I/O, no wall clock. |
| `scripts/lsePriorityScheduler.test.ts` | Standalone Bun test harness. Self-reports pass/fail counts. |
| `.lovable/lse-A7-dossier.md` | This document. |

No other project files were modified. No migrations, no edge functions, no hook edits.

---

## 3. Public API (verbatim)

```ts
export const DEFAULT_STARVATION_THRESHOLD = 8;

export interface PrioritySchedulerConfig {
  readonly starvationThreshold: number;
}

export interface SchedulerSnapshot {
  readonly totalSize: number;
  readonly sizeByPriority: Readonly<Record<LessonEventPriority, number>>;
  readonly skipCounters:  Readonly<Record<LessonEventPriority, number>>;
  readonly starvationRescues: number;
  readonly normalServes: number;
}

export interface PriorityScheduler {
  enqueue(event: LessonEvent): void;
  pop(): LessonEvent | null;
  peek(): LessonEvent | null;
  size(): number;
  clear(): void;
  snapshot(): SchedulerSnapshot;
}

export function createPriorityScheduler(
  config?: Partial<PrioritySchedulerConfig>,
): PriorityScheduler;
```

Factory-of-closures style (matches Stage A6). No classes, no `this`, no singletons.

---

## 4. Algorithm (as implemented)

State per instance:

- `queues: Record<1|2|3|4|5, QueuedEnvelope[]>` — one FIFO per band.
- `skip: Record<1|2|3|4|5, number>` — consecutive skip count per band; reset to 0 when that band is serviced.
- `enqueueCounter: number` — monotonic id assigned to every envelope; enforces stable FIFO within a band.
- `starvationRescues`, `normalServes` — cumulative counters for telemetry.

### `enqueue(event)`
Push `{ event, enqueueIndex: enqueueCounter++ }` onto `queues[event.priority]`. O(1).

### `pop()`
1. **Pick priority.**
   - **Starvation branch:** scan `P1..P5`; among non-empty queues whose `skip[p] >= starvationThreshold`, pick the one with the highest `skip[p]`. On tie, the lowest priority number wins (preserves criticality).
   - **Normal branch:** if no queue qualifies for rescue, pick the smallest priority number with a non-empty queue.
2. `shift` from the chosen queue's FIFO.
3. Reset `skip[chosen] = 0`. For every OTHER non-empty band, `skip[p] += 1`.
4. Increment `starvationRescues` if the chosen band was rescue-eligible at step 1, else `normalServes`.

### `peek()` / `size()` / `clear()` / `snapshot()`
Straightforward. `snapshot` returns a fresh object; internal state is not exposed by reference.

### Determinism
No `Date.now()`, no `Math.random()`, no wall clock, no `performance.now()`. Every output is a pure function of the enqueue sequence and the interleaved `pop` calls.

---

## 5. Starvation semantics — worked example

Configured with the default `starvationThreshold = 8`. A single `P5` sits queued. The teacher then fires a sustained P1 stream, one `enqueue` + one `pop` per tick:

| Tick | Action | `skip[P5]` before pop | Chosen band | `skip[P5]` after pop |
| ---- | ------ | --------------------- | ----------- | -------------------- |
| 1    | enq P1 → pop | 0 | P1 (normal) | 1 |
| 2    | enq P1 → pop | 1 | P1 (normal) | 2 |
| ...  | ...    | ...                    | P1 (normal) | ... |
| 8    | enq P1 → pop | 7 | P1 (normal) | 8 |
| 9    | pop         | 8 | **P5 (rescue)** | reset to 0 |

Bound: **any non-empty lower-priority band is guaranteed service within `starvationThreshold + 1` pops after it becomes eligible.** At the plan-calibrated teacher rate of ~1 event/sec this puts worst-case wait at ~9s, below the 10s "student perceives lag" threshold called out in the plan.

`starvationRescues` is incremented on step 4 of `pop` iff the chosen band's counter was at or above threshold *before* the reset. `normalServes` covers every other pop.

---

## 6. Test coverage (`scripts/lsePriorityScheduler.test.ts`, 35 assertions)

Each block corresponds to a load-bearing invariant.

| Block | Invariant                             | Assertions |
| ----- | ------------------------------------- | ---------- |
| 1     | Totality on empty scheduler           | 7          |
| 2     | Greedy priority ordering (no rescue)  | 3          |
| 3     | FIFO within a band                    | 1          |
| 4     | Starvation guard eventually serves and loses no events | 4 |
| 5     | Rescue fires *exactly* at threshold; not one pop earlier | 5 |
| 6     | Determinism — identical enqueue sequences yield identical pop sequences | 1 |
| 7     | §3 Stage A7 acceptance — 200-event burst; per-band FIFO preserved; no loss | 9 (5 per-band FIFO + 4 aggregate) |
| 8     | `clear` resets queues, counters, and telemetry | 5 |

Command:

```bash
bun run scripts/lsePriorityScheduler.test.ts
```

Result at ship time:

```
LSE A7 — Priority Scheduler tests
  passed: 35
  failed: 0
```

---

## 7. Integration boundary (informational, not delivered here)

`useLuminaLiveSession` (Stage A5) will consume the scheduler as follows, in a future edit:

1. On broadcast intake acceptance (Stage A5 gate returns `ok`), call `scheduler.enqueue(event)` instead of dispatching directly to the reducer.
2. A microtask drain loop calls `scheduler.pop()` until it returns `null`, feeding each event through the Stage A3 reducer and (for events that produce a delta) the Stage A6 cache + `POST /lumina-live`.
3. Preemption remains the hook's responsibility — the scheduler does not know about the abort controller.

This wiring is intentionally a separate change so Stage A7 can be reviewed in isolation.

---

## 8. Change control

Any modification to the pick algorithm, the counter update rule, or `DEFAULT_STARVATION_THRESHOLD` requires updating this dossier and the acceptance test in the same commit. The plan's §3 acceptance criterion (200-event burst, no loss, bounded wait) is the regression floor.
