// ============================================================================
//  decisionRegret.ts — Stage 12 · §4 (Live regret tracking)
// ----------------------------------------------------------------------------
//  Stage 11 introduced batch off-policy regret estimation. Stage 12 elevates
//  this into a *continuous*, per-decision feed by logging the realised
//  bandit decision alongside an oracle proxy derived from the decision's
//  own alternative ranking (highest predicted-reward alternative observed
//  at decision time).
//
//  Why this oracle?
//   - At decision time the bandit committed to a single arm. The
//     `alternatives` JSON column persists the full UCB ranking. The arm
//     with the maximum *mean* (not UCB) is our best counterfactual guess
//     of the highest-reward action.
//   - regret_t = max_a mean_a  -  realised_reward
//   - This is a conservative estimator (the bandit's own posterior is the
//     oracle); it tends to *under*estimate true regret early in learning,
//     which we accept in exchange for not needing simulator rollouts.
//
//  The accumulated stream feeds longitudinal dashboards and Stage 12 §6
//  drift alerts ("cumulative regret rose by > 2σ vs. last week").
//
//  Everything is best-effort and swallows errors. Adaptation must never
//  break because telemetry stalled.
// ============================================================================

// deno-lint-ignore no-explicit-any
type SupabaseAdmin = any;

export interface RegretLogInput {
  userId: string;
  subject: string;
  decisionId: string;
  bucketKey: string;          // e.g. armId chosen — useful for slicing
  realisedReward: number;     // typically 0 or 1
  alternatives: Array<{ arm_id?: string; armId?: string; mean: number }>;
}

export interface RegretLogResult {
  oracle: number;
  realised: number;
  regret: number;
  inserted: boolean;
}

/**
 * Persist a single per-decision regret observation. Returns the values used
 * so the caller can include them in its own response payload / logs.
 */
export async function logDecisionRegret(
  admin: SupabaseAdmin,
  input: RegretLogInput,
): Promise<RegretLogResult> {
  const realised = Math.max(0, Math.min(1, Number(input.realisedReward) || 0));
  let oracle = realised;
  for (const alt of input.alternatives ?? []) {
    const m = Number(alt.mean);
    if (Number.isFinite(m) && m > oracle) oracle = m;
  }
  // The oracle proxy is the bandit posterior mean — bounded to [0,1] to match
  // the reward scale we're regressing against.
  oracle = Math.max(0, Math.min(1, oracle));
  const regret = Math.max(0, oracle - realised);

  let inserted = false;
  try {
    const { error } = await admin
      .from("policy_regret_log")
      .insert({
        user_id: input.userId,
        decision_id: input.decisionId,
        subject: input.subject,
        bucket_key: input.bucketKey,
        realised_reward: Number(realised.toFixed(4)),
        oracle_reward: Number(oracle.toFixed(4)),
        regret: Number(regret.toFixed(4)),
        run_id: null,
      });
    if (error) {
      console.warn("[decisionRegret] insert failed:", error.message);
    } else {
      inserted = true;
    }
  } catch (e) {
    console.warn("[decisionRegret] unexpected:", e);
  }

  return { oracle, realised, regret, inserted };
}
