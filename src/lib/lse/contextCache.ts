/**
 * LSE — Context Cache (Stage A6)
 * ------------------------------
 * A bounded, in-memory Least-Recently-Used cache of
 * `CachedContextProjection` values, keyed by `lessonId`.
 *
 * Purpose (per `.lovable/plan.md` §2/S6):
 *   - Amortize the cost of projecting a `LessonState` into the request-body
 *     shape consumed by `POST /lumina-live`. The projection itself is pure
 *     (see `projectCachedContext` in `sessionInternals.ts`), so its output
 *     depends solely on the reducer's `(lessonId, version)` pair. That gives
 *     us a safe, race-free cache key.
 *   - Preserve **referential identity** of the projection object across
 *     events that do not change reducer state (e.g. `silence`, `admin`,
 *     no-op `example`), so downstream React memoization (Stage A7) does not
 *     spuriously invalidate a prompt-prefix cache on the gateway side.
 *   - Provide a single well-tested surface for future stages (A7 scheduler,
 *     B1 predictive precompute, B3 gap recovery) to fetch the freshest
 *     projection for a lesson without re-folding the timeline.
 *
 * Non-goals (deferred):
 *   - **Durability.** A6 is process-local. The two-tier memory design
 *     (approved but deferred, see Phase B) will introduce a durable second
 *     tier backed by a Postgres materialised projection.
 *   - **Cross-tab sharing.** Two open tabs on the same lesson maintain
 *     independent caches. Realtime broadcasts guarantee eventual state
 *     convergence; cache identity divergence is acceptable.
 *   - **Async I/O.** Every method is synchronous. No `Promise`, no `await`.
 *   - **Server-side reuse.** This module is browser-safe (no `Deno`, no
 *     `Node` globals) but is intentionally NOT wired into the edge
 *     function; the edge function receives the projection over the wire in
 *     A4 and will continue to in A7. Any future edge-side cache belongs in
 *     a separate module with its own eviction policy.
 *
 * Design constraints (load-bearing):
 *   1. **Total** — every operation returns a well-defined value; no
 *      exceptions on cache miss.
 *   2. **Deterministic** — given the same sequence of `write` calls, `read`
 *      returns identical results across runs. LRU ordering is a pure
 *      function of the call history.
 *   3. **Bounded** — the cache never holds more than `capacity` entries.
 *      Eviction is strictly Least-Recently-Used (both `read` and `write`
 *      count as "use").
 *   4. **Monotonic per lesson** — `write` refuses to overwrite an entry
 *      whose stored `version` is greater than the incoming `version`. This
 *      is what makes the cache safe under out-of-order arrivals from the
 *      Stage A5 intake gate (which itself already rejects out-of-order
 *      events, but the cache holds the belt-and-braces invariant).
 */

import type { LessonState } from "./lessonReducer";
import {
  projectCachedContext,
  type CachedContextProjection,
} from "./sessionInternals";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ContextCacheEntry {
  readonly lessonId: string;
  /** The reducer version this projection was built from. Monotonic per lessonId. */
  readonly version: number;
  /**
   * The last accepted broadcast `seq` at write time, when known. Optional
   * because the reducer itself does not track seq — the intake gate does.
   * Consumers (A7 scheduler) use this to align cache entries with the
   * ordered event stream when deciding whether to emit a fresh inference.
   */
  readonly lastSeq: number | null;
  readonly projection: CachedContextProjection;
  /** `performance.now()`-style monotonic clock reading at last touch. */
  readonly touchedAt: number;
}

export interface ContextCacheConfig {
  /**
   * Maximum number of lessons held simultaneously. Chosen conservatively:
   * a single student normally sees one active lesson at a time; a school
   * admin previewing multiple rooms is the outlier. 32 is a comfortable
   * headroom without unbounded memory growth.
   */
  readonly capacity: number;
  /**
   * Optional clock injector. Tests pass a deterministic clock; production
   * uses `performance.now()` for a monotonic reading unaffected by wall
   * clock jumps. Consumers MUST NOT depend on the returned value being
   * comparable to wall-clock timestamps.
   */
  readonly now?: () => number;
}

export const DEFAULT_CACHE_CAPACITY = 32;

// ---------------------------------------------------------------------------
// Instance
// ---------------------------------------------------------------------------

/**
 * The cache is exposed via a small object of closures rather than a class
 * for two reasons:
 *   1. It matches the functional style used across `src/lib/lse/*` — the
 *      reducer, event normalizer, and session internals are all module-
 *      level functions operating on plain data.
 *   2. It sidesteps the `this`-binding pitfalls that would appear if a
 *      cache instance were destructured (`const { read } = cache; read(id)`).
 */
export interface ContextCache {
  /**
   * Read a cache entry by lessonId. Returns `null` on miss. Also promotes
   * the entry to most-recently-used on hit (i.e. `read` is a "use").
   */
  read(lessonId: string): ContextCacheEntry | null;

  /**
   * Insert or refresh the projection for a lesson.
   *
   * - If no entry exists, one is inserted and the LRU list is updated.
   * - If an entry exists at a **strictly greater** version, the write is
   *   rejected (returns the existing entry unchanged) — the caller has
   *   raced a fresher writer.
   * - If an entry exists at the **same** version, the projection object is
   *   NOT replaced (referential identity preserved), but the LRU position
   *   and `touchedAt` timestamp are refreshed.
   * - If an entry exists at a **lesser** version, it is overwritten.
   *
   * The returned entry is the authoritative post-condition — callers
   * should not assume their input `projection` is what's stored.
   */
  write(
    lessonId: string,
    projection: CachedContextProjection,
    version: number,
    lastSeq: number | null,
  ): ContextCacheEntry;

  /**
   * Convenience: project `state` and write in one step. Returns the
   * authoritative entry (see `write` for the merge rules). If the current
   * entry is already at `state.version`, projection is skipped entirely
   * and the existing entry is returned unchanged — this is the identity-
   * preservation guarantee that makes prompt-prefix caching downstream
   * behave.
   */
  writeFromState(
    state: LessonState,
    lastSeq: number | null,
  ): ContextCacheEntry;

  /** Drop a single lesson from the cache. No-op on miss. */
  invalidate(lessonId: string): void;

  /** Drop every entry. Used on sign-out and by tests. */
  clear(): void;

  /** Current entry count. Exposed for tests and telemetry. */
  size(): number;

  /**
   * Debug-only introspection: lessons ordered from most- to least-recently
   * used. Intentionally returns a fresh array so callers cannot mutate the
   * internal LRU list.
   */
  keysMruFirst(): string[];
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Construct a fresh cache. Two caches created with the same configuration
 * share no state — the module has no singletons.
 *
 * A `Map<string, ContextCacheEntry>` provides O(1) reads and iteration
 * ordered by insertion; we exploit the insertion-order guarantee to model
 * LRU by deleting-then-reinserting an entry on every touch. This is the
 * canonical JS idiom and matches the behaviour of `lru-cache` internally.
 */
export function createContextCache(
  config: Partial<ContextCacheConfig> = {},
): ContextCache {
  const capacity = Math.max(1, Math.floor(config.capacity ?? DEFAULT_CACHE_CAPACITY));
  const now = config.now ?? defaultClock;

  const entries = new Map<string, ContextCacheEntry>();

  function touch(entry: ContextCacheEntry): ContextCacheEntry {
    // Delete + reinsert to bump insertion order — this IS the LRU update.
    entries.delete(entry.lessonId);
    const refreshed: ContextCacheEntry = { ...entry, touchedAt: now() };
    entries.set(entry.lessonId, refreshed);
    return refreshed;
  }

  function evictIfNeeded(): void {
    while (entries.size > capacity) {
      // The first key in insertion order is the LRU entry.
      const oldest = entries.keys().next();
      if (oldest.done) return;
      entries.delete(oldest.value);
    }
  }

  return {
    read(lessonId) {
      const entry = entries.get(lessonId);
      if (!entry) return null;
      return touch(entry);
    },

    write(lessonId, projection, version, lastSeq) {
      const existing = entries.get(lessonId);
      if (existing && existing.version > version) {
        // Stale write. Refuse but still promote the fresher entry — the
        // caller performed a `write`, that counts as a use.
        return touch(existing);
      }
      if (existing && existing.version === version) {
        // Same version. Preserve the existing projection object identity
        // so downstream `Object.is` comparisons remain stable.
        return touch(existing);
      }
      const inserted: ContextCacheEntry = {
        lessonId,
        version,
        lastSeq,
        projection,
        touchedAt: now(),
      };
      entries.delete(lessonId); // ensure insertion-order reflects touch
      entries.set(lessonId, inserted);
      evictIfNeeded();
      return inserted;
    },

    writeFromState(state, lastSeq) {
      const existing = entries.get(state.lessonId);
      if (existing && existing.version === state.version) {
        return touch(existing);
      }
      if (existing && existing.version > state.version) {
        return touch(existing);
      }
      const projection = projectCachedContext(state);
      const inserted: ContextCacheEntry = {
        lessonId: state.lessonId,
        version: state.version,
        lastSeq,
        projection,
        touchedAt: now(),
      };
      entries.delete(state.lessonId);
      entries.set(state.lessonId, inserted);
      evictIfNeeded();
      return inserted;
    },

    invalidate(lessonId) {
      entries.delete(lessonId);
    },

    clear() {
      entries.clear();
    },

    size() {
      return entries.size;
    },

    keysMruFirst() {
      // Map iterates oldest-first; reverse for MRU-first.
      return Array.from(entries.keys()).reverse();
    },
  };
}

// ---------------------------------------------------------------------------
// Default clock
// ---------------------------------------------------------------------------

/**
 * `performance.now()` where available (browser, modern Node/Deno), falling
 * back to `Date.now()` otherwise. The cache only compares timestamps for
 * ordering, so a millisecond-resolution monotonic clock is sufficient.
 */
function defaultClock(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}
