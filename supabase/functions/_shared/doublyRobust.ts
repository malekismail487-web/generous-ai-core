// ============================================================================
//  doublyRobust.ts — Stage 11
// ----------------------------------------------------------------------------
//  Off-policy evaluation (OPE) for the LinUCB bandit. Given a log of
//  decisions made by the *behaviour* policy π_b (with recorded propensities)
//  and a candidate *target* policy π_t, estimate the value V(π_t) =
//  E[r | a ~ π_t] without ever deploying π_t.
//
//  Three estimators, increasing in sophistication:
//
//    1. IPS   (Horvitz–Thompson):
//          V̂ = (1/n) Σ_i r_i · π_t(a_i|x_i) / π_b(a_i|x_i)
//       Unbiased but very high variance when π_b puts low mass on actions
//       π_t prefers.
//
//    2. SNIPS (Self-Normalised IPS, Swaminathan & Joachims 2015):
//          V̂ = Σ_i w_i r_i / Σ_i w_i,   w_i = π_t/π_b
//       Slightly biased, but variance is bounded and it dominates IPS on
//       finite samples in practice.
//
//    3. DR   (Doubly-Robust, Dudík, Langford, Li 2011):
//          V̂ = (1/n) Σ_i [ q̂(x_i, π_t) + (r_i − q̂(x_i,a_i)) · w_i ]
//       Consistent if *either* the propensities are correct *or* the reward
//       model q̂ is correct. This is the production-grade estimator.
//
//  All three are accompanied by Hoeffding-style 95% confidence intervals
//  computed from the empirical variance of the per-sample contributions.
//  We also cap IPS weights at IPS_CLIP (default 20) — standard variance-
//  reduction at the cost of mild bias.
// ============================================================================

export const IPS_CLIP = 20;

export interface DecisionLogRow {
  /** Context vector at decision time. */
  x: number[];
  /** Arm the behaviour policy actually executed. */
  chosenArm: string;
  /** π_b(chosenArm | x). Must be > 0. */
  behaviourProb: number;
  /** Observed reward in [0, 1]. */
  reward: number;
  /** Optional: π_b over every arm, used for q̂ aggregation. */
  behaviourDist?: Record<string, number>;
}

/** Target policy: maps context+arm → π_t(a|x). Must sum to 1 across arms. */
export type TargetPolicy = (x: number[], armIds: string[]) => Record<string, number>;

/**
 * Reward model q̂(x, a): estimated expected reward for taking arm a in
 * context x. The DR estimator uses this as a control variate.
 */
export type RewardModel = (x: number[], armId: string) => number;

export interface OpeResult {
  estimator: "ips" | "snips" | "dr";
  value: number;       // V̂
  stderr: number;      // empirical SE of the mean
  ci95Lo: number;
  ci95Hi: number;
  effectiveSampleSize: number; // (Σw)² / Σw² — Kish ESS for the IPS weights
  nUsed: number;       // rows that produced a finite contribution
}

const clip = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

function meanAndSE(xs: number[]): { mean: number; se: number } {
  const n = xs.length;
  if (n === 0) return { mean: 0, se: 0 };
  const m = xs.reduce((s, v) => s + v, 0) / n;
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, n - 1);
  return { mean: m, se: Math.sqrt(v / n) };
}

function ess(weights: number[]): number {
  const s = weights.reduce((a, w) => a + w, 0);
  const s2 = weights.reduce((a, w) => a + w * w, 0);
  return s2 < 1e-12 ? 0 : (s * s) / s2;
}

// ─── IPS ────────────────────────────────────────────────────────────────────

export function evaluateIPS(
  log: DecisionLogRow[],
  target: TargetPolicy,
  armIds: string[],
): OpeResult {
  const contribs: number[] = [];
  const weights: number[] = [];
  for (const row of log) {
    const piT = target(row.x, armIds);
    const ptA = piT[row.chosenArm] ?? 0;
    const pbA = Math.max(1e-6, row.behaviourProb);
    const w = clip(ptA / pbA, 0, IPS_CLIP);
    if (!Number.isFinite(w)) continue;
    contribs.push(w * row.reward);
    weights.push(w);
  }
  const { mean, se } = meanAndSE(contribs);
  return {
    estimator: "ips",
    value: mean,
    stderr: se,
    ci95Lo: mean - 1.96 * se,
    ci95Hi: mean + 1.96 * se,
    effectiveSampleSize: ess(weights),
    nUsed: contribs.length,
  };
}

// ─── SNIPS ──────────────────────────────────────────────────────────────────

export function evaluateSNIPS(
  log: DecisionLogRow[],
  target: TargetPolicy,
  armIds: string[],
): OpeResult {
  const weights: number[] = [];
  const wr: number[] = [];
  for (const row of log) {
    const piT = target(row.x, armIds);
    const ptA = piT[row.chosenArm] ?? 0;
    const pbA = Math.max(1e-6, row.behaviourProb);
    const w = clip(ptA / pbA, 0, IPS_CLIP);
    if (!Number.isFinite(w)) continue;
    weights.push(w);
    wr.push(w * row.reward);
  }
  const sumW = weights.reduce((s, v) => s + v, 0);
  const value = sumW < 1e-9 ? 0 : wr.reduce((s, v) => s + v, 0) / sumW;
  // Approximate SE via delta method: var(SNIPS) ≈ var(w·r − V·w) / (Σw)²
  const resid = wr.map((v, i) => v - value * weights[i]);
  const varNum = resid.reduce((s, x) => s + x * x, 0);
  const se = sumW < 1e-9 ? 0 : Math.sqrt(varNum) / sumW;
  return {
    estimator: "snips",
    value,
    stderr: se,
    ci95Lo: value - 1.96 * se,
    ci95Hi: value + 1.96 * se,
    effectiveSampleSize: ess(weights),
    nUsed: weights.length,
  };
}

// ─── Doubly-Robust ──────────────────────────────────────────────────────────

export function evaluateDR(
  log: DecisionLogRow[],
  target: TargetPolicy,
  rewardModel: RewardModel,
  armIds: string[],
): OpeResult {
  const contribs: number[] = [];
  const weights: number[] = [];
  for (const row of log) {
    const piT = target(row.x, armIds);
    let qExp = 0;
    for (const a of armIds) qExp += (piT[a] ?? 0) * rewardModel(row.x, a);
    const ptA = piT[row.chosenArm] ?? 0;
    const pbA = Math.max(1e-6, row.behaviourProb);
    const w = clip(ptA / pbA, 0, IPS_CLIP);
    if (!Number.isFinite(w)) continue;
    const correction = w * (row.reward - rewardModel(row.x, row.chosenArm));
    contribs.push(qExp + correction);
    weights.push(w);
  }
  const { mean, se } = meanAndSE(contribs);
  return {
    estimator: "dr",
    value: mean,
    stderr: se,
    ci95Lo: mean - 1.96 * se,
    ci95Hi: mean + 1.96 * se,
    effectiveSampleSize: ess(weights),
    nUsed: contribs.length,
  };
}

// ─── canned target policies ─────────────────────────────────────────────────

/** Uniform-random baseline — useful as a lower bound. */
export const uniformPolicy: TargetPolicy = (_x, armIds) => {
  const p = 1 / armIds.length;
  const out: Record<string, number> = {};
  for (const a of armIds) out[a] = p;
  return out;
};

/** ε-greedy wrapper around any score function. */
export function epsilonGreedyPolicy(
  score: (x: number[], armId: string) => number,
  epsilon: number,
): TargetPolicy {
  const eps = clip(epsilon, 0, 1);
  return (x, armIds) => {
    let best = armIds[0];
    let bv = -Infinity;
    for (const a of armIds) {
      const v = score(x, a);
      if (v > bv) { bv = v; best = a; }
    }
    const explore = eps / armIds.length;
    const exploit = 1 - eps + explore;
    const out: Record<string, number> = {};
    for (const a of armIds) out[a] = a === best ? exploit : explore;
    return out;
  };
}

// ─── regret ────────────────────────────────────────────────────────────────

/**
 * Per-decision regret vs the *empirical oracle*: for each (context bucket,
 * arm) we take the best mean realised reward across the log as the oracle
 * value, and regret_i = oracleValue(bucket_i) − r_i. This is biased toward
 * the behaviour policy's exploration but is the strongest non-deployment
 * baseline we have.
 *
 * Bucketing collapses the context vector to a coarse hash so we get
 * enough samples per cell to estimate an oracle mean.
 */
export function cumulativeRegret(
  log: DecisionLogRow[],
  bucketize: (x: number[]) => string,
): { perStep: number[]; cumulative: number; meanRegret: number } {
  const cellRewards: Record<string, number[]> = {};
  for (const row of log) {
    (cellRewards[bucketize(row.x)] ??= []).push(row.reward);
  }
  const oracle: Record<string, number> = {};
  for (const [k, v] of Object.entries(cellRewards)) {
    oracle[k] = Math.max(...v);
  }
  const perStep = log.map((r) => Math.max(0, (oracle[bucketize(r.x)] ?? r.reward) - r.reward));
  const cumulative = perStep.reduce((s, v) => s + v, 0);
  const meanRegret = perStep.length === 0 ? 0 : cumulative / perStep.length;
  return { perStep, cumulative, meanRegret };
}
