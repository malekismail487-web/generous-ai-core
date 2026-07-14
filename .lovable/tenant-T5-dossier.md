# Tenant Analytics Isolation & Cross-Tenant Observatory — Phase T5 Dossier

**Status:** shipped.
**Scope:** each country's usage metrics are computed inside a single view, but the **read paths** are role-scoped so a school admin, teacher, or ministry user can only ever see their own country. The Super Admin gets an additional cross-tenant surface for comparative oversight.

If code and dossier disagree, the dossier is wrong.

---

## 1. Files added / modified

| Path | Kind | Purpose |
| --- | --- | --- |
| `supabase/migrations/…_t4_t5_features_analytics.sql` | migration | Creates `tenant_analytics_view`, `get_tenant_analytics`, `get_cross_tenant_observatory`. (Shared with T4.) |
| `supabase/migrations/…_t5_view_security_invoker.sql` | migration | Marks the analytics view `security_invoker = true` so it never escalates. |
| `src/components/admin/TenantObservatory.tsx` | new | Super-Admin table view over `get_cross_tenant_observatory()`. |
| `src/components/SuperAdminPanel.tsx` | edit | Adds an **Observatory** tab. |
| `.lovable/tenant-T5-dossier.md` | new | This document. |

No changes to A1–A10, `useLuminaLiveSession`, `lumina-live`, adaptive engine, or any student/teacher UI.

---

## 2. `public.tenant_analytics_view`

One row per tenant. Aggregations join through `public.schools` — the only table already tenant-scoped by column — so every counted entity is provably in the right country.

| Column | Source |
| --- | --- |
| `tenant_id`, `tenant_slug`, `country_name`, `status` | `public.tenants` |
| `school_count` | `COUNT(*) FROM schools GROUP BY tenant_id` |
| `user_count` | `profiles JOIN schools` |
| `student_count`, `teacher_count` | `user_roles JOIN profiles JOIN schools` |
| `active_users_7d` | `activity_logs` in the last 7 days, distinct users |
| `assignments_30d` | `assignments` created in the last 30 days |
| `submissions_30d` | `submissions.submitted_at` in the last 30 days |
| `avg_grade_30d` | `AVG(submissions.grade)` over the same 30 days, `grade IS NOT NULL` |
| `computed_at` | `now()` |

The view runs `SECURITY INVOKER` — a caller with `SELECT` on `tenant_analytics_view` still only sees rows the underlying-table RLS permits. `SELECT` is **revoked from PUBLIC** and granted only to `service_role`; the sanctioned client entry points are the two RPCs below.

Grade is used (rather than a normalised accuracy score) because `submissions.grade` is the only numeric outcome column that exists across the codebase today; the T5 view will not fabricate a metric that doesn't have a stable server-side source.

---

## 3. RPCs

### `get_tenant_analytics(p_tenant_id uuid DEFAULT NULL) → jsonb`

`SECURITY DEFINER  STABLE  search_path = public`, `EXECUTE` to `authenticated`.

- Super Admin: `p_tenant_id` is required; returns that tenant's row, or the shaped error `{success:false, error:'tenant_id required'}` if omitted.
- Any other authenticated user: `p_tenant_id` is ignored if it doesn't match the caller's own tenant (returns `{success:false, error:'Cross-tenant access denied'}`). Callers with no tenant (unassigned) get `NULL`.
- Return shape when successful is the view row cast to JSONB.

### `get_cross_tenant_observatory() → SETOF tenant_analytics_view`

`SECURITY DEFINER  STABLE  search_path = public`, `EXECUTE` to `authenticated`.

Returns the full view sorted by `country_name` for the Super Admin only. Non-super-admins get an empty set — the function short-circuits before any read.

Both RPCs are the **only** sanctioned client entry point. Do not add direct `.from('tenant_analytics_view')` reads on the client.

---

## 4. Frontend contract

```tsx
// Per-tenant (any authenticated user, own country only)
const { data } = await supabase.rpc('get_tenant_analytics', { p_tenant_id: myTenantId });

// Cross-tenant (Super Admin only)
const { data } = await supabase.rpc('get_cross_tenant_observatory');
```

The Observatory tab renders the second call as a sortable table with 10 numeric columns. It is mounted inside `SuperAdminPanel` behind the existing role guard, so unauthorised users never load it.

---

## 5. Isolation guarantees (why T5 is safe)

1. **Column-level isolation** — every joined table is either already `tenant_id`-tagged (`schools`) or bound through `schools`, which is the T1 join key. A user whose `school_id` is NULL contributes to no country.
2. **View-level isolation** — `security_invoker = true` means the view inherits the caller's RLS, not the owner's. `service_role` gets `SELECT` for edge-function use; nobody else can query it directly.
3. **RPC-level isolation** — `get_tenant_analytics` refuses cross-tenant lookups outside the Super Admin path; `get_cross_tenant_observatory` returns an empty set to non-super-admins even before hitting the view.
4. **Client isolation** — the Observatory component is only mounted inside `SuperAdminPanel`, which is already gated. There is no student/teacher entry point for cross-tenant data.

---

## 6. What T5 intentionally does NOT do

- Does **not** materialise the view — it is a plain view that recomputes on each RPC call. That's acceptable at current scale; materialisation is a T6 concern once we cross a real load threshold.
- Does **not** expose a mixed metric like "accuracy" — the platform has multiple, inconsistently populated accuracy signals (`submissions.grade`, `assessment_scores`, `student_answer_history`). Rather than pick one wrongly, the view exposes the raw grade average and leaves ratio metrics to a future analytics phase that consolidates the sources.
- Does **not** rewire existing admin dashboards. Existing school-level analytics still read from `activity_logs`, `assignments`, etc.; the tenant view is an additional, complementary layer.
- Does **not** grant ministry users access to the observatory. Ministry users already see country-scoped dashboards through their own portal; the observatory is deliberately Super-Admin-only.
- Does **not** touch A1–A10 or the adaptive engine.

---

## 7. What T6 must consume (never bypass)

- Any new tenant-scoped metric must extend `tenant_analytics_view` (or a peer view) — never re-implement joins ad-hoc in a component.
- Any new client read of tenant analytics must go through a `SECURITY DEFINER` RPC that enforces `is_super_admin` OR `tenant_id = get_user_tenant_id(auth.uid())`.
- If the view is materialised, the RPC surface must stay stable — client code depends on the shape defined here.

---

## 8. Roadmap after T5

| Phase | Scope |
| --- | --- |
| T6 | Tenant lifecycle automation (self-serve provisioning, data residency, retention, billing hooks). **Deferred by user request** — will be picked up after other priorities. |

T1–T5 shipped. T6 is the only remaining tenant phase.
