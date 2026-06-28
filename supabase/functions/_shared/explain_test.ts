// Tests for Stage 12 §5 — explanation trace structure & determinism.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildExplanation } from "./explain.ts";

const base = {
  studentId: "u1",
  subject: "Math",
  conceptId: "c1",
  lectureId: "l1",
  theta: 0.4, standardError: 0.6,
  mastery: 0.55, lectureMastery: 0.6,
  ensembleP: 0.62, ensembleComponents: { p_2pl: 0.6, p_elo: 0.65 },
  regime: { mode: "consolidate", intensity: 0.7, verificationBias: 0.5, abstractionBias: 0.5 },
  policy: { difficulty: "medium", pacing: "normal", strategy: "explanation" },
  bandit: { armId: "explanation/medium", strategy: "explanation", difficulty: "medium",
            ucb: 0.7, mean: 0.6, bonus: 0.1 },
  reviewDueCount: 2,
  topReviewPriority: 0.8,
  prereqHotspot: { conceptName: "Linear eq", excitation: 1.2, mastery: 0.3 },
  pacingMultiplier: 1.0,
  totalDurationSec: 480,
  configSnapshotId: "snap-test",
};

Deno.test("explanation has headline + reasoning layers + numbers", () => {
  const ex = buildExplanation(base);
  assert(ex.headline.length > 10);
  assert(ex.reasoning.length >= 4);
  assertEquals(ex.configSnapshotId, "snap-test");
  assert(typeof ex.numbers.theta === "number");
});

Deno.test("explanation is deterministic for identical input", () => {
  const a = buildExplanation(base);
  const b = buildExplanation(base);
  assertEquals(JSON.stringify(a), JSON.stringify(b));
});

Deno.test("review block only appears when review cards are due", () => {
  const ex0 = buildExplanation({ ...base, reviewDueCount: 0, topReviewPriority: undefined });
  assert(!ex0.reasoning.some((r) => r.layer.includes("retention")));
  const ex1 = buildExplanation({ ...base, reviewDueCount: 5, topReviewPriority: 0.9 });
  assert(ex1.reasoning.some((r) => r.layer.includes("retention")));
});
