# Adaptive Learning Engine API (ALE API) — Dossier

Single, separate API key that exposes **every** adaptive learning engine capability
to an external client (the standalone AI coder) without moving or duplicating any
engine code.

## Endpoint

```
POST https://ivzltzehosalijmkgzhb.supabase.co/functions/v1/ale-api
Authorization: Bearer ale_live_REDACTED
Content-Type: application/json
```

Body:
```json
{
  "action": "ability.update",
  "student_id": "<optional Lumina user uuid>",
  "external_student_id": "<optional stable id from your system>",
  "payload": { "...action-specific..." }
}
```

Discovery: `{"action":"capabilities"}` returns the live action catalogue.

## How it works (supabase/functions/ale-api/index.ts)

1. Hashes the bearer key (SHA-256) and looks it up in `ale_api_keys` (active only).
2. Enforces monthly quota (`monthly_request_quota`) and per-minute rate limit.
3. Resolves the acting learner:
   - `student_id` → that Lumina account,
   - `external_student_id` → mapped via `ale_api_students`, auto-provisioning an
     isolated shadow learner on first use,
   - neither (non-learner actions) → this key's own `__service_account__` learner.
4. Mints a short-lived learner access token (admin `generateLink` → `verifyOtp`),
   cached in-instance until ~1 min before expiry.
5. Forwards the payload to the **real** ALE edge function. No engine logic is
   reimplemented here, so θ/IRT updates, the AKT+DASH+Hawkes+FSRS ensemble,
   teaching policy and validation all behave exactly as inside Lumina.
6. Logs action, status, latency and error into `ale_api_usage`; increments the
   key counter only on success.

## Action catalogue (34 actions → 34 engine functions)

| Group | Actions |
| --- | --- |
| ability | `ability.update`, `ability.predict`, `ability.simulate`, `ability.cold_start`, `ability.confidence`, `ability.assessment_score` |
| concept | `concept.infer`, `concept.bind_curriculum` |
| memory | `review.schedule`, `review.decay_refresher`, `review.grade_refresher`, `memory.consolidate`, `memory.extract` |
| teaching | `teaching.generate`, `teaching.socratic_turn`, `teaching.teach_back_grade`, `teaching.debate`, `teaching.misconception_generate`, `teaching.misconception_grade`, `teaching.override`, `teaching.validate` |
| analytics | `predict.student`, `analytics.policy_evaluate`, `analytics.outcome_report` |
| ops (admin scope) | `ops.calibrate_predictions`, `ops.recalibrate_anchors`, `ops.retrain_ensemble`, `ops.unified_optimize`, `ops.evaluate_models`, `ops.auto_tune`, `ops.continuous_validate`, `ops.refresh_cold_start_priors`, `ops.pilot_study` |

## Schema

- `ale_api_keys` — label, partner, prefix, `key_hash` (unique), quota, rate limit,
  `allow_admin_ops`, counters, active/revoked. RLS: super admin read only.
- `ale_api_students` — `(api_key_id, external_ref) → user_id`. RLS: service only.
- `ale_api_usage` — per-call action/status/latency/error. RLS: super admin read only.

## Verified live

- `capabilities` → 200, full catalogue.
- `concept.infer` → 200 via service account.
- `ability.predict` (external learner) → 200, full ensemble output
  (`p_2pl`, `p_elo`, `p_akt`, `p_dash`, `p_fsrs`, `p_hawkes` + blend weights).
- `review.schedule` → reached the engine and returned its own payload validation
  error, confirming the auth chain.

## Config

`supabase/config.toml` sets `[functions.ale-api] verify_jwt = false` so the gateway
can authenticate with the `ale_live_` key instead of a Supabase JWT.
