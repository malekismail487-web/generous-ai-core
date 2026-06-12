// ============================================================================
//  HawkesKT — Hawkes-process Knowledge Tracing  (Wang et al., 2021)
//             "Temporal Cross-Effects in Knowledge Tracing", WSDM '21.
// ----------------------------------------------------------------------------
//  Knowledge tracing model that explicitly captures CROSS-CONCEPT TEMPORAL
//  EXCITATION: a successful answer on concept A briefly raises the predicted
//  success probability on every concept B that A excites, with the strength
//  decaying exponentially in time.
//
//  This is the KT signal that AKT cannot see. AKT's attention is dominated by
//  same-concept history (kappa < 1 for cross-concept), and DKVMN memory is
//  per-concept by construction. Hawkes excitation fills the gap: when a
//  student masters fractions, their predicted success on division should
//  *immediately* tick up even if they haven't answered a division question yet.
//
//  Math:
//
//      λ_c(t) = μ_c + Σ_{e in history}  α(e.cid, c) · K(t − e.ts) · sign(e)
//
//      K(Δt)  = exp(−β · Δt_days)                       (exponential kernel)
//      sign(e) = +1 if correct, −e_penalty if wrong
//
//      P(correct on c at t) = σ( a · (θ − b) + γ · λ_c(t) )
//
//  We learn the cross-concept matrix α implicitly from the conceptGraph
//  curriculum links: α(A, B) = base for same-concept, base*linkWeight for
//  curriculum-linked concepts, 0 otherwise. This is pure-math, no offline
//  training, and runs in the edge function with the rest of the ensemble.
// ============================================================================

import type { KtInteraction } from "./akt.ts";

export interface HawkesParams {
  /** baseline intensity µ per concept (assumed identical). */
  mu: number;
  /** kernel decay rate β; half-life ≈ ln 2 / β days. */
  beta: number;
  /** logit gain γ on the excitation term. */
  gamma: number;
  /** base excitation strength for same-concept events. */
  alphaSame: number;
  /** cross-concept excitation (multiplied by curriculum link weight, 0..1). */
  alphaCross: number;
  /** wrong-answer inhibition strength (positive number). */
  wrongPenalty: number;
}

export const HAWKES_DEFAULTS: HawkesParams = {
  mu:           0.0,
  beta:         0.30,       // 24-hour half-life ≈ 2.3 days; tune via Stage 6
  gamma:        0.45,
  alphaSame:    0.85,
  alphaCross:   0.25,
  wrongPenalty: 0.7,
};

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-clamp(x, -30, 30)));

export interface HawkesCandidate {
  conceptId: string;
  a: number;
  b: number;
  theta: number;
  /** unix ms — the time at which the prediction is being made (usually now). */
  nowMs: number;
}

/**
 * Cross-concept link weight resolver. The caller supplies a map of
 * { fromCid → { toCid → weight in [0,1] } } so the engine stays decoupled
 * from any concrete curriculum graph schema. Missing entries → 0 (no link).
 */
export type ConceptLinkResolver = (fromCid: string, toCid: string) => number;

/** Default resolver: same-concept = 1, everything else = 0. */
export const SAME_CONCEPT_ONLY: ConceptLinkResolver = (a, b) => a === b ? 1 : 0;

export interface HawkesPrediction {
  p: number;
  intensity: number;
  contributors: number;
}

/**
 * Hawkes prediction for a candidate concept at time `nowMs`.
 *
 * The link resolver `linkWeight(eventCid, candidateCid)` returns the
 * unitless excitation share; `alphaSame` is used when the two cids are
 * literally equal, `alphaCross * linkWeight` otherwise. This keeps same-
 * concept events dominant while still letting curriculum neighbours
 * contribute.
 */
export function hawkesPredict(
  history: KtInteraction[],
  candidate: HawkesCandidate,
  linkWeight: ConceptLinkResolver = SAME_CONCEPT_ONLY,
  params: HawkesParams = HAWKES_DEFAULTS,
): HawkesPrediction {
  let intensity = params.mu;
  let contributors = 0;
  for (const ev of history) {
    const dtDays = Math.max(0, (candidate.nowMs - ev.ts) / 86400000);
    const K = Math.exp(-params.beta * dtDays);
    if (K < 1e-4) continue;
    let alpha: number;
    if (ev.cid === candidate.conceptId) {
      alpha = params.alphaSame;
    } else {
      const w = clamp(linkWeight(ev.cid, candidate.conceptId), 0, 1);
      if (w <= 0) continue;
      alpha = params.alphaCross * w;
    }
    const sign = ev.c === 1 ? 1 : -params.wrongPenalty;
    intensity += alpha * K * sign;
    contributors += 1;
  }
  const z = candidate.a * (candidate.theta - candidate.b) + params.gamma * intensity;
  return {
    p: clamp(sigmoid(z), 0.01, 0.99),
    intensity,
    contributors,
  };
}
