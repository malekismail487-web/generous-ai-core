// ============================================================================
//  ktInterface.ts — Stage 12 · §7 (Future-proof knowledge-tracing adapter)
// ----------------------------------------------------------------------------
//  Today the engine runs an AKT-lite proxy. Tomorrow we may swap to SAKT, a
//  trained DKT, or a remote model server. This file declares the *single*
//  interface the rest of the engine consumes so that any new KT backend can
//  be slotted in without rippling changes through teaching-generate,
//  ability-update, or the ensemble blender.
//
//  Backwards compatibility:
//   - The existing `aktPredict` function from `akt.ts` already satisfies this
//     interface — `legacyAktAdapter` wraps it without modification.
//   - The currently-active adapter is selected by `getActiveKt()` which can
//     later branch on a runtimeConfig flag.
// ============================================================================

import { aktPredict, AKT_DEFAULTS, type KtInteraction } from "./akt.ts";

export interface KtPredictInput {
  /** Ordered interaction history (oldest → newest). */
  history: KtInteraction[];
  /** Target item identifier (string-keyed; concept_id or question_id). */
  targetId: string;
  /** Target item difficulty on the IRT-b scale (≈ -3..+3). */
  targetDifficulty: number;
  /** Target item discrimination (≈ 0.3..2.5). */
  targetDiscrimination: number;
  /** Current student ability estimate (subject-level θ). */
  theta: number;
  /** Optional auxiliary features the backend may consume. */
  features?: Record<string, number>;
}

export interface KtPredictOutput {
  /** Calibrated probability the student will answer correctly. */
  p: number;
  /** Latent state summary (model-specific; transparent JSON). */
  state?: Record<string, number | string | null>;
  /** Backend identifier so the surrounding code can record provenance. */
  backend: string;
}

export interface KtBackend {
  readonly id: string;
  predict(input: KtPredictInput): KtPredictOutput;
}

/** Legacy adapter — preserves the exact behaviour the engine had pre-Stage 12. */
export const legacyAktAdapter: KtBackend = {
  id: "akt-lite-v1",
  predict(input) {
    const res = aktPredict(
      input.history,
      {
        targetId: input.targetId,
        a: input.targetDiscrimination,
        b: input.targetDifficulty,
        theta: input.theta,
      },
      AKT_DEFAULTS,
    );
    return {
      p: res.p,
      backend: this.id,
      state: { attention_mass: Number(res.attentionMass ?? 0), interactions: input.history.length },
    };
  },
};

/**
 * Returns the currently active KT backend. Today the only branch is the
 * legacy adapter; a future runtime-config flag (`kt_backend = "sakt-v1"`) can
 * extend the switch without touching call sites.
 */
export function getActiveKt(_flag?: string): KtBackend {
  return legacyAktAdapter;
}
