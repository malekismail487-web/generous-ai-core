// ============================================================================
//  calibration.ts — temperature scaling + Platt + reliability metrics.
// ----------------------------------------------------------------------------
//  Per-subject calibration of the ensemble's raw probabilities so that
//  "P(correct) = 0.85" actually means 85% of students got items at that
//  predicted level right. Without this layer, even a great predictor can be
//  systematically over-/under-confident.
//
//  Two scalers are supported (we fit both, pick the lower-NLL one):
//
//    1. Temperature scaling (Guo et al. 2017):
//         p_cal = σ(logit(p) / T)
//       Single-parameter, preserves ranking → cannot hurt AUC.
//
//    2. Platt scaling (Platt 1999):
//         p_cal = σ(A · logit(p) + B)
//       Two-parameter, slightly more flexible. Useful when temperature
//       alone can't close the ECE gap (typically when the underlying
//       distribution is asymmetric, e.g. heavy ceiling effects).
//
//  We measure quality with three industry-standard metrics:
//    - Brier score:   mean (p − y)²            — proper scoring rule.
//    - ECE:           |p̄ − ȳ| averaged over equal-mass bins.
//    - AUC:           Mann–Whitney U / (n₊·n₋) — discrimination.
//
//  All functions are pure / deterministic / dependency-free so they run
//  identically in the edge calibrator and in unit tests.
// ============================================================================

const EPS = 1e-6;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-clamp(x, -30, 30)));
const logit = (p: number) => {
  const q = clamp(p, EPS, 1 - EPS);
  return Math.log(q / (1 - q));
};

export interface CalibrationEvent {
  /** raw predicted probability in (0,1) */
  p: number;
  /** observed outcome */
  y: 0 | 1;
}

// ─────────────────────────────────────────────────────────────────────────
//  Metrics
// ─────────────────────────────────────────────────────────────────────────

export function brierScore(events: CalibrationEvent[]): number {
  if (events.length === 0) return 0;
  let s = 0;
  for (const e of events) s += (e.p - e.y) * (e.p - e.y);
  return s / events.length;
}

/** Mean negative log-likelihood (per event). Lower = better. */
export function nll(events: CalibrationEvent[]): number {
  if (events.length === 0) return 0;
  let s = 0;
  for (const e of events) {
    const p = clamp(e.p, EPS, 1 - EPS);
    s -= e.y === 1 ? Math.log(p) : Math.log(1 - p);
  }
  return s / events.length;
}

/**
 * Equal-frequency-binned Expected Calibration Error. The standard formulation
 * (Naeini et al. 2015) — equal-mass bins are more stable than equal-width
 * bins when predictions cluster.
 */
export function expectedCalibrationError(events: CalibrationEvent[], nBins = 15): number {
  if (events.length === 0) return 0;
  const sorted = events.slice().sort((a, b) => a.p - b.p);
  const total = sorted.length;
  const binSize = Math.max(1, Math.floor(total / nBins));
  let ece = 0;
  for (let start = 0; start < total; start += binSize) {
    const end = Math.min(total, start + binSize);
    const slice = sorted.slice(start, end);
    if (slice.length === 0) continue;
    const meanP = slice.reduce((s, e) => s + e.p, 0) / slice.length;
    const meanY = slice.reduce((s, e) => s + e.y, 0) / slice.length;
    ece += (slice.length / total) * Math.abs(meanP - meanY);
  }
  return ece;
}

/**
 * AUC via the Mann–Whitney U identity. Ties are handled with the standard
 * +0.5 convention. Returns 0.5 when one class is missing.
 */
export function aucRoc(events: CalibrationEvent[]): number {
  const pos: number[] = [], neg: number[] = [];
  for (const e of events) (e.y === 1 ? pos : neg).push(e.p);
  if (pos.length === 0 || neg.length === 0) return 0.5;
  // Rank-based formula: AUC = (Σ rank_pos − n₊(n₊+1)/2) / (n₊·n₋)
  const all = events.map((e, i) => ({ p: e.p, y: e.y, i }))
                    .sort((a, b) => a.p - b.p);
  // Handle ties via average rank.
  const ranks = new Array<number>(all.length);
  let i = 0;
  while (i < all.length) {
    let j = i;
    while (j + 1 < all.length && all[j + 1].p === all[i].p) j++;
    const avg = (i + j) / 2 + 1; // 1-indexed
    for (let k = i; k <= j; k++) ranks[k] = avg;
    i = j + 1;
  }
  let sumPosRanks = 0;
  for (let k = 0; k < all.length; k++) if (all[k].y === 1) sumPosRanks += ranks[k];
  const np = pos.length, nn = neg.length;
  return (sumPosRanks - (np * (np + 1)) / 2) / (np * nn);
}

// ─────────────────────────────────────────────────────────────────────────
//  Fitters
// ─────────────────────────────────────────────────────────────────────────

/**
 * Fit temperature T via 1-D Newton-Raphson on the NLL. Bounded [0.05, 20].
 * Guaranteed to converge in <20 iterations because NLL(T) is convex in 1/T.
 */
export function fitTemperature(
  events: CalibrationEvent[],
  maxIter = 50,
  tol = 1e-5,
): number {
  if (events.length < 10) return 1.0;
  const z = events.map((e) => logit(e.p));
  let T = 1.0;
  for (let it = 0; it < maxIter; it++) {
    // ∂NLL/∂T = (1/n) Σ (σ(z/T) − y) · (−z/T²)
    let grad = 0, hess = 0;
    for (let i = 0; i < events.length; i++) {
      const zi = z[i] / T;
      const p = sigmoid(zi);
      const err = p - events[i].y;
      grad += err * (-z[i] / (T * T));
      // Hessian (approx): ∂²NLL/∂T² ≈ (1/n) Σ p(1−p) · (z/T²)² + 2·err·(z/T³)
      hess += p * (1 - p) * Math.pow(z[i] / (T * T), 2)
            + 2 * err * (z[i] / (T * T * T));
    }
    grad /= events.length;
    hess /= events.length;
    if (Math.abs(hess) < 1e-9) break;
    const stepT = grad / hess;
    const newT = clamp(T - stepT, 0.05, 20);
    if (Math.abs(newT - T) < tol) { T = newT; break; }
    T = newT;
  }
  return T;
}

/**
 * Fit Platt parameters (A, B) via 50 iterations of gradient descent on NLL.
 * Initialised at (1, 0) so a no-op solution is the starting point.
 */
export function fitPlatt(
  events: CalibrationEvent[],
  maxIter = 200,
  lr = 0.05,
): { a: number; b: number } {
  if (events.length < 10) return { a: 1, b: 0 };
  const z = events.map((e) => logit(e.p));
  let a = 1.0, b = 0.0;
  for (let it = 0; it < maxIter; it++) {
    let gA = 0, gB = 0;
    for (let i = 0; i < events.length; i++) {
      const p = sigmoid(a * z[i] + b);
      const err = p - events[i].y;
      gA += err * z[i];
      gB += err;
    }
    gA /= events.length;
    gB /= events.length;
    a -= lr * gA;
    b -= lr * gB;
    if (Math.abs(gA) + Math.abs(gB) < 1e-6) break;
  }
  return { a, b };
}

export interface CalibrationFit {
  /** "temperature" or "platt" — whichever gave lower NLL on the fit set. */
  method: "temperature" | "platt" | "identity";
  temperature: number;
  platt_a: number;
  platt_b: number;
  /** Pre-calibration metrics. */
  raw:        { brier: number; ece: number; auc: number; nll: number };
  /** Post-calibration metrics (using `method`). */
  calibrated: { brier: number; ece: number; auc: number; nll: number };
  n: number;
}

export function applyCalibration(
  p: number,
  fit: { method: CalibrationFit["method"]; temperature: number; platt_a: number; platt_b: number },
): number {
  const z = logit(p);
  let cz: number;
  switch (fit.method) {
    case "temperature": cz = z / (fit.temperature || 1); break;
    case "platt":       cz = fit.platt_a * z + fit.platt_b; break;
    default:            cz = z;
  }
  return clamp(sigmoid(cz), 0.01, 0.99);
}

/**
 * Fit both scalers, return the one with the lower NLL on the same set.
 * If both make things worse than identity, return identity — never let
 * a bad fit make calibration WORSE.
 */
export function fitCalibration(events: CalibrationEvent[]): CalibrationFit {
  const raw = {
    brier: brierScore(events),
    ece:   expectedCalibrationError(events),
    auc:   aucRoc(events),
    nll:   nll(events),
  };
  if (events.length < 30) {
    return {
      method: "identity", temperature: 1, platt_a: 1, platt_b: 0,
      raw, calibrated: raw, n: events.length,
    };
  }
  const T = fitTemperature(events);
  const platt = fitPlatt(events);

  const eT  = events.map((e) => ({ p: applyCalibration(e.p, { method: "temperature", temperature: T, platt_a: 1, platt_b: 0 }), y: e.y }));
  const eP  = events.map((e) => ({ p: applyCalibration(e.p, { method: "platt", temperature: 1, platt_a: platt.a, platt_b: platt.b }), y: e.y }));

  const mT = { brier: brierScore(eT), ece: expectedCalibrationError(eT), auc: aucRoc(eT), nll: nll(eT) };
  const mP = { brier: brierScore(eP), ece: expectedCalibrationError(eP), auc: aucRoc(eP), nll: nll(eP) };

  // Pick the lower-NLL fit; if both worse than raw, fall back to identity.
  let method: CalibrationFit["method"] = "identity";
  let calibrated = raw;
  if (mT.nll <= mP.nll && mT.nll < raw.nll) { method = "temperature"; calibrated = mT; }
  else if (mP.nll < raw.nll)                { method = "platt";       calibrated = mP; }
  return {
    method, temperature: T, platt_a: platt.a, platt_b: platt.b,
    raw, calibrated, n: events.length,
  };
}
