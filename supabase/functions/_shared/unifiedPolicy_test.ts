import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { policyForward, DEFAULT_POLICY_WEIGHTS, policyShadowAgreement } from "./unifiedPolicy.ts";
import { Z_DIM } from "./unifiedState.ts";

Deno.test("policyForward emits valid distributions on every head", () => {
  const z = new Array(Z_DIM).fill(0);
  z[0] = 1.0; // high ability
  const d = policyForward(z, DEFAULT_POLICY_WEIGHTS, () => 0.5);
  for (const head of [d.probabilities.difficulty, d.probabilities.pacing, d.probabilities.strategy, d.probabilities.contentType]) {
    const sum = head.reduce((a, b) => a + b, 0);
    assert(Math.abs(sum - 1) < 1e-6, `sum=${sum}`);
    for (const p of head) assert(p > 0);
  }
  assert(d.jointPropensity > 0 && d.jointPropensity < 1);
});

Deno.test("High ability state biases toward advance/stretch", () => {
  const z = new Array(Z_DIM).fill(0); z[0] = 2; z[31] = 1.5; z[28] = -1;
  const d = policyForward(z, DEFAULT_POLICY_WEIGHTS, () => 0.5);
  const advanceP = d.probabilities.difficulty[2] + d.probabilities.difficulty[3];
  const remediateP = d.probabilities.difficulty[0];
  assert(advanceP > remediateP, `advance ${advanceP} <= remediate ${remediateP}`);
});

Deno.test("Shadow agreement is 1 when actions match, decreases with distance", () => {
  assertEquals(policyShadowAgreement(
    { difficulty: "advance", pacing: "steady", strategy: "scaffolded", contentType: "drill" },
    "advance"
  ), 1);
  const dist = policyShadowAgreement(
    { difficulty: "remediate", pacing: "steady", strategy: "scaffolded", contentType: "drill" },
    "stretch"
  );
  assert(dist < 0);
});
