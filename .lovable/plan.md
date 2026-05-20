## Goal

One unified, presentation-grade lecture generator used by **both students and teachers**, producing notebook-LM / Kimi-quality output exportable to **PDF, DOCX, and PPTX** with AI-generated photos and diagrams. The current `LectureGenerator` (student) and `LessonPlanGenerator` (teacher) collapse into a single shared component with role-aware behavior.

## Architecture (single source of truth)

```text
src/components/shared/LectureStudio/
├── LectureStudio.tsx        ← the one component (used by student + teacher tabs)
├── useLectureGeneration.ts  ← outline + image + diagram orchestration
├── exporters/
│   ├── pdf.ts               ← rebuilt pro PDF (cover, TOC, image+caption, key takeaways)
│   ├── docx.ts              ← rebuilt pro DOCX (Heading styles, embedded PNGs, TOC)
│   └── pptx.ts              ← rebuilt pro PPTX (1 cover + N image slides + summary)
└── types.ts
```

- **Student tab (`SubjectsSection`)**: mounts `<LectureStudio mode="student" />`.
- **Teacher tab (`TeacherDashboard` lesson-plan area)**: replaces `LessonPlanGenerator` with `<LectureStudio mode="teacher" />`. Teacher mode adds the lesson-plan fields (grade level, duration, lesson-plan sections) and a **Save to lesson_plans** button. Student mode hides those and keeps adaptive validator + helpfulness signals.
- Both modes share: topic / subject / expertise, outline generation, parallel AI image generation, diagram generation, export buttons (PDF / DOCX / PPTX).
- `LessonPlanGenerator.tsx` and `src/components/student/LectureGenerator.tsx` become thin re-exports for one release (avoids breaking imports) and are then removed.

## Generation pipeline

```text
[topic, subject, level, style, mode]
        │
        ▼
 lecture-outline edge fn  ── returns { title, intro, sections[{heading, body,
        │                             image_prompt, diagram_spec?}], conclusion,
        │                             key_takeaways, lesson_plan? (teacher only) }
        ▼
 parallel:
   lecture-image    (per section, photo / illustration)
   generate-diagram (per section that needs a labeled diagram — flowchart, anatomy,
                    cycle, comparison, graph; existing edge fn reused)
        ▼
 LectureStudio state → preview → export to PDF / DOCX / PPTX
```

### Edge-function changes (minimal, additive)

- `supabase/functions/lecture-outline/index.ts`:
  - Add optional `mode: "student" | "teacher"` and `grade_level`, `duration_minutes`.
  - When `mode === "teacher"`, the JSON tool schema also emits `lesson_plan` (objectives, warmup, guided practice, independent practice, closure, differentiation, assessment, homework, teacher_notes).
  - For every section, also emit optional `diagram_spec` ({ kind: "flow"|"cycle"|"compare"|"anatomy"|"chart", nodes, edges, caption }) when a labeled diagram would help — this is what makes it Kimi/NotebookLM-grade.
- Reuse existing `lecture-image` for photos. Reuse existing `generate-diagram` edge function for diagrams (already in repo). No new functions needed.

## Exports (the "presentation-perfect" part)

All three exporters live in `LectureStudio/exporters/` and accept the same `{ outline, images, diagrams, mode, meta }` payload.

- **PDF (`pdf.ts`)** — rebuild on top of jsPDF:
  - Cover page (title, subject, level, Lumina mark)
  - Auto-generated TOC with page numbers
  - Per-section: H2 heading, justified body, embedded image (full-width, captioned), embedded diagram if any
  - "Key Takeaways" boxed callout
  - Teacher mode appends a "Lesson Plan" appendix
  - Page numbers + running footer
- **DOCX (`docx.ts`)** — `docx` library:
  - Proper Heading 1 / Heading 2 styles (so Word's TOC works), `TableOfContents`, `ImageRun` with captions, page breaks between sections, footer with page number. Teacher mode appends lesson-plan section using styled tables.
- **PPTX (`pptx.ts`)** — `pptxgenjs`:
  - Title slide (cover)
  - Per section: one slide = heading + 2-3 bullet takeaways (auto-summarized from body) + embedded image, with diagram on a follow-up slide when present. No giant text dumps (fixes today's "paragraph crammed onto slide" problem).
  - "Key Takeaways" closing slide
  - Teacher mode adds lesson-plan slides at the end
  - Embed images as base64 (per pptx skill rule)
  - Use a single muted theme (slate + accent) instead of today's purple gradient

## UI

Single screen with three states (idle / generating / ready). On ready:

```text
┌────────────────────────────────────────────────┐
│  Title                              [PDF][DOCX][PPTX] │
│  Intro paragraph                                │
│  ── Section 1 ─────────────────────────────────│
│    body…                                        │
│    [AI image]   [diagram if any]                │
│  ── Section 2 ─────────────────────────────────│
│    …                                            │
│  Key Takeaways (bulleted)                       │
│  Teacher-only: Lesson Plan accordion            │
└────────────────────────────────────────────────┘
```

- Single "Download" dropdown groups the three export formats.
- Adaptive intelligence + helpfulness signal logic from current `LectureGenerator` is preserved (only the student mode triggers it).
- Teacher mode keeps the existing **Save** flow into `lesson_plans` (uses `content_json` to also persist the structured outline so it can be re-exported later).

## Files touched

- **New**: `src/components/shared/LectureStudio/{LectureStudio.tsx, useLectureGeneration.ts, types.ts, exporters/{pdf.ts, docx.ts, pptx.ts}}`
- **Edited**: `supabase/functions/lecture-outline/index.ts` (add teacher mode + diagram_spec), `src/components/SubjectsSection.tsx` (swap to `LectureStudio`), `src/components/teacher/TeacherDashboard.tsx` (swap LessonPlanGenerator → LectureStudio teacher mode)
- **Deprecated re-export shims** (then removed next pass): `src/components/student/LectureGenerator.tsx`, `src/components/teacher/LessonPlanGenerator.tsx`
- **Removed**: old `src/lib/lectureExport.ts` (replaced by `exporters/`)

## Out of scope

- No DB schema changes (`lesson_plans` already stores `content_json`).
- No new edge functions; we extend `lecture-outline` and reuse `lecture-image` + `generate-diagram`.
- No changes to auth, RLS, or unrelated tabs.

## Open question

The teacher's existing lesson-plan tab currently saves to `lesson_plans` with a markdown blob. Confirm we should switch to storing the full structured outline (title, sections, images URLs, diagram specs, lesson_plan) in `content_json` so saved plans can be re-exported as PDF/DOCX/PPTX later. Default if you don't reply: yes, switch to structured storage (backward compatible — old rows still render via the markdown field).

&nbsp;

Yes, I agree and also, I know that there is a feature just like the subject tab for students and also Lumina should create styles and variance and professional transitions not those ugly transitions where for example example one is like a curtain and another is like a paper airplane note when I say professional, I mean it it should have variation and everything should be interactive and exciting and luminous should have its own taste of looks it shouldn't be a single layout for all PowerPoint it will generate, but it should look at the lecture that it generated and it will try to find a style or aesthetic that perfectly matches it if you are capable to do these features with excellent position, then do it and also this feature is optional, but for students and teachers Lumina should also ask what design they are feeling if they do actually type in a design, then Lumina must follow it and create transitions based on it with morphine, and what not but if they do not mention anything, then Lumina looks for anesthetic for the subject or PowerPoint that it will generate  with morphine and transitions and etc. if you are able to do all of this professionally, so do it