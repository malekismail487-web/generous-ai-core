import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { attentionToDecay, retrievabilityToAttention, couplingDelta } from "./memorySequenceCoupling.ts";

Deno.test("attentionToDecay is monotone in attention mass", () => {
  const lo = attentionToDecay(10, 0);
  const mi = attentionToDecay(10, 2);
  const hi = attentionToDecay(10, 50);
  assert(lo < mi && mi < hi, `${lo} < ${mi} < ${hi}`);
  assert(lo >= 7 && hi <= 13);  // bounded gain ±30%
});

Deno.test("retrievabilityToAttention only boosts below floor", () => {
  const above = retrievabilityToAttention(1, 0.9);
  const below = retrievabilityToAttention(1, 0.1);
  assert(above === 1);
  assert(below > 1 && below <= 1.5);
});

Deno.test("couplingDelta produces consistent retention", () => {
  const d = couplingDelta(7, 0.6, 10);
  assert(d.newStability > 7);
  assert(d.coupledRetention > 0 && d.coupledRetention < 1);
});
