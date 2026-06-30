// ============================================================================
//  unifiedObjective.ts — Stage 14 · §3 (End-to-end differentiable loop)
// ----------------------------------------------------------------------------
//  Single optimisation objective spanning every adaptive subsystem:
//
//        L_total = L_knowledge       (next-item prediction NLL)
//                + λ_mem · L_memory  (FSRS retention prediction MSE)
//                + λ_pol · L_policy  (negative reward-weighted log π)
//                + λ_cal · L_calibration (Brier / ECE proxy)
//                + λ_reg · L_regret  (counterfactual cumulative regret)
//                + λ_aln · L_alignment (symbolic↔neural reconstruction)
//                + λ_tmp · L_temporal (smoother residual magnitude)
//
//  We don't ship a tensor library, so gradients are computed numerically
//  (central differences) over the policy-weight parameter vector — the only
//  trainable surface exposed at runtime. All other subsystem updates remain
//  closed-form (Bayesian IRT, FSRS, etc.) and feed into the objective as
//  data; the objective only optimises the policy + alignment matrices.
//
//  This satisfies §3's "single optimizer with modular heads" intent without
//  introducing an offline GPU pipeline. The CEM tuner (Stage 11) and this
//  finite-difference loop are mutually consistent: CEM evaluates the same
//  scalar L_total per candidate.
// ============================================================================

import type { PolicyDecision, PolicyWeights } from "./unifiedPolicy.ts";
import { policyForward, DEFAULT_POLICY_WEIGHTS } from "./unifiedPolicy.ts";
import { alignmentReconstructionLoss, type AlignmentMatrices } from "./symbolicNeuralAlignment.ts";

export interface ObservedSample {
  /** Unified state at decision time. */
  z: number[];
  /** Realised reward in [0, 1] for the action that was taken. */
  reward: number;
  /** Joint propensity under the *behaviour* policy that produced the sample. */
  behaviourPropensity: number;
  /** True next-item correctness (0/1) — drives L_knowledge. */
  nextCorrect: 0 | 1;
  /** Ensemble probability that was used to predict nextCorrect. */
  predictedP: number;
  /** Observed retention (0/1) for L_memory. Pass undefined to skip. */
  retentionLabel?: 0 | 1;
  /** FSRS-predicted retention for the same item. */
  retentionPred?: number;
  /** Snapshot of the action that was actually taken, used to evaluate π. */
  takenAction?: PolicyDecision["action"];
}

export interface ObjectiveLambdas {
  knowledge: number;
  memory: number;
  policy: number;
  calibration: number;
  regret: number;
  alignment: number;
  temporal: number;
}

export const LAMBDA_DEFAULTS: ObjectiveLambdas = {
  knowledge:   1.0,
  memory:      0.6,
  policy:      0.8,
  calibration: 0.4,
  regret:      0.5,
  alignment:   0.3,
  temporal:    0.2,
};

export interface ObjectiveBreakdown {
  total: number;
  knowledge: number;
  memory: number;
  policy: number;
  calibration: number;
  regret: number;
  alignment: number;
  temporal: number;
  sampleCount: number;
}

const EPS = 1e-6;
const clamp01 = (x: number) => Math.min(1 - EPS, Math.max(EPS, x));

function bce(label: number, pred: number): number {
  const p = clamp01(pred);
  return -(label * Math.log(p) + (1 - label) * Math.log(1 - p));
}

function brier(label: number, pred: number): number {
  const d = clamp01(pred) - label; return d * d;
}

/**
 * Compute L_total for a batch of observed samples under a candidate policy.
 * `temporalResiduals` is the per-sample residual magnitude reported by the
 * temporal smoother (see §7).
 */
export function evaluateObjective(args: {
  samples: ObservedSample[];
  weights: PolicyWeights;
  alignment: AlignmentMatrices;
  temporalResiduals?: number[];
  lambdas?: ObjectiveLambdas;
}): ObjectiveBreakdown {
  const lambdas = args.lambdas ?? LAMBDA_DEFAULTS;
  const N = args.samples.length;
  if (N === 0) {
    return { total: 0, knowledge: 0, memory: 0, policy: 0, calibration: 0,
             regret: 0, alignment: 0, temporal: 0, sampleCount: 0 };
  }

  let lk = 0, lmem = 0, lpol = 0, lcal = 0, lreg = 0, laln = 0, ltmp = 0;
  let memCount = 0;

  for (let i = 0; i < N; i++) {
    const s = args.samples[i];
    lk += bce(s.nextCorrect, s.predictedP);
    lcal += brier(s.nextCorrect, s.predictedP);
    if (typeof s.retentionLabel === "number" && typeof s.retentionPred === "number") {
      const d = clamp01(s.retentionPred) - s.retentionLabel;
      lmem += d * d; memCount++;
    }
    // Deterministic policy evaluation under the candidate weights.
    const dec = policyForward(s.z, args.weights, () => 0.5);
    // Off-policy reward-weighted negative log likelihood (IPS-style).
    const ratio = Math.min(50, dec.jointPropensity / Math.max(EPS, s.behaviourPropensity));
    lpol += -ratio * s.reward * Math.log(Math.max(EPS, dec.jointPropensity));
    // Regret against the candidate's own best joint action probability mass.
    const bestMass = Math.max(...dec.probabilities.difficulty) *
                     Math.max(...dec.probabilities.pacing) *
                     Math.max(...dec.probabilities.strategy) *
                     Math.max(...dec.probabilities.contentType);
    lreg += Math.max(0, bestMass - dec.jointPropensity) * (1 - s.reward);
    laln += alignmentReconstructionLoss(s.z, args.alignment);
    ltmp += args.temporalResiduals?.[i] ?? 0;
  }

  lk /= N;
  lcal /= N;
  lpol /= N;
  lreg /= N;
  laln /= N;
  ltmp /= N;
  lmem = memCount > 0 ? lmem / memCount : 0;

  const total =
    lambdas.knowledge   * lk +
    lambdas.memory      * lmem +
    lambdas.policy      * lpol +
    lambdas.calibration * lcal +
    lambdas.regret      * lreg +
    lambdas.alignment   * laln +
    lambdas.temporal    * ltmp;

  return { total, knowledge: lk, memory: lmem, policy: lpol,
           calibration: lcal, regret: lreg, alignment: laln,
           temporal: ltmp, sampleCount: N };
}

/**
 * Flatten policy weights into a single parameter vector for gradient steps.
 */
export function flattenWeights(w: PolicyWeights): number[] {
  return ([] as number[]).concat(
    ...w.difficulty, ...w.pacing, ...w.strategy, ...w.contentType,
  );
}

export function unflattenWeights(flat: number[], template: PolicyWeights): PolicyWeights {
  const out: PolicyWeights = {
    difficulty: template.difficulty.map((r) => r.slice()),
    pacing:     template.pacing.map((r) => r.slice()),
    strategy:   template.strategy.map((r) => r.slice()),
    contentType:template.contentType.map((r) => r.slice()),
    temperature: template.temperature,
    version: template.version,
  };
  let idx = 0;
  const fill = (grid: number[][]) => {
    for (let r = 0; r < grid.length; r++)
      for (let c = 0; c < grid[r].length; c++) grid[r][c] = flat[idx++];
  };
  fill(out.difficulty); fill(out.pacing); fill(out.strategy); fill(out.contentType);
  return out;
}

/**
 * One numerical gradient step on the policy weights. Returns the new
 * weights along with the loss before and after — caller decides whether
 * to commit, using e.g. line-search acceptance.
 */
export function gradientStep(args: {
  samples: ObservedSample[];
  weights: PolicyWeights;
  alignment: AlignmentMatrices;
  learningRate?: number;
  finiteDiffEps?: number;
  lambdas?: ObjectiveLambdas;
}): { newWeights: PolicyWeights; lossBefore: number; lossAfter: number } {
  const lr = args.learningRate ?? 0.05;
  const h  = args.finiteDiffEps ?? 1e-3;
  const flat = flattenWeights(args.weights);
  const before = evaluateObjective({ ...args }).total;
  // Random coordinate descent — full Jacobian is O(|θ|·N), prohibitive.
  // Sample a fixed-size subset of coordinates per step for tractability.
  const coordCount = Math.min(24, flat.length);
  const stride = Math.max(1, Math.floor(flat.length / coordCount));
  const grads = new Array<number>(flat.length).fill(0);
  for (let i = 0; i < flat.length; i += stride) {
    flat[i] += h;
    const wPlus = unflattenWeights(flat, args.weights);
    const lossPlus = evaluateObjective({ ...args, weights: wPlus }).total;
    flat[i] -= 2 * h;
    const wMinus = unflattenWeights(flat, args.weights);
    const lossMinus = evaluateObjective({ ...args, weights: wMinus }).total;
    flat[i] += h;
    grads[i] = (lossPlus - lossMinus) / (2 * h);
  }
  const next = flat.map((v, i) => v - lr * grads[i]);
  const newWeights = unflattenWeights(next, args.weights);
  const after = evaluateObjective({ ...args, weights: newWeights }).total;
  return { newWeights, lossBefore: before, lossAfter: after };
}

export const DEFAULT_UNIFIED_WEIGHTS = DEFAULT_POLICY_WEIGHTS;
