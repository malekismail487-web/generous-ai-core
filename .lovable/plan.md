## Order of work

You confirmed: build the two new features first; the Extension DSL relaxation carries afterward. So the roadmap is **MI (Ministry Intelligence) → AP (AI Personalization) → EXR (Extension Relaxation)**, each split into professional, non-rushed phases with a dossier per phase.

---

## Feature 1 — Ministry Intelligence System (MI1–MI6)

A multi-level (School / Regional / National) educational observability + recommendation layer. Continuous background observation of activity that already exists on the platform — no new questions asked of students, no teacher evaluation, no automated decisions. Complements ALE; never replaces it.

**Absolute rules (baked into every phase):**

- Never touches ALE / LSE / ability estimates / core isolation.
- Never exposes individual student identities in ministry views — cohort minimums enforced.
- Never evaluates a named teacher — patterns only.
- Every recommendation stays a *recommendation*; humans approve, nothing auto-applies.
- Fully tenant-scoped: no ministry sees another tenant's data.

### MI1 — Observation Pipeline (data ingestion)

- New table `mi_educational_events` (tenant_id, school_id, region_id, event_type, concept_id, subject_id, aggregated_payload jsonb, occurred_at). Grants + tenant RLS + service_role only writes.
- Silent event emitters attached to the existing surfaces already producing signals: homework submissions, assignment_submissions, exam_submissions, lesson_events, saved_lectures, course_materials uploads, Lumina Live sessions, chat/tutor interactions. No new UI, no new prompts.
- Events are aggregated at write-time (per-concept counts, success/failure, timing) — never per-student PII beyond an internal hashed link the ministry can never query.

### MI2 — Analytics Engine (school / regional / national aggregates)

- Tables: `mi_school_health`, `mi_region_health`, `mi_national_health`, `mi_concept_difficulty`, `mi_resource_effectiveness`. Multi-dimensional profiles (never single scores).
- Scheduled edge function `mi-aggregate` (pg_cron nightly + on-demand) rolls events into the health tables. Cohort-size floor (e.g. ≥10) before any % is stored; smaller cohorts stored as "insufficient sample".
- Read RPCs: `mi_get_school_health`, `mi_get_region_health`, `mi_get_national_health`, all tenant-scoped via `ministry_sessions`.

### MI3 — Insights Dashboard (Ministry Workspace tab)

- New tab **Intelligence** in `MinistryDashboard` alongside existing Dashboard / Control Center.
- Drill-down: National → Regional → School → Evidence panel. Trend charts, concept-difficulty heatmap, resource-effectiveness view. All read-only, aggregated.
- Natural-language "Ask the Intelligence" input that calls a new `mi-search` edge function (Lumina) restricted to querying the mi_* tables of the caller's tenant only.

### MI4 — Alerts (Critical / High / Medium / Info)

- `mi_alerts` table + generator inside `mi-aggregate` (rule-based thresholds, not AI-decided). Alerts panel in the Intelligence tab. Marking read/acknowledged is audited.

### MI5 — Recommendation Engine

- `mi_recommendations` table (scope, subject, evidence_refs, confidence, rationale, status: pending/accepted/rejected/modified). Generator uses the mi_* aggregates + Lumina to draft rationale text; nothing writes back into curriculum/policies directly.
- Ministry accepts/rejects. Accepted recommendations flow into the existing `ministry_change_requests` Draft & Publish pipeline for the appropriate MC tool (curriculum, policy, feature flag, etc.), where they still need Super Admin approval per current MC2 rules.

### MI6 — Governance & Audit

- Every alert view, recommendation action, and drill-down is logged in a new `mi_audit_log`.
- Super Admin gets an **Intelligence Oversight** panel: cross-tenant health at aggregate-only level, plus recommendation-throughput metrics.
- Dossier: `.lovable/ministry-intelligence-MI1-MI6-dossier.md`.

---

## Feature 2 — AI Personalization Architecture (AP1–AP4)

Hierarchical (National → Regional → School) control over *how* Lumina presents education — never *what* it teaches. Ministries adjust language, tone, pacing, visual density, example density, interaction style. Educational truth, ALE internals, KT/FSRS, auth, tenant isolation are structurally out of scope.

### AP1 — Config Model

- Table `ap_presentation_config` with `(tenant_id, scope enum('national','region','school'), scope_id, key, value)` — override-only (deltas), inheritance resolved at read.
- Allowlist of keys enforced in a Zod schema in `src/lib/personalization/keys.ts` (language, tone, reading_complexity, pacing, example_density, visual_density, interaction_style). Anything outside the allowlist is rejected — mirrors the extension blueprint safety pattern.

### AP2 — Resolver + Injection

- `ap_resolve_for_school(school_id)` RPC returns the fully-inherited config.
- `usePresentationConfig` hook + injection into the existing Lumina prompt builders (`buildLuminaSystemPrompt`) as a *presentation preamble* only. Automatic validator refuses any resolved config that would alter correctness (e.g. "answer differently" — rejected).

### AP3 — Ministry Personalization UI (inside Control Center)

- New MC tool **Personalization** with three tabs (National / Regional / School). Transparency panel showing "this value comes from: National / Region X / School Y override". All edits go through the existing `ministry_change_requests` Draft & Publish → Super Admin approval pipeline.

### AP4 — Evidence-Driven Suggestions

- Personalization suggestions generator that reads MI aggregates (Feature 1) and drafts config deltas as recommendations in `mi_recommendations` with scope='personalization'. Ministry accepts / rejects / modifies. Nothing auto-applies.
- Dossier: `.lovable/ministry-ai-personalization-AP1-AP4-dossier.md`.

---

## Feature 3 (after both above) — Extension DSL Relaxation (EXR1–EXR4)

Per your answers: **Lumina drafts SQL migrations + React/TSX components. Ministry never edits code. Super Admin reviews raw code + sandbox preview, then approves. Everything auto tenant-scoped with RLS. Kept forbidden: custom AI models, realtime channels, anything touching ALE / LSE / ability estimates / core isolation / auth / tenants.**

### EXR1 — Blueprint v2 schema

- Extend `src/lib/extensions/blueprint.ts` with two new artifact kinds:
  - `migration`: SQL fragment restricted by a parser (allows `CREATE TABLE`, `ALTER TABLE ADD COLUMN`, `CREATE INDEX`, `CREATE POLICY`, `GRANT`; forbids `DROP`, `TRUNCATE`, references to protected schemas/tables — auth, tenants, tenant_roles, ministry_*, mc_*, ability_estimates, lesson_events, fsrs_*, kt_*, unified_*, ai_*, bandit_*, ensemble_*, and any table not prefixed `ext_<tenantSlug>_`).
  - `component`: TSX source restricted by an AST allowlist (no `import` from `@/integrations/supabase/client` outside a provided `useExtensionClient` wrapper; no `fetch`; no `WebSocket`; no `supabase.channel`; no `import.meta.env`; no dynamic `import()`; no `eval`/`new Function`).
- Auto-inject `tenant_id uuid not null default <tenant>` + RLS policies scoped to `ministry_sessions.tenant_id` / `has_role(auth.uid(),...) AND profiles.tenant_id = <tenant>` into every generated migration. Table naming enforced as `ext_<tenantSlug>_<name>`.

### EXR2 — Lumina authoring (plan-first, current-version aware)

- Update `lumina-extension-chat` to emit Blueprint v2 including `migrations[]` and `components[]`, still building **from the current saved blueprint** (already implemented). Hard refusals extended with the new forbidden surfaces (realtime, custom models, ALE/LSE, auth, tenant tables).

### EXR3 — Super Admin review surface

- `ExtensionReviewPanel` gains: SQL diff viewer, TSX diff viewer, static analysis report (parser + AST results), sandbox preview that actually runs the migration against a per-request throwaway schema `ext_sandbox_<uuid>` and mounts the component in an isolated iframe. Approve button runs the migration against the real DB in a transaction, signs the version, and marks it deployed.

### EXR4 — Runtime rendering + tenant fence

- `ExtensionRenderer` learns to dynamically load approved TSX components via a signed bundle URL served from an edge function. Component runtime is given only `useExtensionClient` (which is a supabase client scoped by RLS to that tenant + that extension's `ext_<tenantSlug>_*` tables). Approved extensions still surface via `TenantExtensionsSection` on the role dashboards, so only users in the requesting tenant ever see them.
- Dossier: `.lovable/ministry-extensions-EXR1-EXR4-dossier.md`.

---

## Technical notes

- All new tables follow the standard four-step migration pattern (CREATE → GRANT → ENABLE RLS → POLICY) and include `tenant_id` NOT NULL + tenant-scoped policies.
- Every new RPC used by the ministry portal is granted to both `authenticated` and `anon` (the ministry portal authenticates via `ministry_sessions`, not `auth.uid()`).
- No changes to ALE, LSE, ability_estimates, fsrs_*, kt_*, unified_*, ai_*, bandit_*, ensemble_*, tenants, tenant_roles, or any auth-adjacent table.
- Aggregators run via `pg_cron` + on-demand edge functions; no realtime channels are added.
- One dossier per feature block under `.lovable/`, written to match exactly what shipped (not the plan).

---

## Total phase count after this plan

- **MI: 6 phases**
- **AP: 4 phases**
- **EXR: 4 phases**
- **Grand total: 14 phases**, three dossiers.

## Open questions I'll assume defaults on unless you say otherwise

1. Cohort-size minimum for any % stat shown to ministries → default **10**.
2. AI Personalization changes → default **still require Super Admin approval** (routed through `ministry_change_requests`), same as every other MC tool.
3. Recommendation approval → default **any user holding an MC capability for that domain** (existing permissions model), not a committee.
4. Extension migrations restricted to `ext_<tenantSlug>_*` table names → default **yes, non-negotiable**.

Approve to start MI1.

I approve under one condition. Every change you do must be done, not in a rushed manner. It should be done in a professional way. Do not rush any codes and every thing you build you must make a dossier on it and it must be exactly based off of what you have built