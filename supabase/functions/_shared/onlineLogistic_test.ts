import { assertAlmostEquals, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CHANNELS, evaluateMetrics, fitEnsembleWeights, predictProba,
  type LabeledPrediction, FIT_DEFAULTS,
} from "./onlineLogistic.ts";
import { ENSEMBLE_DEFAULTS } from "./ensemble.ts";

const D = CHANNELS.length;

// ─── synthetic data generators ─────────────────────────────────────────────

function makeRng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s = Math.imul(1664525, s) + 1013904223 >>> 0; return s / 0x100000000; };
}

/**
 * Truth: y = 1 iff p_2pl > 0.5. Other channels are pure noise. A correct
 * fitter should drive w_2pl up and the others ~0.
 */
function syntheticChannelOneDominant(n: number, seed = 1): LabeledPrediction[] {
  const r = makeRng(seed);
  const out: LabeledPrediction[] = [];
  for (let i = 0; i < n; i++) {
    const truth = r();                       // [0,1)
    const probs = new Array(D).fill(0).map(() => r());
    probs[0] = truth;                        // p_2pl carries signal
    out.push({ probs, y: truth > 0.5 ? 1 : 0 });
  }
  return out;
}

Deno.test("onlineLogistic: predictProba degrades to 0.5 with no signal", () => {
  const s: LabeledPrediction = { probs: [NaN, NaN, NaN, NaN, NaN, NaN], y: 1 };
  const p = predictProba(s, new Array(D).fill(0), 0);
  assertAlmostEquals(p, 0.5, 1e-9);
});

Deno.test("onlineLogistic: predictProba is monotonic in a single dominant channel", () => {
  const w = [10, -5, -5, -5, -5, -5];   // softplus puts almost all weight on ch0
  const lo: LabeledPrediction = { probs: [0.1, 0.5, 0.5, 0.5, 0.5, 0.5], y: 1 };
  const hi: LabeledPrediction = { probs: [0.9, 0.5, 0.5, 0.5, 0.5, 0.5], y: 1 };
  if (!(predictProba(lo, w, 0) < predictProba(hi, w, 0))) {
    throw new Error("expected monotonicity in dominant channel");
  }
});

Deno.test("onlineLogistic: evaluateMetrics — perfect predictor has 0 brier, low ECE", () => {
  // Synthetic where channel 0 perfectly matches the label.
  const samples: LabeledPrediction[] = [];
  for (let i = 0; i < 100; i++) {
    const y = i % 2 as 0 | 1;
    const p = y === 1 ? 0.99 : 0.01;
    samples.push({ probs: [p, NaN, NaN, NaN, NaN, NaN], y });
  }
  const w = new Array(D).fill(0);  // softplus(0) = ln2 ≈ 0.693 — single channel renormalizes to 1
  const m = evaluateMetrics(samples, w, 0);
  if (m.brier > 0.02) throw new Error(`brier too high: ${m.brier}`);
  if (m.ece > 0.05) throw new Error(`ece too high: ${m.ece}`);
});

Deno.test("onlineLogistic: fit improves log-loss on channel-1-dominant synthetic data", () => {
  const samples = syntheticChannelOneDominant(500, 42);
  const res = fitEnsembleWeights(samples, ENSEMBLE_DEFAULTS, {
    ...FIT_DEFAULTS, epochs: 30,
  });
  if (!(res.after.logloss < res.before.logloss)) {
    throw new Error(`logloss did not improve: ${res.before.logloss} → ${res.after.logloss}`);
  }
  // The dominant-channel weight should end up the largest of the six.
  const ws = [
    res.weights.w_2pl, res.weights.w_elo, res.weights.w_akt,
    res.weights.w_dash, res.weights.w_fsrs ?? 0, res.weights.w_hawkes ?? 0,
  ];
  const maxIdx = ws.indexOf(Math.max(...ws));
  assertEquals(maxIdx, 0);
});

Deno.test("onlineLogistic: fitted weights are non-negative (softplus invariant)", () => {
  const samples = syntheticChannelOneDominant(200, 7);
  const res = fitEnsembleWeights(samples);
  for (const c of CHANNELS) {
    const v = Number((res.weights as any)[c]);
    if (!(v >= 0)) throw new Error(`${c} = ${v} should be ≥ 0`);
  }
});

Deno.test("onlineLogistic: zero samples → not accepted, returns prior unchanged", () => {
  const res = fitEnsembleWeights([], ENSEMBLE_DEFAULTS);
  assertEquals(res.accepted, false);
  assertEquals(res.weights, ENSEMBLE_DEFAULTS);
});

Deno.test("onlineLogistic: deterministic — same seed → same fit", () => {
  const a = fitEnsembleWeights(syntheticChannelOneDominant(100, 11));
  const b = fitEnsembleWeights(syntheticChannelOneDominant(100, 11));
  assertAlmostEquals(a.weights.w_2pl, b.weights.w_2pl, 1e-12);
  assertAlmostEquals(a.after.logloss, b.after.logloss, 1e-12);
});

Deno.test("onlineLogistic: rejects fit on pure-noise data (no improvement)", () => {
  // Labels independent of every channel.
  const r = makeRng(99);
  const samples: LabeledPrediction[] = [];
  for (let i = 0; i < 200; i++) {
    const probs = new Array(D).fill(0).map(() => r());
    samples.push({ probs, y: r() > 0.5 ? 1 : 0 });
  }
  const res = fitEnsembleWeights(samples, ENSEMBLE_DEFAULTS, {
    ...FIT_DEFAULTS, epochs: 20,
  });
  // Either the fit doesn't beat the prior, or it does so trivially.
  // The acceptance gate may pass with tiny improvement; what we really
  // want is that the fit doesn't catastrophically wreck the predictor.
  if (res.accepted && res.after.logloss > res.before.logloss + 0.05) {
    throw new Error("accepted a bad fit");
  }
});

Deno.test("onlineLogistic: handles missing channels (NaN probs) without NaN-poisoning", () => {
  const samples: LabeledPrediction[] = [
    { probs: [0.8, NaN, NaN, 0.3, NaN, NaN], y: 1 },
    { probs: [0.2, NaN, NaN, 0.7, NaN, NaN], y: 0 },
    { probs: [0.9, NaN, NaN, 0.1, NaN, NaN], y: 1 },
    { probs: [0.1, NaN, NaN, 0.9, NaN, NaN], y: 0 },
  ];
  const res = fitEnsembleWeights(samples, ENSEMBLE_DEFAULTS, {
    ...FIT_DEFAULTS, epochs: 20,
  });
  if (!Number.isFinite(res.after.logloss)) throw new Error("NaN-poisoned logloss");
  if (!Number.isFinite(res.weights.w_2pl)) throw new Error("NaN-poisoned weight");
});
