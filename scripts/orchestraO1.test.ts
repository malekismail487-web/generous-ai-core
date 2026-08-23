/**
 * ORCHESTRA O1 — Genesis Pipeline Test Harness
 * -------------------------------------------
 * Runnable with:  npx tsx scripts/orchestraO1.test.ts
 *
 * Guarantees pinned here:
 *   1. Charter composition derives grants ONLY through the O0 law table;
 *      the EXTENSION LAW admits orchestrator dispatch grafts and rejects
 *      all others; every malformed input yields a typed reason.
 *   2. channelLawProbe catches BOTH genesis bug classes: unlawful delivery
 *      AND over-tightened grants; unparseable grant strings fail fast.
 *   3. runGauntlet preserves order, never short-circuits, and its verdict
 *      math (required probes + minScore) is exact.
 *   4. Certificates bind identity↔charter digest; tampering voids them;
 *      activationGate denies without mercy when anything is off.
 *   5. Digest determinism: canonical JSON is key-order independent.
 */

import {
  GENESIS_LIMITS,
  composeCharter,
  firstUnlawfulExtension,
} from "../src/lib/codelab/orchestra/charter";
import {
  channelLawProbe,
  needsRevision,
  runGauntlet,
  type Candidate,
  type Probe,
} from "../src/lib/codelab/orchestra/gauntlet";
import {
  activationGate,
  canonicalJson,
  charterDigest,
  issueActivation,
  verifyActivation,
} from "../src/lib/codelab/orchestra/certificate";
import {
  defaultGrantsFor,
  type AgentIdentity,
} from "../src/lib/codelab/orchestra/capabilities";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PARENT_ID: AgentIdentity = { agentId: "pa1", parentId: null, roles: ["parent"] };
const WORKER_ID: AgentIdentity = { agentId: "wo1", parentId: "pa1", roles: ["worker"] };
const ORCH_ID: AgentIdentity = { agentId: "oc1", parentId: null, roles: ["orchestrator"] };
const MINI_ID: AgentIdentity = { agentId: "mi1", parentId: "pa1", creatorId: "wo1", roles: ["mini"] };

function parentInput() {
  return {
    identity: PARENT_ID,
    mission: "Own the geometry decomposition for the mesh pipeline migration.",
    doctrine: {
      planning: "Decompose along mesh-LOD boundaries; never split a LOD family.",
      delegation: "Every brief names objective, output format, file scope, stop rule.",
      stopConditions: ["3 consecutive probe failures", "budget at 80%"],
    },
    tierByRole: { worker: "fast" as const },
    budget: { maxToolCalls: 500, maxTokenEstimate: 4_000_000 },
    qualification: {
      requiredProbes: ["channel_law" as const, "planning_coverage" as const],
      minScore: 0.7,
    },
  };
}

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
// 1. Charter composition
// ---------------------------------------------------------------------------

section("Charter composition");
{
  const r = composeCharter(parentInput());
  assert(r.ok, "lawful parent charter composes");
  if (r.ok) {
    assert(r.grants.write.includes("chan:family:pa1"), "grants derive from law table (host family)");
    assert(r.grants.read.includes("chan:public"), "public read present");
    assert(!r.grants.write.includes("chan:public"), "no governance write for parents");
  }

  const orchDispatch = composeCharter({
    ...parentInput(),
    identity: ORCH_ID,
    grantExtensions: { write: ["chan:family:pa1"], read: ["chan:family:pa1"] },
  });
  assert(orchDispatch.ok && orchDispatch.charter.identity.agentId === "oc1",
    "orchestrator dispatch graft composes (blueprint §6‡)");
  if (orchDispatch.ok) {
    assert(
      orchDispatch.grants.write.includes("chan:family:pa1"),
      "dispatch grant lands on orchestrator grants",
    );
  }

  const rogueWorker = composeCharter({
    ...parentInput(),
    identity: WORKER_ID,
    grantExtensions: { write: ["chan:family:zz-foreign"] },
  });
  assert(!rogueWorker.ok && rogueWorker.reason === "unlawful_grants",
    "worker cross-family graft REJECTED by extension law");

  const miniForeign = composeCharter({
    ...parentInput(),
    identity: MINI_ID,
    grantExtensions: { read: ["chan:private:stranger"] },
  });
  assert(!miniForeign.ok && miniForeign.reason === "unlawful_grants",
    "mini foreign-private graft rejected");

  const idempotent = composeCharter({
    ...parentInput(),
    identity: WORKER_ID,
    grantExtensions: { write: ["chan:family:pa1"] }, // already held
  });
  assert(idempotent.ok, "idempotent re-grant of held channel is lawful");

  const bads: Array<[Record<string, unknown>, string]> = [
    [{ ...parentInput(), mission: "x".repeat(GENESIS_LIMITS.missionMaxChars + 1) }, "mission_too_long"],
    [{
      ...parentInput(),
      doctrine: { planning: "x".repeat(GENESIS_LIMITS.doctrineFieldMaxChars + 1), delegation: "", stopConditions: [] },
    }, "doctrine_too_long"],
    [{
      ...parentInput(),
      doctrine: {
        planning: "", delegation: "",
        stopConditions: Array.from({ length: GENESIS_LIMITS.stopConditionsMaxItems + 1 }, () => "s"),
      },
    }, "too_many_stop_conditions"],
    [{ ...parentInput(), tierByRole: { worker: "quantum" as never } }, "bad_tier"],
    [{ ...parentInput(), budget: { maxToolCalls: 0, maxTokenEstimate: 0 } }, "bad_budget"],
    [{
      ...parentInput(),
      qualification: { requiredProbes: ["vibes" as never] },
    }, "bad_probe_kind"],
    [{
      ...parentInput(),
      qualification: { requiredProbes: ["channel_law"], minScore: 1.5 },
    }, "bad_min_score"],
  ];
  let allTyped = true;
  for (const [raw, expected] of bads) {
    const r2 = composeCharter(raw as never);
    if (r2.ok || r2.reason !== expected) {
      allTyped = false;
      failures.push(`expected ${expected}, got ${r2.ok ? "ok" : r2.reason}`);
      break;
    }
  }
  assert(allTyped, `all ${bads.length} invalid charters typed correctly`);
}

// ---------------------------------------------------------------------------
// 2. Extension-law direct audit
// ---------------------------------------------------------------------------

section("Extension law audit");
{
  const base = defaultGrantsFor(WORKER_ID);
  assert(
    firstUnlawfulExtension(WORKER_ID, base, { write: ["chan:family:pa9"] }) !== null,
    "audit flags worker foreign-family graft",
  );
  assert(
    firstUnlawfulExtension(WORKER_ID, base, { write: [] }) === null,
    "empty extension audits clean",
  );
}

// ---------------------------------------------------------------------------
// 3. Channel-law probe (executable gauntlet)
// ---------------------------------------------------------------------------

section("Channel-law probe");
{
  const lawfulParent: Candidate = {
    identity: PARENT_ID,
    grants: defaultGrantsFor(PARENT_ID),
  };
  const p1 = channelLawProbe(lawfulParent);
  assert(p1.passed && p1.score === 1, "lawful parent passes structural battery");

  const lawfulOrch: Candidate = { identity: ORCH_ID, grants: defaultGrantsFor(ORCH_ID) };
  assert(channelLawProbe(lawfulOrch).passed, "base orchestrator passes (public dispatch lawful)");

  // Genesis BUG CLASS 1: unlawful delivery — a grafted worker that can write
  // a foreign family. Constructed RAW to simulate the bug composeCharter prevents.
  const rogueWorker: Candidate = {
    identity: WORKER_ID,
    grants: {
      read: [...defaultGrantsFor(WORKER_ID).read],
      write: [...defaultGrantsFor(WORKER_ID).write, "chan:family:zz-foreign"],
    },
  };
  const p2 = channelLawProbe(rogueWorker);
  assert(!p2.passed && p2.evidence.includes("unlawful delivery"),
    "grafted worker FAILS the battery (genesis bug caught)");

  // Genesis BUG CLASS 2: over-tightened grants — lawful route bounces.
  const strippedWorker: Candidate = {
    identity: WORKER_ID,
    grants: { read: ["chan:public"], write: [] },
  };
  const p3 = channelLawProbe(strippedWorker);
  assert(!p3.passed && p3.evidence.includes("lawful route bounced"),
    "over-tightened genesis FAILS (cannot strip tree access)");

  // Unparseable grant hygiene.
  const garbageGrant: Candidate = {
    identity: WORKER_ID,
    grants: { read: ["not-a-channel"], write: [] },
  };
  const p4 = channelLawProbe(garbageGrant);
  assert(!p4.passed && p4.evidence.includes("unparseable"), "garbage grant fails fast");

  // Mini position passes with creator-scoped grants.
  const miniCand: Candidate = { identity: MINI_ID, grants: defaultGrantsFor(MINI_ID) };
  assert(channelLawProbe(miniCand).passed, "mini's up-chain position passes battery");
}

// ---------------------------------------------------------------------------
// 4. Runner semantics
// ---------------------------------------------------------------------------

section("Gauntlet runner");
{
  const calls: string[] = [];
  function fakeProbe(kind: string, ok: boolean, score: number): Probe {
    return {
      kind: kind as Probe["kind"],
      run: () => {
        calls.push(kind);
        return { kind: kind as Probe["kind"], passed: ok, score, evidence: "" };
      },
    };
  }

  const cand: Candidate = { identity: PARENT_ID, grants: defaultGrantsFor(PARENT_ID) };

  // All required pass, minScore met.
  const battery = [
    fakeProbe("channel_law", true, 1),
    fakeProbe("planning_coverage", true, 0.8),
    fakeProbe("budget_discipline", false, 0.2),
  ];
  const report = runGauntlet(cand, battery, ["channel_law", "planning_coverage"], 0.7);
  assert(calls.join(",") === "channel_law,planning_coverage,budget_discipline",
    "battery order preserved; advisory probe still ran (no short-circuit)");
  assert(report.passed, "required-pass + minScore met ⇒ pass (advisory failure ignored)");
  assert(Math.abs(report.meanRequiredScore - 0.9) < 1e-9, "mean over REQUIRED probes only");

  // minScore gate.
  const reportB = runGauntlet(cand, [
    fakeProbe("channel_law", true, 0.6),
    fakeProbe("planning_coverage", true, 0.6),
  ], ["channel_law", "planning_coverage"], 0.8);
  assert(!reportB.passed && reportB.failedKinds.length === 0,
    "all-probes-pass but minScore unmet ⇒ overall fail");

  // Revision work list in battery order (battery ran planning first).
  const reportC = runGauntlet(cand, [
    fakeProbe("planning_coverage", false, 0.1),
    fakeProbe("channel_law", false, 0),
  ], ["channel_law", "planning_coverage"]);
  assert(
    needsRevision(reportC).join(",") === "planning_coverage,channel_law",
    "needsRevision lists failures in BATTERY order (work list)",
  );
}

// ---------------------------------------------------------------------------
// 5. Certificates & the activation gate
// ---------------------------------------------------------------------------

section("Certificates");
{
  const c1 = composeCharter(parentInput());
  assert(c1.ok, "charter composes for cert tests");
  if (!c1.ok) throw new Error("fixture broken");

  // Digest determinism + key-order independence.
  const d1 = charterDigest(c1.charter);
  const reordered = JSON.parse(JSON.stringify(c1.charter));
  const d2 = charterDigest(reordered);
  assert(d1 === d2, "digest stable across serialization round-trip");
  const a = { x: 1, y: { b: 2, a: 1 } };
  const b = { y: { a: 1, b: 2 }, x: 1 };
  assert(canonicalJson(a) === canonicalJson(b), "canonicalJson is key-order independent");
  const d3 = charterDigest({ ...c1.charter, mission: `${c1.charter.mission}!` });
  assert(d3 !== d1, "any charter mutation changes digest");

  // Issuance.
  const iss = issueActivation({ certId: "cert-pa1-001", charter: c1.charter, issuerId: "oc1", epoch: 0 });
  assert(iss.ok, "activation issues after attested pass");
  if (!iss.ok) throw new Error("fixture broken");
  assert(iss.certificate.charterDigest === d1, "certificate binds exact charter digest");

  const badIss = [
    [{ certId: "", charter: c1.charter, issuerId: "oc1", epoch: 0 }, "bad_cert_id"],
    [{ certId: "c1", charter: c1.charter, issuerId: "", epoch: 0 }, "bad_issuer"],
    [{ certId: "c1", charter: c1.charter, issuerId: "oc1", epoch: -2 }, "bad_epoch"],
  ] as const;
  let typedIss = true;
  for (const [params, expected] of badIss) {
    const r = issueActivation(params as never);
    if (r.ok || r.reason !== expected) {
      typedIss = false;
      failures.push(`issuance expected ${expected}, got ${r.ok ? "ok" : r.reason}`);
      break;
    }
  }
  assert(typedIss, `all ${badIss.length} bad issuances typed correctly`);

  // Verification & tampering.
  assert(verifyActivation(iss.certificate, c1.charter).allowed, "fresh certificate verifies");
  const tamperedCharter = { ...c1.charter, mission: "mutated after certification" };
  const vTam = verifyActivation(iss.certificate, tamperedCharter);
  assert(!vTam.allowed && vTam.reason === "digest_mismatch",
    "charter mutation VOIDS certificate");

  const otherIdentity = { ...PARENT_ID, agentId: "pa2" };
  const otherCharter = { ...c1.charter, identity: otherIdentity };
  const vId = verifyActivation(iss.certificate, otherCharter);
  assert(!vId.allowed && vId.reason === "identity_mismatch",
    "wrong identity rejected (identity check precedes digest)");

  // THE GATE.
  assert(activationGate(iss.certificate, c1.charter).allowed, "gate opens for certified+matching");
  assert(
    !activationGate(null, c1.charter).allowed &&
      activationGate(undefined, c1.charter).allowed === false,
    "gate slams shut with NO certificate",
  );
  const g = activationGate(iss.certificate, tamperedCharter);
  assert(!g.allowed && g.reason === "digest_mismatch", "gate enforces digest binding forever");
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\nORCHESTRA O1 genesis tests — passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
