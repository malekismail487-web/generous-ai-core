// ============================================================================
//  responseTime.ts — Stage 12 · §2 (Response-time-aware confidence gating)
// ----------------------------------------------------------------------------
//  Response times have always been *collected*; before Stage 12 only the
//  extremes (<1.5s = penalty, <4s = guess/slip detector) influenced the
//  update. That binary thresholding throws away most of the signal and
//  produces unstable behaviour right around the threshold.
//
//  We now model response time as a log-normal-aware *confidence weight* in
//  [w_min, 1]. The weight modulates Fisher information for IRT, the gating
//  K for mastery, and the label confidence used by the online ensemble
//  retraining. It never replaces correctness — a wrong answer remains a
//  wrong answer; it only changes how much we let that observation move
//  the estimates.
//
//  Design:
//   - We compare log(rt) to a midpoint log-RT (`muLog`) with spread
//     `sigmaLog`; both are tunable via the runtime config.
//   - Very fast correct answers are treated as partial information about
//     a guess (weight ≈ 0.55–0.7), not full information.
//   - Very slow answers (>3σ above midpoint) decay smoothly toward
//     `w_min = 0.35`; they may indicate distracted reasoning or AFK time
//     but still carry signal.
//   - Wrong answers are treated symmetrically: fast wrong = slip-like
//     (small weight), well-paced wrong = full weight.
//   - The weight is **monotonic and smooth** w.r.t. RT (Gaussian on logRT),
//     so a 10ms change in RT cannot flip the update direction.
//
//  All pure — no Date, no IO, no Math.random.
// ============================================================================

export interface RtGatingConfig {
  /** Median expected RT in milliseconds. */
  rtMidpointMs: number;
  /** Spread on log-ms scale (standard deviation of logRT). */
  rtSpreadLog: number;
  /** Minimum confidence weight (safety floor). */
  minWeight?: number;
}

export interface RtWeightResult {
  /** Final multiplicative confidence weight in [minWeight, 1]. */
  weight: number;
  /** Standardised log-RT distance (signed: <0 = faster than median). */
  z: number;
  /** Classification used for telemetry: "fast", "normal", "slow", "unknown". */
  band: "fast" | "normal" | "slow" | "unknown";
}

const DEFAULT_MIN_WEIGHT = 0.35;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/**
 * Compute the multiplicative confidence weight for an observation given
 * its response time and the correctness flag.
 *
 *  - When rt is null/undefined/<=0 the weight is 1 (no penalty, no boost).
 *  - The Gaussian envelope on logRT is bell-shaped at z=0 (peak = 1.0).
 *  - For correct answers, the *left tail* (very fast) is treated as a
 *    guess and weighted as if z=1 on the right side, so a perfect-but-
 *    instant answer collapses to ~exp(-0.5) ≈ 0.61 rather than 1.0.
 *  - For incorrect answers, the same left-tail handling treats it as a
 *    slip, reducing how much we punish theta for what may be a click.
 */
export function rtConfidenceWeight(
  responseTimeMs: number | null | undefined,
  isCorrect: boolean,
  cfg: RtGatingConfig,
): RtWeightResult {
  const minW = cfg.minWeight ?? DEFAULT_MIN_WEIGHT;
  if (!responseTimeMs || !Number.isFinite(responseTimeMs) || responseTimeMs <= 0) {
    return { weight: 1, z: 0, band: "unknown" };
  }
  const mu = Math.log(Math.max(1_000, cfg.rtMidpointMs));
  const sigma = Math.max(0.1, cfg.rtSpreadLog);
  const logRt = Math.log(Math.max(50, responseTimeMs));
  const z = (logRt - mu) / sigma;

  // Reflect the left tail. A blazing-fast correct (z=-2.5) is graded as if
  // it were a z=+2.5 outlier — full guess suspicion — rather than as a peak
  // confident answer at z=-2.5.
  const zEff = isCorrect && z < 0 ? -z : Math.abs(z);

  // Gaussian envelope, floored at minW so we never zero out the gradient.
  const env = Math.exp(-0.5 * zEff * zEff);
  const weight = clamp(env, minW, 1);

  const band: RtWeightResult["band"] =
    z < -1.5 ? "fast" : z > 1.5 ? "slow" : "normal";
  return { weight: Number(weight.toFixed(4)), z: Number(z.toFixed(4)), band };
}

/**
 * Convenience: compose RT weight multiplicatively with an existing source-trust
 * value (the legacy ability-update gate). Centralised so call sites stay tidy.
 */
export function combineGating(
  baseConfidence: number,
  responseTimeMs: number | null | undefined,
  isCorrect: boolean,
  cfg: RtGatingConfig,
): { confidence: number; rt: RtWeightResult } {
  const rt = rtConfidenceWeight(responseTimeMs, isCorrect, cfg);
  const confidence = clamp(baseConfidence * rt.weight, 0.05, 1);
  return { confidence: Number(confidence.toFixed(4)), rt };
}
