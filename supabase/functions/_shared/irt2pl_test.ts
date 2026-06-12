// Stage 1 — shared 2PL IRT + Elo unit tests.
// These tests assert mathematical invariants of the engine, not table values,
// so they run in milliseconds without touching the database.

import { assert, assertEquals, assertAlmostEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  p2pl, fisherInfo2pl, step2pl, eloStep, fitItemParams2pl,
  A_MIN, A_MAX, SE_INITIAL, ELO_INITIAL,
} from "./irt2pl.ts";

Deno.test("2PL: P(correct) is 0.5 when θ = b regardless of a", () => {
  for (const a of [0.5, 1.0, 1.7, 2.3]) {
    assertAlmostEquals(p2pl(0, a, 0), 0.5, 1e-9);
    assertAlmostEquals(p2pl(1.2, a, 1.2), 0.5, 1e-9);
  }
});

Deno.test("2PL: Fisher info peaks at θ = b and scales with a²", () => {
  const atPeak = fisherInfo2pl(0, 1, 0);
  const offPeak = fisherInfo2pl(2, 1, 0);
  assert(atPeak > offPeak, "Fisher info must peak at θ = b");

  // Doubling a should approximately quadruple peak info.
  const peakA1 = fisherInfo2pl(0, 1, 0);
  const peakA2 = fisherInfo2pl(0, 2, 0);
  assertAlmostEquals(peakA2 / peakA1, 4.0, 1e-9);
});

Deno.test("2PL step: correct answer raises θ, wrong lowers it", () => {
  const prior = { theta: 0, thetaSe: 0.8, gradedCount: 5 };
  const up = step2pl(prior, 1.0, 0, true, 1.0);
  const down = step2pl(prior, 1.0, 0, false, 1.0);
  assert(up.thetaAfter > prior.theta);
  assert(down.thetaAfter < prior.theta);
});

Deno.test("2PL step: high-`a` items move θ more for the same surprise", () => {
  const prior = { theta: 0, thetaSe: 0.8, gradedCount: 5 };
  const lowA = step2pl(prior, 0.5, 0, true, 1.0);
  const highA = step2pl(prior, 2.0, 0, true, 1.0);
  assert(highA.thetaAfter - prior.theta > lowA.thetaAfter - prior.theta);
});

Deno.test("2PL step: SE monotonically decreases as graded_count rises", () => {
  let prior = { theta: 0, thetaSe: SE_INITIAL, gradedCount: 0 };
  let previousSe = prior.thetaSe;
  for (let i = 0; i < 20; i++) {
    const step = step2pl(prior, 1.2, prior.theta, i % 2 === 0, 1.0);
    assert(step.seAfter <= previousSe + 1e-9);
    previousSe = step.seAfter;
    prior = { theta: step.thetaAfter, thetaSe: step.seAfter, gradedCount: prior.gradedCount + 1 };
  }
});

Deno.test("Elo: gain equals item loss (zero-sum)", () => {
  const pair = { studentR: 1500, itemR: 1500, studentCount: 50, itemCount: 50 };
  const win = eloStep(pair, true);
  assertAlmostEquals(win.studentR - pair.studentR, pair.itemR - win.itemR, 1e-9);
});

Deno.test("Elo: cold pairs use K=32, warm pairs use K=16", () => {
  const cold = eloStep({ studentR: 1500, itemR: 1500, studentCount: 0, itemCount: 0 }, true);
  const warm = eloStep({ studentR: 1500, itemR: 1500, studentCount: 100, itemCount: 100 }, true);
  assertEquals(cold.k, 32);
  assertEquals(warm.k, 16);
});

Deno.test("Joint MLE: returns prior verbatim when sample too small", () => {
  const fit = fitItemParams2pl(
    [{ theta: 0.2, y: 1 }, { theta: -0.1, y: 0 }],
    { a: 1.0, b: 0.0 },
  );
  assertEquals(fit.a, 1.0);
  assertEquals(fit.b, 0.0);
  assertEquals(fit.iterations, 0);
});

Deno.test("Joint MLE: recovers a≈1.2, b≈0.4 on clean simulated data", () => {
  // Simulate 400 responses from a known 2PL item.
  const aTrue = 1.2, bTrue = 0.4;
  const samples: Array<{ theta: number; y: 0 | 1 }> = [];
  // Deterministic PRNG so the test never flakes.
  let seed = 42;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed / 0x7fffffff);
  };
  for (let i = 0; i < 400; i++) {
    const theta = -2 + 4 * rand();
    const p = p2pl(theta, aTrue, bTrue);
    samples.push({ theta, y: rand() < p ? 1 : 0 });
  }
  const fit = fitItemParams2pl(samples, { a: 1.0, b: 0.0 });
  // Generous tolerance: 400 samples + simulated noise + Newton-Raphson clamps.
  // The point is that the MLE is in the right ballpark, not pixel-perfect.
  assert(Math.abs(fit.a - aTrue) < 0.4, `expected a≈${aTrue}, got ${fit.a}`);
  assert(Math.abs(fit.b - bTrue) < 0.4, `expected b≈${bTrue}, got ${fit.b}`);
});

Deno.test("Joint MLE: clamps a to [A_MIN, A_MAX]", () => {
  // Pathological data designed to push a → ∞.
  const samples: Array<{ theta: number; y: 0 | 1 }> = [];
  for (let i = 0; i < 60; i++) samples.push({ theta: i % 2 === 0 ? -1 : 1, y: (i % 2 === 0 ? 0 : 1) as 0 | 1 });
  const fit = fitItemParams2pl(samples, { a: 1.0, b: 0.0 });
  assert(fit.a >= A_MIN && fit.a <= A_MAX);
});

Deno.test("Constants are exported correctly", () => {
  assertEquals(ELO_INITIAL, 1500);
  assertEquals(SE_INITIAL, 1.5);
});
