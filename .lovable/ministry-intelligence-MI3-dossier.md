# Ministry Intelligence — MI3 Dossier

**Phase:** MI3 — Intelligence Workspace UI
**Status:** Shipped
**Depends on:** MI1 (observation triggers), MI2 (rollups + RPCs)

---

## What this phase actually built

### 1. New workspace tab in the ministry portal

`src/pages/MinistryDashboard.tsx`:
- Added `IntelligenceShell` import and `Radar` icon.
- Extended the `workspace` state union from `'dashboard' | 'control'` to `'dashboard' | 'control' | 'intelligence'`.
- Widened the sessionStorage cast to include the new value.
- Registered a third entry in the workspace switcher (`Intelligence · Insight from evidence`).
- Rendered `<IntelligenceShell />` when `workspace === 'intelligence'`.

### 2. `IntelligenceShell` component

`src/components/ministry/intelligence/IntelligenceShell.tsx`:

- Reads the ministry session token from `sessionStorage` (same pattern as the rest of the ministry portal).
- Loads three MI2 RPCs in parallel via `Promise.all`:
  - `mi_national_overview(session_token, days)`
  - `mi_regional_breakdown(session_token, days)`
  - `mi_list_insights(session_token, 25)`
- School view lazy-loads on selection: `mi_school_snapshot(session_token, school_id, days)`.
- School list read directly from `schools` (tenant-scoped by RLS + ministry session tenant).
- Range selector (7 / 30 / 90 days) and manual refresh button.

### 3. Three views

| View | Contents |
|---|---|
| **National** | Four stat cards (active schools, active regions, total signal, window). Per-event-type totals list. Daily activity sparkline built from `daily_activity`. |
| **Regional** | One row per region — region name, school count, event count. Empty state when no rollups exist. |
| **School** | School picker → per-event totals + top subjects (subject id + event count). |

### 4. Insights strip

Always visible below the active view. Renders the array returned by `mi_list_insights` with severity-tinted cards (`info` / `watch` / `concern` / `urgent`). Explicit copy tells the user this is populated by MI4 (alerts) and MI5 (recommendations), which have not shipped yet — so an empty state is expected on day one.

### 5. Explicit guardrail copy

Two lines in the header spell out the constitutional limits:
- "Aggregated, PII-free educational activity across your tenant."
- "No teacher evaluation. No student identification."

Reinforced next to the Insights heading: "Evidence-based, tenant-scoped. No teacher evaluation."

---

## Guarantees preserved

- No new database objects. This phase is UI only — every read goes through MI2's tenant-scoped, session-token-validated RPCs.
- No school- or region-level data is fetched without a session token; if the token is missing, the panel shows a `Ministry session required.` notice.
- Cross-tenant isolation continues to be enforced inside the RPCs (MI2), not the client — the client can't bypass it by supplying a foreign school id, because `mi_school_snapshot` rejects with `school not in tenant`.
- Zero touch on ALE / LSE / ability estimates / bandit / ensemble / auth / tenants.
- No student names, emails, IDs, or free-text content appear anywhere in the UI. Only counts, averages, and subject/region UUIDs.

---

## What this phase does NOT do

- No AI-generated insight text (that's MI5).
- No automated alerts (MI4).
- No acknowledgement / dismissal workflow for insights (MI6).
- No export / download. Data stays in-portal.
- Subject IDs are shown as-is; a subject lookup enrichment can come in MI5/MI6.

---

## Files touched

- `src/components/ministry/intelligence/IntelligenceShell.tsx` (new)
- `src/pages/MinistryDashboard.tsx` (workspace switch, tab render)

No migrations, no edge functions.

---

## How to verify

1. Sign in to the ministry portal.
2. Click the new **Intelligence** tab in the workspace switcher.
3. Switch between National / Regional / School.
4. Change the range (7 / 30 / 90) — cards, totals, and sparkline re-fetch.
5. Pick a school in the School view — the snapshot loads and shows totals + top subjects.
6. Empty states are expected until the 02:15 UTC cron runs its first aggregation (or `SELECT public.mi_run_daily_aggregation()` is run manually).
