# LSE Stage A3 Dossier — Lesson State Reducer

**Status:** shipped
**Scope:** Client-pure reducer only. No DB I/O, no Realtime, no ALE calls, no priority scheduling. Consumes `LessonEvent` objects produced by the Stage A2 normalizer; produces `LessonState` values consumed later by Stages A4–A7.

This dossier describes only what exists in code as of this stage.

---

## 1. Files added

| Path | Purpose |
| --- | --- |
| `src/lib/lse/lessonReducer.ts` | Pure reducer, initial state, folds, structural equality. |
| `scripts/lseLessonReducer.test.ts` | Runnable test harness (`bun run scripts/lseLessonReducer.test.ts`). |
| `.lovable/lse-A3-dossier.md` | This document. |

No existing files were modified. No migrations, no edge functions, no hook wiring.

---

## 2. Public API (exact)

```ts
// Constants
export const TIMELINE_CAPACITY = 256;

// Types
export interface ConceptNode { id: string; label: string; firstSeenTs: number; }
export interface OpenQuestion { id: string; text: string; ts: number; conceptRef?: string; }
export interface LessonState {
  readonly lessonId: string;
  readonly version: number;
  readonly currentConcept: ConceptNode | null;
  readonly conceptStack: readonly ConceptNode[];
  readonly openQuestions: readonly OpenQuestion[];
  readonly timeline: readonly LessonEvent[];
  readonly prerequisitesCovered: ReadonlySet<string>;
  readonly lastEventTs: number | null;
}

// Functions
export function initialState(lessonId: string): LessonState;
export function reduce(state: LessonState, event: LessonEvent): LessonState;
export function fold(lessonId: string, events: readonly LessonEvent[]): LessonState;
export function foldFrom(state: LessonState, events: readonly LessonEvent[]): LessonState;
export function statesEqual(a: LessonState, b: LessonState): boolean;

// Re-export
export type { LessonEventKind };
```

Nothing else is exported. Everything else in the module is file-local.

---

## 3. Semantics per event kind

The reducer handles every `LessonEventKind` from the Stage A2 priority table. All branches also perform the common bookkeeping: `version += 1`, `timeline` gets the event appended (with ring eviction at `TIMELINE_CAPACITY`), `lastEventTs = event.ts`.

| Kind | Additional effect |
| --- | --- |
| `concept` | New `ConceptNode { id: event.conceptRef ?? event.id, label: event.text.trim() ⎮⎮ event.kind, firstSeenTs: event.ts }` becomes `currentConcept`. If there was a previous `currentConcept` with a different `id`, it is pushed onto `conceptStack`. Same-id repeat is a no-op transition (stack unchanged). |
| `definition` | Adds `event.conceptRef ?? currentConcept?.id` to `prerequisitesCovered` when defined. |
| `formula` | Same as `definition`. |
| `question` | Appends `{ id, text, ts, conceptRef: event.conceptRef ?? currentConcept?.id }` to `openQuestions`. |
| `example` | Timeline + version only. |
| `discussion` | Timeline + version only. |
| `admin` | Timeline + version only. |
| `silence` | Timeline + version only. |

There is no "answered" or "closed question" logic in A3 — `openQuestions` is a passive append-only list. Any answering semantics will land as a new event kind in a later stage; adding it will surface as a TypeScript exhaustiveness error at the `switch` in `reduce`.

---

## 4. Invariants asserted in code

1. **Purity.** `reduce(state, event)` never mutates `state`. The initial `conceptStack`, `openQuestions`, and `timeline` returned by `initialState` are `Object.freeze`d empty arrays; the reducer copies before appending.
2. **Totality.** Every kind has an explicit `case`. The `default` branch calls `assertNever(kind, base)` which is typed `(kind: never, …)` — a new kind fails the type-check here.
3. **Cross-lesson guard.** `reduce` throws `Error("LSE.reduce: lessonId mismatch (state=… event=…)")` if the event's `lessonId` does not equal `state.lessonId`. No silent corruption path.
4. **Bounded memory.** `timeline` never exceeds `TIMELINE_CAPACITY = 256`. Beyond capacity, the oldest event is dropped and the newest appended. `version` continues to increment past the cap — capacity governs retention, not counting.
5. **Associativity of fold.** For any split `k`, `fold(events) ≡ foldFrom(fold(events[..k]), events[k..])` under `statesEqual`. This is the invariant that will underpin snapshot + tail-replay recovery in Phase B3.
6. **Ordering trust.** The reducer does not sort or de-duplicate. Canonical ordering is the responsibility of the Stage A1 `(lesson_id, seq)` database contract and, on the wire, the Realtime channel; A3 folds whatever order it is handed.

---

## 5. Test harness — what is verified

`scripts/lseLessonReducer.test.ts` (25 assertions, all passing) exercises:

| Section | Assertions | What it checks |
| --- | --- | --- |
| Purity | 5 | Frozen initial collections, immutability of input state across `reduce`, correct version bump, `reduce` returns a new object. |
| Determinism | 2 | Two independent folds of the same corpus are `statesEqual`; final `version === events.length`. |
| Associativity | 1 | Property assertion sweeping every split point `k ∈ [0, N]` and comparing `fold(events)` against `foldFrom(fold(prefix), suffix)`. |
| Per-kind semantics | 8 | Concept transition + breadcrumb, prereq marking for both `definition` and `formula`, question ordering, question concept inheritance, timeline completeness, `lastEventTs`. |
| Concept idempotence | 2 | Repeated same-id `concept` events do not push onto the stack. |
| Timeline ring buffer | 3 | Length caps at `TIMELINE_CAPACITY`, tail is the most recent event, `version` reflects all reduced events not just retained ones. |
| Cross-lesson guard | 1 | Foreign `lessonId` throws with the expected message. |

Run locally:

```bash
bun run scripts/lseLessonReducer.test.ts
```

Latest run: **passed: 25, failed: 0** (exit code 0).

---

## 6. Deliberate non-decisions (deferred)

Not built in A3, by design of the phased plan:

- No `LessonState` persistence — snapshots to `lesson_state_snapshots` are a Stage A6 concern.
- No `useLuminaLiveSession` wiring — Stage A5.
- No priority-aware consumption of `openQuestions` — Stage A7.
- No LLM-assisted classification of ambiguous events — Phase B2 (rules-only feeds the reducer today).
- No question-close event — the corpus does not yet emit one.
- No structural sharing across `Set` mutations beyond copy-on-write — measured allocation pressure is bounded by `TIMELINE_CAPACITY`, so a finer-grained persistent-set library is not justified at this stage.

---

## 7. Interfaces with adjacent stages

- **Upstream (A2 → A3):** `LessonEvent` shape is consumed unchanged. Priority is read only from the event; the reducer never overrides it.
- **Downstream (A3 → A4):** `LessonState` is the value the streaming inference prompt builder will project into the "cached context" section of the Stage A4 prompt. `currentConcept`, `conceptStack`, and the tail of `timeline` are the intended inputs; `prerequisitesCovered` gates predictive precompute (Phase B1).
- **Downstream (A3 → A5):** `useLuminaLiveSession` will hold a single `LessonState` per `(studentId, lessonId)` and call `reduce` on each Realtime event.
- **Downstream (A3 → B3):** `foldFrom` + `statesEqual` are the exact primitives reconnect/replay will use to prove that a snapshot plus tail equals a from-scratch fold.

---

## 8. Ready for Stage A4

A4 (`lumina-live` streaming inference edge function) can be opened next. It will import types from `./lessonReducer` and `./eventNormalizer`, but will not modify either.
