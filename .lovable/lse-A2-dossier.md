# LSE Stage A2 — Event Normalizer + Priority Table (Dossier)

**Status:** shipped
**Scope:** pure client-side normalization of raw teacher input into typed `LessonEvent` objects, plus the immutable priority table that governs downstream scheduling.
**Non-scope:** DB writes, edge functions, reducer, Realtime subscribe, scheduler, precompute, LLM-assisted classification. Those are Stages A3–A8 (LLM-assisted classification is Phase B2).

This dossier describes **only what exists after Stage A2**. If code and dossier disagree, the dossier is wrong and must be corrected — not the other way around.

---

## 1. Files added

| File | Role |
|---|---|
| `src/lib/lse/priorityTable.ts` | Frozen, checked-in `LessonEventKind → 1..5` mapping. Sole source of priority. |
| `src/lib/lse/eventNormalizer.ts` | Pure `normalize` / `normalizeBatch` / `classifyKind` API. |
| `scripts/lseEventNormalizer.test.ts` | Runnable test harness (66 assertions, `bun run …`). |

No changes to database schema, edge functions, or existing modules. Stage A1 tables (`lesson_events`, `lesson_sessions`, `lesson_state_snapshots`) are untouched.

---

## 2. Public API contract

### 2.1 Types

```ts
type LessonEventKind =
  | "concept" | "definition" | "formula" | "example"
  | "question" | "discussion" | "admin" | "silence";

type LessonEventPriority = 1 | 2 | 3 | 4 | 5;

interface LessonEvent {
  id: string;                 // client-side monotonic-ish id (see §5)
  lessonId: string;
  ts: number;                 // teacher-side clock in ms since epoch
  kind: LessonEventKind;
  text: string;
  conceptRef?: string;
  priority: LessonEventPriority;
  teacherVisible: boolean;    // default true; false = internal AI marker
}
```

The shape mirrors §2/S1 of `.lovable/plan.md` and matches the Stage A1 `lesson_events` insert shape, minus `seq` (assigned by the ordering-contract trigger on insert).

### 2.2 Functions

- `classifyKind(text: string): LessonEventKind` — pure, deterministic rule-based classifier. First-match wins over an ordered rule list (§4).
- `priorityFor(kind): LessonEventPriority` — table lookup, no logic.
- `normalize(raw, opts?): LessonEvent` — total function; `opts.now` and `opts.idFactory` are injectable for deterministic tests.
- `normalizeBatch(raws, opts?): LessonEvent[]` — order-preserving map over `normalize`.

**Priority is never a caller argument.** The classifier picks `kind`; the frozen table picks `priority`. No downstream code path can override.

---

## 3. Priority table (checked-in, frozen)

| Kind | Priority | Rationale |
|---|---|---|
| `definition` | 1 | Correctness-critical; must reach student before anything else can render |
| `formula` | 1 | Same as above |
| `concept` | 2 | Primary teaching signal — concept transitions |
| `question` | 2 | Primary teaching signal — teacher questions |
| `example` | 3 | Supporting content |
| `discussion` | 4 | Social / interactive filler |
| `admin` | 5 | Non-instructional |
| `silence` | 5 | Non-instructional |

Frozen via `Object.freeze`. Any change requires a matching test + dossier update in the same commit.

---

## 4. Classification rules — ordered, first-match wins

Order is load-bearing. Documented rationale:

1. **silence** — empty/whitespace, or literal `[silence]` / `<pause>` / `[pause]` markers.
2. **admin** — leading admin markers: `welcome`, `good morning/afternoon`, `class,` / `class!`, `attendance`, `reminder:`, `announcement:`, `homework is|due`, `let's begin`, `before we start`, `housekeeping`.
3. **question** — contains `?`, or leading interrogative (`what|why|how|when|where|who|which|does|do|did|is|are|was|were|can|could|would|should`).
4. **example** — leading example markers: `for example|for instance`, `e.g.`, `such as`, `consider`, `let's take`, `imagine`, `suppose`. Precedes `formula` so "For example, F = ma" is classified as `example`.
5. **formula** — presence of formal math symbols (`∫∑∏√≈≠≤≥±·×÷`), inline TeX (`$…$`), TeX commands (`\cmd{…}`), or an equation pattern `<lhs> = <rhs>` (single `=`, not `==`).
6. **definition** — leading `define` / `definition:` / `by definition`, or contains `is defined as`, `means`, `refers to`, `we call`, `we define`.
7. **concept** — contains `recall`, `as we discussed|saw`, `moving on`, `next,` / `next topic`, `chapter`, `section`, `today we('ll| will)`, `now we('ll| will)`.
8. **discussion** — default fallback for anything unmatched.

### 4.1 Precedence regressions pinned by tests

| Utterance | Kind | Reason |
|---|---|---|
| `Class, what is the formula for area?` | `admin` | Admin marker `Class,` precedes question check |
| `Is the formula E = mc^2 correct?` | `question` | `?` wins over formula pattern |
| `For example, F = m * a for a 1kg block.` | `example` | Example marker precedes formula pattern |
| `F = m * a` | `formula` | Bare equation with no example/question marker |

---

## 5. Determinism guarantees

- `classifyKind` and `normalize` perform no I/O and read no global mutable state other than the id counter used by `defaultIdFactory`.
- Tests inject `opts.now` and `opts.idFactory` to eliminate the two non-deterministic inputs; the harness asserts byte-identical output for identical injected inputs.
- The `defaultIdFactory` produces `${base36(millis)}-${base36(counter)}-${base36(rand)}` — sortable within a process but **not** the canonical event order. Canonical order is the DB `seq` column assigned by the Stage A1 trigger.

---

## 6. Test harness — `scripts/lseEventNormalizer.test.ts`

Run: `bun run scripts/lseEventNormalizer.test.ts`

Sections asserted (66 checks total, all passing):

1. **Corpus coverage** — 25 canonical utterances, each classified to the expected kind.
2. **Coverage floor** — every one of the 8 kinds is exercised by ≥ 3 fixtures.
3. **Determinism** — identical inputs (with injected clock + id factory) produce identical output.
4. **Priority table integrity** — every classified event's `priority` equals `PRIORITY_TABLE[kind]`.
5. **Rule precedence regressions** — the four fixtures in §4.1.
6. **Batch behavior** — `normalizeBatch` preserves order and per-element classification.
7. **`teacherVisible`** — defaults `true`; explicit `false` is respected.

---

## 7. Deliberate non-goals for A2

- **No LLM fallback.** Rules only. Ambiguous-utterance escalation to an LLM classifier is Phase B2 in `.lovable/plan.md`.
- **No DB insert path.** A2 is client-pure. Persistence + Realtime broadcast are wired in Stage A5 (session hook) against the Stage A1 schema.
- **No scheduler consumption.** The scheduler with priority aging is Stage A7.
- **No i18n.** All rules are English-only. Non-English utterances currently fall through to `discussion`. A multilingual rule set is a Phase B concern.

---

## 8. What Stage A3 will consume from A2

Stage A3 (Lesson State reducer) will accept a stream of `LessonEvent` values produced by `normalize` and produce a `LessonState` via a pure `(state, event) => state` fold. The reducer will read `kind`, `conceptRef`, and `ts` — nothing more from this module. `priority` is scheduler territory (Stage A7) and does not participate in state folding.
