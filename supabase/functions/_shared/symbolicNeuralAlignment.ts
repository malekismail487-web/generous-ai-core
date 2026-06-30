// ============================================================================
//  symbolicNeuralAlignment.ts — Stage 14 · §8 (Symbolic ↔ neural alignment)
// ----------------------------------------------------------------------------
//  Establishes a *learned* bridge between the symbolic curriculum layer
//  (standards / objectives / concepts) and the neural latent space
//  (Z_student, AKT memory, misconception embeddings).
//
//  Forward direction  f(z) → standard activation distribution
//      Implemented as a linear projection W_fwd ∈ ℝ^{|S|×Z_DIM} followed by
//      a softmax. Used by `teaching-generate` to surface which standards
//      are currently "live" in the student's representation.
//
//  Inverse direction g(standard_one_hot) → embedding constraint
//      Implemented as W_inv ∈ ℝ^{Z_DIM×|S|}. The result is treated as an
//      additive bias on the unified state when a teacher (or pilot study)
//      pins a particular standard for the next session.
//
//  Both matrices are seeded from the existing `concept_standard_map`
//  (rule-based) so behaviour is identical to Stage 13 on first activation.
//  The Stage-14 unified objective can refine them online via the
//  L_alignment term.
// ============================================================================

import { Z_DIM } from "./unifiedState.ts";

export interface AlignmentMatrices {
  /** Standard ids in deterministic order — defines row/column layout. */
  standardIds: string[];
  /** Forward: standards × Z_DIM. */
  forward: number[][];
  /** Inverse: Z_DIM × standards. */
  inverse: number[][];
  /** Bias toward "no standard activated" — keeps softmax stable for empty z. */
  forwardBias: number[];
}

export function emptyAlignment(): AlignmentMatrices {
  return { standardIds: [], forward: [], inverse: [], forwardBias: [] };
}

/**
 * Build alignment matrices from a list of (standardId, conceptSlotBias)
 * pairs. The slotBias is a sparse map from Z slot indices to coefficients —
 * exactly what the rule-based concept_standard_map already encodes
 * (e.g. "mastery composite slot 31 contributes positively to MA.6.NS.1").
 */
export function buildAlignmentFromSeed(
  seeds: Array<{ standardId: string; slotBias: Record<number, number> }>,
): AlignmentMatrices {
  const standardIds = seeds.map((s) => s.standardId);
  const forward: number[][] = [];
  const inverse: number[][] = Array.from({ length: Z_DIM }, () =>
    new Array<number>(standardIds.length).fill(0)
  );
  const forwardBias = new Array<number>(standardIds.length).fill(-0.5);
  for (let s = 0; s < seeds.length; s++) {
    const row = new Array<number>(Z_DIM).fill(0);
    for (const [k, v] of Object.entries(seeds[s].slotBias)) {
      const i = Number(k);
      if (Number.isFinite(i) && i >= 0 && i < Z_DIM) {
        row[i] = v;
        // The inverse projection mirrors the forward one initially; the
        // online objective will diverge them as evidence accumulates.
        inverse[i][s] = v;
      }
    }
    forward.push(row);
  }
  return { standardIds, forward, inverse, forwardBias };
}

const softmax = (logits: number[]): number[] => {
  if (logits.length === 0) return [];
  const max = Math.max(...logits);
  const e = logits.map((l) => Math.exp(l - max));
  const s = e.reduce((a, b) => a + b, 0) || 1;
  return e.map((x) => x / s);
};

/** Forward projection: which curriculum standards are currently active? */
export function projectToStandards(
  z: number[],
  matrices: AlignmentMatrices,
): Array<{ standardId: string; probability: number }> {
  if (matrices.standardIds.length === 0) return [];
  const logits = matrices.forward.map((row, s) => {
    let acc = matrices.forwardBias[s] ?? 0;
    for (let i = 0; i < z.length; i++) acc += row[i] * z[i];
    return acc;
  });
  const probs = softmax(logits);
  return matrices.standardIds.map((id, i) => ({ standardId: id, probability: probs[i] }));
}

/** Inverse projection: bias the unified state toward a pinned standard. */
export function projectFromStandard(
  standardId: string,
  matrices: AlignmentMatrices,
  strength = 0.3,
): number[] {
  const idx = matrices.standardIds.indexOf(standardId);
  const bias = new Array<number>(Z_DIM).fill(0);
  if (idx < 0) return bias;
  for (let i = 0; i < Z_DIM; i++) bias[i] = strength * (matrices.inverse[i]?.[idx] ?? 0);
  return bias;
}

/**
 * Alignment loss component for `unifiedObjective`. Lower is better — the
 * inverse projection of the active-standards distribution should reconstruct
 * a vector close to the input z (autoencoding constraint).
 */
export function alignmentReconstructionLoss(
  z: number[],
  matrices: AlignmentMatrices,
): number {
  if (matrices.standardIds.length === 0) return 0;
  const acts = projectToStandards(z, matrices).map((a) => a.probability);
  const recon = new Array<number>(z.length).fill(0);
  for (let i = 0; i < z.length; i++) {
    for (let s = 0; s < acts.length; s++) recon[i] += matrices.inverse[i][s] * acts[s];
  }
  let loss = 0;
  for (let i = 0; i < z.length; i++) {
    const d = z[i] - recon[i];
    loss += d * d;
  }
  return loss / z.length;
}
