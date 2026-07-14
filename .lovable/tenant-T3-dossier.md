# Curriculum & Localisation Propagation — Phase T3 Dossier

**Status:** shipped.
**Scope:** every country tenant now owns its curriculum defaults — subject seed, grading system, academic calendar, language stack, and curriculum framework. Schools created inside a tenant inherit them at seed time. Clients read the whole configuration through one RPC.

If code and dossier disagree, the dossier is wrong.

---

## 1. Files added / modified

| Path | Kind | Purpose |
| --- | --- | --- |
| `supabase/migrations/…_tenant_curriculum_localisation.sql` | migration | Adds `tenants.default_subjects`, seeds Saudi Arabia, rewrites `seed_default_subjects`, and introduces `get_tenant_config` + `update_tenant_defaults`. |
| `src/hooks/useTenantConfig.tsx` | new | React Query wrapper over `get_tenant_config()`; ships typed `TenantConfig`, `GradingSystem`, `AcademicCalendar`, `DefaultSubject`, plus a `gradeFor()` helper. |
| `src/components/admin/TenantDefaultsEditor.tsx` | new | Super-Admin editor: JSON-backed forms for subjects, grading, calendar, language stack, framework. Calls `update_tenant_defaults`. |
| `src/components/admin/TenantsPanel.tsx` | edit | Each tenant row now embeds the defaults editor and loads the JSON columns from the raw table read. |
| `.lovable/tenant-T3-dossier.md` | new | This document. |

No changes to A1–A10 live-lesson pipeline, adaptive engine, `useLuminaLiveSession`, `lumina-live` edge function, or any student-facing screen. Existing schools keep their existing subjects.

---

## 2. Schema

`public.tenants.default_subjects jsonb NOT NULL DEFAULT '[]'::jsonb`

Ordered array of subject seeds. Each element:

```json
{ "slug": "arabic", "name": "اللغة العربية", "emoji": "🕌", "color": "from-amber-500 to-yellow-600" }
```

All other configuration lives in the JSONB columns that T1 already reserved:
- `grading_system`
- `academic_calendar`
- `default_language`, `supported_languages`
- `curriculum_framework`
- `ai_config`

---

## 3. Saudi Arabia seed (executed inline by the migration)

- 12 subjects — Arabic, Islamic Studies, English, Mathematics, Biology, Physics, Chemistry, Social Studies, KSA History, Technology, Art & Design, Entrepreneurship.
- Grading: percentage-based, pass mark 60, letter bands A+ → F with GPA out of 4.0.
- Calendar: 3 terms, academic year Aug–Jun, week starts Sunday, weekend Fri/Sat.
- Curriculum framework: `sa-moe-2024`.

Written via `UPDATE public.tenants … WHERE slug = 'sa'` so a re-run is a no-op if the tenant has already been edited by hand.

---

## 4. `seed_default_subjects(p_school_id)` — now tenant-aware

Old behaviour: hardcoded 12-entry JSON literal.
New behaviour:

1. Resolves `tenant_id` from `schools.tenant_id`.
2. Reads `tenants.default_subjects` for that tenant.
3. Falls back to a 3-subject universal minimum (Mathematics / English / Science) **only** when the tenant's seed is empty. This guarantees new schools always end up with at least the core three, even if a tenant has been mis-provisioned.

Called from:
- `create_school` (via `activate_school_with_code`)
- Super-Admin school provisioning (via `handle_super_admin_create_school`)
- Backfill DO blocks (existing schools already have subjects — the ON CONFLICT clause makes this idempotent).

---

## 5. `get_tenant_config()` — the single client read

```
SECURITY DEFINER  STABLE  search_path = public
GRANT EXECUTE TO authenticated
```

Returns the caller's tenant as a JSONB object:

```json
{
  "id":"…","slug":"sa","country_name":"Kingdom of Saudi Arabia","country_code":"SA",
  "ministry_name":"Ministry of Education",
  "default_language":"ar","supported_languages":["ar","en"],
  "curriculum_framework":"sa-moe-2024",
  "grading_system":{ "type":"percentage","pass_mark":60,"scale":[…] },
  "academic_calendar":{ "year_start_month":8,…,"terms":[…] },
  "default_subjects":[ … ],
  "ai_config":{ … },
  "status":"active"
}
```

Returns `NULL` for callers with no tenant (super admin, unassigned). Consumed by `useTenantConfig()` (5-minute stale time, 30-minute GC).

---

## 6. `update_tenant_defaults(...)` — Super-Admin write

Signature:
```
p_tenant_id            uuid,
p_default_subjects     jsonb  DEFAULT NULL,
p_grading_system       jsonb  DEFAULT NULL,
p_academic_calendar    jsonb  DEFAULT NULL,
p_default_language     text   DEFAULT NULL,
p_supported_languages  text[] DEFAULT NULL,
p_curriculum_framework text   DEFAULT NULL
```

- `NULL` arguments leave the existing value untouched.
- Guarded by `public.is_super_admin(auth.uid())`; returns `{success:false, error:'Not authorised'}` otherwise.
- Never touches other tenant fields (`slug`, `country_code`, `status`, `is_visible`) — those are lifecycle-only and belong to T1/T6 RPCs.

The `TenantDefaultsEditor` component is the only current caller.

---

## 7. Frontend contract

```tsx
const { config, loading } = useTenantConfig();

if (config) {
  const band = gradeFor(studentScore, config.grading_system);
  const language = config.default_language;
  const subjects = config.default_subjects;
  const terms   = config.academic_calendar.terms;
}
```

Consumers built on top of `useTenantConfig` MUST:
- treat `config === null` as "no tenant context yet" (loading OR super admin) and render a neutral fallback,
- never mutate the returned object — writes go through `update_tenant_defaults` (super admin) or a future T4 curriculum-authoring RPC.

---

## 8. What T3 intentionally does NOT do

- Does not migrate existing schools to a new subject set — that would silently rewrite teacher data. Migrations of existing schools are a Super-Admin action, out of scope for T3.
- Does not enforce a tenant's grading scale on `report_cards`, `assessment_scores`, or `submissions` yet — the scale is *available* through the hook; enforcement belongs to a future report-card pass.
- Does not localise the app UI to `default_language` automatically — the existing `useThemeLanguage` still holds. T3 exposes the tenant preference; T4 will wire per-tenant UI defaults where they matter.
- No changes to A1–A10, `useLuminaLiveSession`, `lumina-live`, or the adaptive engine.

---

## 9. What T4+ must consume (never bypass)

- **Any new per-country configuration** goes into a `tenants` JSONB column (or a dedicated tenant-scoped table) and is surfaced through `get_tenant_config()` — never through a new one-off RPC.
- **Any new default-seed function** (grade levels, question banks, rubrics) MUST resolve `tenant_id` from `schools.tenant_id` and read from `tenants.<field>`, mirroring the `seed_default_subjects` pattern.
- **Any new Super-Admin editor** for tenant config uses `update_tenant_defaults` (extend its signature) rather than raw `UPDATE public.tenants …`.
- **The `gradeFor()` helper** is the single source of truth for percentage → letter/GPA conversion; do not re-implement it inline.

---

## 10. Roadmap after T3

| Phase | Scope |
| --- | --- |
| T4 | Ministry-authored content + per-tenant feature flags (announcements, exam windows, module toggles). |
| T5 | Tenant analytics isolation + Super-Admin-only cross-tenant observatory. |
| T6 | Tenant lifecycle automation (self-serve provisioning, data residency, retention, billing hooks). |

T1, T2, T3 shipped. Three phases remain.
