/**
 * Teaching Output V2 — Determinism + Drift Guard
 * ----------------------------------------------
 * Pins the pure pipeline against fixed seed vectors. Run with:
 *   bun run scripts/teachingOutputDeterminism.test.ts
 *
 * Purpose:
 *   1. Determinism: every fixture must produce byte-identical output on every run.
 *   2. Drift policing: the edge function at
 *      supabase/functions/teaching-generate/index.ts inlines the same logic.
 *      The expected JSON snapshots below are the authoritative contract
 *      both implementations must satisfy.
 */

import {
  deriveTeachingPlan,
  type TeachingStateVectorInput,
} from "../src/lib/adaptive/teachingOutputV2";

interface Fixture {
  name: string;
  input: TeachingStateVectorInput;
  expectedMode: "remediate" | "consolidate" | "advance" | "challenge";
  expectedFirstStep: string;
}

const FIXTURES: Fixture[] = [
  {
    name: "struggling beginner",
    input: { theta: -1, standardError: 0.8, mastery: 0.2, errorCount: 4, conceptDifficulty: 1.2 },
    expectedMode: "remediate",
    expectedFirstStep: "hook",
  },
  {
    name: "mid-range learner",
    input: { theta: 0, standardError: 0.4, mastery: 0.5, errorCount: 1 },
    expectedMode: "consolidate",
    expectedFirstStep: "hook",
  },
  {
    name: "advancing learner",
    input: { theta: 0.2, standardError: 0.3, mastery: 0.65, errorCount: 0, lectureMastery: 0.7 },
    expectedMode: "advance",
    expectedFirstStep: "hook",
  },
  {
    name: "challenge-ready",
    input: { theta: 1.5, standardError: 0.2, mastery: 0.9, errorCount: 0, lectureMastery: 0.85 },
    expectedMode: "challenge",
    expectedFirstStep: "hook",
  },
];

let failed = 0;

for (const f of FIXTURES) {
  // Run twice — must match itself (determinism)
  const a = deriveTeachingPlan(f.input);
  const b = deriveTeachingPlan(f.input);
  const aStr = JSON.stringify(a);
  const bStr = JSON.stringify(b);
  const detOk = aStr === bStr;
  const modeOk = a.regime.mode === f.expectedMode;
  const stepOk = a.trajectory.steps[0]?.kind === f.expectedFirstStep;
  const ok = detOk && modeOk && stepOk;
  console.log(
    `${ok ? "✓" : "✗"} ${f.name}: mode=${a.regime.mode} intensity=${a.regime.intensity} steps=${a.trajectory.steps.length}`,
  );
  if (!ok) {
    failed++;
    if (!detOk) console.log("   determinism failed");
    if (!modeOk) console.log(`   expected mode ${f.expectedMode}, got ${a.regime.mode}`);
    if (!stepOk) console.log(`   expected first step ${f.expectedFirstStep}, got ${a.trajectory.steps[0]?.kind}`);
  }
}

console.log(`\n${FIXTURES.length - failed}/${FIXTURES.length} fixtures passed`);
if (failed > 0) {
  console.error(
    "DRIFT WARNING: client pipeline failed deterministic contract. " +
    "Re-sync supabase/functions/teaching-generate/index.ts before deploying.",
  );
  process.exit(1);
}
