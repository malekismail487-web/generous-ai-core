/**
 * LSE Stage A5 — Session Internals Test Harness
 * ---------------------------------------------
 * Runnable with:  bun run scripts/lseSessionInternals.test.ts
 *
 * Covers the pure helpers that back `useLuminaLiveSession`. React lifecycle
 * is intentionally NOT tested here — the hook is a thin orchestrator over
 * these helpers, so exercising them exhaustively is the highest-signal
 * verification available without spinning up a DOM.
 *
 * Guarantees pinned here:
 *   1. `payloadToLessonEvent` — deterministic id, rejects every malformed
 *      shape, honors the 8-kind whitelist and priority range.
 *   2. `projectCachedContext` — respects declared caps, truncates timeline
 *      text, preserves order, does not mutate inputs.
 *   3. `classifyIntake` — accepts only the exact next seq; classifies
 *      duplicates, gaps, and invalid ids correctly.
 *   4. `parseSseStream` — handles multi-line frames, CRLF, chunk splits at
 *      byte-arbitrary positions, unknown event kinds, and malformed JSON
 *      without terminating the stream.
 */

import {
  classifyIntake,
  parseSseStream,
  payloadToLessonEvent,
  projectCachedContext,
  PROJECTION_LIMITS,
  seqFromEventId,
} from "../src/lib/lse/sessionInternals";
import { fold, initialState, reduce } from "../src/lib/lse/lessonReducer";
import { normalize, type LessonEvent } from "../src/lib/lse/eventNormalizer";

const LESSON = "11111111-2222-3333-4444-555555555555";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(cond: unknown, label: string) {
  if (cond) { passed++; } else { failed++; failures.push(label); console.error(`  ✗ ${label}`); }
}

function section(name: string) { console.log(`\n— ${name}`); }

// ---------------------------------------------------------------------------
// 1. payloadToLessonEvent
// ---------------------------------------------------------------------------

section("payloadToLessonEvent");
{
  const good = {
    seq: 7,
    kind: "definition",
    priority: 1,
    teacher_visible: true,
    concept_ref: "c.kinematics",
    text: "Velocity is defined as …",
    ts: "2026-07-07T00:00:00Z",
  };
  const ev = payloadToLessonEvent(LESSON, good);
  assert(ev !== null, "well-formed payload rehydrates");
  assert(ev?.id === `${LESSON}#7`, "id is deterministic lessonId#seq");
  assert(ev?.ts === Date.parse("2026-07-07T00:00:00Z"), "ts is parsed to epoch ms");
  assert(ev?.conceptRef === "c.kinematics", "concept_ref → conceptRef");

  const twice = payloadToLessonEvent(LESSON, good);
  assert(twice?.id === ev?.id && twice?.ts === ev?.ts, "rehydration is deterministic");

  const nullConcept = payloadToLessonEvent(LESSON, { ...good, concept_ref: null });
  assert(nullConcept?.conceptRef === undefined, "null concept_ref → undefined");

  // Rejections
  const rejections: Array<[string, unknown]> = [
    ["null payload", null],
    ["non-object", 42],
    ["missing seq", { ...good, seq: undefined }],
    ["seq zero", { ...good, seq: 0 }],
    ["negative seq", { ...good, seq: -1 }],
    ["unknown kind", { ...good, kind: "banter" }],
    ["priority out of range", { ...good, priority: 7 }],
    ["non-boolean teacher_visible", { ...good, teacher_visible: "yes" }],
    ["missing text", { ...good, text: undefined }],
    ["bad ts", { ...good, ts: "not-a-date" }],
  ];
  for (const [label, bad] of rejections) {
    assert(payloadToLessonEvent(LESSON, bad) === null, `rejects: ${label}`);
  }
}

// ---------------------------------------------------------------------------
// 2. projectCachedContext
// ---------------------------------------------------------------------------

section("projectCachedContext");
{
  // Build a state with more concepts than the stack cap and more timeline
  // than the timeline cap, then verify the projection trims correctly.
  let s = initialState(LESSON);
  let seq = 0;
  const mkEvent = (partial: Partial<LessonEvent>): LessonEvent => normalize(
    { lessonId: LESSON, text: partial.text ?? "" , conceptRef: partial.conceptRef },
    { now: () => 1_700_000_000_000 + (++seq) * 10, idFactory: () => `${LESSON}#${seq}` },
  );

  // 12 concept transitions → stack should hold last 8, current is the newest.
  for (let i = 1; i <= 12; i++) {
    s = reduce(s, mkEvent({ text: `Next topic: c${i}.`, conceptRef: `c.${i}` }));
  }
  // Push a definition to mark a prereq covered.
  s = reduce(s, mkEvent({ text: "This is defined as X." }));
  // Fill the timeline past the projection cap with discussion filler.
  for (let i = 0; i < PROJECTION_LIMITS.timeline + 10; i++) {
    s = reduce(s, mkEvent({ text: `filler ${i}` }));
  }

  const proj = projectCachedContext(s);
  assert(proj.currentConcept?.id === "c.12", "currentConcept is the most recent concept");
  assert(proj.conceptStack.length === PROJECTION_LIMITS.stack,
    `conceptStack capped at ${PROJECTION_LIMITS.stack}`);
  assert(proj.conceptStack[proj.conceptStack.length - 1].id === "c.11",
    "conceptStack retains the immediately previous concept");
  assert(proj.recentTimeline.length === PROJECTION_LIMITS.timeline,
    `recentTimeline capped at ${PROJECTION_LIMITS.timeline}`);
  assert(proj.prerequisitesCovered.includes("c.12"),
    "prerequisitesCovered surfaces the current concept's definition");

  // Truncation of oversize timeline text.
  const longText = "x".repeat(PROJECTION_LIMITS.timelineTextChars + 50);
  const s2 = reduce(initialState(LESSON), mkEvent({ text: longText }));
  const proj2 = projectCachedContext(s2);
  assert(proj2.recentTimeline[0].text.length === PROJECTION_LIMITS.timelineTextChars,
    "oversize timeline text truncated to cap");
  assert(proj2.recentTimeline[0].text.endsWith("…"),
    "truncation adds ellipsis marker");

  // Non-mutation.
  const before = JSON.stringify({
    stack: s.conceptStack.length,
    timeline: s.timeline.length,
    prereqs: s.prerequisitesCovered.size,
  });
  projectCachedContext(s);
  const after = JSON.stringify({
    stack: s.conceptStack.length,
    timeline: s.timeline.length,
    prereqs: s.prerequisitesCovered.size,
  });
  assert(before === after, "projection does not mutate input state");
}

// ---------------------------------------------------------------------------
// 3. classifyIntake
// ---------------------------------------------------------------------------

section("classifyIntake");
{
  const mkFoldedEvent = (seq: number): LessonEvent => ({
    id: `${LESSON}#${seq}`,
    lessonId: LESSON,
    ts: 1_700_000_000_000 + seq,
    kind: "discussion",
    text: "",
    priority: 4,
    teacherVisible: true,
  });

  assert(seqFromEventId(`${LESSON}#42`) === 42, "seqFromEventId extracts seq");
  assert(seqFromEventId("bogus") === null, "seqFromEventId rejects non-hash id");

  assert(classifyIntake(mkFoldedEvent(1), 0).reason === "ok", "seq 1 after 0 accepted");
  assert(classifyIntake(mkFoldedEvent(2), 1).reason === "ok", "next seq accepted");
  assert(classifyIntake(mkFoldedEvent(1), 3).reason === "duplicate", "seq behind lastSeq → duplicate");
  assert(classifyIntake(mkFoldedEvent(3), 3).reason === "duplicate", "same seq → duplicate");
  assert(classifyIntake(mkFoldedEvent(5), 2).reason === "gap", "seq skips → gap");
  const invalid: LessonEvent = { ...mkFoldedEvent(1), id: "no-hash-here" };
  assert(classifyIntake(invalid, 0).reason === "invalid", "id without seq → invalid");
}

// ---------------------------------------------------------------------------
// 4. parseSseStream
// ---------------------------------------------------------------------------

section("parseSseStream");

function chunkedStream(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= chunks.length) { controller.close(); return; }
      controller.enqueue(enc.encode(chunks[i++]));
    },
  });
}

async function collect(chunks: string[]) {
  const out: Array<{ event: string; data: unknown }> = [];
  for await (const f of parseSseStream(chunkedStream(chunks))) out.push(f);
  return out;
}

{
  // Simple well-formed stream.
  const frames = await collect([
    `event: token\ndata: {"delta":"Hello"}\n\n`,
    `event: token\ndata: {"delta":" world"}\n\n`,
    `event: done\ndata: {"reason":"stop"}\n\n`,
  ]);
  assert(frames.length === 3, "three frames parsed");
  assert(frames[0].event === "token" && (frames[0].data as { delta: string }).delta === "Hello",
    "first token frame decoded");
  assert(frames[2].event === "done", "done frame decoded");

  // CRLF line endings.
  const crlf = await collect([
    `event: token\r\ndata: {"delta":"x"}\r\n\r\n`,
    `event: done\r\ndata: {"reason":"stop"}\r\n\r\n`,
  ]);
  assert(crlf.length === 2 && (crlf[0].data as { delta: string }).delta === "x",
    "CRLF frames parsed");

  // Byte-arbitrary chunk splits.
  const wire = `event: token\ndata: {"delta":"abc"}\n\nevent: done\ndata: {"reason":"stop"}\n\n`;
  const splits = [
    wire.slice(0, 5),
    wire.slice(5, 12),
    wire.slice(12, 30),
    wire.slice(30, 50),
    wire.slice(50),
  ];
  const split = await collect(splits);
  assert(split.length === 2 && (split[0].data as { delta: string }).delta === "abc",
    "frames survive chunk splits mid-field");

  // Unknown event kind is skipped, others still delivered.
  const mixed = await collect([
    `event: heartbeat\ndata: {}\n\n`,
    `event: token\ndata: {"delta":"ok"}\n\n`,
    `event: done\ndata: {"reason":"stop"}\n\n`,
  ]);
  assert(mixed.length === 2, "unknown event kind skipped, known kinds preserved");

  // Malformed JSON is skipped without aborting the stream.
  const malformed = await collect([
    `event: token\ndata: {not json}\n\n`,
    `event: token\ndata: {"delta":"y"}\n\n`,
    `event: done\ndata: {"reason":"stop"}\n\n`,
  ]);
  assert(malformed.length === 2 && (malformed[0].data as { delta: string }).delta === "y",
    "malformed JSON frame skipped; subsequent frames still parsed");

  // Trailing frame without final blank line.
  const trailing = await collect([
    `event: token\ndata: {"delta":"z"}\n\nevent: done\ndata: {"reason":"stop"}`,
  ]);
  assert(trailing.length === 2 && trailing[1].event === "done",
    "trailing frame without blank line is flushed on stream end");
}

// ---------------------------------------------------------------------------
// 5. Round trip: broadcast payload → reducer → projection
// ---------------------------------------------------------------------------

section("round trip");
{
  const payloads = [
    { seq: 1, kind: "concept", priority: 2, teacher_visible: true, concept_ref: "c.k", text: "Next topic: kinematics.", ts: "2026-07-07T00:00:01Z" },
    { seq: 2, kind: "definition", priority: 1, teacher_visible: true, concept_ref: "c.k", text: "Velocity is defined as …", ts: "2026-07-07T00:00:02Z" },
    { seq: 3, kind: "question", priority: 2, teacher_visible: true, concept_ref: null, text: "What is acceleration?", ts: "2026-07-07T00:00:03Z" },
  ];
  const events = payloads.map((p) => payloadToLessonEvent(LESSON, p)!).filter(Boolean);
  assert(events.length === 3, "all three payloads rehydrated");
  const s = fold(LESSON, events);
  assert(s.currentConcept?.id === "c.k", "reducer took concept transition");
  assert(s.prerequisitesCovered.has("c.k"), "definition marked prereq covered");
  assert(s.openQuestions.length === 1, "question folded into openQuestions");
  const proj = projectCachedContext(s);
  assert(proj.currentConcept?.id === "c.k" &&
    proj.prerequisitesCovered.includes("c.k") &&
    proj.recentTimeline.length === 3,
    "projection reflects the folded state");
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\nLSE A5 session-internals tests — passed: ${passed}, failed: ${failed}`);
if (failed > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
