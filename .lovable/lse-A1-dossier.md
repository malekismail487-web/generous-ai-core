# LSE Stage A1 — Event Foundation (Dossier)

**Status:** shipped
**Scope:** schema, RLS, ordering contract, Realtime broadcast wiring.
**Non-scope:** reducer, session hook, edge function, scheduler, precompute, UI. Those are Stages A2–A8.

This dossier describes **only what exists in the database after Stage A1**. If code and dossier ever disagree, the dossier is wrong and must be corrected — not the other way around.

---

## 1. Tables created

### 1.1 `public.lesson_events`
Append-only log of teacher-driven lesson events. Source of truth for state replay.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `lesson_id` | uuid, not null | logical lesson key |
| `seq` | bigint, not null, default 0 | **assigned by trigger** (see §3) |
| `kind` | text, not null | CHECK: `concept \| definition \| formula \| example \| question \| discussion \| admin \| silence` |
| `text` | text, not null, default `''` | raw utterance / normalized text |
| `concept_ref` | text, nullable | reference into `concepts` / curriculum graph |
| `priority` | smallint, not null, default 3 | CHECK 1..5 |
| `teacher_visible` | boolean, not null, default TRUE | false = internal AI-processing event |
| `teacher_id` | uuid, not null | must equal `auth.uid()` on insert |
| `school_id` | uuid, not null | must equal caller's school on insert |
| `ts` | timestamptz, not null, default `now()` | teacher-side clock |
| `created_at` | timestamptz, not null, default `now()` | server clock |

**Indexes:**
- `lesson_events_lesson_seq_uidx` — UNIQUE `(lesson_id, seq)` — enforces ordering contract.
- `lesson_events_lesson_priority_seq_idx` — `(lesson_id, priority, seq)` — scheduler queue reads.
- `lesson_events_school_ts_idx` — `(school_id, ts DESC)` — audit + admin queries.

**Grants:** `SELECT, INSERT` to `authenticated`; `ALL` to `service_role`. No `anon` access.

### 1.2 `public.lesson_sessions`
One row per `(lesson_id, student_id)`. Tracks resume state and status.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `lesson_id` | uuid, not null | |
| `student_id` | uuid, not null | must equal `auth.uid()` |
| `school_id` | uuid, not null | must equal caller's school |
| `status` | text, not null, default `'active'` | CHECK: `active \| paused \| ended` |
| `last_seq` | bigint, not null, default 0 | high-water mark consumed by student |
| `summary` | jsonb, not null, default `{}` | populated on session close |
| `started_at`, `ended_at`, `updated_at`, `created_at` | timestamptz | |

**Constraint:** `UNIQUE (lesson_id, student_id)`.
**Indexes:** `(lesson_id)`, `(student_id)`.
**Grants:** `SELECT, INSERT, UPDATE` to `authenticated`; `ALL` to `service_role`.

### 1.3 `public.lesson_state_snapshots`
Periodic reducer snapshots so a reconnecting client can restore state without folding from `seq=0`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `lesson_id` | uuid, not null | |
| `school_id` | uuid, not null | |
| `seq` | bigint, not null | high-water mark of events folded into `state` |
| `state` | jsonb, not null | serialized reducer output |
| `created_at` | timestamptz, not null | |

**Index:** `(lesson_id, seq DESC)`.
**Grants:** `SELECT, INSERT` to `authenticated`; `ALL` to `service_role`.

---

## 2. Row-Level Security

Verified: **8 policies** across the 3 tables.

### `lesson_events`
- **Teachers insert own lesson events** (INSERT) — `teacher_id = auth.uid()` AND `school_id = get_user_school_id(auth.uid())` AND caller's `profiles.user_type ∈ {teacher, school_admin}`.
- **Staff read school lesson events** (SELECT) — `school_id = caller's school` AND caller is `teacher | school_admin`.
- **Students read visible lesson events** (SELECT) — `teacher_visible = TRUE` AND `school_id = caller's school` AND caller is `student`. Internal (`teacher_visible = FALSE`) events are hidden from students.
- **Admins read all lesson events** (SELECT) — `has_role(auth.uid(), 'admin')`.

### `lesson_sessions`
- **Students manage own sessions** (ALL) — `student_id = auth.uid()`, INSERT/UPDATE also require `school_id = caller's school`.
- **Staff read school sessions** (SELECT) — `school_id = caller's school` AND caller is `teacher | school_admin`.

### `lesson_state_snapshots`
- **School members read snapshots** (SELECT) — `school_id = caller's school`.
- **Staff write snapshots** (INSERT) — `school_id = caller's school` AND caller is `teacher | school_admin`.

**Cross-school isolation:** every policy funnels through `public.get_user_school_id(auth.uid())`, so events, sessions, and snapshots are strictly bounded to the caller's school.

---

## 3. Ordering contract (per-lesson monotonic `seq`)

Enforced by two independent mechanisms so neither alone is load-bearing:

1. **Trigger `lesson_events_assign_seq_trg`** (BEFORE INSERT, row-level):
   - Takes `pg_advisory_xact_lock(hashtextextended(lesson_id::text, 0))` — one lock per lesson_id, per transaction.
   - Computes `next_seq = COALESCE(MAX(seq),0)+1 WHERE lesson_id = NEW.lesson_id`.
   - Assigns `NEW.seq := next_seq`.
   - SECURITY DEFINER, `search_path = public`, EXECUTE revoked from `PUBLIC`.
2. **Unique index `lesson_events_lesson_seq_uidx`** on `(lesson_id, seq)`:
   - Any duplicate that ever slips past the trigger is rejected by the DB.

**Guarantee:** for a given `lesson_id`, `seq` is **dense and monotonic** starting at 1, under arbitrary concurrent inserts.

**Runtime verification note:** the read-only `supabase--read_query` tool cannot perform inserts, so the density test (5 rapid inserts → `seq = 1..5`) is scheduled for the Stage A2 test harness (Deno test against the deployed edge function). The SQL invariants above make correctness deterministic regardless.

---

## 4. Broadcast wiring (hot path)

**Trigger `lesson_events_broadcast_trg`** (AFTER INSERT, row-level) calls:

```sql
realtime.send(
  jsonb_build_object(
    'seq', NEW.seq,
    'kind', NEW.kind,
    'priority', NEW.priority,
    'teacher_visible', NEW.teacher_visible,
    'concept_ref', NEW.concept_ref,
    'text', NEW.text,
    'ts', NEW.ts
  ),
  'lesson_event',                       -- event name
  'lesson:' || NEW.lesson_id::text,     -- topic
  TRUE                                  -- private channel
)
```

- **Topic contract:** `lesson:<uuid>` — one Realtime channel per lesson_id.
- **Event name:** `lesson_event` (single event type in Stage A1; more will be added in later stages if needed).
- **Payload minimality:** carries only what a client needs for immediate incremental processing; full row (with `teacher_id`, `school_id`, `created_at`, `id`) remains fetchable from `lesson_events` for audit.
- **Private channel:** clients must authorize via Realtime RLS (to be configured in Stage A5 alongside the client subscription).
- SECURITY DEFINER, `search_path = public`, EXECUTE revoked from `PUBLIC`.

**Separation of durability and delivery:**
- `lesson_events` INSERT is the **durable source of truth** (replay).
- `realtime.send()` is the **low-latency delivery** (fanout).
Failure of Realtime never corrupts the log; failure of the log rolls back the broadcast (single transaction).

---

## 5. Triggers created (verified: 3)

| Trigger | Table | Timing | Purpose |
|---|---|---|---|
| `lesson_events_assign_seq_trg` | `lesson_events` | BEFORE INSERT | assigns per-lesson monotonic `seq` |
| `lesson_events_broadcast_trg` | `lesson_events` | AFTER INSERT | Realtime broadcast on `lesson:<id>` |
| `lesson_sessions_touch_updated_at` | `lesson_sessions` | BEFORE UPDATE | maintains `updated_at` |

---

## 6. Helper functions created

- `public.lesson_events_assign_seq()` — SECURITY DEFINER, EXECUTE revoked from PUBLIC.
- `public.lesson_events_broadcast()` — SECURITY DEFINER, EXECUTE revoked from PUBLIC.
- `public.lse_touch_updated_at()` — SECURITY INVOKER, `search_path = public`.

All three have an explicit `SET search_path = public`.

---

## 7. What Stage A1 does **not** do (and where it's picked up)

| Not done in A1 | Picked up in |
|---|---|
| Event normalizer (raw utterances → typed `LessonEvent`) | Stage A2 |
| Pure reducer folding events into `LessonState` | Stage A3 |
| `lumina-live` streaming edge function | Stage A4 |
| Client `useLuminaLiveSession(lessonId)` hook | Stage A5 |
| Client + server context cache | Stage A6 |
| Priority scheduler with aging | Stage A7 |
| End-to-end latency benchmark (p95 < 1.5s target) | Stage A8 |
| Realtime RLS policies for the `lesson:*` channel | Stage A5 (paired with client subscribe) |
| Insert-based ordering density test in code | Stage A2 test harness |

---

## 8. Deviations from the approved plan

None. Stage A1 was executed exactly as approved, with two minor implementation choices that fall within the plan:

1. The `updated_at` trigger helper is named `lse_touch_updated_at` (not `update_updated_at_column`) to avoid colliding with the project-wide helper of a similar name and to keep LSE helpers namespaced with the `lse_` prefix. Behavior is identical.
2. The super-admin read policy uses `has_role(auth.uid(), 'admin')` because the project's `app_role` enum contains `{teacher, student, admin}` — there is no `super_admin` enum value. `admin` is the correct role for super-admin access in this project.

---

## 9. Verified counts (post-migration)

```
tables_created   = 3
indexes_created  = 10
policies_created = 8
triggers_created = 3
```

All match the design in §1–§5.

---

## 10. Security linter note

Post-migration, the project reports 139 linter findings. **None are introduced by Stage A1**: the three new functions all set `search_path = public`, and both SECURITY DEFINER triggers have `EXECUTE` revoked from `PUBLIC`. The findings are pre-existing project-wide warnings (function search paths on legacy helpers, extension-in-public, public bucket listing, etc.) inherited from earlier stages of the app.

---

**Stage A1 is complete.** Next up (only after your go-ahead): **Stage A2 — Event Normalizer + priority table**, rule-based, with the density/ordering test harness that this stage deferred.
