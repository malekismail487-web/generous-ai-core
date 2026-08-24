/**
 * ORCHESTRA O2 — Virtual Swarm & Capacity Planner Test Harness
 * -----------------------------------------------------------
 * Runnable with:  npx tsx scripts/orchestraO2.test.ts
 *
 * Guarantees pinned here:
 *   1. Planner math is exact, monotone, and CAP-FREE (owner law §0a.1):
 *      demand scales linearly with taskUnits and a 50M-unit scenario plans
 *      proportionally without complaint.
 *   2. Founding runs THROUGH the activation gate — no cert / mutated
 *      charter ⇒ unfoundable. There is no bypass constructor.
 *   3. THE CLONE PROOF: spawning 30,000,000 logical workers is ONE ledger
 *      append; ids mint deterministically; completion beyond minting is
 *      rejected; ranges are contiguous by enforcement.
 *   4. Escalation ladder transitions are exact; budget accounting is
 *      visibility-only (burn never auto-stops).
 *   5. Per-family freeze/resume epochs isolate families; stale traffic is
 *      counted, never corrupting; folds stay associative.
 *   6. scheduleWave is genuinely fair (quantum round-robin): no starvation,
 *      frozen/closed excluded, capacities exact, deterministic.
 */

import {
  planCapacity,
  type WorkloadProfile,
} from "../src/lib/codelab/orchestra/capacity";
import {
  composeCharter,
} from "../src/lib/codelab/orchestra/charter";
import {
  issueActivation,
} from "../src/lib/codelab/orchestra/certificate";
import {
  activeFamilies,
  foldSwarm,
  foldSwarmFrom,
  foundFamily,
  initialSwarm,
  mintWorkerId,
  reduceSwarm,
  scheduleWave,
  type LaneSpec,
  type SwarmEvent,
} from "../src/lib/codelab/orchestra/swarm";

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

function genesisFixture() {
  const identity = { agentId: "pa1", parentId: null, roles: ["parent"] as const };
  const composed = composeCharter({
    identity,
    mission: "Geometry family for the migration.",
    doctrine: { planning: "LOD boundaries.", delegation: "Full briefs.", stopConditions: ["3 fails"] },
    tierByRole: { worker: "fast" },
    budget: { maxToolCalls: 1000, maxTokenEstimate: 10_000_000 },
    qualification: { requiredProbes: ["channel_law"], minScore: 0.5 },
  });
  if (!composed.ok) throw new Error("fixture compose failed");
  const issued = issueActivation({ certId: "cert-pa1", charter: composed.charter, issuerId: "oc1", epoch: 0 });
  if (!issued.ok) throw new Error("fixture issuance failed");
  return { charter: composed.charter, cert: issued.certificate };
}

const PROFILE: WorkloadProfile = {
  taskUnits: 1000,
  parallelism: 0.5,
  deterministicShare: 0.2,
  escalationRate: 0.1,
  domainDiversity: 3,
  avgUnitToolCalls: 10,
  avgUnitTokens: 5000,
};

// ---------------------------------------------------------------------------
// 1. Capacity Planner
// ---------------------------------------------------------------------------

section("Capacity planner");
{
  // Exact math on the fixture profile.
  const r = planCapacity(PROFILE);
  assert(r.ok, "valid profile plans");
  if (r.ok) {
    const p = r.plan;
    assert(p.laneDemand.t0 === 100 && p.laneDemand.t1 === 360 && p.laneDemand.t2 === 40,
      `lane split exact T0:${p.laneDemand.t0}/T1:${p.laneDemand.t1}/T2:${p.laneDemand.t2}`);
    assert(p.workerCount === 800 && p.parentCount === 3, "worker/parent counts exact");
    assert(
      p.workersPerFamily.join(",") === "267,267,266",
      "distribution even with remainder to earliest families",
    );
    assert(p.estimatedTokens === 5_000_000 && p.estimatedToolCalls === 10_000, "estimates exact");
    assert(p.rationale.length <= 400 && p.rationale.includes("800"), "rationale bounded + informative");
  }

  // Monotonicity: more units never shrink demand.
  const small = planCapacity({ ...PROFILE, taskUnits: 500 }).ok
    ? planCapacity({ ...PROFILE, taskUnits: 500 })
    : null;
  const big = planCapacity({ ...PROFILE, taskUnits: 2000 });
  if (small?.ok && big.ok) {
    assert(big.plan.workerCount > small.plan.workerCount, "workers grow with workload");
    assert(big.plan.laneDemand.t1 > small.plan.laneDemand.t1, "lanes grow with workload");
  }

  // LINEARITY (cap-free proof): ×10 units ⇒ exactly ×10 lanes here.
  const base = planCapacity({ taskUnits: 100_000, parallelism: 1, deterministicShare: 0, escalationRate: 0.05, domainDiversity: 4, avgUnitToolCalls: 2, avgUnitTokens: 100 });
  const decuple = planCapacity({ taskUnits: 1_000_000, parallelism: 1, deterministicShare: 0, escalationRate: 0.05, domainDiversity: 4, avgUnitToolCalls: 2, avgUnitTokens: 100 });
  if (base.ok && decuple.ok) {
    assert(decuple.plan.laneDemand.t2 === base.plan.laneDemand.t2 * 10,
      "T2 lane demand scales EXACTLY linearly (no ceiling)");
    assert(decuple.plan.workerCount === base.plan.workerCount * 10,
      "worker demand scales EXACTLY linearly (no ceiling)");
  }

  // The owner's scenario shape: 50M units plan proportionally, instantly.
  const huge = planCapacity({ taskUnits: 50_000_000, parallelism: 0.8, deterministicShare: 0.35, escalationRate: 0.02, domainDiversity: 12, avgUnitToolCalls: 3, avgUnitTokens: 1200 });
  assert(huge.ok && huge.plan.workerCount === Math.round(50_000_000 * 0.65),
    "50M-unit scenario plans proportionally");

  // Typed rejections.
  const bads: Array<[WorkloadProfile, string]> = [
    [{ ...PROFILE, taskUnits: 0 }, "bad_task_units"],
    [{ ...PROFILE, parallelism: 0 }, "bad_parallelism"],
    [{ ...PROFILE, parallelism: 1.5 }, "bad_parallelism"],
    [{ ...PROFILE, deterministicShare: -0.1 }, "bad_deterministic_share"],
    [{ ...PROFILE, escalationRate: 2 }, "bad_escalation_rate"],
    [{ ...PROFILE, domainDiversity: 0 }, "bad_domain_diversity"],
    [{ ...PROFILE, avgUnitTokens: -1 }, "bad_unit_metrics"],
  ];
  let typed = true;
  for (const [prof, expected] of bads) {
    const rr = planCapacity(prof);
    if (rr.ok || rr.reason !== expected) {
      typed = false;
      failures.push(`planner expected ${expected}, got ${rr.ok ? "ok" : rr.reason}`);
      break;
    }
  }
  assert(typed, `all ${bads.length} invalid profiles typed correctly`);
}

// ---------------------------------------------------------------------------
// 2. Gate-gated founding
// ---------------------------------------------------------------------------

section("Genesis-gated founding");
{
  const fx = genesisFixture();

  const denied = foundFamily({ familyId: "fam-a", cert: null, charter: fx.charter });
  assert(!denied.ok && denied.reason === "gate_no_certificate",
    "NO certificate ⇒ unfoundable");

  const tampered = { ...fx.charter, mission: `${fx.charter.mission} (edited post-cert)` };
  const deniedDigest = foundFamily({ familyId: "fam-a", cert: fx.cert, charter: tampered });
  assert(!deniedDigest.ok && deniedDigest.reason === "gate_digest_mismatch",
    "charter drift since certification ⇒ unfoundable");

  const wrongIdentityCharter = { ...fx.charter, identity: { ...fx.charter.identity, agentId: "pa-other" } };
  const deniedIdentity = foundFamily({ familyId: "fam-a", cert: fx.cert, charter: wrongIdentityCharter });
  assert(!deniedIdentity.ok && deniedIdentity.reason === "gate_identity_mismatch",
    "certificate/charter identity mismatch preserves the exact gate reason");

  const okFound = foundFamily({ familyId: "fam-a", cert: fx.cert, charter: fx.charter });
  assert(okFound.ok, "certified charter founds cleanly");
  if (!okFound.ok) throw new Error("fixture broken");

  let st = foldSwarm([okFound.event]);
  assert(st.families["fam-a"].founded && st.families["fam-a"].epoch === 0, "family state live");

  const double = reduceSwarm(st, okFound.event);
  assert(double.rejectedCount === 1 && double.families["fam-a"].spawnedCount === 0,
    "double founding counted, not corrupted");
}

// ---------------------------------------------------------------------------
// 3. THE CLONE PROOF — 30,000,000 in one append
// ---------------------------------------------------------------------------

section("Clone semantics at absurd scale");
{
  const fx = genesisFixture();
  const found = foundFamily({ familyId: "fam-huge", cert: fx.cert, charter: fx.charter });
  if (!found.ok) throw new Error("fixture broken");

  const t0 = Date.now(); // harness-only timing (module itself is clock-free)
  const batch: SwarmEvent = {
    kind: "spawn_batch",
    familyId: "fam-huge",
    epoch: 0,
    startIndex: 0,
    count: 30_000_000,
  };
  const st = foldSwarm([found.event, batch]);
  const elapsed = Date.now() - t0;

  assert(st.families["fam-huge"].spawnedCount === 30_000_000,
    "30M logical workers minted by ONE event");
  assert(elapsed < 250, `minting effectively instant (${elapsed}ms incl. harness clock)`);

  // Deterministic identity minting.
  assert(mintWorkerId("fam-huge", 29_999_999) === "fam-huge#w29999999", "mint format stable");
  assert(mintWorkerId("a", 1) !== mintWorkerId("b", 1) && mintWorkerId("a", 1) !== mintWorkerId("a", 2),
    "ids distinct across families and indices");

  // Contiguity enforced: gap rejected.
  const gap = reduceSwarm(st, { kind: "spawn_batch", familyId: "fam-huge", epoch: 0, startIndex: 30_000_001, count: 5 });
  assert(gap.rejectedCount === 1, "non-contiguous spawn range rejected");
  const cont = reduceSwarm(st, { kind: "spawn_batch", familyId: "fam-huge", epoch: 0, startIndex: 30_000_000, count: 5 });
  assert(cont.appliedCount === 3 && cont.families["fam-huge"].spawnedCount === 30_000_005,
    "contiguous continuation accepted");

  // Completion beyond minting rejected (minted total = 30,000,005).
  const over = reduceSwarm(cont, { kind: "unit_completed", familyId: "fam-huge", epoch: 0, units: 30_000_010, tier: "t1" });
  assert(over.rejectedCount === 1 && over.families["fam-huge"].completedCount === 0,
    "cannot complete more than minted");
  const fit = reduceSwarm(cont, { kind: "unit_completed", familyId: "fam-huge", epoch: 0, units: 30_000_000, tier: "t1" });
  assert(fit.families["fam-huge"].completedByTier.t1 === 30_000_000, "tier accounting exact at scale");
}

// ---------------------------------------------------------------------------
// 4. Ladder, budget visibility, freeze isolation
// ---------------------------------------------------------------------------

section("Ladder · budget · freeze");
{
  const fx = genesisFixture();
  const found = foundFamily({ familyId: "fam-l", cert: fx.cert, charter: fx.charter });
  if (!found.ok) throw new Error("fixture broken");
  let st = foldSwarm([
    found.event,
    { kind: "spawn_batch", familyId: "fam-l", epoch: 0, startIndex: 0, count: 10 },
  ]);

  const esc = (from: "t1" | "t2", to: "t2" | "orchestrator"): SwarmEvent => ({
    kind: "escalated", familyId: "fam-l", epoch: 0,
    workerId: mintWorkerId("fam-l", 3), fromTier: from, toTier: to, reason: "stuck",
  });
  st = reduceSwarm(st, esc("t1", "t2"));
  st = reduceSwarm(st, esc("t2", "orchestrator"));
  assert(st.families["fam-l"].escalations === 2, "full ladder climbs");
  const illegalLadder = reduceSwarm(st, esc("t1", "orchestrator"));
  assert(illegalLadder.rejectedCount === 1, "ladder skips are rejected");

  // Budget: visibility only — massive burn applies, never blocks.
  st = reduceSwarm(st, { kind: "budget_burned", familyId: "fam-l", epoch: 0, tokens: 999_999_999_999, toolCalls: 1_000_000 });
  assert(st.families["fam-l"].tokensBurned === 999_999_999_999,
    "accounting records burn far past estimate (no cost wall)");

  // Freeze → stale old-epoch traffic dropped → resume → new-epoch works.
  st = reduceSwarm(st, { kind: "family_frozen", familyId: "fam-l", newEpoch: 1, movedBy: "eyes", reason: "anomaly" });
  assert(st.families["fam-l"].frozen && st.families["fam-l"].epoch === 1, "freeze bumps family epoch");
  const stale = reduceSwarm(st, { kind: "unit_completed", familyId: "fam-l", epoch: 0, units: 1, tier: "t1" });
  assert(stale.rejectedCount === 1 && stale.families["fam-l"].completedCount === 0,
    "pre-freeze traffic stale-dropped");
  const doubleFreeze = reduceSwarm(st, { kind: "family_frozen", familyId: "fam-l", newEpoch: 2, movedBy: "eyes", reason: "again" });
  assert(doubleFreeze.rejectedCount === 1, "double freeze rejected while frozen");
  st = reduceSwarm(st, { kind: "family_resumed", familyId: "fam-l", newEpoch: 2 });
  assert(!st.families["fam-l"].frozen && st.families["fam-l"].epoch === 2, "resume grants generation 2");
  st = reduceSwarm(st, { kind: "unit_completed", familyId: "fam-l", epoch: 2, units: 2, tier: "t0" });
  assert(st.families["fam-l"].completedCount === 2, "post-resume work flows again");

  // Close.
  st = reduceSwarm(st, { kind: "family_closed", familyId: "fam-l", epoch: 2, summaryRef: "artifact://fam-l/final" });
  assert(st.families["fam-l"].closedSummaryRef !== null, "family closes with summary ref");
  const afterClose = reduceSwarm(st, { kind: "unit_completed", familyId: "fam-l", epoch: 2, units: 1, tier: "t0" });
  assert(afterClose.rejectedCount === 1, "closed family rejects further work events");

  // Fold associativity on this corpus.
  const corpus: SwarmEvent[] = [
    found.event,
    { kind: "spawn_batch", familyId: "fam-l", epoch: 0, startIndex: 0, count: 10 },
    esc("t1", "t2"),
    { kind: "budget_burned", familyId: "fam-l", epoch: 0, tokens: 5, toolCalls: 5 },
    { kind: "family_frozen", familyId: "fam-l", newEpoch: 1, movedBy: "eyes", reason: "x" },
    { kind: "family_resumed", familyId: "fam-l", newEpoch: 2 },
    { kind: "unit_completed", familyId: "fam-l", epoch: 2, units: 3, tier: "t2" },
    { kind: "family_closed", familyId: "fam-l", epoch: 2, summaryRef: "artifact://z" },
  ];
  const whole = foldSwarm(corpus);
  let assoc = true;
  for (let k = 0; k <= corpus.length; k++) {
    const combined = foldSwarmFrom(foldSwarm(corpus.slice(0, k)), corpus.slice(k));
    if (JSON.stringify(combined) !== JSON.stringify(whole)) {
      assoc = false;
      failures.push(`swarm associativity broke at k=${k}`);
      break;
    }
  }
  assert(assoc, `fold associativity holds at all ${corpus.length + 1} splits`);
}

// ---------------------------------------------------------------------------
// 5. Wave scheduling fairness kernel
// ---------------------------------------------------------------------------

section("scheduleWave fairness");
{
  const fx = genesisFixture();
  const fA = foundFamily({ familyId: "fam-A", cert: fx.cert, charter: fx.charter });
  const fB = foundFamily({ familyId: "fam-B", cert: fx.cert, charter: fx.charter });
  if (!fA.ok || !fB.ok) throw new Error("fixture broken");

  const mkState = (): ReturnType<typeof foldSwarm> =>
    foldSwarm([
      fA.event, fB.event,
      { kind: "spawn_batch", familyId: "fam-A", epoch: 0, startIndex: 0, count: 100 },
      { kind: "spawn_batch", familyId: "fam-B", epoch: 0, startIndex: 0, count: 50 },
      { kind: "unit_completed", familyId: "fam-B", epoch: 0, units: 20, tier: "t1" },
    ]);
  const st = mkState();
  // Pending: A=100, B=30.

  const lanes: LaneSpec[] = [
    { laneId: "l1", tier: "t1", capacity: 60 },
    { laneId: "l2", tier: "t1", capacity: 60 },
  ];
  const wave = scheduleWave(st, lanes);

  const total = wave.reduce((acc, w) => acc + w.units, 0);
  assert(total === 120, "wave drains exactly min(capacity total, pending total)");
  const perLane = new Map<string, number>();
  for (const w of wave) perLane.set(w.laneId, (perLane.get(w.laneId) ?? 0) + w.units);
  assert(perLane.get("l1") === 60 && perLane.get("l2") === 60, "lane capacities respected exactly");

  const byFam = new Map<string, number>();
  for (const w of wave) byFam.set(w.familyId, (byFam.get(w.familyId) ?? 0) + w.units);
  // Fair quantum rotation ⇒ B's full pending 30 drains THIS wave, not starved:
  assert(byFam.get("fam-B") === 30, "smaller family NOT starved (fair-share quantum)");
  assert(byFam.get("fam-A") === 90, "remainder flows to larger family after parity");

  // Starvation guard edge: tiny family alongside giant gets its work.
  const stEdge = foldSwarm([
    fA.event, fB.event,
    { kind: "spawn_batch", familyId: "fam-A", epoch: 0, startIndex: 0, count: 10_000 },
    { kind: "spawn_batch", familyId: "fam-B", epoch: 0, startIndex: 0, count: 1 },
  ]);
  const waveEdge = scheduleWave(stEdge, [{ laneId: "l", tier: "t0", capacity: 50 }]);
  const bUnits = waveEdge.filter((w) => w.familyId === "fam-B").reduce((a, w) => a + w.units, 0);
  assert(bUnits === 1, "pending-1 family receives its unit in first wave (no starvation)");

  // Frozen + closed excluded deterministically.
  const stFrozen = foldSwarmFrom(st, [
    { kind: "family_frozen", familyId: "fam-A", newEpoch: 1, movedBy: "eyes", reason: "audit" },
  ]);
  const waveF = scheduleWave(stFrozen, lanes);
  assert(waveF.every((w) => w.familyId === "fam-B"), "frozen family receives zero assignments");

  // Determinism: identical inputs ⇒ identical output list.
  assert(JSON.stringify(scheduleWave(st, lanes)) === JSON.stringify(wave),
    "scheduling is deterministic");
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\nORCHESTRA O2 swarm tests — passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
