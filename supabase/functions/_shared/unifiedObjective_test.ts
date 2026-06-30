import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  evaluateObjective, gradientStep, flattenWeights, unflattenWeights,
  DEFAULT_UNIFIED_WEIGHTS,
} from "./unifiedObjective.ts";
import { buildAlignmentFromSeed } from "./symbolicNeuralAlignment.ts";

const baseSample = (z: number[], reward = 0.7, nextCorrect: 0 | 1 = 1) => ({
  z, reward, behaviourPropensity: 0.05,
  nextCorrect, predictedP: 0.7,
  retentionLabel: 1 as const, retentionPred: 0.8,
});

Deno.test("evaluateObjective returns finite, non-negative components", () => {
  const z = new Array(32).fill(0); z[0] = 0.5;
  const out = evaluateObjective({
    samples: [baseSample(z), baseSample(z, 0.4, 0)],
    weights: DEFAULT_UNIFIED_WEIGHTS,
    alignment: buildAlignmentFromSeed([{ standardId: "S", slotBias: { 0: 1 } }]),
    temporalResiduals: [0.1, 0.2],
  });
  assert(Number.isFinite(out.total));
  assert(out.knowledge >= 0 && out.memory >= 0 && out.calibration >= 0);
  assert(out.sampleCount === 2);
});

Deno.test("Flatten/unflatten round-trips weights exactly", () => {
  const flat = flattenWeights(DEFAULT_UNIFIED_WEIGHTS);
  const w = unflattenWeights(flat, DEFAULT_UNIFIED_WEIGHTS);
  assert(JSON.stringify(w.difficulty) === JSON.stringify(DEFAULT_UNIFIED_WEIGHTS.difficulty));
  assert(JSON.stringify(w.contentType) === JSON.stringify(DEFAULT_UNIFIED_WEIGHTS.contentType));
});

Deno.test("gradientStep decreases or holds the loss on a learnable batch", () => {
  const z1 = new Array(32).fill(0); z1[0] = 1;
  const z2 = new Array(32).fill(0); z2[0] = -1;
  const samples = [baseSample(z1, 0.9, 1), baseSample(z2, 0.2, 0)];
  const r = gradientStep({
    samples, weights: DEFAULT_UNIFIED_WEIGHTS,
    alignment: buildAlignmentFromSeed([]),
    learningRate: 0.01,
  });
  assert(Number.isFinite(r.lossBefore));
  assert(Number.isFinite(r.lossAfter));
  // Allow ≤1% regression to absorb finite-diff noise on a tiny batch.
  assert(r.lossAfter <= r.lossBefore * 1.01,
    `loss should not regress: before=${r.lossBefore} after=${r.lossAfter}`);
});
