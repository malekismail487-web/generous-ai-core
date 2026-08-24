/**
 * CodeLab Agent Phase 0 — Frame Transport Protocol Test Harness
 * ------------------------------------------------------------
 * Runnable with:  bun run scripts/codelabAgentProtocol.test.ts
 *
 * Guarantees pinned here:
 *   1. Round-trip determinism — serialize→parse yields drafts equal to the
 *      originals for EVERY event kind.
 *   2. Arbitrary chunking — splitting a contaminated multi-frame stream at
 *      EVERY byte offset recovers the identical frame sequence (the
 *      incremental-parser core property).
 *   3. Prose contamination — non-frame model output is discarded AND
 *      counted, never retained in any parsed structure.
 *   4. Fault tolerance — invalid JSON, schema rejections, oversize frames,
 *      truncated tails, and buffer overflow are reported as typed
 *      rejections; the parser always survives and continues.
 *   5. Boundedness — internal buffering respects FRAME_MAX_CHARS /
 *      BUFFER_MAX_CHARS caps deterministically.
 */

import {
  AGENT_FRAME_CLOSE,
  AGENT_FRAME_OPEN,
  BUFFER_MAX_CHARS,
  FRAME_MAX_CHARS,
  createFrameParser,
  parseAll,
  serializeFrame,
} from "../src/lib/codelab/agent/protocol";
import type { AgentEventDraft } from "../src/lib/codelab/agent/types";
import { validateDraft } from "../src/lib/codelab/agent/types";

// ---------------------------------------------------------------------------
// Deterministic fixtures
// ---------------------------------------------------------------------------

/** One valid draft per event kind (abort included). */
function buildCorpus(): AgentEventDraft[] {
  return [
    {
      kind: "goal_set",
      goal: "Build a glassmorphism todo app with an AI suggestion button.",
      acceptance: [
        "Preview renders without console errors",
        "Adding and completing a todo works",
      ],
    },
    { kind: "status", phase: "recon", rationale: "Reading entry point and styles" },
    {
      kind: "plan_update",
      ops: [
        {
          op: "replace",
          steps: [
            { id: "s1", title: "Inspect starter project" },
            { id: "s2", title: "Implement todo state" },
          ],
        },
      ],
    },
    {
      kind: "plan_update",
      ops: [
        { op: "set_status", stepId: "s1", status: "done" },
        { op: "add_step", afterStepId: null, step: { id: "s3", title: "Wire AI button" } },
      ],
    },
    { kind: "tool_call", callId: "c1", tool: "read_file", argsJson: '{"path":"index.html"}' },
    {
      kind: "tool_result",
      callId: "c1",
      ok: true,
      summary: "Entry point read; 69 lines",
      resultJson: '{"lines":69}',
    },
    {
      kind: "file_delta",
      path: "app.js",
      op: "write",
      contentAfter: "const todos = [];\nexport function add(t) { todos.push(t); }\n",
    },
    {
      kind: "verification",
      runId: "v1",
      verdict: "pass",
      channels: [
        { channel: "syntax", status: "pass", detail: "" },
        { channel: "runtime", status: "pass", detail: "no console errors" },
      ],
      assessment: "Goal satisfied by diff; preview clean.",
    },
    { kind: "error", scope: "tool:run_js", message: "worker timeout after 2000ms" },
    { kind: "done", summary: "Todo app built and verified." },
    { kind: "aborted", newEpoch: 7, reason: "student pressed stop" },
  ];
}

const PROSE_A = "Let me think about how to approach this todo app layout first.";
const PROSE_B = "I will now inspect the files before editing anything.";

function buildStream(): string {
  const frames = buildCorpus().map(serializeFrame);
  // Contaminate: prose before, between, and after frames.
  return [PROSE_A, frames[0], PROSE_B, ...frames.slice(1), PROSE_A].join("\n\n");
}

// ---------------------------------------------------------------------------
// Assertion helpers (LSE A3 style)
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

/** Canonical JSON with recursively sorted keys — order-insensitive equality. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v !== null && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

// ---------------------------------------------------------------------------
// 1. Round-trip determinism
// ---------------------------------------------------------------------------

section("Round-trip determinism");
{
  const corpus = buildCorpus();
  let all = true;
  for (let i = 0; i < corpus.length; i++) {
    const wire = serializeFrame(corpus[i]);
    const res = parseAll(wire);
    if (
      res.frames.length !== 1 ||
      canonical(res.frames[0]) !== canonical(corpus[i]) ||
      res.invalid.length !== 0
    ) {
      all = false;
      failures.push(`round-trip broke for corpus[${i}] (${corpus[i].kind})`);
      break;
    }
  }
  assert(all, "every event kind survives serialize→parse identically");
}

// ---------------------------------------------------------------------------
// 2. Arbitrary chunking (property over every split offset)
// ---------------------------------------------------------------------------

section("Arbitrary chunk boundaries");
{
  const stream = buildStream();
  const baseline = parseAll(stream);
  let allEqual = true;
  for (let k = 0; k <= stream.length; k++) {
    const p = createFrameParser();
    const a = p.push(stream.slice(0, k));
    const b = p.push(stream.slice(k));
    const c = p.flush();
    const frames = [...a.frames, ...b.frames, ...c.frames];
    if (
      frames.length !== baseline.frames.length ||
      frames.some((f, i) => canonical(f) !== canonical(baseline.frames[i]))
    ) {
      allEqual = false;
      failures.push(`chunk split at k=${k} diverged`);
      break;
    }
  }
  assert(allEqual, `identical frames recovered at all ${stream.length + 1} split offsets`);
}

// ---------------------------------------------------------------------------
// 3. Prose contamination
// ---------------------------------------------------------------------------

section("Prose contamination");
{
  const stream = buildStream();
  const res = parseAll(stream);
  assert(res.discardedProseChars > 0, "prose was counted");
  // Trailing prose loses at most OPEN.length-1 chars to the partial-sentinel
  // candidate window; every other segment is counted in full.
  const minExpected = PROSE_A.length * 2 + PROSE_B.length - (AGENT_FRAME_OPEN.length - 1);
  assert(
    res.discardedProseChars >= minExpected,
    "all prose segments counted (modulo sentinel-candidate window)",
  );
  assert(res.invalid.length === 0, "clean stream produces zero rejections");
  // Directive 4: prose must not survive anywhere in the parsed output.
  const serialized = canonical(res.frames);
  assert(
    !serialized.includes(PROSE_A) && !serialized.includes(PROSE_B),
    "prose content absent from all parsed structures",
  );
}

// ---------------------------------------------------------------------------
// 4. Fault tolerance
// ---------------------------------------------------------------------------

/** A known-good frame reused across fault scenarios. */
const GOOD_FRAME = serializeFrame({ kind: "done", summary: "ok" });

section("Fault tolerance");
{
  // Invalid JSON inside a frame.
  const bad1 =
    `${AGENT_FRAME_OPEN}\n{not json at all}\n${AGENT_FRAME_CLOSE}\n${GOOD_FRAME}`;
  const r1 = parseAll(bad1);
  assert(r1.frames.length === 1, "parser survives invalid JSON");
  assert(r1.invalid.length === 1 && r1.invalid[0].reason === "invalid_json", "invalid_json typed");

  // Valid JSON, invalid schema (unknown kind).
  const bad2 =
    `${AGENT_FRAME_OPEN}\n{"kind":"chain_of_thought","secrets":"everything"}\n${AGENT_FRAME_CLOSE}\n${GOOD_FRAME}`;
  const r2 = parseAll(bad2);
  assert(r2.frames.length === 1, "parser survives schema rejection");
  assert(
    r2.invalid.length === 1 && r2.invalid[0].reason === "schema_rejected",
    "unknown kind typed as schema_rejected",
  );

  // Schema rejection reason tokens carry NO payload echo.
  const leakCheck = JSON.stringify(r2.invalid);
  assert(!leakCheck.includes("secrets"), "rejection records contain no payload content");

  assert(!validateDraft({ kind: "tool_result", callId: "c1", ok: true, summary: "x", resultJson: 7 }).ok,
    "numeric optional resultJson is rejected");
  assert(!validateDraft({ kind: "tool_result", callId: "c1", ok: true, summary: "x", resultJson: {} }).ok,
    "object optional resultJson is rejected");
  assert(!validateDraft({ kind: "file_delta", path: "a.ts", op: "write", contentAfter: 7 }).ok,
    "numeric optional contentAfter is rejected");
  assert(!validateDraft({ kind: "file_delta", path: "a.ts", op: "write" }).ok,
    "write without contentAfter is rejected");
  assert(!validateDraft({ kind: "file_delta", path: "a.ts", op: "delete", contentAfter: "x" }).ok,
    "delete with contentAfter is rejected");
  const validResult = validateDraft({ kind: "tool_result", callId: "c1", ok: true, summary: "x", resultJson: "{}" });
  assert(validResult.ok && validResult.value.kind === "tool_result" && validResult.value.resultJson === "{}",
    "validated optional resultJson is preserved as a string");
  const validDelete = validateDraft({ kind: "file_delta", path: "a.ts", op: "delete" });
  assert(validDelete.ok && validDelete.value.kind === "file_delta" && !("contentAfter" in validDelete.value),
    "absent optional contentAfter remains absent");
}

// ---------------------------------------------------------------------------
// 5. Oversize + truncation + overflow bounds
// ---------------------------------------------------------------------------

section("Boundedness");
{
  // Oversize frame body.
  const big = `${AGENT_FRAME_OPEN}\n${"x".repeat(FRAME_MAX_CHARS + 1)}\n${AGENT_FRAME_CLOSE}`;
  const rb = parseAll(big);
  assert(rb.frames.length === 0, "oversize frame produces no frames");
  assert(
    rb.invalid.length === 1 && rb.invalid[0].reason === "oversize_frame",
    "oversize frame typed",
  );

  // Truncated tail (open frame, end of stream).
  const rt = createFrameParser();
  rt.push(`${AGENT_FRAME_OPEN}\n{"kind":"status","phase":"recon","rationale":"partial`);
  const f = rt.flush();
  assert(
    f.invalid.length === 1 && f.invalid[0].reason === "truncated_frame",
    "unterminated frame flushed as truncated_frame",
  );
  assert(!rt.isInFrame() , "parser not stuck in-frame after flush");

  // Buffer overflow while no frame is open.
  const huge = "y".repeat(BUFFER_MAX_CHARS * 2);
  const ro = createFrameParser();
  const res = ro.push(huge);
  assert(res.frames.length === 0, "overflow yields no frames");
  assert(res.invalid.length === 1 && res.invalid[0].reason === "buffer_overflow", "overflow typed");
  assert(ro.isInFrame() === false, "overflow leaves parser outside a frame");

  // Parser still healthy afterwards.
  const after = ro.push(GOOD_FRAME);
  assert(after.frames.length === 1 && after.frames[0].kind === "done", "healthy after overflow");
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\nCodeLab agent protocol tests — passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
