
# Lumina Multi-Tenant Architecture — Foundation Plan (Phase T1)

Goal: make **country** a first-class object (`tenant`) that owns schools, ministry, curriculum, and analytics — without breaking any existing feature. This phase lands the foundation only. Every future ministry / school / teacher / student capability plugs into it afterwards.

Initial active tenant: **Saudi Arabia**. No other country appears anywhere until activated.

---

## What lives where

```text
Global (shared, tenant-agnostic)
├─ Lumina AI core, ALE, edge functions, auth framework, UI shell
└─ Super Admin (single global role)

Tenant (one per country — Saudi Arabia today)
├─ Ministry (codes, sessions, dashboard, curriculum authority)
├─ Configuration (language, grading, calendar, curriculum versions)
└─ Schools
     ├─ Admins, Teachers, Students, Parents
     ├─ Materials, Assignments, Live meetings, Notes…
     └─ Analytics
```

---

## Deliverables

### 1. New table: `public.tenants`
Country-level record. Fields (domain-specific):
- `slug` (e.g. `sa`, `eg`) — stable identifier
- `country_name`, `country_code` (ISO-3166 alpha-2)
- `ministry_name`
- `default_language`, `supported_languages[]`
- `grading_system` (jsonb: scale, pass mark, letter map)
- `academic_calendar` (jsonb: term structure, start month)
- `curriculum_framework` (text, e.g. `sa-moe-2024`)
- `ai_config` (jsonb: ministry-approved model behaviour overrides)
- `status`: `active | provisioning | suspended`
- `is_visible` (bool) — controls whether the country appears in any picker

RLS: readable by anyone authenticated for **active + visible** tenants (needed for country selectors); full-row read/write only for Super Admin.

### 2. Add `tenant_id` to existing tables
Nullable at first, backfilled to the Saudi tenant, then made `NOT NULL`.

- `schools.tenant_id` → `tenants.id`
- `curriculum_standards.tenant_id`
- `curriculum_versions.tenant_id`
- `ministry_access_codes.tenant_id`
- `ministry_access_requests.tenant_id`
- `ministry_sessions.tenant_id`
- `ministry_ip_bans.tenant_id`
- `moderator_invite_codes.tenant_id` (moderators are tenant-scoped, not global)
- `lct_exams.tenant_id`, `lct_exam_students.tenant_id`, `lct_exam_locks.tenant_id`
- `announcements` / `trips` inherit tenant via school (no direct column needed)

All other tables already inherit tenant transitively through `school_id`; no new columns needed there, only stricter RLS helpers.

### 3. New helpers (SECURITY DEFINER)
- `public.get_user_tenant_id(uid uuid) → uuid`
  - resolves via `profiles.school_id → schools.tenant_id`
  - falls back to `ministry_sessions.tenant_id` when called from a ministry session context
- `public.is_super_admin(uid uuid) → bool` (thin wrapper over existing check, used in policies)
- `public.has_tenant_role(uid uuid, tenant uuid, role text) → bool`
  - `role ∈ {ministry_admin, ministry_analyst, ministry_curriculum}`
  - reads a new `public.tenant_roles` table (`user_id, tenant_id, role`, unique)

### 4. RLS updates
For every table listed above, add a top-level tenant guard:

```sql
USING (
  public.is_super_admin(auth.uid())
  OR tenant_id = public.get_user_tenant_id(auth.uid())
)
```

Ministry-scoped tables also allow rows where the session's ministry token matches (`ministry_sessions.tenant_id = row.tenant_id`).

Existing school/user policies remain — the tenant guard is an **additional** filter, never a replacement.

### 5. Ministry system rewrite (surgical)
- `ministry_access_codes` gain `tenant_id` — one code family per country.
- `verify_ministry_code` returns `tenant_id` in its JSON so the client stores it in `ministry_sessions`.
- `get_ministry_dashboard_data(p_session_token)` filters every sub-query by `tenant_id` from the session row (today it returns global data — this is the biggest correctness fix).
- New RPC `get_active_tenants()` returns only `status='active' AND is_visible=true` tenants for pickers.

### 6. Ministry / country pickers in the UI
- `MinistryLogin.tsx`: no country picker today. After code verification, the response tells the client which tenant they're in — no UI change unless a picker is later needed.
- Any future country dropdown consumes `get_active_tenants()`. Since only Saudi Arabia is active, the list contains exactly one entry — matches the "clean, no coming-soon" rule.
- Super Admin panel gets a new **Tenants** tab (list, provision, activate/suspend, edit config).

### 7. Tenant provisioning workflow (Super Admin only)
New RPC `provision_tenant(payload jsonb)` that in one transaction:
1. inserts a `tenants` row (`status='provisioning'`, `is_visible=false`),
2. seeds default curriculum framework record,
3. reserves a ministry access code slot (empty until Super Admin generates one),
4. returns the new `tenant_id`.

Activation is a separate RPC `activate_tenant(tenant_id)` that flips `status='active'`, `is_visible=true`. This is what makes the country appear in pickers.

### 8. Seed Saudi Arabia
Insert one row:
- `slug='sa'`, `country_code='SA'`, `country_name='Kingdom of Saudi Arabia'`
- `ministry_name='Ministry of Education'`
- languages `['ar','en']`, default `ar`
- `status='active'`, `is_visible=true`

Backfill:
- `UPDATE schools SET tenant_id = <sa>` for every existing school
- Same for the ministry / curriculum tables listed above
- Then `ALTER … SET NOT NULL`

### 9. Dossier
Write `.lovable/tenant-A1-dossier.md` documenting:
- files added / modified
- exact RLS pattern chosen and why
- helper function contracts
- backfill steps performed
- what phase T2+ must consume (never bypass)

---

## What this phase intentionally does NOT do

- No ministry-authored feature generation (that's a separate future phase — this only makes it possible).
- No changes to the AI core, ALE, edge-function orchestration, live-lesson pipeline (A1–A10), or existing student/teacher screens.
- No new dashboards, no new analytics — only the existing ministry dashboard is corrected to be tenant-scoped.
- No cross-tenant sharing primitives yet (research consortiums, comparative analytics) — deferred.

---

## Technical section (for reviewers)

**Migration order (single migration file):**
1. `CREATE TABLE public.tenants` + GRANTs + RLS + policies.
2. `CREATE TABLE public.tenant_roles` + GRANTs + RLS + policies.
3. Add nullable `tenant_id` columns to the tables in §2, plus FK to `tenants(id)`.
4. Insert Saudi tenant.
5. Backfill `tenant_id = <sa>` on all rows.
6. `ALTER … SET NOT NULL`.
7. Create/replace helper functions (`get_user_tenant_id`, `has_tenant_role`, `is_super_admin`).
8. `DROP POLICY … ; CREATE POLICY …` for each affected table adding the tenant guard.
9. Replace `get_ministry_dashboard_data`, `verify_ministry_code` with tenant-aware versions.
10. Create `provision_tenant`, `activate_tenant`, `get_active_tenants` RPCs.

**Frontend touch list (minimum):**
- `src/hooks/useRoleGuard.tsx` — expose `tenantId` from the profile→school join.
- `src/pages/MinistryLogin.tsx` — persist `tenant_id` from `verify_ministry_code` response.
- `src/pages/MinistryDashboard.tsx` — no logic change; already reads whatever `get_ministry_dashboard_data` returns.
- `src/components/SuperAdminPanel.tsx` — new **Tenants** tab wired to the three new RPCs.
- New file `src/hooks/useTenant.tsx` — tiny React Query wrapper around `get_active_tenants()` + current tenant.

**Non-goals for code:** no changes to `src/lib/lse/*`, `useLuminaLiveSession`, `lumina-live` edge function, adaptive engine files, or any student-facing screen.

**Approval gates:** the migration is one call and requires user approval before running. Frontend changes ship after the migration succeeds and Supabase types regenerate.
