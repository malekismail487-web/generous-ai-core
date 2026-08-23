/**
 * ORCHESTRA O6 — Evidence Harness Test Harness
 * -------------------------------------------
 * Runnable with:  npx tsx scripts/orchestraO6.test.ts
 *
 * Guarantees pinned here:
 *   1. Pack validation: finite metrics only (NaN/∞ rejected), one result
 *      per probe, bounded details/metrics, artifact build refs.
 *   2. Digest tamper-evidence (verifyPack) — certificate parity.
 *   3. Channel projection EXACTNESS per the frozen map + worst-status-wins,
 *      and end-to-end integration into aggregateVerdict + expectedChannels
 *      coverage semantics (O5 contract #1: ONE source of truth).
 *   4. Budget honesty: missing metric for a declared budget FAILS.
 *   5. Findings derivation: failures→oversight findings with VALID refs by
 *      construction; passes silent (noise discipline).
 *   6. Ledger dedupe/cap/latest; fold determinism.
 */

import {
  HARNESS_LIMITS,
  PACK_CHANNEL_MAP,
  PROBE_KINDS,
  buildPack,
  evaluateBudgets,
  foldHarness,
  initialHarness,
  latestForFamily,
  packFindings,
  reduceHarness,
  toChannelEvidence,
  verifyPack,
  type EvidencePack,
} from "../src/lib/codelab/orchestra/harness";
import { aggregateVerdict } from "../src/lib/codelab/verifier/types";

// ---------------------------------------------------------------------------
// Assertion helpers (house style)
// ---------------------------------------------------------------------------

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
// Fixtures
// ---------------------------------------------------------------------------

/** Test-fixture unwrap: a broken fixture is a harness bug, not a branch. */
function must(r: ReturnType<typeof buildPack>): EvidencePack {
  if (!r.ok) throw new Error(`fixture broken: ${r.reason}`);
  return r.value;
}

const ALL_PASS: EvidencePack = must(buildPack({
  packId: "pk-1",
  familyId: "fam-t",
  epoch: 0,
  buildRef: "artifact://build/abc123",
  results: [
    { probe: "console", status: "pass", metrics: { consoleErrors: 0 }, details: [] },
    { probe: "network", status: "pass", metrics: { failedFetches: 0 }, details: [] },
    { probe: "perf", status: "pass", metrics: { fps: 60, heapGrowthMb: 3.5, longTasks: 1 }, details: [] },
    { probe: "physics", status: "pass", metrics: { energyDrift: 0.001 }, details: [] },
    { probe: "fuzz", status: "pass", metrics: { interactions: 5000 }, details: ["repro:none"] },
    { probe: "visual", status: "pass", metrics: { pixelDiffPct: 0 }, details: [] },
    { probe: "a11y", status: "pass", metrics: { contrastFailures: 0 }, details: [] },
    { probe: "api_contract", status: "pass", metrics: { misuseCount: 0 }, details: [] },
  ],
}));

// ---------------------------------------------------------------------------
// 1. Pack validation & signing
// ---------------------------------------------------------------------------

section("Pack validation");
{
  assert(ALL_PASS.results.length === PROBE_KINDS.length, "fixture covers all probes");

  const nan = buildPack({
    ...({ packId: "pk-2", familyId: "fam-t", epoch: 0, buildRef: "artifact://b/x" } as const),
    results: [{ probe: "perf", status: "fail", metrics: { fps: NaN }, details: [] }],
  });
  assert(!nan.ok, "NaN metric rejected (finite-only law)");

  const inf = buildPack({
    packId: "pk-3", familyId: "fam-t", epoch: 0, buildRef: "artifact://b/x",
    results: [{ probe: "perf", status: "fail", metrics: { fps: Infinity }, details: [] }],
  });
  assert(!inf.ok, "Infinity metric rejected");

  const dup = buildPack({
    packId: "pk-4", familyId: "fam-t", epoch: 0, buildRef: "artifact://b/x",
    results: [
      { probe: "console", status: "pass", metrics: {}, details: [] },
      { probe: "console", status: "fail", metrics: {}, details: [] },
    ],
  });
  assert(!dup.ok, "duplicate probe in ONE pack rejected");

  const badRef = buildPack({
    packId: "pk-5", familyId: "fam-t", epoch: 0, buildRef: "look ma no ref",
    results: [{ probe: "console", status: "pass", metrics: {}, details: [] }],
  });
  assert(!badRef.ok, "non-artifact/http build ref rejected");

  // Tamper evidence.
  assert(verifyPack(ALL_PASS), "fresh pack verifies");
  const forged: EvidencePack = { ...ALL_PASS, results: ALL_PASS.results.map((r) => r.probe === "perf" ? { ...r, status: "fail" as const } : r) };
  assert(!verifyPack(forged), "tampered pack FAILS digest check");
}

// ---------------------------------------------------------------------------
// 2. Channel projection exactness + verifier integration
// ---------------------------------------------------------------------------

section("Channel projection");
{
  // Frozen map spot-checks.
  assert(PACK_CHANNEL_MAP.console === "runtime" && PACK_CHANNEL_MAP.physics === "runtime" &&
    PACK_CHANNEL_MAP.fuzz === "behavioral" && PACK_CHANNEL_MAP.api_contract === "integration",
    "frozen probe→channel map correct");

  const ev = toChannelEvidence(ALL_PASS);
  assert(ev.length === 3, "all-pass collapses to 3 channels");
  const byCh = new Map(ev.map((e) => [e.channel, e.status]));
  assert(byCh.get("runtime") === "pass" && byCh.get("behavioral") === "pass" && byCh.get("integration") === "pass",
    "all-pass ⇒ all channels pass");

  // Worst-status-wins: failing perf drags runtime even though others pass.
  const partial = must(buildPack({
    packId: "pk-9", familyId: "fam-t", epoch: 0, buildRef: "artifact://b/y",
    results: [
      { probe: "console", status: "pass", metrics: {}, details: [] },
      { probe: "perf", status: "error", metrics: {}, details: [] },
      { probe: "fuzz", status: "skipped", metrics: {}, details: [] },
      { probe: "visual", status: "pass", metrics: {}, details: [] },
      { probe: "api_contract", status: "pass", metrics: {}, details: [] },
    ],
  }));
  const ev2 = toChannelEvidence(partial);
  const m2 = new Map(ev2.map((e) => [e.channel, e.status]));
  // Errored probe projects as channel FAIL (crashed probe = broken build);
  // skipped+pass channel RAN ⇒ pass.
  assert(m2.get("runtime") === "fail" && m2.get("behavioral") === "pass" &&
    m2.get("integration") === "pass",
    "error⇒fail projection; skipped+pass ⇒ pass (channel ran)");

  // END-TO-END: projection feeds aggregateVerdict with expectedChannels —
  // the single-source-of-truth path into verifier AND Delivery Gate.
  const fullVerdict = aggregateVerdict(ev, ["runtime", "behavioral", "integration"]);
  const failVerdict = aggregateVerdict(ev2, ["runtime", "behavioral", "integration"]);
  assert(fullVerdict === "pass", "clean pack ⇒ verifier PASS via projection");
  assert(failVerdict === "fail", "errored probe ⇒ verifier FAIL via same pipeline");
}

// ---------------------------------------------------------------------------
// 3. Budget evaluation honesty
// ---------------------------------------------------------------------------

section("Budget evaluation");
{
  const out = evaluateBudgets(ALL_PASS, {
    minFps: 58, maxHeapGrowthMb: 64, maxLongTasks: 5,
    maxConsoleErrors: 0, maxFailedFetches: 0,
  });
  assert(out.every((o) => o.ok), `all five budgets met on clean pack (${out.length} checked)`);

  const fpsEdge = evaluateBudgets(ALL_PASS, { minFps: 60 });
  assert(fpsEdge[0].ok && fpsEdge[0].measured === 60, "minFps boundary: exactly met passes");

  const over = evaluateBudgets(ALL_PASS, { maxHeapGrowthMb: 2 });
  assert(!over[0].ok && over[0].why === "over_budget" && over[0].measured === 3.5,
    "over-budget reports measured value");

  const missing = evaluateBudgets(ALL_PASS, { maxConsoleErrors: 0 }) // consoleErrors present
    .every((o) => o.ok);
  assert(missing, "present metric evaluates normally");

  const absent = evaluateBudgets(
    { ...ALL_PASS, results: ALL_PASS.results.filter((r) => r.probe !== "console") },
    { maxConsoleErrors: 0 },
  );
  assert(absent.length === 1 && !absent[0].ok && absent[0].why === "metric_missing",
    "DECLARED budget with MISSING metric fails (absence ≠ success)");
}

// ---------------------------------------------------------------------------
// 4. Findings derivation
// ---------------------------------------------------------------------------

section("Findings derivation");
{
  assert(packFindings(ALL_PASS).length === 0, "clean pack emits ZERO findings (noise discipline)");

  const mixed = must(buildPack({
    packId: "pk-mix", familyId: "fam-t", epoch: 0, buildRef: "artifact://b/z",
    results: [
      { probe: "console", status: "error", metrics: { consoleErrors: 7 }, details: ["TypeError at app.js:12"] },
      { probe: "perf", status: "fail", metrics: { fps: 22 }, details: [] },
      { probe: "fuzz", status: "pass", metrics: {}, details: [] },
    ],
  }));
  const findings = packFindings(mixed);
  assert(findings.length === 2, "only failures become findings");
  const sev = new Map(findings.map((f) => [f.claim.split(" ")[1], f.severity]));
  assert(sev.get("console") === "urgent" && sev.get("perf") === "concern",
    "error⇒urgent · fail⇒concern mapping exact");
  assert(findings.every((f) => f.evidenceRefs[0].startsWith(`artifact://pack/pk-mix/`)),
    "finding refs auto-cite the pack by construction");
}

// ---------------------------------------------------------------------------
// 5. Ledger: dedupe / cap / latest / folds
// ---------------------------------------------------------------------------

section("Harness ledger");
{
  let st = foldHarness([
    { kind: "pack_recorded", pack: ALL_PASS },
    { kind: "pack_recorded", pack: ALL_PASS }, // duplicate id
  ]);
  assert(st.version === 2 && st.rejectedCount === 1 && st.packs.length === 1,
    "duplicate packId rejected, ledger intact");

  const second = must(buildPack({
    packId: "pk-later", familyId: "fam-t", epoch: 0, buildRef: "artifact://b/w",
    results: [{ probe: "console", status: "fail", metrics: { consoleErrors: 3 }, details: [] }],
  }));
  st = reduceHarness(st, { kind: "pack_recorded", pack: second });
  assert(latestForFamily(st, "fam-t")!.packId === "pk-later", "latest-for-family returns newest");
  assert(latestForFamily(st, "ghost-family") === null, "unknown family ⇒ null (never guesses)");

  // Cap ring.
  let capped = initialHarness();
  for (let i = 0; i < HARNESS_LIMITS.packsRetained + 7; i++) {
    const p = must(buildPack({
      packId: `pk-c${i}`, familyId: "fam-t", epoch: 0, buildRef: "artifact://b/i",
      results: [{ probe: "console", status: "pass", metrics: {}, details: [] }],
    }));
    capped = reduceHarness(capped, { kind: "pack_recorded", pack: p });
  }
  assert(capped.packs.length === HARNESS_LIMITS.packsRetained, "ledger capped at published bound");
  assert(capped.packs[capped.packs.length - 1].packId === `pk-c${HARNESS_LIMITS.packsRetained + 6}`,
    "newest retained after cap");

  // Tampered record rejected at the door.
  const forgedPack: EvidencePack = {
    ...ALL_PASS,
    results: ALL_PASS.results.map((r) => (r.probe === "perf" ? { ...r, status: "fail" as const } : r)),
  };
  const before = capped.version;
  const after = reduceHarness(capped, { kind: "pack_recorded", pack: forgedPack });
  assert(after.rejectedCount === capped.rejectedCount + 1 && after.version === before + 1,
    "forged packs cannot enter the ledger");
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\nORCHESTRA O6 harness tests — passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
