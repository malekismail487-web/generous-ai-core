// Tests for Stage 12 §3 — output integrity audit + repair semantics.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  analyseIntegrity, buildRepairPrompt, repairImproved,
  type IntegrityStep,
} from "./outputIntegrity.ts";

const steps: IntegrityStep[] = [
  { kind: "hook", mustVerify: false },
  { kind: "explain", mustVerify: false },
  { kind: "worked_example", mustVerify: true },
  { kind: "check", mustVerify: true },
  { kind: "practice", mustVerify: true },
];

Deno.test("ok report when every step is present with verifications", () => {
  const content = `
    hook: setting the stage
    explain: the core idea
    worked example: here we solve x + 3 = 7 — your turn?
    check: do you see why? Answer below.
    practice: try x + 5 = 10 — your turn
  `;
  const r = analyseIntegrity(content, steps, { minMandatory: 3 });
  assert(r.ok, JSON.stringify(r));
  assertEquals(r.missingSteps.length, 0);
  assertEquals(r.missingVerifications.length, 0);
});

Deno.test("detects missing steps and unmet floor", () => {
  const content = "hook only";
  const r = analyseIntegrity(content, steps, { minMandatory: 3 });
  assert(!r.ok);
  assert(r.unmetFloor);
  assert(r.missingSteps.length >= 4);
});

Deno.test("detects missing verification cues", () => {
  const content = `
    hook: stage
    explain: idea
    worked example: solve it.
    check: ok now move on.
    practice: do this.
  `;
  const r = analyseIntegrity(content, steps, { minMandatory: 3 });
  assert(!r.ok);
  assert(r.missingVerifications.length >= 1);
});

Deno.test("repairImproved compares violation totals", () => {
  const before = { ok: false, missingSteps: ["check"] as any, missingVerifications: [], unmetFloor: true, details: [] };
  const after  = { ok: true,  missingSteps: [] as any,        missingVerifications: [], unmetFloor: false, details: [] };
  assert(repairImproved(before, after));
  assert(!repairImproved(after, before));
});

Deno.test("repair prompt mentions every missing step", () => {
  const r = analyseIntegrity("hook only", steps, { minMandatory: 3 });
  const prompt = buildRepairPrompt("hook only", steps, r);
  for (const m of r.missingSteps) assert(prompt.includes(m));
  assert(prompt.includes("REQUIRED TRAJECTORY"));
});
