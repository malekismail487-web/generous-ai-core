import { assertAlmostEquals, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  newArmState, hydrateArmState, scoreArm, selectArm, updateArm,
  buildBanditContext, BANDIT_CONTEXT_DIM, ARM_IDS, parseArmId,
  LINUCB_DEFAULTS,
} from "./linucb.ts";

Deno.test("linucb: fresh arm — UCB equals α·||x||/√λ, mean = 0", () => {
  const arm = newArmState({ ...LINUCB_DEFAULTS, d: 4, lambda: 1.0 });
  const x = [1, 0.5, -0.3, 0.2];
  const s = scoreArm(arm, x, { ...LINUCB_DEFAULTS, d: 4, alpha: 1.0 });
  assertAlmostEquals(s.mean, 0, 1e-12);
  // With A_inv = (1/λ)I, xᵀA⁻¹x = ||x||² / λ
  const norm2 = x.reduce((a, b) => a + b * b, 0);
  assertAlmostEquals(s.bonus, Math.sqrt(norm2), 1e-10);
});

Deno.test("linucb: rank-1 update — bonus shrinks along the trained direction", () => {
  const cfg = { ...LINUCB_DEFAULTS, d: 3, alpha: 1.0, lambda: 1.0 };
  let arm = newArmState(cfg);
  const x = [1, 0, 0];
  const before = scoreArm(arm, x, cfg);
  arm = updateArm(arm, x, 1, cfg);
  const after = scoreArm(arm, x, cfg);
  if (!(after.bonus < before.bonus)) {
    throw new Error(`expected bonus to shrink: ${before.bonus} → ${after.bonus}`);
  }
  if (!(after.mean > before.mean)) {
    throw new Error(`expected mean to rise: ${before.mean} → ${after.mean}`);
  }
  assertEquals(arm.n, 1);
});

Deno.test("linucb: Sherman–Morrison matches direct inversion (d=2)", () => {
  // Direct: A = I + x xᵀ for x=[1,1] → A = [[2,1],[1,2]] → A⁻¹ = (1/3)[[2,-1],[-1,2]]
  let arm = newArmState({ ...LINUCB_DEFAULTS, d: 2, lambda: 1.0 });
  arm = updateArm(arm, [1, 1], 0, { ...LINUCB_DEFAULTS, d: 2 });
  assertAlmostEquals(arm.A_inv[0],  2 / 3, 1e-10);
  assertAlmostEquals(arm.A_inv[1], -1 / 3, 1e-10);
  assertAlmostEquals(arm.A_inv[2], -1 / 3, 1e-10);
  assertAlmostEquals(arm.A_inv[3],  2 / 3, 1e-10);
});

Deno.test("linucb: reward gets clamped to [-1, 1]", () => {
  const cfg = { ...LINUCB_DEFAULTS, d: 2 };
  let arm = newArmState(cfg);
  arm = updateArm(arm, [1, 0], 99, cfg);    // clamp → 1
  assertAlmostEquals(arm.b[0], 1, 1e-10);
  arm = updateArm(arm, [1, 0], -99, cfg);   // clamp → -1
  // After two updates b[0] = 1 + (-1) = 0
  assertAlmostEquals(arm.b[0], 0, 1e-10);
});

Deno.test("linucb: selectArm prefers higher UCB; tiebreak prefers fewer pulls", () => {
  const cfg = { ...LINUCB_DEFAULTS, d: 2 };
  const arms: Record<string, ReturnType<typeof newArmState>> = {
    "a": updateArm(newArmState(cfg), [1, 0], 1, cfg),  // n=1, has mean signal
    "b": newArmState(cfg),                              // n=0, pure exploration
  };
  // For x=[0,1] arm "a" has no signal — both arms identical mean=0, identical
  // bonus on this orthogonal direction. Tiebreaker → fewer pulls → "b".
  const res = selectArm(arms, [0, 1], cfg);
  assertEquals(res.chosen.armId, "b");
});

Deno.test("linucb: hydrate degenerates malformed rows gracefully", () => {
  const a = hydrateArmState(null);
  assertEquals(a.d, LINUCB_DEFAULTS.d);
  assertEquals(a.n, 0);
  const b = hydrateArmState({ A_inv: [1, 2], b: [0], d: 2 }); // length mismatch
  assertEquals(b.A_inv.length, LINUCB_DEFAULTS.d * LINUCB_DEFAULTS.d);
});

Deno.test("linucb: context vector is well-formed under extreme inputs", () => {
  const x = buildBanditContext({
    theta: 99, mastery: 2, lectureMastery: -1, errorCount: 999,
    fatigue: 5, ensembleP: 1.7, visualPreference: true,
  });
  assertEquals(x.length, BANDIT_CONTEXT_DIM);
  assertEquals(x[0], 1);
  assertEquals(x[1], 1);          // clamped to 1
  assertEquals(x[2], 1);          // clamped
  assertEquals(x[3], 0);          // clamped
  assertEquals(x[4], 1);          // 5/5
  assertEquals(x[5], 1);
  assertEquals(x[6], 1);
  assertEquals(x[7], 1);
});

Deno.test("linucb: 12 canonical arms cover the 4×3 strategy/difficulty grid", () => {
  assertEquals(ARM_IDS.length, 12);
  const parsed = ARM_IDS.map(parseArmId);
  if (parsed.some((p) => p === null)) throw new Error("unparseable arm id");
});

Deno.test("linucb: convergence — after many on-policy rewards, mean tracks reward", () => {
  const cfg = { ...LINUCB_DEFAULTS, d: 2, lambda: 1.0, alpha: 0 };
  let arm = newArmState(cfg);
  for (let i = 0; i < 200; i++) arm = updateArm(arm, [1, 0], 1, cfg);
  const s = scoreArm(arm, [1, 0], cfg);
  // θ should converge toward 1 along [1,0]; with λ=1 and n=200 the bias is 1/(201) ≈ 0.005
  if (Math.abs(s.mean - 200 / 201) > 1e-6) {
    throw new Error(`unexpected mean: ${s.mean}`);
  }
});
