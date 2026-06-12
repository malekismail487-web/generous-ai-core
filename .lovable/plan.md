# Teacher Categories — separate system, synced (optionally) with Subjects

## What's broken today

`SubjectsManager` and `TeacherCategoriesManager` both write to the same `subjects` table. So when you add a "Physics" teacher category, it appears as a Physics tile in the student Subjects tab. That's the root cause. We need a real split.

## End state

- **Subjects** = student-facing tiles (Subjects tab + lecture studio). Owned by admin in the **Subjects** panel.
- **Teacher Categories** = teacher-facing roles (upload scope, dashboard label, invite pool). Owned by admin in the **Teacher Categories** panel.
- **Sync Mode (per school, default ON)**: creating/deleting one mirrors the other and links them. OFF: the two lists are fully independent.
- **Defaults**: on school activation, seed 12 default subjects AND 12 default teacher categories, linked 1:1. The moment admin edits either list, the defaults on that side are no longer special — admin owns it.
- **Auto invite pool per category**: every teacher category automatically has its own always-on, multi-use invite code. Using that code → teacher is created locked to that category, lands on a dashboard labeled with the category. Admin can rotate the code; admin can also issue one-off single-use codes from the category card.
- **No manual role assignment.** Removed from the UI.
- **Free-text emoji and color**: admin types any character (emoji from their keyboard, letter, symbol) into the emoji field — no preset picker. Color is a hex picker.

## Admin UI — revamped Teacher Categories panel

Card grid styled like pricing tiers (Pro/Business/Enterprise visual metaphor, not the labels). Each card:

```text
┌──────────────────────────────┐
│ 🎵  Music Teacher            │  emoji + name (both editable inline)
│ Linked subject: Music ✓      │  shown only when Sync ON and linked
│                              │
│ 4 teachers · 12 uploads      │
│                              │
│ Invite code: MUS-7K2QA9      │  always-on, copy + rotate buttons
│ [Generate one-off code]      │
│                              │
│ [Edit]   [Delete]            │
└──────────────────────────────┘
```

Top of panel: **Sync Mode** switch, **+ New category** button, and a banner explaining what sync does.

## Technical Details

### Database (one migration)

1. New table `teacher_categories`:
  - `id`, `school_id`, `name`, `emoji TEXT` (free text, no preset constraint), `color TEXT` (hex), `is_default BOOLEAN`, `subject_id UUID NULL` (FK → subjects, set when synced/linked), `permanent_invite_code TEXT UNIQUE`, timestamps.
  - GRANTs for authenticated + service_role; RLS: school admins CRUD own school, teachers SELECT own school.
2. `profiles.teacher_category_id UUID` (FK → teacher_categories ON DELETE SET NULL) — replaces the misused `teacher_subject_id` for new teachers. Keep `teacher_subject_id` column for back-compat until migrated.
3. `invite_codes`: add `teacher_category_id UUID NULL` (FK). When a teacher consumes a code that has this set, the new profile gets `teacher_category_id` written.
4. `seed_default_teacher_categories(p_school_id)` SQL function — inserts the same 12 defaults as subjects, each linked to the matching default subject, each with a freshly generated permanent code. Called from `activate_school_with_code`. Backfill once for existing schools.
5. Trigger `teacher_categories_after_insert` → if Sync ON and no `subject_id` yet → insert matching subject and link. Trigger `teacher_categories_after_delete` → if Sync ON and linked subject exists → delete subject + cascade unused invites + null out `profiles.teacher_category_id`. Mirror triggers on `subjects` for the other direction.
6. SQL function `rotate_teacher_category_code(p_category_id)` → admin-only, regenerates the permanent code.
7. **Cleanup of bad data**: drop the stray "Physics" (and any other admin-created) rows in `subjects` that were meant as teacher categories. Targeted by `is_default=false` in your school; you'll confirm the migration before it runs.

### Edge function `invite-codes`

- Replace `subject_id` parameter with `teacher_category_id` for `role='teacher'`. Required.
- Verify the category belongs to caller's school.
- Single-use codes continue to be 8-char + 24h expiry.
- "Permanent" codes live on `teacher_categories.permanent_invite_code` and are consumed by the signup flow without expiring or being marked used.

### Signup flow (`signup_with_invite_code` + permanent code path)

- If consumed code has `teacher_category_id`, write it onto the new profile and assign `teacher` role.
- New code path: if the user enters a permanent category code (matched against `teacher_categories.permanent_invite_code`), create an `invite_request` bound to that category without consuming a row in `invite_codes`.

### Frontend

- `**SubjectsManager.tsx**` — keep, but free-text emoji input (no preset grid), remove anything that mentions teachers/invites. It only manages student subject tiles now.
- `**TeacherCategoriesManager.tsx**` — full rewrite: card grid above, separate `teacher_categories` queries, free-text emoji input, always-on code with copy/rotate, "Generate one-off code" button, Sync Mode switch lives here and in Subjects (same value, mirrored).
- `**useTeacherCategories.tsx**` — new hook, realtime subscribed.
- `**TeacherDashboard` header** — read `teacher_category_id` → show "{emoji} {name} Teacher" in the header. Subject lock in `TeacherMaterials` switches from `teacher_subject_id` to the category's linked `subject_id` (falls back to category name if no link).
- **Admin People sidebar** — remove the manual "assign teacher to subject" UI. Replaced by the per-category invite codes.

### Backwards compatibility

- Existing teachers with `teacher_subject_id` set keep working. A one-time backfill in the migration creates/links a teacher category per used subject and copies the FK over.
- Existing teacher invite codes with `subject_id` set get `teacher_category_id` filled in via the same backfill.

## Out of scope

- No changes to lecture studio, curriculum graph, AI features, or any non-admin/non-teacher surface.
- Category-themed dashboard colors — you chose label-only scope.
- And just so you know the music teacher is an example, but you should not only stop at the music teacher. It should basically be any type of category. The admin will ever create. I'm telling you this, not to take the example literally but to understand the goal and also to understand the example.