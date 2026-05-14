/**
 * adaptiveProfileBus.ts — Phase 3
 *
 * Tiny module-level pub/sub that lets the adaptive profile be invalidated
 * in real time from anywhere in the app (recorders, validators, etc.) and
 * lets React components subscribe via `useSyncExternalStore`.
 *
 * Design goals:
 *   - Zero deps. No Zustand, no event-emitter package.
 *   - Debounced bumps (250ms) so a burst of signals causes ONE re-fetch.
 *   - Diagnostics ring-buffer (last 50 reasons) for the dev dashboard.
 *   - Profile-level dampening logic lives in the engines themselves; this
 *     file ONLY signals "the profile changed enough to be worth re-reading."
 */

export type BumpReason =
  | 'consecutive_wrong'
  | 'streak_break'
  | 'response_time_spike'
  | 'strong_emotion'
  | 'fatigue_band_shift'
  | 'low_quality_score'
  | 'manual'
  | 'cold_start_complete';

interface BumpRecord {
  reason: BumpReason;
  detail?: string;
  at: number;
}

const listeners = new Set<() => void>();
let version = 0;
let invalidationCount = 0;
const history: BumpRecord[] = [];
const HISTORY_MAX = 50;

let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let pendingReasons: BumpRecord[] = [];
const DEBOUNCE_MS = 250;

function emit() {
  // Snapshot listeners before notifying so a listener that unsubscribes
  // mid-dispatch doesn't break iteration.
  for (const fn of Array.from(listeners)) {
    try { fn(); } catch { /* never let one bad listener break others */ }
  }
}

function flush() {
  pendingTimer = null;
  if (pendingReasons.length === 0) return;

  version += 1;
  invalidationCount += 1;
  for (const r of pendingReasons) {
    history.push(r);
    if (history.length > HISTORY_MAX) history.shift();
  }
  pendingReasons = [];

  if (typeof window !== 'undefined' && (window as any).__LUMINA_DEBUG_ADAPTIVE) {
    const last = history[history.length - 1];
    // eslint-disable-next-line no-console
    console.info('[adaptiveProfileBus] bump v', version, last);
  }

  emit();
}

/**
 * Request a profile invalidation. Coalesces with any other bumps that
 * arrive within DEBOUNCE_MS so a burst becomes one notification.
 */
export function bumpProfile(reason: BumpReason, detail?: string): void {
  pendingReasons.push({ reason, detail, at: Date.now() });
  if (pendingTimer != null) return;
  pendingTimer = setTimeout(flush, DEBOUNCE_MS);
}

/** React `useSyncExternalStore` subscribe fn. */
export function subscribeProfileVersion(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** React `useSyncExternalStore` getSnapshot fn. */
export function getProfileVersion(): number {
  return version;
}

/** Diagnostics — read-only view used by the dev dashboard. */
export function getInvalidationDiagnostics(): {
  version: number;
  invalidationCount: number;
  recent: BumpRecord[];
} {
  return {
    version,
    invalidationCount,
    recent: history.slice(-20).reverse(),
  };
}

/** Test-only — wipe everything. NEVER call from app code. */
export function __resetProfileBusForTests(): void {
  if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
  pendingReasons = [];
  history.length = 0;
  version = 0;
  invalidationCount = 0;
  listeners.clear();
}
