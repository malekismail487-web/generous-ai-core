# Ministry Control · MC5 Dossier — School Management

**Phase:** MC5 · **Migration:** `20260716_ministry_control_mc3_mc11.sql`
**Panel:** `src/components/ministry/control/SchoolsPanel.tsx`

---

## Purpose

School onboarding remains a **platform** responsibility — a school requests
access, the Super Admin issues a one-time activation code, and the school
activates itself. The ministry does not create schools; it **governs** them
afterward.

MC5 adds the governance surface: the ministry can transition a school
between `operational`, `suspended`, and `archived`, and every transition is
captured for audit.

## Data model

### `schools.governance_status` (new column)

Text column constrained to `operational | suspended | archived`. Distinct
from the pre-existing `schools.status` field, which tracks activation state
(`pending`, `active`, etc.). Governance status is layered on top of
activation status so the ministry never mutates the platform's onboarding
state machine.

### `mc_school_lifecycle_events`

Append-only history table.

| Column | Purpose |
|---|---|
| `tenant_id` / `school_id` | Scope + subject |
| `previous_status` / `new_status` | Transition |
| `reason` | Free text captured on the change request |
| `actor_label` | Publisher label at the time of publish |

`UPDATE` and `DELETE` grants are explicitly revoked; entries are immutable.

## Applier

**`school.lifecycle` → `apply_school_lifecycle_change`**

Payload: `{ school_id, new_status, reason? }`. The applier validates
`new_status`, verifies the school belongs to the ministry's tenant (rejects
cross-tenant writes), inserts a lifecycle event, then updates
`schools.governance_status`.

## Read RPC

- `list_mc_schools(p_session_token)` — returns id, name, code, activation
  status, governance status, tenant_id, and created_at for every school in
  the caller's tenant.

## UI (`SchoolsPanel`)

Table listing every school in the tenant with both status columns visible
side-by-side. A "Draft status change" dialog captures `school_id`,
`new_status`, and optional `reason`. School IDs are surfaced in the table so
operators can copy them into the dialog — no cross-page navigation.

## Non-goals for MC5

- Registration / activation of new schools is not moved here — that stays
  under `SuperAdmin` and the existing `activate-school` edge function.
- No bulk operations (suspend N schools at once). Every governance
  transition is a discrete auditable change request.
- Region assignments have their own applier (`school.region_assignment`) and
  are surfaced under MC7 (Regions), keeping this panel focused on lifecycle.
