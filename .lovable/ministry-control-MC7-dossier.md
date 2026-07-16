# Ministry Control · MC7 Dossier — Regional Structure

**Phase:** MC7 · **Migration:** `20260716_ministry_control_mc3_mc11.sql`
**Panel:** `src/components/ministry/control/RegionsPanel.tsx`

---

## Purpose

The ministry defines the country's educational geography — regions,
districts, and zones — and assigns schools to it. Future analytics (Ministry
Insights) and policy targeting rely on this structure existing.

## Data model

### `mc_regions`

Hierarchical registry. A region may contain districts; districts may contain
zones. The hierarchy is represented by a nullable `parent_id` pointing back
into the same table.

| Column | Purpose |
|---|---|
| `tenant_id` | Owning country tenant |
| `name`, `code`, `kind` | `kind ∈ {region, district, zone}` |
| `parent_id` | Nullable self-reference for hierarchy |

Uniqueness: `(tenant_id, name, kind)` so a region and a district can share
a name (e.g. "Riyadh" as both a region and a district).

### `mc_school_region_assignments`

Many-to-one link from `schools` to `mc_regions`. A school can appear in
multiple regions (e.g. its literal district *and* the region that contains
that district) or in none.

## Appliers

| entity_type | Applier | Payload |
|---|---|---|
| `region.upsert` | `apply_region_change` | `{ name, kind, code?, parent_id?, id? }` (id present → update, absent → create) |
| `school.region_assignment` | `apply_school_region_assignment` | `{ school_id, region_id, action?: 'assign' \| 'unassign' }` |

Both appliers derive `tenant_id` from the change request row.

## Read RPC

- `list_mc_regions(p_session_token)` — session-token aware; returns all
  regions/districts/zones for the caller's tenant, ordered by `(kind, name)`.

## UI (`RegionsPanel`)

Two draft entry points (region upsert + school assignment) in the header,
then three grouped tables (regions, districts, zones). Parent IDs and
region IDs are shown so operators can reference them when drafting nested
structures.

## Non-goals for MC7

- No map visualisation — the ministry manages the hierarchy as a data
  structure. A geographic visualisation belongs to Ministry Insights.
- No automatic region generation from `tenants.country_code`. Every ministry
  authors its own regions explicitly — no imposed geopolitical assumptions.
- Bulk school-to-region imports are not exposed; every assignment is a
  discrete auditable change request.
