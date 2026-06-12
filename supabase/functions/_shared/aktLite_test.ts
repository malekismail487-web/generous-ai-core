import { assertAlmostEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { aktLitePredict, AKT_DEFAULTS } from "./aktLite.ts";

Deno.test("AKT-lite: empty history equals plain 2PL", () => {
  const out = aktLitePredict([], { conceptId: "c1", a: 1, b: 0, theta: 0.5 });
  // σ(1·(0.5−0)) ≈ 0.622
  assertAlmostEquals(out.p, 0.622, 0.01);
  assertAlmostEquals(out.attentionMass, 0, 1e-9);
});

Deno.test("AKT-lite: streak of correct answers raises P above Rasch", () => {
  const now = Date.now();
  const history = Array.from({ length: 10 }, (_, i) => ({
    cid: "c1", c: 1 as const, ts: now - (10 - i) * 60_000, a: 1, b: 0.8,
  }));
  const baseline = aktLitePredict([], { conceptId: "c1", a: 1, b: 0.8, theta: 0 }).p;
  const lifted   = aktLitePredict(history, { conceptId: "c1", a: 1, b: 0.8, theta: 0 }).p;
  if (!(lifted > baseline + 0.1)) {
    throw new Error(`expected lifted (${lifted}) >> baseline (${baseline})`);
  }
});

Deno.test("AKT-lite: streak of wrong answers lowers P below Rasch", () => {
  const now = Date.now();
  const history = Array.from({ length: 10 }, (_, i) => ({
    cid: "c1", c: 0 as const, ts: now - (10 - i) * 60_000, a: 1, b: -0.5,
  }));
  const baseline = aktLitePredict([], { conceptId: "c1", a: 1, b: -0.5, theta: 0 }).p;
  const dropped  = aktLitePredict(history, { conceptId: "c1", a: 1, b: -0.5, theta: 0 }).p;
  if (!(dropped < baseline - 0.1)) {
    throw new Error(`expected dropped (${dropped}) << baseline (${baseline})`);
  }
});

Deno.test("AKT-lite: cross-concept attention is dampened (kappa)", () => {
  const now = Date.now();
  const histOther = Array.from({ length: 10 }, (_, i) => ({
    cid: "other", c: 1 as const, ts: now - (10 - i) * 60_000, a: 1, b: 0.5,
  }));
  const histSame  = histOther.map((h) => ({ ...h, cid: "c1" }));
  const pOther = aktLitePredict(histOther, { conceptId: "c1", a: 1, b: 0.5, theta: 0 }).p;
  const pSame  = aktLitePredict(histSame, { conceptId: "c1", a: 1, b: 0.5, theta: 0 }).p;
  if (!(pSame > pOther)) throw new Error("same-concept signal must dominate cross-concept");
});

Deno.test("AKT-lite: response-time dampener reduces influence of suspect-speed events", () => {
  const now = Date.now();
  const baseEv = { cid: "c1", c: 1 as const, ts: now - 60_000, a: 1, b: 0.5 };
  const slow = aktLitePredict([{ ...baseEv, rt: 5000 }],
    { conceptId: "c1", a: 1, b: 0.5, theta: 0 }).p;
  const fast = aktLitePredict([{ ...baseEv, rt: 400 }],
    { conceptId: "c1", a: 1, b: 0.5, theta: 0 }).p;
  if (!(slow > fast)) throw new Error("fast-correct should contribute less than normal-speed correct");
});

Deno.test("AKT-lite: stable in (0, 1) for extreme inputs", () => {
  const out = aktLitePredict([], { conceptId: "c", a: 2.5, b: -3, theta: 3 });
  if (!(out.p < 1 && out.p > 0)) throw new Error("must clamp");
});
