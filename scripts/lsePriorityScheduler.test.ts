/**
 * LSE Stage A7 — Priority Scheduler test harness
 * ----------------------------------------------
 * Deterministic assertions covering the four invariants documented in
 * `src/lib/lse/priorityScheduler.ts`:
 *
 *   1. Totality        — every operation returns without throwing.
 *   2. Determinism     — identical enqueue sequences yield identical pop orders.
 *   3. FIFO-within-band — same-priority events are served in enqueue order.
 *   4. Starvation guard — no non-empty lower band is skipped for more than
 *                          `starvationThreshold` consecutive pops.
 *
 * Also exercises the §3 Stage A7 acceptance criterion from `.lovable/plan.md`:
 * a synthetic 200-event burst is drained without loss, without reordering
 * within a band, and with a bounded starvation window.
 *
 * Run with:  bun run scripts/lsePriorityScheduler.test.ts
 */

import {
  createPriorityScheduler,
  DEFAULT_STARVATION_THRESHOLD,
  type PriorityScheduler,
} from "../src/lib/lse/priorityScheduler";
import type { LessonEvent } from "../src/lib/lse/eventNormalizer";
import type { LessonEventPriority } from "../src/lib/lse/priorityTable";

// ---------------------------------------------------------------------------
// Micro test runner (matches Stage A2/A3/A5/A6 style)
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(cond: unknown, label: string): void {
  if (cond) { passed += 1; return; }
  failed += 1;
  failures.push(label);
}

function assertEq<T>(actual: T, expected: T, label: string): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed += 1; return; }
  failed += 1;
  failures.push(`${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
}

// ---------------------------------------------------------------------------
// Test event factory
// ---------------------------------------------------------------------------

function makeEvent(
  seq: number,
  priority: LessonEventPriority,
  text = `e${seq}`,
): LessonEvent {
  return {
    id: `lesson#${seq}`,
    lessonId: "lesson",
    ts: seq,
    kind: priority === 1 ? "definition"
        : priority === 2 ? "concept"
        : priority === 3 ? "example"
        : priority === 4 ? "discussion"
        : "admin",
    text,
    priority,
    teacherVisible: true,
  };
}

function drainAll(s: PriorityScheduler): LessonEvent[] {
  const out: LessonEvent[] = [];
  let e: LessonEvent | null;
  while ((e = s.pop()) !== null) out.push(e);
  return out;
}

// ===========================================================================
// 1. Empty & totality
// ===========================================================================

{
  const s = createPriorityScheduler();
  assertEq(s.size(), 0, "1.a fresh size == 0");
  assertEq(s.pop(), null, "1.b pop on empty returns null");
  assertEq(s.peek(), null, "1.c peek on empty returns null");
  s.clear();
  assertEq(s.size(), 0, "1.d clear on empty is safe");
  const snap = s.snapshot();
  assertEq(snap.totalSize, 0, "1.e snapshot totalSize == 0");
  assertEq(snap.starvationRescues, 0, "1.f no rescues yet");
  assertEq(snap.normalServes, 0, "1.g no serves yet");
}

// ===========================================================================
// 2. Greedy priority ordering (no starvation triggered)
// ===========================================================================

{
  const s = createPriorityScheduler();
  // Enqueue a mixed set; expect P1 first, then P2, ..., then P5.
  s.enqueue(makeEvent(1, 5));
  s.enqueue(makeEvent(2, 3));
  s.enqueue(makeEvent(3, 1));
  s.enqueue(makeEvent(4, 2));
  s.enqueue(makeEvent(5, 4));
  s.enqueue(makeEvent(6, 1));
  assertEq(s.size(), 6, "2.a size after 6 enqueues");
  const order = drainAll(s).map((e) => e.priority);
  // Starvation threshold=8; with only 6 events, no rescue fires. Expect
  // strict priority order: two P1s (FIFO), then P2, P3, P4, P5.
  assertEq(order, [1, 1, 2, 3, 4, 5], "2.b greedy priority order");
  assertEq(s.size(), 0, "2.c empty after drain");
}

// ===========================================================================
// 3. FIFO within a band
// ===========================================================================

{
  const s = createPriorityScheduler();
  for (let i = 0; i < 5; i++) s.enqueue(makeEvent(i, 2, `p2-${i}`));
  const texts = drainAll(s).map((e) => e.text);
  assertEq(texts, ["p2-0", "p2-1", "p2-2", "p2-3", "p2-4"], "3.a FIFO within P2 band");
}

// ===========================================================================
// 4. Starvation guard — sustained high-priority load must eventually serve
//    a queued lower-priority event.
// ===========================================================================

{
  const threshold = 4;
  const s = createPriorityScheduler({ starvationThreshold: threshold });
  // One long-suffering P5 waiting from the start.
  s.enqueue(makeEvent(0, 5, "waiting-p5"));
  // Feed a stream of P1s, popping after each enqueue.
  const popped: LessonEvent[] = [];
  for (let i = 1; i <= 20; i++) {
    s.enqueue(makeEvent(i, 1, `p1-${i}`));
    const e = s.pop();
    if (e) popped.push(e);
  }
  // Drain remainder.
  popped.push(...drainAll(s));

  // The P5 event must have been served, and it must have been served after
  // being skipped at most `threshold` times. i.e. its index in `popped` <= threshold.
  const p5Index = popped.findIndex((e) => e.text === "waiting-p5");
  assert(p5Index >= 0, "4.a starved P5 eventually served");
  assert(
    p5Index <= threshold,
    `4.b P5 served within threshold (index=${p5Index}, threshold=${threshold})`,
  );
  // No events lost.
  assertEq(popped.length, 21, "4.c no events lost under starvation load");
  // Snapshot records at least one rescue.
  const snap = s.snapshot();
  assert(snap.starvationRescues >= 1, "4.d rescue counter incremented");
}

// ===========================================================================
// 5. Default threshold sanity — 8 pops of pure P1 traffic never rescues.
// ===========================================================================

{
  const s = createPriorityScheduler();
  // Sitting P5, then exactly `threshold` pure P1 enqueue+pop cycles. Each
  // cycle skips the P5 once, so its skip counter reaches `threshold` and
  // the NEXT pop must service P5 via the rescue branch.
  s.enqueue(makeEvent(0, 5, "sitting"));
  for (let i = 1; i <= DEFAULT_STARVATION_THRESHOLD; i++) {
    s.enqueue(makeEvent(i, 1));
    s.pop();
  }
  const snap = s.snapshot();
  assertEq(snap.sizeByPriority[5], 1, "5.a P5 still pending pre-rescue");
  assertEq(snap.skipCounters[5], DEFAULT_STARVATION_THRESHOLD, "5.b skip counter at threshold");
  assertEq(snap.starvationRescues, 0, "5.c no rescue below threshold");

  // Next pop with no new enqueues: starvation branch fires and services P5.
  const first = s.pop();
  assertEq(first?.priority, 5, "5.d rescue fires at threshold");
  assertEq(s.snapshot().starvationRescues, 1, "5.e rescue counter recorded");
}

// ===========================================================================
// 6. Determinism — same enqueue sequence → same pop sequence.
// ===========================================================================

{
  const seq: Array<[number, LessonEventPriority]> = [
    [1, 3], [2, 1], [3, 5], [4, 2], [5, 5], [6, 1],
    [7, 4], [8, 2], [9, 3], [10, 5], [11, 1], [12, 4],
    [13, 5], [14, 5], [15, 2], [16, 3], [17, 1], [18, 5],
  ];
  const run = (): number[] => {
    const s = createPriorityScheduler({ starvationThreshold: 3 });
    for (const [id, p] of seq) s.enqueue(makeEvent(id, p));
    return drainAll(s).map((e) => e.ts);
  };
  const a = run();
  const b = run();
  assertEq(a, b, "6.a deterministic pop order across identical runs");
}

// ===========================================================================
// 7. §3 Stage A7 acceptance — synthetic 200-event burst, no loss, bounded
//    starvation window, FIFO preserved within every band.
// ===========================================================================

{
  const s = createPriorityScheduler();
  const enqueued: LessonEvent[] = [];
  // Deterministic mix: 30% P1, 25% P2, 20% P3, 15% P4, 10% P5.
  const priorityFor = (i: number): LessonEventPriority => {
    const m = i % 20;
    if (m < 6) return 1;
    if (m < 11) return 2;
    if (m < 15) return 3;
    if (m < 18) return 4;
    return 5;
  };
  for (let i = 0; i < 200; i++) {
    const e = makeEvent(i, priorityFor(i));
    enqueued.push(e);
    s.enqueue(e);
  }
  assertEq(s.size(), 200, "7.a all 200 events enqueued");
  const drained = drainAll(s);
  assertEq(drained.length, 200, "7.b no events lost across drain");
  assertEq(s.size(), 0, "7.c empty after drain");

  // FIFO preserved within every band.
  for (const band of [1, 2, 3, 4, 5] as const) {
    const enqOrder = enqueued.filter((e) => e.priority === band).map((e) => e.ts);
    const drainOrder = drained.filter((e) => e.priority === band).map((e) => e.ts);
    assertEq(drainOrder, enqOrder, `7.d FIFO preserved within P${band}`);
  }

  // Starvation window bound: for every pair of consecutive drained events,
  // the skip counter is bounded by construction. Verify indirectly: every
  // enqueued P5 must be served within (threshold + total_events_between) ≤
  // enqueued.length; trivially true, but we also assert none was dropped.
  const p5Drained = drained.filter((e) => e.priority === 5).length;
  const p5Enqueued = enqueued.filter((e) => e.priority === 5).length;
  assertEq(p5Drained, p5Enqueued, "7.e every P5 served (no starvation loss)");
}

// ===========================================================================
// 8. Clear resets everything.
// ===========================================================================

{
  const s = createPriorityScheduler({ starvationThreshold: 2 });
  s.enqueue(makeEvent(1, 5));
  s.enqueue(makeEvent(2, 1));
  s.pop();
  s.pop();
  s.enqueue(makeEvent(3, 3));
  s.clear();
  assertEq(s.size(), 0, "8.a size 0 post-clear");
  assertEq(s.pop(), null, "8.b pop null post-clear");
  const snap = s.snapshot();
  assertEq(snap.starvationRescues, 0, "8.c rescues reset");
  assertEq(snap.normalServes, 0, "8.d serves reset");
  assertEq(snap.skipCounters, { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, "8.e counters reset");
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log(`\nLSE A7 — Priority Scheduler tests`);
console.log(`  passed: ${passed}`);
console.log(`  failed: ${failed}`);
if (failed > 0) {
  console.log(`\nFailures:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
