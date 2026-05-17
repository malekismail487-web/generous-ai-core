/**
 * outcomeMetrics.ts — Phase 6
 *
 * Long-horizon outcome aggregation for the adaptive system. Phases 1–5
 * shipped *per-event* signals (quality scores, helpfulness, profile bumps,
 * cold-start seed). Phase 6 closes the loop by turning those events into
 * rolling, student-level metrics that answer: "is the adaptive engine
 * actually making things better over time?"
 *
 * This module is intentionally read-only and client-side: it queries the
 * three tables every adaptive feature already writes to
 * (`adaptive_quality_scores`, `ai_output_signals`, `student_answer_history`)
 * and returns shaped windows (7-day, 30-day). Used by:
 *   - AdaptiveDiagnosticsPanel (dev panel)
 *   - The Phase-6 verification script
 *   - Future teacher/admin dashboards (out of scope here)
 *
 * Everything is computed in-memory after a bounded fetch (max 500 rows per
 * window per table) so we never blow Supabase's default 1000-row limit
 * and never need pagination for a single student.
 */

import { supabase } from '@/integrations/supabase/client';

export interface OutcomeWindow {
  windowDays: number;
  windowStart: string; // ISO

  // Quality (Phase 1 / 2)
  qualityAvg: number | null;
  qualitySampleCount: number;
  qualityRegenRate: number | null; // 0–1, fraction of outputs that were regenerated

  // Helpfulness (Phase 4)
  helpfulnessSampleCount: number;
  helpfulnessPositiveRate: number | null; // 0–1
  helpfulnessNegativeRate: number | null; // 0–1
  helpfulnessByFeature: Record<string, { pos: number; neg: number; total: number }>;

  // Accuracy (engine ground truth)
  answerCount: number;
  accuracy: number | null; // 0–1
  accuracyByDifficulty: Record<string, { correct: number; total: number }>;
}

export interface OutcomeMetricsResult {
  userId: string;
  generatedAt: string;
  windows: {
    last7: OutcomeWindow;
    last30: OutcomeWindow;
  };
  trends: {
    /** Δ accuracy = last7 - prior 7–30 day baseline. Positive = improving. */
    accuracyDelta: number | null;
    /** Δ quality = last7 - prior 7–30 day baseline. */
    qualityDelta: number | null;
    /** Δ helpfulness positive rate = last7 - prior 7–30 day baseline. */
    helpfulnessDelta: number | null;
  };
}

const POSITIVE_SIGNALS = new Set(['up', 'perfect', 'too_easy', 'implicit_dwell_positive']);
const NEGATIVE_SIGNALS = new Set([
  'down',
  'too_hard',
  'confusing',
  'off_topic',
  'implicit_regen',
  'implicit_followup_confused',
]);

interface QualityRow { score: number | string; regenerated: boolean; created_at: string; feature: string }
interface SignalRow { signal: string; feature: string; created_at: string }
interface AnswerRow { is_correct: boolean; difficulty: string | null; created_at: string }

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function computeWindow(
  windowDays: number,
  windowStart: string,
  quality: QualityRow[],
  signals: SignalRow[],
  answers: AnswerRow[],
): OutcomeWindow {
  // Quality
  const qVals = quality.map((q) => (typeof q.score === 'string' ? parseFloat(q.score) : q.score));
  const qualityAvg = qVals.length
    ? qVals.reduce((a, b) => a + b, 0) / qVals.length
    : null;
  const regenCount = quality.filter((q) => q.regenerated).length;
  const qualityRegenRate = quality.length ? regenCount / quality.length : null;

  // Helpfulness
  let pos = 0;
  let neg = 0;
  const byFeature: OutcomeWindow['helpfulnessByFeature'] = {};
  for (const s of signals) {
    const isPos = POSITIVE_SIGNALS.has(s.signal);
    const isNeg = NEGATIVE_SIGNALS.has(s.signal);
    if (!byFeature[s.feature]) byFeature[s.feature] = { pos: 0, neg: 0, total: 0 };
    byFeature[s.feature].total += 1;
    if (isPos) { pos += 1; byFeature[s.feature].pos += 1; }
    if (isNeg) { neg += 1; byFeature[s.feature].neg += 1; }
  }
  const helpfulnessPositiveRate = signals.length ? pos / signals.length : null;
  const helpfulnessNegativeRate = signals.length ? neg / signals.length : null;

  // Accuracy
  const correctTotal = answers.filter((a) => a.is_correct).length;
  const accuracy = answers.length ? correctTotal / answers.length : null;
  const byDiff: OutcomeWindow['accuracyByDifficulty'] = {};
  for (const a of answers) {
    const d = (a.difficulty || 'medium').toLowerCase();
    if (!byDiff[d]) byDiff[d] = { correct: 0, total: 0 };
    byDiff[d].total += 1;
    if (a.is_correct) byDiff[d].correct += 1;
  }

  return {
    windowDays,
    windowStart,
    qualityAvg,
    qualitySampleCount: quality.length,
    qualityRegenRate,
    helpfulnessSampleCount: signals.length,
    helpfulnessPositiveRate,
    helpfulnessNegativeRate,
    helpfulnessByFeature: byFeature,
    answerCount: answers.length,
    accuracy,
    accuracyByDifficulty: byDiff,
  };
}

/**
 * Compute long-horizon outcome metrics for one student.
 * Returns `null` if the user has zero data points in the last 30 days
 * (so callers can render an "insufficient data" state without guessing).
 */
export async function computeOutcomeMetrics(userId: string): Promise<OutcomeMetricsResult | null> {
  if (!userId) return null;

  const since30 = isoDaysAgo(30);
  const since7 = isoDaysAgo(7);
  const since14 = isoDaysAgo(14);

  const [qRes, sRes, aRes] = await Promise.all([
    supabase
      .from('adaptive_quality_scores')
      .select('score, regenerated, created_at, feature')
      .eq('user_id', userId)
      .gte('created_at', since30)
      .order('created_at', { ascending: false })
      .limit(500),
    supabase
      .from('ai_output_signals')
      .select('signal, feature, created_at')
      .eq('user_id', userId)
      .gte('created_at', since30)
      .order('created_at', { ascending: false })
      .limit(500),
    supabase
      .from('student_answer_history')
      .select('is_correct, difficulty, created_at')
      .eq('user_id', userId)
      .gte('created_at', since30)
      .order('created_at', { ascending: false })
      .limit(500),
  ]);

  const quality30 = (qRes.data ?? []) as QualityRow[];
  const signals30 = (sRes.data ?? []) as SignalRow[];
  const answers30 = (aRes.data ?? []) as AnswerRow[];

  if (quality30.length === 0 && signals30.length === 0 && answers30.length === 0) {
    return null;
  }

  const slice = <T extends { created_at: string }>(rows: T[], cutoff: string): T[] =>
    rows.filter((r) => r.created_at >= cutoff);

  const last7 = computeWindow(
    7,
    since7,
    slice(quality30, since7),
    slice(signals30, since7),
    slice(answers30, since7),
  );
  const last30 = computeWindow(30, since30, quality30, signals30, answers30);

  // Prior baseline = day 7–14 window so a "last 7" trend has a comparable
  // 7-day reference. We deliberately do NOT compare to day 7–30 because
  // sample sizes would be lopsided and δ would be noisy.
  const prior = computeWindow(
    7,
    since14,
    quality30.filter((r) => r.created_at >= since14 && r.created_at < since7),
    signals30.filter((r) => r.created_at >= since14 && r.created_at < since7),
    answers30.filter((r) => r.created_at >= since14 && r.created_at < since7),
  );

  const delta = (a: number | null, b: number | null): number | null =>
    a == null || b == null ? null : a - b;

  return {
    userId,
    generatedAt: new Date().toISOString(),
    windows: { last7, last30 },
    trends: {
      accuracyDelta: delta(last7.accuracy, prior.accuracy),
      qualityDelta: delta(last7.qualityAvg, prior.qualityAvg),
      helpfulnessDelta: delta(last7.helpfulnessPositiveRate, prior.helpfulnessPositiveRate),
    },
  };
}

/** Human-friendly formatter for the diagnostics panel. */
export function formatRate(n: number | null, digits = 0): string {
  if (n == null) return '—';
  return `${(n * 100).toFixed(digits)}%`;
}

export function formatDelta(n: number | null): { text: string; tone: 'up' | 'down' | 'flat' | 'na' } {
  if (n == null) return { text: '—', tone: 'na' };
  const pct = n * 100;
  if (Math.abs(pct) < 0.5) return { text: '±0%', tone: 'flat' };
  const sign = pct > 0 ? '+' : '';
  return { text: `${sign}${pct.toFixed(1)}%`, tone: pct > 0 ? 'up' : 'down' };
}
