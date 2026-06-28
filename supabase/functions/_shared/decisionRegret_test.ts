// Tests for Stage 12 §4 — decision regret math (oracle-from-alternatives).
import { assert, assertAlmostEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { logDecisionRegret } from "./decisionRegret.ts";

// Fake admin client: every from() chains insert() → returns {error: null}.
function fakeAdmin(): any {
  return {
    from() { return this; },
    insert() { return Promise.resolve({ error: null }); },
  };
}

Deno.test("regret = max(alt.mean) - realised when oracle exceeds realised", async () => {
  const r = await logDecisionRegret(fakeAdmin(), {
    userId: "u1", subject: "S", decisionId: "d1", bucketKey: "armA",
    realisedReward: 0,
    alternatives: [{ armId: "armA", mean: 0.4 }, { armId: "armB", mean: 0.8 }],
  });
  assertAlmostEquals(r.oracle, 0.8, 1e-9);
  assertAlmostEquals(r.realised, 0, 1e-9);
  assertAlmostEquals(r.regret, 0.8, 1e-9);
  assert(r.inserted);
});

Deno.test("regret is clamped to zero when realised meets/exceeds oracle", async () => {
  const r = await logDecisionRegret(fakeAdmin(), {
    userId: "u1", subject: "S", decisionId: "d1", bucketKey: "armA",
    realisedReward: 1,
    alternatives: [{ armId: "armA", mean: 0.4 }],
  });
  assertAlmostEquals(r.regret, 0, 1e-9);
});

Deno.test("missing alternatives → oracle == realised, regret == 0", async () => {
  const r = await logDecisionRegret(fakeAdmin(), {
    userId: "u1", subject: "S", decisionId: "d1", bucketKey: "armA",
    realisedReward: 0.5, alternatives: [],
  });
  assertAlmostEquals(r.oracle, 0.5, 1e-9);
  assertAlmostEquals(r.regret, 0, 1e-9);
});
