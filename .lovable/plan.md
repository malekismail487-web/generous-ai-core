&nbsp;

# Ministry Extension System

A new **13th tool** inside the Ministry Control Center: **Extensions**. Each ministry gets a private workspace where it chats with Lumina to *design* new educational tools for its own tenant. Nothing ships until a human Super Admin reviews and approves. Protected engines (ALE, LSE, auth, tenant isolation) are structurally out of reach — not just prompt-restricted.

## A → Z: What a ministry account will be able to do after this ships

**Existing (already built in MC1–MC11):**

1. Sign in via 100-char ministry code → gets a `ministry_sessions` token.
2. See national dashboard (schools, students, teachers, analytics).
3. Draft → Review → Publish change requests through 10 domain appliers:
  curriculum subjects, curriculum versions, educational policies, schools lifecycle, school↔region assignments, regions, Lumina config, feature flags (modes), ministry announcements, user role assignments.
4. Manage ministry-role permissions (Minister, Deputy, Curriculum Officer, Regional Supervisor, Ministry Admin, Viewer).
5. Read the audit log and manage sessions/IP bans.

**New (this plan):**
6. Open **Extensions** tab → conversational workspace with Lumina.
7. Ask Lumina to design a tool ("national science competition portal", "parent communication center", etc.).
8. Lumina replies with a **plan first** (scope, screens, data model, permissions, affected roles) — never code-first.
9. Ministry approves the plan → Lumina generates an **Extension Blueprint** (JSON manifest, not raw code) that composes only approved building blocks.
10. Ministry enters **Preview Mode** — the extension renders live inside a sandbox iframe scoped to that tenant with synthetic data.
11. Ministry iterates in chat ("move the dashboard left", "add a filter") — Lumina regenerates the blueprint.
12. Ministry clicks **Push Forward to Super Admin** → creates an `extension_requests` row (draft → in_review).
13. Ministry can view status, revise after rejection, view version history of approved extensions, and roll back.

**Effects the ministry causes:**

- Only writes into `extension_*` tables inside its own `tenant_id`. Cannot touch: `auth.*`, `tenants`, `user_roles`, protected engine tables (ability_estimates, adaptive_*, ensemble_*, lse_*, teaching_*), or any other tenant's rows.
- Approved extensions become **tenant-scoped UI surfaces** — e.g. a new tab in the Student/Teacher/Parent/Admin dashboard, visible only to users whose `profile.school_id → schools.tenant_id` matches.
- Feature flags gate every extension; disabling the flag hides it instantly without redeploy.

## Super Admin side

- New **Extension Review** tab under `/super-admin`.
- Queue of pushed extensions with: blueprint diff, generated documentation, requested capabilities/tables, sandbox preview link, ministry chat transcript.
- Dedicated **Lumina Audit Assistant** chat pre-loaded with the blueprint. Prompts like "security concerns?", "does it touch protected systems?", "performance risk?" return a structured advisory report.
- Approve → extension gets versioned, signed (`extension_versions`), tenant-scoped feature flag flipped on for that tenant only.
- Reject → ministry sees reason + notes and can revise.
- Rollback → deactivate a version; audit trail preserved.

## Architecture

### Data model (all new tables — nothing touches existing schema)

```text
extension_conversations       one per ministry workspace thread
  id, tenant_id, title, created_by_session, created_at

extension_messages            chat log (UIMessage[] shape)
  id, conversation_id, role, parts jsonb, created_at

extension_blueprints          Lumina's structured design artifact (versioned)
  id, conversation_id, tenant_id, version, manifest jsonb,
  status (draft|preview|pushed|approved|rejected|deployed|rolled_back),
  requested_capabilities text[], created_at

extension_requests            Push-Forward queue for Super Admin
  id, blueprint_id, tenant_id, submitted_by_session, submitted_at,
  status, reviewer_user_id, decision_notes, decided_at

extension_versions            Signed, deployed versions
  id, blueprint_id, tenant_id, version, signature, deployed_at,
  deployed_by_user_id, active bool

extension_audit_chats         Super Admin ↔ Lumina audit transcripts
  id, request_id, role, parts jsonb, created_at

extension_sandbox_data        Synthetic rows the sandbox reads/writes
  id, tenant_id, blueprint_id, table_key text, row jsonb
```

All tables: `tenant_id` NOT NULL + RLS scoping to the caller's ministry session tenant or to Super Admin. GRANT to `anon` for ministry-token RPCs; direct table access denied.

### Blueprint manifest (the "code" Lumina writes)

A JSON DSL, not TypeScript. The runtime interprets it. This is what makes protection *structural*:

```jsonc
{
  "name": "science_competition_portal",
  "surfaces": [
    { "role": "student", "route": "/student/ext/science-comp",
      "layout": "dashboard", "widgets": [ ... ] }
  ],
  "data": [
    { "key": "submissions", "columns": [...] }  // stored in extension_sandbox_data or tenant-scoped extension_data
  ],
  "workflows": [ { "trigger": "submission.created", "actions": [...] } ],
  "permissions": { "read": ["student","teacher"], "write": ["student"] },
  "capabilities_required": ["file.upload","notification.send"]
}
```

Widgets/actions come from a **fixed allowlist** (table, form, chart, list, kanban, filter, mutate, notify, export). Lumina cannot emit arbitrary code, cannot reference protected tables, cannot invent capabilities. The generator's Zod schema enforces this — anything else fails validation server-side.

### Edge functions

- `lumina-extension-chat` — streaming AI SDK chat. System prompt forces "plan first, blueprint only after ministry approves the plan". Uses `google/gemini-2.5-pro` with `Output.object` for the plan step and blueprint generation. Rejects any request that names a protected system.
- `lumina-extension-audit` — Super Admin audit chat. System prompt: "You are a code reviewer. The blueprint is attached. Never recommend approval; produce advisory only."
- `extension-preview` — mounts a blueprint into the sandbox context (returns a signed preview token for the iframe).
- `extension-deploy` — after Super Admin approval: validates blueprint one final time, writes `extension_versions`, flips per-tenant flag.

### Runtime interpreter (client)

A single `<ExtensionRenderer manifest={...} />` component reads the manifest and renders allowlisted widgets. It only queries `extension_data` scoped to `tenant_id = auth.tenant_id`. Existing student/teacher/parent/admin dashboards get one new "Extensions" section that lists this tenant's active extensions.

### Protection guarantees (why prompt injection can't break this)

- Ministry chat never returns executable code — only blueprint JSON.
- Blueprint schema is a strict allowlist (Zod); anything referencing `ability_estimates`, `lesson_events`, `auth.*`, other tenants, or unlisted capabilities fails validation before it ever reaches the queue.
- Deploy edge function re-validates + verifies `tenant_id` matches the requesting ministry.
- Runtime interpreter has no `eval`, no dynamic imports, no raw SQL — only parameterized reads/writes against `extension_data` filtered by RLS.
- Super Admin approval is the *only* path from `pushed` → `deployed`.

## UI additions

- `**ExtensionsPanel.tsx**` in `src/components/ministry/control/` — thread list + chat + preview iframe + Push Forward button. Uses AI Elements (`Conversation`, `Message`, `PromptInput`, `Tool`) per chat-ui-composition rules.
- `**SuperAdminExtensionReview.tsx**` — queue table, blueprint viewer, audit chat, approve/reject actions.
- `**ExtensionRenderer.tsx**` — the manifest interpreter used in both sandbox preview and post-deploy dashboards.
- New route in dashboards: `/*/extensions` lists this tenant's active extensions.

## Rollout phases (build order)

1. **EX1** — Schema (all 7 tables, RLS, GRANTs, RPCs for conversation/message CRUD via ministry session token).
2. **EX2** — Blueprint DSL + Zod schema + widget allowlist + `<ExtensionRenderer/>` with 5 core widgets (table, form, chart, list, kanban).
3. **EX3** — `lumina-extension-chat` edge function (plan-first chat, `Output.object` blueprint generation, refusal rules for protected systems + truth preservation).
4. **EX4** — Ministry `ExtensionsPanel` UI (chat + live sandbox preview iframe + iterate loop).
5. **EX5** — Push Forward flow + `extension_requests` queue.
6. **EX6** — Super Admin review UI + `lumina-extension-audit` advisory chat.
7. **EX7** — `extension-deploy` (versioning, signing, per-tenant flag flip) + dashboard mount points + rollback.
8. **EX8** — Dossier `.lovable/ministry-extensions-EX1-EX8-dossier.md`.

## Open questions before EX1

1. **Widget scope for v1** — start with the 5 widgets listed (table/form/chart/list/kanban) or a smaller set (just table + form)?
2. **Sandbox data** — synthetic data only, or should ministries be able to preview against a read-only snapshot of their tenant's real data?
3. **Extension surfaces** — should extensions be able to add tabs to *every* role (student/teacher/parent/admin/ministry) in v1, or only ministry-facing dashboards first?
4. **Model choice** — `google/gemini-2.5-pro` for design chat + `openai/gpt-5.5` for the audit assistant? Or same model for both?
5. I do not know about the model choice so this is on you. You're the one that will choose and here is how it will work. There should be a button to worry a ministry can chat with Lumina. And the ministry can request certain changes and Lumina must be able to do what is requested, except if the ministry request a change of something vital like the adaptive learning engine, for example then Lumina should give a hard no and also if a ministry likes the changes they can preview it in a sandbox mode should be able to click a button called push code for super admin review and when I'm signed in, I should be able to view that preview and I should also have the ability to talk to Lumina about those changes and I can press approve or deny if I press approved then those changes gets deployed to the ministry country like if the ministry that requested those changes with the ministry of Saudi Arabia and I clicked approved then it gets pushed into every Saudi Arabian school and every Saudi Arabian account 