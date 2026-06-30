// ============================================================================
//  memorySequenceCoupling.ts — Stage 14 · §4 (AKT ↔ FSRS bidirectional link)
// ----------------------------------------------------------------------------
//  Before Stage 14 the AKT backbone modelled sequence transitions while FSRS
//  modelled forgetting curves in parallel — neither informed the other. This
//  module implements the two-way coupling explicitly:
//
//    1. attentionToDecay():  high AKT attention mass on a concept *slows*
//       forgetting (the student is rehearsing it implicitly), low mass
//       *accelerates* decay. Multiplies the FSRS stability by a bounded
//       gain in [0.7, 1.3].
//
//    2. retrievabilityToAttention(): low retrievability at prediction time
//       boosts attention weight on past events for the same concept. This
//       lets the next AKT forward pass "look harder" at things the student
//       is about to forget.
//
//  All transformations are monotone, bounded, and deterministic so they
//  satisfy the §7 temporal-consistency constraints automatically.
// ============================================================================

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export interface CouplingGains {
  /** Maximum multiplicative boost to stability when attention is high. */
  maxStabilityGain: number;
  /** Minimum multiplicative shrink to stability when attention is low. */
  minStabilityGain: number;
  /** Attention-mass scale at which the gain reaches ~63% of its asymptote. */
  attentionScale: number;
  /** Retrievability threshold below which attention weight is amplified. */
  retrievabilityFloor: number;
  /** Maximum attention weight amplification factor. */
  maxAttentionBoost: number;
}

export const COUPLING_DEFAULTS: CouplingGains = {
  maxStabilityGain: 1.3,
  minStabilityGain: 0.7,
  attentionScale: 2.0,
  retrievabilityFloor: 0.5,
  maxAttentionBoost: 1.5,
};

/** Modulate an FSRS stability value by accumulated AKT attention mass. */
export function attentionToDecay(
  stability: number,
  attentionMass: number,
  gains: CouplingGains = COUPLING_DEFAULTS,
): number {
  const sat = 1 - Math.exp(-Math.max(0, attentionMass) / gains.attentionScale);
  // Center at 1.0; positive saturation lifts toward maxStabilityGain,
  // a fully unobserved concept (sat→0) settles at minStabilityGain.
  const gain = gains.minStabilityGain +
    (gains.maxStabilityGain - gains.minStabilityGain) * sat;
  return Math.max(0.01, stability * gain);
}

/** Boost attention weight for events on concepts the student is forgetting. */
export function retrievabilityToAttention(
  baseWeight: number,
  retrievability: number,
  gains: CouplingGains = COUPLING_DEFAULTS,
): number {
  if (retrievability >= gains.retrievabilityFloor) return baseWeight;
  const deficit = (gains.retrievabilityFloor - retrievability) /
    Math.max(1e-6, gains.retrievabilityFloor);
  const boost = 1 + (gains.maxAttentionBoost - 1) * clamp(deficit, 0, 1);
  return baseWeight * boost;
}

/**
 * Combined helper for diagnostics: how much does coupling change a single
 * (stability, retrievability) pair on the next tick?
 */
export function couplingDelta(
  stability: number,
  retrievability: number,
  attentionMass: number,
  gains: CouplingGains = COUPLING_DEFAULTS,
): { newStability: number; attentionBoost: number; coupledRetention: number } {
  const newStability = attentionToDecay(stability, attentionMass, gains);
  const attentionBoost = retrievabilityToAttention(1, retrievability, gains);
  // Implied retention after one day given the new stability
  // Uses FSRS retention formula r = exp(-t / S).
  const coupledRetention = Math.exp(-1 / Math.max(0.5, newStability));
  return { newStability, attentionBoost, coupledRetention };
}
