/**
 * LSE Stage A2 — Event Normalizer Test Harness
 * --------------------------------------------
 * Runnable with:  bun run scripts/lseEventNormalizer.test.ts
 *
 * Guarantees pinned here:
 *   1. Canonical utterance coverage — each of the 8 kinds is hit by ≥ 3
 *      fixtures from the corpus below.
 *   2. Determinism — given an injected clock + id factory, `normalize`
 *      returns byte-identical output on repeated invocation.
 *   3. Priority table integrity — every classified kind's priority equals
 *      the checked-in `PRIORITY_TABLE` value; no path can override it.
 *   4. Rule precedence — targeted regressions for the ordering choices
 *      documented in `eventNormalizer.ts` (question > formula, admin > question).
 */

import {
  classifyKind,
  normalize,
  normalizeBatch,
  type LessonEvent,
  type RawTeacherUtterance,
} from "../src/lib/lse/eventNormalizer";
import {
  PRIORITY_TABLE,
  type LessonEventKind,
} from "../src/lib/lse/priorityTable";

interface Fixture {
  text: string;
  expected: LessonEventKind;
}

const CORPUS: Fixture[] = [
  // silence (≥3)
  { text: "", expected: "silence" },
  { text: "   ", expected: "silence" },
  { text: "[silence]", expected: "silence" },

  // admin (≥3)
  { text: "Welcome back, class.", expected: "admin" },
  { text: "Reminder: homework is due Friday.", expected: "admin" },
  { text: "Let's begin today's lesson.", expected: "admin" },
  { text: "Good morning everyone.", expected: "admin" },

  // question (≥3)
  { text: "What is the derivative of sin(x)?", expected: "question" },
  { text: "Why does entropy always increase?", expected: "question" },
  { text: "Can anyone tell me the answer?", expected: "question" },

  // formula (≥3)
  { text: "The area is A = pi * r^2.", expected: "formula" },
  { text: "Recall that ∫ x dx from 0 to 1 equals one half.", expected: "formula" },
  { text: "F = m * a", expected: "formula" },

  // definition (≥3)
  { text: "A prime number is defined as a natural number greater than 1 with no divisors other than 1 and itself.", expected: "definition" },
  { text: "Define velocity as displacement over time.", expected: "definition" },
  { text: "We call this quantity the coefficient of friction.", expected: "definition" },

  // example (≥3)
  { text: "For example, take the function y = 2x.", expected: "example" },
  { text: "Consider a rod of length L.", expected: "example" },
  { text: "Suppose we drop a ball from 10 meters.", expected: "example" },

  // concept (≥3)
  { text: "Moving on, we now look at kinematics.", expected: "concept" },
  { text: "Recall the chain rule from last week.", expected: "concept" },
  { text: "Today we will introduce Newton's second law.", expected: "concept" },

  // discussion (≥3, fallback)
  { text: "That was a great point from the back row.", expected: "discussion" },
  { text: "Yeah exactly, keep going with that thought.", expected: "discussion" },
  { text: "Mhm, interesting perspective.", expected: "discussion" },
];

// ---------------------------------------------------------------------------
// Deterministic clock + id factory
// ---------------------------------------------------------------------------

function makeCounter() {
  let n = 0;
  return () => `id-${(++n).toString().padStart(4, "0")}`;
}

const FIXED_NOW = () => 1_700_000_000_000;

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

type Result = { name: string; ok: boolean; detail?: string };
const results: Result[] = [];

function assert(name: string, cond: boolean, detail?: string) {
  results.push({ name, ok: cond, detail });
}

// 1. Corpus coverage
for (const fx of CORPUS) {
  const got = classifyKind(fx.text);
  assert(
    `classify: "${fx.text.slice(0, 48)}" → ${fx.expected}`,
    got === fx.expected,
    got === fx.expected ? undefined : `got "${got}"`,
  );
}

// Coverage floor: each kind hit ≥ 3 times
const KINDS: LessonEventKind[] = [
  "silence", "admin", "question", "formula",
  "definition", "example", "concept", "discussion",
];
for (const k of KINDS) {
  const count = CORPUS.filter((f) => f.expected === k).length;
  assert(`coverage: kind "${k}" has ≥ 3 fixtures`, count >= 3, `got ${count}`);
}

// 2. Determinism
const raw: RawTeacherUtterance = {
  lessonId: "lesson-abc",
  text: "Define velocity as displacement over time.",
};
const idA = makeCounter();
const idB = makeCounter();
const a = normalize(raw, { now: FIXED_NOW, idFactory: idA });
const b = normalize(raw, { now: FIXED_NOW, idFactory: idB });
assert("determinism: identical inputs → identical output", JSON.stringify(a) === JSON.stringify(b));

// 3. Priority table integrity
for (const fx of CORPUS) {
  const ev = normalize(
    { lessonId: "L", text: fx.text },
    { now: FIXED_NOW, idFactory: makeCounter() },
  );
  assert(
    `priority: kind "${ev.kind}" → P${PRIORITY_TABLE[ev.kind]}`,
    ev.priority === PRIORITY_TABLE[ev.kind],
  );
}

// 4. Rule precedence regressions
const precedence: Array<{ text: string; expected: LessonEventKind; why: string }> = [
  {
    text: "Class, what is the formula for area?",
    expected: "admin",
    why: "admin marker 'Class,' precedes question check",
  },
  {
    text: "Is the formula E = mc^2 correct?",
    expected: "question",
    why: "question mark wins over formula pattern",
  },
  {
    text: "For example, F = m * a for a 1kg block.",
    expected: "example",
    why: "example marker precedes formula-equation pattern",
  },
  {
    text: "F = m * a",
    expected: "formula",
    why: "bare equation with no example/question marker classifies as formula",
  },
];
for (const p of precedence) {
  const got = classifyKind(p.text);
  assert(`precedence: "${p.text.slice(0, 48)}" → ${p.expected}`, got === p.expected, `got "${got}" (${p.why})`);
}

// 5. Batch preserves order
const batch = normalizeBatch(
  [
    { lessonId: "L", text: "Welcome class." },
    { lessonId: "L", text: "What is 2+2?" },
    { lessonId: "L", text: "F = ma" },
  ],
  { now: FIXED_NOW, idFactory: makeCounter() },
);
assert(
  "batch: order preserved and kinds correct",
  batch.length === 3 &&
    batch[0].kind === "admin" &&
    batch[1].kind === "question" &&
    batch[2].kind === "formula",
);

// 6. teacher_visible default + override
const defVis = normalize({ lessonId: "L", text: "hello" }, { now: FIXED_NOW, idFactory: makeCounter() });
const hidden = normalize({ lessonId: "L", text: "hello", teacherVisible: false }, { now: FIXED_NOW, idFactory: makeCounter() });
assert("teacher_visible default true", defVis.teacherVisible === true);
assert("teacher_visible override false", hidden.teacherVisible === false);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok);

console.log(`\nLSE A2 — Event Normalizer: ${passed}/${results.length} checks passed`);
if (failed.length) {
  console.log("\nFailures:");
  for (const f of failed) console.log(`  ✗ ${f.name}${f.detail ? ` — ${f.detail}` : ""}`);
  process.exit(1);
}
console.log("All checks passed.");

// Silence unused-import warning for LessonEvent type re-export sanity
const _typecheck: LessonEvent | null = null;
void _typecheck;
