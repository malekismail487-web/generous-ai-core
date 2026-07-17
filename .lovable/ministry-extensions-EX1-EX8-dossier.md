# Ministry Extension System — EX1–EX8 Dossier

## What this build actually delivers

A new **13th tool** in the Ministry Control Center called **Extensions**. Each ministry now has a private conversational workspace where it designs new educational tools for its own country, previews them in a sandbox, and pushes them to Super Admin for review. Nothing deploys until the Super Admin approves — and even then, only to that ministry's own tenant.

The system is built on one architectural commitment: **Lumina proposes JSON blueprints, never code**. A blueprint is a strictly-validated manifest of allowlisted widgets, data stores, permissions, and capabilities. There is no `eval`, no dynamic import, no raw SQL, and no way for a blueprint to reference protected core systems (Adaptive Learning Engine, Learning Synchronization Engine, `auth.*`, `user_roles`, `ministry_sessions`, `tenants`, etc.). That protection is structural, not just prompt-based.

## A → Z: What a ministry account can now do

1. **Sign in** with its 100-character ministry code (`/ministry` → `ministry_sessions`).
2. **See its national dashboard** (schools, students, teachers, analytics).
3. **Open the Control Center** and use every existing MC1–MC11 tool (Publishing, Permissions, Audit, Curriculum, Policies, Schools, Users, Regions, Lumina Config, Features, Communications, Security).
4. **NEW — Open the Extensions tab** to design brand-new tools:
   - Click **+** to start a workspace.
   - Chat with Lumina: "Build me a national science competition portal."
   - Lumina responds with a **plan first** — goal, target roles, screens, data, permissions.
   - Ministry approves the plan → Lumina emits a **blueprint** which appears live in the sandbox.
   - Ministry iterates by chatting: "Add a status filter", "Move the leaderboard first". Every revision creates a new blueprint version.
   - The sandbox is fully interactive — forms submit, tables paint, charts render, kanban swimlanes populate — but every write goes to `extension_sandbox_data`, isolated from production.
5. **Click "Push forward"** — creates an `extension_requests` row and moves the blueprint to Super Admin review.
6. **Watch status** — pushed / approved / rejected / deployed all appear in the workspace.
7. **Revise & resubmit** after a rejection using the reviewer's notes.

## What Lumina refuses (hard "no")

Baked into both the system prompt and post-response server-side validation:

- The Adaptive Learning Engine, Learning Synchronization Engine, ability estimates, ensemble predictions, `lesson_events`, `kt_sequence_state`, `fsrs_card_state`, or any core educational reasoning.
- Authentication, authorization, `user_roles`, tenant isolation, `ministry_sessions`, `tenants` table.
- Any request that would weaken factual correctness, obscure scientific truth, or violate educational integrity.
- Any request that would touch a different country's tenant.

A refusal is one of three response modes (`plan`, `blueprint`, `refusal`) and cannot be bypassed by rephrasing — the second guard runs on the assistant's own output.

## What the Super Admin sees (`/super-admin` → **Extension Review**)

1. **Queue** of every pushed request with tenant, blueprint name, version, status.
2. **Preview** tab renders the blueprint in the same runtime that will serve it in production, with role switching (student / teacher / parent / admin / ministry).
3. **Manifest** tab shows the raw JSON that will be deployed.
4. **Audit** tab is a dedicated chat with the **Lumina Extension Audit Assistant**:
   - Pre-loaded with the manifest under review.
   - Answers questions like "security concerns?", "does it touch protected systems?", "performance risk?", "is it educationally appropriate?".
   - Always ends with "Final decision remains with the Super Admin." — the model is advisory-only.
5. **Approve & Deploy** — writes a signed `extension_versions` row (SHA-256 of manifest + request ID + timestamp), deactivates any prior active version of the same extension, and flips the blueprint status to `deployed`. Extension is now live for every user in that tenant's schools.
6. **Reject** — records notes, sets blueprint back to `preview` for revision.
7. **Rollback** — deactivates a live version instantly; audit trail preserved.

## Effects when approved

- A signed row lands in `extension_versions` scoped to the requesting ministry's `tenant_id`.
- Every user whose `profile.school_id → schools.tenant_id` matches now sees the extension appear via `ext_list_active_for_me()`.
- `<TenantExtensionsSection />` renders a compact list of active extensions on any dashboard it's mounted in. Users can click through to `/extensions/:versionId`, which renders the manifest for their role.
- Extension writes go to `extension_data` (owner-scoped RLS) — never to any existing platform table.
- Rolling back is a single click; the extension disappears from every user in that tenant instantly.

## Data model (all new — nothing changes in existing schema)

| Table | Purpose |
|---|---|
| `extension_conversations` | One thread per design session, tenant-scoped |
| `extension_messages` | The ministry ↔ Lumina chat log |
| `extension_blueprints` | Versioned JSON manifests (`draft → preview → pushed → approved/rejected → deployed → rolled_back`) |
| `extension_requests` | Push-Forward queue for Super Admin |
| `extension_audit_chats` | Super Admin ↔ Audit Assistant private chat |
| `extension_versions` | Signed, deployed, active/rolled-back versions |
| `extension_data` | Runtime data written by deployed extensions (RLS to tenant + owner) |
| `extension_sandbox_data` | Synthetic data used only during Preview Mode |

Two ENUMs: `extension_blueprint_status`, `extension_request_status`.

## RPCs

**Ministry (called with `p_session_token`, granted to `anon`+`authenticated`):**
- `ext_create_conversation`, `ext_list_conversations`, `ext_load_conversation`
- `ext_append_message`, `ext_save_blueprint`
- `ext_push_forward`, `ext_withdraw_request`

**Super Admin (guarded by `is_super_admin_caller`):**
- `ext_list_pending_requests`
- `ext_approve_request` — issues the signed version
- `ext_reject_request`, `ext_rollback_version`
- `ext_append_audit_message`, `ext_load_audit_chat`

**Any user (auth required):**
- `ext_list_active_for_me` — resolves tenant from profile → schools, returns active versions

## Blueprint DSL (the "code" Lumina writes)

`src/lib/extensions/blueprint.ts` defines and validates:

- **Roles**: `student, teacher, parent, school_admin, ministry`
- **Widget types**: `heading, text, stat, table, form, list, chart, kanban`
- **Capabilities**: `data.read, data.write, file.upload, notification.send, export.csv`
- **Column types**: `text, number, date, boolean, select`

Every widget's `dataKey` must reference a declared `data[].key`. Names are snake_case; routes are kebab-case. Any protected keyword mention triggers validation failure. Anything unlisted fails Zod parse.

## Edge functions

- **`lumina-extension-chat`** — Ministry chat. Uses `openai/gpt-5.5` with `response_format: json_object`. Enforces the three response modes; runs both a pre-flight guard on the user's message and a post-flight guard on the assistant's message. Persists user and assistant turns via the RPCs. When mode is `blueprint`, saves via `ext_save_blueprint`.
- **`lumina-extension-audit`** — Super Admin audit assistant. Same model. Prepends the manifest as a system message, forces advisory-only responses.

Model choice rationale: `openai/gpt-5.5` handles the structured JSON output reliably at the reasoning depth needed for both design and audit. If a ministry later needs faster iteration, this can be swapped to `google/gemini-3.5-flash` per-function without touching the pipeline.

## Runtime interpreter

`ExtensionRenderer` reads a validated manifest and renders it using the widget allowlist. Two data-source hooks:

- `useDeployedDataSource(versionId, tenantId)` — reads/writes `extension_data`
- `useSandboxDataSource(blueprintId, tenantId)` — reads/writes `extension_sandbox_data`

RLS ensures a user can only ever see/write within their own tenant, and can only update/delete rows they own.

## Mount points

- **Ministry**: `ExtensionsPanel` added as the 13th tool in `ControlCenterShell` (Governance group).
- **Super Admin**: `ExtensionReviewPanel` added as a new tab in `/super-admin`.
- **Every user**: `/extensions/:versionId` route + `<TenantExtensionsSection />` component for dashboards.

## Protection guarantees — why prompt injection can't break this

1. Chat never returns executable code — only blueprint JSON.
2. Blueprint schema is a strict Zod allowlist. Anything referencing protected keywords, unknown widgets, unknown capabilities, or unknown roles fails validation before it reaches the Super Admin queue.
3. Sandbox writes are isolated from production writes at the table level.
4. Deploy path re-verifies validity and signs the manifest.
5. Runtime interpreter has no `eval`, no dynamic imports, no raw SQL.
6. Every RLS policy on `extension_data` and `extension_versions` filters by the caller's tenant, derived from `profiles.school_id → schools.tenant_id`.
7. Super Admin approval is the ONLY path from `pushed` → `deployed`.

## Files created

**Server-side**
- 1 migration adding 8 tables + 2 ENUMs + 12 RPCs
- `supabase/functions/lumina-extension-chat/index.ts`
- `supabase/functions/lumina-extension-audit/index.ts`

**Client-side**
- `src/lib/extensions/blueprint.ts` — DSL + Zod + validation
- `src/components/extensions/ExtensionRenderer.tsx` — runtime interpreter with 8 widgets
- `src/components/extensions/TenantExtensionsSection.tsx` — dashboard mount
- `src/pages/ExtensionView.tsx` — `/extensions/:versionId` route
- `src/components/ministry/control/ExtensionsPanel.tsx` — ministry workspace
- `src/components/admin/ExtensionReviewPanel.tsx` — super admin review
- Edits to `ControlCenterShell.tsx`, `SuperAdmin.tsx`, `App.tsx` for wiring

## Deferred (intentional)

- Extension marketplace (promoting an approved extension to other tenants) — belongs in a future EX9.
- File upload / notification capabilities are declared in the allowlist but the runtime widgets do not yet consume them — reserved for a follow-up phase without schema changes.
- Cross-tenant analytics of extension usage — belongs in the Observatory rather than here.
