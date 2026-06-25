import {
  assertAlmostEquals, assertEquals, assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  brierDecomposition, brierSkillScore, bootstrapCI, computeMetrics,
  extractChannelEvents, logLoss, prAuc, reliabilityBins, sliceMetrics,
} from "./evalHarness.ts";
import type { CalibrationEvent } from "./calibration.ts";

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s = Math.imul(1664525, s) + 1013904223 >>> 0; return s / 0x100000000; };
}

function synthetic(n: number, seed = 1): CalibrationEvent[] {
  const r = rng(seed); const out: CalibrationEvent[] = [];
  for (let i = 0; i < n; i++) {
    const truth = r();
    const noisy = Math.min(0.999, Math.max(0.001, truth + (r() - 0.5) * 0.2));
    out.push({ p: noisy, y: truth > 0.5 ? 1 : 0 });
  }
  return out;
}

Deno.test("logLoss: perfect predictions → ~0", () => {
  const ev: CalibrationEvent[] = [
    { p: 0.999, y: 1 }, { p: 0.001, y: 0 }, { p: 0.999, y: 1 },
  ];
  assert(logLoss(ev) < 0.01);
});

Deno.test("logLoss: worst predictions → very large", () => {
  const ev: CalibrationEvent[] = [{ p: 0.001, y: 1 }, { p: 0.999, y: 0 }];
  assert(logLoss(ev) > 5);
});

Deno.test("prAuc: perfect ranking = 1", () => {
  const ev: CalibrationEvent[] = [
    { p: 0.9, y: 1 }, { p: 0.8, y: 1 }, { p: 0.2, y: 0 }, { p: 0.1, y: 0 },
  ];
  assertAlmostEquals(prAuc(ev), 1.0, 1e-6);
});

Deno.test("prAuc: random ranking ≈ base rate", () => {
  const ev = synthetic(800, 7).map((e) => ({ p: Math.random(), y: e.y }));
  const base = ev.reduce((s, e) => s + e.y, 0) / ev.length;
  assert(Math.abs(prAuc(ev) - base) < 0.12);
});

Deno.test("brierDecomposition identity: brier = reliability − resolution + uncertainty", () => {
  const ev = synthetic(500, 11);
  const d = brierDecomposition(ev);
  assertAlmostEquals(d.brier, d.reliability - d.resolution + d.uncertainty, 1e-6);
});

Deno.test("brierSkillScore: predictor better than base → > 0", () => {
  const ev = synthetic(500, 3);
  assert(brierSkillScore(ev) > 0);
});

Deno.test("brierSkillScore: constant base rate → 0", () => {
  const ev: CalibrationEvent[] = [];
  for (let i = 0; i < 100; i++) ev.push({ p: 0.5, y: i < 50 ? 1 : 0 });
  assertAlmostEquals(brierSkillScore(ev), 0, 1e-9);
});

Deno.test("reliabilityBins: counts sum to n", () => {
  const ev = synthetic(300, 5);
  const bins = reliabilityBins(ev, 10);
  assertEquals(bins.reduce((s, b) => s + b.count, 0), ev.length);
});

Deno.test("computeMetrics: AUC monotone wrt noise", () => {
  const clean = synthetic(400, 9);
  const noisy = clean.map((e) => ({
    p: Math.min(0.999, Math.max(0.001, e.p + (Math.random() - 0.5) * 0.8)),
    y: e.y,
  }));
  assert(computeMetrics(clean).auc >= computeMetrics(noisy).auc - 0.05);
});

Deno.test("sliceMetrics: respects minSize", () => {
  const ev = [
    ...synthetic(50, 1).map((e) => ({ ...e, sliceKey: "math" })),
    ...synthetic(5,  2).map((e) => ({ ...e, sliceKey: "tiny" })),
  ];
  const out = sliceMetrics(ev, 20);
  assert("math" in out);
  assert(!("tiny" in out));
});

Deno.test("bootstrapCI: estimate inside CI; CI shrinks with n", () => {
  const small = synthetic(60,  4);
  const big   = synthetic(600, 4);
  const cs = bootstrapCI(small, (e) => e.reduce((s, x) => s + x.y, 0) / e.length, { iterations: 100 });
  const cb = bootstrapCI(big,   (e) => e.reduce((s, x) => s + x.y, 0) / e.length, { iterations: 100 });
  assert(cs.lo <= cs.estimate && cs.estimate <= cs.hi);
  assert((cb.hi - cb.lo) < (cs.hi - cs.lo));
});

Deno.test("extractChannelEvents: nulls filtered, clipped", () => {
  const rows = [
    { outcome: 1 as 0 | 1, p_2pl: 0.7 },
    { outcome: 0 as 0 | 1, p_2pl: null },
    { outcome: 1 as 0 | 1, p_2pl: 1.5 }, // out of range → clipped
    { outcome: 0 as 0 | 1, p_2pl: NaN },
  ];
  const ev = extractChannelEvents(rows, "p_2pl");
  assertEquals(ev.length, 2);
  assert(ev[1].p < 1);
});
