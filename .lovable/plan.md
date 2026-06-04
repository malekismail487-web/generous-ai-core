# Subjects ↔ Teacher Categories ↔ Invite Pool — Unified per School

## Goal

Make the **subject tiles** in the student Subjects tab, the **teacher upload categories**, and the **teacher invite pool** all come from one source of truth: the per-school `subjects` table. Every change an admin makes (add / delete a subject) propagates to students, teachers, and the invite system in that school only. A **Sync Mode** toggle controls whether the three stay locked together.

Terminology note: when you say "lecture" in the Subjects tab, you mean the **subject tile** (Biology, Physics, Arabic…). The Curriculum Graph "lecture" (Subject → Lecture → Concept) is a separate layer and is **not** touched here.

---

## What changes for each role

**School admin**

- New "Subjects & Teacher Categories" panel (in the existing Curriculum group).
- Add subject → creates the tile for students, the teacher category, and a new invite type.
- Delete subject → removes all three.
- Sync Mode toggle (default ON). When ON, the three stay aligned automatically. When OFF, admin can manage them independently.
- Teacher invite generator now asks: "Which subject is this teacher for?" Picks from the school's subjects. The resulting code is bound to that subject.

**Teacher**

- After accepting an invite, the teacher is locked to one subject (their category).
- The Materials / Upload UI only lets them pick that subject — others are hidden or disabled.
- Existing teachers without a subject keep working (treated as "all subjects" until admin assigns one).

**Student**

- The Subjects tab tiles are read from their school's `subjects` table instead of the hardcoded list.
- Default seed = the current 12 tiles, so nothing visually changes on day one. Anything the admin adds/removes shows up immediately.

**Isolation:** all of this is school-scoped via `school_id` + existing RLS. No cross-school leakage.

---

## Scope boundaries

- The Curriculum Graph (`lectures`, `concepts`, `curriculum_versions`) is **not** modified.
- LectureStudio generation flow is unchanged.
- No new payment, AI, or analytics features.
- No global UI redesign — only the Subjects tab data source, the admin Subjects panel, the teacher upload guard, and the invite generator.

---

## Technical Details

### Database (one migration)

1. `subjects` table — already school-scoped. Add:
  - `slug TEXT` (stable id like `biology`)
  - `emoji TEXT`, `color TEXT` (for tile rendering)
  - `is_default BOOLEAN DEFAULT false`
  - unique (`school_id`, `slug`)
2. `schools` — add `subjects_sync_enabled BOOLEAN DEFAULT true`.
3. `invite_codes` — add `subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE` (nullable; required when `role='teacher'` going forward, enforced in the edge function, not as a hard constraint to avoid breaking old rows).
4. `profiles` — add `teacher_subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL` (only meaningful for `user_type='teacher'`).
5. Seed function `seed_default_subjects(school_uuid)` that inserts the 12 current tiles with `is_default=true`. Call it:
  - From `activate_school_with_code` after the school is activated.
  - As a one-time backfill in the migration for every existing school that has zero subjects.
6. Trigger `sync_subject_to_invite_pool` on `subjects` delete → if `subjects_sync_enabled`, also delete unused invite_codes for that subject and null out `profiles.teacher_subject_id` for affected teachers in that school.
7. RLS: school admin can CRUD `subjects` in own school; teachers/students SELECT subjects in own school; invite_codes already restricted.

### Edge functions

- `invite-codes` (POST) — require `subject_id` when `role='teacher'`, verify the subject belongs to the admin's school, persist it on the code row.
- Signup-with-invite path (`signup_with_invite_code` SQL function) — when consuming a teacher code, write `teacher_subject_id` onto the new profile.

### Frontend

- `src/components/SubjectsSection.tsx` — replace the hardcoded `subjects` array with a `useSchoolSubjects()` hook that queries the school's `subjects` table (cached via React Query). Keep the existing tile rendering (emoji + gradient).
- `src/components/teacher/TeacherMaterials.tsx` (and `CourseMaterialsSection` upload path) — read `teacher_subject_id`; if set, force the subject selector to that subject and hide others. Block backend upload of any other subject (defense in depth in RLS via a policy check).
- New `src/components/admin/SubjectsManager.tsx` — list subjects with add/delete, color/emoji pickers, the Sync Mode switch, and per-subject "Generate teacher invite" button. Wire into the existing School Admin dashboard sidebar under **Curriculum**.
- Admin invite generator UI — add a subject dropdown when `role='teacher'`.

### Sync Mode behavior

- ON (default): adding a subject inserts it; deleting cascades to invite codes and teacher assignments via trigger. Renames propagate.
- OFF: admin can add/remove subjects without touching teacher categories or invite pool. We still prevent generating a teacher invite for a subject that doesn't exist.

### Backwards compatibility

- Existing teacher profiles keep `teacher_subject_id = NULL` until admin assigns one; upload UI treats NULL as "no restriction" and shows a soft banner asking the admin to set a category.
- Existing invite codes (no `subject_id`) still consume normally and produce an unrestricted teacher.

---

## Open question

Do you want the **Sync Mode toggle** to also retroactively delete teacher invites and unassign teachers when an admin removes a subject while it's ON, or should it only affect future actions? Default in this plan: yes, cascade retroactively (cleanest — matches "if biology is deleted, biology teacher category is deleted as well").

Yes, I do want this and here are more important rules all about subjects every time the admin creates or delete a subject for students it must appear for all students in the subject tab and it should function exactly the same as the rest of the regular lectures and it should also have its own lecture studio since all the lectures in the subject tab have their own lecture studio, and if the admin ads or delete a teacher category, then it must be visible for all teachers in the school do you perfectly understand?