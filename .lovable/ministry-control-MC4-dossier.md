# Ministry Control · MC4 Dossier — Educational Policy

**Phase:** MC4 · **Migration:** `20260716_ministry_control_mc3_mc11.sql`
**Panel:** `src/components/ministry/control/PoliciesPanel.tsx`

---

## Purpose

Where curriculum answers "*what* should students learn?", policy answers
"*how* should education operate?". Policies define national operational
rules — grading systems, academic calendars, promotion & graduation
thresholds, attendance, assessment windows — that every school in the tenant
inherits.

## Data model — `mc_educational_policies`

| Column | Purpose |
|---|---|
| `tenant_id` | Owning country tenant |
| `policy_key` UNIQUE per tenant | Stable identifier (e.g. `grading.system`, `calendar.academic`, `promotion.rules`, `attendance.min`, `assessment.policy`) |
| `title` | Human-readable label |
| `config jsonb` | Structured configuration (schema is policy-key-specific and validated only by consumers) |
| `allows_school_override boolean` | If true, schools may propose local overrides that fall back to this default |
| `effective_from date` | Optional activation date |
| `status` | `draft` / `active` / `retired` |

## Applier

**`policy.set` → `apply_educational_policy_change`**

Upsert semantics keyed on `(tenant_id, policy_key)`. Republishing the same
`policy_key` replaces the config; historical versions are preserved by the
audit log's `before_state` / `after_state` snapshots (they are not stored
inside `mc_educational_policies`).

## Payload shape

```json
{
  "policy_key": "grading.system",
  "title": "National Grading System",
  "config": { "scale": "percent", "passing": 60 },
  "allows_school_override": false,
  "effective_from": "2028-09-01",
  "status": "active"
}
```

## Read RPC

- `list_mc_policies(p_session_token)` — session-token aware; returns policies for the caller's tenant.

## UI (`PoliciesPanel`)

Single table with `policy_key`, `title`, override flag, status, and a
compact JSON preview of `config`. Draft dialog captures all editable fields.
The panel intentionally does not present a "policy schema editor" — schema
enforcement belongs to the consumers (report cards, promotion engine, etc.)
because it is inherently policy-key-specific.

## Non-goals for MC4

- No per-school override submission — schools cannot draft into ministry
  policies. Override flow will ship in MC5.1 when the school-side policy
  editor is added.
- No policy version history table — the audit log is the source of truth.
- No promotion-engine implementation — the engine consumes `promotion.rules`
  policy but does not live inside Ministry Control.
