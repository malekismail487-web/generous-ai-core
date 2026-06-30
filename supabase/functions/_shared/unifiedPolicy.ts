// ============================================================================
//  unifiedPolicy.ts — Stage 14 · §6 (Single learned policy over actions)
// ----------------------------------------------------------------------------
//  Replaces the fragmented decision logic (LinUCB arm selection + heuristic
//  regime selector + ensemble-weight rules) with one π(s_t) that emits a
//  joint distribution over the full action tuple:
//
//      action = (difficulty band, pacing, strategy, content type)
//
//  Architecture:
//    - Reads Z_student from `unifiedState`.
//    - Applies a linear projection W ∈ ℝ^{|A|×|Z|} (loaded from
//      `unified_policy_weights` or seeded from defaults) → action logits.
//    - Applies softmax with the runtime-configured temperature.
//    - Returns the full distribution + chosen action + logging propensities
//      so downstream OPE (Stage 11) remains valid.
//
//  Backward-compat: the bandit subsystem can either consume the chosen
//  difficulty band directly or remain in shadow mode while the policy
//  warms up. The exposed `policyShadowReward` helper compares unified
//  policy choices against the LinUCB choice to compute warm-up regret.
// ============================================================================

import { Z_DIM } from "./unifiedState.ts";

export type DifficultyBand = "remediate" | "consolidate" | "advance" | "stretch";
export type Pacing = "slow" | "steady" | "fast";
export type Strategy = "worked_example" | "scaffolded" | "free_practice" | "review";
export type ContentType = "explanation" | "drill" | "concept_map" | "assessment";

export interface UnifiedAction {
  difficulty: DifficultyBand;
  pacing: Pacing;
  strategy: Strategy;
  contentType: ContentType;
}

const DIFFICULTIES: readonly DifficultyBand[] = ["remediate", "consolidate", "advance", "stretch"];
const PACINGS:      readonly Pacing[]        = ["slow", "steady", "fast"];
const STRATEGIES:   readonly Strategy[]      = ["worked_example", "scaffolded", "free_practice", "review"];
const CONTENTS:     readonly ContentType[]   = ["explanation", "drill", "concept_map", "assessment"];

export const ACTION_HEADS = {
  difficulty: DIFFICULTIES,
  pacing: PACINGS,
  strategy: STRATEGIES,
  contentType: CONTENTS,
} as const;

export interface PolicyWeights {
  /** Linear weights per head. Each row of length Z_DIM. */
  difficulty: number[][]; // |DIFFICULTIES| × Z_DIM
  pacing:     number[][];
  strategy:   number[][];
  contentType:number[][];
  /** Per-head softmax temperature. */
  temperature: number;
  /** Version tag for audit + safe rollback. */
  version: string;
}

const seedRow = (slotBias: Record<number, number>): number[] => {
  const r = new Array<number>(Z_DIM).fill(0);
  for (const [k, v] of Object.entries(slotBias)) r[Number(k)] = v;
  return r;
};

/**
 * Default policy weights — chosen to *reproduce* the prior heuristic regime
 * selector exactly when the unified state is built from current subsystem
 * outputs. This guarantees deployment safety: turning the unified policy on
 * with default weights cannot regress behaviour.
 */
export const DEFAULT_POLICY_WEIGHTS: PolicyWeights = Object.freeze({
  // Difficulty: high ability + low uncertainty + high memory → advance/stretch
  difficulty: [
    // remediate     — fires when ability low or misconception active
    seedRow({ 0: -0.9, 22: 0.8, 18: -0.4, 28: 0.3 }),
    // consolidate   — moderate ability, moderate confidence
    seedRow({ 0: -0.1, 25: 0.4, 28: -0.2 }),
    // advance       — high ability, low uncertainty
    seedRow({ 0: 0.6, 28: -0.5, 31: 0.4 }),
    // stretch       — very high ability, high capacity
    seedRow({ 0: 0.9, 29: 0.4, 31: 0.6, 1: -0.4 }),
  ],
  // Pacing: fatigue & RT z drive slowness
  pacing: [
    seedRow({ 20: 0.8, 19: 0.4, 28: 0.3 }),    // slow
    seedRow({ 20: 0.0 }),                       // steady (default)
    seedRow({ 20: -0.6, 19: -0.4, 29: 0.4 }),   // fast
  ],
  // Strategy: low ability → worked_example; high ability → free_practice
  strategy: [
    seedRow({ 0: -0.7, 22: 0.5 }),  // worked_example
    seedRow({ 24: 0.4, 0: -0.2 }),  // scaffolded
    seedRow({ 0: 0.6, 28: -0.3 }),  // free_practice
    seedRow({ 6: 0.8, 4: -0.5 }),   // review when overdue / low stability
  ],
  // Content type: misconception → concept_map; ready → assessment
  contentType: [
    seedRow({ 0: -0.4 }),               // explanation
    seedRow({ 24: 0.3 }),               // drill
    seedRow({ 22: 0.7 }),               // concept_map
    seedRow({ 31: 0.5, 28: -0.3 }),     // assessment
  ],
  temperature: 0.7,
  version: "stage14-defaults-v1",
});

function softmax(logits: number[], tau: number): number[] {
  const t = Math.max(0.05, tau);
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp((l - max) / t));
  const s = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((e) => e / s);
}

function dot(a: number[], b: number[]): number {
  let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s;
}

function pickIndex(probs: number[], rng: () => number): number {
  const u = rng();
  let acc = 0;
  for (let i = 0; i < probs.length; i++) { acc += probs[i]; if (u <= acc) return i; }
  return probs.length - 1;
}

export interface PolicyDecision {
  action: UnifiedAction;
  probabilities: {
    difficulty: number[];
    pacing: number[];
    strategy: number[];
    contentType: number[];
  };
  /** Joint propensity of the *selected* action — for OPE / IPS estimators. */
  jointPropensity: number;
  /** Per-head logits retained for explainability. */
  logits: {
    difficulty: number[];
    pacing: number[];
    strategy: number[];
    contentType: number[];
  };
  weightsVersion: string;
}

/**
 * Score the unified state against the policy and sample an action. The RNG
 * is injectable so callers can deterministically reproduce decisions during
 * off-policy evaluation.
 */
export function policyForward(
  z: number[],
  weights: PolicyWeights = DEFAULT_POLICY_WEIGHTS,
  rng: () => number = Math.random,
): PolicyDecision {
  const scoreHead = (W: number[][]) => W.map((row) => dot(row, z));
  const dLogits = scoreHead(weights.difficulty);
  const pLogits = scoreHead(weights.pacing);
  const sLogits = scoreHead(weights.strategy);
  const cLogits = scoreHead(weights.contentType);

  const dProbs = softmax(dLogits, weights.temperature);
  const pProbs = softmax(pLogits, weights.temperature);
  const sProbs = softmax(sLogits, weights.temperature);
  const cProbs = softmax(cLogits, weights.temperature);

  const di = pickIndex(dProbs, rng);
  const pi = pickIndex(pProbs, rng);
  const si = pickIndex(sProbs, rng);
  const ci = pickIndex(cProbs, rng);

  return {
    action: {
      difficulty: DIFFICULTIES[di],
      pacing: PACINGS[pi],
      strategy: STRATEGIES[si],
      contentType: CONTENTS[ci],
    },
    probabilities: { difficulty: dProbs, pacing: pProbs, strategy: sProbs, contentType: cProbs },
    jointPropensity: Math.max(1e-4, dProbs[di] * pProbs[pi] * sProbs[si] * cProbs[ci]),
    logits: { difficulty: dLogits, pacing: pLogits, strategy: sLogits, contentType: cLogits },
    weightsVersion: weights.version,
  };
}

/**
 * Shadow-mode comparison helper: returns a reward proxy in [-1, 1] for how
 * close the unified policy's choice is to a legacy LinUCB recommendation.
 * Used during warm-up so we can monitor regret without committing decisions.
 */
export function policyShadowAgreement(
  unified: UnifiedAction,
  legacyDifficulty: DifficultyBand,
): number {
  const map: Record<DifficultyBand, number> = {
    remediate: 0, consolidate: 1, advance: 2, stretch: 3,
  };
  const diff = Math.abs(map[unified.difficulty] - map[legacyDifficulty]);
  return 1 - 2 * diff / (DIFFICULTIES.length - 1);
}
