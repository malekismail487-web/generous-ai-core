import { assertEquals, assertAlmostEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  summarise, cohensD, welchT, normalisedGain, meanNormalisedGain,
  fitRetention, summariseArm, comparePilot,
} from "./outcomeValidation.ts";

Deno.test("summarise handles empty and single", () => {
  assertEquals(summarise([]).n, 0);
  const s = summarise([5]);
  assertEquals(s.n, 1); assertEquals(s.mean, 5); assertEquals(s.variance, 0);
});

Deno.test("Cohen's d returns null for tiny samples", () => {
  assertEquals(cohensD([1], [2]), null);
});

Deno.test("Cohen's d is positive when treatment outperforms", () => {
  const d = cohensD([90, 88, 92, 85, 91], [70, 72, 68, 74, 71])!;
  if (!(d > 1)) throw new Error(`expected d > 1, got ${d}`);
});

Deno.test("Welch t-statistic is symmetric in sign", () => {
  const ab = welchT([10, 11, 12], [5, 6, 7])!;
  const ba = welchT([5, 6, 7], [10, 11, 12])!;
  assertAlmostEquals(ab.t, -ba.t, 1e-9);
});

Deno.test("Hake gain handles ceiling and floor", () => {
  assertEquals(normalisedGain({ pre: 10, post: 12, max: 10 }), 0); // no headroom
  assertEquals(normalisedGain({ pre: 0,  post: 10, max: 10 }), 1);
  assertEquals(normalisedGain({ pre: 5,  post: 0,  max: 10 }), -1);
});

Deno.test("mean normalised gain averages correctly", () => {
  const g = meanNormalisedGain([
    { pre: 5, post: 10, max: 10 },  // 1
    { pre: 0, post: 5,  max: 10 },  // 0.5
  ]);
  assertAlmostEquals(g, 0.75, 1e-9);
});

Deno.test("retention fit recovers known exponential decay", () => {
  const k = 0.1;
  const a = 0.9;
  const pts = [0, 7, 14, 30].map(t => ({ tDays: t, retention: a * Math.exp(-k * t) }));
  const fit = fitRetention(pts);
  assertAlmostEquals(fit.k, k, 1e-6);
  assertAlmostEquals(fit.a, a, 1e-6);
  assertAlmostEquals(fit.halfLifeDays!, Math.log(2) / k, 1e-6);
});

Deno.test("retention fit degrades gracefully on insufficient samples", () => {
  assertEquals(fitRetention([]).samples, 0);
  assertEquals(fitRetention([{ tDays: 0, retention: 0.9 }]).samples, 1);
});

Deno.test("comparePilot bundles symmetric metrics", () => {
  const treatment = Array.from({length: 12}, (_, i) => ({ pre: 50 + (i%3), post: 85 + (i%4), max: 100 }));
  const control   = Array.from({length: 12}, (_, i) => ({ pre: 50 + (i%3), post: 60 + (i%4), max: 100 }));
  const cmp = comparePilot(treatment, control);
  if (!(cmp.treatment.meanNormalisedGain > cmp.control.meanNormalisedGain))
    throw new Error("treatment gain should exceed control");
  if (!(cmp.effectSize! > 0)) throw new Error("effect size should be positive");
  if (!(cmp.normalisedGainLift > 0)) throw new Error("normalised-gain lift should be positive");
});

Deno.test("summariseArm is pure (deterministic)", () => {
  const pairs = [{pre:10,post:20,max:30},{pre:12,post:22,max:30}];
  const a = summariseArm("treatment", pairs);
  const b = summariseArm("treatment", pairs);
  assertEquals(JSON.stringify(a), JSON.stringify(b));
});
