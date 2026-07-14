# Multi-Tenant Sign-In & Code Override — Phase T2 Dossier

**Status:** shipped.
**Scope:** country selection is now part of the pre-auth funnel, and every code-based onboarding path (school invite, teacher category code, school activation, parent code, ministry code) reports the tenant its code belongs to so the client can override the user's pick.

If code and dossier disagree, the dossier is wrong.

---

## 1. Files added / modified

| Path | Kind | Purpose |
| --- | --- | --- |
| `supabase/migrations/…_tenant_code_returns.sql` | migration | `signup_with_invite_code`, `activate_school_with_code`, `signup_as_parent` all return `{ tenant_id, tenant_slug, tenant_name }`. |
| `supabase/functions/activate-school/index.ts` | edit | Edge function response now includes `tenant_id`, `tenant_slug`, `tenant_name` (looked up from `schools.tenant_id → tenants`). |
| `src/pages/CountrySelect.tsx` | new | Country picker driven by `get_active_tenants()`. Persists selection to `sessionStorage`. |
| `src/lib/selectedTenant.ts` | new | `getSelectedTenant`, `setSelectedTenant`, `reconcileTenantFromCode` — the single client-side override contract. |
| `src/App.tsx` | edit | `LanguageGate` now also enforces `/country` before `/auth`, `/activate-school`, `/ministry`. |
| `src/pages/LanguageSelect.tsx` | edit | After language + build selection, routes to `/country` instead of `/auth`. |
| `src/pages/Auth.tsx` | edit | Country chip above tabs. `join` (invite code), `parent`, and silent-ministry flows call `applyTenantOverride` on success. |
| `src/pages/ActivateSchool.tsx` | edit | Applies the same override on successful school activation. |
| `.lovable/tenant-T2-dossier.md` | new | This document. |

No changes to A1–A10 live-lesson pipeline, adaptive engine, `useLuminaLiveSession`, `lumina-live` edge function, or any student-content surface.

---

## 2. Pre-auth funnel

```
/language ──► /country ──► /auth ──► (code-based RPC) ──► reconcile
                                                          │
                                                          ├─ tenant matches   → no-op
                                                          └─ tenant differs   → override + toast
```

`sessionStorage` keys owned by this phase:
- `selected_tenant_id`
- `selected_tenant_slug`
- `selected_tenant_name`
- `selected_tenant_code`

Country selection is a **pre-auth** gate only. Once the user has a `profiles` row, tenant is derived server-side via `profiles.school_id → schools.tenant_id` (T1 helpers) — the sessionStorage value is a hint, never a source of truth.

---

## 3. RPC contract

Every code-based onboarding RPC now returns a tenant triple (`tenant_id`, `tenant_slug`, `tenant_name`) in addition to its previous payload:

| RPC | Tenant source |
| --- | --- |
| `signup_with_invite_code` | `schools.tenant_id` of the school owning the invite / permanent teacher-category code. |
| `activate_school_with_code` | `schools.tenant_id` of the activated school. |
| `signup_as_parent` | `schools.tenant_id` of the child's school. |
| `verify_ministry_code` | already tenant-aware (T1). |
| `activate-school` edge function | Joins `schools` → `tenants` and returns the triple. |

The RPC's tenant is authoritative. Clients must not "trust" the pre-selected country when a code returns a different one.

---

## 4. Override rule (the whole point of T2)

`reconcileTenantFromCode(response)`:

1. Reads the current `sessionStorage` selection.
2. If `response.tenant_id` exists and differs from the stored id, writes the response's tenant values into sessionStorage and returns `{ overridden: true, from, to }`.
3. Otherwise silently updates any missing fields (e.g. name filled in by a later RPC) and returns `{ overridden: false }`.

The caller decides whether to toast. Every consumer in the current codebase (`Auth.tsx` join / parent / silent-ministry, `ActivateSchool.tsx`) does toast:

> "Your country was updated to `<Saudi Arabia>` because your code belongs there."

Because RLS enforces `tenant_id = get_user_tenant_id(auth.uid())` (T1), even if a client somehow refused to update its local storage, the server would still bind the user to the correct tenant on the next request.

---

## 5. What T2 intentionally does NOT do

- No new tenant tables, columns, RLS, or grants.
- No changes to A1–A10 or the adaptive engine.
- No country picker in `MinistryLogin` — ministry codes already carry a tenant and override silently.
- No cross-tenant analytics; that is T5.
- No per-tenant curriculum/localisation propagation; that is T3.

---

## 6. What T3+ must consume (never bypass)

- **Any new code-based onboarding RPC** must return `{ tenant_id, tenant_slug, tenant_name }` and its client must call `reconcileTenantFromCode`.
- **Any new pre-auth surface** that accepts a code (e.g. new moderator entry) must live behind the `/country` gate in `LanguageGate`.
- **Server-side tenant is the only source of truth** for authenticated requests — never re-read `sessionStorage.selected_tenant_id` after `useRoleGuard().tenantId` is populated.
- **Country visibility** stays gated by `get_active_tenants()` — never add a hardcoded list to the picker.

---

## 7. Roadmap after T2

| Phase | Scope |
| --- | --- |
| T3 | Curriculum & localisation propagation per tenant (grading, calendar, RTL, subject sets consumed by student/teacher UIs). |
| T4 | Ministry-authored features & per-tenant feature flags. |
| T5 | Tenant analytics isolation + Super-Admin-only cross-tenant observatory. |
| T6 | Tenant lifecycle automation (self-serve provisioning, residency, retention, billing hooks). |

Total planned phases: **T1–T6 (six)**. T1 and T2 are shipped.
