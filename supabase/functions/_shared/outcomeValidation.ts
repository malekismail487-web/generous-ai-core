// ════════════════════════════════════════════════════════════════════
// Stage 13 §3.1 — Outcome Validation Math (deterministic, pure)
//
// Provides the statistical primitives a ministry expects to see behind
// a pilot-study dashboard: pre/post learning gain, Cohen's d, Welch's
// t-statistic, normalized gain (Hake), and retention decay fit.
//
// All functions are pure: no Date.now, no Math.random, no IO.
// Numeric edge cases (empty samples, zero variance, perfect ceiling)
// are returned as nulls rather than NaN so callers can serialize JSON.
// ════════════════════════════════════════════════════════════════════

export interface ScorePair { pre: number; post: number; max: number }
export interface ArmStats {
  n: number;
  mean: number;
  variance: number;
  sd: number;
}

const FLOOR = 1e-9;

export function summarise(values: readonly number[]): ArmStats {
  const n = values.length;
  if (n === 0) return { n: 0, mean: 0, variance: 0, sd: 0 };
  let mean = 0;
  for (const v of values) mean += v;
  mean /= n;
  let v = 0;
  for (const x of values) v += (x - mean) * (x - mean);
  const variance = n > 1 ? v / (n - 1) : 0;
  return { n, mean, variance, sd: Math.sqrt(variance) };
}

// Cohen's d using pooled SD. Returns null when both arms have <2 samples
// or pooled variance is zero (avoids div-by-zero noise in the dashboard).
export function cohensD(a: readonly number[], b: readonly number[]): number | null {
  const sa = summarise(a), sb = summarise(b);
  if (sa.n < 2 || sb.n < 2) return null;
  const pooled =
    ((sa.n - 1) * sa.variance + (sb.n - 1) * sb.variance) /
    (sa.n + sb.n - 2);
  if (pooled <= FLOOR) return null;
  return (sa.mean - sb.mean) / Math.sqrt(pooled);
}

// Welch's t-test (unequal variances). Returns t-statistic and degrees of
// freedom (Welch–Satterthwaite). p-value approximation is intentionally
// omitted — ministries verify via their own statistician; we expose the
// raw statistic to keep determinism trivial.
export interface WelchResult { t: number; df: number; meanDiff: number }

export function welchT(a: readonly number[], b: readonly number[]): WelchResult | null {
  const sa = summarise(a), sb = summarise(b);
  if (sa.n < 2 || sb.n < 2) return null;
  const va = sa.variance / sa.n;
  const vb = sb.variance / sb.n;
  const denom = va + vb;
  if (denom <= FLOOR) return null;
  const t = (sa.mean - sb.mean) / Math.sqrt(denom);
  const df =
    (denom * denom) /
    ((va * va) / (sa.n - 1) + (vb * vb) / (sb.n - 1));
  return { t, df, meanDiff: sa.mean - sb.mean };
}

// Hake normalised gain g = (post - pre) / (max - pre). Robust to ceiling
// (returns 0 when pre == max) and floor (post < pre returns negative).
export function normalisedGain(pair: ScorePair): number {
  const headroom = pair.max - pair.pre;
  if (headroom <= FLOOR) return 0;
  return (pair.post - pair.pre) / headroom;
}

export function meanNormalisedGain(pairs: readonly ScorePair[]): number {
  if (pairs.length === 0) return 0;
  let s = 0;
  for (const p of pairs) s += normalisedGain(p);
  return s / pairs.length;
}

// Exponential retention fit: r(t) = a * exp(-k * t). We don't need a full
// nonlinear solver — log-linearise and run an OLS on (t, ln r). Negative
// or zero readings are filtered (cannot take log).
export interface RetentionFit { a: number; k: number; halfLifeDays: number | null; samples: number }

export function fitRetention(points: ReadonlyArray<{ tDays: number; retention: number }>): RetentionFit {
  const valid = points.filter(p => p.retention > FLOOR && Number.isFinite(p.tDays));
  if (valid.length < 2) {
    return { a: valid[0]?.retention ?? 0, k: 0, halfLifeDays: null, samples: valid.length };
  }
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of valid) {
    const y = Math.log(Math.min(1, p.retention));
    sx += p.tDays; sy += y;
    sxx += p.tDays * p.tDays;
    sxy += p.tDays * y;
  }
  const n = valid.length;
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) <= FLOOR) {
    return { a: Math.exp(sy / n), k: 0, halfLifeDays: null, samples: n };
  }
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  const k = -slope;
  const halfLifeDays = k > FLOOR ? Math.log(2) / k : null;
  return { a: Math.exp(intercept), k, halfLifeDays, samples: n };
}

// Learning gain bundle: convenience aggregator for one arm.
export interface ArmOutcome {
  arm: 'treatment' | 'control';
  n: number;
  meanPre: number;
  meanPost: number;
  meanDelta: number;
  meanNormalisedGain: number;
  retention: RetentionFit;
}

export function summariseArm(
  arm: 'treatment' | 'control',
  pairs: readonly ScorePair[],
  retentionPoints: ReadonlyArray<{ tDays: number; retention: number }> = [],
): ArmOutcome {
  const pre = pairs.map(p => p.pre);
  const post = pairs.map(p => p.post);
  const delta = pairs.map(p => p.post - p.pre);
  return {
    arm,
    n: pairs.length,
    meanPre: summarise(pre).mean,
    meanPost: summarise(post).mean,
    meanDelta: summarise(delta).mean,
    meanNormalisedGain: meanNormalisedGain(pairs),
    retention: fitRetention(retentionPoints),
  };
}

// Comparative summary suitable for the ministry dashboard.
export interface PilotComparison {
  treatment: ArmOutcome;
  control: ArmOutcome;
  effectSize: number | null;       // Cohen's d on post-test scores
  welch: WelchResult | null;       // Welch's t on post-test scores
  normalisedGainLift: number;      // treatment.g - control.g
}

export function comparePilot(
  treatment: readonly ScorePair[],
  control: readonly ScorePair[],
  retention?: { treatment?: ReadonlyArray<{ tDays: number; retention: number }>;
                control?:   ReadonlyArray<{ tDays: number; retention: number }> },
): PilotComparison {
  const tArm = summariseArm('treatment', treatment, retention?.treatment ?? []);
  const cArm = summariseArm('control', control, retention?.control ?? []);
  const tPost = treatment.map(p => p.post);
  const cPost = control.map(p => p.post);
  return {
    treatment: tArm,
    control: cArm,
    effectSize: cohensD(tPost, cPost),
    welch: welchT(tPost, cPost),
    normalisedGainLift: tArm.meanNormalisedGain - cArm.meanNormalisedGain,
  };
}
