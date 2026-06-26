// ============================================================================
//  propensity.ts — Stage 11
// ----------------------------------------------------------------------------
//  LinUCB by default is deterministic (argmax UCB), which makes off-policy
//  evaluation impossible: every logged decision has propensity 1.0 for the
//  chosen arm and 0 for every other arm, so any IPS-style estimator divides
//  by zero or zero-weights the entire log.
//
//  Stage 11 fixes this by recording a *softmax-over-UCB* propensity at
//  decision time. The behaviour policy is still effectively argmax (we pick
//  the chosen arm with probability ≈ 1 when temperature τ → 0), but with
//  τ > 0 we get a well-defined, strictly positive probability over every
//  arm — which is exactly what Doubly-Robust / SNIPS / IPS need.
//
//  Math:
//        π_b(a | x) = exp(UCB_a / τ) / Σ_k exp(UCB_k / τ)
//
//  Stability:
//    • subtract the max UCB before exponentiating (logsumexp trick)
//    • clamp each propensity to [PROP_FLOOR, 1] to bound IPS weights — this
//      is a standard variance-reduction trick at the cost of a small bias.
//    • τ defaults to 0.15: chosen propensity ≈ 0.85–0.95 for typical UCB
//      gaps, so the behaviour policy is *near*-greedy but every arm is
//      always reachable.
// ============================================================================

import type { ArmScore } from "./linucb.ts";

export const PROP_FLOOR = 0.01;
export const DEFAULT_TEMPERATURE = 0.15;

export interface PropensityEntry {
  armId: string;
  ucb: number;
  prob: number;
}

export interface PropensityDistribution {
  temperature: number;
  entries: PropensityEntry[];
  chosenArm: string;
  chosenProb: number;
}

/**
 * Convert a UCB ranking into a stable softmax propensity distribution.
 * `chosenArm` is whatever the policy ultimately executed (usually the
 * argmax of `ranking`), but we accept it explicitly because the caller
 * may apply tiebreakers or overrides we shouldn't second-guess here.
 */
export function softmaxPropensity(
  ranking: ArmScore[],
  chosenArm: string,
  temperature: number = DEFAULT_TEMPERATURE,
): PropensityDistribution {
  if (ranking.length === 0) {
    throw new Error("softmaxPropensity: empty ranking");
  }
  const tau = Math.max(1e-3, temperature);
  let maxU = -Infinity;
  for (const r of ranking) if (r.ucb > maxU) maxU = r.ucb;
  let denom = 0;
  const raw: number[] = new Array(ranking.length);
  for (let i = 0; i < ranking.length; i++) {
    const v = Math.exp((ranking[i].ucb - maxU) / tau);
    raw[i] = v;
    denom += v;
  }
  // Floor + renormalize. We floor *before* renormalization so the post-floor
  // distribution still sums to 1 exactly.
  const floored: number[] = raw.map((v) => Math.max(PROP_FLOOR, v / denom));
  const sum = floored.reduce((s, v) => s + v, 0);
  const entries: PropensityEntry[] = ranking.map((r, i) => ({
    armId: r.armId,
    ucb: r.ucb,
    prob: floored[i] / sum,
  }));
  const chosen = entries.find((e) => e.armId === chosenArm);
  // If the executed arm wasn't in the ranking we still expose a floor
  // probability so downstream IPS stays defined.
  const chosenProb = chosen?.prob ?? PROP_FLOOR;
  return { temperature: tau, entries, chosenArm, chosenProb };
}

/** Look up π_b(a | x) for one arm; returns PROP_FLOOR if unknown. */
export function lookupProb(dist: PropensityDistribution, armId: string): number {
  const e = dist.entries.find((x) => x.armId === armId);
  return e?.prob ?? PROP_FLOOR;
}
