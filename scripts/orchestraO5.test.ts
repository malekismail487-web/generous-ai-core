/**
 * ORCHESTRA O5 — Eyes Oversight Test Harness
 * -----------------------------------------
 * Runnable with:  npx tsx scripts/orchestraO5.test.ts
 *
 * Guarantees pinned here:
 *   1. Findings are EVIDENCE-OR-INADMISSIBLE; dimensions/severities fixed.
 *   2. Detectors fire on exact published thresholds — boundary-exact on
 *      both sides (3.0x fires, 2.99x silent; rate 0.5 fires, 0.49 silent).
 *   3. No-baseline humility: zero-estimate budget ⇒ NO finding (null),
 *      never a fabricated judgment.
 *   4. THE DELIVERY GATE (Design Law #6): both keys required; any weak
 *      rubric dimension fails the whole assessment; inconclusive verifier
 *      blocks delivery.
 *   5. Freeze motions produce exact O2 events (newEpoch = current + 1),
 *      evidence-mandatory, automatic ONLY for safety tripwires.
 */

import {
  EYES_THRESHOLDS,
  RUBRIC_DIMENSIONS,
  assessEndState,
  detectBudgetRunaway,
  detectDriftReview,
  detectEscalationStorm,
  detectRejectionSpike,
  detectSpawnSpike,
  deliveryGate,
  fileFreezeMotion,
  validateFinding,
} from "../src/lib/codelab/orchestra/eyes";
import type { FamilyState } from "../src/lib/codelab/orchestra/swarm";

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

function family(over?: Partial<FamilyState>): FamilyState {
  return {
    familyId: "fam-t",
    founded: true,
    parentAgentId: "pa1",
    certId: "cert-1",
    digest: "d",
    epoch: 0,
    spawnedCount: 0,
    completedCount: 0,
    completedByTier: { t0: 0, t1: 0, t2: 0 },
    escalations: 0,
    tokensBurned: 0,
    toolCallsBurned: 0,
    frozen: false,
    closedSummaryRef: null,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// 1. Finding admissibility
// ---------------------------------------------------------------------------

section("Finding admissibility");
{
  const good = {
    findingId: "f-1", observerId: "ey1", familyId: "fam-t",
    dimension: "anomaly", severity: "concern",
    claim: "escalation pattern observed",
    evidenceRefs: ["artifact://oversight/x/1"],
  };
  assert(validateFinding(good).ok, "evidence-backed finding admissible");
  const noEv = validateFinding({ ...good, evidenceRefs: [] });
  assert(!noEv.ok, "VIBES INADMISSIBLE (empty evidence)");
  const badRef = validateFinding({ ...good, evidenceRefs: ["trust me"] });
  assert(!badRef.ok, "invalid ref format rejected");
  const badSev = validateFinding({ ...good, severity: "meh" });
  assert(!badSev.ok, "severity fixed vocabulary");
  const badDim = validateFinding({ ...good, dimension: "vibes" });
  assert(!badDim.ok, "dimension fixed vocabulary");
}

// ---------------------------------------------------------------------------
// 2. Detectors — boundary-exact
// ---------------------------------------------------------------------------

section("Budget runaway detector");
{
  const plan = { estimatedTokens: 1000 };
  assert(detectBudgetRunaway(family({ tokensBurned: 2999 }), plan) === null,
    "2.999x silent");
  const c30 = detectBudgetRunaway(family({ tokensBurned: 3000 }), plan);
  assert(c30 !== null && c30.severity === "concern", "exactly 3x ⇒ concern");
  const u10 = detectBudgetRunaway(family({ tokensBurned: 10_000 }), plan);
  assert(u10 !== null && u10.severity === "urgent", "exactly 10x ⇒ urgent");
  assert(detectBudgetRunaway(family({ tokensBurned: 999_999 }), { estimatedTokens: 0 }) === null,
    "NO baseline ⇒ no judgment (humility law)");
}

section("Escalation storm detector");
{
  const noOutput = family({ spawnedCount: 10, completedCount: 0, escalations: 3 });
  assert(detectEscalationStorm(noOutput)?.severity === "urgent",
    `${EYES_THRESHOLDS.stormNoOutputMin} escalations with ZERO output ⇒ urgent`);
  assert(detectEscalationStorm(family({ escalations: 2, completedCount: 0 })) === null,
    "below no-output floor silent");

  const rate = family({ spawnedCount: 100, completedCount: 10, escalations: 5 });
  assert(detectEscalationStorm(rate)?.severity === "urgent", "rate exactly 0.5 ⇒ storm");
  assert(detectEscalationStorm(family({ completedCount: 10, escalations: 4 })) === null,
    "rate 0.4 silent");
}

section("Spawn spike detector");
{
  const spike = family({ spawnedCount: 100_000, completedCount: 10 });
  assert(detectSpawnSpike(spike)?.severity === "concern",
    "10000:1 ratio past floor ⇒ over-spawning finding");
  assert(detectSpawnSpike(family({ spawnedCount: 99, completedCount: 0 })) === null,
    "below absolute floor silent (tiny-case noise guard)");
  assert(detectSpawnSpike(family({ spawnedCount: 5000, completedCount: 50 })) === null,
    "healthy 100:1 ratio silent");
}

section("Rejection audit");
{
  assert(
    detectRejectionSpike("router", 24, 8)?.severity === "concern",
    "8/32 = exactly 0.25 ⇒ concern",
  );
  assert(detectRejectionSpike("router", 100, 7) === null, "below sample floor silent");
  assert(detectRejectionSpike("router", 100, 2) === null, "healthy rate silent");
}

section("Drift review auto-finding");
{
  const f = detectDriftReview(
    { helpedRatio: 1 / 3, records: 3, reviewRequired: true },
    "v-9",
  );
  assert(f?.severity === "urgent" && f.evidenceRefs[0] === "artifact://adp/drift/v-9",
    "reviewRequired ⇒ automatic URGENT finding with ADP citation");
  assert(detectDriftReview({ helpedRatio: null, records: 0, reviewRequired: false }, "v-1") === null,
    "clean drift silent");
}

// ---------------------------------------------------------------------------
// 3. End-state assessment & THE DELIVERY GATE
// ---------------------------------------------------------------------------

section("End-state rubric & Delivery Gate");
{
  const perfectScores = Object.fromEntries(
    RUBRIC_DIMENSIONS.map((d) => [d, 0.9]),
  ) as Record<(typeof RUBRIC_DIMENSIONS)[number], number>;
  const base = {
    assessmentId: "as-1", observerId: "ey1", familyId: "fam-t",
    goalRef: "artifact://goal/1", artifactRef: "artifact://final/1",
    scores: perfectScores,
    evidenceRefs: ["artifact://oversight/final/1"],
  };

  const good = assessEndState(base);
  assert(good.ok && good.value.passed && Math.abs(good.value.meanScore - 0.9) < 1e-9,
    "uniform .9 passes; mean exact");

  // One weak dimension fails EVERYTHING (human-reviewer strictness).
  const weak = { ...perfectScores, honesty: EYES_THRESHOLDS.endStateFloor - 0.01 };
  const w = assessEndState({ ...base, scores: weak });
  assert(w.ok && !w.value.passed, "single dimension below floor ⇒ assessment FAILED");

  // Boundary: exactly at floor passes.
  const edge = { ...perfectScores, craft: EYES_THRESHOLDS.endStateFloor };
  const e = assessEndState({ ...base, scores: edge });
  assert(e.ok && e.value.passed, "exactly-at-floor passes");

  // Bad scores typed.
  assert(!assessEndState({ ...base, scores: { ...perfectScores, correctness: 1.2 } }).ok,
    "out-of-range score rejected");
  assert(!assessEndState({ ...base, evidenceRefs: [] }).ok, "assessment needs evidence too");

  // THE GATE matrix.
  assert(deliveryGate(base, "pass").allowed, "BOTH keys green ⇒ deliverable");
  assert(!deliveryGate(null, "pass").allowed, "no assessment ⇒ NO delivery");
  assert(
    (deliveryGate({ ...base, scores: weak }, "pass") as { reason?: string }).reason === "assessment_failed",
    "failed assessment blocks despite verifier pass",
  );
  assert(
    (deliveryGate(base, "inconclusive") as { reason?: string }).reason === "verifier_not_pass",
    "inconclusive verifier BLOCKS (absence of evidence ≠ success)",
  );
  assert(
    (deliveryGate(base, "fail") as { reason?: string }).reason === "verifier_not_pass",
    "failed verifier blocks",
  );
}

// ---------------------------------------------------------------------------
// 4. Freeze motions
// ---------------------------------------------------------------------------

section("Freeze motions");
{
  const m = fileFreezeMotion({
    motionId: "mo-1", familyId: "fam-t", currentEpoch: 4,
    reason: "safety_tripwire", evidenceRefs: ["artifact://oversight/trip/1"],
  });
  assert(m.ok && m.event.newEpoch === 5 && m.event.movedBy === "eyes",
    "motion yields EXACT O2 event (epoch+1)");
  assert(m.ok && m.automatic === true, "safety tripwire is AUTOMATIC");

  const drift = fileFreezeMotion({
    motionId: "mo-2", familyId: "fam-t", currentEpoch: 4,
    reason: "drift_review", evidenceRefs: ["artifact://adp/drift/v-9"],
  });
  assert(drift.ok && drift.automatic === false, "non-tripwire requires confirmation");

  const noEv = fileFreezeMotion({
    motionId: "mo-3", familyId: "fam-t", currentEpoch: 4,
    reason: "anomaly_pattern", evidenceRefs: [],
  });
  assert(!noEv.ok, "evidence-less motion rejected");
  const badReason = fileFreezeMotion({
    motionId: "mo-4", familyId: "fam-t", currentEpoch: 4,
    reason: "bad vibes" as never, evidenceRefs: ["log:1"],
  });
  assert(!badReason.ok, "reason fixed vocabulary");
  const skipEpoch = fileFreezeMotion({
    motionId: "mo-5", familyId: "fam-t", currentEpoch: 4.5,
    reason: "budget_runaway", evidenceRefs: ["log:2"],
  });
  assert(!skipEpoch.ok, "non-integer epoch rejected");
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\nORCHESTRA O5 eyes tests — passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
