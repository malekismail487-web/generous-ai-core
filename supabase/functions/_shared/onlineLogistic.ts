// ============================================================================
//  onlineLogistic.ts — stacked-ensemble weight fitter (Stage 7).
//
//  Fits a logistic-regression stacker on the LOGIT scale:
//
//     z         = bias + Σ softplus(w_i) · logit(p_i)
//     ŷ         = σ(z)
//     loss      = -[ y·log ŷ + (1 - y)·log(1 - ŷ) ] + (λ/2)·||w||²
//
//  Why softplus on the weights:
//    Component weights MUST be non-negative — a negative weight on a KT
//    channel would mean "this signal predicts the opposite of the truth",
//    which is nonsensical and breaks blendPredictions' interpretability.
//    Softplus (= log(1 + eᵂ)) is the canonical smooth non-negativity prior.
//    Gradients flow through it cleanly: d softplus(w)/dw = σ(w).
//
//  Why Adam:
//    Component scales vary wildly (FSRS retrievability vs Hawkes intensity).
//    Per-parameter adaptive learning rates remove the need for hand-tuned
//    LRs per channel.
//
//  Determinism:
//    Mini-batch order is driven by a seedable LCG so identical inputs
//    produce identical fits. No Math.random, no Date.now in the fitter.
//
//  Numerical guards:
//    - logits clamped to [-30, 30] before sigmoid (matches ensemble.ts).
//    - log/log1p arguments clipped to [EPS, 1-EPS] for log-loss.
//    - Any non-finite gradient zeroes that step rather than NaN-poisoning.
// ============================================================================

import {
  ENSEMBLE_DEFAULTS, type EnsembleWeights,
} from "./ensemble.ts";

const EPS = 1e-4;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-clamp(x, -30, 30)));
const sp = (x: number) => Math.log1p(Math.exp(clamp(x, -30, 30)));      // softplus
const dsp = (x: number) => sigmoid(x);                                   // d softplus / dx
const logitC = (p: number) => {
  const q = clamp(p, EPS, 1 - EPS);
  return Math.log(q / (1 - q));
};

// Six component channels, in canonical order. Missing channels (NaN/undefined)
// are dropped per-row, exactly mirroring the runtime blender's contract.
export const CHANNELS = ["w_2pl", "w_elo", "w_akt", "w_dash", "w_fsrs", "w_hawkes"] as const;
export const CHANNEL_PROBS = ["p_2pl", "p_elo", "p_akt", "p_dash", "p_fsrs", "p_hawkes"] as const;

/** A single labeled training sample. `probs[i]` may be NaN for "channel absent". */
export interface LabeledPrediction {
  probs: number[];   // length = CHANNELS.length, in canonical order
  y: 0 | 1;
}

export interface FitConfig {
  epochs: number;
  batchSize: number;
  learningRate: number;
  l2: number;
  seed: number;
}

export const FIT_DEFAULTS: FitConfig = {
  epochs: 80,
  batchSize: 32,
  learningRate: 0.05,
  l2: 1e-3,
  seed: 0xC0FFEE,
};

export interface FitMetrics {
  brier: number;
  logloss: number;
  /** Expected calibration error across 10 equal-width bins. */
  ece: number;
  n: number;
}

export interface FitResult {
  weights: EnsembleWeights;
  before: FitMetrics;
  after: FitMetrics;
  epochs: number;
  accepted: boolean;
  notes: string;
}

// ─── seedable LCG ──────────────────────────────────────────────────────────
// Deterministic shuffle; not for cryptography. Numerical Recipes constants.
function mkRng(seed: number) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = Math.imul(1664525, state) + 1013904223 >>> 0;
    return state / 0x100000000;
  };
}

function shuffleInPlace<T>(arr: T[], rand: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
}

// ─── metrics ───────────────────────────────────────────────────────────────

export function predictProba(sample: LabeledPrediction, w: number[], bias: number): number {
  // Effective weights: softplus(w_i) renormalized over PRESENT channels.
  let rawSum = 0;
  const eff = new Array(w.length).fill(0);
  for (let i = 0; i < w.length; i++) {
    const p = sample.probs[i];
    if (!Number.isFinite(p)) continue;
    const e = sp(w[i]);
    eff[i] = e;
    rawSum += e;
  }
  if (rawSum < 1e-9) return 0.5;
  let z = bias;
  for (let i = 0; i < w.length; i++) {
    const p = sample.probs[i];
    if (!Number.isFinite(p)) continue;
    z += (eff[i] / rawSum) * logitC(p);
  }
  return sigmoid(z);
}

export function evaluateMetrics(
  samples: LabeledPrediction[], w: number[], bias: number,
): FitMetrics {
  let brier = 0, logloss = 0;
  const bins = new Array(10).fill(0).map(() => ({ sumP: 0, sumY: 0, n: 0 }));
  for (const s of samples) {
    const p = predictProba(s, w, bias);
    brier += (p - s.y) * (p - s.y);
    logloss += -(s.y * Math.log(clamp(p, EPS, 1 - EPS)) +
                 (1 - s.y) * Math.log(clamp(1 - p, EPS, 1 - EPS)));
    const b = Math.min(9, Math.floor(p * 10));
    bins[b].sumP += p; bins[b].sumY += s.y; bins[b].n += 1;
  }
  const n = Math.max(1, samples.length);
  let ece = 0;
  for (const b of bins) {
    if (b.n === 0) continue;
    ece += (b.n / n) * Math.abs(b.sumP / b.n - b.sumY / b.n);
  }
  return { brier: brier / n, logloss: logloss / n, ece, n: samples.length };
}

// ─── Adam fitter ────────────────────────────────────────────────────────────

/**
 * Mini-batch online logistic regression with Adam + L2.
 * Returns the fitted EnsembleWeights and before/after metrics.
 *
 * Acceptance rule: a fit is "accepted" only if it strictly improves
 * log-loss on the training set AND the result is no worse than the
 * trivial "uniform softplus weights, zero bias" baseline. This guards
 * against bad data wrecking a previously-good population prior.
 */
export function fitEnsembleWeights(
  samples: LabeledPrediction[],
  initial: EnsembleWeights = ENSEMBLE_DEFAULTS,
  cfg: FitConfig = FIT_DEFAULTS,
): FitResult {
  const D = CHANNELS.length;
  // Initialize raw weights as inverse-softplus of initial defaults, so the
  // softplus output equals the configured starting weights.
  const invSoftplus = (y: number) => Math.log(Math.expm1(Math.max(y, 1e-6)));
  const w: number[] = CHANNELS.map((c) => {
    const v = Number(initial[c] ?? 0.1);
    return invSoftplus(Math.max(v, 0.01));
  });
  let bias = Number(initial.bias ?? 0);

  // Adam moments
  const m = new Array(D + 1).fill(0);
  const v2 = new Array(D + 1).fill(0);
  const beta1 = 0.9, beta2 = 0.999, eps = 1e-8;
  let t = 0;

  const before = evaluateMetrics(samples, w, bias);

  if (samples.length === 0) {
    return {
      weights: initial,
      before, after: before,
      epochs: 0, accepted: false,
      notes: "no_samples",
    };
  }

  const rand = mkRng(cfg.seed);
  const indices = samples.map((_, i) => i);

  for (let epoch = 0; epoch < cfg.epochs; epoch++) {
    shuffleInPlace(indices, rand);
    for (let start = 0; start < indices.length; start += cfg.batchSize) {
      const end = Math.min(indices.length, start + cfg.batchSize);
      const grad = new Array(D + 1).fill(0);    // last slot is bias
      const bsz = end - start;

      for (let k = start; k < end; k++) {
        const s = samples[indices[k]];

        // Forward pass — replicate predictProba but reuse intermediates.
        let rawSum = 0;
        const eff = new Array(D).fill(0);
        for (let i = 0; i < D; i++) {
          if (!Number.isFinite(s.probs[i])) continue;
          eff[i] = sp(w[i]);
          rawSum += eff[i];
        }
        if (rawSum < 1e-9) continue;

        let z = bias;
        const lo = new Array(D).fill(0);
        for (let i = 0; i < D; i++) {
          if (!Number.isFinite(s.probs[i])) continue;
          lo[i] = logitC(s.probs[i]);
          z += (eff[i] / rawSum) * lo[i];
        }
        const p = sigmoid(z);
        const err = p - s.y;  // dL/dz for log-loss with sigmoid

        // ∂z/∂w_i:
        //   z = bias + Σ_j (sp_j / Σ sp) · lo_j
        //   ∂(sp_i / Σ sp)/∂w_i  = dsp(w_i) · (Σ sp - sp_i) / (Σ sp)²
        //   ∂(sp_j / Σ sp)/∂w_i  = -dsp(w_i) · sp_j / (Σ sp)²     (j ≠ i)
        //   so ∂z/∂w_i = dsp(w_i)/(Σ sp)² · ( (Σ sp - sp_i)·lo_i  -  Σ_{j≠i} sp_j·lo_j )
        //              = dsp(w_i)/(Σ sp) · ( lo_i - Σ_j (sp_j/Σ sp)·lo_j )
        //              = dsp(w_i)/(Σ sp) · ( lo_i - (z - bias) )
        const meanLogit = z - bias;
        for (let i = 0; i < D; i++) {
          if (!Number.isFinite(s.probs[i])) continue;
          const dz_dwi = (dsp(w[i]) / rawSum) * (lo[i] - meanLogit);
          if (Number.isFinite(dz_dwi)) grad[i] += err * dz_dwi;
        }
        grad[D] += err;   // ∂z/∂bias = 1
      }

      // Average gradient, add L2 penalty, Adam step.
      t += 1;
      const lr = cfg.learningRate;
      for (let i = 0; i < D; i++) {
        let g = grad[i] / bsz + cfg.l2 * w[i];
        if (!Number.isFinite(g)) g = 0;
        m[i]  = beta1 * m[i]  + (1 - beta1) * g;
        v2[i] = beta2 * v2[i] + (1 - beta2) * g * g;
        const mh = m[i] / (1 - Math.pow(beta1, t));
        const vh = v2[i] / (1 - Math.pow(beta2, t));
        w[i] -= lr * mh / (Math.sqrt(vh) + eps);
        if (!Number.isFinite(w[i])) w[i] = 0;
      }
      let gb = grad[D] / bsz;  // bias has no L2
      if (!Number.isFinite(gb)) gb = 0;
      m[D]  = beta1 * m[D]  + (1 - beta1) * gb;
      v2[D] = beta2 * v2[D] + (1 - beta2) * gb * gb;
      const mhB = m[D] / (1 - Math.pow(beta1, t));
      const vhB = v2[D] / (1 - Math.pow(beta2, t));
      bias -= lr * mhB / (Math.sqrt(vhB) + eps);
      if (!Number.isFinite(bias)) bias = 0;
      bias = clamp(bias, -3, 3);
    }
  }

  const after = evaluateMetrics(samples, w, bias);
  const uniform = evaluateMetrics(
    samples,
    new Array(D).fill(invSoftplus(1 / D)),
    0,
  );

  const fitted: EnsembleWeights = {
    w_2pl:    sp(w[0]),
    w_elo:    sp(w[1]),
    w_akt:    sp(w[2]),
    w_dash:   sp(w[3]),
    w_fsrs:   sp(w[4]),
    w_hawkes: sp(w[5]),
    bias,
  };

  // Reject fits that degrade log-loss vs the prior OR are worse than the
  // uniform baseline (numerical sanity check).
  const improvedVsPrior = after.logloss + 1e-6 < before.logloss;
  const beatsUniform    = after.logloss <= uniform.logloss + 1e-6;
  const accepted = improvedVsPrior && beatsUniform;

  const notes = accepted
    ? "accepted"
    : !improvedVsPrior
      ? `rejected_no_improvement(${before.logloss.toFixed(4)}→${after.logloss.toFixed(4)})`
      : `rejected_worse_than_uniform(${uniform.logloss.toFixed(4)})`;

  return { weights: fitted, before, after, epochs: cfg.epochs, accepted, notes };
}
