# Ministry Control · MC9 Dossier — Feature Management

**Phase:** MC9 · **Migration:** `20260716_ministry_control_mc3_mc11.sql`
**Panel:** `src/components/ministry/control/FeaturesPanel.tsx`

---

## Purpose

Every tenant may enable or disable Lumina modules (Lumina Live, Podcasts,
Flashcards, Mind Maps, Public Library, LCT Exams, …). MC9 upgrades the
existing binary `tenant_feature_flags.enabled` boolean into the spec's
tri-state model: **Disabled**, **Optional**, or **Required**.

## Semantics

| Mode | Effect on schools |
|---|---|
| `disabled` | No school in the tenant receives the feature. `enabled=false` in the row. |
| `optional` | Schools may enable the feature independently. `enabled=true` in the row (so feature-flag consumers keep working). |
| `required` | Every school automatically receives the feature. `enabled=true` in the row. |

The applier keeps the legacy `enabled` boolean in sync with the new `mode`
so existing consumers of `useFeatureFlag` continue working without any
changes. A follow-up (MC9.1) can extend `useFeatureFlag` to read `mode`
directly when per-school enrolment logic ships.

## Data model change

`tenant_feature_flags` gains a `mode` column:

```sql
mode text DEFAULT 'optional' CHECK (mode IN ('disabled','optional','required'))
```

No new table — the existing infrastructure from T4 is extended in place.

## Applier

**`feature.mode` → `apply_feature_mode_change`**

Payload: `{ flag_key, mode: 'disabled'|'optional'|'required', description? }`.
Upserts on `(tenant_id, flag_key)`, keeps `enabled` synced.

## Read RPC

- `list_mc_feature_flags(p_session_token)` — returns every flag for the
  caller's tenant.

## UI (`FeaturesPanel`)

Table of every flag with `mode` badge (colour-coded), the enabled bool,
description, and last-updated timestamp. Draft dialog captures
`flag_key`, `mode`, and `description`.

## Non-goals for MC9

- Per-school override toggle for `optional` features — the school-side UI
  where an administrator opts in ships with the School Admin dashboard, not
  here.
- No feature discovery from static code. `flag_key` values are typed by the
  operator; a curated catalogue (`lumina_live`, `podcasts`, …) is a MC9.1
  concern once the app's feature registry is centralized.
- The `useFeatureFlag` hook is intentionally untouched in MC9 to guarantee
  zero regression in feature-gated code paths.
