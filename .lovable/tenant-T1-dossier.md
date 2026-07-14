# Multi-Tenant Foundation — Phase T1 Dossier

**Status:** shipped.
**Scope:** foundational tenant/country layer. Every future ministry, school, teacher, and student capability plugs *into* this — nothing may bypass it.

If code and dossier disagree, the dossier is wrong.

---

## 1. Files added / modified

| Path | Kind | Purpose |
| --- | --- | --- |
| `supabase/migrations/…_multi_tenant_foundation.sql` | migration | Tables, RLS, backfill, RPCs. |
| `src/hooks/useTenant.tsx` | new | Reads the caller's current tenant + list of active/visible tenants. |
| `src/components/admin/TenantsPanel.tsx` | new | Super-Admin surface: list, provision, activate, suspend tenants. |
| `src/hooks/useRoleGuard.tsx` | edit | Exposes `tenantId` (from `school.tenant_id`). `School` type gains `tenant_id`. |
| `src/hooks/useSchoolAdmin.tsx` | edit | `createSchool` now writes `tenant_id` (defaults to Saudi tenant). |
| `src/components/admin/LCTPanel.tsx` | edit | `lct_exams` insert now writes `tenant_id`. |
| `src/pages/MinistryLogin.tsx` | edit | Persists `tenant_id` from `verify_ministry_code` into `sessionStorage`. |
| `src/components/SuperAdminPanel.tsx` | edit | New **Tenants** tab. |
| `.lovable/tenant-T1-dossier.md` | new | This document. |

No changes to `src/lib/lse/*`, `useLuminaLiveSession`, `lumina-live` edge function, adaptive engine, or any student-facing screen.

---

## 2. Schema

### `public.tenants`
One row per country. Ministry, curriculum framework, languages, grading, calendar, AI config, status, visibility.

- `status ∈ {active, provisioning, suspended}`
- `is_visible` (bool) — must be true for a country to appear in *any* picker
- Unique on `slug` and `country_code`
- RLS:
  - `authenticated` may SELECT rows where `status='active' AND is_visible=true`
  - Super Admin has full `ALL` access

### `public.tenant_roles`
Ministry-level role assignments scoped to a single tenant.
- `role ∈ {ministry_admin, ministry_analyst, ministry_curriculum}`
- Unique `(user_id, tenant_id, role)`
- RLS: role holder reads own rows; Super Admin manages all.

### `tenant_id` added to
```
schools, curriculum_standards, curriculum_versions,
ministry_access_codes, ministry_access_requests, ministry_sessions,
ministry_ip_bans, moderator_invite_codes,
lct_exams, lct_exam_students, lct_exam_locks
```
All backfilled to the seeded Saudi tenant, then `SET NOT NULL`.

Every other table inherits tenant transitively via `school_id → schools.tenant_id`. No columns added there.

---

## 3. Helpers (SECURITY DEFINER, `search_path=public`)

| Function | Contract |
| --- | --- |
| `get_user_tenant_id(uid)` | resolves via `profiles.school_id → schools.tenant_id`. Returns `NULL` for users without a school (Super Admin, ministry-only). |
| `is_super_admin(uid)` | thin wrapper over existing `is_super_admin_user`. Used inside RLS policies. |
| `has_tenant_role(uid, tenant, role_name)` | `EXISTS` against `tenant_roles`. |

---

## 4. Tenant boundary — RLS pattern

Applied as **RESTRICTIVE** policies (AND-combined with existing school/user policies — never a replacement) to:

```
schools, curriculum_standards, curriculum_versions,
lct_exams, lct_exam_students, lct_exam_locks
```

Shape:

```sql
USING (
  public.is_super_admin(auth.uid())
  OR tenant_id = public.get_user_tenant_id(auth.uid())
)
```

Ministry tables (`ministry_access_codes`, `ministry_sessions`, `ministry_ip_bans`, `ministry_access_requests`, `moderator_invite_codes`) are only touched through `SECURITY DEFINER` RPCs that already carry the tenant in the session — no top-level RESTRICTIVE policy is needed and adding one would break the unauthenticated `verify_ministry_code` flow.

---

## 5. Ministry rewrites

### `verify_ministry_code`
- Now resolves `tenant_id` from `ministry_access_codes` and:
  1. writes it into the new `ministry_access_requests.tenant_id`,
  2. returns it in the JSON response.
- `MinistryLogin.tsx` stashes it as `sessionStorage['ministry_tenant_id']` for downstream views.

### `get_ministry_dashboard_data`
- Reads `tenant_id` from the caller's `ministry_sessions` row.
- Every sub-query is filtered by joining `schools` and requiring `s.tenant_id = <session tenant>`.
- **Correctness fix:** previously this RPC returned data from every school globally; a Saudi ministry session would have seen Egyptian data the moment Egypt existed.

---

## 6. Tenant lifecycle RPCs (Super Admin only)

| RPC | Purpose |
| --- | --- |
| `get_active_tenants()` | returns only `status='active' AND is_visible=true`. Safe for any picker. Callable by any authenticated user. |
| `provision_tenant(payload jsonb)` | inserts a tenant with `status='provisioning'`, `is_visible=false`. Payload keys: `slug`, `country_name`, `country_code`, `ministry_name`, `default_language`, `supported_languages`, `curriculum_framework`, `grading_system`, `academic_calendar`, `ai_config`. |
| `activate_tenant(id)` | flips `status='active'`, `is_visible=true`. This is what makes a country appear in pickers. |
| `suspend_tenant(id)` | flips `status='suspended'`, `is_visible=false`. |

Each provisioning RPC checks `is_super_admin_user(auth.uid())` and returns `{success, error?}`.

---

## 7. Seeded tenant

```
slug='sa', country_code='SA', country_name='Kingdom of Saudi Arabia',
ministry_name='Ministry of Education',
default_language='ar', supported_languages=['ar','en'],
curriculum_framework='sa-moe-2024',
status='active', is_visible=true
```

Every pre-existing school and every row in the tables listed in §2 now points at this tenant.

---

## 8. Frontend integration points

- `useRoleGuard()` now returns `tenantId`. Consumers that need to write tenant-scoped rows read it from here.
- `useTenant()` returns `{ tenantId, currentTenant, activeTenants }`. Any future country picker consumes `activeTenants` — since only Saudi Arabia is active, the list contains exactly one entry, satisfying the "no coming-soon countries" rule.
- Super Admin → **Tenants** tab drives the full lifecycle (list, provision, activate, suspend).

---

## 9. Non-goals for T1

- No ministry-authored feature generation. This layer makes that possible; it doesn't implement it.
- No cross-tenant sharing primitives (consortiums, comparative analytics).
- No changes to A1–A10 live-lesson pipeline, adaptive engine, or student surfaces.
- No new dashboards; only the ministry dashboard's correctness is fixed.
- No country picker in `MinistryLogin` — code-based binding continues to work; the tenant follows automatically.

---

## 10. What T2+ must consume (never bypass)

- **All new tables must include `tenant_id` NOT NULL** and either add the same RESTRICTIVE tenant boundary policy or inherit tenant via `school_id`.
- **All new SECURITY DEFINER RPCs that read cross-school data must filter by tenant** — the ministry dashboard fix is the pattern.
- **Any country selector uses `get_active_tenants()`** — never a raw `SELECT * FROM tenants`. That RPC is the single point of truth for visibility.
- **Ministry sessions carry a tenant** (`ministry_sessions.tenant_id`). Any new ministry RPC accepting `p_session_token` must read it from that row, never from client input.
- **Provisioning is a two-step commitment**: `provision_tenant` (hidden) → `activate_tenant` (visible). Never activate directly on insert.
