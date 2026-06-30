import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { aktBackboneForward } from "./aktBackbone.ts";

Deno.test("aktBackboneForward returns 8-dim hidden + valid prob", () => {
  const out = aktBackboneForward(
    [
      { cid: "c1", c: 1, ts: 1, a: 1, b: 0 },
      { cid: "c1", c: 0, ts: 2, a: 1, b: 0 },
      { cid: "c2", c: 1, ts: 3, a: 1, b: -0.5 },
    ],
    { conceptId: "c1", a: 1, b: 0, theta: 0.2 },
  );
  assertEquals(out.h.length, 8);
  assert(out.p >= 0 && out.p <= 1);
  assert(Number.isFinite(out.z));
  for (const v of out.h) assert(Number.isFinite(v));
});

Deno.test("backbone determinism across repeat calls", () => {
  const hist = [{ cid: "c1", c: 1 as const, ts: 1, a: 1, b: 0 }];
  const a = aktBackboneForward(hist, { conceptId: "c1", a: 1, b: 0, theta: 0 });
  const b = aktBackboneForward(hist, { conceptId: "c1", a: 1, b: 0, theta: 0 });
  assertEquals(a.p, b.p);
  assertEquals(a.h.join(","), b.h.join(","));
});
