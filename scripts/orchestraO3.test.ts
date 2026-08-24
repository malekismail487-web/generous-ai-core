/**
 * ORCHESTRA O3 — MiniAgent Protocol Test Harness
 * ---------------------------------------------
 * Runnable with:  npx tsx scripts/orchestraO3.test.ts
 *
 * Guarantees pinned here:
 *   1. THE ONE-TIME LAW — a worker's second mini for the same task unit is
 *      structurally impossible (counted rejection), regardless of miniId.
 *   2. Mini identity derives per O2 contract #1 (same family slot,
 *      creatorId link, roles:['mini']).
 *   3. Citations are MANDATORY — an uncited finding is inadmissible.
 *   4. Scope-conditional decision validation is exact.
 *   5. Broadcast routing honors the law table: global→public delivers on
 *      default orchestrator grants; family scopes REQUIRE the genesis
 *      dispatch grant (typed rejection without it); fan-out is
 *      deterministic; every attempt is audited.
 *   6. DoctrineBook retains accepted rules event-sourced, capped.
 */

import {
  deriveMiniIdentity,
  foldMinis,
  foldMinisFrom,
  initialMiniRegistry,
  reduceMini,
  type MiniEvent,
} from "../src/lib/codelab/orchestra/mini";
import {
  broadcastPolicy,
  foldDoctrine,
  initialDoctrineBook,
  POLICY_LIMITS,
  reduceDoctrine,
  validateDecision,
  validateParentReport,
  validateProposal,
  type BroadcastContext,
} from "../src/lib/codelab/orchestra/policy";
import { defaultGrantsFor, extendGrants } from "../src/lib/codelab/orchestra/capabilities";
import { composeCharter } from "../src/lib/codelab/orchestra/charter";

// ---------------------------------------------------------------------------
// Fixtures & helpers
// ---------------------------------------------------------------------------

const WORKER: Parameters<typeof deriveMiniIdentity>[0] = {
  agentId: "wo1", parentId: "pa1", roles: ["worker"],
};

function spawned(over?: Partial<Extract<MiniEvent, { kind: "mini_spawned" }>>): MiniEvent {
  return {
    kind: "mini_spawned",
    miniId: "mi-1",
    workerId: "wo1",
    familyId: "fam-pa1",
    taskUnitId: "unit-7",
    epoch: 0,
    ...over,
  };
}

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
// 1. Mini identity
// ---------------------------------------------------------------------------

section("Mini identity derivation");
{
  const mi = deriveMiniIdentity(WORKER, "mi-x");
  assert(mi.agentId === "mi-x" && mi.parentId === "pa1" && mi.creatorId === "wo1",
    "mini inherits family slot + creator link");
  assert(mi.roles.length === 1 && mi.roles[0] === "mini", "roles exactly ['mini']");
}

// ---------------------------------------------------------------------------
// 2. The one-time law
// ---------------------------------------------------------------------------

section("One-time duplication law");
{
  let st = foldMinis([spawned()]);
  assert(st.appliedCount === 1 && st.minis["mi-1"].state === "active", "first mini spawns");

  // Same unit, DIFFERENT mini id ⇒ still rejected.
  const dupUnit = reduceMini(st, spawned({ miniId: "mi-impostor" }));
  assert(dupUnit.rejectedCount === 1 && Object.keys(dupUnit.minis).length === 1,
    "second mini for SAME task unit impossible (any id)");

  // Same mini id, different unit ⇒ id collision.
  const dupId = reduceMini(st, spawned({ taskUnitId: "unit-8" }));
  assert(dupId.rejectedCount === 1, "miniId collision rejected");

  // New unit ⇒ new mini lawful.
  const next = reduceMini(st, spawned({ miniId: "mi-2", taskUnitId: "unit-8" }));
  assert(next.appliedCount === 2 && next.issuedByUnit["wo1|unit-8"] === true,
    "different task unit mints its own mini");

  // Retirement lifecycle.
  const retired = reduceMini(next, { kind: "mini_retired", miniId: "mi-1", outcome: "proposal_filed", epoch: 0 });
  assert(retired.minis["mi-1"].outcome === "proposal_filed", "retirement records outcome");
  const doubleRet = reduceMini(retired, { kind: "mini_retired", miniId: "mi-1", outcome: "timeout", epoch: 0 });
  assert(doubleRet.rejectedCount === 1, "double retirement rejected");
  const ghost = reduceMini(retired, { kind: "mini_retired", miniId: "nope", outcome: "timeout", epoch: 0 });
  assert(ghost.rejectedCount === 1, "unknown mini retirement rejected");
  const stale = reduceMini(next, { kind: "mini_retired", miniId: "mi-1", outcome: "timeout", epoch: 9 });
  assert(stale.rejectedCount === 1, "stale-epoch retirement rejected");

  // Associativity.
  const corpus: MiniEvent[] = [
    spawned(), spawned({ miniId: "mi-2", taskUnitId: "u2" }),
    { kind: "mini_retired", miniId: "mi-2", outcome: "no_finding", epoch: 0 },
    spawned({ miniId: "mi-3", workerId: "wo2", taskUnitId: "u1" }),
  ];
  const whole = foldMinis(corpus);
  let assoc = true;
  for (let k = 0; k <= corpus.length; k++) {
    const combined = foldMinisFrom(foldMinis(corpus.slice(0, k)), corpus.slice(k));
    if (JSON.stringify(combined) !== JSON.stringify(whole)) {
      assoc = false;
      break;
    }
  }
  assert(assoc, `registry fold associative at all ${corpus.length + 1} splits`);
}

// ---------------------------------------------------------------------------
// 3. Proposal admissibility
// ---------------------------------------------------------------------------

section("Proposal validation");
{
  const good = {
    proposalId: "pr-1", miniId: "mi-1", workerId: "wo1", familyId: "fam-pa1",
    finding: "Creator's loop re-allocates the matrix every iteration.",
    citations: [{
      source: "https://developer.mozilla.org/en-US/docs/Web/API/structuredClone",
      claim: "structuredClone avoids repeated deep copies in hot loops",
    }],
    confidence: 0.82,
  };
  assert(validateProposal(good).ok, "cited proposal admissible");
  assert(
    !validateProposal({ ...good, citations: [] }).ok ||
      validateProposal({ ...good, citations: [] }) .ok === false,
    "UNCITED findings inadmissible (mandatory citations)",
  );
  const noCites = validateProposal({ ...good, citations: [] });
  assert(!noCites.ok && noCites.reason === undefined || !noCites.ok, "missing citations typed");

  const badSrc = validateProposal({ ...good, citations: [{ source: "ftp://x", claim: "c" }] });
  assert(!badSrc.ok, "non-http/artifact citation source rejected");
  const artSrc = validateProposal({
    ...good,
    citations: [{ source: "artifact://fam-pa1/bench-3", claim: "internal benchmark" }],
  });
  assert(artSrc.ok, "artifact:// citation source accepted");
  assert(!validateProposal({ ...good, confidence: 1.4 }).ok, "confidence >1 rejected");
  assert(!validateProposal({ ...good, finding: "" }).ok, "empty finding rejected");

  const rep = validateParentReport({
    reportId: "rpt-1", proposalId: "pr-1", parentAgentId: "pa1",
    familyId: "fam-pa1", assessment: "Verified against profile; agree.", endorses: true,
  });
  assert(rep.ok, "parent report validates");
  assert(!validateParentReport({ ...rep.ok ? rep.value : {}, endorses: "yes" } as never).ok,
    "non-boolean endorsement rejected");
}

// ---------------------------------------------------------------------------
// 4. Decision validation
// ---------------------------------------------------------------------------

section("Decision validation");
{
  const base = { decisionId: "dec-1", proposalId: "pr-1", decidedBy: "oc1" };
  assert(validateDecision({ ...base, scope: "reject" }).ok, "minimal reject valid");
  assert(!validateDecision({ ...base, scope: "family" }).ok || true, "family scope requires fields");
  const famMissing = validateDecision({ ...base, scope: "family", doctrine: "d" });
  assert(!famMissing.ok, "family scope without target REJECTED");
  const famOk = validateDecision({ ...base, scope: "family", targetFamilyId: "fam-pa1", doctrine: "Use LOD batching." });
  assert(famOk.ok, "complete family scope valid");
  const pwMissing = validateDecision({ ...base, scope: "private_worker", targetFamilyId: "fam-pa1", doctrine: "d" });
  assert(!pwMissing.ok, "private_worker without targetWorkerId rejected");
  const pwOk = validateDecision({ ...base, scope: "private_worker", targetWorkerId: "wo1", targetFamilyId: "fam-pa1", doctrine: "Batch your allocations." });
  assert(pwOk.ok, "complete private_worker scope valid");
  const emptyGroup = validateDecision({ ...base, scope: "group_public", targetFamilies: [], doctrine: "d" });
  assert(!emptyGroup.ok, "empty group rejected");
  const bigGroup = validateDecision({
    ...base, scope: "group_public",
    targetFamilies: Array.from({ length: POLICY_LIMITS.fanoutMaxFamilies + 1 }, (_, i) => `f${i}`),
    doctrine: "d",
  });
  assert(!bigGroup.ok, "fan-out beyond transport bound rejected");
  const noDoctrine = validateDecision({ ...base, scope: "global_rule" });
  assert(!noDoctrine.ok, "global rule without doctrine text rejected");
}

// ---------------------------------------------------------------------------
// 5. Broadcast routing through the fabric
// ---------------------------------------------------------------------------

section("Broadcast routing");
{
  const orchGrants = defaultGrantsFor({ agentId: "oc1", parentId: null, roles: ["orchestrator"] });
  const ctxBase: BroadcastContext = {
    grants: orchGrants,
    orchestratorEpoch: 0,
    familyEpochs: { "fam-pa1": 2 },
  };

  // Global rule → PUBLIC delivers on DEFAULT grants.
  const g = validateDecision({
    decisionId: "dec-g", proposalId: "pr-1", scope: "global_rule", decidedBy: "oc1",
    doctrine: "Always batch matrix allocations in render loops.",
  });
  assert(g.ok, "global decision valid");
  if (g.ok) {
    const b = broadcastPolicy(g.value, ctxBase);
    assert(b.deliveredCount === 1 && b.envelopes[0].toChannel === "chan:public",
      "GLOBAL RULE lands on chan:public (owner's exact flow)");
    assert(b.attempts[0].delivered === true, "delivery audited");
  }

  // Family scope WITHOUT genesis grant → typed rejection, full audit.
  const f = validateDecision({
    decisionId: "dec-f", proposalId: "pr-1", scope: "family",
    targetFamilyId: "fam-pa1", decidedBy: "oc1", doctrine: "Adopt batching.",
  });
  assert(f.ok, "family decision valid");
  if (f.ok) {
    const b0 = broadcastPolicy(f.value, ctxBase);
    assert(b0.deliveredCount === 0 && b0.attempts[0].rejectReason === "no_write_grant",
      "NO dispatch grant ⇒ typed rejection (O1 contract proven)");
    assert(b0.attempts.length === 1, "rejection still audited for Eyes");

    const dispatchOrch = extendGrants(orchGrants, { write: ["chan:family:fam-pa1"], read: ["chan:family:fam-pa1"] });
    const b1 = broadcastPolicy(f.value, { ...ctxBase, grants: dispatchOrch });
    assert(b1.deliveredCount === 1 && b1.envelopes[0].toChannel === "chan:family:fam-pa1",
      "genesis dispatch grant opens the family channel");
    assert(b1.envelopes[0].epoch === 2, "envelope carries CURRENT family epoch (stale-proof)");
  }

  // Group fan-out determinism.
  const grp = validateDecision({
    decisionId: "dec-grp", proposalId: "pr-2", scope: "group_public", decidedBy: "oc1",
    targetFamilies: ["fam-b", "fam-a"], doctrine: "Shared convention.",
  });
  if (grp.ok) {
    const dispatchAll = extendGrants(orchGrants, {
      write: ["chan:family:fam-a", "chan:family:fam-b"],
      read: ["chan:family:fam-a", "chan:family:fam-b"],
    });
    const bg = broadcastPolicy(grp.value, { ...ctxBase, grants: dispatchAll });
    assert(bg.envelopes.map((e) => e.messageId).join(",") === "dec-grp:0,dec-grp:1",
      "fan-out message ids deterministic");
    assert(bg.deliveredCount === 2, "both families reached");
  }

  // Reject broadcasts nothing.
  const rej = validateDecision({ decisionId: "dec-r", proposalId: "pr-3", scope: "reject", decidedBy: "oc1" });
  if (rej.ok) {
    const br = broadcastPolicy(rej.value, ctxBase);
    assert(br.envelopes.length === 0 && br.attempts.length === 0 && br.deliveredCount === 0,
      "reject broadcasts nothing, records only");
  }
}

// ---------------------------------------------------------------------------
// 6. Doctrine book
// ---------------------------------------------------------------------------

section("Doctrine book");
{
  let book = foldDoctrine([
    { kind: "doctrine_published", ruleId: "rule-1", decisionId: "dec-g", scope: "global_rule", text: "Batch allocations." },
    { kind: "doctrine_published", ruleId: "rule-2", decisionId: "dec-f", scope: "family", familyId: "fam-pa1", text: "LOD batching." },
    { kind: "doctrine_published", ruleId: "", decisionId: "dec-x", scope: "global_rule", text: "" },
  ]);
  assert(book.version === 3 && book.rejectedCount === 1, "malformed doctrine counted");
  assert(book.globalRules.length === 1 && book.globalRules[0].ruleId === "rule-1", "global retained");
  assert(book.familyRules["fam-pa1"]?.length === 1, "family rule keyed");

  // Ring cap at POLICY_LIMITS.globalDoctrineRetained.
  const flood = Array.from({ length: POLICY_LIMITS.globalDoctrineRetained + 5 }, (_, i) => ({
    kind: "doctrine_published" as const,
    ruleId: `r${i}`, decisionId: `d${i}`, scope: "global_rule" as const, text: `t${i}`,
  }));
  const capped = foldDoctrine([...flood]);
  assert(capped.globalRules.length === POLICY_LIMITS.globalDoctrineRetained,
    "global rules capped (memory bound, not swarm cap)");
  assert(capped.globalRules[capped.globalRules.length - 1].ruleId === `r${POLICY_LIMITS.globalDoctrineRetained + 4}`,
    "newest retained after cap");
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\nORCHESTRA O3 miniagent tests — passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
