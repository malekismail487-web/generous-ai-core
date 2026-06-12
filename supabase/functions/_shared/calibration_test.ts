import { assertAlmostEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  brierScore, expectedCalibrationError, aucRoc, nll,
  fitTemperature, fitPlatt, fitCalibration, applyCalibration,
} from "./calibration.ts";

const sig = (x: number) => 1 / (1 + Math.exp(-x));

function synth(n: number, T: number): { p: number; y: 0 | 1 }[] {
  // True latent z ~ Uniform(-3, 3); observed prediction = σ(z * T) (over/under-confident).
  const rng = mulberry32(42);
  const out: { p: number; y: 0 | 1 }[] = [];
  for (let i = 0; i < n; i++) {
    const z = rng() * 6 - 3;
    const yProb = sig(z);
    const y: 0 | 1 = rng() < yProb ? 1 : 0;
    const p = sig(z * T);
    out.push({ p, y });
  }
  return out;
}
function mulberry32(a: number) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

Deno.test("Brier: bounded in [0, 1]", () => {
  const b = brierScore([{ p: 0.5, y: 1 }, { p: 0.5, y: 0 }]);
  assertAlmostEquals(b, 0.25, 1e-9);
});

Deno.test("ECE: well-calibrated predictions have low ECE", () => {
  const events = synth(2000, 1.0); // true predictions
  const e = expectedCalibrationError(events);
  assert(e < 0.05, `ECE should be small on truthful preds, got ${e}`);
});

Deno.test("ECE: over-confident predictions have high ECE", () => {
  const events = synth(2000, 3.0); // logits inflated 3x
  const e = expectedCalibrationError(events);
  assert(e > 0.05, `ECE should be large on over-confident preds, got ${e}`);
});

Deno.test("AUC: perfect ranking → 1.0", () => {
  const events = [
    { p: 0.1, y: 0 as const }, { p: 0.2, y: 0 as const },
    { p: 0.8, y: 1 as const }, { p: 0.9, y: 1 as const },
  ];
  assertAlmostEquals(aucRoc(events), 1.0, 1e-9);
});

Deno.test("AUC: random predictions → ~0.5", () => {
  const rng = mulberry32(7);
  const events = Array.from({ length: 1000 }, () => ({
    p: rng(), y: (rng() > 0.5 ? 1 : 0) as 0 | 1,
  }));
  const a = aucRoc(events);
  assert(a > 0.45 && a < 0.55, `random AUC ${a} out of band`);
});

Deno.test("Temperature fit recovers T≈3 on over-confident data", () => {
  const events = synth(3000, 3.0);
  const T = fitTemperature(events);
  // We expect T_fit ≈ 3.0 because calibrated logits = z_obs / T_fit must
  // equal the true latent z = z_obs / 3.
  assert(T > 2.4 && T < 3.6, `expected T≈3, got ${T}`);
});

Deno.test("fitCalibration: never makes things worse than identity", () => {
  const events = synth(1000, 1.0); // already well-calibrated
  const fit = fitCalibration(events);
  assert(fit.calibrated.nll <= fit.raw.nll + 1e-6,
    `calibration must not regress NLL (raw=${fit.raw.nll}, cal=${fit.calibrated.nll})`);
});

Deno.test("fitCalibration: reduces ECE on over-confident data", () => {
  const events = synth(3000, 3.0);
  const fit = fitCalibration(events);
  assert(fit.calibrated.ece < fit.raw.ece,
    `expected ECE drop, raw=${fit.raw.ece} cal=${fit.calibrated.ece}`);
});

Deno.test("applyCalibration: identity is a no-op", () => {
  const p = 0.73;
  const out = applyCalibration(p, { method: "identity", temperature: 1, platt_a: 1, platt_b: 0 });
  assertAlmostEquals(out, 0.73, 1e-6);
});

Deno.test("Platt fit: degenerate sample returns (1,0)", () => {
  const fit = fitPlatt([{ p: 0.5, y: 1 }, { p: 0.5, y: 0 }]);
  assertAlmostEquals(fit.a, 1, 1e-9);
  assertAlmostEquals(fit.b, 0, 1e-9);
});
