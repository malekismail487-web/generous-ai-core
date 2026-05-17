# Phase 6 — Long-Horizon Outcome Metrics + Consistency Audit (DONE)

Phases 1–5 produced per-event signals: quality scores, helpfulness
votes, profile-bus invalidations, cold-start seeds. Phase 6 turns those
events into rolling, student-level **outcomes** and codifies a static
audit that proves every AI surface still honors the Phase 1–5 contracts.

## What shipped

### Outcome metrics
- `src/lib/outcomeMetrics.ts` — `computeOutcomeMetrics(userId)` pulls
  the last 30 days from `adaptive_quality_scores`, `ai_output_signals`,
  and `student_answer_history` (one bounded query each, 500-row cap so we
  never bump the 1000-row default) and returns two windows (last 7d,
  last 30d) plus a Δ vs. prior 7d trend block for:
    - accuracy (engine ground truth)
    - quality avg + regen rate (Phase 1)
    - helpfulness positive/negative rate, per-feature breakdown (Phase 4)
  Returns `null` when the user has zero data — callers render
  "insufficient data" instead of misleading 0%s.
- `formatRate` / `formatDelta` helpers with `up | down | flat | na` tone
  so the diagnostics panel stays presentation-free.

### Diagnostics surface
- `AdaptiveDiagnosticsPanel` — new "Outcome metrics" section: 7-day
  accuracy / quality / helpfulness+ rates, each with a Δ vs prior 7-day
  baseline (color-coded), regen rate, and a `q/sig/ans` sample-count
  footer so we can tell at a glance whether numbers are meaningful.
  Refresh is gated on `profileVersion` — no polling.

### Cross-feature consistency audit
- `scripts/consistencyAudit.ts` — scans 9 tracked AI surfaces and
  reports a 5-column matrix:
    - Context injection (Phase 5 prerequisite)
    - Behavioral recording (Phase 3 input)
    - Validator wired (Phase 1/2)
    - HelpfulnessFeedback mounted (Phase 4)
    - Profile-bus aware (Phase 3 output)
  **Required contract:** every existing surface must inject adaptive
  context — currently 9/9 pass. Helpfulness coverage on long-form
  surfaces is reported as a *warning* (Phase 4b backlog, see below).
  Writes `/tmp/consistency-audit.md`; non-zero exit if a required
  contract regresses.

## Verification

- `bunx tsc -p tsconfig.app.json --noEmit` → clean.
- `bun run scripts/outcomeMetricsTest.ts` → 8/8 formatter assertions pass
  (null handling, sign, flat-band clamping).
- `bun run scripts/consistencyAudit.ts` → required contracts ✅; warnings:
  StudyBuddy, AIStudyPlan, FileNotesGenerator still need
  `<HelpfulnessFeedback>` (Phase 4b cleanup, tracked).

## Out of scope / backlog

- **Phase 4b cleanup** — mount `<HelpfulnessFeedback>` on the 3 long-form
  surfaces flagged by the audit (StudyBuddy, AIStudyPlan,
  FileNotesGenerator). Each is a small UI hookup once the surrounding
  flows have a clear "output complete" anchor.
- **Teacher/admin outcome dashboard** — same `computeOutcomeMetrics` math
  aggregated across a school (RLS already permits staff reads on both
  source tables). Not built yet — only the per-student diagnostics view
  ships in Phase 6.

## Phase 1–6 end-to-end re-verification plan (next session)

1. **Phase 1** — force a low-quality output, confirm a row in
   `adaptive_quality_scores` and a regeneration.
2. **Phase 2** — switch dominant style and confirm the hard-routed
   template actually changes vocabulary + modality directives.
3. **Phase 3** — record 3 wrong answers in a row, confirm bus version
   bumps and the next `getContext` call returns a fresh `generatedAt`.
4. **Phase 4** — submit 👎 "Too hard" on a lecture, confirm
   `ai_output_signals` row, `helpfulness_negative` invalidation, and that
   the next generated lecture downshifts level/density.
5. **Phase 5** — fresh student post-IQ-test: diagnostics shows cold-start
   seed section, first lecture context contains the `COLD-START NOTE`,
   level/style match IQ subscales; after 5+ answers the seed disappears.
6. **Phase 6** — with `?lumiDiag=1`, the Outcome metrics section
   renders real numbers for a populated student and "insufficient data"
   for an empty one; `bun run scripts/consistencyAudit.ts` exits 0.
