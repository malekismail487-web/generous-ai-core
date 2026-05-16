# Phase 5 — Cold-Start Bootstrap (DONE)

Phases 1–4 are live. Phase 5 closes the "first session" gap: a brand-new
student now gets a *meaningful* adaptive profile before they've produced
any behavioral signals, so their very first lecture/chat/quiz is already
tuned to their grade level and IQ-test results.

## What shipped

### Client
- `src/lib/coldStartBootstrap.ts` — fetches `iq_test_results` + `profiles.grade_level`
  and maps them to:
  - `seedLevel` from `learning_pace` / `estimated_iq` (with grade-level guardrails)
  - `seedStyleScores` from the 7 IQ subscales mapped onto the 5
    ContentModality channels (visual/logical/verbal/kinesthetic/conceptual)
  - `seedConfidence = 35` (above the <30 "unknown" cutoff so style
    directives actually fire, well below any earned by real behavior so
    live engines overwrite it quickly)
- `src/lib/adaptiveIntelligence.ts`:
  - `buildIntelligenceProfile` now fetches the seed in parallel with the
    other data sources and applies it via `shouldApplyColdStart(...)` —
    only when `answerCount < 5 && behaviorDataPoints < 20` AND no explicit
    per-subject profile already pinned the level.
  - Seed lifts `profileCompleteness` by +10 so brand-new students don't
    show 0% to the rest of the engine.
  - `generateAdaptiveContext` emits a `COLD-START NOTE` instructing the
    model to treat the inferred level/style as a starting hypothesis and
    recalibrate fast.
  - New `coldStartSeed` field on `StudentIntelligenceProfile` for downstream
    consumers (diagnostics, future phases).
- `src/pages/IQTest.tsx` — bumps the profile bus with reason
  `cold_start_complete` immediately after IQ insert so the next
  `getContext()` call rebuilds with the fresh seed.
- `src/components/student/AdaptiveDiagnosticsPanel.tsx` — new "Cold-start
  seed" section (source, grade, pace, est. IQ) + completeness % so we can
  see at a glance when a profile is seed-only vs. behaviorally-earned.

### Verification
- `bunx tsc -p tsconfig.app.json --noEmit` — clean.
- `scripts/coldStartTest.ts` — gate logic: 4/4 assertions pass
  (fresh user → applies, override wins, enough behavior skips,
  enough answers skips).
- Phase 3 bus reason `cold_start_complete` was already in the enum, so
  the post-IQ bump flows through invalidation diagnostics unchanged.

## Out of scope (Phase 6)

- Long-horizon outcome metrics dashboard (Phase 6 proper).
- Migrating the remaining 7 AI surfaces to mount `HelpfulnessFeedback`
  (Phase 4b cleanup).

## Verification plan for after Phase 6

Re-verify Phases 1–5 end-to-end:
1. Phase 1 — force a low-quality output, confirm a row in
   `adaptive_quality_scores` and a regeneration.
2. Phase 2 — switch dominant style and confirm hard-routed template
   actually changes vocabulary + modality directives.
3. Phase 3 — record 3 wrong answers in a row, confirm bus version bumps
   and next `getContext` call returns a fresh `generatedAt`.
4. Phase 4 — submit 👎 "Too hard" on a lecture, confirm
   `ai_output_signals` row, `helpfulness_negative` invalidation, and that
   the next generated lecture downshifts level/density.
5. Phase 5 — sign in as a fresh student who just finished the IQ test,
   confirm the diagnostics panel shows the cold-start seed section, the
   first lecture context includes the `COLD-START NOTE`, and the level/
   style match the IQ subscales. Then record 5+ answers and re-open the
   panel — the seed should disappear as live engines take over.
