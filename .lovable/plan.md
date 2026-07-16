# Ministry Control System — Phased Roadmap

Built on the T1–T5 tenant foundation. All 12 tools live inside the existing `/ministry` portal (same auth, same RLS, same session), split into two workspaces:

```text
/ministry
├── Dashboard        (existing insights — unchanged)
└── Control Center   (new — 12 governance tools)
    ├── Curriculum
    ├── Policies
    ├── Schools
    ├── Users & Roles
    ├── Regions
    ├── Lumina Config
    ├── Features
    ├── Communications
    ├── Publishing (Draft & Publish queue)
    ├── Permissions
    ├── Audit Log
    └── Security
```

No new auth surface, no new route protection. Control Center is a nested section inside the current ministry app shell.

## Phase list (MC1 → MC12)


| Phase    | Name                                     | What it delivers                                                                                                                                                                     |
| -------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **MC1**  | Portal shell & navigation                | Two-workspace layout inside `/ministry`, sidebar for Control Center, empty tool routes, breadcrumb, capability gate wired to existing ministry session                               |
| **MC2**  | Draft & Publish + Permissions (backbone) | Generic change-request pipeline every later tool plugs into. Ministry roles (Minister, Deputy Minister, Curriculum Officer, Regional Supervisor, Ministry Admin) + capability matrix |
| **MC3**  | Curriculum Management                    | Official subjects, curriculum versions, grade assignment, auto-propagation to schools, auto teacher-role generation, retirement (soft)                                               |
| **MC4**  | Educational Policy                       | Grading systems, calendars, thresholds, promotion/graduation, per-policy school-override toggle                                                                                      |
| **MC5**  | School Management                        | Lifecycle (Requested → Activated → Suspended → Archived), regional assignment, ministry-side approvals                                                                               |
| **MC6**  | User Governance                          | Ministry admins, curriculum officers, regional supervisors; teacher visibility (governance-only, not operational control)                                                            |
| **MC7**  | Regional Structure                       | Regions / districts / educational zones; school assignment; feeds later analytics                                                                                                    |
| **MC8**  | Lumina Configuration                     | Terminology, explanation style, vocabulary, pacing, accessibility — policy-only, never overrides reasoning/factuality                                                                |
| **MC9**  | Feature Management                       | Per-tenant modules with Disabled / Optional / Required tri-state (upgrades existing feature flags)                                                                                   |
| **MC10** | National Communication                   | Announcements, curriculum updates, teacher/admin notices with targeting + read receipts (upgrades existing ministry_announcements)                                                   |
| **MC11** | Audit & Security                         | Full audit history of every ministry action, session log, permission changes, verification status                                                                                    |
| **MC12** | Hardening & Deprecation                  | Consolidate legacy ministry pages, remove duplication, formal ownership boundaries, docs                                                                                             |


Each phase = its own approval + dossier at `.lovable/ministry-control-MC*-dossier.md`. Nothing in A1–A10 (live lessons / adaptive engine) is touched. T6 tenant lifecycle stays deferred.

---

## This approval covers MC1 + MC2 only

MC1 is a shell (no governance behavior), so it makes no sense to ship alone. MC2 is the backbone every later tool depends on — building any tool before MC2 would mean rewriting each tool once Draft & Publish arrives.

### MC1 — Portal shell

- New route tree under `/ministry/control/*` inside the existing ministry app (same guard as `/ministry`).
- Left sidebar with the 12 tool entries, collapsible, active-route highlighting.
- Top nav switcher: **Dashboard** ↔ **Control Center** (both under `/ministry`).
- Each tool route renders a placeholder "Coming in phase MCx" panel — no fake controls, no non-functional buttons (respects the no-placeholders core rule; these are explicit phase markers, not fake features).
- Capability hook `useMinistryCapability(cap)` reading from MC2's permission matrix; in MC1 it defaults to "Minister sees everything" until MC2 lands the real roles.

### MC2 — Draft & Publish + Permissions

**Permissions (ownership-driven, not click-driven):**

- New enum `ministry_role`: `minister`, `deputy_minister`, `curriculum_officer`, `regional_supervisor`, `ministry_admin`, `viewer`.
- `ministry_role_assignments (tenant_id, user_id, role)` — separate from `user_roles`, tenant-scoped, unique per (tenant, user).
- `ministry_capabilities` seed table mapping role → capability keys (e.g. `curriculum.publish`, `policy.draft`, `school.suspend`, `permissions.assign`). Editable only by Minister of that tenant + Super Admin.
- `has_ministry_capability(_user, _tenant, _cap)` SECURITY DEFINER function used by RLS/RPCs from MC3 onward.

**Draft & Publish (single generic pipeline for every future tool):**

- `ministry_change_requests` table — polymorphic (`entity_type`, `entity_id`, `tenant_id`, `payload jsonb`, `status`, `author_id`, `reviewer_id`, `published_at`, `notes`).
- Status machine: `draft → in_review → approved → published` (+ `rejected`, `withdrawn`). No timestamps skipped; every transition audited.
- RPCs: `submit_change_request`, `review_change_request`, `publish_change_request`, `withdraw_change_request`, `list_change_requests`.
- On `publish`, an entity-specific applier function (registered per entity_type) writes the payload to the real table. MC3+ each register their own applier; the pipeline itself is entity-agnostic.
- Publishing capability defaults: Minister + Deputy Minister; drafting: any officer for their domain.
- **Audit log** table `ministry_audit_log (tenant_id, actor, action, entity_type, entity_id, before, after, at)` written from every status transition and from role assignments. Read-only from the UI; deletions forbidden.

**UI in Control Center:**

- `Publishing` tab — inbox-style queue: Drafts / In Review / Approved / Published / Rejected, filtered by tenant, with diff view (before → after JSON).
- `Permissions` tab — role assignment table, per-tenant, gated by `permissions.assign`.
- `Audit Log` tab — chronological filterable log.

**Explicit non-goals in MC2:** no curriculum editor, no policy editor, no school lifecycle — those are MC3+. MC2 ships an empty pipeline plus the two roles/audit tabs, provable by drafting a dummy "test" entity_type.

### Dossier

`.lovable/ministry-control-MC1-MC2-dossier.md` covering: portal layout, permission enum + capability matrix, change-request lifecycle diagram, applier registration contract, migration list, integration points reserved for MC3–MC12.

### Out of scope for this approval

MC3–MC12 (planned but not built), any change to `/dashboard`, A1–A10 live lesson engine, T6 lifecycle automation, real data mutations to schools/curriculum tables (those come with their respective phases).

### Technical notes

- No changes to `src/integrations/supabase/client.ts` or auto-gen types beyond what the migrations regenerate.
- All new tables get GRANTs + RLS in the same migration; `service_role` on every table, `authenticated` scoped through `has_ministry_capability`.
- Change requests carry `tenant_id`; RLS restricts visibility to users with a `ministry_role_assignments` row for that tenant (Super Admin bypass through existing hardcoded-admin path).
- Applier functions registered in a `ministry_change_appliers` lookup so MC3+ migrations can INSERT their entry without editing MC2 code.
- Don't forget to write a dossier after each edition