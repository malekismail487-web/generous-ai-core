/**
 * LSE Stage A5 — `useLuminaLiveSession(lessonId)`
 * -----------------------------------------------
 * The student-side lifecycle hook. One instance per (student, lesson):
 *   1. Subscribes to the private Realtime channel `lesson:<uuid>`.
 *   2. Folds each broadcast payload into a `LessonState` via the Stage A3
 *      pure reducer, using ordered-intake gating to reject duplicates and
 *      surface gaps for future replay recovery.
 *   3. Projects the state into the `cachedContext` shape expected by the
 *      Stage A4 edge function.
 *   4. Fetches a fresh ALE context via `useAdaptiveIntelligence.getContext`
 *      and POSTs to `lumina-live`, consuming the SSE stream.
 *   5. Aborts the in-flight stream the moment a new event arrives — the
 *      Refinement-1 "volatile delta" is always the freshest teacher signal.
 *   6. Cleans up the channel and any in-flight AbortController on unmount
 *      to avoid the leaking-subscription anti-pattern called out in the
 *      cloud-realtime guidance.
 *
 * Deliberate non-goals (deferred by the phased plan):
 *   - No predictive precompute (Phase B1).
 *   - No gap-driven replay from `public.lesson_events` (Phase B3). Gaps are
 *     detected and exposed via `status.lastGap` so a future recovery layer
 *     can act on them.
 *   - No priority-aware scheduling (Stage A7). This hook streams one event
 *     at a time and preempts on the next arrival; A7 will replace the
 *     naive preemption with the P1..P5 queue.
 *   - No writes to `lesson_sessions` / `lesson_state_snapshots` (Stage A6).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdaptiveIntelligence } from "@/hooks/useAdaptiveIntelligence";
import { fold, reduce, initialState, type LessonState } from "@/lib/lse/lessonReducer";
import type { LessonEvent } from "@/lib/lse/eventNormalizer";
import {
  classifyIntake,
  parseSseStream,
  payloadToLessonEvent,
  projectCachedContext,
  seqFromEventId,
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

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useLuminaLiveSession(
  lessonId: string,
  options: UseLuminaLiveSessionOptions = {},
): UseLuminaLiveSessionResult {
  const { model, enabled = true, feature = "lecture" } = options;
  const { getContext } = useAdaptiveIntelligence();

  const [state, setState] = useState<LessonState>(() => initialState(lessonId));
  const [latest, setLatest] = useState<LatestStream | null>(null);
  const [session, setSession] = useState<SessionStatus>("idle");
  const [subscribeError, setSubscribeError] = useState<string | null>(null);
  const [lastGap, setLastGap] = useState<GapInfo | null>(null);

  // Refs hold the mutable pieces we do NOT want to trigger re-renders on.
  const stateRef = useRef<LessonState>(state);
  const lastSeqRef = useRef<number>(0);
  const abortRef = useRef<AbortController | null>(null);
  // Monotonic stream epoch. Bumping this invalidates any in-flight stream
  // whose closure captured a lower value — a defence in depth against
  // race conditions where two streams complete out of order.
  const epochRef = useRef<number>(0);
  const mountedRef = useRef<boolean>(true);

  // Keep the ref in sync with the reactive state so callbacks that survive
  // renders always project the freshest state without stale closures.
  useEffect(() => { stateRef.current = state; }, [state]);

  // Reset all per-lesson state when `lessonId` changes.
  useEffect(() => {
    stateRef.current = initialState(lessonId);
    lastSeqRef.current = 0;
    setState(stateRef.current);
    setLatest(null);
    setLastGap(null);
  }, [lessonId]);

  const stop = useCallback(() => {
    epochRef.current += 1;
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  // ------------------------------------------------------------------------
  // Streaming inference call — one per accepted event.
  // ------------------------------------------------------------------------
  const runStreamFor = useCallback(async (event: LessonEvent) => {
    // Preempt any in-flight stream immediately (Refinement-1: newest signal
    // wins). Priority-aware preemption arrives with Stage A7.
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

    const cachedContext = projectCachedContext(stateRef.current);

    let response: Response;
    try {
      const key = PUBLISHABLE_KEY();
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const jwt = authSession?.access_token ?? key ?? "";
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

    try {
      for await (const frame of parseSseStream(response.body)) {
        if (myEpoch !== epochRef.current || !mountedRef.current) {
          try { controller.abort(); } catch { /* ignore */ }
          return;
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
  // Realtime subscription lifecycle.
  // ------------------------------------------------------------------------
  useEffect(() => {
    mountedRef.current = true;
    if (!enabled || !lessonId) {
      setSession("idle");
      return () => { mountedRef.current = false; };
    }

    setSession("subscribing");
    setSubscribeError(null);

    const channel = supabase.channel(`lesson:${lessonId}`, {
      config: { private: true, broadcast: { self: false, ack: false } },
    });

    channel.on("broadcast", { event: "lesson_event" }, (msg) => {
      if (!mountedRef.current) return;
      const event = payloadToLessonEvent(lessonId, msg?.payload);
      if (!event) return;

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
      const nextState = reduce(stateRef.current, event);
      stateRef.current = nextState;
      setState(nextState);

      // Void the returned promise — the stream drives its own state updates.
      void runStreamFor(event);
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
      epochRef.current += 1;
    };
  }, [enabled, lessonId, runStreamFor]);

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
