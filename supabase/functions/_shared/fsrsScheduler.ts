// ============================================================================
//  fsrsScheduler.ts — Stage 5
// ----------------------------------------------------------------------------
//  The FSRS model in `_shared/fsrs.ts` tells us *when* a card would, in
//  expectation, be optimal to review. The scheduler is the layer that turns
//  that single-card optimum into a sustainable, human-friendly review queue:
//
//    1.  Interval fuzz (Anki-style randomization)
//          Without fuzz, every card scheduled on the same day reappears on
//          the same day forever, producing brutal weekly review pile-ups.
//          We add a deterministic random offset in [-f, +f] of the planned
//          interval, with a wider band for longer intervals (the longer the
//          interval, the more we can afford to wiggle without hurting recall).
//
//    2.  Leech detection
//          A card the student keeps forgetting (≥ `LEECH_LAPSE_THRESHOLD`
//          "Again" ratings) is *not* a scheduling problem — it's a teaching
//          problem. We flag it; the teaching-generate pipeline picks up the
//          flag and switches into remediation mode instead of just pushing
//          the next review out further.
//
//    3.  Priority score (used by `get_fsrs_due_cards` ordering)
//          A scalar combining:
//             - overdueness   : how many half-lives past due the card is
//             - forget risk   : 1 − R(t)
//             - difficulty    : harder cards bubble up sooner
//             - leech bonus   : double-weight so flagged cards aren't buried
//          Higher = surface first.
//
//    4.  Optimal request retention
//          The default 0.9 retention minimizes total review time *on average*.
//          For a student with very high accuracy and a known low-cost lapse
//          (e.g. a non-graded refresher) we can lower R and save review time.
//          For high-stakes content we raise R. `optimalRequestRetention`
//          implements the closed-form analysis from Su et al. 2023.
//
//    5.  Workload smoothing
//          Given a daily review cap, push the lowest-priority due cards out
//          by one day at a time until the daily load fits under the cap.
//          Pure function so it's trivially testable.
//
//  Everything in this file is deterministic given its inputs (the randomness
//  in `applyFuzz` comes from a seedable LCG, not Math.random) so unit tests
//  can pin behaviour and CI never flakes.
// ============================================================================

import type { FsrsCard } from "./fsrs.ts";

export const LEECH_LAPSE_THRESHOLD = 8;
export const LEECH_SUSPEND_DAYS = 1;

export const FUZZ_RANGES: readonly { minDays: number; pct: number }[] = [
  // (lower interval bound, max ± fuzz as fraction of the interval)
  { minDays: 0,    pct: 0.00 },  // < 1 day: never fuzz, the student is in-session
  { minDays: 1,    pct: 0.15 },  // 1–6 days: ±15 %
  { minDays: 7,    pct: 0.10 },  // 1–4 weeks: ±10 %
  { minDays: 30,   pct: 0.075 }, // 1–6 months: ±7.5 %
  { minDays: 180,  pct: 0.05 },  // > 6 months: ±5 %
];

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/**
 * Deterministic 32-bit LCG. We don't need cryptographic quality; we need a
 * pure function of (cardId, reps) so the same card produces the same fuzz on
 * repeat calls — important for idempotency when an edge function retries.
 */
function lcg(seed: number): number {
  // Numerical Recipes LCG constants. Returns value in [0, 1).
  const next = (Math.imul(1664525, seed >>> 0) + 1013904223) >>> 0;
  return next / 0x1_0000_0000;
}

function seedFromString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

/**
 * Apply Anki-style fuzz to a planned interval. Pure, seedable.
 *
 *   @param intervalDays   raw interval from `fsrsNextInterval`
 *   @param seedKey        any string that identifies this card+rep
 *                         (e.g. `${cardId}:${reps}`)
 *   @returns              fuzzed interval, clamped to ≥ minInterval days
 */
export function applyFuzz(
  intervalDays: number,
  seedKey: string,
  minInterval = 1 / 1440, // 1 minute floor — never schedule "in the past"
): number {
  if (!isFinite(intervalDays) || intervalDays <= 0) return Math.max(intervalDays, minInterval);
  let pct = 0;
  for (const band of FUZZ_RANGES) if (intervalDays >= band.minDays) pct = band.pct;
  if (pct === 0) return intervalDays;
  const r = lcg(seedFromString(seedKey));         // [0,1)
  const delta = (r * 2 - 1) * pct * intervalDays; // [-pct·iv, +pct·iv]
  return Math.max(minInterval, intervalDays + delta);
}

export interface LeechResult {
  isLeech: boolean;
  suspendedUntilMs: number | null;
}

/**
 * Flag chronic-forgetting cards. Once flagged, suspend for 1 day so the
 * teaching layer has a window to remediate before the next attempt.
 */
export function detectLeech(card: FsrsCard, nowMs: number): LeechResult {
  if (card.lapses < LEECH_LAPSE_THRESHOLD) {
    return { isLeech: false, suspendedUntilMs: null };
  }
  // Only suspend on a *fresh* lapse, not every time we re-evaluate an
  // already-leeched card. Caller decides whether to apply.
  return {
    isLeech: true,
    suspendedUntilMs: nowMs + LEECH_SUSPEND_DAYS * 86_400_000,
  };
}

export interface PriorityInputs {
  retrievability: number;   // 0..1 — current R(t)
  overdueDays: number;      // ≥ 0
  stability: number;        // days; 0 for fresh cards
  difficulty: number;       // 1..10; 0 for fresh
  lapses: number;
  isLeech: boolean;
}

/**
 * Scalar urgency score (higher = surface sooner). All terms are bounded so
 * no single one dominates; weights chosen so a leeched, severely overdue,
 * low-stability card always beats a barely-due fresh one.
 */
export function priorityScore(p: PriorityInputs): number {
  const forgetRisk = clamp(1 - p.retrievability, 0, 1);                      // 0..1
  // Overdueness normalized by stability (a card 2 half-lives past due ≈ 1.0).
  const stab = Math.max(p.stability, 0.1);
  const overdueNorm = clamp(p.overdueDays / (9 * stab), 0, 2);               // 0..2
  const diffNorm = clamp((p.difficulty || 5) / 10, 0, 1);                    // 0..1
  const lapseNorm = clamp(p.lapses / 10, 0, 1);                              // 0..1
  const leechBonus = p.isLeech ? 0.5 : 0;
  return 1.0 * forgetRisk
       + 0.6 * overdueNorm
       + 0.4 * diffNorm
       + 0.3 * lapseNorm
       + leechBonus;
}

/**
 * Closed-form optimal request retention (Su, Ye, et al. 2023). Given the
 * cost ratio between a review and a lapse (a lapse costs more time because
 * you have to re-learn), the retention that minimizes long-run review time
 * has a tractable form. We solve numerically — only one variable, monotone
 * gradient — using bisection in a safe range.
 *
 *   costRatio = T_lapse / T_review     (typical 3..10)
 *
 * Returns R* ∈ [0.7, 0.97].
 */
export function optimalRequestRetention(costRatio: number): number {
  const k = clamp(costRatio, 1.1, 50);
  // Per Su et al., total time ∝ -ln(R) / [R·(R + (1-R)·k)].
  const objective = (R: number) => -Math.log(R) / (R * (R + (1 - R) * k));
  let lo = 0.70, hi = 0.97;
  for (let i = 0; i < 60; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (objective(m1) < objective(m2)) hi = m2; else lo = m1;
  }
  return clamp((lo + hi) / 2, 0.70, 0.97);
}

export interface SmoothableCard {
  cardId: string;
  dueAtMs: number;
  priority: number;
}

/**
 * Defer the lowest-priority cards by whole days at a time until each calendar
 * day under the cap. Pure: returns a new array with updated `dueAtMs`.
 *
 * The algorithm is intentionally simple (greedy by ascending priority) to
 * make the behaviour explainable to teachers/students. Anki uses the same
 * approach.
 */
export function smoothWorkload(
  cards: readonly SmoothableCard[],
  dailyCap: number,
  nowMs: number,
): SmoothableCard[] {
  if (dailyCap <= 0 || cards.length <= dailyCap) return cards.map(c => ({ ...c }));
  const dayMs = 86_400_000;
  const dayKey = (t: number) => Math.floor((t - nowMs) / dayMs);
  const out = cards.map(c => ({ ...c }));
  // Sort by priority ascending — we'll defer the *least* urgent first.
  const order = [...out].sort((a, b) => a.priority - b.priority);
  const perDay = new Map<number, number>();
  for (const c of out) perDay.set(dayKey(c.dueAtMs), (perDay.get(dayKey(c.dueAtMs)) ?? 0) + 1);

  for (const c of order) {
    let k = dayKey(c.dueAtMs);
    let guard = 0;
    while ((perDay.get(k) ?? 0) > dailyCap && guard++ < 365) {
      perDay.set(k, (perDay.get(k) ?? 0) - 1);
      k += 1;
      perDay.set(k, (perDay.get(k) ?? 0) + 1);
      c.dueAtMs += dayMs;
    }
  }
  return out;
}
