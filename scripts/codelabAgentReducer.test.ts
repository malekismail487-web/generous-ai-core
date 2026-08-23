/**
 * CodeLab Agent Phase 0 — Session State Reducer Test Harness
 * ---------------------------------------------------------
 * Runnable with:  bun run scripts/codelabAgentReducer.test.ts
 *
 * Guarantees pinned here:
 *   1. Purity — reduce never mutates inputs; frozen collections survive.
 *   2. Determinism — identical corpora fold to structurally equal states.
 *   3. Associativity — fold(a ++ b) == foldFrom(fold(a), b) at every split.
 *   4. Envelope discipline — cross-session throw; non-increasing seq and
 *      stale epochs are counted rejections, never corruption.
 *   5. Per-kind semantics — goal/status/plan ops/tool lifecycle/deltas/
 *      errors/first-done-wins/abort generations.
 *   6. Verifier slice isolation (directive 3) — verification events touch
 *      ONLY state.verification; actor fields bit-identical before/after.
 *   7. Ring bounds — timeline, status ring, verifier runs capped; newest
 *      retained; totals keep counting beyond the caps.
 *   8. Verifier projection — buildVerifierInput exposes the minimal view;
 *      aggregateVerdict rules incl. expected-channel downgrade.
 */

import {
  LIMITS,
  type AgentEvent,
  type AgentEventDraft,
} from "../src/lib/codelab/agent/types";
import {
  applyPlanOps,
  fold,
  foldFrom,
  initialState,
  openCallCount,
  reduce,
  statesEqual,
} from "../src/lib/codelab/agent/reducer";
import {
  aggregateVerdict,
  buildVerifierInput,
  uniformEvidence,
} from "../src/lib/codelab/verifier/types";

// ---------------------------------------------------------------------------
// Deterministic factories
// ---------------------------------------------------------------------------

const SESSION = "agent-p0";

function makeEnvelope() {
  let seq = 0;
  return (epoch: number) => ({ sessionId: SESSION, seq: ++seq, epoch });
}

let env = makeEnvelope();
function resetEnv() {
  env = makeEnvelope();
}

function ev(epoch: number, draft: AgentEventDraft): AgentEvent {
  return { ...draft, ...env(epoch) } as AgentEvent;
}

/**
 * Rich corpus covering every kind, both plan mutations, a tool lifecycle,
 * an abort generation boundary, and post-abort stale traffic.
 */
function buildCorpus(): AgentEvent[] {
  resetEnv();
  return [
    ev(0, { kind: "goal_set", goal: "Build a pomodoro widget.", acceptance: ["runs clean"] }),
    ev(0, { kind: "status", phase: "recon", rationale: "Inspecting starter files" }),
    ev(0, {
      kind: "plan_update",
      ops: [{
        op: "replace",
        steps: [
          { id: "s1", title: "Recon" },
          { id: "s2", title: "Timer logic" },
          { id: "s3", title: "Style" },
        ],
      }],
    }),
    ev(0, {
      kind: "plan_update",
      ops: [{ op: "set_status", stepId: "s1", status: "done" }],
    }),
    ev(0, { kind: "tool_call", callId: "c1", tool: "read_file", argsJson: '{"path":"index.html"}' }),
    ev(0, { kind: "tool_result", callId: "c1", ok: true, summary: "read ok" }),
    ev(0, { kind: "file_delta", path: "app.js", op: "write", contentAfter: "// timer\n" }),
    ev(0, { kind: "status", phase: "verifying", rationale: "Running preview checks" }),
    ev(0, {
      kind: "verification",
      runId: "v1",
      verdict: "fail",
      channels: [{ channel: "runtime", status: "fail", detail: "TypeError in app.js:2" }],
      assessment: "Timer start throws on null element.",
    }),
    ev(0, { kind: "status", phase: "failure_diagnosed", rationale: "Null element before init" }),
    ev(0, { kind: "file_delta", path: "app.js", op: "write", contentAfter: "// timer fixed\n" }),
    ev(0, {
      kind: "verification",
      runId: "v2",
      verdict: "pass",
      channels: [
        { channel: "syntax", status: "pass", detail: "" },
        { channel: "runtime", status: "pass", detail: "" },
      ],
      assessment: "Clean.",
    }),
    ev(0, { kind: "error", scope: "transport", message: "one dropped frame" }),
    ev(0, { kind: "done", summary: "Pomodoro widget built." }),

    // Abort to generation 1...
    ev(0, { kind: "aborted", newEpoch: 1, reason: "student pressed stop" }),
    // ...then STALE generation-0 traffic must be rejected:
    ev(0, { kind: "status", phase: "editing", rationale: "stale straggler" }),
    ev(0, { kind: "tool_call", callId: "c9", tool: "run_js", argsJson: "{}" }),
    // ...and new-generation work applies normally:
    ev(1, { kind: "status", phase: "recon", rationale: "Restarting after stop" }),
    ev(1, { kind: "done", summary: "Second attempt completed." }),
  ];
}

// ---------------------------------------------------------------------------
// Assertion helpers
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
// 1. Purity
// ---------------------------------------------------------------------------

section("Purity");
{
  const events = buildCorpus().slice(0, 8);
  const s0 = initialState(SESSION);
  const s0Snapshot = JSON.stringify([s0.calls.length, s0.fileDeltas.length]);
  const s1 = reduce(s0, events[0]);
  const s2 = reduce(s1, events[1]);
  assert(s0.version === 0 && s0.appliedCount === 0, "input state untouched by first reduce");
  assert(s1 !== s0 && s2 !== s1, "reduce returns fresh objects");
  assert(
    JSON.stringify([s0.calls.length, s0.fileDeltas.length]) === s0Snapshot,
    "initial collections unchanged after reduces",
  );
}

// ---------------------------------------------------------------------------
// 2. Determinism
// ---------------------------------------------------------------------------

section("Determinism");
{
  const corpus = buildCorpus();
  const a = fold(SESSION, corpus);
  const b = fold(SESSION, corpus);
  assert(statesEqual(a, b), "two folds over identical corpora are equal");
  assert(a.version === corpus.length, "version counts every reduced event");
  assert(a.appliedCount + a.rejectedCount === a.version, "applied + rejected == version");
  assert(a.rejectedCount === 2, `exactly the 2 stale events rejected (got ${a.rejectedCount})`);
  assert(a.doneSummary === "Pomodoro widget built.", "first done wins across generations");
}

// ---------------------------------------------------------------------------
// 3. Associativity over every split point
// ---------------------------------------------------------------------------

section("Associativity of fold");
{
  const events = buildCorpus();
  const whole = fold(SESSION, events);
  let allEqual = true;
  for (let k = 0; k <= events.length; k++) {
    const left = fold(SESSION, events.slice(0, k));
    const combined = foldFrom(left, events.slice(k));
    if (!statesEqual(whole, combined)) {
      allEqual = false;
      failures.push(`associativity broke at split k=${k}`);
      break;
    }
  }
  assert(allEqual, `fold associativity holds at all ${events.length + 1} split points`);
}

// ---------------------------------------------------------------------------
// 4. Envelope discipline
// ---------------------------------------------------------------------------

section("Envelope discipline");
{
  // Cross-session contamination throws (LSE parity).
  let threw = false;
  try {
    reduce(initialState("other-session"), ev(0, { kind: "done", summary: "x" }));
  } catch (err) {
    threw = err instanceof Error && err.message.includes("sessionId mismatch");
  }
  assert(threw, "foreign sessionId throws descriptively");

  // Non-increasing seq → counted rejection, zero semantic effect.
  resetEnv();
  const e1 = ev(0, { kind: "goal_set", goal: "g" });
  const e2 = ev(0, { kind: "status", phase: "planning", rationale: "r" });
  const dupSeq: AgentEvent = { ...e2, seq: e1.seq };
  const s1 = reduce(initialState(SESSION), e1);
  const s2 = reduce(s1, dupSeq);
  assert(s2.rejectedCount === 1, "duplicate seq rejected");
  assert(s2.phase === null, "duplicate seq did not mutate semantics");
  assert(s2.lastSeq === e1.seq, "lastSeq unchanged by duplicate delivery");
}

// ---------------------------------------------------------------------------
// 5. Per-kind semantics — plans
// ---------------------------------------------------------------------------

section("Plan ops");
{
  resetEnv();
  const mk = (ops: import("../src/lib/codelab/agent/types").PlanOp[]) =>
    fold(SESSION, [ev(0, { kind: "plan_update", ops })]).plan;

  // replace → revision 1, pending steps.
  const p1 = mk([{ op: "replace", steps: [{ id: "a", title: "A" }, { id: "b", title: "B" }] }]);
  assert(p1?.revision === 1, "replace bumps revision to 1");
  assert(p1?.steps.every((s) => s.status === "pending") === true, "steps start pending");

  // add_step append / insert / duplicate-skip / unknown-anchor-skip / cap.
  const p2 = mk([
    { op: "replace", steps: [{ id: "a", title: "A" }] },
    { op: "add_step", afterStepId: null, step: { id: "b", title: "B" } },
    { op: "add_step", afterStepId: "a", step: { id: "c", title: "C" } },
    { op: "add_step", afterStepId: null, step: { id: "b", title: "dup" } },
    { op: "add_step", afterStepId: "ghost", step: { id: "d", title: "D" } },
  ]);
  assert(
    p2?.steps.map((s) => s.id).join(",") === "a,c,b",
    "insert-after anchors correctly; duplicates & unknown anchors skipped",
  );

  // set_status transition bumps revision once per EVENT (contract: per
  // plan_update that applied ≥ 1 op), regardless of how many ops applied;
  // a same-status rewrite inside the same event is a no-op.
  const p3 = mk([
    { op: "replace", steps: [{ id: "a", title: "A" }] },
    { op: "set_status", stepId: "a", status: "done" },
    { op: "set_status", stepId: "a", status: "done" },
  ]);
  assert(p3?.revision === 1, "revision bumps once per effective event, not per op");
  assert(p3?.steps[0].status === "done", "status transition applied");

  // reorder: permutation applies, non-permutation skipped.
  const p4 = mk([
    { op: "replace", steps: [{ id: "a", title: "A" }, { id: "b", title: "B" }] },
    { op: "reorder", order: ["b", "a"] },
  ]);
  assert(p4?.steps[0].id === "b", "valid permutation applies");
  const p5 = mk([
    { op: "replace", steps: [{ id: "a", title: "A" }] },
    { op: "reorder", order: ["a", "ghost"] },
  ]);
  assert(p5?.steps.length === 1 && p5.revision === 1, "non-permutation reorder skipped");

  // Ops against null plan other than replace are skipped.
  const p6 = mk([{ op: "remove_step", stepId: "nope" }]);
  assert(p6 === null || p6.steps.length === 0, "remove against empty plan is inert");

  // Pure applyPlanOps sanity: unknown-step set_status inside event leaves plan ref intact.
  const base = mk([{ op: "replace", steps: [{ id: "a", title: "A" }] }]);
  const r = applyPlanOps(base, [{ op: "set_status", stepId: "ghost", status: "done" }]);
  assert(r.changed === false && r.plan === base, "all-skipped op batch returns same plan reference");
}

// ---------------------------------------------------------------------------
// 5b. Per-kind semantics — tools, deltas, done, abort
// ---------------------------------------------------------------------------

section("Tool lifecycle & misc kinds");
{
  resetEnv();
  const s = fold(SESSION, [
    ev(0, { kind: "tool_call", callId: "t1", tool: "read_file", argsJson: "{}" }),
    // duplicate OPEN callId → rejected
    ev(0, { kind: "tool_call", callId: "t1", tool: "run_js", argsJson: "{}" }),
    // orphan result → rejected
    ev(0, { kind: "tool_result", callId: "ghost", ok: true, summary: "?" }),
    ev(0, { kind: "tool_result", callId: "t1", ok: false, summary: "boom" }),
    // reuse of CLOSED id tolerated
    ev(0, { kind: "tool_call", callId: "t1", tool: "search", argsJson: '{"q":"x"}' }),
  ]);
  assert(s.rejectedCount === 2, "duplicate-open call and orphan result both rejected");
  assert(openCallCount(s) === 1, "one call remains open");
  assert(s.calls[0].state === "error" && s.calls[0].summary === "boom", "result closes call with outcome");

  const sDone = fold(SESSION, [
    ev(0, { kind: "done", summary: "first" }),
    ev(0, { kind: "done", summary: "second" }),
  ]);
  assert(sDone.doneSummary === "first", "first done wins");

  const sAbortBase = fold(SESSION, [ev(0, { kind: "goal_set", goal: "g" })]);
  const badAbort = foldFrom(sAbortBase, [ev(0, { kind: "aborted", newEpoch: 5, reason: "skip-ahead" })]);
  assert(badAbort.epoch === 0 && badAbort.abortedReason === null, "non-sequential abort payload rejected");
  const goodAbort = foldFrom(badAbort, []);
  assert(goodAbort.epoch === 0, "rejected abort leaves epoch untouched");

  resetEnv();
  const aborted = fold(SESSION, [
    ev(0, { kind: "goal_set", goal: "g" }),
    ev(0, { kind: "aborted", newEpoch: 1, reason: "stop" }),
  ]);
  assert(aborted.epoch === 1 && aborted.abortedReason === "stop", "abort bumps epoch exactly once");
}

// ---------------------------------------------------------------------------
// 6. Verifier slice isolation + rings (directive 3)
// ---------------------------------------------------------------------------

section("Verifier slice isolation & ring bounds");
{
  resetEnv();
  const preEvents: AgentEvent[] = [
    ev(0, { kind: "goal_set", goal: "g", acceptance: ["a1"] }),
    ev(0, { kind: "plan_update", ops: [{ op: "replace", steps: [{ id: "p", title: "P" }] }] }),
    ev(0, { kind: "file_delta", path: "x.js", op: "write", contentAfter: "let x;" }),
  ];
  const pre = fold(SESSION, preEvents);

  const ver = ev(0, {
    kind: "verification",
    runId: "v1",
    verdict: "inconclusive",
    channels: [{ channel: "unit", status: "skipped", detail: "no tests yet" }],
    assessment: "Not enough evidence.",
  });
  const post = reduce(pre, ver);

  // Actor fields bit-identical across a verification event:
  assert(post.goal === pre.goal && post.acceptance === pre.acceptance, "goal slice untouched");
  assert(post.plan === pre.plan, "plan reference untouched");
  assert(post.fileDeltas === pre.fileDeltas, "delta log untouched");
  assert(post.calls === pre.calls && post.phase === pre.phase, "calls/phase untouched");
  assert(post.timeline.length === pre.timeline.length + 1, "verification reached timeline");
  assert(post.verification.totalRuns === 1 && post.verification.lastVerdict === "inconclusive", "slice updated");

  // Ring cap: push more runs than retained.
  resetEnv();
  let st = initialState(SESSION);
  const total = LIMITS.verificationRunsRetained + 7;
  for (let i = 0; i < total; i++) {
    st = reduce(st, ev(0, {
      kind: "verification",
      runId: `v${i}`,
      verdict: i % 2 === 0 ? "pass" : "fail",
      channels: [],
      assessment: "",
    }));
  }
  assert(st.verification.runs.length === LIMITS.verificationRunsRetained, "verifier runs capped");
  assert(st.verification.totalRuns === total, "totalRuns keeps counting beyond cap");
  assert(st.verification.runs[st.verification.runs.length - 1].runId === `v${total - 1}`, "newest run retained");
  // i = total-1 = 22 is even → "pass" per the fixture formula.
  assert(st.verification.lastVerdict === "pass", "lastVerdict tracks latest run");

  // Timeline + status rings.
  resetEnv();
  let st2 = initialState(SESSION);
  const fill = LIMITS.timelineCapacity + 25;
  for (let i = 0; i < fill; i++) {
    st2 = reduce(st2, ev(0, { kind: "status", phase: "editing", rationale: `r${i}` }));
  }
  assert(st2.timeline.length === LIMITS.timelineCapacity, "timeline capped");
  assert(st2.statusRing.length === Math.min(fill, LIMITS.statusRingCapacity), "status ring capped");
  assert(
    st2.timeline[st2.timeline.length - 1].seq === fill &&
      st2.statusRing[st2.statusRing.length - 1].rationale === `r${fill - 1}`,
    "most recent entries retained at ring tails",
  );
  assert(st2.version === fill, "version reflects all events, not just retained");
}

// ---------------------------------------------------------------------------
// 7. Verifier projection + aggregation
// ---------------------------------------------------------------------------

section("Verifier projection & aggregateVerdict");
{
  resetEnv();
  const SECRET_RATIONALE = "SECRET-RATIONALE-MARKER";
  const SECRET_ARG = "SECRET-ARGS-MARKER";
  const SECRET_TITLE = "SECRET-PLAN-TITLE";
  const state = fold(SESSION, [
    ev(0, { kind: "goal_set", goal: "Build X.", acceptance: ["works"] }),
    ev(0, { kind: "status", phase: "recon", rationale: SECRET_RATIONALE }),
    ev(0, { kind: "plan_update", ops: [{ op: "replace", steps: [{ id: "s", title: SECRET_TITLE }] }] }),
    ev(0, { kind: "tool_call", callId: "k", tool: "read_file", argsJson: `{"m":"${SECRET_ARG}"}` }),
    ev(0, { kind: "file_delta", path: "a.js", op: "write", contentAfter: "const a = 1;" }),
    ev(0, { kind: "file_delta", path: "b.js", op: "delete" }),
  ]);

  const input = buildVerifierInput(state);
  const json = JSON.stringify(input);
  assert(input.goal === "Build X." && input.acceptance.join() === "works", "goal/acceptance projected");
  assert(input.diff.length === 2, "both deltas summarized");
  assert(input.diff[0].bytesAfter === "const a = 1;".length, "bytesAfter computed from content");
  assert(input.diff[1].op === "delete" && input.diff[1].bytesAfter === 0, "delete summarizes to zero bytes");
  assert(
    !json.includes(SECRET_RATIONALE) &&
      !json.includes(SECRET_ARG) &&
      !json.includes(SECRET_TITLE),
    "projection leaks NO rationales, args, or plan internals",
  );
  assert(!json.includes("contentAfter"), "full file bodies never cross the verifier boundary");

  // Aggregation rules.
  assert(aggregateVerdict([]) === "inconclusive", "empty evidence ≠ pass");
  assert(
    aggregateVerdict(uniformEvidence("pass")) === "pass",
    "uniform pass ⇒ pass",
  );
  assert(
    aggregateVerdict([...uniformEvidence("pass"), { channel: "runtime", status: "fail", detail: "" }]) === "fail",
    "any fail ⇒ fail",
  );
  assert(
    aggregateVerdict([...uniformEvidence("pass"), { channel: "unit", status: "error", detail: "" }]) === "inconclusive",
    "any error ⇒ inconclusive",
  );
  assert(
    aggregateVerdict(
      [{ channel: "syntax", status: "pass", detail: "" }],
      ["syntax", "runtime"],
    ) === "inconclusive",
    "missing expected channel downgrades to inconclusive",
  );
  assert(
    aggregateVerdict(
      [...uniformEvidence("pass"), { channel: "behavioral", status: "skipped", detail: "" }],
      ["syntax", "runtime"],
    ) === "pass",
    "skipped channel outside expectations does not downgrade",
  );
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\nCodeLab agent reducer tests — passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
