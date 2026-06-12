import { assertAlmostEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { blendPredictions, ENSEMBLE_DEFAULTS } from "./ensemble.ts";

Deno.test("ensemble v4: six-signal blend includes FSRS and Hawkes channels", () => {
  const out = blendPredictions(
    { p_2pl: 0.7, p_elo: 0.65, p_akt: 0.75, p_dash: 0.5, p_fsrs: 0.8, p_hawkes: 0.6 },
    ENSEMBLE_DEFAULTS,
  );
  assert(out.weights.w_fsrs !== undefined, "FSRS weight should be present");
  assert(out.weights.w_hawkes !== undefined, "Hawkes weight should be present");
  const wsum = Object.values(out.weights).reduce((s, v) => s + v, 0);
  assertAlmostEquals(wsum, 1.0, 1e-6);
});

Deno.test("ensemble v4: missing optional signals are dropped, not coerced to 0.5", () => {
  // Without FSRS the blend should match the legacy 4-channel result.
  const fourCh = blendPredictions(
    { p_2pl: 0.9, p_elo: 0.9, p_akt: 0.9, p_dash: 0.9 }, ENSEMBLE_DEFAULTS,
  );
  // With FSRS=0.5 it would pull the answer down — verify it does NOT happen
  // when FSRS is simply omitted.
  assert(fourCh.p > 0.85, `4-channel high-confidence blend should stay > 0.85, got ${fourCh.p}`);
});

Deno.test("ensemble v4: a strongly disagreeing FSRS signal moves the blend", () => {
  const without = blendPredictions(
    { p_2pl: 0.9, p_elo: 0.9, p_akt: 0.9, p_dash: 0.9 }, ENSEMBLE_DEFAULTS,
  );
  const withLowFsrs = blendPredictions(
    { p_2pl: 0.9, p_elo: 0.9, p_akt: 0.9, p_dash: 0.9, p_fsrs: 0.1 }, ENSEMBLE_DEFAULTS,
  );
  assert(withLowFsrs.p < without.p, "low FSRS retention must drag blend down");
});
