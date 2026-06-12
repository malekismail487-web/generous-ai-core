import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { hawkesPredict, SAME_CONCEPT_ONLY, HAWKES_DEFAULTS } from "./hawkesKt.ts";
import type { KtInteraction } from "./akt.ts";

const DAY = 86400000;
const now = 1_000_000_000_000;

Deno.test("Hawkes: empty history returns sigmoid(item) baseline", () => {
  const p = hawkesPredict([], { conceptId: "A", a: 1, b: 0, theta: 0, nowMs: now }).p;
  assert(Math.abs(p - 0.5) < 0.02, `expected ~0.5, got ${p}`);
});

Deno.test("Hawkes: recent same-concept correct lifts probability", () => {
  const hist: KtInteraction[] = [
    { cid: "A", c: 1, ts: now - 1 * DAY },
    { cid: "A", c: 1, ts: now - 2 * DAY },
  ];
  const pBase = hawkesPredict([], { conceptId: "A", a: 1, b: 0.3, theta: 0, nowMs: now }).p;
  const pExcited = hawkesPredict(hist, { conceptId: "A", a: 1, b: 0.3, theta: 0, nowMs: now }).p;
  assert(pExcited > pBase, `excitation should raise p (${pExcited} vs ${pBase})`);
});

Deno.test("Hawkes: cross-concept excitation only fires with link weight > 0", () => {
  const hist: KtInteraction[] = [{ cid: "fractions", c: 1, ts: now - 1 * DAY }];
  const noLink  = hawkesPredict(hist, { conceptId: "division", a: 1, b: 0, theta: 0, nowMs: now }, SAME_CONCEPT_ONLY).p;
  const linked  = hawkesPredict(hist, { conceptId: "division", a: 1, b: 0, theta: 0, nowMs: now },
    (from, to) => (from === "fractions" && to === "division") ? 0.8 : 0).p;
  assert(linked > noLink, `linked concept should excite (${linked} vs ${noLink})`);
});

Deno.test("Hawkes: wrong answers inhibit", () => {
  const correct: KtInteraction[] = [{ cid: "A", c: 1, ts: now - 1 * DAY }];
  const wrong:   KtInteraction[] = [{ cid: "A", c: 0, ts: now - 1 * DAY }];
  const pC = hawkesPredict(correct, { conceptId: "A", a: 1, b: 0, theta: 0, nowMs: now }).p;
  const pW = hawkesPredict(wrong,   { conceptId: "A", a: 1, b: 0, theta: 0, nowMs: now }).p;
  assert(pC > pW, `correct should give higher p than wrong (${pC} vs ${pW})`);
});

Deno.test("Hawkes: distant events decay to ~0 contribution", () => {
  const hist: KtInteraction[] = [{ cid: "A", c: 1, ts: now - 365 * DAY }];
  const pBase = hawkesPredict([],   { conceptId: "A", a: 1, b: 0, theta: 0, nowMs: now }).p;
  const pOld  = hawkesPredict(hist, { conceptId: "A", a: 1, b: 0, theta: 0, nowMs: now }).p;
  assert(Math.abs(pOld - pBase) < 0.01, `old event should not move p, drift=${pOld - pBase}`);
});
