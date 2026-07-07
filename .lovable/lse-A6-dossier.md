# LSE Stage A6 Dossier — Context Cache

**Status:** shipped.
**Scope:** a pure, in-memory, bounded LRU cache of `CachedContextProjection` values, keyed by `lessonId`. Nothing about durability, cross-tab sharing, edge-side caching, priority scheduling (A7), or predictive precompute (B1) is touched.

Everything described here is present in code and verified. If code and dossier disagree, the stage is not done.

---

## 1. Files added

| Path | Kind | Purpose |
| --- | --- | --- |
| `src/lib/lse/contextCache.ts` | new | Cache implementation and the `ContextCache` interface. |
| `scripts/lseContextCache.test.ts` | new | 48-assertion test harness — 11 test blocks covering the four load-bearing invariants. |
| `.lovable/lse-A6-dossier.md` | new | This document. |

No changes to any Stage A1–A5 file. No migration. No edge function change. No React hook change. No changes to `src/integrations/supabase/*`.

---

## 2. What the cache is (and is not)

### It is
- A **process-local** `Map<lessonId, ContextCacheEntry>` wrapped by five methods (`read`, `write`, `writeFromState`, `invalidate`, `clear`) plus two introspection helpers (`size`, `keysMruFirst`).
- **Bounded** by a configurable `capacity` (default `DEFAULT_CACHE_CAPACITY = 32`). Overflow evicts the strict LRU entry.
- **Monotonic per lesson.** A `write` with a stale `version` is rejected; a `write` with the same `version` preserves the existing projection object's referential identity.
- **Synchronous and browser-safe.** No `Promise`, no `await`, no `Deno`, no Node-only globals.

### It is not
- **Durable.** Nothing survives page reload. The approved-but-deferred two-tier memory design (Phase B) will introduce a Postgres-backed second tier; A6 is only the first tier.
- **Shared across tabs.** Two tabs on the same lesson maintain independent caches. Realtime broadcasts guarantee eventual state convergence; cache identity divergence between tabs is acceptable.
- **Wired into any consumer yet.** `useLuminaLiveSession` (A5) still projects on demand. A7 will be the first consumer.
- **Server-side.** The `lumina-live` edge function continues to receive `cachedContext` over the wire.

---

## 3. Public surface (`src/lib/lse/contextCache.ts`)

```ts
export interface ContextCacheEntry {
  readonly lessonId: string;
  readonly version: number;               // reducer version at write time
  readonly lastSeq: number | null;        // intake seq at write time (optional)
  readonly projection: CachedContextProjection;
  readonly touchedAt: number;             // monotonic clock reading
}

export interface ContextCacheConfig {
  readonly capacity: number;              // default 32; floor of 1
  readonly now?: () => number;            // default performance.now()
}

export interface ContextCache {
  read(lessonId): ContextCacheEntry | null;
  write(lessonId, projection, version, lastSeq): ContextCacheEntry;
  writeFromState(state: LessonState, lastSeq): ContextCacheEntry;
  invalidate(lessonId): void;
  clear(): void;
  size(): number;
  keysMruFirst(): string[];               // defensive copy
}

export const DEFAULT_CACHE_CAPACITY = 32;
export function createContextCache(config?: Partial<ContextCacheConfig>): ContextCache;
```

Every method is total — no exceptions on any legal input.

---

## 4. Load-bearing invariants (asserted by the test harness)

### 4.1 Totality
Every operation on every legal input returns a well-defined value. Cache misses return `null`; writes always return the authoritative post-condition entry (which may or may not be the caller's input).

### 4.2 Determinism
Given identical constructor config and an identical sequence of calls, `read` returns identical results across runs. The LRU ordering exposed by `keysMruFirst` is a pure function of the call history. Test 9 asserts this by running the same sequence twice and comparing the resulting entry lists.

### 4.3 Boundedness (strict LRU)
- `size()` never exceeds `capacity` after any single operation.
- On overflow, the *least-recently-used* entry is evicted — where "use" means either a `read` or a `write` (both promote to MRU).
- Capacity is coerced with `Math.max(1, Math.floor(capacity ?? 32))`, so `0`, `0.4`, and negatives all become `1`. Test 10 covers this.

Implementation detail: LRU is modelled by exploiting the insertion-order guarantee of `Map`. Every touch performs `map.delete(key); map.set(key, entry)`, and eviction removes `map.keys().next().value`. This matches the canonical JavaScript LRU idiom.

### 4.4 Monotonicity per lesson
`write(lessonId, projection, version, lastSeq)` merges as follows:

| Condition | Behaviour |
| --- | --- |
| No existing entry | Insert. Return the inserted entry. |
| Existing version **>** incoming | Reject. Return the existing entry (touched). |
| Existing version **==** incoming | Preserve existing projection identity. Refresh `touchedAt`. Return the existing entry (touched). |
| Existing version **<** incoming | Overwrite. Return the new entry. |

The identity-preservation clause is what makes Stage A7 (and, later, gateway prompt-prefix caching) behave: if the reducer version has not advanced, the cached projection object must not change reference — otherwise `Object.is` checks in memoized React consumers would trigger spurious re-renders and cache-key rotations.

`writeFromState(state, lastSeq)` layers on top of `write` with one additional optimisation: if the current entry is already at `state.version`, projection is **skipped entirely** and the existing entry is returned unchanged. This is the only reason `writeFromState` exists as a separate method — calling `write(state.lessonId, projectCachedContext(state), state.version, lastSeq)` would still preserve identity but would pay the projection cost.

---

## 5. Design choices worth calling out

### 5.1 Functional object over class
The cache is exposed as an object of closures. This mirrors the style of `eventNormalizer.ts`, `lessonReducer.ts`, and `sessionInternals.ts` — all module-level pure functions on plain data — and sidesteps `this`-binding bugs like `const { read } = cache; read(id)`.

### 5.2 Injectable clock
`ContextCacheConfig.now` accepts a monotonic clock. Production uses `performance.now()` when available (browser and modern Deno/Node) and falls back to `Date.now()`. Tests inject a strictly-increasing integer clock so LRU ordering is fully deterministic.

The cache only ever compares timestamps for **ordering**, never for wall-clock arithmetic — consumers must not treat `touchedAt` as a UNIX epoch.

### 5.3 `lastSeq` is nullable
The reducer itself does not track broadcast `seq` — the Stage A5 intake gate does. Callers that have a `seq` at write time should pass it (the A7 scheduler will use it to align inference triggers with the ordered event stream); callers that don't (a fresh page hydration from a snapshot, say) pass `null`. The cache stores it verbatim and never derives semantics from it.

### 5.4 Default capacity of 32
Chosen conservatively. A student normally sees one active lesson at a time; a school admin previewing multiple rooms is the outlier. 32 gives comfortable headroom without unbounded memory growth on a device that keeps a browser tab open across many class periods.

### 5.5 `keysMruFirst` returns a defensive copy
`Array.from(entries.keys()).reverse()` allocates a fresh array on every call. Test 8 verifies that mutating the returned array does not affect subsequent calls.

---

## 6. Consumers and integration path

**Current consumers:** none.

**Planned consumers:**
- **Stage A7 (Priority Scheduler):** will call `writeFromState` after each reducer update inside `useLuminaLiveSession`, then pass `cache.read(lessonId)?.projection` to the edge-function POST body — replacing the ad-hoc `projectCachedContext(state)` call currently made per event in A5.
- **Stage B1 (Predictive Precompute):** will read the cached projection to build speculative prompt candidates without re-folding the timeline.
- **Stage B3 (Gap Recovery):** on gap detection, will `invalidate(lessonId)` before triggering a durable replay from `public.lesson_events`, ensuring the next `write` cannot be shadowed by a stale entry.

None of these are wired in A6. This stage ships the cache in isolation so the interface can settle before consumers depend on it.

---

## 7. Test harness (`scripts/lseContextCache.test.ts`)

11 test blocks, 48 assertions, all passing:

```
LSE A6 context cache — 48 passed, 0 failed
```

| # | Focus | Assertions |
| --- | --- | --- |
| 1 | Miss returns null; hit returns well-formed entry | 8 |
| 2 | Capacity honoured; strict LRU eviction | 5 |
| 3 | Stale writes rejected | 3 |
| 4 | Same-version writes preserve projection identity | 3 |
| 5 | Fresher versions overwrite | 3 |
| 6 | `invalidate` and `clear` semantics | 4 |
| 7 | `writeFromState` skips projection on no-op | 5 |
| 8 | `keysMruFirst` LRU ordering and defensive copy | 3 |
| 9 | Determinism across identical call sequences | ≤10 |
| 10 | Capacity coercion (fractional, sub-one) | 3 |
| 11 | Default capacity matches published constant | 1 |

Run locally with:

```
bun run scripts/lseContextCache.test.ts
```

The harness has no framework dependency — it uses `console.error` on failure and exits with code `1` if any assertion fails.

---

## 8. Stage boundaries reaffirmed

Not in A6 (each is a distinct future stage):

- **Durable second tier** — deferred to Phase B two-tier memory design.
- **Cross-tab coordination** — deferred; not on the current roadmap.
- **Edge-side cache** — deferred; would live in its own module with its own eviction policy.
- **Priority scheduling / preemption** — Stage A7.
- **Predictive precompute** — Stage B1.
- **Gap recovery** — Stage B3.
- **Integration with `useLuminaLiveSession`** — Stage A7; the hook still projects on demand today.

---

## 9. Verification checklist

- [x] `src/lib/lse/contextCache.ts` exports `createContextCache`, `DEFAULT_CACHE_CAPACITY`, and the `ContextCache` / `ContextCacheEntry` / `ContextCacheConfig` types.
- [x] Cache honours capacity under overflow (Tests 2, 10, 11).
- [x] LRU semantics: `read` and `write` both count as "use" (Tests 2, 8).
- [x] Stale-write rejection (Test 3).
- [x] Same-version projection identity preserved (Tests 4, 7).
- [x] Fresher-version overwrite (Test 5).
- [x] `invalidate` / `clear` behave as documented (Test 6).
- [x] `writeFromState` skips projection on no-op version (Test 7).
- [x] `keysMruFirst` returns a defensive copy (Test 8).
- [x] Determinism under identical call sequence (Test 9).
- [x] 48/48 assertions pass under `bun run scripts/lseContextCache.test.ts`.
- [x] No modification to any Stage A1–A5 file.
- [x] No migration, no edge-function change, no client-hook change.

Stage A6 is complete.
