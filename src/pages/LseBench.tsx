/**
 * LSE Stage A9 — Benchmark route
 * ------------------------------
 * Mounts `useLuminaLiveSession(lessonId)` and installs `window.__lseBench`
 * so a Playwright driver can read per-event timestamps. This route exists
 * solely to support the wall-clock latency benchmark; it is NOT part of
 * any student-facing surface and is deliberately unlinked from navigation.
 *
 * Query params:
 *   ?lesson=<uuid>      — required. The lesson channel to subscribe to.
 *   &enabled=1|0        — optional (default 1). Skips subscription when 0.
 *
 * Auth: the route trusts the browser's Supabase session — the harness
 * signs in via the app's normal auth flow before navigating here. If no
 * session is present, the hook's Realtime subscription will fail; the
 * benchmark driver treats that as a "prerequisites missing" outcome and
 * exits cleanly (see `scripts/lseA9LiveBenchmark.ts`).
 */

import { useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useLuminaLiveSession } from "@/hooks/useLuminaLiveSession";

type BenchPhase = "realtime_received" | "inference_started" | "first_token" | "first_render";

interface BenchMark { eventId: string; phase: BenchPhase; ts: number }

interface LseBenchWindow {
  __lseBench?: {
    mark: (eventId: string, phase: BenchPhase, ts: number) => void;
    /** Read-only accessor for the Playwright driver. */
    read: () => BenchMark[];
    /** Reset the buffer between runs. */
    reset: () => void;
    /** Signals the benchmark route is fully mounted and instrumented. */
    ready: boolean;
  };
}

export default function LseBench() {
  const [params] = useSearchParams();
  const lessonId = params.get("lesson") ?? "";
  const enabled = params.get("enabled") !== "0";
  const startSeqParam = params.get("startSeq");
  const initialLastSeq =
    startSeqParam !== null && /^\d+$/.test(startSeqParam)
      ? Math.max(0, parseInt(startSeqParam, 10) - 1)
      : undefined;


  // Install the bench surface synchronously on first render so any bench
  // mark emitted during the first `useEffect` cycle is captured.
  const bufferRef = useRef<BenchMark[]>([]);
  useMemo(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as LseBenchWindow;
    w.__lseBench = {
      mark: (eventId, phase, ts) => { bufferRef.current.push({ eventId, phase, ts }); },
      read: () => bufferRef.current.slice(),
      reset: () => { bufferRef.current = []; },
      ready: true,
    };
  }, []);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined") {
        const w = window as unknown as LseBenchWindow;
        if (w.__lseBench) w.__lseBench.ready = false;
      }
    };
  }, []);

  const { state, latest, session, subscribeError, lastGap } = useLuminaLiveSession(lessonId, {
    enabled: enabled && lessonId.length > 0,
    initialLastSeq,
  });


  return (
    <main className="min-h-screen bg-background p-6 font-mono text-xs">
      <h1 className="text-base font-semibold mb-2">LSE A9 — benchmark route</h1>
      <p className="mb-4 text-muted-foreground">Non-user-facing. Playwright reads <code>window.__lseBench</code>.</p>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
        <dt>lessonId</dt><dd data-testid="bench-lesson-id">{lessonId || "(missing)"}</dd>
        <dt>session</dt><dd data-testid="bench-session-status">{session}</dd>
        <dt>subscribeError</dt><dd data-testid="bench-subscribe-error">{subscribeError ?? "-"}</dd>
        <dt>state.version</dt><dd data-testid="bench-state-version">{state.version}</dd>
        <dt>state.lastSeq</dt><dd data-testid="bench-last-seq">{/* derived from latest event id */}{latest ? latest.event.id.split("#")[1] ?? "-" : "-"}</dd>
        <dt>currentConcept</dt><dd>{state.currentConcept?.label ?? "-"}</dd>
        <dt>latest.status</dt><dd data-testid="bench-latest-status">{latest?.status ?? "-"}</dd>
        <dt>latest.eventId</dt><dd data-testid="bench-latest-event-id">{latest?.event.id ?? "-"}</dd>
        <dt>latest.text.length</dt><dd data-testid="bench-text-length">{latest?.text.length ?? 0}</dd>
        <dt>lastGap</dt><dd>{lastGap ? `expected=${lastGap.expectedSeq} received=${lastGap.receivedSeq}` : "-"}</dd>
      </dl>
    </main>
  );
}
