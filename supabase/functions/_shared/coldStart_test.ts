// ============================================================================
//  coldStart_test.ts — Stage 8 unit tests
// ----------------------------------------------------------------------------
//  Pure-math coverage for the Empirical-Bayes shrinkage logic. We deliberately
//  do NOT exercise the live Supabase round-trip here; fetchHierarchicalPrior
//  is tested by integration when the refresh job is exercised against a
//  scratch dataset.
// ============================================================================

import { assertEquals, assertAlmostEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  shrinkScalar,
  combinePrior,
  composePriorStack,
  COLD_START_FALLBACK,
} from "./coldStart.ts";
import { ENSEMBLE_DEFAULTS } from "./ensemble.ts";

function row(over: Partial<Record<string, number | string | object | null>> = {}): any {
  return {
    scope: "subject_global",
    theta_mean: 0,
    theta_var: 1,
    se_seed: 1.5,
    mastery_mean: 0.5,
    mastery_var: 0.08,
    ensemble_weights: null,
    n_theta: 0,
    n_mastery: 0,
    n_weights: 0,
    ...over,
  };
}

Deno.test("shrinkScalar: equal n, equal var → midpoint", () => {
  const r = shrinkScalar(2, 1, 10, 0, 1, 10);
  assertAlmostEquals(r.mean, 1, 1e-9);
});

Deno.test("shrinkScalar: child dominates when n_child >> n_parent", () => {
  const r = shrinkScalar(2, 1, 1000, 0, 1, 1);
  // posterior should be very close to 2
  assertEquals(r.mean > 1.99, true);
});

Deno.test("shrinkScalar: parent dominates when child is tiny", () => {
  const r = shrinkScalar(2, 1, 1, 0, 1, 1000);
  assertEquals(r.mean < 0.01, true);
});

Deno.test("shrinkScalar: empty both → returns child mean, zero precision", () => {
  const r = shrinkScalar(0.7, 1, 0, 0.1, 1, 0);
  assertEquals(r.precision, 0);
  assertAlmostEquals(r.mean, 0.7, 1e-9);
});

Deno.test("combinePrior: child null → parent unchanged", () => {
  const p = row({ theta_mean: 0.4, n_theta: 5 });
  assertEquals(combinePrior(null, p), p);
});

Deno.test("combinePrior: variance shrinks (posterior more precise than either)", () => {
  const c = row({ theta_mean: 1, theta_var: 1, n_theta: 10 });
  const p = row({ theta_mean: 0, theta_var: 1, n_theta: 10 });
  const r = combinePrior(c, p)!;
  // posterior precision = 20 → posterior variance = 0.05
  assertAlmostEquals(r.theta_var, 0.05, 1e-9);
});

Deno.test("combinePrior: SE seed never decreases below child's", () => {
  const c = row({ se_seed: 1.2 });
  const p = row({ se_seed: 0.8 });
  const r = combinePrior(c, p)!;
  assertEquals(r.se_seed, 1.2);
});

Deno.test("composePriorStack: empty stack → fallback", () => {
  const r = composePriorStack([]);
  assertEquals(r.isFallback, true);
  assertEquals(r.theta, COLD_START_FALLBACK.theta);
  assertEquals(r.se, COLD_START_FALLBACK.se);
  assertEquals(r.ensembleWeights, ENSEMBLE_DEFAULTS);
});

Deno.test("composePriorStack: single concept_school row → clamped output", () => {
  const r = composePriorStack([
    row({ scope: "concept_school", theta_mean: 5, theta_var: 0.5, n_theta: 50,
          mastery_mean: 1.5, n_mastery: 10, se_seed: 0.1 }),
  ]);
  // theta clamped to [-3, 3]; mastery clamped to [0.05, 0.95]; SE floored.
  assertEquals(r.theta, 3);
  assertEquals(r.mastery, 0.95);
  assertEquals(r.se >= 0.55, true);
  assertEquals(r.isFallback, false);
});

Deno.test("composePriorStack: ensemble weights blend by n_weights", () => {
  const childW = { w_2pl: 1, w_elo: 0, w_akt: 0, w_dash: 0, w_fsrs: 0, w_hawkes: 0, bias: 0 };
  const parentW = { w_2pl: 0, w_elo: 1, w_akt: 0, w_dash: 0, w_fsrs: 0, w_hawkes: 0, bias: 0 };
  const r = composePriorStack([
    row({ scope: "subject_school", ensemble_weights: childW as any, n_weights: 3 }),
    row({ scope: "global",        ensemble_weights: parentW as any, n_weights: 1 }),
  ]);
  // 3:1 blend → w_2pl=0.75, w_elo=0.25
  assertAlmostEquals(r.ensembleWeights.w_2pl, 0.75, 1e-9);
  assertAlmostEquals(r.ensembleWeights.w_elo, 0.25, 1e-9);
});

Deno.test("composePriorStack: hierarchical fold preserves trace order", () => {
  const r = composePriorStack([
    row({ scope: "concept_school", n_theta: 1 }),
    row({ scope: "subject_school", n_theta: 1 }),
    row({ scope: "global",         n_theta: 1 }),
  ]);
  assertEquals(r.trace.map((t) => t.scope),
    ["concept_school", "subject_school", "global"]);
});
