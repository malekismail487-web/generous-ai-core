/**
 * updateGating.ts — uncertainty-aware update step size.
 *
 * Not every answer should move the ability estimate by the same amount.
 * A guess on a brand-new untested question carries far less signal than
 * a deliberate answer on a calibrated quiz question. We scale the Rasch
 * step `K` by a quality factor in [0,1] that combines:
 *
 *   - concept_weight       (from inferConceptDistribution — soft assignment)
 *   - question_confidence  (how empirically calibrated this item is)
 *   - response_confidence  (how much we trust this source/response)
 *
 * The product is clamped to [0.15, 1.0] so we still move on every answer
 * (no answer is worth literally zero) but unreliable signals don't dominate.
 */

export type ResponseSource =
  | "exam"
  | "assignment"
  | "quiz"
  | "probe"
  | "ai_practice"
  | "self_graded";

const SOURCE_TRUST: Record<ResponseSource, number> = {
  exam: 1.0,
  assignment: 0.95,
  quiz: 0.9,
  probe: 0.85,
  ai_practice: 0.7,
  self_graded: 0.4,
};

export interface GatingInput {
  conceptWeight: number;          // 0..1; pass 1 for subject-level update
  questionTimesSeen: number;      // from question_bank.times_seen
  source: ResponseSource | string;
  responseTimeMs?: number | null; // optional speed sanity check
}

export interface GatingResult {
  qualityFactor: number;          // multiply against K_base
  questionConfidence: number;
  responseConfidence: number;
}

export function computeGating(input: GatingInput): GatingResult {
  const questionConfidence = Math.min(1, Math.max(0.25, input.questionTimesSeen / 20));
  const srcKey = (input.source in SOURCE_TRUST ? input.source : "quiz") as ResponseSource;
  let responseConfidence = SOURCE_TRUST[srcKey];

  // Suspiciously fast answers (< 1.5s on a non-trivial question) drop the
  // response confidence — likely a click-through, not deliberate reasoning.
  if (typeof input.responseTimeMs === "number" && input.responseTimeMs > 0 && input.responseTimeMs < 1500) {
    responseConfidence *= 0.7;
  }

  const qualityFactor = clamp(
    input.conceptWeight * questionConfidence * responseConfidence,
    0.15,
    1.0,
  );

  return {
    qualityFactor: Number(qualityFactor.toFixed(3)),
    questionConfidence: Number(questionConfidence.toFixed(3)),
    responseConfidence: Number(responseConfidence.toFixed(3)),
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
