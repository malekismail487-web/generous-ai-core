// ============================================================================
//  Stacked ensemble blender — Stage 4 (six signals).
//
//  Combines {2PL, Elo, AKT, DASH, FSRS, Hawkes} into a single calibrated
//  probability via logistic stacking on the logit scale. The blender is
//  fully backward-compatible: legacy 4-signal callers may omit `p_fsrs`
//  and `p_hawkes`, in which case those signals are dropped from the
//  normalization rather than treated as 0.5. This is important — a
//  missing signal must not bias the ensemble toward chance.
//
//  Why stacking on the logit:
//    - Probabilities aren't additive; logits are.
//    - Averaging in probability space attenuates extreme predictions.
//    - Stacking on logits degrades gracefully to a weighted average if
//      the weights are non-negative.
//
//  Why six signals rather than two or three:
//    - 2PL gives the slow item-difficulty prior.
//    - Elo settles new items in ~10 answers (much faster than 2PL).
//    - AKT (multi-head monotonic attention + DKVMN + forget gate) is the
//      best published serveable KT model.
//    - DASH captures forgetting via log(1 + successes/failures) windows.
//    - FSRS-v5 is the SOTA principled retention model (vs. DASH's logistic).
//    - HawkesKT captures the cross-concept temporal excitation no other
//      model can see.
//
//  Non-negative weights are enforced via softplus-on-load so even an
//  adversarial weight row can't flip a signal's sign (defense in depth —
//  only the service role writes `ensemble_weights`, but still).
// ============================================================================

export interface EnsembleWeights {
  w_2pl: number;
  w_elo: number;
  w_akt: number;
  w_dash: number;
  /** Stage 4 — optional in legacy rows. */
  w_fsrs?: number;
  /** Stage 4 — optional in legacy rows. */
  w_hawkes?: number;
  bias: number;
}

export const ENSEMBLE_DEFAULTS: EnsembleWeights = {
  w_2pl:    0.32,
  w_elo:    0.13,
  w_akt:    0.24,
  w_dash:   0.08,
  w_fsrs:   0.13,
  w_hawkes: 0.10,
  bias:     0.0,
};

export interface ComponentPredictions {
  p_2pl:    number;
  p_elo:    number;
  p_akt:    number;
  p_dash:   number;
  /** Stage 4 additions — optional so legacy callers keep working. */
  p_fsrs?:  number;
  p_hawkes?: number;
}

const EPS = 1e-4;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-clamp(x, -30, 30)));
const logit = (p: number) => {
  const q = clamp(p, EPS, 1 - EPS);
  return Math.log(q / (1 - q));
};
// softplus → guarantees w ≥ 0 without truncating gradients for any future fitter.
const sp = (x: number) => Math.log1p(Math.exp(clamp(x, -30, 30)));

interface Channel {
  key: keyof EnsembleWeights;
  p: number;
  rawW: number;
}

export function blendPredictions(
  comp: ComponentPredictions,
  w: EnsembleWeights = ENSEMBLE_DEFAULTS,
): { p: number; logit: number; weights: Record<string, number> } {
  // Assemble only the channels that are actually present. A missing
  // probability is *dropped*, not coerced to 0.5 — the latter would silently
  // pull the ensemble toward chance whenever a signal failed to compute.
  const channels: Channel[] = [
    { key: "w_2pl",    p: comp.p_2pl,  rawW: sp(Number(w.w_2pl)) },
    { key: "w_elo",    p: comp.p_elo,  rawW: sp(Number(w.w_elo)) },
    { key: "w_akt",    p: comp.p_akt,  rawW: sp(Number(w.w_akt)) },
    { key: "w_dash",   p: comp.p_dash, rawW: sp(Number(w.w_dash)) },
  ];
  if (Number.isFinite(comp.p_fsrs)) {
    channels.push({ key: "w_fsrs",   p: comp.p_fsrs as number,
      rawW: sp(Number(w.w_fsrs ?? ENSEMBLE_DEFAULTS.w_fsrs ?? 0)) });
  }
  if (Number.isFinite(comp.p_hawkes)) {
    channels.push({ key: "w_hawkes", p: comp.p_hawkes as number,
      rawW: sp(Number(w.w_hawkes ?? ENSEMBLE_DEFAULTS.w_hawkes ?? 0)) });
  }

  const wsum = channels.reduce((s, c) => s + c.rawW, 0);
  if (!isFinite(wsum) || wsum < 1e-6) {
    // Degenerate weights → uniform logit-space average over present channels.
    const z = channels.reduce((s, c) => s + logit(c.p), 0) / Math.max(channels.length, 1);
    const weights: Record<string, number> = {};
    for (const c of channels) weights[c.key] = 1 / channels.length;
    return { p: clamp(sigmoid(z), 0.01, 0.99), logit: z, weights };
  }

  let z = Number(w.bias ?? 0);
  const weights: Record<string, number> = {};
  for (const c of channels) {
    const norm = c.rawW / wsum;
    weights[c.key] = norm;
    z += norm * logit(c.p);
  }
  return { p: clamp(sigmoid(z), 0.01, 0.99), logit: z, weights };
}

/** Brier score for one prediction (used by the diagnostics surface). */
export function brier(p: number, actual: 0 | 1): number {
  return (p - actual) * (p - actual);
}

/** Predicted-from-Elo probability for a (student, item) pair. */
export function eloProbability(studentR: number, itemR: number): number {
  return 1 / (1 + Math.pow(10, (itemR - studentR) / 400));
}
