import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildAlignmentFromSeed, projectToStandards, projectFromStandard,
  alignmentReconstructionLoss,
} from "./symbolicNeuralAlignment.ts";

Deno.test("Alignment forward returns valid softmax over standards", () => {
  const a = buildAlignmentFromSeed([
    { standardId: "MA.6.NS.1", slotBias: { 0: 1, 31: 0.5 } },
    { standardId: "MA.6.NS.2", slotBias: { 4: 1 } },
  ]);
  const z = new Array(32).fill(0); z[0] = 2;
  const out = projectToStandards(z, a);
  const sum = out.reduce((s, x) => s + x.probability, 0);
  assert(Math.abs(sum - 1) < 1e-6);
  assert(out[0].probability > out[1].probability);
});

Deno.test("Inverse projection emits bias vector in Z_DIM", () => {
  const a = buildAlignmentFromSeed([{ standardId: "S1", slotBias: { 0: 1, 5: -1 } }]);
  const bias = projectFromStandard("S1", a, 1);
  assertEquals(bias.length, 32);
  assertEquals(bias[0], 1);
  assertEquals(bias[5], -1);
});

Deno.test("Alignment reconstruction loss is non-negative and finite", () => {
  const a = buildAlignmentFromSeed([
    { standardId: "A", slotBias: { 0: 1 } },
    { standardId: "B", slotBias: { 1: 1 } },
  ]);
  const z = new Array(32).fill(0); z[0] = 0.5; z[1] = -0.5;
  const L = alignmentReconstructionLoss(z, a);
  assert(L >= 0 && Number.isFinite(L));
});

Deno.test("Empty alignment is no-op", () => {
  const a = buildAlignmentFromSeed([]);
  assertEquals(projectToStandards([1, 2, 3], a).length, 0);
  assertEquals(alignmentReconstructionLoss([1, 2, 3], a), 0);
});
