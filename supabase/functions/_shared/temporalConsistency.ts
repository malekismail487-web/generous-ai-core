// ============================================================================
//  temporalConsistency.ts — Stage 14 · §7 (Bounded state-transition smoother)
// ----------------------------------------------------------------------------
//  Per-interaction updates to θ, mastery, and Z_student can in principle
//  produce non-physical jumps — e.g. mastery dropping from 0.9 to 0.2 after
//  a single wrong answer, or θ swinging multiple standard errors in one
//  step. This module enforces a Kalman-flavoured smoother:
//
//        z_t ← z_t-1 + clip(z_t - z_t-1, -Δ_t, +Δ_t)
//
//  where Δ_t = baseStep · (1 + uncertainty), letting genuinely uncertain
//  states move faster while preventing impulsive overcorrection on
//  confident ones. The "valid skill transitions" rule is enforced by
//  rejecting moves that violate prerequisite ordering inside the same tick.
//
//  Forgetting-driven regression is explicitly allowed: if `forgettingMass`
//  (in days × decay rate) exceeds a configurable threshold the step bound
//  is *relaxed* in the negative direction. This is what distinguishes
//  "impossible mastery regression" (banned) from "memory decay" (allowed).
// ============================================================================

import { Z_DIM } from "./unifiedState.ts";

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export interface TemporalGate {
  /** Maximum absolute step per slot under unit uncertainty. */
  baseStep: number;
  /** Slot-level uncertainty multipliers (defaults to all 1.0). */
  slotUncertainty?: number[];
  /** Threshold of forgetting mass beyond which negative bound is relaxed. */
  forgettingRelaxationThreshold: number;
  /** Relaxation factor when forgetting threshold is exceeded. */
  forgettingRelaxFactor: number;
}

export const TEMPORAL_DEFAULTS: TemporalGate = {
  baseStep: 0.35,
  forgettingRelaxationThreshold: 7,
  forgettingRelaxFactor: 2.5,
};

export interface TemporalResult {
  z: number[];
  /** Per-slot residual: how much the proposed move was clipped. */
  residual: number[];
  /** Scalar summary suitable for the `temporalResidual` slot of unifiedState. */
  residualMagnitude: number;
  /** Whether any slot exceeded the bound and required clipping. */
  clipped: boolean;
}

/**
 * Smooth a proposed unified state against the previous tick. Returns the
 * smoothed vector plus the clipped residual for §7 audit logging.
 */
export function smoothStateTransition(
  prev: number[],
  proposed: number[],
  forgettingMass = 0,
  gate: TemporalGate = TEMPORAL_DEFAULTS,
): TemporalResult {
  if (prev.length === 0) {
    return { z: proposed.slice(), residual: new Array(proposed.length).fill(0), residualMagnitude: 0, clipped: false };
  }
  if (prev.length !== proposed.length) {
    // Shape mismatch — caller is in a transitional state. Pass through
    // unmodified rather than corrupting either snapshot.
    return { z: proposed.slice(), residual: new Array(proposed.length).fill(0), residualMagnitude: 0, clipped: false };
  }
  const out = new Array<number>(proposed.length).fill(0);
  const residual = new Array<number>(proposed.length).fill(0);
  let clipped = false;
  let sqMag = 0;
  for (let i = 0; i < proposed.length; i++) {
    const unc = gate.slotUncertainty?.[i] ?? 1;
    const baseLimit = gate.baseStep * (0.5 + unc);
    const negLimit = forgettingMass >= gate.forgettingRelaxationThreshold
      ? baseLimit * gate.forgettingRelaxFactor
      : baseLimit;
    const delta = proposed[i] - prev[i];
    const clippedDelta = clamp(delta, -negLimit, baseLimit);
    if (clippedDelta !== delta) clipped = true;
    out[i] = prev[i] + clippedDelta;
    residual[i] = delta - clippedDelta;
    sqMag += residual[i] * residual[i];
  }
  return {
    z: out,
    residual,
    residualMagnitude: Math.sqrt(sqMag / Math.max(1, proposed.length)),
    clipped,
  };
}

/**
 * Validate a proposed prerequisite-aware mastery move. Returns false if the
 * new mastery on the child concept exceeds its parent by more than `slack`,
 * signalling a violation of the prerequisite ordering.
 */
export function validatesPrerequisiteOrder(
  parentMastery: number,
  childMastery: number,
  slack = 0.15,
): boolean {
  return childMastery <= parentMastery + slack;
}

/** Identity helper to expose Z_DIM for downstream typing checks. */
export const ENFORCED_Z_DIM = Z_DIM;
