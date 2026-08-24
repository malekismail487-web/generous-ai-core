/**
 * ORCHESTRA O7a — Engine Core Test Harness
 * ---------------------------------------
 * Runnable with:  npx tsx scripts/orchestraO7a.test.ts
 *
 * Pins: integer-only PRNG determinism · linter rules R1–R5 · loop lifecycle
 * incl. owner law §4.5 (recovery-before-exit, exit impossible without a
 * tested hypothesis in a real recovery round).
 */

import { hashSeed, makeRng } from "../src/lib/codelab/engine/rng";
import { lintGeneratedSource } from "../src/lib/codelab/engine/linter";
import {
  REPAIR_BUDGET,
  foldLoop,
  reduceLoop,
  type LoopEvent,
} from "../src/lib/codelab/engine/loopKernel";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(cond: unknown, label: string) {
  if (cond) passed++;
  else {
    failed++;
    failures.push(label);
    console.error(`  ✗ ${label}`);
  }
}
function section(name: string) {
  console.log(`\n— ${name}`);
}

// ---------------------------------------------------------------------------

section("Seeded PRNG");
{
  const a = makeRng("canyon-dusk-v1");
  const b = makeRng("canyon-dusk-v1");
  const seqA = Array.from({ length: 64 }, () => a.next());
  const seqB = Array.from({ length: 64 }, () => b.next());
  assert(seqA.every((v, i) => v === seqB[i]), "same seed ⇒ identical stream");
  assert(seqA.every((v) => v >= 0 && v < 1), "uniform [0,1)");
  assert(hashSeed("x") !== hashSeed("y") && hashSeed("") === hashSeed(""), "hash sane");
  const r = makeRng("dice");
  assert([r.int(1, 6), r.int(1, 6), r.int(1, 6)].every((v) => v >= 1 && v <= 6 && Number.isInteger(v)),
    "int() inclusive & integral");
}

section("Linter R1–R5");
{
  const dirty = `
    const x = Math.random();
    const t = Date.now();
    camera.near = 500;
    camera.far = 100;
    new THREE.WebGLRenderer({ canvas });
  `;
  const d = lintGeneratedSource(dirty);
  assert(!d.ok, "dirty source rejected");
  const rules = new Set(d.violations.map((v) => v.rule));
  assert(rules.has("no-math-random"), "R1 fires");
  assert(rules.has("no-date-source"), "R2 fires");
  assert(rules.has("camera-frustum"), "R5 near≥far fires");
  assert(rules.has("color-pipeline"), "R4 renderer w/o color pipeline fires");

  const physicsDirty = "world.step(world.timestep); body = new RigidBody();";
  const p = lintGeneratedSource(physicsDirty);
  assert(p.violations.some((v) => v.rule === "fixed-timestep"), "R3 physics needs FIXED_TIMESTEP");

  const clean = `
    const FIXED_TIMESTEP = 1 / 60;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.outputColorSpace = 'srgb';
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    camera.near = 0.1; camera.far = 900;
    const w = seededNoise(seed);
  `;
  assert(lintGeneratedSource(clean).ok, "scaffold-conformant source passes");
}

section("Loop kernel §4.5 semantics");
{
  const open: LoopEvent = { kind: "task_opened", taskId: "t1" };
  let evs: LoopEvent[] = [open,
    { kind: "attempt_started", taskId: "t1", cycle: 1, attemptKind: "initial" },
  ];
  // Budget burn: REPAIR_BUDget failing cycles.
  for (let c = 1; c <= REPAIR_BUDGET; c++) {
    evs.push({ kind: "evidence_filed", taskId: "t1", cycle: c, passedGates: [], failedGates: ["visual"] });
    if (c < REPAIR_BUDGET) evs.push({ kind: "repair_applied", taskId: "t1", cycle: c, editCount: 3 });
    if (c < REPAIR_BUDGET) evs.push({ kind: "attempt_started", taskId: "t1", cycle: c + 1, attemptKind: "repair" });
  }
  let st = foldLoop(evs);
  assert(st.tasks["t1"].phase === "recovering" && st.tasks["t1"].repairCyclesSpent === REPAIR_BUDGET,
    `budget spent ⇒ recovering (not exit)`);

  // Owner law: NO honest exit without tested hypotheses.
  const illegalExit = reduceLoop(st, { kind: "honest_exit", taskId: "t1", impossibility: "gave up" });
  assert(illegalExit.rejectedCount === 1 && illegalExit.tasks["t1"].phase === "recovering",
    "exit WITHOUT recovery work structurally impossible");

  // Recovery requires research citations.
  const noRefs = reduceLoop(st, { kind: "recovery_opened", taskId: "t1", researchRefs: [] });
  assert(noRefs.rejectedCount === 1, "research-less recovery rejected");

  st = foldLoop([...evs, { kind: "recovery_opened", taskId: "t1", researchRefs: ["https://arxiv.org/abs/2401.00000"] }]);
  st = reduceLoop(st, {
    kind: "hypothesis_tested", taskId: "t1",
    hypothesisId: "h1-swiftshader-luminance", matchedEvidence: false,
  });
  assert(st.tasks["t1"].hypothesesTested === 1, "hypothesis recorded");

  // Recovery attempt opens fresh window.
  st = reduceLoop(st, { kind: "attempt_started", taskId: "t1", cycle: 7, attemptKind: "recovery" });
  assert(st.tasks["t1"].repairCyclesSpent === 0 && st.tasks["t1"].recoveryRounds === 1,
    "fresh repair window; round counted");

  st = reduceLoop(st, {
    kind: "evidence_filed", taskId: "t1", cycle: 7,
    passedGates: ["visual", "physics", "perf"], failedGates: [],
  });
  assert(st.tasks["t1"].phase === "done", "clean evidence ⇒ done");

  st = reduceLoop(st, { kind: "task_completed", taskId: "t1", finalCycle: 7 });
  assert(st.tasks["t1"].phase === "done", "completion lands");

  // Early completion impossible while gates fail.
  const early = foldLoop([
    { kind: "task_opened", taskId: "t2" },
    { kind: "attempt_started", taskId: "t2", cycle: 1, attemptKind: "initial" },
    { kind: "evidence_filed", taskId: "t2", cycle: 1, passedGates: [], failedGates: ["physics"] },
    { kind: "task_completed", taskId: "t2", finalCycle: 1 },
  ]);
  assert(early.tasks["t2"]?.phase !== "done" && early.rejectedCount === 1,
    "cannot declare done on failing gates");
}

// ---------------------------------------------------------------------------
console.log(`\nORCHESTRA O7a engine-core tests — passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
