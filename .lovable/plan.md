## Goal

Stop a teacher (e.g. Arabic) from posting content outside their category (e.g. Biology) — across **Materials, Assignments, Lectures, and AI Copilot** — using a two-layer approach:

1. **AI relevance check** (soft) → warns the teacher and asks "Post anyway?" instead of auto-blocking.
2. **Server-side category guard** (hard) → prevents bypass via crafted requests.

No changes to students, admins, or other roles.

---

## Layer 1 — AI Relevance Check (soft warning)

A new edge function `check-content-relevance` that takes:

- `category_name` (e.g. "Arabic")
- `title`, `body/description`, optional file name
- Returns `{ relevant: boolean, confidence: 0-1, reason: string }`

Model: Lovable AI Gateway, `google/gemini-3-flash-preview`, JSON output, short prompt ("Does this content plausibly belong to a {category} class? Be lenient — borderline = relevant.").

**Client integration** in:

- `TeacherMaterials.tsx` (on submit)
- `TeacherAssignments.tsx` (on submit)
- Lecture creator (on save/export)
- AI Copilot question generator (on topic submit)

UX: If `relevant === false` (confidence ≥ 0.7), show a non-blocking dialog:

> ⚠️ This looks like **{detected topic}**, but your category is **{category}**.
> {reason}
> [Cancel] [Post anyway]

Choosing "Post anyway" stamps `relevance_override = true` on the row (for admin visibility) and proceeds. File-only uploads with no text get a lighter check (filename + first ~2KB text extract for PDFs/Docs).

If the AI call fails (429/402/timeout), skip the warning silently — never block.

---

## Layer 2 — Server-Side Category Guard (hard)

Database trigger `enforce_teacher_category` on `INSERT` to `course_materials` and `assignments`:

- If the inserting user's `profiles.teacher_category_id` resolves to a `subject_id` (Sync ON) → row's `subject` must equal that subject's slug.
- If category has no linked subject (Sync OFF) → row's `subject` must equal slugified category name.
- Teachers with no category (legacy) → unaffected.
- Admins / super admins → unaffected.

Raises `EXCEPTION` with a friendly message the client surfaces as a toast. This is the bypass-proof layer; the AI check never reaches this point in normal use.

---

## Apply the existing client-side lock to all teacher surfaces

Today only `TeacherMaterials.tsx` reads `teacher_category_id` to lock the subject picker. Extend the same hook/util to:

- `TeacherAssignments.tsx` — lock subject picker, hide other subjects in filter.
- Lecture creator — lock subject field.
- AI Copilot — pass category as system context so it refuses off-topic generation ("You teach {category}. If the topic is unrelated, ask the user to confirm.").

Extract the resolution logic into `src/hooks/useTeacherLockedSubject.tsx` so all four surfaces share it.

---

## Admin visibility (small)

Add a single column `relevance_override boolean default false` on `course_materials` and `assignments`. Admin's existing content lists get a small "⚠ override" badge next to overridden rows. No new admin tab; just visibility.

---

## Technical Details

**New files**

- `supabase/functions/check-content-relevance/index.ts` — Lovable AI Gateway call, JSON output, CORS, JWT validation.
- `src/hooks/useTeacherLockedSubject.tsx` — shared resolver returning `{ categoryId, categoryName, subjectSlug, locked }`.
- `src/components/teacher/RelevanceWarningDialog.tsx` — reusable confirm dialog.

**Edited files**

- `src/components/teacher/TeacherMaterials.tsx` — use shared hook, add relevance check on submit.
- `src/components/teacher/TeacherAssignments.tsx` — lock + relevance check.
- Lecture creator component (to be located during build).
- AI Copilot generator component — lock + system prompt mention.

**Migration**

- Trigger function `public.enforce_teacher_category()` + `BEFORE INSERT` triggers on `course_materials` and `assignments`.
- `relevance_override` column on both tables.
- No new RLS policies needed (uses existing).

**Out of scope**

- No changes to existing teacher categories, sync triggers, invite codes, or admin manager.
- No retroactive scanning of already-posted content.
- No re-check on edit (only on initial create), to keep cost down.

---

## Cost / Failure behavior

- One small Gemini Flash call per content creation (~$0.0001).
- AI failures never block posting.
- DB trigger is the only hard gate.

Confirm and I'll switch to build mode and ship it.

&nbsp;

Do both, but you need to do both of them professionally and actually when the teacher sent a material through the course material before they send it, the AI should read the content inside it to see that if it is related to their category or not