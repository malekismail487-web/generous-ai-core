/**
 * LSE Stage A6 — Context Cache test harness
 * -----------------------------------------
 * Property-style assertions covering the four load-bearing invariants
 * documented in `src/lib/lse/contextCache.ts`:
 *
 *   1. Totality       — no operation throws on any legal input.
 *   2. Determinism    — identical call sequences produce identical states.
 *   3. Boundedness    — `size <= capacity` always holds; eviction is LRU.
 *   4. Monotonicity   — a stale write never overwrites a fresher entry;
 *                       a same-version write preserves projection identity.
 *
 * Run with:  bun run scripts/lseContextCache.test.ts
 * (No test framework needed — this file self-reports pass/fail counts.)
 */

import {
  createContextCache,
  DEFAULT_CACHE_CAPACITY,
  type ContextCache,
  type ContextCacheEntry,
} from "../src/lib/lse/contextCache";
import type { CachedContextProjection } from "../src/lib/lse/sessionInternals";
import {
  initialState,
  reduce,
  type LessonState,
} from "../src/lib/lse/lessonReducer";
import type { LessonEvent } from "../src/lib/lse/eventNormalizer";

// ---------------------------------------------------------------------------
// Micro test runner
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(cond: unknown, label: string): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(label);
    // eslint-disable-next-line no-console
    console.error(`FAIL  ${label}`);
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A deterministic monotonic clock for reproducible LRU ordering. */
function fakeClock(): () => number {
  let t = 0;
  return () => ++t;
}

function projection(label: string): CachedContextProjection {
  return {
    currentConcept: { id: `c-${label}`, label },
    conceptStack: [],
    recentTimeline: [{ kind: "concept", text: label }],
    prerequisitesCovered: [],
  };
}

function conceptEvent(
  lessonId: string,
  seq: number,
  conceptId: string,
): LessonEvent {
  return {
    id: `${lessonId}#${seq}`,
    lessonId,
    ts: 1_000 + seq,
    kind: "concept",
    text: conceptId,
    conceptRef: conceptId,
    priority: 2,
    teacherVisible: true,
  };
}

function foldOne(state: LessonState, ev: LessonEvent): LessonState {
  return reduce(state, ev);
}

// ---------------------------------------------------------------------------
// Test 1 — cache miss returns null; hit returns a well-formed entry
// ---------------------------------------------------------------------------

{
  const cache = createContextCache({ now: fakeClock() });
  assert(cache.read("missing") === null, "read on empty cache → null");
  assert(cache.size() === 0, "empty cache size = 0");

  const entry = cache.write("L1", projection("intro"), 1, 1);
  assert(entry.lessonId === "L1", "write returns entry with correct lessonId");
  assert(entry.version === 1, "write returns entry with correct version");
  assert(entry.lastSeq === 1, "write returns entry with correct lastSeq");
  assert(entry.projection.currentConcept?.label === "intro", "projection stored");
  assert(cache.size() === 1, "size = 1 after single write");

  const hit = cache.read("L1");
  assert(hit !== null, "read after write → hit");
  assert(hit?.projection === entry.projection, "projection reference preserved on read");
}

// ---------------------------------------------------------------------------
// Test 2 — capacity is honoured; eviction is strict LRU
// ---------------------------------------------------------------------------

{
  const cache = createContextCache({ capacity: 3, now: fakeClock() });
  cache.write("A", projection("a"), 1, null);
  cache.write("B", projection("b"), 1, null);
  cache.write("C", projection("c"), 1, null);
  assert(cache.size() === 3, "size fills to capacity");

  // Touch A so it becomes MRU; then insert D, which should evict B (LRU).
  cache.read("A");
  cache.write("D", projection("d"), 1, null);

  assert(cache.size() === 3, "size remains at capacity after overflow");
  assert(cache.read("B") === null, "LRU entry (B) evicted");
  assert(cache.read("A") !== null, "recently-touched entry (A) retained");
  assert(cache.read("C") !== null, "middle entry (C) retained");
  assert(cache.read("D") !== null, "newly inserted entry (D) present");
}

// ---------------------------------------------------------------------------
// Test 3 — monotonic writes reject stale versions
// ---------------------------------------------------------------------------

{
  const cache = createContextCache({ now: fakeClock() });
  const fresh = projection("v5");
  cache.write("L", fresh, 5, 5);
  const stale = projection("v3");
  const after = cache.write("L", stale, 3, 3);
  assert(after.version === 5, "stale write does not lower version");
  assert(after.projection === fresh, "stale write does not replace projection");
  assert(cache.size() === 1, "stale write does not insert duplicate");
}

// ---------------------------------------------------------------------------
// Test 4 — same-version writes preserve projection identity
// ---------------------------------------------------------------------------

{
  const cache = createContextCache({ now: fakeClock() });
  const p1 = projection("v2");
  cache.write("L", p1, 2, 2);
  const p2 = projection("v2");
  assert(p1 !== p2, "control: two projection objects are distinct");
  const after = cache.write("L", p2, 2, 2);
  assert(after.projection === p1, "same-version write preserves original projection identity");
  assert(after.version === 2, "same-version write keeps version");
}

// ---------------------------------------------------------------------------
// Test 5 — fresher versions overwrite
// ---------------------------------------------------------------------------

{
  const cache = createContextCache({ now: fakeClock() });
  const p1 = projection("v1");
  cache.write("L", p1, 1, 1);
  const p2 = projection("v2");
  const after = cache.write("L", p2, 2, 2);
  assert(after.version === 2, "newer version overwrites");
  assert(after.projection === p2, "newer projection replaces");
  assert(cache.read("L")?.version === 2, "read reflects newer write");
}

// ---------------------------------------------------------------------------
// Test 6 — invalidate and clear
// ---------------------------------------------------------------------------

{
  const cache = createContextCache({ now: fakeClock() });
  cache.write("A", projection("a"), 1, null);
  cache.write("B", projection("b"), 1, null);
  cache.invalidate("A");
  assert(cache.read("A") === null, "invalidate removes entry");
  assert(cache.read("B") !== null, "invalidate does not affect other entries");
  cache.clear();
  assert(cache.size() === 0, "clear empties the cache");
  assert(cache.read("B") === null, "read after clear is a miss");
}

// ---------------------------------------------------------------------------
// Test 7 — writeFromState skips projection when version unchanged
// ---------------------------------------------------------------------------

{
  const cache = createContextCache({ now: fakeClock() });
  let s = initialState("L");
  s = foldOne(s, conceptEvent("L", 1, "kinematics"));

  const first = cache.writeFromState(s, 1);
  assert(first.version === s.version, "writeFromState stores current version");
  assert(
    first.projection.currentConcept?.id === "kinematics",
    "writeFromState projected current concept",
  );

  // Same state → same version → identity preserved.
  const again = cache.writeFromState(s, 1);
  assert(again.projection === first.projection, "writeFromState preserves projection identity on same version");

  // Advance state and reproject.
  s = foldOne(s, conceptEvent("L", 2, "vectors"));
  const advanced = cache.writeFromState(s, 2);
  assert(advanced.version === s.version, "writeFromState overwrites on fresher version");
  assert(advanced.projection !== first.projection, "advanced projection is a new object");
  assert(
    advanced.projection.currentConcept?.id === "vectors",
    "advanced projection reflects new concept",
  );
}

// ---------------------------------------------------------------------------
// Test 8 — LRU ordering exposed by keysMruFirst
// ---------------------------------------------------------------------------

{
  const cache = createContextCache({ capacity: 5, now: fakeClock() });
  cache.write("A", projection("a"), 1, null);
  cache.write("B", projection("b"), 1, null);
  cache.write("C", projection("c"), 1, null);
  cache.read("A"); // A is now MRU
  const mru = cache.keysMruFirst();
  assert(mru[0] === "A", "MRU-first: A first after touch");
  assert(mru.length === 3, "MRU-first returns all entries");
  // Returned array must be a copy — mutating it must not affect internal order.
  mru.reverse();
  assert(cache.keysMruFirst()[0] === "A", "keysMruFirst returns a defensive copy");
}

// ---------------------------------------------------------------------------
// Test 9 — Determinism: same call sequence produces same observable state
// ---------------------------------------------------------------------------

{
  function run(): ContextCacheEntry[] {
    const cache: ContextCache = createContextCache({ capacity: 4, now: fakeClock() });
    cache.write("L1", projection("l1"), 1, 1);
    cache.write("L2", projection("l2"), 1, 1);
    cache.read("L1");
    cache.write("L3", projection("l3"), 1, 1);
    cache.write("L1", projection("l1v2"), 2, 2);
    return cache.keysMruFirst().map((k) => cache.read(k)!);
  }
  const a = run();
  const b = run();
  assert(a.length === b.length, "determinism: same length");
  for (let i = 0; i < a.length; i++) {
    assert(a[i].lessonId === b[i].lessonId, `determinism: order[${i}] lessonId`);
    assert(a[i].version === b[i].version, `determinism: order[${i}] version`);
  }
}

// ---------------------------------------------------------------------------
// Test 10 — Capacity coercion (fractional or < 1 → 1)
// ---------------------------------------------------------------------------

{
  const cache = createContextCache({ capacity: 0.4, now: fakeClock() });
  cache.write("A", projection("a"), 1, null);
  cache.write("B", projection("b"), 1, null);
  assert(cache.size() === 1, "capacity floor of 1 enforced");
  assert(cache.read("A") === null, "oldest evicted under capacity=1");
  assert(cache.read("B") !== null, "newest retained under capacity=1");
}

// ---------------------------------------------------------------------------
// Test 11 — Default capacity matches published constant
// ---------------------------------------------------------------------------

{
  const cache = createContextCache({ now: fakeClock() });
  for (let i = 0; i < DEFAULT_CACHE_CAPACITY + 5; i++) {
    cache.write(`L${i}`, projection(`p${i}`), 1, null);
  }
  assert(
    cache.size() === DEFAULT_CACHE_CAPACITY,
    `default capacity of ${DEFAULT_CACHE_CAPACITY} respected`,
  );
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

// eslint-disable-next-line no-console
console.log(`\nLSE A6 context cache — ${passed} passed, ${failed} failed`);
if (failed > 0) {
  // eslint-disable-next-line no-console
  console.error("Failures:\n" + failures.map((f) => "  - " + f).join("\n"));
  process.exit(1);
}
