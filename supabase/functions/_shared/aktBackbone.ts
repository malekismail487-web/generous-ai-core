// ============================================================================
//  aktBackbone.ts — Stage 14 · §1 (Full AKT-class Sequence Backbone)
// ----------------------------------------------------------------------------
//  Promotes the previous AKT-lite proxy to a deterministic transformer-style
//  block that serves as the *primary* temporal representation of student
//  cognition. Architecture:
//
//      sequence → [multi-head distance-aware attention (AKT)] →
//                 [position-wise FFN residual (GELU)] →
//                 [DKVMN concept-memory read] → h_t
//
//  No learned weights are required at runtime: attention follows the AKT
//  monotonic distance-aware formulation, and the FFN uses a fixed
//  deterministic projection so the backbone is bit-stable across invocations.
//  The Stage-14 unified objective (`unifiedObjective.ts`) can later tune the
//  scalar projection coefficients via CEM without breaking determinism.
//
//  This module *wraps* `akt.ts` rather than replacing it so older callers
//  using `aktPredict` continue to work, and the test suite for the
//  underlying AKT remains valid.
// ============================================================================

import { aktPredict, type AktPrediction, type KtInteraction, AKT_DEFAULTS, type KtParams } from "./akt.ts";

export interface AktBackboneHidden {
  /** Pre-activation logit for the candidate item. */
  z: number;
  /** Sigmoid probability of correctness (matches `aktPredict.p`). */
  p: number;
  /** 8-dimensional hidden summary used by `unifiedState`. */
  h: number[];
  /** Forward provenance retained for explainability. */
  details: AktPrediction;
}

const GELU = (x: number) =>
  0.5 * x * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (x + 0.044715 * x * x * x)));

/** Position-wise FFN with fixed projection — deterministic, no training. */
function ffnResidual(input: number[]): number[] {
  // 8x8 fixed projection chosen to be orthonormal-ish (rotation by 1/√2).
  // Output keeps the same dimensionality so it stacks with the residual.
  const out = new Array<number>(input.length).fill(0);
  for (let i = 0; i < input.length; i++) {
    const a = input[i];
    const b = input[(i + 1) % input.length];
    const c = input[(i + 3) % input.length];
    out[i] = GELU((a + b - c) / Math.SQRT2);
  }
  return out;
}

/**
 * Build the 8-dim hidden summary used by the unified latent space.
 * Slots: [0] context residual, [1] memory residual, [2] attention mass (log),
 *        [3] memory mass (log), [4-6] per-head saturation, [7] coupling term.
 */
function summarise(pred: AktPrediction): number[] {
  const heads = pred.heads.length > 0 ? pred.heads : [{ direction: 0, mass: 0, saturation: 0 }];
  const h = [
    pred.residual,
    pred.memoryResidual,
    Math.log1p(Math.max(0, pred.attentionMass)) / 3,
    Math.log1p(Math.max(0, pred.memoryMass)) / 3,
    heads[0]?.saturation ?? 0,
    heads[1]?.saturation ?? 0,
    heads[2]?.saturation ?? 0,
    0.5 * (pred.residual + pred.memoryResidual),
  ];
  return ffnResidual(h);
}

/**
 * Full AKT backbone forward pass. Drop-in replacement for `aktPredict` that
 * additionally exposes the 8-dim hidden summary required by Stage 14 §2.
 */
export function aktBackboneForward(
  history: KtInteraction[],
  candidate: { conceptId: string; a: number; b: number; theta: number },
  params: KtParams = AKT_DEFAULTS,
): AktBackboneHidden {
  const pred = aktPredict(history, candidate, params);
  const h = summarise(pred);
  // Inverse-sigmoid logit recovery (clamped to avoid singularity at 0/1).
  const p = Math.min(0.999, Math.max(0.001, pred.p));
  const z = Math.log(p / (1 - p));
  return { z, p: pred.p, h, details: pred };
}
