/**
 * LSE — Priority Scheduler (Stage A7)
 * -----------------------------------
 * Five strict-FIFO queues, one per priority band (P1..P5) defined in
 * `priorityTable.ts`. The consumer loop drains higher-priority items first
 * (P1 before P2 before ... before P5), with a bounded **starvation guard**
 * that guarantees no non-empty lower-priority queue is deferred forever
 * when higher-priority traffic is sustained.
 *
 * Purpose (per `.lovable/plan.md` §2/S4 and §3 Stage A7):
 *   - Serialize the reducer-accepted event stream (from the Stage A5 intake
 *     gate) into a single, predictable service order that respects the
 *     content-criticality ranking baked into `PRIORITY_TABLE`.
 *   - Prevent two failure modes that a naive greedy priority queue exhibits:
 *       (a) *Preemption thrash* — every P1 arrival tearing down an in-flight
 *           inference. Preemption is a hook-layer decision (Stage A5's
 *           newest-wins abort), not a scheduler concern; the scheduler
 *           merely orders admissions.
 *       (b) *Priority inversion / starvation* — a chatty P1/P2 teacher (many
 *           definitions and questions) permanently starving a queued P3
 *           worked example or P4 discussion prompt. The starvation guard
 *           below forces service to any queue that has been passed over
 *           `starvationThreshold` consecutive pops.
 *
 * Non-goals (deferred by design):
 *   - **Wall-clock aging.** We count `pop`s, not milliseconds. This keeps
 *     the scheduler deterministic under test replay: the same enqueue
 *     sequence yields the same service order regardless of how fast the
 *     consumer runs.
 *   - **Cross-lesson fairness.** One scheduler per lesson tab. Multi-tab
 *     users get independent schedulers, matching the Stage A6 cache model.
 *   - **Backpressure to the producer.** The scheduler is unbounded on the
 *     ingress side; the Stage A1 broadcast trigger and Stage A5 intake gate
 *     bound event arrival rate upstream. If a future load benchmark shows
 *     memory pressure, a per-queue cap belongs here — not today.
 *   - **Preemption / cancellation.** Popping an item does not cancel
 *     anything else. `useLuminaLiveSession` owns the `AbortController`
 *     lifecycle. The scheduler simply orders admissions.
 *
 * Design constraints (load-bearing):
 *   1. **Deterministic** — for any enqueue sequence and any interleaving
 *      of `pop` calls, the emitted order is a pure function of the inputs.
 *      No `Date.now()`, no `Math.random()`, no wall clock.
 *   2. **Total** — every operation returns a well-defined value; `pop` on
 *      an empty scheduler returns `null` rather than throwing.
 *   3. **FIFO within a band** — two events with the same priority MUST be
 *      served in enqueue order. Tie-breaks use a monotonic enqueue counter,
 *      not the event's `ts` (which the teacher clock owns and may skew).
 *   4. **Bounded skip counter** — no lower-priority queue is skipped for
 *      more than `starvationThreshold` consecutive pops while non-empty.
 */

import type { LessonEvent } from "./eventNormalizer";
import type { LessonEventPriority } from "./priorityTable";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

const PRIORITIES: readonly LessonEventPriority[] = [1, 2, 3, 4, 5] as const;

export interface PrioritySchedulerConfig {
  /**
   * Maximum number of consecutive `pop`s during which a non-empty
   * lower-priority queue may be skipped by higher-priority traffic.
   * On the (skipCount + 1)-th pop, the most-starved non-empty queue is
   * force-serviced regardless of band. Default: 8.
   *
   * Rationale for 8: at a teacher rate of ~1 event/sec, an 8-pop skip
   * ceiling caps worst-case wait at ~8s for a P3 example under sustained
   * P1/P2 load, which is below the 10s "student perceives lag" threshold
   * calibrated by ALE. Adjustable per-lesson if load tests demand it.
   */
  readonly starvationThreshold: number;
}

export const DEFAULT_STARVATION_THRESHOLD = 8;

export interface SchedulerSnapshot {
  readonly totalSize: number;
  readonly sizeByPriority: Readonly<Record<LessonEventPriority, number>>;
  readonly skipCounters: Readonly<Record<LessonEventPriority, number>>;
  /** Total events served via the starvation-guard branch, cumulative. */
  readonly starvationRescues: number;
  /** Total events served via the normal highest-priority branch. */
  readonly normalServes: number;
}

export interface PriorityScheduler {
  /** Append an event to the end of its priority band. O(1). */
  enqueue(event: LessonEvent): void;

  /**
   * Remove and return the next event to service, or `null` if empty.
   * Ordering rules (checked in this exact order):
   *   1. If any non-empty queue's `skipCounter >= starvationThreshold`,
   *      pick the most-starved queue (highest counter; on tie, lowest
   *      priority number wins to preserve the criticality ranking).
   *   2. Otherwise pick the non-empty queue with the smallest priority
   *      number (highest priority band).
   * After a pick, the chosen queue's counter resets to 0 and every OTHER
   * non-empty queue's counter increments by 1.
   */
  pop(): LessonEvent | null;

  /** Return the next event without removing it. Does not mutate counters. */
  peek(): LessonEvent | null;

  /** Total pending events across all bands. */
  size(): number;

  /** Drop every pending event and reset counters. Used on lesson teardown. */
  clear(): void;

  /**
   * Debug / telemetry snapshot. Returns a fresh object so callers cannot
   * mutate internal state via the snapshot.
   */
  snapshot(): SchedulerSnapshot;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

interface QueuedEnvelope {
  readonly event: LessonEvent;
  /** Monotonic enqueue index; tie-break within a band and stable across pops. */
  readonly enqueueIndex: number;
}

/**
 * Construct a fresh scheduler. Two schedulers created with the same config
 * share no state — the module holds no singletons.
 *
 * We back each band with a plain `Array<QueuedEnvelope>` used as a FIFO via
 * `push` + `shift`. `shift` is O(n) in theory; in practice the per-band
 * queue depth is tiny (typically < 32) and V8/JSC optimize `shift` on small
 * arrays into O(1) for our purposes. If a benchmark ever shows this on the
 * hot path, swap in a ring buffer without changing the public API.
 */
export function createPriorityScheduler(
  config: Partial<PrioritySchedulerConfig> = {},
): PriorityScheduler {
  const starvationThreshold = Math.max(
    1,
    Math.floor(config.starvationThreshold ?? DEFAULT_STARVATION_THRESHOLD),
  );

  const queues: Record<LessonEventPriority, QueuedEnvelope[]> = {
    1: [], 2: [], 3: [], 4: [], 5: [],
  };
  const skip: Record<LessonEventPriority, number> = {
    1: 0, 2: 0, 3: 0, 4: 0, 5: 0,
  };
  let enqueueCounter = 0;
  let starvationRescues = 0;
  let normalServes = 0;

  function pickPriority(): LessonEventPriority | null {
    // Starvation branch: any non-empty queue at/above the skip ceiling wins.
    let starved: LessonEventPriority | null = null;
    let starvedSkip = -1;
    for (const p of PRIORITIES) {
      if (queues[p].length === 0) continue;
      if (skip[p] >= starvationThreshold && skip[p] > starvedSkip) {
        starved = p;
        starvedSkip = skip[p];
      }
    }
    if (starved !== null) return starved;

    // Normal branch: highest-priority non-empty queue.
    for (const p of PRIORITIES) {
      if (queues[p].length > 0) return p;
    }
    return null;
  }

  return {
    enqueue(event) {
      const envelope: QueuedEnvelope = { event, enqueueIndex: enqueueCounter++ };
      queues[event.priority].push(envelope);
    },

    pop() {
      const chosen = pickPriority();
      if (chosen === null) return null;
      const envelope = queues[chosen].shift()!;

      // Bookkeeping: chosen band resets; every OTHER non-empty band ages by 1.
      const wasStarvationRescue = skip[chosen] >= starvationThreshold;
      skip[chosen] = 0;
      for (const p of PRIORITIES) {
        if (p === chosen) continue;
        if (queues[p].length > 0) skip[p] += 1;
      }
      if (wasStarvationRescue) starvationRescues += 1;
      else normalServes += 1;

      return envelope.event;
    },

    peek() {
      const chosen = pickPriority();
      if (chosen === null) return null;
      return queues[chosen][0].event;
    },

    size() {
      let n = 0;
      for (const p of PRIORITIES) n += queues[p].length;
      return n;
    },

    clear() {
      for (const p of PRIORITIES) {
        queues[p].length = 0;
        skip[p] = 0;
      }
      enqueueCounter = 0;
      starvationRescues = 0;
      normalServes = 0;
    },

    snapshot() {
      return {
        totalSize:
          queues[1].length + queues[2].length + queues[3].length +
          queues[4].length + queues[5].length,
        sizeByPriority: {
          1: queues[1].length, 2: queues[2].length, 3: queues[3].length,
          4: queues[4].length, 5: queues[5].length,
        },
        skipCounters: {
          1: skip[1], 2: skip[2], 3: skip[3], 4: skip[4], 5: skip[5],
        },
        starvationRescues,
        normalServes,
      };
    },
  };
}
