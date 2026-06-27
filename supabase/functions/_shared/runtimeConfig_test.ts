// Tests for Stage 12 §1 — runtime config snapshot building.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildRuntimeConfig, defaultRuntimeConfig } from "./runtimeConfig.ts";

Deno.test("defaults are returned when params is null", () => {
  const c = buildRuntimeConfig("snap-1", null);
  assertEquals(c.snapshotId, "snap-1");
  assert(c.linucbAlpha > 0);
  assert(c.softmaxTau > 0);
  assert(c.ensembleWeights.w_2pl > 0);
});

Deno.test("out-of-bound params are clamped, not adopted", () => {
  const c = buildRuntimeConfig("snap-2", {
    linucb_alpha: 999, softmax_tau: -1, w_2pl: -5, rt_midpoint_ms: 99,
  });
  assert(c.linucbAlpha <= 5);
  assert(c.softmaxTau >= 0.02);
  assert(c.ensembleWeights.w_2pl >= 0);
  assert(c.rtMidpointMs >= 2_000);
});

Deno.test("snapshot carries the id and a loadedAt timestamp", () => {
  const c = buildRuntimeConfig("snap-3", { linucb_alpha: 1.5 });
  assertEquals(c.snapshotId, "snap-3");
  assert(c.loadedAt > 0);
  assertEquals(c.linucbAlpha, 1.5);
});

Deno.test("defaultRuntimeConfig() exposes the canonical baseline", () => {
  const d = defaultRuntimeConfig();
  assertEquals(d.snapshotId, "defaults");
  assert(d.linucbAlpha > 0 && d.softmaxTau > 0);
});
