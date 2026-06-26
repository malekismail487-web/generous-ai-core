// Tests for propensity.ts — Stage 11
import { assert, assertAlmostEquals, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { lookupProb, PROP_FLOOR, softmaxPropensity } from "./propensity.ts";
import type { ArmScore } from "./linucb.ts";

const ranking = (xs: { id: string; ucb: number }[]): ArmScore[] =>
  xs.map((r) => ({ armId: r.id, ucb: r.ucb, mean: r.ucb, bonus: 0, n: 0 }));

Deno.test("softmaxPropensity sums to 1 and concentrates on top arm at low τ", () => {
  const r = ranking([{ id: "a", ucb: 0.9 }, { id: "b", ucb: 0.5 }, { id: "c", ucb: 0.2 }]);
  const dist = softmaxPropensity(r, "a", 0.1);
  const s = dist.entries.reduce((acc, e) => acc + e.prob, 0);
  assertAlmostEquals(s, 1.0, 1e-9);
  assert(dist.chosenProb > 0.9, "top arm should dominate at low temperature");
});

Deno.test("softmaxPropensity respects PROP_FLOOR even for crushed arms", () => {
  const r = ranking([{ id: "a", ucb: 5 }, { id: "b", ucb: -5 }, { id: "c", ucb: -5 }]);
  const dist = softmaxPropensity(r, "a", 0.05);
  for (const e of dist.entries) assert(e.prob >= PROP_FLOOR * 0.9);
});

Deno.test("softmaxPropensity spreads uniformly when ucbs tie", () => {
  const r = ranking([{ id: "a", ucb: 0.5 }, { id: "b", ucb: 0.5 }, { id: "c", ucb: 0.5 }]);
  const dist = softmaxPropensity(r, "a", 0.2);
  for (const e of dist.entries) assertAlmostEquals(e.prob, 1 / 3, 1e-9);
});

Deno.test("lookupProb returns floor for unknown arm", () => {
  const r = ranking([{ id: "a", ucb: 1 }, { id: "b", ucb: 0 }]);
  const dist = softmaxPropensity(r, "a", 0.2);
  assertEquals(lookupProb(dist, "ghost"), PROP_FLOOR);
});

Deno.test("higher temperature flattens the distribution", () => {
  const r = ranking([{ id: "a", ucb: 1.0 }, { id: "b", ucb: 0.0 }]);
  const cold = softmaxPropensity(r, "a", 0.05);
  const hot = softmaxPropensity(r, "a", 1.0);
  assert(cold.chosenProb > hot.chosenProb);
});
