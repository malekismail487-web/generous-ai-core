# LSE Stage A10 — Wiring the Priority Scheduler + Context Cache into the Live Session

Status: **Shipped.** `useLuminaLiveSession` now admits every accepted broadcast event to the A7 priority scheduler and drains via a microtask loop that folds the A3 reducer and refreshes the A6 cache before firing `runStreamFor`. Verified via `bun run scripts/lseA10Integration.test.ts` — 23/23 assertions pass. Stage A8 regression remains clean (83/83).

This dossier documents *exactly* what was wired, no more.

---

## 1. Scope

Stage A10 is **integration only.** No subsystem was redesigned. The change surface is one file plus one test harness plus this dossier.

**In scope**
- Replace the hook's inline `reduce → runStreamFor` fast path with `scheduler.enqueue → drain → reduce → cache → runStreamFor`.
- Instantiate one `PriorityScheduler` and one `ContextCache` per hook mount; lifetime = subscription lifetime.
- Preserve every existing public API: `UseLuminaLiveSessionResult`, `SessionStatus`, `StreamStatus`, `LatestStream`, `GapInfo`, `stop()`.
- Add opt-in, non-behavioural `window.__lseBench` marks at four phases (used by Stage A9).

**Out of scope (as approved)**
- No scheduler redesign — A7 module untouched.
- No cache redesign — A6 module untouched.
- No reducer / event-normalizer / edge-function edits.
- No migrations. No new dependencies.

---

## 2. Files delivered

| Path | Change |
| --- | --- |
| `src/hooks/useLuminaLiveSession.tsx` | Rewired broadcast handler + new drain loop + scheduler/cache refs + first-render bench mark. |
| `scripts/lseA10Integration.test.ts` | 7-block, 23-assertion integration harness for the live-path model. |
| `.lovable/lse-A7-dossier.md` | (unchanged — A7 module was not modified) |
| `.lovable/lse-A10-dossier.md` | This document. |

---

## 3. Before / after — broadcast handler

**Before (A5):**

```ts
channel.on("broadcast", { event: "lesson_event" }, (msg) => {
  const event = payloadToLessonEvent(lessonId, msg?.payload);
  if (!event) return;
  const decision = classifyIntake(event, lastSeqRef.current);
  if (!decision.accepted) { /* … gap/dup/invalid … */ return; }
  lastSeqRef.current = decision.seq!;
  const nextState = reduce(stateRef.current, event);   // ← direct reduce
  stateRef.current = nextState;
  setState(nextState);
  void runStreamFor(event);                            // ← direct stream fire
});
```

**After (A10):**

```ts
channel.on("broadcast", { event: "lesson_event" }, (msg) => {
  const event = payloadToLessonEvent(lessonId, msg?.payload);
  if (!event) return;
  benchMark(event.id, "realtime_received");
  const decision = classifyIntake(event, lastSeqRef.current);
  if (!decision.accepted) { /* … gap/dup/invalid … */ return; }
  lastSeqRef.current = decision.seq!;
  schedulerRef.current?.enqueue(event);                // ← admit to A7 scheduler
  drain();                                             // ← kick microtask drain
});
```

Where `drain()` is:

```ts
queueMicrotask(() => {
  const event = scheduler.pop();                       // priority-then-FIFO
  if (!event) return;
  const nextState = reduce(stateRef.current, event);   // 1. reduce (sync, pure)
  stateRef.current = nextState;
  setState(nextState);
  cache.writeFromState(nextState, lastSeqRef.current); // 2. A6 cache refresh
  void runStreamFor(event);                            // 3. fire-and-forget
  // Re-enter if more events were admitted during this microtask.
  if (scheduler.size() > 0) drain();
});
```

---

## 4. Load-bearing invariants (refinements 1 & 2 from A10 review)

### Refinement 1 — cache capacity

`HOOK_CACHE_CAPACITY = 8` (up from the proposed 4). Rationale: absorbs lesson transitions, reconnect scenarios, and rapid tab-switching without eviction pressure. Bounded by strict LRU inside A6, so the memory ceiling remains fixed.

### Refinement 2 — reducer state MUST NOT depend on inference completion timing

Enforced structurally, not by convention:

1. `drain()` calls `reduce(...)` *synchronously* on each pop.
2. `runStreamFor` is fired with `void` — its promise is discarded; nothing awaits it.
3. `runStreamFor` NEVER calls `reduce`. It only writes to the `latest` presentation slot via `setLatest`, guarded by `event.id === prev.event.id` and by the monotonic `epochRef`.
4. A late-arriving stream completion whose event id no longer matches the current `latest` — or whose epoch is stale — is dropped by `applyFrame`.

The authoritative order of lesson state is therefore:

```
lesson_events.seq  →  scheduler pop order  →  reducer version
```

and NEVER:

```
AI response completion order  →  reducer version
```

Test 3 in the harness explicitly asserts this by simulating a late stream completion after the reducer has advanced 5 versions and confirming state is byte-equal to the pre-completion snapshot.

---

## 5. Test coverage (`scripts/lseA10Integration.test.ts`, 23 assertions)

The harness models the drain loop line-for-line using the exact modules the hook uses. React is deliberately absent — the drain semantics are what we're proving.

| # | Property | Assertions |
| --- | --- | --- |
| T1 | Priority ordering — mixed enqueue `[P5,P5,P3,P1,P4,P2]` drains as `[P1,P2,P3,P4,P5,P5]` | 3 |
| T2 | Starvation protection — a sitting P5 under sustained P1 load drains within `threshold` skips, no events lost, rescue counter fires | 4 |
| T3 | Stream interaction safety — reducer state is unchanged by a hypothetical late stream completion after 5 further pops | 3 |
| T4 | Reducer version strictly monotonic per pop across a 40-event mixed corpus | 1 |
| T5 | A6 cache identity preservation on the live path — same-version write returns the same projection object | 1 |
| T6 | Reconnect / recovery — a student that disconnected after event 50 and replayed 51–100 converges byte-identically with an always-connected student; 100 events folded | 4 |
| T7 | 200-event burst (A7 corpus) — per-band FIFO preserved, all 200 folded, no loss | 7 |

Command:

```bash
bun run scripts/lseA10Integration.test.ts
```

Result at ship time:

```
LSE A10 — Live-path integration validation
  passed: 23
  failed: 0
```

Stage A8 regression run alongside:

```
LSE A8 — Integration & synchronization validation
  passed: 83
  failed: 0
```

---

## 6. What A10 does NOT prove

The harness models the drain loop, not the running React hook, and it does NOT touch:

- The real Realtime WebSocket transport.
- The real `POST /lumina-live` fetch, first-token TTFB, or SSE render loop.
- The real `AbortController` cancellation timing on the browser.
- The paint budget between `first_token` and `first_render`.

All four require live infrastructure. That is exactly what Stage A9's Playwright benchmark is for. The bench-mark instrumentation added here (`window.__lseBench.mark(...)` at four phases) is the surface A9 hooks into.

---

## 7. Change control

- Any future edit to the hook that introduces a `reduce(...)` call from anywhere other than `drain()` breaks refinement 2 and MUST be caught by adding a static check or an additional T3-style assertion in the same PR.
- Any change to `HOOK_CACHE_CAPACITY` requires updating this dossier's §4 and re-running the A10 harness.
- Removing or renaming the `window.__lseBench` sentinel requires updating Stage A9's harness in the same commit.
