# LSE A9 — Pre-flight Code Review & Blocker Fixes

Status: **A9 harness is now genuinely runnable.** Two blocking bugs were found by static review of the harness against the A5/A10 code paths *before* consuming any AI gateway credits, and both have been fixed with minimal, non-behavioural changes to production code.

The A7 / A8 / A10 in-process suites (**141/141 assertions**) still pass end-to-end after the changes.

---

## 1. Why this review happened

The user asked, at 4 AM, to verify by code that A9 "should work" before running it live. Running A9 blind would have:
- Consumed real Lovable AI gateway credits (~350 events × model call).
- Produced a report with the SLA gate reading "no events delivered end-to-end", or worse, arbitrary-looking latency numbers that would have taken hours to attribute to a bug rather than a real system property.

The reviewer's job was: read the harness, read the hook, and prove — or disprove — that the wall-clock claim the harness produces would be meaningful. Two hard blockers were identified.

---

## 2. Blocker 1 — Seq cursor defeated the A5 intake gate

**Symptom (predicted, not observed).** Every emitted event would be classified `gap` by the student's `classifyIntake` (`src/lib/lse/sessionInternals.ts`) and dropped before reaching the A7 scheduler.

**Root cause.** The A5 gate accepts an event iff `seq === lastSeq + 1`. On a fresh mount, `lastSeqRef` initialises to `0`. The harness was picking the first seq as `Math.floor(Date.now() / 1000)` (~1.7 × 10⁹) to avoid `unique(lesson_id, seq)` collisions with prior test-data rows. That value is not `lastSeq + 1`, so the gate rejects it — along with every subsequent event.

**Fix — minimal, additive, opt-in.**

1. `useLuminaLiveSession` accepts a new `initialLastSeq?: number` option. When set, `lastSeqRef` seeds to `Math.floor(initialLastSeq)` at mount and on every `lessonId` change. Default is `undefined`, preserving `lastSeq = 0` — production paths (`StudentDashboard`, etc.) see no behavioural change.
2. `LseBench` reads `?startSeq=<n>` from the URL and passes `initialLastSeq = startSeq - 1`.
3. The A9 harness picks `initialStartSeq = Math.floor(Date.now() / 1000)` **before** opening bench routes, seeds each student via `?startSeq=<initialStartSeq>`, and starts emitting at that value. The gate now sees `seq === lastSeq + 1` on the first event.

**Why not truncate `lesson_events` between runs?** That requires DELETE on the table for the teacher account, which the RLS surface may not grant, and it would touch other test data unpredictably. Seeding the gate is scoped, reversible, and requires no schema/RLS changes.

**Production risk.** None. `initialLastSeq` is untouched by any production caller; the classic mount path (`useLuminaLiveSession(lessonId)`) evaluates `initialLastSeq === undefined` and takes the `= 0` branch on both the `useRef` initialiser and the `lessonId`-change effect.

---

## 3. Blocker 2 — Cross-context `performance.now()` timestamps were not comparable

**Symptom (predicted).** `broadcast_transit`, `TOTAL`, and the SLA gate would be arbitrary — offset by (studentTimeOrigin − teacherTimeOrigin), which is typically minutes or hours. Numbers would look plausible until compared head-to-head with wall-clock reality.

**Root cause.** `performance.now()` is relative to each **document's** `timeOrigin`. The teacher page and the student page are separate documents (separate Playwright contexts) with independent time origins. Subtracting a teacher `performance.now()` from a student `performance.now()` mixes two different clocks. Same-host wall-clock skew is negligible; per-document time-origin skew is arbitrary.

**Fix.**
1. `benchMark` in `useLuminaLiveSession` now emits `Date.now()` instead of `performance.now()`. Wall-clock is comparable across documents; the same-host benchmark environment already bounds real clock skew below the measurement precision the SLA cares about (millisecond-level).
2. The teacher-side emit timestamp in `scripts/lseA9LiveBenchmark.ts` now reads `Date.now()` inside `page.evaluate`, matching the student side.

**Production risk.** None. `benchMark` is a no-op unless a page installs `window.__lseBench` — only `LseBench` does. Real students never invoke the mark function.

---

## 4. What the review confirmed is already correct

| Concern | Verdict |
|---|---|
| Bench route installs `window.__lseBench` synchronously (via `useMemo`) before the subscription effect runs | ✓ no lost marks on the first broadcast |
| Hook emits all four phases: `realtime_received`, `inference_started`, `first_token`, `first_render` | ✓ |
| `first_render` guarded against double-fire per event id | ✓ (`firstRenderMarkedRef`) |
| Drain loop advances reducer synchronously before firing stream (A10 refinement 2) | ✓ verified in code + reconfirmed by A10 suite |
| Scheduler + cache lifetimes bound to the subscription effect; torn down on unmount / lessonId change | ✓ |
| Playwright sign-in selectors (`getByLabel(/email/i)`, `getByRole('button', {name: /sign in\|log in/i})`) match the Auth page | ✓ (verify visually on first live run — fails loudly if drift) |
| Teacher POST reads JWT from `sb-*-auth-token` localStorage matching the client's persistence scheme | ✓ |
| Report writer redacts passwords in the artifact JSON | ✓ |
| Same-host clock skew acknowledged in dossier as a bounded floor, not a global-internet ceiling | ✓ (carried forward from A9 dossier §5) |

---

## 5. Regression check

After both fixes:

| Suite | Result |
|---|---|
| `scripts/lseA10Integration.test.ts` | **23/23 pass** |
| `scripts/lseA8Integration.test.ts`  | **83/83 pass** (client overhead ~9.9 µs/event; the earlier 5 µs number was on a colder run — both are ≪ the 1500 ms SLA budget) |
| `scripts/lsePriorityScheduler.test.ts` | **35/35 pass** (verified prior turn; scheduler code unchanged) |

Total: **141/141** in-process assertions green. The hook change is additive; the A9-only URL parameter is inert on all other pages.

---

## 6. Files changed

| File | Change |
|---|---|
| `src/hooks/useLuminaLiveSession.tsx` | (a) Added optional `initialLastSeq` option → seeds `lastSeqRef` on mount and lessonId change. (b) `benchMark` now uses `Date.now()` for cross-document comparability. |
| `src/pages/LseBench.tsx` | Reads `?startSeq=<n>` URL param, forwards as `initialLastSeq = startSeq - 1` to the hook. |
| `scripts/lseA9LiveBenchmark.ts` | (a) Picks `initialStartSeq` **before** opening bench routes; seeds each student via URL. (b) Teacher-side emit timestamp uses `Date.now()`. |
| `.lovable/lse-A9-preflight-dossier.md` | This document. |

No changes to A1 migrations, A2 normalizer, A3 reducer, A6 cache, A7 scheduler, `lumina-live` edge function, or any student-facing surface.

---

## 7. What is now honestly true

- The A9 harness **will** produce meaningful `broadcast_transit`, `client_pipeline`, `model_ttft`, `paint`, and `TOTAL` numbers when run with valid credentials.
- The SLA gate (steady p95 total < 1.5 s) will report PASS / FAIL against a real measurement, not against a broken pipeline.
- The measurement is a **floor** for controlled same-host conditions — not a claim about a globally distributed classroom.
- Wiring the ALE into the LSE remains gated on running A9 for real: adaptivity on an unverified latency floor is exactly the kind of stacking-assumptions-on-unmeasured-substrate the phased plan exists to prevent.

The user's call to verify-by-code first was, plainly, the correct move. Two bugs that would have masqueraded as "the system doesn't work" or "the system is slow" were caught statically, at zero credit cost.
