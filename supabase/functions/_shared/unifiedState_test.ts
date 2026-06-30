import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildUnifiedState, cosineSimilarity, Z_DIM, Z_SLOT_NAMES } from "./unifiedState.ts";

Deno.test("buildUnifiedState produces fixed-dim, bounded vector", () => {
  const z = buildUnifiedState({
    theta: 1.2, thetaSe: 0.4,
    fsrsMeanStability: 12, fsrsMeanRetrievability: 0.8, fsrsOverdueRatio: 0.1,
    aktContextResidual: 0.3, aktAttentionMass: 5, aktMemoryResidual: 0.2, aktMemoryMass: 4,
    hawkesExcitationMean: 0.6, hawkesExcitationVariance: 0.04,
    ensembleP: 0.7, ensembleVariance: 0.02,
    recentAccuracy: 0.78, recentResponseTimeZ: -0.2, fatigueIndex: 0.3,
    misconceptionActivation: 0.1, temporalResidual: 0.05,
  });
  assertEquals(z.length, Z_DIM);
  assertEquals(Z_SLOT_NAMES.length, Z_DIM);
  for (const v of z) {
    assert(Number.isFinite(v));
    assert(v >= -3 && v <= 3, `out of bounds: ${v}`);
  }
});

Deno.test("buildUnifiedState handles NaN / Infinity safely", () => {
  const z = buildUnifiedState({
    theta: NaN, thetaSe: Infinity,
    fsrsMeanStability: -Infinity, fsrsMeanRetrievability: NaN, fsrsOverdueRatio: NaN,
    aktContextResidual: NaN, aktAttentionMass: NaN, aktMemoryResidual: NaN, aktMemoryMass: NaN,
    hawkesExcitationMean: NaN, hawkesExcitationVariance: NaN,
    ensembleP: NaN, ensembleVariance: NaN,
    recentAccuracy: NaN, recentResponseTimeZ: NaN, fatigueIndex: NaN,
    misconceptionActivation: NaN, temporalResidual: NaN,
  });
  for (const v of z) assert(Number.isFinite(v));
});

Deno.test("cosineSimilarity is 1 for identical, 0 for orthogonal", () => {
  const a = [1, 2, 3, 0]; const b = [1, 2, 3, 0]; const c = [-2, 1, 0, 0];
  assertEquals(cosineSimilarity(a, b).toFixed(4), "1.0000");
  assertEquals(cosineSimilarity(a, c).toFixed(4), "0.0000");
});
