# Ministry-Authored Content & Per-Tenant Feature Flags — Phase T4 Dossier

**Status:** shipped.
**Scope:** every country tenant can now be configured independently through two orthogonal surfaces — a **feature-flag registry** (module toggles) and **ministry announcements** (country-wide notices). Both are authored by the Super Admin and consumed by any signed-in user in the matching tenant.

If code and dossier disagree, the dossier is wrong.

---

## 1. Files added / modified

| Path | Kind | Purpose |
| --- | --- | --- |
| `supabase/migrations/…_t4_t5_features_analytics.sql` | migration | Adds `tenant_feature_flags`, `ministry_announcements`, `tenant_analytics_view`, plus the T4/T5 RPCs. |
| `src/hooks/useFeatureFlag.tsx` | new | Read-only hook returning `{ enabled, config, record, loading }` for the caller's tenant. |
| `src/hooks/useMinistryAnnouncements.tsx` | new | React Query wrapper returning published announcements visible to the caller. |
| `src/components/admin/FeatureFlagsEditor.tsx` | new | Super-Admin editor embedded per-tenant. Uses `list_feature_flags` / `set_feature_flag`. |
| `src/components/admin/MinistryAnnouncementsEditor.tsx` | new | Super-Admin authoring surface for country-wide announcements. |
| `src/components/admin/TenantsPanel.tsx` | edit | Mounts both editors under each tenant row. |
| `.lovable/tenant-T4-dossier.md` | new | This document. |

No changes to A1–A10 live-lesson pipeline, adaptive engine, `useLuminaLiveSession`, `lumina-live` edge function, or any student-facing screen. Existing behaviour is preserved because Saudi Arabia is seeded with **all** catalog flags enabled.

---

## 2. Schema — `public.tenant_feature_flags`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `tenant_id` | uuid FK → `tenants(id)` ON DELETE CASCADE | |
| `flag_key` | text | Lower-case identifier, unique per tenant |
| `enabled` | boolean | Authoritative on/off value |
| `config` | jsonb | Optional per-flag configuration (default `{}`) |
| `description` | text | Human-readable purpose |
| `created_at` / `updated_at` | timestamptz | Trigger-managed |

Unique key: `(tenant_id, flag_key)`. Trigger `trg_tenant_feature_flags_updated` refreshes `updated_at`.

### RLS

- **SELECT** — `is_super_admin(auth.uid())` OR `tenant_id = get_user_tenant_id(auth.uid())`.
- **ALL other actions** — `is_super_admin(auth.uid())`.

### Seed

Saudi Arabia (`slug = 'sa'`) is seeded with a documented catalog, all `enabled = true`:

```
lct_exams, ai_podcasts, mind_maps, parent_portal,
moderation_console, lumina_live, study_buddy, cognitive_mirror
```

These are the **canonical flag keys** future tenants should mirror. Additional flags may be added freely; the catalog is not enforced.

---

## 3. Schema — `public.ministry_announcements`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `tenant_id` | uuid FK → `tenants(id)` ON DELETE CASCADE | |
| `title` / `body` | text | Required |
| `severity` | text CHECK IN `('info','warning','critical')` | Default `'info'` |
| `published` | boolean | Default `true`; unpublished rows hidden from non-admins |
| `published_at` | timestamptz | Default `now()` |
| `author_id` | uuid FK → `auth.users` ON DELETE SET NULL | |
| `created_at` / `updated_at` | timestamptz | Trigger-managed |

Index: `(tenant_id, published, published_at DESC)`.

### RLS

- **SELECT** — Super Admin OR (`published = true` AND `tenant_id = get_user_tenant_id(auth.uid())`).
- **ALL writes** — Super Admin only.

Non-super-admin users cannot even see `published = false` rows for their own tenant — this is deliberate, so drafts stay invisible until the Super Admin publishes.

---

## 4. RPC contract

| Function | Roles | Purpose |
| --- | --- | --- |
| `is_feature_enabled(tenant_id, flag_key) → boolean` | authenticated | Cheap boolean lookup for server-side or hook consumers. Returns `false` when the flag row is missing. |
| `list_feature_flags(tenant_id) → SETOF tenant_feature_flags` | authenticated | Super Admin can pass any tenant (or `NULL` for all). Non-super-admins are silently scoped to their own tenant regardless of the argument. |
| `set_feature_flag(tenant_id, flag_key, enabled, config, description) → jsonb` | Super Admin only | Upsert. Returns `{ success, flag }` on success or `{ success:false, error }` when unauthorised or invalid. |

All three are `SECURITY DEFINER` with `SET search_path = public`.

---

## 5. Frontend contract

### Feature flags

```tsx
const { enabled, loading } = useFeatureFlag('lct_exams');
if (loading) return <Skeleton/>;
if (!enabled) return null;
return <LCTPanel/>;
```

- `loading === true` is "unknown yet" — render a neutral fallback, **do not** treat it as disabled.
- `enabled` is the only authoritative value; missing flags return `false`.
- Consumers must not read `tenant_feature_flags` directly — the hook centralises caching (5-minute stale time) and role scoping.

### Ministry announcements

```tsx
const { announcements, loading } = useMinistryAnnouncements();
```

Returns published rows for the caller's tenant only. Super Admins see all rows for editorial purposes.

---

## 6. What T4 intentionally does NOT do

- Does **not** wire any existing screen to a flag. Wiring is a per-feature migration to be done deliberately (e.g. wrapping `<LCTPanel/>` in `useFeatureFlag('lct_exams')`). Saudi Arabia is seeded fully enabled to guarantee zero behavioural change on ship.
- Does **not** surface announcements in student/teacher dashboards yet — the reader hook exists so downstream UI can consume it without new server work. Displaying them is a UI decision, not a foundation decision.
- Does **not** allow ministry users to write flags or announcements. Authoring is Super-Admin-only until a governed multi-editor model (T4.x follow-up) is designed. Ministry users get read-only visibility through their existing dashboard because RLS already scopes them.
- Does **not** change the T3 grading, calendar, or subject seeds. Feature flags are orthogonal to curriculum defaults.
- Does **not** touch A1–A10, `useLuminaLiveSession`, or the adaptive engine.

---

## 7. What T5+ must consume (never bypass)

- Any new module gated by a country toggle uses `useFeatureFlag('<key>')` — never a hardcoded tenant slug comparison.
- Any new server-side path that needs to check a flag uses `public.is_feature_enabled(tenant_id, key)` inside a `SECURITY DEFINER` function — never a raw `SELECT enabled FROM tenant_feature_flags`.
- New per-tenant configuration that is not a boolean toggle belongs in `tenants` JSONB columns (T3 pattern), not in a new one-off table.
- Announcements published through this table are the **only** sanctioned country-wide broadcast surface — future ministry messaging features must extend this table (columns / severities) rather than creating parallel notice tables.

---

## 8. Roadmap after T4

| Phase | Scope |
| --- | --- |
| T5 | Tenant analytics isolation + Super-Admin cross-tenant observatory. |
| T6 | Tenant lifecycle automation (self-serve provisioning, residency, retention, billing hooks). *Deferred by user request.* |

T1, T2, T3, T4 shipped. T5 ships alongside T4 in this batch.
