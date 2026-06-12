// ============================================================================
//  Stacked ensemble blender — combines {2PL, Elo, AKT-lite, DASH} into a
//  single calibrated probability. The blender is a logistic stack with
//  fixed (4 + bias) weights; the per-user fit is a Stage 3 concern (we
//  read whatever weights live in `ensemble_weights`).
//
//  Why logistic stacking rather than a simple weighted average?
//    - Probabilities aren't additive; logits are. Averaging in probability
//      space systematically attenuates extreme predictions.
//    - Stacking on logits is the standard meta-learning choice and degrades
//      gracefully to a weighted average if the weights are non-negative.
//
//  The blender enforces non-negative weights via softplus-on-load so that
//  even an adversarial weight row can't flip a signal's sign (defense in
//  depth — only the service role can write `ensemble_weights`, but still).
// ============================================================================

export interface EnsembleWeights {
  w_2pl: number;
  w_elo: number;
  w_akt: number;
  w_dash: number;
  bias: number;
}

export const ENSEMBLE_DEFAULTS: EnsembleWeights = {
  w_2pl: 0.40,
  w_elo: 0.15,
  w_akt: 0.30,
  w_dash: 0.15,
  bias: 0.0,
};

export interface ComponentPredictions {
  p_2pl:  number;
  p_elo:  number;
  p_akt:  number;
  p_dash: number;
}

const EPS = 1e-4;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-clamp(x, -30, 30)));
const logit = (p: number) => Math.log(clamp(p, EPS, 1 - EPS) / (1 - clamp(p, EPS, 1 - EPS)));
// softplus → guarantees w ≥ 0 without truncating gradients in any future fitter.
const sp = (x: number) => Math.log1p(Math.exp(clamp(x, -30, 30)));

export function blendPredictions(
  comp: ComponentPredictions,
  w: EnsembleWeights = ENSEMBLE_DEFAULTS,
): { p: number; logit: number; weights: EnsembleWeights } {
  // Force non-negativity (Number()-cast to defend against NUMERIC nulls from PG).
  const w2pl  = sp(Number(w.w_2pl));
  const welo  = sp(Number(w.w_elo));
  const wakt  = sp(Number(w.w_akt));
  const wdash = sp(Number(w.w_dash));
  const wsum  = w2pl + welo + wakt + wdash;
  if (!isFinite(wsum) || wsum < 1e-6) {
    // Degenerate weights → fall back to uniform average on logit scale.
    const z = 0.25 * (logit(comp.p_2pl) + logit(comp.p_elo) + logit(comp.p_akt) + logit(comp.p_dash));
    return { p: clamp(sigmoid(z), 0.01, 0.99), logit: z, weights: { w_2pl: 0.25, w_elo: 0.25, w_akt: 0.25, w_dash: 0.25, bias: 0 } };
  }
  // Normalize so weights sum to 1 — preserves interpretability and prevents
  // a single bad fit from blowing up the logit magnitude.
  const n2pl = w2pl / wsum, nelo = welo / wsum, nakt = wakt / wsum, ndash = wdash / wsum;
  const z =
    n2pl  * logit(comp.p_2pl) +
    nelo  * logit(comp.p_elo) +
    nakt  * logit(comp.p_akt) +
    ndash * logit(comp.p_dash) +
    Number(w.bias ?? 0);
  return {
    p: clamp(sigmoid(z), 0.01, 0.99),
    logit: z,
    weights: { w_2pl: n2pl, w_elo: nelo, w_akt: nakt, w_dash: ndash, bias: Number(w.bias ?? 0) },
  };
}

/** Brier score for one prediction (used by the diagnostics surface). */
export function brier(p: number, actual: 0 | 1): number {
  return (p - actual) * (p - actual);
}

/** Predicted-from-Elo probability for a (student, item) pair. */
export function eloProbability(studentR: number, itemR: number): number {
  return 1 / (1 + Math.pow(10, (itemR - studentR) / 400));
}
