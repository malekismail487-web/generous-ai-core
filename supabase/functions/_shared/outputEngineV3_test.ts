// Tests for Output Engine v3.
//
// Run with:  deno test supabase/functions/_shared/outputEngineV3_test.ts

import { assert, assertEquals, assertAlmostEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  composeOutputV3,
  computePacingMultiplier,
  selectPrereqRefresh,
  selectReviewInterleave,
  type OutputV3Inputs,
  type OutputV3Step,
} from "./outputEngineV3.ts";

const baseSteps: OutputV3Step[] = [
  { kind: "hook",           cognitiveLoad: 0.2, expectedDurationSec: 30,  mustVerify: false },
  { kind: "explain",        cognitiveLoad: 0.5, expectedDurationSec: 75,  mustVerify: false },
  { kind: "worked_example", cognitiveLoad: 0.55, expectedDurationSec: 90, mustVerify: true },
  { kind: "check",          cognitiveLoad: 0.4, expectedDurationSec: 45,  mustVerify: true },
  { kind: "practice",       cognitiveLoad: 0.55, expectedDurationSec: 90, mustVerify: true },
  { kind: "reflect",        cognitiveLoad: 0.3, expectedDurationSec: 45,  mustVerify: false },
];

const baseInput = (overrides: Partial<OutputV3Inputs> = {}): OutputV3Inputs => ({
  stateVector: { theta: 0, standardError: 0.7, mastery: 0.5, ensembleP: 0.55, fatigue: 0.1 },
  regime: { mode: "consolidate", intensity: 0.6, abstractionBias: 0.5, verificationBias: 0.6 },
  baseTrajectory: { steps: baseSteps, totalDurationSec: 375 },
  bandit: null,
  reviewDues: [],
  prereqHints: [],
  ...overrides,
});

Deno.test("pacing multiplier monotone in ensembleP", () => {
  const lo = computePacingMultiplier({ theta: 0, standardError: 0.5, mastery: 0.4, ensembleP: 0.20, fatigue: 0 });
  const mid = computePacingMultiplier({ theta: 0, standardError: 0.5, mastery: 0.4, ensembleP: 0.55, fatigue: 0 });
  const hi = computePacingMultiplier({ theta: 0, standardError: 0.5, mastery: 0.4, ensembleP: 0.90, fatigue: 0 });
  assert(lo > mid, "low p should stretch more");
  assert(mid > hi, "high p should compress more");
  assertAlmostEquals(mid, 1.0, 0.05);
});

Deno.test("pacing multiplier bounded", () => {
  const extreme = computePacingMultiplier({ theta: 0, standardError: 3, mastery: 0, ensembleP: 0.01, fatigue: 1 });
  assert(extreme <= 1.6 + 1e-9);
  const inverse = computePacingMultiplier({ theta: 0, standardError: 0, mastery: 1, ensembleP: 0.99, fatigue: 0 });
  assert(inverse >= 0.75 - 1e-9);
});

Deno.test("selectReviewInterleave respects budget", () => {
  const dues = Array.from({ length: 10 }, (_, i) => ({
    conceptId: `c${i}`,
    retrievability: 0.5,
    overdueDays: 1,
    priority: 10 - i,        // descending
    lapses: 0,
    isLeech: false,
  }));
  const picked = selectReviewInterleave(dues, { maxCards: 5, secPerCard: 30, maxReviewSec: 90 });
  assertEquals(picked.length, 3);                      // 90s / 30s = 3
  assertEquals(picked.map((d) => d.conceptId), ["c0", "c1", "c2"]); // highest priority first
});

Deno.test("selectPrereqRefresh filters mastered + zero excitation", () => {
  const hints = [
    { conceptId: "x", excitation: 1.5, mastery: 0.4 },
    { conceptId: "y", excitation: 0.0, mastery: 0.3 },  // dropped: no excitation
    { conceptId: "z", excitation: 2.0, mastery: 0.95 }, // dropped: already mastered
    { conceptId: "w", excitation: 0.6, mastery: 0.2 },
  ];
  const picked = selectPrereqRefresh(hints, { maxHints: 5, masteryCeiling: 0.7 });
  assertEquals(picked.map((p) => p.conceptId), ["x", "w"]);
});

Deno.test("composeOutputV3 emits hook + main steps when no extras", () => {
  const out = composeOutputV3(baseInput());
  assertEquals(out.segments.review.length, 0);
  assertEquals(out.segments.prereqCheck.length, 0);
  assertEquals(out.segments.main.length, baseSteps.length);
  assertEquals(out.recipe[0].kind, "hook");
  assert(out.audit.fellBackToBase, "no bandit ⇒ fallback flag");
  assert(out.promptFragments.recipeBlock.includes("RECIPE"));
  assertEquals(out.promptFragments.reviewBlock, null);
  assertEquals(out.promptFragments.prereqBlock, null);
});

Deno.test("composeOutputV3 prepends review and appends prereq", () => {
  const out = composeOutputV3(baseInput({
    reviewDues: [
      { conceptId: "r1", retrievability: 0.3, overdueDays: 5, priority: 5, lapses: 1, isLeech: false },
    ],
    prereqHints: [
      { conceptId: "p1", excitation: 1.2, mastery: 0.4 },
    ],
    bandit: { strategy: "quiz", difficulty: "medium" },
  }));
  assertEquals(out.recipe[0].segment, "review");
  assertEquals(out.recipe[out.recipe.length - 1].segment, "prereq_check");
  assertEquals(out.audit.reviewCount, 1);
  assertEquals(out.audit.prereqCount, 1);
  assert(!out.audit.fellBackToBase);
  assert(out.promptFragments.reviewBlock !== null);
  assert(out.promptFragments.prereqBlock !== null);
});

Deno.test("composeOutputV3 truncates to maxDurationSec", () => {
  const out = composeOutputV3(baseInput({
    maxDurationSec: 120,
    stateVector: { theta: 0, standardError: 1.5, mastery: 0.1, ensembleP: 0.10, fatigue: 1 },
  }));
  assert(out.totalDurationSec <= 120 + 1e-6, `total ${out.totalDurationSec} > 120`);
  assert(out.audit.truncated);
  // hook + at least one more main step must survive.
  assert(out.recipe.length >= 2);
  assertEquals(out.recipe[0].kind, "hook");
});

Deno.test("composeOutputV3 stretches durations for struggling student", () => {
  const easy = composeOutputV3(baseInput({
    stateVector: { theta: 1, standardError: 0.3, mastery: 0.9, ensembleP: 0.9, fatigue: 0 },
  }));
  const hard = composeOutputV3(baseInput({
    stateVector: { theta: -1, standardError: 0.8, mastery: 0.2, ensembleP: 0.2, fatigue: 0.3 },
  }));
  assert(hard.pacingMultiplier > easy.pacingMultiplier);
  assert(hard.totalDurationSec > easy.totalDurationSec);
});

Deno.test("composeOutputV3 bandit overrides difficulty/strategy on practice", () => {
  const out = composeOutputV3(baseInput({
    bandit: { strategy: "visual", difficulty: "high" },
  }));
  const practice = out.recipe.find((r) => r.kind === "practice")!;
  assertEquals(practice.strategy, "visual");
  assertEquals(practice.difficulty, "high");
  // Structural steps stay on their natural strategy:
  const hook = out.recipe.find((r) => r.kind === "hook")!;
  assertEquals(hook.strategy, "explanation");
});
