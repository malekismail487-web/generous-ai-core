// ============================================================================
//  DASH — Difficulty, Ability, Study History (Lindsey et al., 2014)
// ----------------------------------------------------------------------------
//  Forgetting-aware logistic predictor used as one of four signals in the
//  Stage 2 ensemble. Pure functions, no IO, deterministic, runs identically
//  in the edge runtime and in tests.
//
//  Canonical form:
//
//    logit(p) = α·θ − β·b + Σ_k [ γ_k · log(1 + s_k) − ρ_k · log(1 + f_k) ]
//
//  where successes / failures are accumulated over K time windows
//  (here: 5 min, 1 h, 1 day, 1 week). Logarithmic accumulation is the
//  Lindsey formulation; exponential decay is layered on top of the windowed
//  counts so a 3-day-old success contributes less than a fresh one inside
//  the 1-week window.
//
//  We use a single set of (α, β, γ_k, ρ_k) globally; per-user fits are a
//  Stage 3 calibration concern.
// ============================================================================

export interface DashInteraction {
  /** unix ms timestamp */
  ts: number;
  /** 1 = correct, 0 = wrong */
  c: 0 | 1;
  /** concept id of the past interaction (filter to same-concept first) */
  cid?: string;
}

/** Window edges in milliseconds. Chosen to span minutes → weeks. */
export const DASH_WINDOWS_MS = [
  5 * 60 * 1000,            // 5 min
  60 * 60 * 1000,           // 1 h
  24 * 60 * 60 * 1000,      // 1 d
  7 * 24 * 60 * 60 * 1000,  // 1 w
];

// Default coefficients. These are sane priors taken from the DASH paper
// re-scaled for our θ scale. They are overridable per-subject by the Stage
// 3 calibrator once we have enough events.
export const DASH_DEFAULTS = {
  alpha: 1.0,                                          // weight on θ
  beta:  1.0,                                          // weight on b
  // successes weighted slightly higher than failures (encouragement signal),
  // and recent windows weighted more than distant ones.
  gamma: [0.35, 0.30, 0.20, 0.10],
  rho:   [0.40, 0.30, 0.18, 0.08],
};

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-clamp(x, -30, 30)));

/**
 * Bucket past interactions into the K windows defined above.
 * Only interactions matching `conceptId` (when provided) contribute.
 * Returns parallel arrays of (successes, failures) per window.
 */
export function bucketInteractions(
  history: DashInteraction[],
  nowMs: number,
  conceptId?: string,
): { successes: number[]; failures: number[] } {
  const successes = new Array(DASH_WINDOWS_MS.length).fill(0);
  const failures  = new Array(DASH_WINDOWS_MS.length).fill(0);
  for (const ev of history) {
    if (conceptId && ev.cid && ev.cid !== conceptId) continue;
    const age = nowMs - ev.ts;
    if (age < 0) continue;
    for (let k = 0; k < DASH_WINDOWS_MS.length; k++) {
      if (age <= DASH_WINDOWS_MS[k]) {
        // Exponential within-window decay: half-life = window/2.
        const halfLife = DASH_WINDOWS_MS[k] / 2;
        const w = Math.pow(0.5, age / halfLife);
        if (ev.c === 1) successes[k] += w; else failures[k] += w;
        break; // each event lands in exactly one (smallest) window.
      }
    }
  }
  return { successes, failures };
}

/**
 * DASH predicted probability of a correct response on an item with
 * difficulty `b`, given student ability `theta` and the windowed counts.
 */
export function dashPredict(
  theta: number,
  b: number,
  successes: number[],
  failures: number[],
  params = DASH_DEFAULTS,
): number {
  let logit = params.alpha * theta - params.beta * b;
  for (let k = 0; k < successes.length; k++) {
    logit += params.gamma[k] * Math.log(1 + successes[k]);
    logit -= params.rho[k]   * Math.log(1 + failures[k]);
  }
  return clamp(sigmoid(logit), 0.01, 0.99);
}

/** Convenience: history + (θ, b) → P_dash. */
export function dashPredictFromHistory(
  history: DashInteraction[],
  nowMs: number,
  theta: number,
  b: number,
  conceptId?: string,
  params = DASH_DEFAULTS,
): number {
  const { successes, failures } = bucketInteractions(history, nowMs, conceptId);
  return dashPredict(theta, b, successes, failures, params);
}
