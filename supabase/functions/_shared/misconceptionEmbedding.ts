// ============================================================================
//  misconceptionEmbedding.ts — Stage 14 · §5 (Structured misconception layer)
// ----------------------------------------------------------------------------
//  Until Stage 14 the engine knew *what* a student got wrong but not *why*
//  structurally. This module introduces a small, fixed taxonomy of
//  pedagogical misconceptions, each represented by a 16-dimensional vector
//  in a shared embedding space. Activations are updated online via
//  exponentially-weighted Bayesian evidence accumulation.
//
//  Why fixed taxonomy + small dim:
//   - Edge-runtime determinism (no training pipeline).
//   - Interpretability: every dimension maps to a documented cognitive
//     pattern, which is mandatory for ministry-grade auditability.
//   - Extensible: subject experts can register additional archetypes by
//     appending to MISCONCEPTION_TAXONOMY; existing rows stay valid.
// ============================================================================

export type MisconceptionId =
  | "linear_extrapolation"          // applies y = mx + c reasoning to non-linear systems
  | "associative_confusion"         // mis-applies (a+b)+c ≠ a+(b+c) style rules
  | "step_skipping"                 // jumps procedural steps without justification
  | "surface_memorisation"          // pattern-matches keywords without transfer
  | "sign_flip"                     // drops or duplicates negative signs
  | "unit_confusion"                // confuses units, scale, or dimensional analysis
  | "definition_inversion"          // swaps definitions of inverse concepts
  | "overgeneralisation";           // generalises a special-case rule beyond its domain

export const MISCONCEPTION_TAXONOMY: readonly MisconceptionId[] = Object.freeze([
  "linear_extrapolation",
  "associative_confusion",
  "step_skipping",
  "surface_memorisation",
  "sign_flip",
  "unit_confusion",
  "definition_inversion",
  "overgeneralisation",
]);

export const MISCONCEPTION_DIM = 16;

export interface MisconceptionVector {
  id: MisconceptionId;
  /** Latent embedding for similarity queries (fixed per archetype). */
  embedding: number[];
  /** Online evidence mass for this student/concept pair. */
  activation: number;
  /** Most recent posterior probability of this misconception being active. */
  posterior: number;
  /** Last update timestamp (ms). */
  lastUpdated: number;
}

/** Deterministic seed embedding — angular position on the unit hypersphere. */
function seedEmbedding(id: MisconceptionId, idx: number): number[] {
  const v = new Array<number>(MISCONCEPTION_DIM).fill(0);
  for (let i = 0; i < MISCONCEPTION_DIM; i++) {
    const phase = (idx + 1) * (i + 1) * 0.6180339887;
    v[i] = Math.sin(phase) * Math.cos(phase * 0.5 + idx);
  }
  // L2-normalise so cosine similarity is well-defined.
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

const SEED_CACHE: Record<MisconceptionId, number[]> = Object.fromEntries(
  MISCONCEPTION_TAXONOMY.map((id, idx) => [id, seedEmbedding(id, idx)]),
) as Record<MisconceptionId, number[]>;

export function newMisconceptionState(id: MisconceptionId): MisconceptionVector {
  return {
    id,
    embedding: SEED_CACHE[id].slice(),
    activation: 0,
    posterior: 0,
    lastUpdated: Date.now(),
  };
}

export interface MisconceptionSignal {
  /** 1 = wrong answer matching the misconception pattern, 0 = match absent. */
  match: 0 | 1;
  /** Optional confidence weight from the heuristic detector. */
  weight?: number;
}

/**
 * Bayesian online update of a misconception's posterior.
 *
 * Using a Beta(α, β) → Beta(α+w·match, β+w·(1-match)) update with
 * activation = α + β. We don't store α / β separately because the posterior
 * mean p = α/(α+β) and the activation suffice for downstream readers.
 */
export function updateMisconception(
  prev: MisconceptionVector,
  signal: MisconceptionSignal,
  decay: number = 0.05,
): MisconceptionVector {
  const w = Math.max(0, Math.min(1, signal.weight ?? 1));
  const decayed = Math.max(0, prev.activation * (1 - decay));
  const alpha = decayed * prev.posterior + w * signal.match;
  const beta  = decayed * (1 - prev.posterior) + w * (1 - signal.match);
  const total = alpha + beta;
  return {
    ...prev,
    activation: total,
    posterior: total > 0 ? alpha / total : 0,
    lastUpdated: Date.now(),
  };
}

/** Rank misconceptions by posterior probability above a confidence floor. */
export function rankActiveMisconceptions(
  states: Iterable<MisconceptionVector>,
  floor = 0.4,
): Array<{ id: MisconceptionId; posterior: number; activation: number }> {
  const out: Array<{ id: MisconceptionId; posterior: number; activation: number }> = [];
  for (const s of states) {
    if (s.posterior >= floor && s.activation > 0.5) {
      out.push({ id: s.id, posterior: s.posterior, activation: s.activation });
    }
  }
  out.sort((a, b) => b.posterior - a.posterior);
  return out;
}

/** Aggregate misconception activation magnitude for `unifiedState`. */
export function aggregateMisconceptionActivation(
  states: Iterable<MisconceptionVector>,
): number {
  let sumW = 0, sumP = 0;
  for (const s of states) {
    sumW += s.activation;
    sumP += s.activation * s.posterior;
  }
  return sumW > 0 ? sumP / sumW : 0;
}
