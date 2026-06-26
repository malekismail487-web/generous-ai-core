// Tests for doublyRobust.ts — Stage 11
import { assert, assertAlmostEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  cumulativeRegret,
  type DecisionLogRow,
  epsilonGreedyPolicy,
  evaluateDR,
  evaluateIPS,
  evaluateSNIPS,
  uniformPolicy,
} from "./doublyRobust.ts";

// Synthetic ground truth: 3 arms with known mean rewards 0.2, 0.5, 0.8.
// Behaviour policy = softmax-ish over UCBs, biased toward arm "b".
const ARMS = ["a", "b", "c"];
const TRUE = { a: 0.2, b: 0.5, c: 0.8 };

function makeLog(n: number, seed = 1): DecisionLogRow[] {
  let s = seed;
  const rng = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const log: DecisionLogRow[] = [];
  for (let i = 0; i < n; i++) {
    // behaviour distribution skewed toward "b"
    const dist = { a: 0.2, b: 0.6, c: 0.2 } as Record<string, number>;
    const u = rng();
    const chosen = u < 0.2 ? "a" : u < 0.8 ? "b" : "c";
    const r = rng() < TRUE[chosen as keyof typeof TRUE] ? 1 : 0;
    log.push({
      x: [1, i / n],
      chosenArm: chosen,
      behaviourProb: dist[chosen],
      reward: r,
      behaviourDist: dist,
    });
  }
  return log;
}

Deno.test("IPS recovers ~uniform value on uniform target", () => {
  const log = makeLog(4000, 7);
  const res = evaluateIPS(log, uniformPolicy, ARMS);
  // True value under uniform policy = mean of TRUE = 0.5
  assertAlmostEquals(res.value, 0.5, 0.07);
  assert(res.nUsed === log.length);
});

Deno.test("SNIPS has lower variance than IPS on the same log", () => {
  const log = makeLog(2000, 11);
  const greedyC = epsilonGreedyPolicy((_x, a) => (a === "c" ? 1 : 0), 0.1);
  const ips = evaluateIPS(log, greedyC, ARMS);
  const snips = evaluateSNIPS(log, greedyC, ARMS);
  // Both should estimate ~0.74 (= 0.9·0.8 + 0.1/3·(0.2+0.5+0.8)).
  assertAlmostEquals(snips.value, 0.74, 0.08);
  assertAlmostEquals(ips.value, 0.74, 0.15);
  assert(snips.stderr <= ips.stderr * 1.05); // allow tiny noise
});

Deno.test("DR with correct reward model has very low variance", () => {
  const log = makeLog(2000, 23);
  const greedyC = epsilonGreedyPolicy((_x, a) => (a === "c" ? 1 : 0), 0.1);
  const oracleModel = (_x: number[], a: string) => TRUE[a as keyof typeof TRUE];
  const dr = evaluateDR(log, greedyC, oracleModel, ARMS);
  assertAlmostEquals(dr.value, 0.74, 0.04);
  const snips = evaluateSNIPS(log, greedyC, ARMS);
  assert(dr.stderr < snips.stderr);
});

Deno.test("DR with bad propensities but correct model still ≈ correct", () => {
  const log = makeLog(2000, 31).map((r) => ({ ...r, behaviourProb: 0.5 })); // wrong
  const greedyC = epsilonGreedyPolicy((_x, a) => (a === "c" ? 1 : 0), 0.1);
  const oracleModel = (_x: number[], a: string) => TRUE[a as keyof typeof TRUE];
  const dr = evaluateDR(log, greedyC, oracleModel, ARMS);
  assertAlmostEquals(dr.value, 0.74, 0.08); // doubly-robust property
});

Deno.test("cumulativeRegret is non-negative and zero when always optimal", () => {
  const log: DecisionLogRow[] = [
    { x: [1], chosenArm: "c", behaviourProb: 1, reward: 1 },
    { x: [1], chosenArm: "c", behaviourProb: 1, reward: 1 },
    { x: [1], chosenArm: "c", behaviourProb: 1, reward: 1 },
  ];
  const r = cumulativeRegret(log, () => "single");
  assert(r.cumulative === 0);
});

Deno.test("cumulativeRegret detects suboptimal choices", () => {
  const log: DecisionLogRow[] = [
    { x: [1], chosenArm: "c", behaviourProb: 1, reward: 1 },
    { x: [1], chosenArm: "a", behaviourProb: 1, reward: 0 },
    { x: [1], chosenArm: "a", behaviourProb: 1, reward: 0 },
  ];
  const r = cumulativeRegret(log, () => "single");
  assert(r.cumulative > 0);
});
