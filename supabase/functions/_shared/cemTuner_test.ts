// Tests for cemTuner.ts — Stage 11
import { assert, assertAlmostEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type CemParamSpec,
  normaliseEnsembleWeights,
  runCem,
} from "./cemTuner.ts";

Deno.test("CEM recovers known optimum of a 2-D quadratic", async () => {
  const specs: CemParamSpec[] = [
    { name: "x", lo: -5, hi: 5, mu0: 0, sigma0: 2 },
    { name: "y", lo: -5, hi: 5, mu0: 0, sigma0: 2 },
  ];
  // Maximum at (2, -1)
  const objective = (p: Record<string, number>) =>
    -((p.x - 2) ** 2 + (p.y + 1) ** 2);
  const res = await runCem(specs, objective, {
    population: 40, elites: 10, generations: 8, seed: 13,
  });
  assertAlmostEquals(res.bestParams.x, 2, 0.4);
  assertAlmostEquals(res.bestParams.y, -1, 0.4);
  assert(res.bestValue > -0.3);
});

Deno.test("CEM trace shrinks sigma over generations", async () => {
  const specs: CemParamSpec[] = [{ name: "x", lo: -3, hi: 3, mu0: 0, sigma0: 1 }];
  const obj = (p: Record<string, number>) => -((p.x - 1) ** 2);
  const res = await runCem(specs, obj, { population: 30, elites: 6, generations: 5, seed: 42 });
  const first = res.trace[0].sigma.x;
  const last = res.trace[res.trace.length - 1].sigma.x;
  assert(last < first);
});

Deno.test("CEM evaluations equals population × generations", async () => {
  const specs: CemParamSpec[] = [{ name: "x", lo: 0, hi: 1, mu0: 0.5, sigma0: 0.2 }];
  const res = await runCem(specs, () => 1, {
    population: 10, elites: 3, generations: 4, seed: 1,
  });
  assert(res.evaluations === 40);
});

Deno.test("CEM respects bounds (clipping)", async () => {
  const specs: CemParamSpec[] = [{ name: "x", lo: 0, hi: 1, mu0: 5, sigma0: 5 }];
  const obj = (p: Record<string, number>) => p.x; // monotone — maximum at upper bound
  const res = await runCem(specs, obj, { population: 20, elites: 5, generations: 3, seed: 9 });
  assert(res.bestParams.x <= 1.0 + 1e-9);
  assert(res.bestParams.x >= 0.95);
});

Deno.test("normaliseEnsembleWeights produces a valid simplex", () => {
  const p = {
    ensemble_w_2pl: 0.2, ensemble_w_elo: 0.4, ensemble_w_akt: 0.1,
    ensemble_w_dash: 0.2, ensemble_w_fsrs: 0.1,
  } as Record<string, number>;
  normaliseEnsembleWeights(p);
  const s =
    p.ensemble_w_2pl + p.ensemble_w_elo + p.ensemble_w_akt +
    p.ensemble_w_dash + p.ensemble_w_fsrs;
  assertAlmostEquals(s, 1, 1e-9);
});

Deno.test("normaliseEnsembleWeights handles all-zero defensively", () => {
  const p = {
    ensemble_w_2pl: 0, ensemble_w_elo: 0, ensemble_w_akt: 0,
    ensemble_w_dash: 0, ensemble_w_fsrs: 0,
  } as Record<string, number>;
  normaliseEnsembleWeights(p);
  assertAlmostEquals(p.ensemble_w_2pl, 0.2, 1e-9);
});
