/**
 * LSE — Priority Table (Stage A2)
 * -------------------------------
 * Checked-in, deterministic mapping from `LessonEventKind` to a priority
 * band (1 = highest, 5 = lowest). This table is intentionally *not learned*
 * and *not remote-configured*: it is the load-bearing contract that the
 * Priority Scheduler (Stage A7) will consume, and reproducibility across
 * replays requires it to live in source control.
 *
 * If this table changes, Stage A2 tests and the LSE dossier MUST change
 * in the same commit. There is no "hot" override path.
 *
 * Band semantics:
 *   P1 — must reach the student before anything else can render
 *        (definitions, formulas: correctness-critical content)
 *   P2 — primary teaching signal (concept transitions, teacher questions)
 *   P3 — supporting content (examples)
 *   P4 — social / interactive filler (open discussion)
 *   P5 — non-instructional (administrivia, silence markers)
 */

export type LessonEventKind =
  | "concept"
  | "definition"
  | "formula"
  | "example"
  | "question"
  | "discussion"
  | "admin"
  | "silence";

export type LessonEventPriority = 1 | 2 | 3 | 4 | 5;

export const PRIORITY_TABLE: Readonly<Record<LessonEventKind, LessonEventPriority>> =
  Object.freeze({
    definition: 1,
    formula: 1,
    concept: 2,
    question: 2,
    example: 3,
    discussion: 4,
    admin: 5,
    silence: 5,
  });

/** Look up the immutable priority for a normalized event kind. */
export function priorityFor(kind: LessonEventKind): LessonEventPriority {
  return PRIORITY_TABLE[kind];
}
