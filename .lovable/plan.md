# SOTA Upgrade: Adaptation Engine + Output Engine (Paired Build)

This is the full multi-stage plan to push the adaptive engine and the output engine to the same level as the most advanced published systems combined: **AKT / simpleKT (KT)** + **2PL IRT + Elo** (statistical) + **FSRS-v5** (scheduling) + **DASH** (forgetting-aware logistic) + **contextual bandits** (selection) + **behavioral affect** (Baker/D'Mello) + **temperature-scaled calibration** + **MAML/Bayesian cold-start** — all wired into a fully closed loop that the output engine consumes step-for-step. Every stage upgrades **both** sides so neither outpaces the other.

## Current State (from codebase audit)

Working: 1PL Rasch in `ability-update` with hierarchical concept↔subject coupling, uncertainty-gated K, guess/slip, anchor recalibration, temporal decay, deterministic `StateVector → Regime → Trajectory` in `teachingOutputV2.ts`.

Broken / missing:

1. `teaching-generate` reads `theta` / `standard_error` from `student_learning_profiles` — **columns don't exist**. Pipeline silently runs with θ=0, SE=1.0.
2. `teaching-generate` reads `graded_events.is_correct` — actual column is `was_correct`. `recentErrorCount` is always 0.
3. `ai_output_signals` is written but **never read back** into generation — closed loop is open.
4. `fatigue` / affect input to state vector is hardcoded to 0; emotional + cognitive engines exist only in chat prompts (localStorage).
5. SM-2 lives twice: localStorage (`spacedRepetition.ts`) vs DB (`concept_mastery`). No sync. No FSRS.
6. No KT model (only Rasch). No bandit. No calibration layer. No cold-start prior. No 85% rule. No Elo fast-track.

## Target Architecture

```text
                ┌─────────────────────────────────────────────────────┐
                │              ADAPTATION ENGINE                       │
                │                                                       │
   answer ──►   │  ┌─────────┐  ┌──────┐  ┌──────┐  ┌────────────┐    │
                │  │ 2PL IRT │  │ Elo  │  │ DASH │  │ AKT/simpleKT│   │
                │  │ + concept│  │ fast │  │forget│  │ deep KT    │   │
                │  │ coupling │  │update│  │      │  │ (Edge ONNX)│   │
                │  └────┬────┘  └──┬───┘  └──┬───┘  └──────┬─────┘    │
                │       └──────┬───┴─────────┴─────────────┘          │
                │              ▼                                       │
                │       Stacked ensemble (isotonic blend)              │
                │              ▼                                       │
                │       Temperature-scaled P(correct)                  │
                │              ▼                                       │
                │       FSRS-v5 stability/retrievability               │
                │              ▼                                       │
                │       Behavioral affect (Baker NB on logs)           │
                │              ▼                                       │
                │       Bayesian/MAML cold-start prior                 │
                │              ▼                                       │
                │       StudentStateBundle  ◄── ai_output_signals      │
                └────────────────┬────────────────────────────────────┘
                                 │  (single canonical contract)
                ┌────────────────▼────────────────────────────────────┐
                │              OUTPUT ENGINE                           │
                │  Contextual bandit (LinUCB) → item / regime select  │
                │  85% rule + ZPD filter                              │
                │  StateVector → Regime → Trajectory (v3, fed by ALL  │
                │   above signals incl. affect, FSRS due, bandit pick)│
                │  Policy prompt → LLM → enforcePolicy v2             │
                │  Quality scorer (LLM judge + heuristics)            │
                │  Outputs logged → ai_output_signals → loop closed   │
                └─────────────────────────────────────────────────────┘
```

Every signal the adaptation engine produces is consumed by the output engine; every output is logged back as a reward into the bandit and a feature into the next adaptation step. **One contract, no orphans.**

---

## Stage 0 — Fix the silent bugs (blocking, ~1 session)

Without this, every later number is wrong.

1. Replace `student_learning_profiles.theta` read in `teaching-generate/index.ts` with a join on `ability_estimates` (subject-level + concept-level).
2. Fix `is_correct` → `was_correct` in the `graded_events` query.
3. Wire client-side fatigue / emotional / cognitive load signals into the `teaching-generate` request body so `buildTeachingStateVector` actually receives them.
4. Add an integration test (`scripts/teachingPipelineIntegration.test.ts`) that fails if either join returns the default and the request set non-default values.

## Stage 1 — Upgrade core IRT: 1PL → 2PL + Elo fast-path

Adaptation:

- Migration: add `discrimination_a` (NUMERIC, default 1.0) to `question_bank`; add `elo_rating` to `ability_estimates` (per user×subject) and `question_bank` (per item).
- `ability-update`: replace Rasch with 2PL update; keep concept↔subject hierarchical coupling and gating; add parallel Elo update (`K=16` warm, `K=32` cold-start) for fast difficulty drift on new items before 2PL has converged.
- `recalibrate-anchors`: estimate `a` via EM (joint with `b`) using last 30 days of `graded_events`; require ≥50 responses per item.
- Add discrimination clamp `a ∈ [0.3, 2.5]` and log per-item discrimination drift.

Output (matched upgrade):

- Pass `(θ, SE, a, b)` quartet (not just θ) into `buildTeachingStateVector`. Regime selection uses 2PL `P(correct | θ, a, b)` instead of effective-score heuristic.
- `catSelector` switches to Fisher information under 2PL: `I(θ) = a² P(1−P)`.

## Stage 2 — Add KT layer: AKT-lite (server) + DASH (logistic forgetting)

Adaptation:

- New table `kt_sequence_state` (user_id, subject, last_512_interactions JSONB, kt_hidden_state JSONB, updated_at).
- New edge function `kt-predict`: loads the last 512 `(question_id, concept_id, was_correct, Δt, response_time)` and runs a small **simpleKT** model (Rasch-embedded + monotonic attention, ~2M params) compiled to ONNX and executed via `onnxruntime-web` in Deno. Returns per-concept `P(correct)` for any candidate item.
- Train simpleKT offline (Colab/notebook in `/scripts/train_simplekt.ipynb`) on the project's `graded_events` dump; check in versioned `model.onnx` to `supabase/functions/_shared/models/`.
- Parallel **DASH** logistic predictor (pure SQL/Edge, no ML deps) as a guaranteed-available fallback when the ONNX model fails to load:
`logit(p) = β_c + γ_c · Σ s_τ·exp(−Δτ/δ_c) + ρ_c · Σ f_τ·exp(−Δτ/δ_c)`.
- **Stacked ensemble**: blend `{2PL, Elo, AKT, DASH}` predictions via isotonic regression fit on a held-out 20% of events; per-user weights stored in `ensemble_weights` table; default to population weights for cold start.

Output:

- Output engine consumes `P(correct | candidate_concept)` from the ensemble instead of recomputing heuristics. `deriveTeachingRegime` v3 takes the full prediction distribution, not a scalar mastery.

## Stage 3 — Calibration layer (Brier / ECE / temperature)

Adaptation:

- New table `calibration_state` (subject, temperature, platt_a, platt_b, isotonic_bins JSONB, ece, brier, updated_at).
- Nightly cron edge function `calibrate-predictions`: pulls last 30 days of `(predicted_p, was_correct)`, fits temperature scaling per subject; falls back to isotonic if ECE still > 0.05.
- Every prediction path applies `P_cal = σ(logit(p)/T)` before downstream use.

Output:

- Admin diagnostics tile shows live **Brier**, **ECE**, **AUC** per subject. Alerts when ECE > 0.05 or Brier rises >0.01 vs 7-day baseline.
- The output engine's confidence-band sizing (already in `catSelector`) uses calibrated probabilities, so "challenge" mode actually triggers at calibrated 0.85+ instead of raw model overconfidence.

## Stage 4 — FSRS-v5 replaces SM-2 (and reconciles the dual stores)

Adaptation:

- Migration: extend `concept_mastery` with `fsrs_difficulty`, `fsrs_stability`, `fsrs_retrievability`, `fsrs_state` (new/learning/review/relearning), `fsrs_lapses`.
- Port FSRS-v5 (17 weights `w[0..16]`) to TypeScript in `src/lib/adaptive/fsrs.ts` and `supabase/functions/_shared/fsrs.ts` (single shared implementation).
- New table `fsrs_user_params` storing per-user optimized `w` after ≥1k reviews; default to FSRS published defaults.
- Nightly `optimize-fsrs-params` edge function fits per-user `w` via gradient descent on personal review log.
- Delete localStorage SM-2 (`spacedRepetition.ts`) — DB becomes single source of truth; thin client wrapper reads via React Query.

Output:

- `recall_schedule` is generated from FSRS retrievability < 0.80, not SM-2 next-review date.
- Output engine receives an explicit `dueReviewItems[]` and `daysUntilFirstLapse` in the state vector. Regime `consolidate` is auto-forced if any item's retrievability < 0.7.

## Stage 5 — Behavioral affect detector (server-side, log-based)

Adaptation:

- New table `behavior_events` (user_id, session_id, kind, payload JSONB, created_at) — captures: response latency, hint requests, regenerate clicks, abandon, scroll, help-abuse.
- Front-end emitter `src/lib/behaviorTracker.ts` writes via a debounced edge function `record-behavior`.
- New edge function `infer-affect` runs a gradient-boosted classifier (XGBoost compiled to ONNX, ~100KB) over the last 10-interaction window and returns one of `{engaged, bored, confused, frustrated, anxious}` with confidence.
- Bootstrap labels from heuristic rules (Baker NB-style) for the first 30 days; collect optional self-report at session end to label real data; retrain weekly.
- Merge with existing localStorage `emotionalStateEngine` outputs as an additional feature, not a replacement, so chat-only signals still contribute.

Output:

- `buildTeachingStateVector` v3 takes `affect: AffectLabel & {confidence}`. Trajectory builder:
  - `frustrated` → force `remediate`, slow pacing, add encouragement step.
  - `bored` → force `challenge`, drop scaffolding steps, raise novelty.
  - `confused` → force `consolidate`, insert misconception-hunt step.
  - `anxious` → confidence-band widens, lower stakes wording.
- Affect-modulated 85% rule: target success rate floats `0.85 ± 0.05` based on affect (`frustrated → 0.90`, `bored → 0.75`).

## Stage 6 — Contextual bandit content selection (LinUCB)

Adaptation:

- New table `bandit_arms` (arm_id, kind, context_keys, A_matrix JSONB, b_vector JSONB, n_pulls, last_updated) — arms are *(concept_id × regime × strategy)* tuples.
- Edge function `select-next-item`: builds context `x = [θ, SE, mastery, recent_accuracy, affect_onehot, fsrs_retrievability, time_of_day, session_length]`, runs LinUCB, returns top-k arms with UCB scores.
- Reward = composite: `0.5·learning_gain (Δmastery via KT) + 0.3·helpfulness_signal + 0.2·calibrated_correctness`.
- Spaced-repetition override: any FSRS-due item with retrievability < 0.7 preempts the bandit.

Output:

- Output engine asks `select-next-item` for the next concept/strategy/regime jointly, instead of choosing them in isolation. The deterministic `StateVector → Regime → Trajectory` cascade now takes its `(concept, regime, strategy)` from the bandit and only derives the *trajectory steps*. This is the key wiring change that makes the two engines truly co-equal.

## Stage 7 — Close the loop on `ai_output_signals`

Adaptation:

- `kt-predict`, `select-next-item`, and `ability-update` all consume the last 50 `ai_output_signals` rows for the user as features:
  - `recent_negative_rate`, `regenerate_rate`, `too_easy_rate`, `too_hard_rate`.
- These features feed the bandit context vector and modulate KT prior pessimism (high negative rate → wider SE → more exploration).
- `adaptiveProfileBus` cache key now includes a hash of the last signal — invalidates on every signal arrival.

Output:

- The next teaching call's prompt explicitly references recent signal trends ("last 3 explanations got 'too hard' — drop one abstraction level"). `enforcePolicy` v2 verifies the response actually changed register, regenerates once if not.

## Stage 8 — Cold start (Bayesian shrinkage + MAML + concept embeddings)

Adaptation:

- New table `population_priors` (subject, grade_level, theta_mean, theta_sigma, fsrs_w_default, ensemble_weights, updated_at) computed nightly.
- New user `ability_estimates` row initialized to `N(μ_pop, σ_pop²)` per subject from `population_priors` for their grade.
- New question without history: embed question text via Lovable AI embeddings (`google/gemini-embedding-001`), look up 10 nearest items in `question_bank` (pgvector), seed `b` as weighted-avg of neighbors' `b`.
- MAML-initialized KT weights (trained offline) shipped as `model_meta.onnx`; 5–10 interactions of personal data give a usable forecast.

Output:

- New-student output uses `provisional: true` flag in state vector → trajectories get extra verification step and avoid `challenge` regime until SE drops below 0.6.

## Stage 9 — Output engine v3 (matched depth)

This is the output-side counterpart that keeps parity with everything above.

- Rebuild `teachingOutputV2.ts` → `teachingOutputV3.ts` with the input contract:
`{ ensemble_p: Record<conceptId, number>, affect, fsrsItems, bandit_pick, ai_signal_trends, provisional, calibrated, allConceptAbilities }`.
- New regime classifier is a tiny decision tree (deterministic, learned offline from `graded_events × ai_output_signals`) instead of hand-rolled thresholds — checked in as JSON, re-trainable, explainable. Falls back to current heuristic if the tree fails to load.
- Trajectory templates expanded from 4 (current) to 9: `{cold_start, remediate_deep, remediate_shallow, consolidate, advance, challenge, lapse_recovery, exam_prep, boredom_break}`.
- `enforcePolicy` v2 uses a tool-call validator (Lovable AI structured output) that checks: (a) every required step kind is present, (b) reading register matches the policy (Flesch-Kincaid range), (c) no forbidden patterns from the user's `ai_output_signals` history. One automatic regeneration on failure.
- `adaptive_quality_scores` writer is mandatory on every output; scores feed the bandit reward.

## Stage 10 — Benchmark harness + admin dashboard (verification you said is secondary, but required for trust)

- `scripts/benchmark.ts`: held-out 20% of `graded_events`; reports per-subject **AUC, Brier, ECE, log-loss** for each member of the ensemble and the blend; writes to `model_benchmarks` table.
- Admin tile `AdaptiveSOTAStatus.tsx`: live AUC vs target (0.78), Brier, ECE, FSRS retention curve, bandit cumulative regret, affect classifier F1.
- CI guard: if AUC drops > 2pp vs last week, alert; auto-roll-back model artifact.

---

## Technical Section — Schemas, files, and explicit changes

### New tables (Stages 1–8)

- `kt_sequence_state(user_id, subject, interactions JSONB, hidden_state JSONB, updated_at)`
- `ensemble_weights(user_id, subject, weights JSONB, fit_at)`
- `calibration_state(subject, temperature, platt_a, platt_b, isotonic_bins JSONB, ece, brier, updated_at)`
- `fsrs_user_params(user_id, w_vector JSONB, n_reviews_fitted, fit_at)`
- `behavior_events(id, user_id, session_id, kind, payload JSONB, created_at)`
- `bandit_arms(arm_id, kind, A JSONB, b JSONB, n_pulls, updated_at)`
- `population_priors(subject, grade_level, theta_mean, theta_sigma, defaults JSONB, updated_at)`
- `model_benchmarks(run_at, model, subject, auc, brier, ece, n)`

All tables get RLS + GRANTs per the project's standard pattern. Anything user-scoped uses `auth.uid()` policies; population/calibration tables are admin-write, authenticated-read.

### Columns added

- `question_bank.discrimination_a NUMERIC default 1.0`
- `question_bank.elo_rating NUMERIC default 1500`
- `question_bank.embedding vector(768)` (pgvector)
- `ability_estimates.elo_rating NUMERIC default 1500`
- `concept_mastery.{fsrs_difficulty, fsrs_stability, fsrs_retrievability, fsrs_state, fsrs_lapses}`

### New edge functions

`kt-predict`, `select-next-item`, `calibrate-predictions` (cron), `optimize-fsrs-params` (cron), `record-behavior`, `infer-affect`, `train-population-priors` (cron).

### New / rewritten client modules

- `src/lib/adaptive/fsrs.ts`, `src/lib/adaptive/ensemblePredict.ts`, `src/lib/adaptive/banditClient.ts`, `src/lib/behaviorTracker.ts`, `src/lib/adaptive/teachingOutputV3.ts`.
- `spacedRepetition.ts` deleted; thin React Query hook replaces it.

### Sequencing & rough effort


| Stage | Adaptation                              | Output                                                    | Effort |
| ----- | --------------------------------------- | --------------------------------------------------------- | ------ |
| 0     | Bug fixes                               | Wire fatigue input                                        | S      |
| 1     | 2PL + Elo                               | Quartet state vector                                      | M      |
| 2     | AKT + DASH + ensemble                   | Regime from prediction distribution                       | L      |
| 3     | Temperature scaling                     | Calibrated bands + dashboard                              | S      |
| 4     | FSRS-v5                                 | Due-aware trajectories                                    | M      |
| 5     | Behavioral affect                       | Affect-modulated trajectories                             | M      |
| 6     | LinUCB bandit                           | Bandit-driven concept/regime/strategy                     | L      |
| 7     | Loop closure on signals                 | Signal-aware prompts + validator                          | S      |
| 8     | Cold-start (priors + MAML + embeddings) | Provisional-aware output                                  | M      |
| 9     | —                                       | Output engine v3 (trees + 9 trajectories + LLM validator) | L      |
| 10    | Benchmark harness + admin tile          | —                                                         | S      |


S ≈ 1 session, M ≈ 2–3, L ≈ 4–6. Total realistic horizon: **~30 focused sessions**. I can ship them sequentially without further confirmation between stages once you approve the plan.

### Honest ceiling after full execution

On a real held-out benchmark, with all stages live and ≥30 days of data per active student, the engine should land at:

- **AUC 0.80–0.86** on warm students (matches published AKT/simpleKT territory).
- **AUC 0.70–0.75** on cold-start (matches MetaKT / CL4KT few-shot regime).
- **Brier ≤ 0.18**, **ECE ≤ 0.04** after calibration.
- **FSRS retention curve** within 3pp of stated target retention (e.g. 0.90 target → measured 0.87–0.93).

That is genuine SOTA. 97% is not physically reachable on next-item correctness — but everything that *can* be SOTA *will* be SOTA, and the output engine will be wired to actually use it.

### What I need from you before starting

Just one decision: do you want me to ship **all 10 stages back-to-back without stopping**, or **pause for review after each stage** so you can spot-check? Default is back-to-back if you don't say. 

You pause for a review after each stage and remember this must reach state of the art level just exactly like you searched so everything that you will commit or do have and must be professional with no rushed codes I know I sound ambitious and I mean it 