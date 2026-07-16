# Ministry Control · MC8 Dossier — Lumina Configuration

**Phase:** MC8 · **Migration:** `20260716_ministry_control_mc3_mc11.sql`
**Panel:** `src/components/ministry/control/LuminaConfigPanel.tsx`

---

## Purpose

Personalize Lumina's *educational presentation* per tenant. Terminology,
explanation style, vocabulary preferences, pacing defaults, and
accessibility defaults are all configurable. **Protected systems remain
immutable** — this panel never reaches reasoning, factual correctness,
safety, adaptive engine internals, or the learning synchronization engine.

The architectural rule:

> Policy configures the AI.
> Policy never overrides factual correctness.

## Data model — `mc_lumina_config`

Single row per tenant (enforced by `UNIQUE (tenant_id)`).

| Column | jsonb payload |
|---|---|
| `terminology` | Ministry-preferred terms ("mark" vs "grade", "term" vs "semester", …) |
| `explanation_style` | Formality, tone, cultural framing preferences |
| `vocabulary` | Preferred / discouraged word lists |
| `pacing` | Default session length, difficulty ramp preferences |
| `accessibility` | Default font, contrast, dyslexia mode toggles |

Each column defaults to `{}`. Publishing a change with a subset of columns
merges via `COALESCE(EXCLUDED.x, mc_lumina_config.x)` inside the applier —
sending an empty object preserves the current value.

## Applier

**`lumina.config` → `apply_lumina_config_change`**

Upsert keyed on `tenant_id`. Payload accepts any subset of the five
categories; unspecified categories are left untouched.

## Read RPC

- `list_mc_lumina_config(p_session_token)` — returns the single tenant row
  if present.

## UI (`LuminaConfigPanel`)

- Card-per-category preview when a config row exists.
- Draft dialog with one `json` textarea per category, pre-filled from the
  current values so the operator edits the exact structure they see.

## Non-goals for MC8

- No JSON schema validation. Each consumer of the config (Lumina AI
  prompts, chat UI, accessibility layer) is responsible for tolerating an
  arbitrary shape. This mirrors how `mc_educational_policies.config` works.
- The AI reasoning layer never reads `explanation_style` at inference time
  to alter *facts* — only *presentation*. Safety systems are not accessible
  from this panel.
- No per-school override — schools inherit the tenant Lumina config as a
  read-only default. School-level personalization stays with the student
  (`Wallpaper Personalization`, `Lite Mode`, etc.).
