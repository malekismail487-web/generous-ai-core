/**
 * LSE — Lesson State Reducer (Stage A3)
 * -------------------------------------
 * A pure, deterministic fold over the `LessonEvent` stream produced by the
 * Stage A2 Event Normalizer. Mirrors §2/S3 of `.lovable/plan.md`.
 *
 * Contract:
 *   - PURE: `reduce(state, event)` never mutates its inputs. A new
 *     `LessonState` object is returned per call. Set/array fields are
 *     shallow-copied only when they change; unchanged references are shared
 *     structurally to keep hot-path allocations bounded.
 *   - TOTAL: every `LessonEventKind` is handled explicitly. The compiler
 *     enforces exhaustiveness via `assertNever` in the default branch.
 *   - REPLAYABLE: `fold(events) = events.reduce(reduce, initialState(lessonId))`
 *     is the sole way to construct a `LessonState`. This is what enables the
 *     Stage A8 replay test and any future reconnect-from-seq recovery
 *     (planned for Phase B3).
 *   - ASSOCIATIVE fold: for any split `events = a ++ b`,
 *     `fold(a ++ b) == foldFrom(fold(a), b)`. This invariant is asserted by
 *     the Stage A3 property test and is the mathematical basis for
 *     snapshot + tail replay in Phase B.
 *
 * Non-goals (deferred, per plan.md):
 *   - No I/O, no DB, no Realtime. This module is browser/edge/node-safe.
 *   - No ALE calls. The reducer models *lesson* state, not *student* state.
 *   - No priority scheduling. Priority lives on the event; scheduling is A7.
 *   - No question-answering logic. `openQuestions` is a passive list; the
 *     act of "answering" is a Phase B concern that will emit its own event
 *     kind (not part of the A2 corpus).
 */

import type { LessonEvent } from "./eventNormalizer";
import type { LessonEventKind } from "./priorityTable";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Bounded ring size for `timeline`. Chosen to comfortably cover the recent
 * teaching window used by the streaming inference prompt (Stage A4) without
 * unbounded memory growth on hour-long lessons.
 */
export const TIMELINE_CAPACITY = 256;

export interface ConceptNode {
  /** Curriculum-graph node id when known; falls back to the event id. */
  id: string;
  /** Human-readable label sourced from the triggering event's text. */
  label: string;
  /** Teacher-clock timestamp at which this concept became current. */
  firstSeenTs: number;
}

export interface OpenQuestion {
  /** Event id of the question utterance. */
  id: string;
  text: string;
  ts: number;
  /** Concept in scope at the moment the question was raised, if any. */
  conceptRef?: string;
}

export interface LessonState {
  readonly lessonId: string;
  /** Monotonic reducer version. Increments by 1 per applied event. */
  readonly version: number;
  readonly currentConcept: ConceptNode | null;
  /** Breadcrumb stack of prior concepts, oldest first, current NOT included. */
  readonly conceptStack: readonly ConceptNode[];
  readonly openQuestions: readonly OpenQuestion[];
  /** Bounded ring buffer of the most recent events (oldest first). */
  readonly timeline: readonly LessonEvent[];
  /**
   * Set of concept ids for which the teacher has already delivered at least
   * one definition or formula. Consumed by the predictive precompute stage
   * (B1) to skip refreshers the class has just seen.
   */
  readonly prerequisitesCovered: ReadonlySet<string>;
  /** Timestamp of the most recently reduced event, or null on initial state. */
  readonly lastEventTs: number | null;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/**
 * The canonical empty state for a lesson. Two calls with the same `lessonId`
 * produce structurally equal (but distinct) objects — never share the
 * returned reference across lessons.
 */
export function initialState(lessonId: string): LessonState {
  return {
    lessonId,
    version: 0,
    currentConcept: null,
    conceptStack: Object.freeze([]) as readonly ConceptNode[],
    openQuestions: Object.freeze([]) as readonly OpenQuestion[],
    timeline: Object.freeze([]) as readonly LessonEvent[],
    prerequisitesCovered: new Set<string>(),
    lastEventTs: null,
  };
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function appendTimeline(
  timeline: readonly LessonEvent[],
  event: LessonEvent,
): readonly LessonEvent[] {
  if (timeline.length < TIMELINE_CAPACITY) {
    return [...timeline, event];
  }
  // Drop-oldest ring semantics. `slice(1)` allocates once; acceptable for the
  // steady-state cost profile (one drop per event beyond capacity).
  return [...timeline.slice(1), event];
}

function withCoveredPrereq(
  set: ReadonlySet<string>,
  conceptId: string | undefined,
): ReadonlySet<string> {
  if (!conceptId || set.has(conceptId)) return set;
  const next = new Set(set);
  next.add(conceptId);
  return next;
}

function conceptFromEvent(event: LessonEvent): ConceptNode {
  return {
    id: event.conceptRef ?? event.id,
    label: event.text.trim() || event.kind,
    firstSeenTs: event.ts,
  };
}

/**
 * Apply a single event to the state. Pure. Total. Deterministic.
 *
 * The caller is responsible for feeding events in canonical order — i.e. the
 * order produced by the Stage A1 `(lesson_id, seq)` contract. The reducer
 * does not sort or de-duplicate; that responsibility belongs upstream.
 */
export function reduce(state: LessonState, event: LessonEvent): LessonState {
  if (event.lessonId !== state.lessonId) {
    throw new Error(
      `LSE.reduce: lessonId mismatch (state=${state.lessonId} event=${event.lessonId})`,
    );
  }

  const base = {
    ...state,
    version: state.version + 1,
    timeline: appendTimeline(state.timeline, event),
    lastEventTs: event.ts,
  };

  switch (event.kind) {
    case "concept": {
      const next = conceptFromEvent(event);
      // Only push the previous concept onto the stack when we are actually
      // transitioning to a different concept id — repeated "concept" events
      // that name the same node are treated as no-op transitions.
      const isTransition =
        state.currentConcept !== null && state.currentConcept.id !== next.id;
      const conceptStack = isTransition
        ? [...state.conceptStack, state.currentConcept as ConceptNode]
        : state.conceptStack;
      return {
        ...base,
        currentConcept: next,
        conceptStack,
      };
    }

    case "definition":
    case "formula": {
      // Correctness-critical content. Mark the concept as covered so the
      // precompute stage can skip prereq refreshers.
      const conceptId = event.conceptRef ?? state.currentConcept?.id;
      return {
        ...base,
        prerequisitesCovered: withCoveredPrereq(
          state.prerequisitesCovered,
          conceptId,
        ),
      };
    }

    case "question": {
      const q: OpenQuestion = {
        id: event.id,
        text: event.text,
        ts: event.ts,
        conceptRef: event.conceptRef ?? state.currentConcept?.id,
      };
      return {
        ...base,
        openQuestions: [...state.openQuestions, q],
      };
    }

    case "example":
    case "discussion":
    case "admin":
    case "silence":
      // Structural no-ops beyond timeline + version bookkeeping. Explicitly
      // enumerated (rather than defaulted) so future new kinds surface as
      // TypeScript exhaustiveness errors here.
      return base;

    default:
      return assertNever(event.kind, base);
  }
}

function assertNever(kind: never, base: LessonState): LessonState {
  // Runtime guard mirroring the compile-time exhaustiveness check.
  // Kept side-effect-free to preserve reducer purity in the impossible-path
  // case; the version bump is retained for replay integrity.
  void kind;
  return base;
}

// ---------------------------------------------------------------------------
// Folds
// ---------------------------------------------------------------------------

/**
 * Fold an event sequence into a fresh state. Convenience wrapper — equivalent
 * to `events.reduce(reduce, initialState(lessonId))`, extracted so call sites
 * (tests, reconnect handlers) do not repeat the initialization pattern.
 */
export function fold(
  lessonId: string,
  events: readonly LessonEvent[],
): LessonState {
  let state = initialState(lessonId);
  for (const event of events) {
    state = reduce(state, event);
  }
  return state;
}

/**
 * Continue folding from an existing state. Used to prove the associativity
 * invariant in the Stage A3 property test and to power future snapshot +
 * tail-replay recovery flows (Phase B3).
 */
export function foldFrom(
  state: LessonState,
  events: readonly LessonEvent[],
): LessonState {
  let s = state;
  for (const event of events) {
    s = reduce(s, event);
  }
  return s;
}

// ---------------------------------------------------------------------------
// Structural equality (used by tests; exported for reuse by reconnect logic)
// ---------------------------------------------------------------------------

/**
 * Deep structural equality on the reducer-observable fields of `LessonState`.
 * Intentionally does NOT compare object identity — associativity of the fold
 * is a value-level property, not a reference-level one.
 */
export function statesEqual(a: LessonState, b: LessonState): boolean {
  if (a === b) return true;
  if (a.lessonId !== b.lessonId) return false;
  if (a.version !== b.version) return false;
  if (a.lastEventTs !== b.lastEventTs) return false;
  if (!conceptEqual(a.currentConcept, b.currentConcept)) return false;
  if (a.conceptStack.length !== b.conceptStack.length) return false;
  for (let i = 0; i < a.conceptStack.length; i++) {
    if (!conceptEqual(a.conceptStack[i], b.conceptStack[i])) return false;
  }
  if (a.openQuestions.length !== b.openQuestions.length) return false;
  for (let i = 0; i < a.openQuestions.length; i++) {
    const x = a.openQuestions[i];
    const y = b.openQuestions[i];
    if (
      x.id !== y.id ||
      x.text !== y.text ||
      x.ts !== y.ts ||
      x.conceptRef !== y.conceptRef
    ) {
      return false;
    }
  }
  if (a.timeline.length !== b.timeline.length) return false;
  for (let i = 0; i < a.timeline.length; i++) {
    if (a.timeline[i].id !== b.timeline[i].id) return false;
  }
  if (a.prerequisitesCovered.size !== b.prerequisitesCovered.size) return false;
  for (const id of a.prerequisitesCovered) {
    if (!b.prerequisitesCovered.has(id)) return false;
  }
  return true;
}

function conceptEqual(a: ConceptNode | null, b: ConceptNode | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return a.id === b.id && a.label === b.label && a.firstSeenTs === b.firstSeenTs;
}

// Re-export for downstream consumers so they can import the kind union from
// a single module without reaching into the priority table directly.
export type { LessonEventKind };
