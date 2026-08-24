/**
 * ORCHESTRA O4 — Adversarial Deliberation Protocol Test Harness
 * ------------------------------------------------------------
 * Runnable with:  npx tsx scripts/orchestraO4.test.ts
 *
 * Guarantees pinned here (numbers HAND-COMPUTED against RUBRIC):
 *   1. Panel lifecycle: quorum enforcement, one-position-per-role,
 *      one-challenge-per-(challenger,target), no self-challenges,
 *      evidence-or-inadmissible on BOTH positions and challenges.
 *   2. Synthesis math exact: weighted means, spread-based confidence,
 *      upheld-challenge deltas, open-challenge penalties, scope table.
 *   3. Verdicts are DIGEST-BOUND — a tampered synthesis cannot land.
 *   4. Dissents preserved exactly (stance ≠ outcome).
 *   5. Calibration loop measures drift honestly (null ≠ zero).
 */

import {
  EXAMINER_ROLES,
  RUBRIC,
  driftFor,
  foldAdp,
  foldAdpFrom,
  initialAdp,
  reduceAdp,
  requiresFullPanel,
  synthesize,
  synthesizeLowStakes,
  type AdpEvent,
  type ExaminerPosition,
} from "../src/lib/codelab/orchestra/adp";
import { validateDecision } from "../src/lib/codelab/orchestra/policy";

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

let n = 0;
function pos(role: typeof EXAMINER_ROLES[number], score: number, stance: ExaminerPosition["stance"], delib = "d1"): ExaminerPosition {
  return {
    positionId: `pos-${++n}`,
    deliberationId: delib,
    role,
    stance,
    score,
    rationale: `${role} assessment (bounded, structured)`,
    evidenceRefs: [`artifact://fam-pa1/ev-${n}`],
  };
}

const PANEL: ExaminerPosition[] = [
  pos("feasibility", 0.8, "accept"),
  pos("evidence_auditor", 0.9, "accept"),
  pos("novelty_scout", 0.5, "revise"),
  pos("cost_physicist", 0.7, "accept"),
  pos("advocate", 0.9, "accept"),
];

function opened(id: string): AdpEvent {
  return { kind: "deliberation_opened", deliberationId: id, proposalId: "pr-1", stakes: "high" };
}

// ---------------------------------------------------------------------------
// 1. Lifecycle laws
// ---------------------------------------------------------------------------

section("Deliberation lifecycle");
{
  let st = foldAdp([
    opened("d1"),
    ...PANEL.map((p) => ({ kind: "position_filed", position: p } as AdpEvent)),
  ]);
  assert(st.cases["d1"].positions.length === 5, "all five roles filed");

  // Duplicate role rejected.
  const dup = reduceAdp(st, { kind: "position_filed", position: pos("feasibility", 0.1, "reject") });
  assert(dup.rejectedCount === 1 && dup.cases["d1"].positions.length === 5,
    "one position per ROLE enforced");

  // Uncited position inadmissible.
  const uncited = reduceAdp(st, {
    kind: "position_filed",
    position: { ...PANEL[0], positionId: "pos-x", evidenceRefs: [] },
  });
  assert(uncited.rejectedCount === 1, "UNCITED position inadmissible");

  // Challenges: valid, self-, duplicate, unknown-target, evidence-less.
  const targetNovel = st.cases["d1"].positions.find((p) => p.role === "novelty_scout")!;
  st = reduceAdp(st, {
    kind: "challenge_filed",
    challenge: {
      challengeId: "ch-1", deliberationId: "d1", challengerRole: "feasibility",
      targetPositionId: targetNovel.positionId, grounds: "Known technique since 2023",
      evidenceRef: "https://arxiv.org/abs/2401.00000",
    },
  });
  assert(st.cases["d1"].challenges.length === 1, "evidence-backed challenge filed");

  const selfChal = reduceAdp(st, {
    kind: "challenge_filed",
    challenge: {
      challengeId: "ch-2", deliberationId: "d1", challengerRole: "novelty_scout",
      targetPositionId: targetNovel.positionId, grounds: "self", evidenceRef: "log:12",
    },
  });
  assert(selfChal.rejectedCount === 1, "self-challenge rejected");

  const dupPair = reduceAdp(st, {
    kind: "challenge_filed",
    challenge: {
      challengeId: "ch-3", deliberationId: "d1", challengerRole: "feasibility",
      targetPositionId: targetNovel.positionId, grounds: "again", evidenceRef: "log:13",
    },
  });
  assert(dupPair.rejectedCount === 1, "second challenge same pair rejected");

  const noEv = reduceAdp(st, {
    kind: "challenge_filed",
    challenge: {
      challengeId: "ch-4", deliberationId: "d1", challengerRole: "advocate",
      targetPositionId: targetNovel.positionId, grounds: "vibes",
      evidenceRef: "trust me",
    },
  });
  assert(noEv.rejectedCount === 1 && noEv.cases["d1"].challenges.length === 1,
    "evidence-less challenge invalid");

  const ghostTarget = reduceAdp(st, {
    kind: "challenge_filed",
    challenge: {
      challengeId: "ch-5", deliberationId: "d1", challengerRole: "advocate",
      targetPositionId: "pos-ghost", grounds: "g", evidenceRef: "log:14",
    },
  });
  assert(ghostTarget.rejectedCount === 1, "unknown target rejected");
}

// ---------------------------------------------------------------------------
// 2. Synthesis math (hand-computed)
// ---------------------------------------------------------------------------

section("Verdict math vs hand computation");
{
  let st = foldAdp([
    opened("d1"),
    ...PANEL.map((p) => ({ kind: "position_filed", position: p } as AdpEvent)),
    {
      kind: "challenge_filed",
      challenge: {
        challengeId: "ch-n", deliberationId: "d1", challengerRole: "feasibility",
        targetPositionId: "pos-3", grounds: "prior art", evidenceRef: "https://acme.dev/post",
      },
    },
    { kind: "challenge_resolved", deliberationId: "d1", challengeId: "ch-n", upheld: true },
    {
      kind: "challenge_filed",
      challenge: {
        challengeId: "ch-c", deliberationId: "d1", challengerRole: "advocate",
        targetPositionId: "pos-4", grounds: "budget optimistic", evidenceRef: "artifact://cost/model",
      },
    },
    // ch-c left OPEN on purpose.
  ]);

  // Hand computation:
  // effective: feas .8 · audit .9 · novel .5−.1=.4 · cost .7 · adv .9
  // weighted  = .25(.8)+.25(.9)+.15(.4)+.15(.7)+.20(.9) = .77
  // spread    = .9−.4 = .5 ⇒ confRaw .5 ; one OPEN challenge ⇒ −.05 ⇒ .45
  const c = st.cases["d1"];
  const v = synthesize(c, "verdict-d1");
  assert(v.ok, "quorum met ⇒ synthesizable");
  if (v.ok) {
    assert(Math.abs(v.value.meanWeightedScore - 0.77) < 1e-9,
      `weighted mean exact (${v.value.meanWeightedScore})`);
    assert(Math.abs(v.value.confidence - 0.45) < 1e-9,
      `confidence exact with uphold delta + open penalty (${v.value.confidence})`);
    assert(v.value.outcome === "accept" && v.value.recommendedScope === "family",
      "accept at .77 ≥ .66; conf .45 < .8 ⇒ family scope rec");
    assert(
      v.value.dissents.length === 1 &&
        v.value.dissents[0].role === "novelty_scout" &&
        v.value.dissents[0].stance === "revise",
      "single dissent preserved verbatim-bounded",
    );

    // Digest-bound landing; tampered copy rejected by reducer.
    st = reduceAdp(st, { kind: "verdict_synthesized", verdict: v.value });
    assert(st.cases["d1"].phase === "synthesized", "verdict lands");

    // Precise forgery check: same verdict content EXCEPT confidence mutated
    // ⇒ digest mismatch ⇒ reducer refuses to land it.
    const preState = foldAdp([
      opened("d1"),
      ...PANEL.map((p) => ({ kind: "position_filed", position: p } as AdpEvent)),
    ]);
    const forged = reduceAdp(preState, {
      kind: "verdict_synthesized",
      verdict: { ...v.value, confidence: 0.99 },
    });
    assert(forged.rejectedCount === 1, "digest mismatch ⇒ forged verdict REJECTED");

    // Post-synthesis filings rejected; resynthesis impossible.
    const latePos = reduceAdp(st, { kind: "position_filed", position: pos("feasibility", 1, "accept") });
    assert(latePos.rejectedCount === 1, "no filings after synthesis");
    const again = synthesize(st.cases["d1"], "verdict-2");
    assert(!again.ok, "case already synthesized ⇒ no resynthesis");
  }

  // Quorum failure typed.
  const short = foldAdp([
    opened("d2"),
    { kind: "position_filed", position: PANEL[0] },
    { kind: "position_filed", position: PANEL[1] },
    { kind: "position_filed", position: PANEL[2] },
    { kind: "position_filed", position: PANEL[3] },
  ]);
  const vs = synthesize(short.cases["d2"], "verdict-short");
  assert(!vs.ok, "four-of-five roles ⇒ NO verdict (panel quorum strict)");
}

// ---------------------------------------------------------------------------
// 3. Low-stakes fallback + stakes seam
// ---------------------------------------------------------------------------

section("Low-stakes single-judge path");
{
  assert(requiresFullPanel("high") && !requiresFullPanel("low"), "stakes seam maps correctly");
  const low = synthesizeLowStakes({
    deliberationId: "d-low", proposalId: "pr-9", judgeScore: 0.9,
    stance: "accept", verdictId: "v-low",
  });
  assert(low.ok && low.value.outcome === "accept", "high single-judge score accepts");
  assert(low.ok && low.value.confidence === 0.5, "single-judge confidence CEILING 0.5");
  assert(low.ok && low.value.recommendedScope === "global_rule", "score ≥.8 recommends global");
  const bad = synthesizeLowStakes({
    deliberationId: "d-low", proposalId: "pr-9", judgeScore: 7,
    stance: "accept", verdictId: "v-low2",
  });
  assert(!bad.ok, "out-of-range judge score rejected");
}

// ---------------------------------------------------------------------------
// 4. Calibration loop (honest drift)
// ---------------------------------------------------------------------------

section("Calibration & drift");
{
  let st = foldAdp([
    opened("d1"),
    ...PANEL.map((p) => ({ kind: "position_filed", position: p } as AdpEvent)),
  ]);
  const c = st.cases["d1"];
  const v = synthesize(c, "v-cal");
  assert(v.ok, "synthesize for calibration");
  if (!v.ok) throw new Error("fixture broken");
  st = reduceAdp(st, { kind: "verdict_synthesized", verdict: v.value });

  const ghost = reduceAdp(st, { kind: "calibration_recorded", verdictId: "nope", realized: "helped" });
  assert(ghost.rejectedCount === 1, "calibration on unknown verdict rejected");

  st = reduceAdp(st, { kind: "calibration_recorded", verdictId: "v-cal", realized: "helped" });
  st = reduceAdp(st, { kind: "calibration_recorded", verdictId: "v-cal", realized: "harmed" });
  st = reduceAdp(st, { kind: "calibration_recorded", verdictId: "v-cal", realized: "unresolved" });

  const d = driftFor(st, "v-cal");
  assert(d.records === 3, "all calibration records retained");
  assert(d.helpedRatio !== null && Math.abs(d.helpedRatio - 0.5) < 1e-9,
    "unresolved EXCLUDED from ratio (absence ≠ success)");
  assert(!d.reviewRequired, ".5 ratio does NOT trip review floor (< .5)");

  st = reduceAdp(st, { kind: "calibration_recorded", verdictId: "v-cal", realized: "harmed" });
  const d2 = driftFor(st, "v-cal");
  assert(Math.abs((d2.helpedRatio ?? 1) - 1 / 3) < 1e-9 && d2.reviewRequired,
    "drift below floor FLAGS DOCTRINE REVIEW");
}

// ---------------------------------------------------------------------------
// 5. O3 integration + fold associativity
// ---------------------------------------------------------------------------

section("O3 integration & folds");
{
  let st = foldAdp([
    opened("d1"),
    ...PANEL.map((p) => ({ kind: "position_filed", position: p } as AdpEvent)),
  ]);
  const v = synthesize(st.cases["d1"], "v-int");
  assert(v.ok && validateDecision({
    decisionId: "dec-from-adp",
    proposalId: "pr-1",
    decidedBy: "oc1",
    scope: v.value.recommendedScope === "reject" ? "reject" : "family",
    ...(v.value.recommendedScope === "reject" ? {} : { targetFamilyId: "fam-pa1" }),
    doctrine: "Doctrine from panel.",
  }).ok, "ADP scope recommendation flows into O3 PolicyDecision cleanly");

  // Associativity across ALL event kinds.
  const corpus: AdpEvent[] = [
    opened("dA"),
    ...PANEL.map((p) => ({ kind: "position_filed", position: p } as AdpEvent)),
    {
      kind: "challenge_filed",
      challenge: {
        challengeId: "chz", deliberationId: "dA", challengerRole: "cost_physicist",
        targetPositionId: "pos-1", grounds: "cheaper exists", evidenceRef: "artifact://c/1",
      },
    },
    { kind: "challenge_resolved", deliberationId: "dA", challengeId: "chz", upheld: false },
    { kind: "calibration_recorded", verdictId: "unused", realized: "neutral" }, // counted rejection
  ];
  const whole = foldAdp(corpus);
  let assoc = true;
  for (let k = 0; k <= corpus.length; k++) {
    const combined = foldAdpFrom(foldAdp(corpus.slice(0, k)), corpus.slice(k));
    if (JSON.stringify(combined) !== JSON.stringify(whole)) {
      assoc = false;
      failures.push(`adp associativity broke at k=${k}`);
      break;
    }
  }
  assert(assoc, `fold associative at all ${corpus.length + 1} splits`);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\nORCHESTRA O4 ADP tests — passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
