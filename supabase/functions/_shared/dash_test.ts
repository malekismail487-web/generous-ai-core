import { assertEquals, assertAlmostEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  bucketInteractions,
  dashPredict,
  dashPredictFromHistory,
  DASH_DEFAULTS,
  DASH_WINDOWS_MS,
} from "./dash.ts";

Deno.test("DASH: empty history degrades to plain 2PL on logit scale", () => {
  const p = dashPredict(1.0, 0.0, [0,0,0,0], [0,0,0,0]);
  // logit = α·θ − β·b = 1.0 ⇒ σ(1.0) ≈ 0.731
  assertAlmostEquals(p, 0.731, 0.005);
});

Deno.test("DASH: successes raise P, failures lower it", () => {
  const now = Date.now();
  const cid = "c1";
  const recent = (c: 0|1, ageMin = 1) => ({ ts: now - ageMin*60_000, c, cid });
  const allRight = [recent(1), recent(1), recent(1), recent(1)];
  const allWrong = [recent(0), recent(0), recent(0), recent(0)];
  const pR = dashPredictFromHistory(allRight, now, 0, 0, cid);
  const pW = dashPredictFromHistory(allWrong, now, 0, 0, cid);
  if (!(pR > 0.55)) throw new Error(`expected pR>0.55, got ${pR}`);
  if (!(pW < 0.45)) throw new Error(`expected pW<0.45, got ${pW}`);
});

Deno.test("DASH: conceptId filter ignores unrelated history", () => {
  const now = Date.now();
  const hist = [
    { ts: now - 60_000, c: 1 as const, cid: "other" },
    { ts: now - 120_000, c: 1 as const, cid: "other" },
  ];
  const pNoFilter = dashPredictFromHistory(hist, now, 0, 0);
  const pFilter   = dashPredictFromHistory(hist, now, 0, 0, "c1");
  if (!(pNoFilter > pFilter)) throw new Error("filter must drop unrelated successes");
  assertAlmostEquals(pFilter, 0.5, 0.005);
});

Deno.test("DASH: bucketing places each event in exactly one window", () => {
  const now = Date.now();
  const hist = [
    { ts: now - 2*60_000, c: 1 as const, cid: "c" },              // 2 min → window 0
    { ts: now - 30*60_000, c: 0 as const, cid: "c" },             // 30 min → window 1
    { ts: now - 12*60*60_000, c: 1 as const, cid: "c" },          // 12 h → window 2
    { ts: now - 3*24*60*60_000, c: 0 as const, cid: "c" },        // 3 d → window 3
  ];
  const { successes, failures } = bucketInteractions(hist, now, "c");
  if (!(successes[0] > 0)) throw new Error("window 0 success missing");
  if (!(failures[1] > 0)) throw new Error("window 1 failure missing");
  if (!(successes[2] > 0)) throw new Error("window 2 success missing");
  if (!(failures[3] > 0)) throw new Error("window 3 failure missing");
});

Deno.test("DASH: clamps prevent NaN / out-of-range", () => {
  const p = dashPredict(1000, -1000, [1e9,1e9,1e9,1e9], [0,0,0,0]);
  if (!(p > 0 && p < 1)) throw new Error("must clamp to (0,1)");
});
