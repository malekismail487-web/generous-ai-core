// ============================================================================
//  evalHarness.ts — Stage 10 evaluation harness.
// ----------------------------------------------------------------------------
//  Pure, dependency-free scoring functions used by `evaluate-models` to
//  benchmark every prediction channel (2PL, Elo, AKT, DASH, FSRS, Hawkes),
//  the raw ensemble blend, and the calibrated ensemble against the same
//  labeled set drawn from `ensemble_predictions ⋈ graded_events`.
//
//  Provides — beyond the small set already in calibration.ts —
//    • log-loss with safe clipping
//    • Brier-score decomposition (Murphy 1973): reliability, resolution,
//      uncertainty   →  brier = reliability − resolution + uncertainty
//    • PR-AUC via trapezoidal integration of the precision-recall curve
//    • Equal-width reliability bins (counts + mean p + mean y)
//    • Slice grouping helper (string key → metrics)
//    • Bootstrap CI for any scalar metric (percentile method)
//    • Lift over a constant-rate baseline (Brier-skill score)
//
//  Everything here is deterministic given the same input ordering, so the
//  edge function can claim reproducibility. No I/O, no Deno-specific APIs.
// ============================================================================

import {
  aucRoc, brierScore, expectedCalibrationError, nll as meanNll,
  type CalibrationEvent,
} from "./calibration.ts";

const EPS = 1e-6;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

// ─── core scalar metrics ────────────────────────────────────────────────────

/** Mean log-loss = mean NLL with safe clipping. Lower is better. */
export function logLoss(events: CalibrationEvent[]): number {
  return meanNll(events);
}

/** Brier-skill score vs a constant-rate baseline (= positive-class frequency). */
export function brierSkillScore(events: CalibrationEvent[]): number {
  if (events.length === 0) return 0;
  const base = events.reduce((s, e) => s + e.y, 0) / events.length;
  const bsRef = events.reduce((s, e) => s + (base - e.y) ** 2, 0) / events.length;
  if (bsRef < EPS) return 0;
  return 1 - brierScore(events) / bsRef;
}

// ─── Brier decomposition (Murphy 1973) ──────────────────────────────────────

export interface BrierDecomposition {
  reliability: number; // ↓ better — calibration error term
  resolution:  number; // ↑ better — how much bins separate from base rate
  uncertainty: number; // intrinsic (base-rate variance, ignored by model)
  brier:       number; // reliability − resolution + uncertainty (identity)
}

export function brierDecomposition(
  events: CalibrationEvent[],
  nBins = 15,
): BrierDecomposition {
  if (events.length === 0) {
    return { reliability: 0, resolution: 0, uncertainty: 0, brier: 0 };
  }
  const total   = events.length;
  const baseRate = events.reduce((s, e) => s + e.y, 0) / total;
  const uncertainty = baseRate * (1 - baseRate);

  // equal-mass bins keep estimator stable when predictions cluster
  const sorted  = events.slice().sort((a, b) => a.p - b.p);
  const binSize = Math.max(1, Math.floor(total / nBins));
  let reliability = 0, resolution = 0;
  for (let start = 0; start < total; start += binSize) {
    const slice = sorted.slice(start, Math.min(total, start + binSize));
    if (slice.length === 0) continue;
    const meanP = slice.reduce((s, e) => s + e.p, 0) / slice.length;
    const meanY = slice.reduce((s, e) => s + e.y, 0) / slice.length;
    const w = slice.length / total;
    reliability += w * (meanP - meanY) ** 2;
    resolution  += w * (meanY - baseRate) ** 2;
  }
  return {
    reliability, resolution, uncertainty,
    brier: reliability - resolution + uncertainty,
  };
}

// ─── precision-recall AUC ───────────────────────────────────────────────────

/** PR-AUC via trapezoidal integration on the (recall, precision) curve. */
export function prAuc(events: CalibrationEvent[]): number {
  const n = events.length;
  if (n === 0) return 0;
  const pos = events.reduce((s, e) => s + e.y, 0);
  if (pos === 0 || pos === n) return pos / n;

  const sorted = events.slice().sort((a, b) => b.p - a.p);
  let tp = 0, fp = 0, prevR = 0, prevP = 1, area = 0;
  for (let i = 0; i < n; i++) {
    if (sorted[i].y === 1) tp++; else fp++;
    const recall    = tp / pos;
    const precision = tp / (tp + fp);
    area += (recall - prevR) * (precision + prevP) / 2;
    prevR = recall; prevP = precision;
  }
  return clamp(area, 0, 1);
}

// ─── reliability diagram bins ───────────────────────────────────────────────

export interface ReliabilityBin {
  binIndex: number;
  count: number;
  meanP:  number;
  meanY:  number;
  lo:     number;
  hi:     number;
}

export function reliabilityBins(
  events: CalibrationEvent[],
  nBins = 10,
): ReliabilityBin[] {
  const bins: ReliabilityBin[] = [];
  for (let i = 0; i < nBins; i++) {
    bins.push({
      binIndex: i,
      count: 0, meanP: 0, meanY: 0,
      lo: i / nBins, hi: (i + 1) / nBins,
    });
  }
  for (const e of events) {
    let idx = Math.floor(e.p * nBins);
    if (idx >= nBins) idx = nBins - 1;
    if (idx < 0) idx = 0;
    const b = bins[idx];
    b.meanP += e.p; b.meanY += e.y; b.count++;
  }
  for (const b of bins) if (b.count > 0) { b.meanP /= b.count; b.meanY /= b.count; }
  return bins;
}

// ─── full metric bundle ─────────────────────────────────────────────────────

export interface MetricBundle {
  n: number;
  baseRate: number;
  brier: number;
  logLoss: number;
  ece: number;
  auc: number;
  prAuc: number;
  brierSkill: number;
  reliability: number;
  resolution:  number;
  uncertainty: number;
  accuracy:    number; // threshold 0.5
}

export function computeMetrics(events: CalibrationEvent[]): MetricBundle {
  if (events.length === 0) {
    return {
      n: 0, baseRate: 0, brier: 0, logLoss: 0, ece: 0, auc: 0.5, prAuc: 0,
      brierSkill: 0, reliability: 0, resolution: 0, uncertainty: 0, accuracy: 0,
    };
  }
  const decomp = brierDecomposition(events);
  const correct = events.reduce(
    (s, e) => s + ((e.p >= 0.5 ? 1 : 0) === e.y ? 1 : 0), 0,
  );
  return {
    n: events.length,
    baseRate: events.reduce((s, e) => s + e.y, 0) / events.length,
    brier: brierScore(events),
    logLoss: logLoss(events),
    ece: expectedCalibrationError(events),
    auc: aucRoc(events),
    prAuc: prAuc(events),
    brierSkill: brierSkillScore(events),
    reliability: decomp.reliability,
    resolution:  decomp.resolution,
    uncertainty: decomp.uncertainty,
    accuracy: correct / events.length,
  };
}

// ─── slicing ────────────────────────────────────────────────────────────────

export interface SlicedEvent extends CalibrationEvent {
  sliceKey: string;
}

export function sliceMetrics(
  events: SlicedEvent[],
  minSize = 20,
): Record<string, MetricBundle> {
  const groups: Record<string, CalibrationEvent[]> = {};
  for (const e of events) {
    (groups[e.sliceKey] ??= []).push({ p: e.p, y: e.y });
  }
  const out: Record<string, MetricBundle> = {};
  for (const [k, arr] of Object.entries(groups)) {
    if (arr.length < minSize) continue;
    out[k] = computeMetrics(arr);
  }
  return out;
}

// ─── bootstrap CI ───────────────────────────────────────────────────────────

function mulberry32(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

export interface BootstrapCI {
  estimate: number;
  lo: number;
  hi: number;
  iterations: number;
}

/**
 * Percentile-bootstrap CI for an arbitrary scalar metric. Deterministic given
 * `seed`. Uses `iterations` resamples (default 200 — enough for a 95% CI on
 * AUC/Brier without dominating the edge-function budget).
 */
export function bootstrapCI(
  events: CalibrationEvent[],
  metric: (e: CalibrationEvent[]) => number,
  opts: { iterations?: number; alpha?: number; seed?: number } = {},
): BootstrapCI {
  const { iterations = 200, alpha = 0.05, seed = 42 } = opts;
  const n = events.length;
  const estimate = metric(events);
  if (n < 10) return { estimate, lo: estimate, hi: estimate, iterations: 0 };
  const rng = mulberry32(seed);
  const samples: number[] = new Array(iterations);
  const buf: CalibrationEvent[] = new Array(n);
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < n; i++) buf[i] = events[Math.floor(rng() * n)];
    samples[it] = metric(buf);
  }
  samples.sort((a, b) => a - b);
  const lo = samples[Math.floor((alpha / 2) * iterations)];
  const hi = samples[Math.min(iterations - 1, Math.floor((1 - alpha / 2) * iterations))];
  return { estimate, lo, hi, iterations };
}

// ─── channel helpers ────────────────────────────────────────────────────────

export const PREDICTION_CHANNELS = [
  "p_2pl", "p_elo", "p_akt", "p_dash", "p_fsrs", "p_hawkes",
  "blended_p", "calibrated_p",
] as const;
export type PredictionChannel = (typeof PREDICTION_CHANNELS)[number];

export interface RawPredictionRow {
  outcome: 0 | 1;
  subject?: string | null;
  source?:  string | null;
  p_2pl?: number | null; p_elo?: number | null; p_akt?: number | null;
  p_dash?: number | null; p_fsrs?: number | null; p_hawkes?: number | null;
  blended_p?: number | null; calibrated_p?: number | null;
}

export function extractChannelEvents(
  rows: RawPredictionRow[],
  channel: PredictionChannel,
): CalibrationEvent[] {
  const out: CalibrationEvent[] = [];
  for (const r of rows) {
    const p = r[channel];
    if (p == null || !Number.isFinite(p)) continue;
    out.push({ p: clamp(p, EPS, 1 - EPS), y: r.outcome === 1 ? 1 : 0 });
  }
  return out;
}
