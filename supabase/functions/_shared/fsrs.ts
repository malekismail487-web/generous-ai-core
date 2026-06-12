// ============================================================================
//  FSRS-v5 — Free Spaced Repetition Scheduler, version 5
//            (Ye, Su, et al., 2024 — https://github.com/open-spaced-repetition)
// ----------------------------------------------------------------------------
//  FSRS is the current best-in-class memory model for spaced repetition. It
//  models the student's relationship with a "card" (here: a concept) via a
//  two-state hidden process:
//
//      Difficulty  D ∈ [1, 10]    — how hard *this* card is for *this* user
//      Stability   S > 0  (days)  — current memory half-life
//      Retrievability R(t) = (1 + t/(9 S))^(−1)   (FSRS-5 power-law form)
//
//  After each review (Again=1 / Hard=2 / Good=3 / Easy=4) the model updates
//  (S, D) with the published v5 update equations. We expose three things to
//  the rest of the platform:
//
//   1.  `fsrsPredict(card, nowMs)`           → P(retrieval) right now
//       Used as a sixth ensemble signal (forgetting curve, much more
//       principled than DASH's logistic-of-counts).
//
//   2.  `fsrsUpdate(card, rating, nowMs)`    → new (S, D, lastReviewMs)
//       Called from ability-update after every graded answer. Wrong answers
//       map to rating=1 ("Again"), correct answers map to rating=3 ("Good"),
//       with rating=2 / 4 reserved for explicit confidence collection.
//
//   3.  `fsrsNextInterval(S, requestRetention)` → days until next review
//       The Stage 5 spaced-repetition orchestrator uses this to schedule
//       refreshers. Default `requestRetention = 0.9` (the FSRS author's
//       recommended setting; trades roughly 10 % daily forgetting for
//       minimum total review time).
//
//  All 19 weights below are the published FSRS-5 defaults trained on the
//  ~17M-review Anki dataset. They are exposed so Stage 6 can fit per-user
//  weights later without forking the code.
// ============================================================================

export type FsrsRating = 1 | 2 | 3 | 4; // Again | Hard | Good | Easy

export interface FsrsCard {
  /** stability in days; 0 means "never reviewed" */
  S: number;
  /** difficulty 1..10; 0 means "never reviewed" */
  D: number;
  /** ms timestamp of the last review */
  lastReviewMs: number;
  /** total reviews to date */
  reps: number;
  /** number of "Again" lapses */
  lapses: number;
}

export const FSRS5_DEFAULT_WEIGHTS: readonly number[] = [
  0.40255, 1.18385, 3.17300, 15.69105, 7.19490, 0.53450, 1.46040,
  0.00460, 1.54575, 0.11920, 1.01925, 1.93950, 0.11000, 0.29605,
  2.26980, 0.21500, 2.71430, 0.62290, 0.29440,
] as const;

export const FSRS5_DEFAULTS = {
  w: FSRS5_DEFAULT_WEIGHTS,
  requestRetention: 0.9,
  /** factor in R(t) = (1 + t / (FACTOR * S))^-1 — published v5 value. */
  decayFactor: 9,
  /** clamp stability to a sensible band to keep numerics stable. */
  minStability: 0.01,
  maxStability: 36500,  // 100 years
};

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function newFsrsCard(): FsrsCard {
  return { S: 0, D: 0, lastReviewMs: 0, reps: 0, lapses: 0 };
}

/** Initial stability after the first review (FSRS-5 eq. S0). */
function initialStability(rating: FsrsRating, w: readonly number[]): number {
  return clamp(w[rating - 1], FSRS5_DEFAULTS.minStability, FSRS5_DEFAULTS.maxStability);
}

/** Initial difficulty after the first review (FSRS-5 eq. D0). */
function initialDifficulty(rating: FsrsRating, w: readonly number[]): number {
  const d = w[4] - Math.exp(w[5] * (rating - 1)) + 1;
  return clamp(d, 1, 10);
}

/**
 * Retrievability under the FSRS-5 power-law forgetting curve.
 *   R(t) = (1 + t / (decayFactor · S))^-1
 * `elapsedDays` may be 0 (just reviewed). Unreviewed cards return 0.5 as a
 * neutral prior so the ensemble doesn't catastrophically pull predictions
 * either way during cold start.
 */
export function fsrsRetrievability(
  card: FsrsCard,
  nowMs: number,
  decayFactor = FSRS5_DEFAULTS.decayFactor,
): number {
  if (!card.lastReviewMs || card.S <= 0) return 0.5;
  const elapsedDays = Math.max(0, (nowMs - card.lastReviewMs) / 86400000);
  if (elapsedDays === 0) return clamp(1.0, 0.01, 0.99);
  const r = 1 / (1 + elapsedDays / (decayFactor * card.S));
  return clamp(r, 0.01, 0.99);
}

/** Convenience: the ensemble signal — P(answer correct now) ≈ R(t). */
export function fsrsPredict(card: FsrsCard, nowMs: number, w = FSRS5_DEFAULT_WEIGHTS): number {
  return fsrsRetrievability(card, nowMs);
}

/**
 * Difficulty update (FSRS-5 eq. D'). Mean-reverts toward the "easy difficulty"
 * D0(Easy) so cards drift toward calibration after a long correct streak.
 */
function nextDifficulty(D: number, rating: FsrsRating, w: readonly number[]): number {
  // Linear damped update.
  const deltaD = -w[6] * (rating - 3);
  const Dp = D + deltaD * (10 - D) / 9;
  // Mean reversion toward D0(Easy = 4).
  const target = initialDifficulty(4 as FsrsRating, w);
  const Dpp = w[7] * target + (1 - w[7]) * Dp;
  return clamp(Dpp, 1, 10);
}

/** Stability after a successful review (rating ≥ 2). FSRS-5 eq. S'. */
function nextRecallStability(
  S: number, D: number, R: number, rating: FsrsRating, w: readonly number[],
): number {
  const hardPenalty = rating === 2 ? w[15] : 1;
  const easyBonus   = rating === 4 ? w[16] : 1;
  const sInc = Math.exp(w[8])
    * (11 - D)
    * Math.pow(S, -w[9])
    * (Math.exp(w[10] * (1 - R)) - 1)
    * hardPenalty
    * easyBonus;
  return clamp(S * (1 + sInc), FSRS5_DEFAULTS.minStability, FSRS5_DEFAULTS.maxStability);
}

/** Stability after a lapse (rating = 1 / Again). FSRS-5 eq. S'_f. */
function nextForgetStability(
  S: number, D: number, R: number, w: readonly number[],
): number {
  const sForget = w[11]
    * Math.pow(D, -w[12])
    * (Math.pow(S + 1, w[13]) - 1)
    * Math.exp(w[14] * (1 - R));
  return clamp(sForget, FSRS5_DEFAULTS.minStability, S);
}

/**
 * Roll the (S, D) state forward by one review. Pure: returns a new card.
 *
 * `nowMs` is the time of *this* review — we recompute R(t) at the elapsed
 * interval so the same rating produces a different stability bump depending
 * on how overdue the card was (this is the whole reason FSRS beats SM-2).
 */
export function fsrsUpdate(
  card: FsrsCard,
  rating: FsrsRating,
  nowMs: number,
  w: readonly number[] = FSRS5_DEFAULT_WEIGHTS,
): FsrsCard {
  // First review — seed the state.
  if (card.S <= 0 || !card.lastReviewMs) {
    return {
      S: initialStability(rating, w),
      D: initialDifficulty(rating, w),
      lastReviewMs: nowMs,
      reps: 1,
      lapses: rating === 1 ? 1 : 0,
    };
  }
  const R = fsrsRetrievability(card, nowMs);
  const D2 = nextDifficulty(card.D, rating, w);
  const S2 = rating === 1
    ? nextForgetStability(card.S, card.D, R, w)
    : nextRecallStability(card.S, card.D, R, rating, w);
  return {
    S: S2,
    D: D2,
    lastReviewMs: nowMs,
    reps: card.reps + 1,
    lapses: card.lapses + (rating === 1 ? 1 : 0),
  };
}

/**
 * Days until the next review for a target retention. Inverse of the
 * power-law retrievability curve.
 *
 *     R = (1 + t / (f · S))^-1   ⇒   t = f · S · (1/R − 1)
 */
export function fsrsNextInterval(
  stability: number,
  requestRetention = FSRS5_DEFAULTS.requestRetention,
  decayFactor = FSRS5_DEFAULTS.decayFactor,
): number {
  const S = Math.max(stability, FSRS5_DEFAULTS.minStability);
  const R = clamp(requestRetention, 0.5, 0.99);
  return decayFactor * S * (1 / R - 1);
}

/** Map a binary correctness signal to an FSRS rating. */
export function ratingFromBinary(isCorrect: boolean, fast?: boolean): FsrsRating {
  if (!isCorrect) return 1;
  return fast ? 4 : 3;
}
