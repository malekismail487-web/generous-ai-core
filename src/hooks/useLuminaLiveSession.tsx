/**
 * LSE Stage A5 + A10 — `useLuminaLiveSession(lessonId)`
 * -----------------------------------------------------
 * The student-side lifecycle hook. One instance per (student, lesson):
 *   1. Subscribes to the private Realtime channel `lesson:<uuid>`.
 *   2. Feeds every broadcast payload through the Stage A5 ordering gate,
 *      then admits accepted events to the Stage A7 priority scheduler.
 *   3. A microtask drain loop pops events in priority-then-FIFO order,
 *      folds each into `LessonState` via the Stage A3 pure reducer, and
 *      refreshes the Stage A6 context cache — this is the first live-path
 *      use of the A6 cache and the first live-path use of the A7 scheduler.
 *   4. Fires `runStreamFor(event)` per pop; the stream owns its own
 *      `AbortController` + epoch. Preemption remains newest-wins on the
 *      stream layer; the scheduler only orders admissions.
 *   5. Cleans up channel, abort controllers, scheduler, and cache on
 *      unmount / lessonId change / disable.
 *
 * INVARIANT (A10 refinement 2 — load-bearing): reducer state progression
 * MUST NEVER depend on inference completion timing. The authoritative
 * ordering source is:
 *
 *     LessonEvent seq → scheduler pop order → reducer version
 *
 * NOT:
 *
 *     AI response completion order.
 *
 * The drain loop enforces this by advancing the reducer synchronously on
 * each pop, BEFORE issuing (and never `await`ing) `runStreamFor`. A stale
 * stream that finishes after the reducer has moved on cannot mutate state —
 * `runStreamFor` only writes to the `latest` presentation slot, guarded by
 * `event.id` equality and the epoch ref.
 *
 * Deliberate non-goals (deferred by the phased plan):
 *   - No predictive precompute (Phase B1).
 *   - No gap-driven replay from `public.lesson_events` (Phase B3). Gaps are
 *     detected and exposed via `status.lastGap` so a future recovery layer
 *     can act on them.
 *   - No writes to `lesson_sessions` / `lesson_state_snapshots`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdaptiveIntelligence } from "@/hooks/useAdaptiveIntelligence";
import { reduce, initialState, type LessonState } from "@/lib/lse/lessonReducer";
import type { LessonEvent } from "@/lib/lse/eventNormalizer";
import { createContextCache } from "@/lib/lse/contextCache";
import { createPriorityScheduler } from "@/lib/lse/priorityScheduler";
import {
  classifyIntake,
  parseSseStream,
  payloadToLessonEvent,
  projectCachedContext,
  type SseFrame,
} from "@/lib/lse/sessionInternals";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type SessionStatus =
  | "idle"           // hook mounted, no channel yet
  | "subscribing"    // supabase.channel(...).subscribe() in flight
  | "subscribed"     // ready to receive
  | "reconnecting"   // channel error/timeout; supabase will retry
  | "closed";        // unmounted / explicit stop

export type StreamStatus =
  | "idle"
  | "requesting"     // ALE context fetched, POST in flight
  | "streaming"      // SSE frames arriving
  | "done"
  | "cancelled"
  | "error"
  | "noop";          // silence/admin short-circuit

export interface LatestStream {
  /** The `LessonEvent` that triggered this stream. */
  event: LessonEvent;
  /** Accumulated token text so far. */
  text: string;
  status: StreamStatus;
  errorMessage: string | null;
}

export interface GapInfo {
  expectedSeq: number;
  receivedSeq: number;
  at: number;
}

export interface UseLuminaLiveSessionResult {
  state: LessonState;
  latest: LatestStream | null;
  session: SessionStatus;
  subscribeError: string | null;
  /** Most recent detected out-of-order seq, or null. Consumed by future B3 replay. */
  lastGap: GapInfo | null;
  /** Manually abort the in-flight stream, if any. */
  stop: () => void;
}

export interface UseLuminaLiveSessionOptions {
  /** Override the default gateway model. Passed through to the edge function. */
  model?: string;
  /** Disable the hook entirely (no subscription, no stream). */
  enabled?: boolean;
  /**
   * ALE `getContext` feature key. Defaults to `"lecture"` — the closest
   * existing feature to real-time parallel teaching. Callers driving a
   * different surface should override.
   */
  feature?: string;
  /**
   * Seed the A5 intake gate. The gate accepts events strictly at
   * `lastSeq + 1`; when a lesson already has prior events in
   * `public.lesson_events` (typical of the A9 benchmark, which does not
   * truncate between runs) the student would otherwise gap-reject every
   * new event. Setting this to `startSeq - 1` bridges that gap without
   * changing production semantics — default `undefined` preserves the
   * existing behaviour (`lastSeq = 0`).
   */
  initialLastSeq?: number;
}


// ---------------------------------------------------------------------------
// Static config
// ---------------------------------------------------------------------------

const FUNCTIONS_ENDPOINT = () => {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!url) throw new Error("VITE_SUPABASE_URL not configured");
  return `${url}/functions/v1/lumina-live`;
};

const PUBLISHABLE_KEY = () =>
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);

/**
 * Per-hook cache capacity. Refinement 1 (A10 review): sized to 8 to absorb
 * lesson transitions, reconnect scenarios, and rapid tab-switching without
 * eviction pressure. Bounded by strict LRU so this remains safe.
 */
const HOOK_CACHE_CAPACITY = 8;

// ---------------------------------------------------------------------------
// Benchmark instrumentation (opt-in, non-behavioural)
// ---------------------------------------------------------------------------

/**
 * A9 benchmark surface. If the page (e.g. `/lse-bench`) installs
 * `window.__lseBench.mark`, the hook reports four timestamps per event:
 *
 *   realtime_received  — broadcast callback fired
 *   inference_started  — POST /lumina-live issued
 *   first_token        — first non-empty SSE `token` frame consumed
 *   first_render       — React commit after `latest.text` first turns non-empty
 *
 * Absent the sentinel this is a single truthy check per call site.
 */
type BenchPhase =
  | "realtime_received"
  | "inference_started"
  | "first_token"
  | "first_render";

interface LseBenchSurface {
  mark: (eventId: string, phase: BenchPhase, ts: number) => void;
}

function benchMark(eventId: string, phase: BenchPhase): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as { __lseBench?: LseBenchSurface };
  const bench = w.__lseBench;
  if (!bench || typeof bench.mark !== "function") return;
  // Cross-context comparability (A9 refinement): use wall-clock `Date.now()`
  // instead of `performance.now()`. `performance.now()` is relative to each
  // document's `timeOrigin`, so a teacher-page timestamp is not comparable
  // to a student-page timestamp. Same-host wall-clock skew is negligible;
  // per-document time-origin skew is arbitrary.
  try { bench.mark(eventId, phase, Date.now()); } catch { /* never throw */ }
}


// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useLuminaLiveSession(
  lessonId: string,
  options: UseLuminaLiveSessionOptions = {},
): UseLuminaLiveSessionResult {
  const { model, enabled = true, feature = "lecture", initialLastSeq } = options;
  const { getContext } = useAdaptiveIntelligence();

  const [state, setState] = useState<LessonState>(() => initialState(lessonId));
  const [latest, setLatest] = useState<LatestStream | null>(null);
  const [session, setSession] = useState<SessionStatus>("idle");
  const [subscribeError, setSubscribeError] = useState<string | null>(null);
  const [lastGap, setLastGap] = useState<GapInfo | null>(null);

  // Refs hold the mutable pieces we do NOT want to trigger re-renders on.
  const stateRef = useRef<LessonState>(state);
  const lastSeqRef = useRef<number>(
    typeof initialLastSeq === "number" && Number.isFinite(initialLastSeq) && initialLastSeq >= 0
      ? Math.floor(initialLastSeq)
      : 0,
  );
  const abortRef = useRef<AbortController | null>(null);
  // Monotonic stream epoch. Bumping this invalidates any in-flight stream
  // whose closure captured a lower value — a defence in depth against
  // race conditions where two streams complete out of order.
  const epochRef = useRef<number>(0);
  const mountedRef = useRef<boolean>(true);
  // Per-hook A7 scheduler + A6 cache. Instantiated in the mount effect
  // (below) so their lifetime matches the subscription, and both are torn
  // down deterministically on unmount / lessonId change.
  const schedulerRef = useRef<ReturnType<typeof createPriorityScheduler> | null>(null);
  const cacheRef = useRef<ReturnType<typeof createContextCache> | null>(null);
  // Drain reentrancy guard.
  const drainingRef = useRef<boolean>(false);
  // Track events whose first render we've already marked, so the effect
  // that observes `latest.text` doesn't mark twice.
  const firstRenderMarkedRef = useRef<Set<string>>(new Set());

  // Keep the ref in sync with the reactive state so callbacks that survive
  // renders always project the freshest state without stale closures.
  useEffect(() => { stateRef.current = state; }, [state]);

  // Reset all per-lesson state when `lessonId` changes.
  useEffect(() => {
    stateRef.current = initialState(lessonId);
    lastSeqRef.current =
      typeof initialLastSeq === "number" && Number.isFinite(initialLastSeq) && initialLastSeq >= 0
        ? Math.floor(initialLastSeq)
        : 0;
    setState(stateRef.current);
    setLatest(null);
    setLastGap(null);
    firstRenderMarkedRef.current.clear();
    // Scheduler / cache are lesson-scoped; the mount effect creates fresh
    // instances for the new lessonId and cleans up the prior ones.
  }, [lessonId, initialLastSeq]);


  const stop = useCallback(() => {
    epochRef.current += 1;
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (schedulerRef.current) schedulerRef.current.clear();
  }, []);

  // ------------------------------------------------------------------------
  // Streaming inference call — one per scheduler pop.
  // Does NOT mutate reducer state. Only writes to `latest`.
  // ------------------------------------------------------------------------
  const runStreamFor = useCallback(async (event: LessonEvent) => {
    // Preempt any in-flight stream immediately (newest signal wins).
    stop();
    const myEpoch = ++epochRef.current;

    const controller = new AbortController();
    abortRef.current = controller;

    setLatest({ event, text: "", status: "requesting", errorMessage: null });

    let studentContext: unknown = null;
    try {
      // Best-effort — an ALE failure must not block streaming.
      studentContext = await getContext(feature as never);
    } catch {
      studentContext = null;
    }
    if (myEpoch !== epochRef.current || !mountedRef.current) return;

    // Project from cache when possible (A10: cache is now on the live path).
    const cached = cacheRef.current?.read(event.lessonId)?.projection;
    const cachedContext = cached ?? projectCachedContext(stateRef.current);

    let response: Response;
    try {
      const key = PUBLISHABLE_KEY();
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const jwt = authSession?.access_token ?? key ?? "";
      benchMark(event.id, "inference_started");
      response = await fetch(FUNCTIONS_ENDPOINT(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${jwt}`,
          ...(key ? { apikey: key } : {}),
        },
        body: JSON.stringify({
          lessonId,
          event,
          cachedContext,
          studentContext,
          ...(model ? { model } : {}),
        }),
        signal: controller.signal,
      });
    } catch (err) {
      if (myEpoch !== epochRef.current || !mountedRef.current) return;
      const aborted = err instanceof DOMException && err.name === "AbortError";
      setLatest((prev) => prev && prev.event.id === event.id
        ? { ...prev, status: aborted ? "cancelled" : "error", errorMessage: aborted ? null : String(err) }
        : prev);
      return;
    }

    if (!response.ok || !response.body) {
      if (myEpoch !== epochRef.current || !mountedRef.current) return;
      let message = `HTTP ${response.status}`;
      try {
        const err = await response.json();
        if (err?.error) message = String(err.error);
      } catch { /* body may not be JSON */ }
      setLatest((prev) => prev && prev.event.id === event.id
        ? { ...prev, status: "error", errorMessage: message }
        : prev);
      return;
    }

    setLatest((prev) => prev && prev.event.id === event.id
      ? { ...prev, status: "streaming" }
      : prev);

    let firstTokenMarked = false;
    try {
      for await (const frame of parseSseStream(response.body)) {
        if (myEpoch !== epochRef.current || !mountedRef.current) {
          try { controller.abort(); } catch { /* ignore */ }
          return;
        }
        if (!firstTokenMarked && frame.event === "token") {
          const delta = (frame.data as { delta?: unknown } | null)?.delta;
          if (typeof delta === "string" && delta.length > 0) {
            benchMark(event.id, "first_token");
            firstTokenMarked = true;
          }
        }
        applyFrame(event, frame, setLatest);
        if (frame.event === "done") return;
      }
    } catch (err) {
      if (myEpoch !== epochRef.current || !mountedRef.current) return;
      const aborted = err instanceof DOMException && err.name === "AbortError";
      setLatest((prev) => prev && prev.event.id === event.id
        ? { ...prev, status: aborted ? "cancelled" : "error", errorMessage: aborted ? null : String(err) }
        : prev);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [feature, getContext, lessonId, model, stop]);

  // ------------------------------------------------------------------------
  // Drain loop — pops the scheduler, folds state, refreshes cache, fires
  // stream. Runs in microtasks so it never blocks the broadcast handler.
  // ------------------------------------------------------------------------
  const drain = useCallback(() => {
    if (drainingRef.current) return;
    const scheduler = schedulerRef.current;
    const cache = cacheRef.current;
    if (!scheduler || !cache) return;
    drainingRef.current = true;
    // Use queueMicrotask so we yield to the event loop between pops — this
    // keeps the broadcast handler responsive to a burst and lets React
    // batch state updates.
    queueMicrotask(() => {
      try {
        const event = scheduler.pop();
        if (!event) return;
        // 1. Reduce (synchronous, pure).
        const nextState = reduce(stateRef.current, event);
        stateRef.current = nextState;
        setState(nextState);
        // 2. Refresh cache from the new state (identity-preserving on no-op).
        cache.writeFromState(nextState, lastSeqRef.current);
        // 3. Fire stream. Fire-and-forget — the drain does NOT await it.
        //    Refinement 2: reducer already advanced; stream completion
        //    order cannot mutate state.
        void runStreamFor(event);
      } finally {
        drainingRef.current = false;
        // Re-check for pending items admitted during the microtask.
        if (schedulerRef.current && schedulerRef.current.size() > 0) drain();
      }
    });
  }, [runStreamFor]);

  // ------------------------------------------------------------------------
  // First-render benchmark mark.
  // ------------------------------------------------------------------------
  useEffect(() => {
    if (!latest) return;
    if (latest.text.length === 0) return;
    if (firstRenderMarkedRef.current.has(latest.event.id)) return;
    firstRenderMarkedRef.current.add(latest.event.id);
    benchMark(latest.event.id, "first_render");
  }, [latest]);

  // ------------------------------------------------------------------------
  // Realtime subscription lifecycle. Also owns the per-lesson scheduler +
  // cache instances so their lifetime is exactly the subscription's.
  // ------------------------------------------------------------------------
  useEffect(() => {
    mountedRef.current = true;
    if (!enabled || !lessonId) {
      setSession("idle");
      return () => { mountedRef.current = false; };
    }

    // Create fresh per-lesson instances. The prior mount's cleanup handler
    // already discarded the previous instances (see return below).
    schedulerRef.current = createPriorityScheduler();
    cacheRef.current = createContextCache({ capacity: HOOK_CACHE_CAPACITY });

    setSession("subscribing");
    setSubscribeError(null);

    const channel = supabase.channel(`lesson:${lessonId}`, {
      config: { private: true, broadcast: { self: false, ack: false } },
    });

    channel.on("broadcast", { event: "lesson_event" }, (msg) => {
      if (!mountedRef.current) return;
      const event = payloadToLessonEvent(lessonId, msg?.payload);
      if (!event) return;
      benchMark(event.id, "realtime_received");

      const decision = classifyIntake(event, lastSeqRef.current);
      if (decision.reason === "duplicate" || decision.reason === "invalid") return;
      if (decision.reason === "gap") {
        setLastGap({
          expectedSeq: decision.expectedNext,
          receivedSeq: decision.seq ?? -1,
          at: Date.now(),
        });
        return;
      }

      lastSeqRef.current = decision.seq!;
      // A10: broadcast handler no longer touches reducer/cache/stream.
      // It admits to the scheduler and kicks the drain. The drain owns
      // the authoritative processing order.
      schedulerRef.current?.enqueue(event);
      drain();
    });

    channel.subscribe((status) => {
      if (!mountedRef.current) return;
      if (status === "SUBSCRIBED") {
        setSession("subscribed");
        setSubscribeError(null);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setSession("reconnecting");
        setSubscribeError(status);
      } else if (status === "CLOSED") {
        setSession("closed");
      }
    });

    return () => {
      mountedRef.current = false;
      try { supabase.removeChannel(channel); } catch { /* ignore */ }
      if (abortRef.current) {
        try { abortRef.current.abort(); } catch { /* ignore */ }
        abortRef.current = null;
      }
      if (schedulerRef.current) { schedulerRef.current.clear(); schedulerRef.current = null; }
      if (cacheRef.current) { cacheRef.current.clear(); cacheRef.current = null; }
      epochRef.current += 1;
    };
  }, [enabled, lessonId, drain]);

  const stableStop = useCallback(() => {
    stop();
    setLatest((prev) => prev ? { ...prev, status: "cancelled" } : prev);
  }, [stop]);

  return useMemo(
    () => ({ state, latest, session, subscribeError, lastGap, stop: stableStop }),
    [state, latest, session, subscribeError, lastGap, stableStop],
  );
}

// ---------------------------------------------------------------------------
// SSE frame → LatestStream reducer
// ---------------------------------------------------------------------------

function applyFrame(
  event: LessonEvent,
  frame: SseFrame,
  setLatest: React.Dispatch<React.SetStateAction<LatestStream | null>>,
): void {
  setLatest((prev) => {
    if (!prev || prev.event.id !== event.id) return prev;
    switch (frame.event) {
      case "token": {
        const delta = (frame.data as { delta?: unknown } | null)?.delta;
        if (typeof delta !== "string" || delta.length === 0) return prev;
        return { ...prev, text: prev.text + delta, status: "streaming" };
      }
      case "error": {
        const message = (frame.data as { message?: unknown } | null)?.message;
        return {
          ...prev,
          status: "error",
          errorMessage: typeof message === "string" ? message : "stream_failed",
        };
      }
      case "done": {
        const reason = (frame.data as { reason?: unknown } | null)?.reason;
        if (reason === "noop") return { ...prev, status: "noop" };
        if (reason === "cancelled") return { ...prev, status: "cancelled" };
        if (reason === "error") return { ...prev, status: prev.status === "error" ? "error" : "error" };
        return { ...prev, status: "done" };
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Re-exports for consumer convenience
// ---------------------------------------------------------------------------

export { fold, initialState } from "@/lib/lse/lessonReducer";
export { projectCachedContext } from "@/lib/lse/sessionInternals";
export type { LessonState } from "@/lib/lse/lessonReducer";
export type { LessonEvent } from "@/lib/lse/eventNormalizer";
