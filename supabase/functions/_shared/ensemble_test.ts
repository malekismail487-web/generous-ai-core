import { assertAlmostEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { blendPredictions, eloProbability, ENSEMBLE_DEFAULTS, brier } from "./ensemble.ts";

Deno.test("ensemble: default weights blend close to logit-weighted mean", () => {
  const out = blendPredictions(
    { p_2pl: 0.7, p_elo: 0.6, p_akt: 0.8, p_dash: 0.5 }, ENSEMBLE_DEFAULTS,
  );
  if (!(out.p > 0.5 && out.p < 0.85)) throw new Error(`unexpected blend: ${out.p}`);
  // Weights re-normalize to sum 1.
  const wsum = Object.values(out.weights).reduce((s, v) => s + v, 0);
  assertAlmostEquals(wsum, 1.0, 1e-6);
});

Deno.test("ensemble: degenerate (zero) weights fall back to uniform", () => {
  const out = blendPredictions(
    { p_2pl: 0.6, p_elo: 0.6, p_akt: 0.6, p_dash: 0.6 },
    { w_2pl: 0, w_elo: 0, w_akt: 0, w_dash: 0, bias: 0 },
  );
  // softplus(0) > 0 so this is non-degenerate; force-degenerate with very-negative inputs:
  const deg = blendPredictions(
    { p_2pl: 0.6, p_elo: 0.6, p_akt: 0.6, p_dash: 0.6 },
    { w_2pl: -100, w_elo: -100, w_akt: -100, w_dash: -100, bias: 0 },
  );
  assertAlmostEquals(deg.p, 0.6, 0.02);
  if (!(out.p > 0 && out.p < 1)) throw new Error("blend out of (0,1)");
});

Deno.test("ensemble: bias shifts the logit", () => {
  const a = blendPredictions(
    { p_2pl: 0.5, p_elo: 0.5, p_akt: 0.5, p_dash: 0.5 }, ENSEMBLE_DEFAULTS,
  );
  const b = blendPredictions(
    { p_2pl: 0.5, p_elo: 0.5, p_akt: 0.5, p_dash: 0.5 },
    { ...ENSEMBLE_DEFAULTS, bias: 1.0 },
  );
  if (!(b.p > a.p)) throw new Error("positive bias must raise p");
});

Deno.test("Elo probability: 0 rating gap → 0.5", () => {
  assertAlmostEquals(eloProbability(1500, 1500), 0.5, 1e-9);
});

Deno.test("Elo probability: +400 gap → ≈0.91", () => {
  assertAlmostEquals(eloProbability(1900, 1500), 1 / (1 + Math.pow(10, -1)), 1e-9);
});

Deno.test("Brier: perfect prediction is 0", () => {
  assertAlmostEquals(brier(1, 1), 0, 1e-9);
  assertAlmostEquals(brier(0, 0), 0, 1e-9);
});
