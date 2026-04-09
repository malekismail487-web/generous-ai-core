# LCT (Luminary Cognitive Test) System — Implementation Plan

## Overview

A standardized test system controlled exclusively by the Super Admin. The LCT generates a 140-question exam (English, Math, Physics, Chemistry, Biology), then "translates" (rewords) it per student's learning style — without changing difficulty. During the 2-hour exam window, the student's entire app is locked to the exam screen, even across logout/login cycles.

---

## Database Schema (5 new tables, 1 new RPC)

### Tables

1. `**lct_exams**` — Master exam record created by Super Admin
  - `id`, `title`, `status` (draft/data_collected/generated/translated/active/completed), `questions_json` (the 140 base questions), `answer_key_json`, `created_by`, `started_at`, `ends_at`, `created_at`
2. `**lct_exam_schools**` — Which schools are included in an LCT exam
  - `id`, `exam_id` (FK lct_exams), `school_id` (FK schools)
3. `**lct_exam_students**` — Per-student translated exam + submission
  - `id`, `exam_id` (FK lct_exams), `student_id` (FK profiles), `school_id`, `learning_style`, `translated_questions_json`, `answers_json`, `score`, `status` (pending/in_progress/completed/timed_out), `started_at`, `submitted_at`
4. `**lct_exam_locks**` — Active lock flag per student (checked on every app load)
  - `id`, `student_id` (unique), `exam_id`, `locked_until`, `created_at`

### RLS Policies

- Super Admin (hardcoded email) has full CRUD on all LCT tables
- Students can only SELECT their own `lct_exam_students` row and their own `lct_exam_locks` row
- All other roles: no access

### RPC Function

- `check_lct_lock(p_user_id uuid)` — SECURITY DEFINER function returning `{locked: bool, exam_id, locked_until}`. Called on every app load to enforce the lock.

---

## Edge Function: `generate-lct`

A new edge function handling the multi-step LCT workflow via action parameter:

- `**collect_data**`: Receives school IDs, queries all students grade 9+ from those schools, fetches their `learning_style_profiles` and `student_learning_profiles`. Returns student count and confirmation.
- `**generate_exam**`: Calls Lovable AI Gateway (Gemini 2.5 Flash) to generate 140 hard questions across 5 subjects (~28 each: English, Math, Physics, Chemistry, Biology). All MCQ. Returns base exam + answer key. Stores in `lct_exams`.
- `**translate_exam**`: For each student, reads their `dominant_style` from `learning_style_profiles`, then calls AI to reword questions matching that style (logical → step-by-step phrasing, visual → add diagram descriptions, conceptual → abstract framing, etc.). Same answers, same difficulty. Stores per-student in `lct_exam_students`.
- `**start_exam**`: Sets exam status to `active`, computes `ends_at = now() + 2 hours`, creates `lct_exam_locks` for every student, sets `locked_until`.
- `**submit_exam**`: Student submits answers. Auto-grades against answer key.
- `**end_exam**`: Called when timer expires. Marks all incomplete students as `timed_out`, removes all locks, sets exam to `completed`.

---

## Frontend Components

### 1. Super Admin LCT Panel (`src/components/admin/LCTPanel.tsx`)

New tab "LCT" added to the Super Admin page (alongside Schools, Analytics, Ministry).

**Step-by-step wizard UI:**

1. **School Selection** — Shows all schools with checkboxes + "Select All" button. Shows student counts (grade 9+ only).
2. **Data Collection** — "Collect Data" button → calls edge function → shows "All data collected" confirmation with student breakdown by learning style.
3. **Exam Generation** — "Build Exam" button → loading screen (reuse `ExamLoadingProgress` pattern) → shows exam preview (scrollable list of all 140 questions with correct answers).
4. **Translation** — "Translate All Exams" button → progress indicator showing per-student translation → "Translation finished" confirmation.
5. **Launch** — "Start Exam" button with confirmation dialog ("This will lock {N} students for 2 hours. Proceed?") → activates the exam.
6. **Live Monitor** — Shows real-time progress: how many students started, completed, time remaining.
7. **Results** — After exam ends: per-student scores, answer key view, export option.

### 2. LCT Exam Lock Guard (`src/components/LCTExamGuard.tsx`)

A wrapper component added at the top level of `App.tsx` (inside AuthProvider).

**Behavior:**

- On every app load / auth state change, calls `check_lct_lock` RPC for the current user
- If locked: renders `LCTExamScreen` full-screen, blocking ALL other routes — no sidebar, no nav, no escape
- The lock persists in the database, so logging out and back in still triggers it
- Only clears when: exam is submitted, or 2-hour timer expires (edge function cleanup)

### 3. LCT Exam Screen (`src/components/student/LCTExamScreen.tsx`)

Full-screen exam interface matching the existing `ExaminationSection` layout:

- Header: "Luminary Cognitive Test" title, question counter (X/140), countdown timer (2:00:00)
- Question card with MCQ options (same glass-effect styling as existing exams)
- Progress bar
- Navigation: Next button (no going back — or allow review, your call on approval)
- Auto-submit when timer hits 0
- No exit button, no back navigation, browser beforeunload warning

### 4. Modifications to Existing Files

- `**src/App.tsx**`: Wrap routes with `<LCTExamGuard>` component that checks lock status
- `**src/pages/SuperAdmin.tsx**`: Add "LCT" tab button and render `<LCTPanel>` when active
- `**supabase/functions/generate-lct/index.ts**`: New edge function

---

## Security Measures

- Lock check is database-driven (not localStorage/sessionStorage) — survives logout/login
- `check_lct_lock` is SECURITY DEFINER — no RLS bypass possible
- Edge function validates super admin email server-side before any action
- Student cannot modify their own lock or exam data (RLS enforced)
- Timer is server-authoritative (`ends_at` timestamp), client timer is display-only
- Auto-cleanup: if `locked_until` has passed, lock is automatically released

---

## Post-Build Verification

After implementation, the following will be tested:

- Lock persists across logout/login
- Lock releases after 2 hours or submission
- Grade filter correctly excludes students below grade 9
- Translation preserves answer keys exactly
- Timer auto-submits at expiry
- Super Admin can preview exam before launching
- No route in the app bypasses the lock screen

---

## Technical Details


| Item                                                                                                                                                                                                         | Detail                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| AI Model                                                                                                                                                                                                     | `google/gemini-2.5-flash` via Lovable AI Gateway                |
| Question format                                                                                                                                                                                              | MCQ only (4 options), same schema as existing exams             |
| Translation batch                                                                                                                                                                                            | Process students in parallel batches of 5 to avoid rate limits  |
| Timer                                                                                                                                                                                                        | Server `ends_at` timestamp + client-side countdown              |
| Lock mechanism                                                                                                                                                                                               | DB table `lct_exam_locks` checked via RPC on every route render |
| Subjects                                                                                                                                                                                                     | English, Math, Physics, Chemistry, Biology (~28 questions each) |
| Target students Also, don't forget that the AI also tells the student what are the questions he got right and got wrong because remember the AI must generate the answer key as well as generating the exam | Grade 9, 10, 11, 12 only                                        |
