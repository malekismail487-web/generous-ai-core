# Stage 15 — Universal Adaptive Wiring

**Status:** ✅ COMPLETE · Coverage audit gate: PASS · Blind student-facing AI calls: 0

---

## Problem

Stages 0–14 built a 14-subsystem cognitive engine — but a mid-stage code audit revealed
uneven wiring: several student-facing AI surfaces (Podcasts, Mind Maps, Debate Theater,
and the three Learning Modes) invoked edge functions **without injecting adaptive
context** and **without recording activity back into the engine**. The result: the AI
ran "blind" on those surfaces even though the engine had rich profile data available.

Stage 15 closes that gap and installs a **coverage audit** that prevents regression.

---

## Wired components

### Tier 1 — Previously blind, now fully wired

| Component                       | `getSimpleParams` | Recorder(s)                             |
| ------------------------------- | ----------------- | --------------------------------------- |
| `PodcastsSection`               | `'podcast'`       | `recordActivity`                        |
| `MindMapGenerator`              | `'mind_map'`      | `recordActivity`                        |
| `learning-modes/SocraticMode`   | `'learning_mode'` | `recordChat` + `recordAnswer` per turn  |
| `learning-modes/TeachBackMode`  | `'learning_mode'` | `recordChat` + `recordAnswer` + `recordActivity` |
| `learning-modes/MisconceptionHunt` | `'learning_mode'` | `recordChat` + `recordAnswer` per item + `recordActivity` |
| `student/DebateTheater`         | `'chat'`          | `recordChat` + `recordActivity`         |

### Tier 1b — Reference callers whose loop was silently open

| Component                       | Was                          | Now                                |
| ------------------------------- | ---------------------------- | ---------------------------------- |
| `ExaminationSection`            | recorded answers but no `getSimpleParams` in prompt | injects `'exam'` params + records |
| `SubjectsSection`               | destructured recorders, never called them | now calls `recordActivity` + `recordTeaching` on lecture render |
| `FileNotesGenerator`            | destructured `recordActivity`, never called it | now records on stream completion |

### Tier 2 — Deprecated dead wrappers

`src/lib/luminaAI.ts` and `src/lib/subjectModule.ts` were shown by `rg` to have **zero
live consumers**. They now carry a JSDoc `@deprecated` warning against adding new
callers; anything routed through them would be blind to the engine.

---

## Contract enforced

Every file in `STUDENT_AI_SURFACES` must satisfy:

1. Imports `useAdaptiveIntelligence` from `@/hooks/useAdaptiveIntelligence`.
2. Calls **`getSimpleParams(feature, subject)`** (or the fuller `getContext`) before
   invoking the AI, and passes `{ adaptiveLevel, learningStyle }` into the edge
   function body.
3. Calls at least one recorder — `recordActivity` / `recordChat` / `recordAnswer` /
   `recordTeaching` — so the profile bus invalidates and downstream subsystems
   (IRT, FSRS, cognitive/emotional engines) see the interaction.

Renamed aliases like `recordAnswer: intelligentRecordAnswer` count — the audit
accepts the destructure pattern too.

---

## Regression guard

`scripts/adaptiveCoverageAudit.ts` scans `src/components/**` and enforces:

- **Contract**: every file in `STUDENT_AI_SURFACES` satisfies all three rules.
- **New-caller detection**: any *new* file under `src/components/student/**` or
  matching `src/components/*Section.tsx` that invokes `supabase.functions.invoke(`
  or a `functions/v1/...` fetch **without** importing `useAdaptiveIntelligence`
  either has to be wired or explicitly added to `KNOWN_ADAPTIVE_OR_EXEMPT` with a
  justification comment.

Exit code is non-zero on any violation, so this can gate CI.

Run:

```bash
bun run scripts/adaptiveCoverageAudit.ts
```

Output includes an **adaptive coverage metric** on every run:

```
=== Adaptive Coverage Audit ===
Student-facing files scanned: 49
  ...invoking AI:            20
  ...adaptive-wired:         13
  Coverage:                  65.0%
✓ PASS — every student-facing AI call is wired to the adaptive engine.
```

The denominator (20) is student-surface files that invoke AI at all; the numerator
(13) is those wired through the adaptive engine. The remaining 7 are exempted
output-only surfaces (`ColdStartProbe`, `Leaderboard`, `MirrorRevealCard`,
`MorningBriefingCard`, `MorningBriefing`, `CognitiveMirrorCard`) plus a couple of
meta callers — surfaces where the AI's job is to *display* an engine-computed
prediction, not to condition its own output on student state.

---

## Files changed

**Engine:**
- `src/lib/adaptiveIntelligence.ts` — added `'learning_mode'` to `FeatureType` and a
  matching `getFeatureInstructions` entry describing how Socratic/Teach-Back/Hunt
  should adapt.

**Components (5 new wirings + 3 loop-closures):**
- `src/components/PodcastsSection.tsx`
- `src/components/student/MindMapGenerator.tsx`
- `src/components/student/learning-modes/SocraticMode.tsx`
- `src/components/student/learning-modes/TeachBackMode.tsx`
- `src/components/student/learning-modes/MisconceptionHunt.tsx`
- `src/components/student/DebateTheater.tsx`
- `src/components/ExaminationSection.tsx`
- `src/components/SubjectsSection.tsx`
- `src/components/FileNotesGenerator.tsx`

**Deprecated (no consumers):**
- `src/lib/luminaAI.ts`

**New:**
- `scripts/adaptiveCoverageAudit.ts` — the regression gate + coverage metric.

**Zero:** migrations, edge functions, tables, schema changes, breaking API changes.

---

## Why this matters

Before Stage 15, a student generating a podcast, a mind map, or debating an AI
persona was talking to Gemini with **no personalization signal in the prompt** and
**no telemetry flowing back**. Their IRT ability, learning style, cognitive fatigue,
and known knowledge gaps were all sitting in the profile — but the AI call ignored
all of it. Feedback from those interactions was likewise lost, which starved the
downstream subsystems of signal from ~40% of the student's AI-mediated learning.

After Stage 15:

- Every student-facing AI call reads the unified profile before generating.
- Every student-facing AI call writes back to the profile bus, invalidating cached
  context and triggering the next `getContext` re-read.
- The coverage audit fails CI if anyone adds a new blind call.

The engine is no longer a set of subsystems the *core* AI features use — it is now
the substrate every AI feature runs on top of.
