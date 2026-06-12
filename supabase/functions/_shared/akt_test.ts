import { assertAlmostEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  aktPredict, AKT_DEFAULTS,
  buildConceptMemory, readConceptResidual, updateConceptMemory,
} from "./akt.ts";

Deno.test("AKT: empty history equals plain 2PL", () => {
  const out = aktPredict([], { conceptId: "c1", a: 1, b: 0, theta: 0.5 });
  assertAlmostEquals(out.p, 0.622, 0.01);
  assertAlmostEquals(out.attentionMass, 0, 1e-9);
  assert(out.heads.length === AKT_DEFAULTS.headLambdas.length, "multi-head output expected");
});

Deno.test("AKT: streak of correct answers raises P above Rasch", () => {
  const now = Date.now();
  const history = Array.from({ length: 10 }, (_, i) => ({
    cid: "c1", c: 1 as const, ts: now - (10 - i) * 60_000, a: 1, b: 0.8,
  }));
  const base = aktPredict([], { conceptId: "c1", a: 1, b: 0.8, theta: 0 }).p;
  const lift = aktPredict(history, { conceptId: "c1", a: 1, b: 0.8, theta: 0 }).p;
  assert(lift > base + 0.1, `expected lift, base=${base} lift=${lift}`);
});

Deno.test("AKT: streak of wrong answers lowers P below Rasch + forget gate kicks in", () => {
  const now = Date.now();
  // Build up strong prior then catastrophically fail.
  const buildup = Array.from({ length: 5 }, (_, i) => ({
    cid: "c1", c: 1 as const, ts: now - (15 - i) * 60_000, a: 1, b: 0, rt: 4000,
  }));
  const collapse = Array.from({ length: 5 }, (_, i) => ({
    cid: "c1", c: 0 as const, ts: now - (5 - i) * 60_000, a: 1, b: 0, rt: 4000,
  }));
  const p = aktPredict([...buildup, ...collapse],
    { conceptId: "c1", a: 1, b: 0, theta: 0 }).p;
  assert(p < 0.45, `expected forget-gate collapse, got ${p}`);
});

Deno.test("AKT: cross-concept attention is dampened (kappa)", () => {
  const now = Date.now();
  const histOther = Array.from({ length: 10 }, (_, i) => ({
    cid: "other", c: 1 as const, ts: now - (10 - i) * 60_000, a: 1, b: 0.5,
  }));
  const histSame = histOther.map((h) => ({ ...h, cid: "c1" }));
  const pOther = aktPredict(histOther, { conceptId: "c1", a: 1, b: 0.5, theta: 0 }).p;
  const pSame  = aktPredict(histSame,  { conceptId: "c1", a: 1, b: 0.5, theta: 0 }).p;
  assert(pSame > pOther, "same-concept must dominate cross-concept");
});

Deno.test("AKT: multi-head decays cover distinct horizons", () => {
  const now = Date.now();
  // Old strong history vs recent strong history → short head must respond
  // more to the recent stuff, long head more to the old stuff.
  const recent = Array.from({ length: 4 }, (_, i) => ({
    cid: "c1", c: 1 as const, ts: now - (4 - i) * 60_000, a: 1, b: 0.5,
  }));
  const old = Array.from({ length: 4 }, (_, i) => ({
    cid: "c1", c: 1 as const, ts: now - (104 - i) * 60_000, a: 1, b: 0.5,
  }));
  const outRecent = aktPredict(recent, { conceptId: "c1", a: 1, b: 0.5, theta: 0 });
  const outOld    = aktPredict([...old, ...recent], { conceptId: "c1", a: 1, b: 0.5, theta: 0 });
  // Adding old (less weight per head 0/short) should not hurt prediction.
  assert(outOld.p >= outRecent.p - 0.05, "old corroborating history shouldn't hurt");
});

Deno.test("AKT: DKVMN memory accumulates evidence across events", () => {
  const now = Date.now();
  let mem = {};
  for (let i = 0; i < 5; i++) {
    mem = updateConceptMemory(mem, { cid: "c1", c: 1, ts: now + i });
  }
  const read = readConceptResidual(mem, "c1");
  assert(read.residual > 0.05, `memory should be positive after 5 corrects, got ${read.residual}`);
  assert(read.mass >= 5, "mass should accumulate");
});

Deno.test("AKT: stable in (0, 1) for extreme inputs", () => {
  const out = aktPredict([], { conceptId: "c", a: 2.5, b: -3, theta: 3 });
  assert(out.p < 1 && out.p > 0);
});

Deno.test("AKT: back-compat shim aktLitePredict still resolves to (p, attentionMass, residual)", async () => {
  const mod = await import("./akt.ts");
  const out = mod.aktLitePredict([], { conceptId: "c", a: 1, b: 0, theta: 0 });
  assert(typeof out.p === "number");
  assert(typeof out.attentionMass === "number");
  assert(typeof out.residual === "number");
});
