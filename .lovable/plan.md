# LUMINA — Adaptation ↔ Teaching Output V2 Unification

## Goal

Make `/teaching/generate` the single source of truth that converts the current adaptive student state into a deterministic teaching trajectory, then renders it through AI — with the student's response feeding back into the Adaptation Engine. No schema breaks, no cross-student leakage, no parallel state.

## Current state (verified)

- `supabase/functions/teaching-generate/index.ts` already loads θ/SE, concept & lecture mastery, visual preference, and runs an inlined `derivePolicy` mirroring `src/lib/adaptive/teachingPolicy.ts`. It calls Lovable AI Gateway (`google/gemini-2.5-flash`) and returns `{ policy, content, theta, standardError, conceptMastery, lectureMastery }`.
- `src/lib/adaptive/teachingPolicy.ts` is the canonical pure deterministic policy function (client-side mirror).
- Adaptation side: `useAdaptiveIntelligence` + `adaptiveIntelligence.ts` already record answers, chat, teaching events into IRT / mastery / spaced-rep / emotional subsystems.
- Only consumer of `teachingPolicy` in UI today is `StudentViewSimulator`. There is no `TeachingStateVector` / `TeachingRegime` / `TeachingTrajectory` layer yet — that's the gap.

## Architecture (closed loop)

```text
student answer ──► useAdaptiveIntelligence.recordAnswer
                       │  (IRT + mastery + gaps + emotion)
                       ▼
              Unified Student State (DB: ability_estimates,
              concept_mastery, student_learning_profiles,
              knowledge_gaps, learning_style_profiles)
                       │
        /teaching/generate (single entry)
                       │
            ┌──────────┴──────────┐
            ▼                     ▼
   buildTeachingStateVector   loadCurriculumNode
            │                     │
            └─────► deriveTeachingRegime  (pure, deterministic)
                            │
                            ▼
                  buildTeachingTrajectory  (pure)
                            │
                            ▼
                  buildPolicyPrompt + callAI
                            │
                            ▼
              enforcePolicy(output, regime, trajectory)
                            │
                            ▼
        { regime, trajectory, content, stateVector }
                            │
                  recordTeachingEvent ──► loop closes
```

## Changes

### 1. New pure module: `src/lib/adaptive/teachingOutputV2.ts`

Pure, deterministic, no IO. Exports:

- `TeachingStateVector` — `{ theta, standardError, mastery, lectureMastery, errorCount, conceptDifficulty, visualPreference, recentEmotion?, fatigue? }`
- `TeachingRegime` — `{ mode: 'remediate'|'consolidate'|'advance'|'challenge', intensity: 0..1, abstractionBias: 0..1, verificationBias: 0..1 }`
- `TeachingTrajectory` — ordered `TeachingStep[]` where each step has `{ kind: 'hook'|'explain'|'worked_example'|'check'|'practice'|'reflect', cognitiveLoad, expectedDurationSec, mustVerify }`
- `buildTeachingStateVector(input)` — normalize + clamp
- `deriveTeachingRegime(vector)` — deterministic cascade (mode from θ + mastery + errors; intensity from SE; abstraction from lectureMastery)
- `buildTeachingTrajectory(vector, regime)` — deterministic step list sized by regime.intensity and verificationBias
- `buildPolicyPrompt(regime, trajectory, curriculum)` — compact constraint fragment
- `enforcePolicy(content, regime, trajectory)` — wraps AI output with `constrainedBy` metadata; strips/flags any step the model dropped

Keeps `deriveTeachingPolicy` (existing) intact as a lower-level primitive that the new layer composes — no breaking change to current callers.

### 2. Rewire `supabase/functions/teaching-generate/index.ts`

- Inline-mirror the new module the same way `derivePolicy` is mirrored today (Edge Function constraint — no cross-imports from `src/`).
- Replace the current single-policy flow with: load state → `buildTeachingStateVector` → `deriveTeachingRegime` → `buildTeachingTrajectory` → `buildPolicyPrompt` → AI call → `enforcePolicy`.
- Response shape becomes `{ regime, trajectory, content, stateVector, policy }` — `policy` retained for backward compatibility with existing consumers.
- Keep existing auth/authorization (`can_view_student_mastery`) and per-student RLS — no isolation change.
- Keep 429/402 surfacing untouched.

### 3. Feedback-loop wiring (client)

- New `src/hooks/useTeachingGenerate.tsx` that calls the function via `supabase.functions.invoke` and, on the next `recordAnswer` for the same concept, passes a correlation id so `recordTeachingEvent` can log which trajectory produced the response. Pure additive — no existing call sites change.
- Update `StudentViewSimulator.tsx` to render `regime` + `trajectory` alongside the existing policy view (admin-only).

### 4. Reinforcement clause guardrails

- Add a top-of-file invariant comment block in `teachingOutputV2.ts` + the Edge Function listing the five "do not break" rules from the spec (determinism, isolation, adaptation outputs, policy schema, no cross-student leakage).
- Add `scripts/teachingOutputDeterminism.test.ts` — runs the pure functions against fixed seed vectors and asserts byte-identical regime + trajectory output. Run-once script, mirrors existing `scripts/consistencyAudit.ts` style.

## Out of scope

- No DB schema changes (spec explicitly forbids). Existing `ability_estimates`, `concept_mastery`, `student_learning_profiles`, `concepts`, `lectures` are sufficient.
- No changes to Adaptation Engine math, recording pipeline, or RLS.
- No changes to teacher-category enforcement, content relevance, or any unrelated subsystem.
- No new AI model — keep `google/gemini-2.5-flash` as today.

## Technical notes

- Determinism: every new function is pure `(input) → output`, no `Date.now()`, no `Math.random()`, no env reads. Same vector ⇒ same regime ⇒ same trajectory ⇒ same prompt.
- Isolation: state loads stay keyed on `studentId` with the existing `can_view_student_mastery` RPC. Nothing reads cross-student data.
- Backward compat: response keeps `policy`, `theta`, `standardError`, `conceptMastery`, `lectureMastery`. New keys are additive.
- File list:
  - new: `src/lib/adaptive/teachingOutputV2.ts`, `src/hooks/useTeachingGenerate.tsx`, `scripts/teachingOutputDeterminism.test.ts`
  - edited: `supabase/functions/teaching-generate/index.ts`, `src/components/admin/StudentViewSimulator.tsx`

🧠 LUMINA — PLAN REVIEW AMENDMENT (CRITICAL NOTES BEFORE APPROVAL)

This section highlights potential architectural risks and required corrections to ensure the system remains fully deterministic, isolated, and production-safe.

⸻

⚠️ 1. DUPLICATE POLICY LOGIC RISK (HIGH PRIORITY)

Issue

The plan proposes:

“inline-mirror the new module the same way derivePolicy is mirrored today”

This introduces two sources of truth for TeachingPolicy logic:

* src/lib/adaptive/teachingPolicy.ts

* new teachingOutputV2.ts

⸻

🚨 Why this is a problem

If both evolve independently:

* subtle drift between policy calculations

* inconsistent teaching behavior across Edge Function vs UI

* debugging becomes impossible (same input → different outputs depending on caller path)

⸻

✅ Correct implementation

You MUST enforce:

There is exactly ONE canonical policy computation logic.

Option A (BEST — recommended)

* Move deterministic logic into a shared pure module:

src/lib/adaptive/teachingPolicyCore.ts

* BOTH systems import from it

Option B (acceptable)

* Edge Function is the ONLY authority

* frontend mirrors ONLY for display (no logic dependency)

⸻

⚠️ 2. TEACHING TRAJECTORY MUST BE PURELY DERIVED (MEDIUM PRIORITY)

Issue

TeachingTrajectory is introduced as a new decision layer.

Risk:

* it could unintentionally become a “second adaptation system”

⸻

🚨 Why this matters

If trajectory logic diverges from adaptation state:

* student model says “ready for challenge”

* trajectory still outputs remediation steps (or vice versa)

This creates instructional contradiction

⸻

✅ Correct implementation

Strict rule:

TeachingTrajectory MUST be a pure function of TeachingRegime ONLY

REQUIRED FLOW:

Adaptation State → TeachingStateVector → TeachingRegime → TeachingTrajectory

FORBIDDEN:

* trajectory reading raw student DB state

* trajectory recalculating mastery independently

* trajectory using IRT logic directly

⸻

⚠️ 3. SIMULATOR UI COUPLING RISK (LOW–MEDIUM PRIORITY)

Issue

StudentViewSimulator now renders:

* regime

* trajectory

⸻

🚨 Risk

Future changes in trajectory schema may:

* break admin UI silently

* create tight coupling between backend internals and frontend visualization

⸻

✅ Correct implementation

Add a stable DTO layer:

TeachingTrajectoryDTO

Rules:

* UI only consumes DTO

* internal structure can evolve freely

* DTO acts as version boundary

⸻

⚠️ 4. POLICY DUPLICATION ACROSS CLIENT + SERVER

Issue

Plan suggests:

inline-mirror the same logic in Edge Function

⸻

🚨 Why this is dangerous

This creates:

* version mismatch risk

* hidden behavioral divergence

* debugging inconsistencies

⸻

✅ Correct implementation

Choose ONE:

BEST OPTION (recommended)

* Server is canonical

* client only receives rendered policy

ACCEPTABLE OPTION

* shared deterministic module imported by both server + client

NEVER DO

* copy-pasted logic in multiple files

⸻

⚠️ 5. ISOLATION GUARANTEE MUST BE RE-ASSERTED

Issue

New layers introduce more computation paths.

⸻

🚨 Risk

Any new module that:

* loads student state

* or computes vectors

could accidentally:

* bypass schoolId scoping

* or reintroduce cross-tenant leakage

⸻

✅ Required enforcement

Every new module MUST:

* accept ONLY preloaded scoped data

* never query DB internally

* never infer schoolId implicitly

⸻

🔥 FINAL REINFORCEMENT CLAUSE (ADD THIS TO PLAN)

You should explicitly add this to Lovable:

Lovable is permitted to refine, optimize, or improve implementation details only if it does not:

* alter deterministic behavior of adaptation or teaching engines

* introduce duplicate sources of truth for policy logic

* bypass or weaken tenant isolation

* create independent student state outside the adaptation engine

* change the structural flow: Adaptation → Regime → Trajectory → Output

All improvements must preserve mathematical equivalence of outputs.

⸻

🧠 FINAL VERDICT

✔ Plan is strong and safe to approve

✔ Architecture is correct

✔ Risk is mostly duplication + coupling, not logic failure

⸻

🚀 WHAT YOU JUST DID (IMPORTANT)

You are effectively building:

a dual-system AI tutoring kernel with strict deterministic control flow

That’s why these small structural issues matter — not because they are bugs, but because they affect system identity consistency.