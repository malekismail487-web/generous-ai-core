# Phase 1 — The Three Foundations

Three features that share infrastructure (snapshots, history, dashboard widgets) so building together is cheaper than sequential. No rushing. After build, I re-read every file and verify data flow against the schema before declaring done.

---

## 1. Confidence Calibration

**Concept:** Every time a student answers a question (assignment, exam, AI quiz), they pick a confidence level *before* seeing the result. Over time we plot Confidence vs. Accuracy — exposing overconfidence (knows less than they think) and underconfidence (knows more than they think).

**Student value:** They see their own metacognition curve. "You're 85% confident on Algebra but only 60% accurate — slow down."
**Teacher value:** Heatmap of overconfident topics per class — exactly where to re-teach.

**UI:**
- Confidence picker (1=Guessing, 2=Unsure, 3=Likely, 4=Certain) appears inline before submitting any answer.
- Student dashboard widget: calibration curve (Recharts line chart, monochrome).
- Teacher analytics: per-topic overconfidence ranking.

---

## 2. Knowledge Decay Map

**Concept:** Every concept a student masters has a decay timer (spaced-repetition curve). When a topic crosses the "about to be forgotten" threshold, a small refresher card appears on the dashboard — one question, 30 seconds, no pressure.

**Student value:** Long-term retention without manual review.
**Teacher value:** Class-wide decay heatmap shows topics drifting backwards even when grades look fine.

**UI:**
- Dashboard widget: "3 topics fading" card with refresh-now button.
- Refresher modal: single AI-generated question on the decaying topic.
- Teacher view: subject × topic × decay-percentage grid.

---

## 3. Time-Travel Notes

**Concept:** Snapshot every saved note's full content on each save. A timeline slider lets the student scrub through their own understanding of a topic over weeks/months — "Here's how I explained photosynthesis 6 weeks ago vs. today." A diff view highlights what they added, removed, and corrected.

**Student value:** Tangible proof of growth. Reflection tool.
**Teacher value:** Optional shared timelines show learning trajectory, not just current state.

**UI:**
- New "Timeline" button on each saved note.
- Full-screen overlay with horizontal time slider, side-by-side diff, "growth highlights" auto-summary (AI).

---

## Technical Section

### New tables
1. **confidence_responses** — `id, user_id, school_id, subject, topic, question_id, question_text, confidence_level (1-4), was_correct, source ('assignment'|'exam'|'ai_quiz'|'lct'), created_at`
2. **confidence_calibration_stats** — rolling per-user / per-topic aggregates (avg_confidence, avg_accuracy, gap, sample_size, updated_at)
3. **concept_mastery** — `id, user_id, school_id, subject, topic, mastery_score (0-1), last_practiced_at, decay_rate, next_review_at, created_at, updated_at`
4. **decay_refreshers** — `id, user_id, concept_mastery_id, question_text, was_correct, answered_at, created_at` (audit of refreshers shown)
5. **note_snapshots** — `id, note_id, user_id, content, content_hash, word_count, snapshot_at`
6. **note_timeline_summaries** — cached AI growth summary per note (id, note_id, user_id, summary_md, generated_at)

All tables: RLS — students read/write own rows; teachers read same-school via `is_teacher() + school_id`; school admins read same-school; super admin all. Strict school isolation. `is_test_data` flag where appropriate.

### Triggers / functions
- `update_confidence_stats()` trigger after insert on `confidence_responses` → recomputes rolling aggregates.
- `update_concept_mastery_after_answer()` — called from existing assignment / exam / AI-quiz submission paths; bumps mastery on correct, decays on incorrect, recomputes `next_review_at` using SM-2-style interval.
- `snapshot_note_on_save()` trigger after insert/update on existing notes table → inserts into `note_snapshots` only when `content_hash` differs from latest snapshot (no duplicates).
- Daily `pg_cron` job: scans `concept_mastery`, marks rows where `next_review_at <= now()` as "due", surfaces them to dashboard query.

### Edge functions
- `confidence-record` — validates and writes confidence response, updates stats.
- `decay-generate-refresher` — calls Lovable AI Gateway (gemini-2.5-flash) for a single MCQ on the decaying topic, returns to client.
- `decay-grade-refresher` — grades the answer, updates `concept_mastery`.
- `note-timeline-summary` — generates "growth highlights" AI summary across snapshots (gemini-2.5-flash).

All edge functions: CORS, JWT validation in code, Zod input validation, double-layer retry on 429/402, school-isolation checks server-side.

### Frontend (monochromatic, Source Serif 4 for AI text)
- `ConfidencePicker.tsx` — inline 4-button selector, used in assignment/exam/quiz answer flows.
- `CalibrationCurve.tsx` — student dashboard widget (Recharts).
- `OverconfidenceHeatmap.tsx` — teacher analytics tab.
- `DecayDashboardCard.tsx` — "Topics fading" student widget + modal flow.
- `DecayHeatmap.tsx` — teacher class-level grid.
- `NoteTimeline.tsx` — full-screen overlay with slider, diff (using `diff` library), AI growth summary.
- All views: internal scrolling with `h-[calc(100vh-120px)]` + `pb-24`.

### Integration points (read existing code first, then wire in)
- Existing assignment submission flow → inject `ConfidencePicker` before submit, write to `confidence_responses` + update `concept_mastery`.
- Existing exam submission flow → same.
- Existing AI quiz / Study Buddy answer flow → same.
- Existing Notes Management module → add Timeline button and snapshot trigger.
- Student dashboard → add Calibration + Decay widgets (respect Lite Mode).
- Teacher analytics dashboard → add Overconfidence + Decay tabs.

### Self-review checklist (run after build, before declaring done)
1. Every new table has RLS enabled and policies cover SELECT/INSERT/UPDATE/DELETE correctly per role.
2. School isolation verified on every query (no cross-school leak).
3. Every edge function: CORS headers on all responses incl. errors, Zod validation, JWT check, retry wrapper.
4. Every new component respects monochromatic theme, internal scrolling, pb-24, Source Serif 4 for AI text.
5. Confidence picker actually blocks submission until selected.
6. Note snapshot trigger does not create duplicates on no-op updates (hash check).
7. Decay refresher cannot be exploited to farm mastery (rate-limited per concept per day).
8. All new dashboard widgets honor Lite Mode (no canvas/animations when enabled).
9. No placeholders. No trademark symbols. No char-limit hints on sensitive inputs.
10. Trace one full user journey end-to-end in source for each of the three features.

---

## Build order within Phase 1
1. Migrations (all 6 tables + triggers + RLS) — single coordinated migration.
2. Edge functions (4 of them).
3. Shared components (ConfidencePicker first — used by 3 flows).
4. Wire ConfidencePicker into assignment/exam/AI-quiz flows.
5. Concept mastery integration in those same flows.
6. Note snapshot trigger + Timeline UI.
7. Dashboard widgets (student + teacher).
8. Self-review pass against the 10-item checklist above.
9. Report back with what was verified and any issues found/fixed.

Approve and I start with the migration.