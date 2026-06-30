import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  newMisconceptionState, updateMisconception, rankActiveMisconceptions,
  aggregateMisconceptionActivation, MISCONCEPTION_TAXONOMY,
} from "./misconceptionEmbedding.ts";

Deno.test("Bayesian update converges toward truth with repeated evidence", () => {
  let m = newMisconceptionState("sign_flip");
  for (let i = 0; i < 30; i++) m = updateMisconception(m, { match: 1, weight: 1 }, 0);
  assert(m.posterior > 0.95, `posterior=${m.posterior}`);
});

Deno.test("Decay erodes inactive misconceptions", () => {
  let m = newMisconceptionState("step_skipping");
  for (let i = 0; i < 10; i++) m = updateMisconception(m, { match: 1 }, 0);
  const before = m.activation;
  for (let i = 0; i < 20; i++) m = updateMisconception(m, { match: 0 }, 0.2);
  assert(m.activation < before);
  assert(m.posterior < 0.5);
});

Deno.test("Ranking and aggregation behave correctly", () => {
  const states = MISCONCEPTION_TAXONOMY.map((id) => newMisconceptionState(id));
  let s = states[0];
  for (let i = 0; i < 5; i++) s = updateMisconception(s, { match: 1 }, 0);
  states[0] = s;
  const ranked = rankActiveMisconceptions(states, 0.4);
  assertEquals(ranked[0]?.id, MISCONCEPTION_TAXONOMY[0]);
  const agg = aggregateMisconceptionActivation(states);
  assert(agg >= 0 && agg <= 1);
});
