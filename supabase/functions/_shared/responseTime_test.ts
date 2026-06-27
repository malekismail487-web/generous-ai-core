// Tests for Stage 12 §2 — response-time confidence weighting.
import { assert, assertAlmostEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { rtConfidenceWeight, combineGating } from "./responseTime.ts";

const cfg = { rtMidpointMs: 18_000, rtSpreadLog: 0.9 };

Deno.test("rt weight is 1 when responseTime is missing", () => {
  const r = rtConfidenceWeight(null, true, cfg);
  assertAlmostEquals(r.weight, 1, 1e-9);
  assert(r.band === "unknown");
});

Deno.test("rt weight peaks near the median for correct answers", () => {
  const med = rtConfidenceWeight(cfg.rtMidpointMs, true, cfg);
  const slow = rtConfidenceWeight(cfg.rtMidpointMs * 4, true, cfg);
  assert(med.weight > slow.weight, "median should outweigh slow");
});

Deno.test("instant-correct collapses to guess-suspicion weight", () => {
  const instant = rtConfidenceWeight(400, true, cfg);
  const normal  = rtConfidenceWeight(cfg.rtMidpointMs, true, cfg);
  assert(instant.weight < normal.weight, "fast correct should be down-weighted");
  assert(instant.weight >= 0.35, "weight must not fall below the floor");
});

Deno.test("monotonicity of weight w.r.t. RT for incorrect answers (around midpoint)", () => {
  const fast   = rtConfidenceWeight(6_000,  false, cfg).weight;
  const median = rtConfidenceWeight(18_000, false, cfg).weight;
  const slow   = rtConfidenceWeight(60_000, false, cfg).weight;
  // The Gaussian envelope on logRT peaks at the median.
  assert(median >= fast - 1e-6);
  assert(median >= slow - 1e-6);
});

Deno.test("combineGating bounds composite confidence to [0.05, 1]", () => {
  const r = combineGating(0.9, 18_000, true, cfg);
  assert(r.confidence > 0.05 && r.confidence <= 1.0);
});
