/**
 * ORCHESTRA O7 — Perception Core Test Harness
 * ------------------------------------------
 * Runnable with:  npx tsx scripts/orchestraO7perception.test.ts
 */
import {
  PERCEPTION_THRESHOLDS,
  allPassed,
  judgeAll,
  judgeAudio,
  judgeMotion,
  judgePalette,
  judgePhysics,
  judgePlaytest,
  type PerceptionReport,
} from "../src/lib/codelab/engine/perception";

let passed = 0, failed = 0;
const failures: string[] = [];
function assert(c: unknown, l: string) { if (c) passed++; else { failed++; failures.push(l); console.error(`  \u2717 ${l}`); } }
function section(n: string) { console.log(`\n\u2014 ${n}`); }

const GOOD: PerceptionReport = {
  motion: { meanFrameDelta: 2.4, samples: 12 },
  palette: { histogram: [100, 400, 900, 1200, 800, 400, 150, 30], meanLuminance: 96 },
  edges: { edgeRatio: 0.11 },
  physics: { replayHashA: "a1b2", replayHashB: "a1b2", energyDrift: 0.004, tunnelRate: 0 },
  audio: { rms: 0.12, peak: 0.71, spectralCentroidHz: 1400, durationSec: 2 },
  playtest: { injectedEvents: 240, consoleErrors: [], framesAdvanced: 400, windowMs: 2000, inputLatencyMs: 14 },
};

section("Healthy scene passes ALL eyes");
{
  const v = judgeAll(GOOD);
  assert(v.every((x) => x.verdict === "pass"), `all six channels pass (${v.map((x) => x.reason).join(",")})`);
  assert(allPassed(GOOD), "aggregate true");
}

section("Motion eyes");
{
  assert(judgeMotion({ meanFrameDelta: 0, samples: 12 }).reason === "static_scene", "frozen frame caught");
  assert(judgeMotion({ meanFrameDelta: 90, samples: 12 }).reason === "strobe", "strobe caught");
  assert(judgeMotion({ meanFrameDelta: 1, samples: 1 }).reason === "insufficient_samples", "sampling enforced");
  assert(judgeMotion({ meanFrameDelta: PERCEPTION_THRESHOLDS.motionMin, samples: 5 }).verdict === "pass", "boundary pass");
}

section("Palette eyes");
{
  assert(judgePalette({ histogram: [2000, 0, 0, 0, 0, 0, 0, 0], meanLuminance: 3 }).reason === "too_dark", "black screen caught");
  assert(judgePalette({ histogram: [0, 0, 0, 0, 0, 0, 100, 2100], meanLuminance: 250 }).reason === "blown_out", "white void caught");
  assert(judgePalette({ histogram: [900, 0, 900, 0, 900, 0, 900, 0], meanLuminance: 96 }).reason === "degenerate_histogram", "banded histogram caught");
}

section("Physics eyes");
{
  const mismatch = judgePhysics({ replayHashA: "x1", replayHashB: "x2", energyDrift: 0, tunnelRate: 0 });
  assert(mismatch.reason === "replay_mismatch", "NON-DETERMINISM caught");
  assert(judgePhysics({ replayHashA: "h", replayHashB: "h", energyDrift: 0.5, tunnelRate: 0 }).reason === "energy_drift", "exploding sim caught");
  assert(judgePhysics({ replayHashA: "h", replayHashB: "h", energyDrift: 0, tunnelRate: 0.5 }).reason === "tunneling", "tunneling caught");
}

section("Audio eyes");
{
  assert(judgeAudio({ rms: 0, peak: 0, spectralCentroidHz: 0, durationSec: 2 }).reason === "silent", "silence caught");
  assert(judgeAudio({ rms: 0.2, peak: 1.4, spectralCentroidHz: 900, durationSec: 2 }).reason === "clipping", "clipping caught");
  assert(judgeAudio({ rms: 0.12, peak: 0.6, spectralCentroidHz: 1200, durationSec: 2 }).verdict === "pass", "healthy render passes");
}

section("Playtest eyes");
{
  assert(judgePlaytest({ injectedEvents: 200, consoleErrors: ["boom"], framesAdvanced: 500, windowMs: 2000, inputLatencyMs: 10 }).reason === "console_errors", "crash-under-fuzz caught");
  assert(judgePlaytest({ injectedEvents: 200, consoleErrors: [], framesAdvanced: 3, windowMs: 2000, inputLatencyMs: 10 }).reason === "render_loop_stalled", "stalled loop caught");
  assert(judgePlaytest({ injectedEvents: 200, consoleErrors: [], framesAdvanced: 500, windowMs: 2000, inputLatencyMs: 900 }).reason === "input_latency", "laggy input caught");
  assert(judgePlaytest({ injectedEvents: 10, consoleErrors: [], framesAdvanced: 400, windowMs: 2000, inputLatencyMs: 99 }).verdict === "pass", "responsive passes");
}

console.log(`\nORCHESTRA O7 perception tests \u2014 passed: ${passed}, failed: ${failed}`);
if (failed > 0) { console.error("\nFAILURES:"); for (const f of failures) console.error(`  - ${f}`); process.exit(1); }
