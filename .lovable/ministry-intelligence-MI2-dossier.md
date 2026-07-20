# Ministry Intelligence — MI2 Dossier

**Phase:** MI2 — Aggregation Engine & Ministry Insight RPCs
**Status:** Shipped
**Depends on:** MI1 (observation pipeline)

---

## What this phase actually built

### 1. `mi_daily_rollups` — pre-aggregated slice table

Every row is one `(tenant × school × region × subject × grade × event_type × day)` slice.

| Column | Notes |
|---|---|
| `tenant_id` | NOT NULL, CASCADE with tenant. |
| `school_id` / `region_id` / `subject_id` | Nullable — a row can be a national or regional slice. |
| `grade_level` | text (matches source-table types). |
| `event_type` | `mi_event_type` enum from MI1. |
| `day` | date. |
| `event_count` | integer — number of events in the slice. |
| `distinct_actors` | integer — COUNT(DISTINCT `student_hash`). Never de-anonymized. |
| `avg_score` | numeric — average of `payload.score` when present. |
| `sum_signal` | numeric — `grade` ∪ `score` ∪ `length` ∪ 1 as a generic "activity" measure. |
| `computed_at` | when the row was written. |

Unique slice guard `mi_rollups_unique_slice` collapses NULLs to a sentinel UUID / empty string so the aggregation is idempotent.

Indexes on `(tenant_id, day)`, `(school_id, day)`, `(region_id, day)`, `(subject_id, day)`.

**RLS:** authenticated SELECT only, plus two policies — `is_super_admin_caller()` or matching `school_admins.user_id = auth.uid()`. Ministry portal reads via RPCs (below), not direct table access.

### 2. `mi_insights` — surfaced findings

Enums:
- `mi_insight_severity` — `info`, `watch`, `concern`, `urgent`.
- `mi_insight_scope` — `national`, `regional`, `school`.

Fields include `title`, `summary`, `evidence` (jsonb), `window_start` / `window_end`, and `acknowledged_at`. Same tenant/school RLS shape as rollups. Populated by MI4 (alerts) and MI5 (recommendations); the table is live now so those phases can write into it without another migration.

### 3. `mi_run_daily_aggregation(target_day date)` — aggregation engine

`SECURITY DEFINER`, `search_path = public`. Deletes then re-inserts the target day (idempotent), so re-running never double-counts. Returns `{ day, rollups_written }`. EXECUTE revoked from PUBLIC / anon / authenticated — invoked only by the edge function via the service role.

### 4. Ministry-facing RPCs

All four validate the caller with `ministry_sessions.session_token` and enforce tenant scope. All are `SECURITY DEFINER` and callable by `anon` / `authenticated` (ministry portal is anonymous, gated by the session token).

| RPC | Returns |
|---|---|
| `mi_national_overview(session, days)` | totals by event type, active-schools count, active-regions count, per-day activity series. |
| `mi_regional_breakdown(session, days)` | per-region row: region name, event count, distinct school count. |
| `mi_school_snapshot(session, school_id, days)` | totals by event, top subjects. Rejects if `schools.tenant_id` ≠ session's tenant. |
| `mi_list_insights(session, limit)` | latest insights for the tenant. |

Everything else is filtered by `tenant_id = session.tenant_id` inside the definer — no cross-tenant leakage possible even if a caller supplies a foreign school id.

### 5. `mi-aggregate` edge function

`supabase/functions/mi-aggregate/index.ts`. Standard CORS. Reads optional `{ day: "YYYY-MM-DD" }` from POST body, defaults to yesterday. Uses the service role to call `mi_run_daily_aggregation`. Returns `{ ok, result }` or a 500 with the error message.

### 6. Nightly cron

- Extensions: `pg_cron`, `pg_net` (enabled via `CREATE EXTENSION IF NOT EXISTS`).
- Job: `mi-aggregate-nightly`, cron expression `15 2 * * *` (02:15 UTC daily).
- Any previous job with the same name is unscheduled first, so the migration is safe to re-run.
- Job posts to the deployed `mi-aggregate` function URL with the publishable key.

---

## Guarantees preserved

- Zero touch on ALE, LSE, KT/FSRS/IRT, bandit, ensemble, ability estimates, tenants, tenant_roles, or auth.
- Rollups never store `student_hash` — only `distinct_actors` counts derived from it. No path from a rollup back to a student.
- No PII is ever surfaced. RPCs return numbers and IDs; identifiable text (names, emails, message bodies) is not part of the aggregation set.
- No teacher evaluation surface: rollups are keyed by school / region / subject / grade, never by teacher user id.
- Cross-tenant isolation is enforced twice: RLS on the tables and the tenant check inside every RPC.
- Aggregation is idempotent — re-running the same day is safe.

---

## What this phase does NOT do

- No dashboard UI (MI3).
- No alert generation (MI4) or recommendation generation (MI5).
- No audit trail on insight acknowledgements (MI6).
- No AI-generated insight text yet — MI2 only lays the storage + RPCs for MI4/MI5 to write into.

---

## How to verify

```sql
-- Manually run today's aggregation
SELECT public.mi_run_daily_aggregation( (current_date - 1)::date );

-- Confirm cron job exists
SELECT jobname, schedule FROM cron.job WHERE jobname = 'mi-aggregate-nightly';

-- Check RPCs from ministry portal path (with a valid session token)
SELECT public.mi_national_overview('<session_token>', 30);
```
