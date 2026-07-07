/**
 * LSE Stage A3 — Lesson State Reducer Test Harness
 * ------------------------------------------------
 * Runnable with:  bun run scripts/lseLessonReducer.test.ts
 *
 * Guarantees pinned here:
 *   1. Purity — `reduce` never mutates its inputs. Frozen state and frozen
 *      collections survive a full fold.
 *   2. Determinism — folding the same event sequence twice yields
 *      structurally-equal states.
 *   3. Associativity — for any split point k in a sequence,
 *      `fold(events) == foldFrom(fold(events[..k]), events[k..])`. This is
 *      the invariant that will underwrite snapshot + tail-replay in B3.
 *   4. Per-kind semantics — targeted assertions for each of the 8 event kinds
 *      documented in the Stage A2 priority table.
 *   5. Timeline bound — the ring buffer never exceeds `TIMELINE_CAPACITY`
 *      and always retains the most recent event.
 *   6. Cross-lesson guard — mixing lessonIds throws, never silently corrupts.
 */

import {
  normalize,
  type LessonEvent,
  type RawTeacherUtterance,
} from "../src/lib/lse/eventNormalizer";
import {
  TIMELINE_CAPACITY,
  fold,
  foldFrom,
  initialState,
  reduce,
  statesEqual,
} from "../src/lib/lse/lessonReducer";

// ---------------------------------------------------------------------------
// Deterministic event factory
// ---------------------------------------------------------------------------

const LESSON = "lesson-A3";

function makeIdFactory(prefix: string) {
  let n = 0;
  return () => `${prefix}-${(++n).toString().padStart(4, "0")}`;
}

function makeClock(startMs: number) {
  let t = startMs;
  return () => (t += 10);
}

function evt(
  raw: Omit<RawTeacherUtterance, "lessonId"> & { lessonId?: string },
  clock: () => number,
  idFactory: () => string,
): LessonEvent {
  return normalize(
    { lessonId: raw.lessonId ?? LESSON, ...raw },
    { now: clock, idFactory },
  );
}

function buildCorpus(): LessonEvent[] {
  const clock = makeClock(1_700_000_000_000);
  const id = makeIdFactory("e");
  return [
    evt({ text: "Welcome class, let's begin." }, clock, id),          // admin
    evt({ text: "Today we will study kinematics.", conceptRef: "c.kinematics" }, clock, id), // concept
    evt({ text: "Velocity is defined as the rate of change of position." }, clock, id), // definition
    evt({ text: "F = ma" }, clock, id),                                // formula
    evt({ text: "For example, a car accelerating from rest." }, clock, id), // example
    evt({ text: "What is acceleration?" }, clock, id),                 // question
    evt({ text: "Any thoughts on that?" }, clock, id),                 // question (?-suffix)
    evt({ text: "Moving on, next topic: energy.", conceptRef: "c.energy" }, clock, id), // concept
    evt({ text: "Energy is defined as the capacity to do work." }, clock, id), // definition
    evt({ text: "" }, clock, id),                                      // silence
    evt({ text: "So overall, energy and motion are linked." }, clock, id), // discussion
  ];
}

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(cond: unknown, label: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(label);
    console.error(`  ✗ ${label}`);
  }
}

function section(name: string) {
  console.log(`\n— ${name}`);
}

// ---------------------------------------------------------------------------
// 1. Purity
// ---------------------------------------------------------------------------

section("Purity");
{
  const events = buildCorpus();
  const s0 = initialState(LESSON);
  const frozenBefore = Object.isFrozen(s0.conceptStack);
  const s1 = reduce(s0, events[0]);
  assert(s0.version === 0, "input state.version unchanged after reduce");
  assert(s0.timeline.length === 0, "input state.timeline unchanged after reduce");
  assert(s1.version === 1, "output state.version incremented");
  assert(s1 !== s0, "reduce returns a new object");
  assert(frozenBefore, "initial conceptStack is frozen");
  // Frozen initial collections must not be reused-and-mutated:
  const s2 = reduce(s1, events[1]);
  assert(s0.conceptStack.length === 0, "initial conceptStack still empty after concept event");
  assert(s2.currentConcept?.id === "c.kinematics", "concept transition took effect");
}

// ---------------------------------------------------------------------------
// 2. Determinism
// ---------------------------------------------------------------------------

section("Determinism");
{
  const a = fold(LESSON, buildCorpus());
  const b = fold(LESSON, buildCorpus());
  assert(statesEqual(a, b), "two folds over identical corpora are structurally equal");
  assert(a.version === buildCorpus().length, "version equals number of applied events");
}

// ---------------------------------------------------------------------------
// 3. Associativity (property test over every split point)
// ---------------------------------------------------------------------------

section("Associativity of fold");
{
  const events = buildCorpus();
  const whole = fold(LESSON, events);
  let allEqual = true;
  for (let k = 0; k <= events.length; k++) {
    const left = fold(LESSON, events.slice(0, k));
    const combined = foldFrom(left, events.slice(k));
    if (!statesEqual(whole, combined)) {
      allEqual = false;
      failures.push(`associativity broke at split k=${k}`);
      break;
    }
  }
  assert(allEqual, `fold associativity holds for all ${events.length + 1} split points`);
}

// ---------------------------------------------------------------------------
// 4. Per-kind semantics
// ---------------------------------------------------------------------------

section("Per-kind semantics");
{
  const events = buildCorpus();
  const s = fold(LESSON, events);

  // concept — transition + breadcrumb
  assert(s.currentConcept?.id === "c.energy", "currentConcept is the latest concept");
  assert(
    s.conceptStack.length === 1 && s.conceptStack[0].id === "c.kinematics",
    "prior concept pushed onto stack exactly once",
  );

  // definition / formula — prerequisitesCovered
  assert(
    s.prerequisitesCovered.has("c.kinematics"),
    "definition under c.kinematics marked prereq covered",
  );
  assert(
    s.prerequisitesCovered.has("c.energy"),
    "definition under c.energy marked prereq covered",
  );

  // question — collected in openQuestions in order
  assert(s.openQuestions.length === 2, "both questions collected");
  assert(
    s.openQuestions[0].text === "What is acceleration?" &&
      s.openQuestions[1].text === "Any thoughts on that?",
    "openQuestions preserve arrival order",
  );
  assert(
    s.openQuestions[0].conceptRef === "c.kinematics",
    "question inherits concept in scope at arrival",
  );

  // admin / silence / discussion / example — structural no-ops but bump version
  assert(s.timeline.length === events.length, "every event reached the timeline");
  assert(s.lastEventTs === events[events.length - 1].ts, "lastEventTs tracks tail event");
}

// ---------------------------------------------------------------------------
// 4b. Repeated same-concept event is a no-op transition
// ---------------------------------------------------------------------------

section("Concept idempotence");
{
  const clock = makeClock(2_000_000_000_000);
  const id = makeIdFactory("cx");
  const seq = [
    evt({ text: "Next topic: waves.", conceptRef: "c.waves" }, clock, id),
    evt({ text: "Recall waves.", conceptRef: "c.waves" }, clock, id),
    evt({ text: "As we discussed waves.", conceptRef: "c.waves" }, clock, id),
  ];
  const s = fold(LESSON, seq);
  assert(s.currentConcept?.id === "c.waves", "current concept remains c.waves");
  assert(s.conceptStack.length === 0, "no self-transition pushes onto stack");
}

// ---------------------------------------------------------------------------
// 5. Timeline bound
// ---------------------------------------------------------------------------

section("Timeline ring buffer");
{
  const clock = makeClock(3_000_000_000_000);
  const id = makeIdFactory("t");
  const n = TIMELINE_CAPACITY + 25;
  let state = initialState(LESSON);
  let lastEvent: LessonEvent | null = null;
  for (let i = 0; i < n; i++) {
    const e = evt({ text: `discussion filler ${i}` }, clock, id);
    lastEvent = e;
    state = reduce(state, e);
  }
  assert(
    state.timeline.length === TIMELINE_CAPACITY,
    `timeline capped at TIMELINE_CAPACITY (${TIMELINE_CAPACITY})`,
  );
  assert(
    state.timeline[state.timeline.length - 1].id === lastEvent!.id,
    "most recent event retained at tail",
  );
  assert(state.version === n, "version reflects all reduced events, not just retained");
}

// ---------------------------------------------------------------------------
// 6. Cross-lesson guard
// ---------------------------------------------------------------------------

section("Cross-lesson guard");
{
  const clock = makeClock(4_000_000_000_000);
  const id = makeIdFactory("x");
  const foreign = evt({ lessonId: "other-lesson", text: "hello" }, clock, id);
  let threw = false;
  try {
    reduce(initialState(LESSON), foreign);
  } catch (err) {
    threw = err instanceof Error && err.message.includes("lessonId mismatch");
  }
  assert(threw, "foreign lessonId throws with a descriptive error");
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\nLSE A3 reducer tests — passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
