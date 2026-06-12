// ============================================================================
//  Shared 2PL IRT + Elo math.
// ----------------------------------------------------------------------------
//  This is the single source of truth for:
//    • 2PL probability and Fisher information.
//    • Online Rasch / 2PL ability update with SE shrinkage.
//    • Elo rating update with adaptive K.
//    • Joint (a, b) item-parameter MLE via Newton-Raphson (used nightly by
//      `recalibrate-anchors` once an item has ≥ MIN_RESPONSES_FOR_A_FIT
//      contemporaneous responses).
//
//  All consumers (ability-update, recalibrate-anchors, eventually the KT
//  ensemble in Stage 2) import from here so the math cannot drift.
// ============================================================================

// ── tunables ────────────────────────────────────────────────────────────────
export const SE_INITIAL  = 1.5;
export const SE_FLOOR    = 0.18;
export const SE_LOCK_IN  = 0.40;
export const THETA_CLAMP = 3.0;
export const A_MIN       = 0.30;
export const A_MAX       = 2.50;
export const B_CLAMP     = 3.0;

export const ELO_INITIAL    = 1500;
export const ELO_K_COLD     = 32;     // < ELO_WARM_THRESHOLD responses
export const ELO_K_WARM     = 16;
export const ELO_WARM_THRESHOLD = 20;
export const ELO_SCALE      = 400;    // standard Elo scale

export const MIN_RESPONSES_FOR_A_FIT = 50;
export const EM_MAX_ITERS = 25;
export const EM_TOL = 1e-4;

// ── primitives ──────────────────────────────────────────────────────────────
export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** 2PL probability of a correct response. */
export function p2pl(theta: number, a: number, b: number): number {
  return sigmoid(a * (theta - b));
}

/**
 * Fisher information of a 2PL item at ability θ:
 *     I(θ) = a² · P · (1 − P)
 * Discrimination enters quadratically — high-a items are dramatically more
 * informative when targeted near the student's ability.
 */
export function fisherInfo2pl(theta: number, a: number, b: number): number {
  const p = p2pl(theta, a, b);
  return a * a * p * (1 - p);
}

// ── online 2PL ability update ───────────────────────────────────────────────
export interface AbilityPrior {
  theta: number;
  thetaSe: number;
  gradedCount: number;
}

export interface AbilityStep {
  thetaAfter: number;
  seAfter: number;
  expected: number;
  kEffective: number;
  fisher: number;
}

/**
 * One online 2PL update step.
 *
 * Math:
 *   E[y]   = σ(a(θ − b))
 *   ΔLL/Δθ = a · (y − E[y])             (gradient of the log-likelihood)
 *   I(θ)   = a² · E[y] · (1 − E[y])     (Fisher info, weighted by `quality`)
 *
 *   θ_new  = clip( θ + K · ΔLL/Δθ )
 *   SE_new = clip( 1 / sqrt( 1/SE² + I·quality ) )
 *
 * K is scaled by current SE so a converged student barely moves and a
 * cold-start student moves a lot, then trimmed by `quality` ∈ [0, 1] which
 * folds in source trust, speed sanity, and guess/slip detection.
 */
export function step2pl(
  prior: AbilityPrior,
  a: number,
  b: number,
  isCorrect: boolean,
  quality: number,
  kBase = 0.4,
): AbilityStep {
  const aSafe = clamp(a, A_MIN, A_MAX);
  const expected = p2pl(prior.theta, aSafe, b);
  const actual = isCorrect ? 1 : 0;
  const gradient = aSafe * (actual - expected);
  const expK = kBase * (prior.thetaSe / SE_INITIAL);
  const k = clamp(expK * quality, 0.02, 0.55);
  const thetaAfter = clamp(prior.theta + k * gradient, -THETA_CLAMP, THETA_CLAMP);
  const info = aSafe * aSafe * expected * (1 - expected) * quality;
  const seAfter = clamp(
    1 / Math.sqrt(1 / (prior.thetaSe * prior.thetaSe) + info),
    SE_FLOOR,
    SE_INITIAL,
  );
  return {
    thetaAfter,
    seAfter,
    expected,
    kEffective: k,
    fisher: aSafe * aSafe * expected * (1 - expected),
  };
}

// ── Elo (parallel fast-track) ───────────────────────────────────────────────
export interface EloPair { studentR: number; itemR: number; studentCount: number; itemCount: number; }
export interface EloUpdate { studentR: number; itemR: number; expected: number; k: number; }

/**
 * Standard chess-style Elo with adaptive K. Symmetric: the student's gain
 * equals the item's loss (and vice-versa). K is high for cold items/students
 * so they settle quickly, then drops to a slow drift for stable ones.
 */
export function eloStep(pair: EloPair, isCorrect: boolean): EloUpdate {
  const expected = 1 / (1 + Math.pow(10, (pair.itemR - pair.studentR) / ELO_SCALE));
  const actual = isCorrect ? 1 : 0;
  // K is the MAX of the two cold/warm decisions: if either side is cold,
  // we drift more aggressively. This is what gives Elo its "fast track"
  // property for brand-new items in the bank.
  const sCold = pair.studentCount < ELO_WARM_THRESHOLD;
  const iCold = pair.itemCount < ELO_WARM_THRESHOLD;
  const k = sCold || iCold ? ELO_K_COLD : ELO_K_WARM;
  const delta = k * (actual - expected);
  return {
    studentR: pair.studentR + delta,
    itemR: pair.itemR - delta,
    expected,
    k,
  };
}

// ── joint (a, b) MLE for nightly recalibration ──────────────────────────────
export interface JointFit {
  a: number;
  b: number;
  logLikelihood: number;
  iterations: number;
  converged: boolean;
}

/**
 * Joint MLE of (a, b) for a single item given contemporaneous (θ_i, y_i)
 * pairs. Newton-Raphson on the 2PL log-likelihood:
 *
 *   LL = Σ y_i · log P_i + (1 − y_i) · log(1 − P_i)
 *
 * with gradient and 2×2 Hessian. We start from the current (a, b) so the
 * update is incremental; we clamp to safe ranges and bail on divergence.
 *
 * Returns the prior (a, b) verbatim if fewer than MIN_RESPONSES_FOR_A_FIT
 * samples are supplied — refusing to fit on under-powered evidence is the
 * single most important calibration guardrail.
 */
export function fitItemParams2pl(
  samples: Array<{ theta: number; y: 0 | 1 }>,
  prior: { a: number; b: number },
): JointFit {
  const n = samples.length;
  if (n < MIN_RESPONSES_FOR_A_FIT) {
    return {
      a: clamp(prior.a, A_MIN, A_MAX),
      b: clamp(prior.b, -B_CLAMP, B_CLAMP),
      logLikelihood: logLikelihood2pl(samples, prior.a, prior.b),
      iterations: 0,
      converged: false,
    };
  }

  let a = clamp(prior.a, A_MIN, A_MAX);
  let b = clamp(prior.b, -B_CLAMP, B_CLAMP);
  let prevLL = logLikelihood2pl(samples, a, b);
  let iters = 0;
  let converged = false;

  for (let it = 0; it < EM_MAX_ITERS; it++) {
    iters++;
    // Gradient and Hessian of LL w.r.t. (a, b) for the 2PL model.
    //   p_i  = σ(a(θ_i − b)),  w_i = p_i(1 − p_i),  r_i = y_i − p_i
    //   ∂LL/∂a   =  Σ r_i (θ_i − b)
    //   ∂LL/∂b   = −a · Σ r_i
    //   ∂²LL/∂a² = −Σ w_i (θ_i − b)²
    //   ∂²LL/∂a∂b = Σ ( a · w_i (θ_i − b) − r_i )
    //   ∂²LL/∂b²  = −a² · Σ w_i
    let g_a = 0, g_b = 0;
    let h_aa = 0, h_ab = 0, h_bb = 0;
    for (const s of samples) {
      const diff = s.theta - b;
      const p = sigmoid(a * diff);
      const w = p * (1 - p);
      const r = s.y - p;
      g_a +=  diff * r;
      g_b += -a * r;
      h_aa += -w * diff * diff;
      h_ab +=  a * w * diff - r;
      h_bb += -a * a * w;
    }


    // Solve H · Δ = −g for the Newton step, with a tiny ridge for stability.
    const ridge = 1e-3;
    const A11 = h_aa - ridge, A12 = h_ab, A22 = h_bb - ridge;
    const det = A11 * A22 - A12 * A12;
    if (!Number.isFinite(det) || Math.abs(det) < 1e-9) break;
    const d_a = (-(A22 * g_a) + A12 * g_b) / det;
    const d_b = ( (A12 * g_a) - A11 * g_b) / det;

    // Backtracking line search: never accept a step that lowers the LL.
    let alpha = 1.0;
    let accepted = false;
    for (let bt = 0; bt < 6; bt++) {
      const aNew = clamp(a + alpha * d_a, A_MIN, A_MAX);
      const bNew = clamp(b + alpha * d_b, -B_CLAMP, B_CLAMP);
      const ll = logLikelihood2pl(samples, aNew, bNew);
      if (ll >= prevLL - 1e-9) {
        a = aNew; b = bNew;
        if (Math.abs(ll - prevLL) < EM_TOL * Math.max(1, Math.abs(prevLL))) {
          prevLL = ll;
          converged = true;
          accepted = true;
          break;
        }
        prevLL = ll;
        accepted = true;
        break;
      }
      alpha *= 0.5;
    }
    if (!accepted || converged) break;
  }

  return { a, b, logLikelihood: prevLL, iterations: iters, converged };
}

export function logLikelihood2pl(
  samples: Array<{ theta: number; y: 0 | 1 }>,
  a: number,
  b: number,
): number {
  let ll = 0;
  for (const s of samples) {
    const p = clamp(p2pl(s.theta, a, b), 1e-9, 1 - 1e-9);
    ll += s.y === 1 ? Math.log(p) : Math.log(1 - p);
  }
  return ll;
}
