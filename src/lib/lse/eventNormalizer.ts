/**
 * LSE — Event Normalizer (Stage A2)
 * ---------------------------------
 * Converts raw teacher input (STT chunks, slide-change strings, whiteboard
 * markers) into a typed `LessonEvent` with an immutable priority.
 *
 * Design contract:
 *   - PURE: `normalize(raw, opts)` is a total function. Given the same
 *     input (including injected clock + id-counter), it returns byte-identical
 *     output. No I/O, no `Date.now()` unless the caller declined to inject one.
 *   - DETERMINISTIC: classification is rule-based (first-match wins over an
 *     ordered rule list). No LLM call in Stage A2 — an LLM-assisted fallback
 *     is a Phase B concern (see `.lovable/plan.md`, B2).
 *   - IMMUTABLE priority: derived exclusively from `priorityTable.ts`.
 *     The classifier chooses `kind`; the table chooses `priority`. Callers
 *     cannot override priority downstream — this is what stops greetings
 *     from ever preempting a definition later in the pipeline.
 *
 * The output shape mirrors §2/S1 of `.lovable/plan.md` and matches the DB
 * insert shape defined in Stage A1 (`lesson_events`), minus `seq` which is
 * assigned by the ordering-contract trigger on insert.
 */

import {
  priorityFor,
  type LessonEventKind,
  type LessonEventPriority,
} from "./priorityTable";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RawTeacherUtterance {
  /** Logical lesson key; passed through unchanged. */
  lessonId: string;
  /** Raw STT / whiteboard / slide text. May be empty. */
  text: string;
  /** Teacher-side clock in ms since epoch. Optional; defaults to injected clock. */
  ts?: number;
  /** Optional curriculum-graph reference; passed through unchanged. */
  conceptRef?: string;
  /**
   * When false, the event is an internal AI-processing marker that RLS in
   * Stage A1 hides from students. Defaults to true.
   */
  teacherVisible?: boolean;
}

export interface LessonEvent {
  id: string;
  lessonId: string;
  ts: number;
  kind: LessonEventKind;
  text: string;
  conceptRef?: string;
  priority: LessonEventPriority;
  teacherVisible: boolean;
}

export interface NormalizeOptions {
  /** Injectable clock for deterministic tests. */
  now?: () => number;
  /** Injectable id generator for deterministic tests. */
  idFactory?: () => string;
}

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

interface ClassifierRule {
  kind: LessonEventKind;
  match: (text: string, lower: string) => boolean;
}

/**
 * Ordered rule list. First match wins. Order is load-bearing:
 *   silence → admin → question → formula → definition → example → concept
 *   → discussion (default).
 *
 * The ordering encodes precedence: e.g. "Class, what is the formula for area?"
 * is classified as a question (P2) even though it contains "formula", because
 * the interrogative signal is stronger evidence of teacher intent than the
 * lexical mention of "formula".
 */
const RULES: readonly ClassifierRule[] = Object.freeze([
  {
    kind: "silence" as const,
    match: (text, lower) =>
      text.trim().length === 0 ||
      lower === "[silence]" ||
      lower === "<pause>" ||
      lower === "[pause]",
  },
  {
    kind: "admin" as const,
    match: (_text, lower) =>
      /^(welcome\b|good\s+(morning|afternoon)|class[,!\s]|attendance\b|reminder[:,\s]|announcement[:,\s]|homework\s+(is|due)|let'?s\s+begin|before\s+we\s+start|housekeeping\b)/i
        .test(lower),
  },
  {
    kind: "question" as const,
    match: (text, lower) =>
      text.includes("?") ||
      /^(what|why|how|when|where|who|which|does|do|did|is|are|was|were|can|could|would|should)\b/i
        .test(lower),
  },
  {
    // Example markers are strong teacher-intent signals and take precedence
    // over formula detection: "For example, F = ma" is pedagogically an
    // example, not a formula announcement.
    kind: "example" as const,
    match: (_text, lower) =>
      /^(for\s+(example|instance)\b|e\.?g\.?\b|such as\b|consider\b|let'?s\s+take\b|imagine\b|suppose\b)/i
        .test(lower),
  },
  {
    kind: "formula" as const,
    // Presence of formal math markup or an equation-like `<lhs> = <rhs>` pair.
    match: (text) =>
      /[∫∑∏√≈≠≤≥±·×÷]/.test(text) ||
      /\$[^$]+\$/.test(text) ||
      /\\[a-zA-Z]+\{/.test(text) ||
      /[A-Za-z0-9_)\]]\s*=\s*[^=]/.test(text),
  },
  {
    kind: "definition" as const,
    match: (_text, lower) =>
      /^(define\b|definition[:,\s]|by definition\b)/i.test(lower) ||
      /\bis defined as\b/i.test(lower) ||
      /\b(means|refers to)\b/i.test(lower) ||
      /\bwe (call|define)\b/i.test(lower),
  },
  {
    kind: "concept" as const,
    match: (_text, lower) =>
      /\b(recall\b|as we (discussed|saw)\b|moving on\b|next[,\s]|next topic\b|chapter\b|section\b|today we('?ll| will)\b|now we('?ll| will)\b)/i
        .test(lower),
  },
]);

/**
 * Deterministic classification of a raw utterance into a `LessonEventKind`.
 * Exported for test coverage of the rule table.
 */
export function classifyKind(text: string): LessonEventKind {
  const lower = text.trim().toLowerCase();
  for (const rule of RULES) {
    if (rule.match(text, lower)) return rule.kind;
  }
  return "discussion";
}

// ---------------------------------------------------------------------------
// Id + clock defaults
// ---------------------------------------------------------------------------

let __seq = 0;
function defaultIdFactory(): string {
  // Monotonic, sortable, collision-resistant per process. Not a ULID —
  // we do not need cross-process monotonicity here because the database's
  // `seq` column (assigned by the Stage A1 ordering trigger) is the true
  // canonical ordering. This id is only for client-side dedup + logs.
  const t = Date.now().toString(36).padStart(9, "0");
  const s = (__seq = (__seq + 1) >>> 0).toString(36).padStart(4, "0");
  const r = Math.floor(Math.random() * 0xffff).toString(36).padStart(3, "0");
  return `${t}-${s}-${r}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Normalize a raw teacher utterance into a fully-typed `LessonEvent`.
 * Priority is *not* an argument: it is derived from the classified kind
 * via `priorityTable.ts` and cannot be overridden.
 */
export function normalize(
  raw: RawTeacherUtterance,
  opts: NormalizeOptions = {},
): LessonEvent {
  const now = opts.now ?? Date.now;
  const idFactory = opts.idFactory ?? defaultIdFactory;

  const text = raw.text ?? "";
  const kind = classifyKind(text);
  const priority = priorityFor(kind);

  return {
    id: idFactory(),
    lessonId: raw.lessonId,
    ts: raw.ts ?? now(),
    kind,
    text,
    conceptRef: raw.conceptRef,
    priority,
    teacherVisible: raw.teacherVisible ?? true,
  };
}

/**
 * Batched variant. Preserves input order; each element is normalized
 * independently. Convenience for STT chunk arrays.
 */
export function normalizeBatch(
  raws: readonly RawTeacherUtterance[],
  opts: NormalizeOptions = {},
): LessonEvent[] {
  return raws.map((r) => normalize(r, opts));
}
