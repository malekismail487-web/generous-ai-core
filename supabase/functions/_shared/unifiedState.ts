// ============================================================================
//  unifiedState.ts — Stage 14 · §2 (Unified Latent Student State Space)
// ----------------------------------------------------------------------------
//  Builds a single 32-dimensional latent vector Z_student that every adaptive
//  subsystem can read from AND write to. Replaces the fragmented state that
//  previously lived in IRT (θ), FSRS (stability), AKT (sequence memory),
//  Hawkes (excitation), and the LinUCB context.
//
//  Design notes:
//   - Deterministic, no learned weights at runtime. The "embedding" is a
//     stable concatenation of normalised subsystem outputs into fixed slots.
//   - Slot layout is versioned (`Z_LAYOUT_VERSION`) so callers can detect
//     drift after schema migrations.
//   - Pure projection — never mutates source state. Persistence happens
//     through `unified_student_state` via the edge layer.
//   - All values are clamped to [-3, 3] so downstream optimisers see a
//     bounded, scale-stable input regardless of subsystem peculiarities.
// ============================================================================

import type { ConceptMemory } from "./akt.ts";

export const Z_DIM = 32;
export const Z_LAYOUT_VERSION = 1;

export interface SubsystemSnapshot {
  /** IRT 2PL latent ability (θ) and standard error. */
  theta: number;
  thetaSe: number;
  /** Aggregated FSRS stability/retrievability statistics for the subject. */
  fsrsMeanStability: number;
  fsrsMeanRetrievability: number;
  fsrsOverdueRatio: number;
  /** AKT backbone last-hidden summary (mean of per-head residuals). */
  aktContextResidual: number;
  aktAttentionMass: number;
  aktMemoryResidual: number;
  aktMemoryMass: number;
  /** Hawkes excitation aggregates across concept graph neighbourhood. */
  hawkesExcitationMean: number;
  hawkesExcitationVariance: number;
  /** Ensemble forecast for the next item (probability + variance). */
  ensembleP: number;
  ensembleVariance: number;
  /** Bandit context features (concept difficulty band, recency). */
  recentAccuracy: number;
  recentResponseTimeZ: number;
  /** Engagement / fatigue (window of seconds active, off-task ratio). */
  fatigueIndex: number;
  /** Misconception activation magnitude (Stage 14 §5). */
  misconceptionActivation: number;
  /** Temporal-consistency residual from the previous tick (Stage 14 §7). */
  temporalResidual: number;
  /** Optional concept-memory snapshot used for higher-order summaries. */
  conceptMemory?: ConceptMemory;
}

const clamp = (x: number, lo = -3, hi = 3) => Math.min(hi, Math.max(lo, x));
const sanitize = (x: number, fallback = 0): number =>
  Number.isFinite(x) ? x : fallback;

/**
 * Project a SubsystemSnapshot into Z_student ∈ ℝ^32. Slot allocation is
 * frozen so downstream linear policies can rely on stable indices.
 */
export function buildUnifiedState(s: SubsystemSnapshot): number[] {
  const z = new Array<number>(Z_DIM).fill(0);

  // 0–3 ability core
  z[0] = clamp(sanitize(s.theta));
  z[1] = clamp(sanitize(s.thetaSe), 0, 3);
  z[2] = clamp(sanitize(s.theta) / Math.max(0.25, sanitize(s.thetaSe, 0.5)));
  z[3] = clamp(Math.tanh(sanitize(s.theta)));

  // 4–7 memory (FSRS)
  z[4] = clamp(sanitize(s.fsrsMeanStability) / 30 - 1);
  z[5] = clamp(2 * sanitize(s.fsrsMeanRetrievability, 0.5) - 1);
  z[6] = clamp(sanitize(s.fsrsOverdueRatio) * 2 - 1);
  z[7] = clamp((sanitize(s.fsrsMeanStability) - 7) / 7);

  // 8–12 sequence (AKT backbone)
  z[8]  = clamp(sanitize(s.aktContextResidual));
  z[9]  = clamp(Math.log1p(Math.max(0, sanitize(s.aktAttentionMass))) / 3);
  z[10] = clamp(sanitize(s.aktMemoryResidual));
  z[11] = clamp(Math.log1p(Math.max(0, sanitize(s.aktMemoryMass))) / 3);
  z[12] = clamp(0.5 * (z[8] + z[10]));

  // 13–14 excitation (Hawkes)
  z[13] = clamp(sanitize(s.hawkesExcitationMean) - 0.5);
  z[14] = clamp(Math.sqrt(Math.max(0, sanitize(s.hawkesExcitationVariance))));

  // 15–17 ensemble forecast
  z[15] = clamp(2 * sanitize(s.ensembleP, 0.5) - 1);
  z[16] = clamp(Math.sqrt(Math.max(0, sanitize(s.ensembleVariance))) * 4 - 1);
  z[17] = clamp(z[15] * (1 - z[16]));

  // 18–21 recent behaviour
  z[18] = clamp(2 * sanitize(s.recentAccuracy, 0.5) - 1);
  z[19] = clamp(sanitize(s.recentResponseTimeZ));
  z[20] = clamp(sanitize(s.fatigueIndex) * 2 - 1);
  z[21] = clamp(z[18] - 0.5 * z[20]);

  // 22–23 cross-system residuals (misconception, temporal)
  z[22] = clamp(sanitize(s.misconceptionActivation));
  z[23] = clamp(sanitize(s.temporalResidual));

  // 24–31 interaction features for the unified policy
  z[24] = clamp(z[0] - z[15]);                  // ability vs predicted
  z[25] = clamp(z[4] * z[5]);                   // memory strength
  z[26] = clamp(z[8] * z[18]);                  // sequence × recent acc
  z[27] = clamp(z[13] - z[22]);                 // excitation - misconception
  z[28] = clamp(z[1] + Math.abs(z[23]));        // total uncertainty
  z[29] = clamp(z[3] * (1 - Math.abs(z[20])));  // capacity available
  z[30] = clamp(z[15] - z[18]);                 // forecast surprise
  z[31] = clamp(0.5 * (z[12] + z[25]));         // composite mastery proxy

  return z;
}

/** Cosine similarity between two Z_student vectors (for drift monitoring). */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const den = Math.sqrt(na) * Math.sqrt(nb);
  return den > 0 ? dot / den : 0;
}

export const Z_SLOT_NAMES: readonly string[] = Object.freeze([
  "theta", "thetaSe", "thetaSignal", "thetaTanh",
  "fsrsStab", "fsrsRetr", "fsrsOverdue", "fsrsStabZ",
  "aktCtx", "aktMass", "aktMem", "aktMemMass", "aktBlend",
  "hawkesMu", "hawkesSd",
  "ensP", "ensSd", "ensConfidence",
  "recentAcc", "recentRtZ", "fatigue", "netCapacity",
  "misconception", "temporal",
  "abilityGap", "memoryStrength", "seqAccCoupling",
  "excMinusMisc", "totalUncertainty", "capacityAvail",
  "forecastSurprise", "masteryComposite",
]);
