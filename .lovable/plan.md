# Phase 4 — Per-Output Helpfulness Signal (DONE)

Phases 1–3 are live. Phase 4 closes another part of the loop: every AI
output can now collect a per-output helpfulness signal (explicit thumbs +
reason chips, plus implicit dwell / regeneration signals) that flows back
into the adaptive profile and the teaching-strategy tracker.

## What shipped

### DB
- `public.ai_output_signals` — feature, subject, topic, output_hash,
  output_excerpt, signal kind, optional reason, profile snapshot.
- RLS: students see/insert their own; teachers + school admins see signals
  for students in their school; super admin sees all.

### Client
- `src/lib/helpfulnessSignal.ts` — `recordHelpfulness(...)`, fail-open.
  Bumps the profile bus on negative signals (`helpfulness_negative`) and on
  explicit thumbs-up (`helpfulness_positive`). Feeds outcome into
  `recordStrategyOutcome` when topic+subject are known so the teaching
  strategy tracker learns which approach actually helped.
- `src/components/student/HelpfulnessFeedback.tsx` — compact thumbs +
  reason chips (`Too easy / Too hard / Confusing / Off-topic`). One-shot
  per mount, collapses to "Thanks" once submitted.
- `src/lib/adaptiveProfileBus.ts` — added `helpfulness_negative` and
  `helpfulness_positive` to `BumpReason`.
- `src/components/student/LectureGenerator.tsx`:
  - Mounts `HelpfulnessFeedback` after Key Takeaways.
  - Tracks refs for output text, topic, subject, profile snapshot.
  - On regenerate or unmount, fires implicit signal:
    - dwell < 30s + new generation → `implicit_regen`
    - dwell ≥ 30s without explicit signal → `implicit_dwell_positive`
- `src/components/student/AdaptiveDiagnosticsPanel.tsx` — new "Recent
  helpfulness" section so we can watch signals live.

### Verification
- `bunx tsc -p tsconfig.app.json --noEmit` is clean.
- Manual smoke pending in dashboard: run a lecture, click 👎 → "Confusing"
  → diag panel shows signal + a `helpfulness_negative` invalidation in the
  bus, profile re-reads on next generate.

## Out of scope for Phase 4 (tracked for later phases)

- Migrating the other 7 AI surfaces (StudyBuddy, Notes, Mind Maps,
  Practice, etc.) to mount `HelpfulnessFeedback` — Phase 4b cleanup.
- Cold-start bootstrap (Phase 5).
- Long-horizon outcome metrics dashboard (Phase 6).

## Verification plan for Phase 6

After Phase 6 finishes, re-verify Phases 1–4 end-to-end:
1. Phase 1 — force a low-quality output, confirm a row in
   `adaptive_quality_scores` and a regeneration.
2. Phase 2 — switch dominant style and confirm hard-routed template
   actually changes vocabulary + modality directives.
3. Phase 3 — record 3 wrong answers in a row, confirm bus version bumps
   and next `getContext` call returns a fresh `generatedAt`.
4. Phase 4 — submit 👎 "Too hard" on a lecture, confirm
   `ai_output_signals` row, `helpfulness_negative` invalidation, and that
   the next generated lecture downshifts level/density.
