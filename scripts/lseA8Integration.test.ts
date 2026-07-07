/**
 * LSE Stage A8 — End-to-end integration & synchronization validation
 * ------------------------------------------------------------------
 * This harness stitches every A1–A7 subsystem into one in-process pipeline
 * and asserts the invariants Phase A promised. It is deliberately HONEST
 * about what it can and cannot measure from a Node/Bun process (no browser
 * Realtime socket, no live edge function, no gateway model). The dossier
 * (`.lovable/lse-A8-dossier.md`) enumerates what remains unvalidated and
 * requires a live classroom harness.
 *
 * Pipeline exercised end-to-end:
 *
 *     LessonEventBroadcastPayload           ← Stage A1 wire shape
 *         │  payloadToLessonEvent           ← Stage A5 rehydrator (payload→LessonEvent)
 *         ▼
 *     LessonEvent                            ← Stage A2 typed event shape
 *         │  classifyIntake                  ← Stage A5 ordering gate (dedup/gap)
 *         ▼
 *     accepted LessonEvent
 *         │  reduce                          ← Stage A3 pure fold
 *         ▼
 *     LessonState
 *         │  writeFromState                  ← Stage A6 identity-preserving cache
 *         ▼
 *     CachedContextProjection
 *         │  enqueue                         ← Stage A7 priority scheduler
 *         ▼
 *     scheduled admission (P1..P5 FIFO)     — consumer would call POST /lumina-live
 *
 * The upstream (Stage A1 DB trigger, Stage A4 SSE edge function, Stage A5
 * WebSocket subscription) is stubbed with a deterministic in-memory emitter
 * because their observable outputs are the *inputs* to this harness — those
 * layers already ship their own tests and dossiers.
 *
 * Run with:  bun run scripts/lseA8Integration.test.ts
 */

import { payloadToLessonEvent, classifyIntake, projectCachedContext, type LessonEventBroadcastPayload } from "../src/lib/lse/sessionInternals";
import { initialState, reduce, fold, statesEqual, type LessonState } from "../src/lib/lse/lessonReducer";
import { createContextCache } from "../src/lib/lse/contextCache";
import { createPriorityScheduler } from "../src/lib/lse/priorityScheduler";
import type { LessonEvent } from "../src/lib/lse/eventNormalizer";
import type { LessonEventKind, LessonEventPriority } from "../src/lib/lse/priorityTable";
import { PRIORITY_TABLE } from "../src/lib/lse/priorityTable";

// ---------------------------------------------------------------------------
// Micro test runner (matches earlier A-series style)
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures: string[] = [];
function assert(cond: unknown, label: string): void {
  if (cond) { passed += 1; return; }
  failed += 1; failures.push(label);
}
function assertEq<T>(actual: T, expected: T, label: string): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed += 1; return; }
  failed += 1;
  failures.push(`${label}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
}

// ---------------------------------------------------------------------------
// Test fixtures — deterministic broadcast payload generator
// ---------------------------------------------------------------------------

const KIND_CYCLE: readonly LessonEventKind[] = [
  "concept", "definition", "example", "question",
  "formula", "discussion", "admin", "silence",
];

function makePayload(seq: number, kind: LessonEventKind, text?: string): LessonEventBroadcastPayload {
  return {
    seq,
    kind,
    priority: PRIORITY_TABLE[kind],
    teacher_visible: kind !== "silence" && kind !== "admin",
    concept_ref: kind === "concept" ? `concept-${seq}` : null,
    text: text ?? `[${kind}] utterance #${seq}`,
    ts: new Date(1_700_000_000_000 + seq * 1000).toISOString(),
  };
}

function generateLesson(count: number): LessonEventBroadcastPayload[] {
  const out: LessonEventBroadcastPayload[] = [];
  for (let i = 1; i <= count; i++) {
    // Deterministic classroom rhythm: cycles through all kinds, sprinkling
    // priority 1 formulas/definitions to exercise both scheduler branches.
    const kind = KIND_CYCLE[(i * 3) % KIND_CYCLE.length];
    out.push(makePayload(i, kind));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Single-student pipeline instance
// ---------------------------------------------------------------------------

interface StudentPipeline {
  readonly lessonId: string;
  state: LessonState;
  lastSeq: number;
  readonly cache: ReturnType<typeof createContextCache>;
  readonly scheduler: ReturnType<typeof createPriorityScheduler>;
  /** Diagnostic counters. */
  readonly stats: {
    accepted: number;
    duplicates: number;
    gaps: number;
    invalid: number;
    cacheIdentityReuses: number;
  };
}

function createStudent(lessonId: string): StudentPipeline {
  return {
    lessonId,
    state: initialState(lessonId),
    lastSeq: 0,
    cache: createContextCache({ capacity: 8 }),
    scheduler: createPriorityScheduler(),
    stats: { accepted: 0, duplicates: 0, gaps: 0, invalid: 0, cacheIdentityReuses: 0 },
  };
}

/** Run one broadcast payload through every stage. Returns the accepted event or null. */
function ingest(student: StudentPipeline, raw: unknown): LessonEvent | null {
  const event = payloadToLessonEvent(student.lessonId, raw);
  if (!event) { student.stats.invalid += 1; return null; }

  const gate = classifyIntake(event, student.lastSeq);
  if (!gate.accepted) {
    if (gate.reason === "duplicate") student.stats.duplicates += 1;
    else if (gate.reason === "gap") student.stats.gaps += 1;
    else student.stats.invalid += 1;
    return null;
  }
  student.lastSeq = gate.seq!;

  const prevProjectionRef = student.cache.read(student.lessonId)?.projection;
  student.state = reduce(student.state, event);
  const entry = student.cache.writeFromState(student.state, student.lastSeq);
  if (prevProjectionRef && entry.projection === prevProjectionRef) {
    student.stats.cacheIdentityReuses += 1;
  }
  student.scheduler.enqueue(event);
  student.stats.accepted += 1;
  return event;
}

// ===========================================================================
// TEST 1 — Full pipeline: 200-event burst, no loss, deterministic ordering
// ===========================================================================

{
  const payloads = generateLesson(200);
  const s = createStudent("lesson-burst");
  const ingestStart = process.hrtime.bigint();
  for (const p of payloads) ingest(s, p);
  const ingestNs = Number(process.hrtime.bigint() - ingestStart);

  assertEq(s.stats.accepted, 200, "1.a all 200 payloads accepted through gate");
  assertEq(s.stats.duplicates, 0, "1.b no duplicates classified");
  assertEq(s.stats.gaps, 0, "1.c no gaps classified");
  assertEq(s.stats.invalid, 0, "1.d no invalid payloads");
  assertEq(s.state.version, 200, "1.e reducer version == accepted count");
  assertEq(s.scheduler.size(), 200, "1.f every event enqueued to scheduler");

  // Drain scheduler; assert no loss and FIFO-within-band preserved.
  const drained: LessonEvent[] = [];
  let popped;
  while ((popped = s.scheduler.pop()) !== null) drained.push(popped);
  assertEq(drained.length, 200, "1.g scheduler drained all events");

  for (const band of [1, 2, 3, 4, 5] as const) {
    const enqOrder = payloads.filter(p => p.priority === band).map(p => p.seq);
    const drainOrder = drained.filter(e => e.priority === band).map(e => Number(e.id.split("#")[1]));
    assertEq(drainOrder, enqOrder, `1.h FIFO preserved within P${band}`);
  }

  // Per-event overhead: total pipeline (excluding scheduler drain) / 200.
  const perEventUs = (ingestNs / 200) / 1000;
  console.log(`  [T1] pipeline ingest overhead: ${perEventUs.toFixed(2)} µs/event (200 events in ${(ingestNs/1e6).toFixed(2)} ms)`);
  // Sanity ceiling: even at 1ms/event this is 5000× below the 1.5s p95 budget.
  assert(perEventUs < 1000, "1.i pipeline overhead <1ms per event (in-process)");
}

// ===========================================================================
// TEST 2 — Ordering gate: duplicates and gaps rejected without corrupting state
// ===========================================================================

{
  const s = createStudent("lesson-order");
  const p1 = makePayload(1, "concept");
  const p2 = makePayload(2, "definition");
  const p3 = makePayload(3, "formula");

  ingest(s, p1);
  ingest(s, p1); // duplicate
  ingest(s, p3); // gap (missing seq=2)
  ingest(s, p2); // in-order fill
  ingest(s, p3); // now in-order

  assertEq(s.stats.accepted, 3, "2.a exactly 3 events folded");
  assertEq(s.stats.duplicates, 1, "2.b duplicate detected");
  assertEq(s.stats.gaps, 1, "2.c gap detected");
  assertEq(s.state.version, 3, "2.d state version reflects only accepted events");
  assertEq(s.lastSeq, 3, "2.e lastSeq advanced to 3");
}

// ===========================================================================
// TEST 3 — Multi-student synchronization: shared events → identical state
// ===========================================================================

{
  const payloads = generateLesson(120);
  const students = Array.from({ length: 25 }, (_, i) => createStudent(`shared-lesson`));
  for (const p of payloads) for (const s of students) ingest(s, p);

  const reference = students[0].state;
  for (let i = 1; i < students.length; i++) {
    assert(statesEqual(reference, students[i].state), `3.a student ${i} state matches reference`);
  }
  // Projections must be structurally identical too (that's what the edge
  // function sees). Compare JSON of the cached projection for each student.
  const refProj = JSON.stringify(students[0].cache.read("shared-lesson")!.projection);
  for (let i = 1; i < students.length; i++) {
    const proj = JSON.stringify(students[i].cache.read("shared-lesson")!.projection);
    assert(proj === refProj, `3.b student ${i} cached projection matches reference`);
  }
}

// ===========================================================================
// TEST 4 — Recovery consistency: late-joiner replaying from seq=1
//          reaches the same state as an always-connected student.
// ===========================================================================

{
  const payloads = generateLesson(150);
  const live = createStudent("recovery-lesson");
  for (const p of payloads) ingest(live, p);

  // Late joiner replays the same broadcast log from scratch.
  const late = createStudent("recovery-lesson");
  for (const p of payloads) ingest(late, p);

  assert(statesEqual(live.state, late.state), "4.a live and late-joiner states converge");
  assertEq(late.state.version, live.state.version, "4.b versions equal after replay");

  // Also: fold() (Stage A3 direct fold) must yield the same state as the
  // event-by-event ingest path — proves the wrappers don't distort the fold.
  const events: LessonEvent[] = [];
  for (const p of payloads) {
    const e = payloadToLessonEvent("recovery-lesson", p);
    if (e) events.push(e);
  }
  const direct = fold("recovery-lesson", events);
  assert(statesEqual(direct, live.state), "4.c fold(events) == ingest-path state");
}

// ===========================================================================
// TEST 5 — Determinism: identical broadcast sequence yields identical
//          scheduler emission order, cache contents, and reducer state.
// ===========================================================================

{
  const payloads = generateLesson(80);
  function run() {
    const s = createStudent("det-lesson");
    for (const p of payloads) ingest(s, p);
    const order: number[] = [];
    let e;
    while ((e = s.scheduler.pop()) !== null) order.push(Number(e.id.split("#")[1]));
    return {
      order,
      version: s.state.version,
      timelineLen: s.state.timeline.length,
      stack: s.state.conceptStack.map(c => c.id),
      projJson: JSON.stringify(projectCachedContext(s.state)),
    };
  }
  const a = run();
  const b = run();
  assertEq(a, b, "5.a two independent runs produce byte-identical outputs");
}

// ===========================================================================
// TEST 6 — Cancellation / preemption modeling.
//          The scheduler itself does not cancel in-flight inference — that
//          is the hook's abort-controller responsibility (Stage A5).
//          What we CAN validate here: when a P1 correction event arrives
//          after a queue of lower-priority admissions, the scheduler emits
//          the P1 BEFORE any queued P3/P4/P5, so the hook has an opportunity
//          to preempt at the earliest possible tick.
// ===========================================================================

{
  const s = createStudent("cancel-lesson");
  // Fill scheduler with 5 discussion / example / admin events (P3–P5).
  const filler: LessonEvent[] = [];
  for (let i = 1; i <= 5; i++) {
    const p = makePayload(i, i % 2 ? "discussion" : "example");
    ingest(s, p);
    filler.push(payloadToLessonEvent(s.lessonId, p)!);
  }
  // Then a P1 correction arrives.
  const correction = makePayload(6, "formula", "correction: E = mc^2");
  ingest(s, correction);

  const first = s.scheduler.pop();
  assertEq(first?.priority, 1, "6.a P1 correction emitted before lower-priority backlog");
  assertEq(first?.text, "correction: E = mc^2", "6.b correction text preserved");
  // Backlog remains in FIFO order and is drained after.
  const rest: LessonEvent[] = [];
  let e;
  while ((e = s.scheduler.pop()) !== null) rest.push(e);
  assertEq(rest.length, 5, "6.c backlog fully drained after P1");
  // Backlog is served in priority order (P3 examples before P4 discussions),
  // FIFO within each band. Filler ids: 1=discussion,2=example,3=discussion,
  // 4=example,5=discussion → expected drain: [2,4,1,3,5].
  const expectedBacklog = [2, 4, 1, 3, 5];
  for (let i = 0; i < 5; i++) {
    assertEq(rest[i].id, `cancel-lesson#${expectedBacklog[i]}`, `6.d backlog[${i}] served in priority+FIFO order`);
  }
}

// ===========================================================================
// TEST 7 — Stability: memory usage stays bounded on a long-running lesson.
//          Cache is capped at 8 entries per constructor above; timeline is
//          capped at TIMELINE_CAPACITY by the reducer; scheduler is
//          drained continuously by a simulated consumer.
// ===========================================================================

{
  const s = createStudent("long-lesson");
  const consumed: number[] = [];
  for (let i = 1; i <= 5_000; i++) {
    const p = makePayload(i, KIND_CYCLE[(i * 7) % KIND_CYCLE.length]);
    ingest(s, p);
    // Consumer drains one event per tick to simulate a steady inference loop.
    const popped = s.scheduler.pop();
    if (popped) consumed.push(Number(popped.id.split("#")[1]));
  }
  // Drain remainder.
  let e;
  while ((e = s.scheduler.pop()) !== null) consumed.push(Number(e.id.split("#")[1]));

  assertEq(s.stats.accepted, 5000, "7.a 5000 events accepted over long-running lesson");
  assertEq(consumed.length, 5000, "7.b every event consumed exactly once");
  assert(s.state.timeline.length <= 256, `7.c reducer timeline bounded (len=${s.state.timeline.length})`);
  assert(s.cache.size() <= 8, `7.d cache bounded to capacity (size=${s.cache.size()})`);
}

// ===========================================================================
// TEST 8 — Latency accounting: per-stage pipeline overhead breakdown.
//          Honest note: this is the CLIENT-SIDE overhead only. It excludes:
//            (a) Postgres INSERT + trigger runtime (Stage A1)
//            (b) Realtime broadcast socket delivery
//            (c) POST /lumina-live network RTT + gateway first-token
//            (d) SSE render loop
//          Those four dominate the p95 <1.5s budget and can only be
//          measured with a live browser harness — see the dossier.
// ===========================================================================

{
  const payloads = generateLesson(1000);
  const s = createStudent("latency-lesson");
  const perStage = { rehydrate: 0n, gate: 0n, reduce: 0n, cache: 0n, schedule: 0n };

  for (const p of payloads) {
    let t = process.hrtime.bigint();
    const event = payloadToLessonEvent(s.lessonId, p)!;
    perStage.rehydrate += process.hrtime.bigint() - t;

    t = process.hrtime.bigint();
    const gate = classifyIntake(event, s.lastSeq);
    perStage.gate += process.hrtime.bigint() - t;
    if (!gate.accepted) continue;
    s.lastSeq = gate.seq!;

    t = process.hrtime.bigint();
    s.state = reduce(s.state, event);
    perStage.reduce += process.hrtime.bigint() - t;

    t = process.hrtime.bigint();
    s.cache.writeFromState(s.state, s.lastSeq);
    perStage.cache += process.hrtime.bigint() - t;

    t = process.hrtime.bigint();
    s.scheduler.enqueue(event);
    perStage.schedule += process.hrtime.bigint() - t;
  }

  const usPerEvent = (ns: bigint) => (Number(ns) / 1000) / 1000; // µs/event
  console.log(`  [T8] client-side per-stage overhead (µs/event, avg over 1000):`);
  console.log(`         rehydrate  ${usPerEvent(perStage.rehydrate).toFixed(3)}`);
  console.log(`         gate       ${usPerEvent(perStage.gate).toFixed(3)}`);
  console.log(`         reduce     ${usPerEvent(perStage.reduce).toFixed(3)}`);
  console.log(`         cache      ${usPerEvent(perStage.cache).toFixed(3)}`);
  console.log(`         schedule   ${usPerEvent(perStage.schedule).toFixed(3)}`);
  const totalUs = Object.values(perStage).reduce((a, b) => a + Number(b), 0) / 1000 / 1000;
  console.log(`         TOTAL      ${totalUs.toFixed(3)} µs/event`);
  // Well under any perceptible budget; the network+model dominate end-to-end.
  assert(totalUs < 500, "8.a client pipeline <500 µs/event on this host");
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log(`\nLSE A8 — Integration & synchronization validation`);
console.log(`  passed: ${passed}`);
console.log(`  failed: ${failed}`);
if (failed > 0) {
  console.log(`\nFailures:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
