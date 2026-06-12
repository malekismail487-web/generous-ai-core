import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  newFsrsCard,
  fsrsUpdate,
  fsrsRetrievability,
  fsrsPredict,
  fsrsNextInterval,
  ratingFromBinary,
} from "./fsrs.ts";

const DAY = 86400000;

Deno.test("FSRS: fresh card returns neutral 0.5 retrievability", () => {
  const c = newFsrsCard();
  assertEquals(fsrsPredict(c, 0), 0.5);
});

Deno.test("FSRS: first review seeds (S, D) > 0", () => {
  const c = fsrsUpdate(newFsrsCard(), 3, 1_000_000);
  assert(c.S > 0);
  assert(c.D >= 1 && c.D <= 10);
  assertEquals(c.reps, 1);
  assertEquals(c.lapses, 0);
});

Deno.test("FSRS: retrievability decays monotonically with elapsed time", () => {
  const t0 = 1_000_000_000;
  const c = fsrsUpdate(newFsrsCard(), 3, t0);
  const r0 = fsrsRetrievability(c, t0);
  const r1 = fsrsRetrievability(c, t0 + 1 * DAY);
  const r7 = fsrsRetrievability(c, t0 + 7 * DAY);
  const r30 = fsrsRetrievability(c, t0 + 30 * DAY);
  assert(r0 > r1 && r1 > r7 && r7 > r30, `expected decay, got ${r0},${r1},${r7},${r30}`);
});

Deno.test("FSRS: lapse reduces stability and increments lapses", () => {
  const t0 = 1_000_000_000;
  let c = fsrsUpdate(newFsrsCard(), 3, t0);
  const sBefore = c.S;
  c = fsrsUpdate(c, 1, t0 + 7 * DAY);
  assert(c.S <= sBefore, "stability should not grow on a lapse");
  assertEquals(c.lapses, 1);
});

Deno.test("FSRS: successful overdue review increases stability", () => {
  const t0 = 1_000_000_000;
  let c = fsrsUpdate(newFsrsCard(), 3, t0);
  const sBefore = c.S;
  c = fsrsUpdate(c, 3, t0 + 5 * DAY);
  assert(c.S > sBefore, "good review on an overdue card must increase S");
});

Deno.test("FSRS: nextInterval inverts retrievability curve", () => {
  const days = fsrsNextInterval(10, 0.9);
  // For S=10, retention=0.9: t = 9 * 10 * (1/0.9 - 1) ≈ 10.
  assert(Math.abs(days - 10) < 0.5, `expected ~10 days, got ${days}`);
});

Deno.test("FSRS: ratingFromBinary maps correctness sensibly", () => {
  assertEquals(ratingFromBinary(false), 1);
  assertEquals(ratingFromBinary(true), 3);
  assertEquals(ratingFromBinary(true, true), 4);
});
