# Ministry Control · MC3 Dossier — Curriculum Management

**Phase:** MC3 · **Ships in:** `20260716_ministry_control_mc3_mc11.sql`
**Depends on:** MC2 (Draft & Publish pipeline)
**Panel:** `src/components/ministry/control/CurriculumPanel.tsx`

---

## Purpose

Curriculum is the national educational blueprint. The ministry owns official
subjects and curriculum versions; schools inherit them and can never modify
them directly. Every curriculum change flows through the MC2 Draft → Review →
Publish pipeline so the audit log captures who proposed, who reviewed, and
who published each edit.

## Data model

### `mc_curriculum_version_defs`

Named editions the tenant runs (`Saudi 2028`, `Saudi 2029`, …).

| Column | Purpose |
|---|---|
| `tenant_id` | Country tenant that owns the version |
| `label` UNIQUE per tenant | Human-readable name |
| `effective_from` / `effective_to` | Date window |
| `status` | `draft` / `active` / `retired` |
| `notes` | Free text |

### `mc_curriculum_subjects`

Official subjects. Automatic propagation is implicit — subjects are
tenant-scoped, so every school in that tenant reads the same official list.
No per-school row is created; schools discover subjects by querying
`mc_curriculum_subjects` filtered by their own `tenant_id`.

| Column | Purpose |
|---|---|
| `tenant_id` | Owning tenant |
| `subject_code` UNIQUE per tenant | Permanent identifier — never changes when the display name changes |
| `name` | Display name |
| `applies_grades int[]` | Which grades take the subject |
| `version_id` | FK to `mc_curriculum_version_defs` |
| `language` | Subject language |
| `learning_standards jsonb` | Ministry-owned standards payload |
| `status` | `active` / `retired` — retirement preserves history rather than destroying it |
| `is_official` | Always `true` for ministry-owned rows; local school enrichment subjects live elsewhere |

### Retirement contract

Retiring a subject sets `status='retired'` and stamps `retired_at`. Historical
lessons, analytics, and adaptive data remain untouched. Teacher roles derived
from the subject become inactive rather than deleted — a follow-up MC3.1
migration will formalize the teacher-role lifecycle table if schools ever
carry per-role state that outlives the subject definition.

## Appliers registered

| entity_type | Applier | Payload shape |
|---|---|---|
| `curriculum.subject` | `apply_curriculum_subject_change` | `{ action?: 'upsert'\|'retire', subject_code, name, description?, applies_grades:int[], version_id?, language?, learning_standards? }` |
| `curriculum.version` | `apply_curriculum_version_change` | `{ label, effective_from?, effective_to?, status?, notes? }` |

Both appliers are `SECURITY DEFINER` and derive `tenant_id` from the change
request row so operators cannot cross-write into a foreign tenant.

## Read RPCs

- `list_mc_curriculum_subjects(p_session_token)` — session-token aware; returns rows scoped to the ministry session's tenant.
- `list_mc_curriculum_versions(p_session_token)` — same scoping contract.

## UI (`CurriculumPanel`)

Two stacked sections: **Curriculum versions** table + **Draft version** dialog;
**Official subjects** table + **Draft subject** dialog. Retirement is expressed
via the `action: 'retire'` field in the subject draft (single applier,
two verbs). No inline editing — every mutation is a draft submission.

## Non-goals for MC3

- Local school enrichment subjects (Robotics, Chess, …) — those belong to the
  school domain and are owned by school administrators, not the ministry.
- Automatic teacher-role creation is deferred until the teacher domain adds
  a `role_source` column; MC3 exposes subjects only.
- Dynamic subject generation for students remains unchanged; the student
  interface still asks "what do you want to learn?" and Lumina applies the
  curriculum as context, not as a topic browser.
