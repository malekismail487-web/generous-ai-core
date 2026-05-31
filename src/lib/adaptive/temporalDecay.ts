/**
 * temporalDecay.ts — time-aware ability adjustments.
 *
 * Stored theta is the raw value; *effective* theta is what we hand to the
 * prompt builder and to next-question selection. A student who scored well
 * 8 weeks ago and hasn't practised since is not the same as one who scored
 * well yesterday — we shrink their ability toward the subject mean and
 * inflate their SE so the engine becomes appropriately less confident.
 *
 * Reinforcement: if the student has practised the same subject within the
 * last 7 days (>= 3 graded answers), decay is cancelled — the value is fresh.
 *
 * We do this client-side at read time rather than mutating the DB on a cron
 * because (a) it's deterministic from the stored fields and (b) it keeps
 * the audit trail of the raw measured value intact.
 */

const HALF_LIFE_DAYS = 60;
const FRESH_WINDOW_DAYS = 7;
const SE_INFLATION_PER_HALFLIFE = 0.15; // additive SE per half-life elapsed

export interface DecayInput {
  theta: number;
  theta_se: number;
  last_graded_at: string | null | undefined;
  recent_graded_count?: number; // # graded answers in last FRESH_WINDOW_DAYS
}

export interface DecayedAbility {
  theta: number;
  theta_se: number;
  days_since: number;
  decayed: boolean;
}

export function applyTemporalDecay(input: DecayInput): DecayedAbility {
  const last = input.last_graded_at ? new Date(input.last_graded_at).getTime() : NaN;
  if (!Number.isFinite(last)) {
    return { theta: input.theta, theta_se: input.theta_se, days_since: 0, decayed: false };
  }
  const daysSince = Math.max(0, (Date.now() - last) / 86_400_000);

  // Recent activity overrides decay — value is still fresh.
  if (
    daysSince <= FRESH_WINDOW_DAYS ||
    (input.recent_graded_count ?? 0) >= 3
  ) {
    return { theta: input.theta, theta_se: input.theta_se, days_since: daysSince, decayed: false };
  }

  // Exponential shrink toward the subject mean (0).
  const shrink = Math.exp(-daysSince / HALF_LIFE_DAYS);
  const decayedTheta = input.theta * shrink;
  const halfLivesElapsed = daysSince / HALF_LIFE_DAYS;
  const decayedSe = Math.min(
    1.5,
    input.theta_se + SE_INFLATION_PER_HALFLIFE * halfLivesElapsed,
  );

  return {
    theta: Number(decayedTheta.toFixed(3)),
    theta_se: Number(decayedSe.toFixed(3)),
    days_since: daysSince,
    decayed: true,
  };
}
