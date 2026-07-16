# Ministry Control · MC6 Dossier — User Governance

**Phase:** MC6 · **Migration:** `20260716_ministry_control_mc3_mc11.sql`
**Panel:** `src/components/ministry/control/UsersPanel.tsx`

---

## Purpose

The ministry governs **ministry-level** roles (Minister, Deputy Minister,
Curriculum Officer, Regional Supervisor, Ministry Admin, Viewer). Schools
govern students and parents; teachers remain school-operational while
remaining visible to ministry governance.

MC6 introduces the *governance path* for role assignments: they flow through
Draft → Review → Publish so the audit log records who requested a role
change, who reviewed it, and who published it.

## Reused data model

MC6 does not create new tables. It reuses `ministry_role_assignments` from
MC2 and layers a change-request applier on top. This keeps a single source of
truth for who holds which ministry role.

## Applier

**`user.role_assign` → `apply_user_role_change`**

Payload: `{ user_id, role, action?: 'assign' | 'revoke' }`. On `assign`,
upserts `(tenant_id, user_id, role)` — publishing the same assignment again
is idempotent. On `revoke`, deletes the specific `(tenant, user, role)` row.

The applier derives `tenant_id` from the change request so operators cannot
grant roles inside foreign tenants.

## Direct vs governed assignment

There are two ways a role can be assigned:

1. **Direct** — via `assign_ministry_role` RPC (Permissions panel). Requires
   `permissions.assign` capability. Fast path for super-admin bootstrap.
2. **Governed** — via a `user.role_assign` change request (this panel).
   Passes through Draft → Review → Publish, generating audit entries at
   every transition.

Both paths write to the same table; the audit log distinguishes them by
`action` prefix (`role.assign` vs `change_request.publish` → `user.role_assign`).

## UI (`UsersPanel`)

Table showing every named assignment for the tenant plus a "Draft role
change" dialog. Assignments performed through the Permissions panel appear
here as soon as they are inserted — no separate cache.

## Non-goals for MC6

- No signup / invitation flow for named ministry personnel — sign-in still
  uses the existing Supabase auth surface. This panel only manages *role*
  membership for users who already have accounts.
- No teacher governance UI. Teacher operational management stays with school
  administrators; ministry visibility into teachers ships in a later phase
  when we add cross-tenant teacher directories.
- No user profile editing — that responsibility remains with the platform.
