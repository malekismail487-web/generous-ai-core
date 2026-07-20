# Ministry Intelligence — MI1 Dossier

**Phase:** MI1 — Observation Pipeline
**Status:** Shipped
**Scope:** Foundational data-collection layer for the Ministry Intelligence System.

---

## What this phase actually built

### 1. `mi_educational_events` table

Columns:

| Column | Type | Purpose |
|---|---|---|
| `id` | uuid PK | — |
| `tenant_id` | uuid NOT NULL → `tenants(id)` ON DELETE CASCADE | Country binding. Every event lives inside exactly one tenant. |
| `school_id` | uuid → `schools(id)` ON DELETE SET NULL | School the event happened in. |
| `region_id` | uuid → `mc_regions(id)` ON DELETE SET NULL | Auto-derived at write-time via `mi_school_region(school_id)`. |
| `subject_id` | uuid → `subjects(id)` | Optional subject scoping. |
| `concept_ref` | text | Free-text concept tag used by lesson_events. |
| `grade_level` | text | Matches source-table grade_level type (`assignments.grade_level` etc. are text). |
| `event_type` | `mi_event_type` enum | See enum below. |
| `student_hash` | text | md5(`tenant_id`:`student_id`). Internal only. Never returned to any client. |
| `payload` | jsonb NOT NULL DEFAULT `'{}'` | Aggregated numbers / booleans only. Never names, emails, or free-text content. |
| `occurred_at` | timestamptz | Event time. |
| `created_at` | timestamptz | Insertion time. |

Indexes: `(tenant_id, occurred_at DESC)`, `(school_id, occurred_at DESC)`, `(region_id, occurred_at DESC)`, `(event_type)`, `(subject_id)`.

### 2. `mi_event_type` enum

`homework_submission`, `exam_submission`, `material_view`, `lesson_event`, `tutor_interaction`, `lecture_generated`, `material_uploaded`.

### 3. GRANTs

- `authenticated`: SELECT only.
- `service_role`: ALL.
- `anon`: no grant. (Ministry portal will read via SECURITY DEFINER RPCs added in MI2.)

### 4. RLS policies

- `School admins can read own-school events` — SELECT, authenticated, `EXISTS school_admins.user_id = auth.uid() AND school_id = event.school_id`.
- `Super admin can read all mi events` — SELECT, authenticated, `public.is_super_admin_caller()`.

No INSERT/UPDATE/DELETE policies for authenticated. Writes happen exclusively via SECURITY DEFINER trigger functions.

### 5. Helper functions

| Function | Kind | Purpose |
|---|---|---|
| `mi_hash_student(tenant, student)` | IMMUTABLE SQL | `md5(tenant:student)`. Returns NULL when student is NULL. |
| `mi_school_region(school)` | STABLE SQL | Looks up `mc_school_region_assignments.region_id`. |
| `mi_emit_event(tenant, school, subject, concept_ref, grade_level, event_type, student, payload)` | SECURITY DEFINER PLPGSQL | Central insertion path. Skips silently when `tenant_id` is NULL. Wrapped in `EXCEPTION WHEN OTHERS THEN RAISE NOTICE` so a failure in observation never breaks the source insert. |

All three have `EXECUTE` revoked from PUBLIC, `anon`, `authenticated`.

### 6. Silent triggers

Each trigger is `AFTER INSERT` on the source table, `SECURITY DEFINER`, `search_path = public`. All seven have `EXECUTE` revoked from PUBLIC / `anon` / `authenticated`.

| Trigger | Source table | Signal | Payload keys |
|---|---|---|---|
| `mi_after_assignment_submission` | `assignment_submissions` | `homework_submission` | `grade`, `graded` (bool), `submitted_at` |
| `mi_after_exam_submission` | `exam_submissions` | `exam_submission` | `score`, `auto_graded`, `submitted_at` |
| `mi_after_material_view` | `material_views` | `material_view` | `material_id` |
| `mi_after_lesson_event` | `lesson_events` | `lesson_event` | `kind`, `priority` (student_hash left NULL — teacher-driven) |
| `mi_after_chat_message` | `chat_messages` | `tutor_interaction` | `length` |
| `mi_after_saved_lecture` | `saved_lectures` | `lecture_generated` | `subject`, `mode` |
| `mi_after_course_material` | `course_materials` | `material_uploaded` | `subject`, `has_file` (bool) |

Tenant is derived via `schools.tenant_id`. Region is derived at write-time via `mc_school_region_assignments`.

---

## Guarantees this phase preserves

- **No touch on ALE / LSE / ability estimates / KT / FSRS / unified_* / ai_* / bandit_* / ensemble_* / tenants / tenant_roles / auth.** Zero lines of migration touch those.
- **No student PII in any surfaced payload.** All payloads are numeric or boolean. The identifier link is a one-way hash never exposed to any client.
- **No teacher evaluation.** No trigger records a teacher's user_id in any surfaced field; teacher IDs on lesson_events are dropped at emit-time.
- **No new UI, no new prompts.** Every trigger fires on activity that already exists.
- **Observation-only.** Nothing is written back into curricula, policies, ministry_change_requests, or user-visible state.
- **Failure-isolated.** `mi_emit_event` swallows errors so an observability failure cannot fail a student's homework submission.

---

## What this phase does NOT do (deferred to later phases)

- No aggregation tables yet (MI2).
- No ministry-portal RPCs yet (MI2).
- No dashboard UI yet (MI3).
- No alerts (MI4), recommendations (MI5), or audit trail (MI6).

---

## Files & artifacts touched

- **Two migrations:**
  1. `mi_educational_events` table + enum + helpers + 7 triggers.
  2. Follow-up `REVOKE` migration on the 9 new SECURITY DEFINER functions.
- **No application code changed.** Everything runs at the database layer.

---

## How to verify

```sql
-- Confirm table + policies exist
select relname, relrowsecurity from pg_class where relname = 'mi_educational_events';
select policyname from pg_policies where tablename = 'mi_educational_events';

-- Confirm triggers exist
select tgname from pg_trigger where tgrelid = 'public.assignment_submissions'::regclass;
-- Repeat for the other six source tables.

-- Sanity: a submission should generate exactly one event.
insert into public.assignment_submissions (assignment_id, student_id, content) values (...);
select count(*) from public.mi_educational_events where event_type = 'homework_submission';
```
