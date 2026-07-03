Stage 15 — Universal Adaptive Wiring

**Goal:** Eliminate every "blind" AI call in student-facing surfaces. After this stage, no `functions.invoke(...)` that produces content for a student runs without (a) injecting adaptive context and (b) recording the resulting activity back into the engine.

Teacher / admin / ministry AI surfaces are intentionally excluded — they don't personalize to a student and shouldn't be gated by student state.

---

## Scope: what gets wired

### Tier 1 — Blind student surfaces (wire fully)

1. **PodcastsSection** — inject `getContext('podcast', subject)` into prompt; `recordActivity` on generation.
2. **MindMapGenerator** — inject `getContext('mindmap', subject)`; `recordActivity`.
3. **NotesSection** (AI helpers only — summarize/expand/quiz-from-note) — inject `getContext('notes', subject)`; `recordActivity`.
4. **StudentMaterials** AI helpers (explain / summarize a material) — inject `getContext('materials', subject)`; `recordActivity`.
5. **Learning modes** — `SocraticMode`, `TeachBackMode`, `MisconceptionHunt` — inject `getContext('learning-mode', subject)`; `recordChat` on each turn; `recordAnswer` where the mode grades a response.

### Tier 2 — Shared wrapper (make adaptive-by-default)

6. `**src/lib/luminaAI.ts**` — currently calls `chat` edge function with zero context. Refactor:
  - Add optional `adaptiveContext` param to `generalChat`, `mathChat`, `generateLecture`, `summarizeLecture`.
  - Add a thin `useLuminaAI()` hook that wraps these and auto-pulls context from `useAdaptiveIntelligence`, so any component calling the hook is adaptive-by-default.
  - Update `subjectModule.ts` (the only current consumer) to pass context.

### Tier 3 — Coverage guarantee

7. **Coverage audit script** — `scripts/adaptiveCoverageAudit.ts` that greps every `functions.invoke(` in `src/components/student/**` and `src/components/*Section.tsx`, cross-references it against `useAdaptiveIntelligence` usage in the same file, and fails CI if a new blind student-facing AI call is added. Prevents regression.

---

## What we are NOT changing

- The engine itself (Stages 0–14) — no new subsystems, no new tables, no new edge functions.
- Teacher/admin AI (`TeacherCopilot`, `AssignmentQuestionBuilder`, `TeacherMaterials`, `LessonPlanGenerator`) — different audience, different contract.
- Determinism guarantees — `getContext` is already deterministic given profile version; wiring it in doesn't change that.
- Existing adaptive callers (Examination, Practice, Flashcards, SAT, Subjects, FileNotes, StudyBuddy, AI Study Plan, Lecture Studio, Interactive Graph, IQ Test, Teaching Generate) — already correct.

---

## Technical details

**Injection pattern (canonical, already used by ExaminationSection):**

```ts
const { getContext, recordActivity } = useAdaptiveIntelligence();
const ctx = await getContext('podcast', subject);
const prompt = `${ctx.fullContext}\n\n${basePrompt}`;
await supabase.functions.invoke('generate-podcast', { body: { prompt, adaptiveLevel: ctx.adaptiveLevel } });
recordActivity({ subject, topic, feature: 'podcast', durationEstimate: 300 });
```

`**FeatureType` extension** — `src/lib/adaptiveIntelligence.ts` currently enumerates known features. Add `'podcast' | 'mindmap' | 'notes' | 'materials' | 'learning-mode'` to the union so profiling can distinguish them.

**Learning-mode chat turns** — call `recordChat(userMessage)` per submission so the emotional/cognitive engines see the interaction; when the mode reaches a graded checkpoint, also call `recordAnswer`.

`**luminaAI.ts` hook** — new file `src/hooks/useLuminaAI.tsx` that exposes the same 4 functions but auto-injects context. Old exports keep working (no breaking change) but become deprecated in-code with a JSDoc note.

**No DB changes, no migrations, no new edge functions.** Existing edge functions already accept free-form prompts; we're just enriching what we send.

---

## Verification

- **Unit**: extend `scripts/adaptiveCoverageAudit.ts` with a Vitest wrapper that asserts every file in the Tier-1 list imports `useAdaptiveIntelligence` and calls both `getContext` and one of `recordActivity`/`recordChat`/`recordAnswer`.
- **Behavioral**: manually generate a podcast and a mind map, then read `student_learning_profiles` to confirm `feature_usage` counters for the new features increment.
- **Dossier**: append a Stage 15 section to `.lovable/stage14-dossier.md` (or new `stage15-dossier.md`) documenting the coverage matrix before/after — this is the auditable artifact.

---

## Deliverables

- 5 component edits (Tier 1)
- 1 shared wrapper refactor + 1 new hook (Tier 2)
- 1 audit script + 1 coverage test (Tier 3)
- 1 dossier entry
- 0 migrations, 0 new edge functions, 0 new tables
- I approve this plan, with the small recommendation to enforce the canonical adaptive wrapper in the audit and, if convenient, expose an adaptive coverage metric so you can immediately see if future development reduces coverage.