import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { smoothStateTransition, validatesPrerequisiteOrder } from "./temporalConsistency.ts";

Deno.test("Smoother clips large jumps and reports residual", () => {
  const prev = new Array(32).fill(0);
  const proposed = new Array(32).fill(0); proposed[0] = 2.5;
  const r = smoothStateTransition(prev, proposed, 0);
  assert(r.clipped);
  assert(Math.abs(r.z[0]) < 1);
  assert(r.residualMagnitude > 0);
});

Deno.test("Forgetting relaxation permits larger negative jumps", () => {
  const prev = new Array(32).fill(0); prev[4] = 1;
  const proposed = new Array(32).fill(0); proposed[4] = -1;
  const tight = smoothStateTransition(prev, proposed, 0);
  const relaxed = smoothStateTransition(prev, proposed, 14);
  assert(Math.abs(relaxed.z[4] - prev[4]) > Math.abs(tight.z[4] - prev[4]));
});

Deno.test("Prerequisite validator enforces ordering slack", () => {
  assert(validatesPrerequisiteOrder(0.8, 0.7));
  assert(validatesPrerequisiteOrder(0.5, 0.6, 0.2));
  assertEquals(validatesPrerequisiteOrder(0.4, 0.9, 0.1), false);
});

Deno.test("Empty prev passes proposed unchanged", () => {
  const r = smoothStateTransition([], [1, 2, 3]);
  assertEquals(r.z, [1, 2, 3]);
  assertEquals(r.clipped, false);
});
