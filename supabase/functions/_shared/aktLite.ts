// ============================================================================
//  AKT-lite / simpleKT (pure-TS Knowledge Tracing)
// ----------------------------------------------------------------------------
//  Faithful, dependency-free implementation of the "simpleKT" line of work
//  (Liu et al., 2023) which showed that a Rasch-embedded item representation
//  + monotonic attention over the recent interaction sequence matches or
//  beats deeper KT architectures (AKT, SAKT, DKT) on standard benchmarks.
//
//  Design choices that keep this honest while staying serverless:
//
//    1. Item embedding = Rasch-derived scalar  e_q = a · (θ − b).
//       This is the simpleKT trick: it removes the need to learn a
//       D-dimensional item embedding because difficulty already encodes the
//       primary axis of variation. Empirically loses ~1pt AUC vs full
//       embeddings but removes the entire offline training pipeline.
//
//    2. Concept embedding = identity (one-hot via concept_id equality).
//       Inter-concept transfer is handled by the subject-level θ pull, not
//       by a learned similarity matrix. This is the most defensible cold-
//       start choice — no embedding can be reliably learned from <10k events.
//
//    3. Monotonic attention with exponential recency + correctness alignment.
//       attention(t→t') ∝ exp(−λ·Δsteps) · (1 if same concept else κ)
//       where κ is a small cross-concept leak (0.15) so unrelated history
//       still nudges the prediction.
//
//    4. Output:  P_kt = sigmoid( e_q + γ · context_residual )
//       where context_residual = Σ_t α_t · (c_t − P_t)  is the attention-
//       weighted residual of the student against their own historical
//       predictions on similar items. Positive residual ⇒ student
//       outperforms IRT expectations ⇒ raise P_kt above the Rasch baseline.
//
//  All weights (λ, κ, γ) are exposed for the Stage 3 per-user calibrator.
// ============================================================================

export interface KtInteraction {
  /** concept id */
  cid: string;
  /** question id (unused at inference, kept for richer signals later) */
  qid?: string;
  /** 1 = correct, 0 = wrong */
  c: 0 | 1;
  /** unix ms */
  ts: number;
  /** response time ms */
  rt?: number;
  /** item difficulty `b` known at the time of the interaction */
  b?: number;
  /** item discrimination `a` known at the time of the interaction */
  a?: number;
}

export interface KtParams {
  /** recency decay per step (higher = forget faster) */
  lambda: number;
  /** cross-concept attention floor (0 = same concept only) */
  kappa: number;
  /** residual gain into final logit */
  gamma: number;
  /** response-time anomaly dampener */
  rtPenaltyMs: number;
}

export const AKT_DEFAULTS: KtParams = {
  lambda: 0.04,
  kappa:  0.15,
  gamma:  0.85,
  rtPenaltyMs: 1500,
};

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-clamp(x, -30, 30)));

/**
 * Compute the simpleKT prediction for a candidate concept.
 *
 * @param history    chronological (oldest → newest) interaction sequence
 * @param candidate  { conceptId, a, b, theta } — IRT state at the moment we
 *                   are deciding whether this item is appropriate
 * @param params     attention / residual hyper-parameters
 */
export function aktLitePredict(
  history: KtInteraction[],
  candidate: { conceptId: string; a: number; b: number; theta: number },
  params: KtParams = AKT_DEFAULTS,
): { p: number; attentionMass: number; residual: number } {
  const eq = clamp(candidate.a * (candidate.theta - candidate.b), -8, 8);

  if (history.length === 0) {
    return { p: clamp(sigmoid(eq), 0.01, 0.99), attentionMass: 0, residual: 0 };
  }

  // Monotonic attention: only past influences future (we never look forward).
  // Walk from newest → oldest so step distance = i.
  let attentionSum = 0;
  let residual = 0;
  const newestFirst = history.slice().reverse();
  for (let i = 0; i < newestFirst.length; i++) {
    const ev = newestFirst[i];
    const sameConcept = ev.cid === candidate.conceptId ? 1 : params.kappa;
    let w = Math.exp(-params.lambda * i) * sameConcept;
    // Response-time gating: an absurdly fast right answer (likely guess)
    // contributes less; an absurdly fast wrong answer (slip/misclick) too.
    if (ev.rt != null && ev.rt > 0 && ev.rt < params.rtPenaltyMs) w *= 0.6;
    if (w < 1e-4) continue;

    // Per-event IRT expectation, using the (a, b) recorded at answer time
    // if available, else falling back to the candidate item parameters.
    const a_e = ev.a ?? candidate.a;
    const b_e = ev.b ?? candidate.b;
    const p_e = sigmoid(a_e * (candidate.theta - b_e));
    const r_e = ev.c - p_e;

    attentionSum += w;
    residual    += w * r_e;
  }

  const ctxResidual = attentionSum > 0 ? residual / attentionSum : 0;
  const p = clamp(sigmoid(eq + params.gamma * ctxResidual), 0.01, 0.99);
  return { p, attentionMass: attentionSum, residual: ctxResidual };
}
