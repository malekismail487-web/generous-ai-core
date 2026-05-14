# Phase 3 — Real-Time Profile Invalidation

Phases 1 (validation loop) and 2 (hard routing) are live. The next bottleneck: the adaptive profile is cached for 60s, so mid-session signals (a sudden wrong-answer streak, a frustrated chat message, a fatigue spike) are ignored until the cache expires. That breaks the closed loop — Phase 1 measures drift, Phase 2 routes to a template, but the **profile feeding the template can be up to a minute stale**.

## Goal

Make the profile react within ~1 render frame to any meaningful signal, while keeping network traffic low.

## Changes

### 1. `useAdaptiveIntelligence` — versioned store, not a TTL cache

- Drop `CACHE_TTL_MS` from 60s → 15s as a safety net only.
- Add a module-level `profileVersion` integer + `subscribe/getSnapshot` pair so components can use `useSyncExternalStore`.
- Expose `bumpProfile(reason)` — increments the version and invalidates the cache for the current user.
- `getContext` / `getSimpleParams` re-read whenever version changes, regardless of TTL.

### 2. Event-driven invalidation triggers

Wire `bumpProfile()` into the existing recorders inside `src/lib/adaptiveIntelligence.ts`:

- `recordIntelligentAnswer`: bump when (a) 3+ consecutive wrong answers in the same subject, (b) a correct-streak ≥5 breaks, or (c) response time deviates >2× from rolling median.
- `recordChatMessage`: bump when the emotional state engine flags a strong negative signal (frustration / confusion ≥ 0.7) or an explicit "I don't get it" / "too easy" pattern.
- `recordStudyActivity`: bump when fatigueLevel crosses a band boundary (low→med, med→high).

All bumps are debounced (250ms) so a burst of events causes one re-fetch.

### 3. Phase 1 ↔ Phase 3 bridge

After `validateAdaptation` returns a score < 0.85, call `bumpProfile('low_quality_score')` so the regeneration in Phase 2 uses a **fresh** profile snapshot, not the stale one that produced the bad output.

### 4. Phase 2 ↔ Phase 3 bridge

`LectureGenerator` (and the other components we'll migrate later) switch from one-shot `getContext()` at mount to `useSyncExternalStore`-backed context that updates between generations within a single session.

### 5. Lightweight diagnostics

Add a `profile_invalidations` count + last-reason to `getCachedProfile()` return shape (dev-only console log behind a flag) so we can watch invalidation cadence during QA.

## Out of scope for Phase 3

- Migrating all 7 remaining AI surfaces to hard routing — that's Phase 2 cleanup, tracked separately.
- Helpfulness signal UI (Phase 4).
- Cold-start bootstrap (Phase 5).

## Technical section

**Files touched**

- `src/hooks/useAdaptiveIntelligence.tsx` — add external store, `bumpProfile`, version-aware cache read.
- `src/lib/adaptiveIntelligence.ts` — emit invalidation events from `recordIntelligentAnswer`, `recordChatMessage`, `recordStudyActivity`. Add a tiny pub/sub (no new dep).
- `src/lib/adaptiveValidator.ts` — call `bumpProfile` on low score before regeneration.
- `src/components/student/LectureGenerator.tsx` — consume versioned context (minimal change, mostly swapping `useState` snapshot for the store hook).

**No DB / edge-function changes.** This phase is entirely client-side state plumbing.

**Verification plan**

1. Unit-style smoke: trigger 3 wrong answers in a row in dev → confirm `profile_invalidations` increments and next `getContext` call returns a freshly built profile (different `generatedAt`).
2. Validator path: force a low score via a dev override → confirm bump fires before regeneration and the addendum-augmented prompt sees the new level if cognitive load shifted.
3. No regression: confirm normal lecture generation still hits cache on rapid repeat (no thundering herd).

Approve and I'll implement Phase 3 only — Phases 4–6 stay untouched until you say so.

&nbsp;

Make sure that the adaptive learning profile actually goes up based on the adaptive data as well, and after you finish phase 3, you must make a test.

I think once Phase 3 is implemented, we should focus heavily on adaptation testing instead of only technical testing. The biggest question is not just whether invalidation works, but whether the AI genuinely teaches differently and more effectively when the student’s behavior changes.

We should test the system using simulated student personas rather than only static unit tests. For example, we can create profiles like a fast learner, a frustrated learner, a fatigued learner, an inconsistent learner, and an overconfident learner. Then we run the same lesson through all of them and compare how the AI changes its pacing, explanation depth, difficulty progression, hint frequency, and teaching style.

The most important thing to verify is whether the AI adapts naturally from behavioral signals alone rather than relying on explicit instructions from the student. Personally, I think the system becomes more intelligent if it infers optimal teaching strategies through performance patterns, response times, emotional signals, repeated mistakes, and cognitive load instead of the student manually saying things like “teach me visually” or “explain it step-by-step.” The AI should gradually discover what works best for the learner.

I also think we need to watch carefully for overreaction and instability. A strong adaptive system should react quickly but not impulsively. One bad streak should not immediately downgrade the student, and one successful streak should not instantly spike difficulty. We should test for oscillation over long sessions and make sure the adaptation feels smooth and stable rather than hyperactive.

Another important area is validating whether the adaptations actually improve learning outcomes. We should compare metrics before and after adaptation changes, including retention, repeated mistakes, frustration recovery, engagement time, and comprehension speed. If the AI changes behavior but learning outcomes do not improve, then the adaptation may not actually be meaningful.

I also think we should build a temporary internal diagnostics dashboard during testing. Seeing profile invalidations, adaptation scores, emotional-state shifts, difficulty changes, and generation timestamps visually will make tuning significantly easier and help us catch unstable behavior early.

Overall, I think Phase 3 is a strong architectural improvement because it moves the system from delayed adaptation toward real-time adaptive tutoring. The next challenge is making sure the AI adapts accurately, smoothly, and intelligently under realistic learning conditions.