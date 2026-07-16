# Ministry Control · MC1 + MC2 Dossier

**Phases delivered:** MC1 (Portal shell) · MC2 (Draft & Publish + Permissions)
**Migration:** `20260716_ministry_control_mc1_mc2.sql`
**Scope note:** Foundation only. Curriculum, Policy, School, User, Region, Lumina Config,
Feature, Communication, and Security tools are declared in the sidebar as
future phases (MC3–MC11) and render a phase marker instead of fake controls.

---

## 1. Portal layout

`/ministry-dashboard` now contains a **workspace switcher** immediately below the
classified-access header:

```text
Ministry of Education
├── Dashboard        · observe the ecosystem  (existing insights, unchanged)
└── Control Center   · govern the ecosystem   (new — 12-tool sidebar)
```

Workspace selection is persisted in `sessionStorage['ministry_workspace']` so a
refresh keeps the operator in the same view. The 15-minute idle timeout, session
refresh RPC, and CLASSIFIED ACCESS banner apply to both workspaces — no new
route guard, no duplicated auth surface.

The **Control Center sidebar** is grouped:

- **Governance** — Publishing · Permissions · Audit Log  (all live in MC2)
- **Administration** — Curriculum (MC3), Policies (MC4), Schools (MC5), Users (MC6), Regions (MC7)
- **Configuration** — Lumina Config (MC8), Features (MC9), Communications (MC10), Security (MC11)

Placeholder tools render `PlaceholderPanel` (an explicit phase marker, not a
fake feature — respects the no-placeholders core rule by never showing
non-functional inputs or buttons).

---

## 2. Ownership & authority model

The classic question "who can click this button?" is replaced by
"who owns this object?". Two authority sources feed `has_ministry_capability`:

| Source | Grants | Notes |
|---|---|---|
| **Ministry session token** (100-char code held in `sessionStorage`) | Full **Minister** capabilities within the tenant that owns the session | Bootstrap so the anonymous ministry portal can operate before named user accounts exist |
| **`ministry_role_assignments`** row | Capabilities of the assigned role, scoped to `(tenant_id, user_id)` | Used from MC6 onward for named ministry personnel signed in via Supabase auth |
| **Super admin** (`hardcoded_admins`) | Bypass — full access across all tenants | Matches the pre-existing super-admin authority model |

Roles live in enum `public.ministry_role`:

```
minister · deputy_minister · curriculum_officer · regional_supervisor · ministry_admin · viewer
```

Capabilities are stored declaratively in `public.ministry_capabilities` so
future roles or capability keys ship as `INSERT` migrations — no code change to
the check function.

---

## 3. Draft → Review → Publish pipeline

One generic pipeline serves every future tool. Nothing about the pipeline is
curriculum-specific, policy-specific, or school-specific — the entity type is
just a string tag, and the payload is opaque JSON.

```text
   submit                review                     publish
draft ─────► in_review ──────► approved  ─────────► published
              │                    │
              ├──► rejected        └──► withdrawn (any pre-publish state)
```

### Table shape

`public.ministry_change_requests`

| Column | Purpose |
|---|---|
| `tenant_id` | Country tenant this change belongs to |
| `entity_type` | Free-text tag (`mc.test`, later `curriculum.subject`, `policy.grading`, `school.status`, …) |
| `entity_id` | Optional pointer to the concrete row being changed |
| `payload jsonb` | The proposed after-state (validated by the entity-specific applier at publish time) |
| `previous_snapshot jsonb` | Optional before-state captured by the submitter (used for diff view) |
| `status` | See state machine above |
| `author_id`, `reviewer_id`, `publisher_id` + `_label` | Attribution (label is used when the actor is a session token, not an auth user) |

### Applier registry

`public.ministry_change_appliers (entity_type PRIMARY KEY, applier_function TEXT)`

`publish_change_request()` reads this table, resolves the applier function
name, and dynamically dispatches to it via `EXECUTE format(...)`. Each future
phase registers its own applier as a plain SQL `INSERT` — MC2 code stays
untouched.

MC2 ships one applier: `apply_test_change` (no-op echo) registered under
entity type `mc.test`. This is exposed by the "New draft" dialog in the
Publishing panel so the operator can exercise submit → approve → publish end
to end before any real entity types exist.

### RPCs

All RPCs accept an optional `p_session_token` so the anonymous ministry portal
can invoke them. They enforce capability checks via `has_ministry_capability`.

- `submit_change_request(tenant, entity_type, entity_id, title, summary, payload, session_token, author_label) → uuid`
- `review_change_request(request_id, 'approve' | 'reject', notes, session_token, reviewer_label)`
- `publish_change_request(request_id, session_token, publisher_label) → jsonb`  ← runs the applier, then transitions status
- `withdraw_change_request(request_id, session_token, actor_label)`
- `list_change_requests(tenant, status, session_token, limit)`
- `assign_ministry_role`, `revoke_ministry_role`, `list_ministry_role_assignments`

### Capability requirements per transition

| Transition | Required capability |
|---|---|
| `→ in_review` (submit) | `change_request.draft` |
| `→ approved` / `→ rejected` | `change_request.review` |
| `→ published` | `change_request.publish` |
| `→ withdrawn` | `change_request.draft` |

Minister and Deputy Minister carry `change_request.publish`. Curriculum Officer
and Regional Supervisor carry draft + review only. Ministry Admin carries
draft only. Viewer carries nothing except `audit.read`.

---

## 4. Immutable audit trail

`public.ministry_audit_log` is append-only.

- `INSERT` grant to `authenticated`; `UPDATE` / `DELETE` explicitly `REVOKE`d.
- No policy allows deletion.
- Every state transition in the change-request pipeline writes an entry.
- Role assignments and revocations also emit entries.

The Audit Log panel exposes filter-by-substring + a diff drawer showing
`before_state`, `after_state`, and `metadata` for the selected entry.

---

## 5. Files created / modified

### Created

- `supabase/migrations/20260716_ministry_control_mc1_mc2.sql`
- `src/hooks/useMinistryControl.tsx`
- `src/components/ministry/control/ControlCenterShell.tsx`
- `src/components/ministry/control/PublishingPanel.tsx`
- `src/components/ministry/control/PermissionsPanel.tsx`
- `src/components/ministry/control/AuditLogPanel.tsx`
- `src/components/ministry/control/PlaceholderPanel.tsx`
- `.lovable/ministry-control-MC1-MC2-dossier.md` (this file)

### Modified

- `src/pages/MinistryDashboard.tsx` — added workspace switcher; existing
  Dashboard tabs are now gated behind `workspace === 'dashboard'`. Zero
  changes to the existing data fetch, timer, or moderator logic.
- `src/integrations/supabase/types.ts` — regenerated automatically after the
  migration; not edited by hand.

### Explicitly untouched

- `src/integrations/supabase/client.ts` (auto-gen)
- All A1–A10 live-lesson / adaptive-engine surfaces
- All existing tenant tables from T1–T5
- Legacy `MinistryDashboard` tabs (Overview, Rankings, Compliance, At-Risk, Moderators)
- `MinistryLogin`, `MinistryPending`, session-token flow

---

## 6. Integration contract for MC3–MC11

Every subsequent phase follows the same three-step pattern:

1. **Migration** — create the real domain tables (e.g. `curriculum_subjects`),
   plus an applier function `apply_<entity>_change(request_id uuid, payload jsonb) → jsonb`
   that validates the payload and writes to the domain tables.
2. **Registration** — a single `INSERT INTO ministry_change_appliers` row
   binding the new `entity_type` string to the applier function name.
3. **UI** — a domain-specific editor in `src/components/ministry/control/`
   that calls `submitChangeRequest(...)` with the appropriate `entityType`.
   All review / approve / publish / audit UX is inherited from MC2.

This keeps the pipeline entity-agnostic. MC2 will never be re-opened when
adding MC3+, only extended.

---

## 7. Explicit non-goals of MC1 + MC2

- No curriculum editor, policy editor, school lifecycle, or user governance UI —
  those tools show phase markers until their phase ships.
- No changes to `/dashboard`, live lessons, or the adaptive engine.
- No changes to T6 tenant lifecycle automation (still deferred).
- No auto-migration of legacy `ministry_announcements` or `tenant_feature_flags`
  into the change-request pipeline — that migration lives in MC10 and MC9
  respectively.
- Named ministry user sign-in (email + Supabase auth for Curriculum Officers
  etc.) is not built in MC2; only the assignment table + capability check.
  The session-token bootstrap covers all Minister-level actions in the interim.

---

## 8. Verifying MC2 end to end

1. Sign into `/ministry` with the ministry access code and open **Control Center → Publishing**.
2. Click **New draft**, keep the default `mc.test` payload, submit.
3. Row appears in "In Review". Click **Approve**.
4. Row moves to "Approved". Click **Publish**.
5. Row moves to "Published"; `applier_result` echo is captured.
6. Open **Audit Log** — three entries (`change_request.submit`, `change_request.approve`,
   `change_request.publish`) are present with full before/after diffs.

If any step fails, the operator sees the concrete error from the RPC (surfaced
by the toast) — the pipeline never silently drops a state transition.
