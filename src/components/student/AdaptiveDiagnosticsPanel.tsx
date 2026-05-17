/**
 * AdaptiveDiagnosticsPanel — Phase 3 internal tool.
 *
 * A small floating panel showing real-time adaptive system state:
 *   - Current profile version (bus)
 *   - Recent invalidations (reason + timestamp)
 *   - Cached adaptive level / dominant style / cognitive load / fatigue
 *   - Recent quality-validator scores (Phase 1)
 *
 * Mounted only when:
 *   - URL has ?lumiDiag=1, OR
 *   - localStorage.lumi_diag === "1"
 *
 * This is an internal tuning tool — it never ships visible to students.
 * It is read-only and never mutates adaptive state.
 */

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, X } from "lucide-react";
import {
  getInvalidationDiagnostics,
  subscribeProfileVersion,
} from "@/lib/adaptiveProfileBus";
import { useAdaptiveIntelligence } from "@/hooks/useAdaptiveIntelligence";
import { supabase } from "@/integrations/supabase/client";
import {
  computeOutcomeMetrics,
  formatRate,
  formatDelta,
  type OutcomeMetricsResult,
} from "@/lib/outcomeMetrics";

function isEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("lumiDiag") === "1") return true;
    return localStorage.getItem("lumi_diag") === "1";
  } catch {
    return false;
  }
}

export function AdaptiveDiagnosticsPanel() {
  const [enabled, setEnabled] = useState<boolean>(() => isEnabled());
  const [, force] = useState(0);
  const { getContext, profileVersion, userId } = useAdaptiveIntelligence();
  const [snapshot, setSnapshot] = useState<{
    level?: string;
    style?: string;
    cognitiveLoad?: number;
    fatigueLevel?: number;
    completeness?: number;
    coldStart?: { source: string; grade: string | null; pace: string | null; iq: number | null } | null;
    generatedAt?: number;
  } | null>(null);
  const [scores, setScores] = useState<Array<{ score: number; feature: string; created_at: string; regenerated: boolean }>>([]);
  const [signals, setSignals] = useState<Array<{ signal: string; feature: string; created_at: string }>>([]);

  // Subscribe to bus to repaint when version changes
  useEffect(() => {
    if (!enabled) return;
    return subscribeProfileVersion(() => force((n) => n + 1));
  }, [enabled]);

  // Refresh derived snapshot whenever the profile version changes
  useEffect(() => {
    if (!enabled || !userId) return;
    let cancelled = false;
    (async () => {
      try {
        const ctx = await getContext("lecture" as any);
        if (cancelled) return;
        const p: any = ctx.profile || {};
        setSnapshot({
          level: p.overallLevel || ctx.adaptiveLevel,
          style: p.dominantStyle,
          cognitiveLoad: p.cognitiveLoad,
          fatigueLevel: p.fatigueLevel,
          completeness: p.profileCompleteness,
          coldStart: p.coldStartSeed
            ? {
                source: p.coldStartSeed.source,
                grade: p.coldStartSeed.gradeLevel ?? null,
                pace: p.coldStartSeed.iq?.learning_pace ?? null,
                iq: p.coldStartSeed.iq?.estimated_iq ?? null,
              }
            : null,
          generatedAt: Date.now(),
        });
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [enabled, userId, profileVersion, getContext]);

  // Pull last 8 quality scores + last 8 helpfulness signals for this user
  useEffect(() => {
    if (!enabled || !userId) return;
    let cancelled = false;
    (async () => {
      try {
        const [{ data: qs }, { data: sigs }] = await Promise.all([
          supabase
            .from("adaptive_quality_scores")
            .select("score, feature, created_at, regenerated")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(8),
          supabase
            .from("ai_output_signals")
            .select("signal, feature, created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(8),
        ]);
        if (cancelled) return;
        if (qs) setScores(qs as any);
        if (sigs) setSignals(sigs as any);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [enabled, userId, profileVersion]);

  const diag = useMemo(() => getInvalidationDiagnostics(), [profileVersion]);

  if (!enabled) return null;

  return (
    <Card className="fixed bottom-4 right-4 z-[9999] w-[340px] max-h-[70vh] flex flex-col shadow-2xl border-2 border-primary/30 bg-background/95 backdrop-blur">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <Activity className="w-3.5 h-3.5 text-primary" />
          Lumi Diagnostics
          <Badge variant="outline" className="text-[10px] py-0 h-4">v{diag.version}</Badge>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => {
            try { localStorage.removeItem("lumi_diag"); } catch { /* */ }
            setEnabled(false);
          }}
        >
          <X className="w-3 h-3" />
        </Button>
      </div>

      <ScrollArea className="flex-1 p-3 space-y-3 text-xs">
        <section>
          <div className="font-medium text-muted-foreground mb-1">Profile snapshot</div>
          <div className="space-y-0.5">
            <div>Level: <span className="font-mono">{snapshot?.level ?? "—"}</span></div>
            <div>Dominant style: <span className="font-mono">{snapshot?.style ?? "—"}</span></div>
            <div>Cognitive load: <span className="font-mono">{snapshot?.cognitiveLoad?.toFixed?.(2) ?? "—"}</span></div>
            <div>Fatigue: <span className="font-mono">{snapshot?.fatigueLevel?.toFixed?.(2) ?? "—"}</span></div>
            <div>Completeness: <span className="font-mono">{snapshot?.completeness ?? "—"}%</span></div>
          </div>
        </section>

        {snapshot?.coldStart && (
          <section>
            <div className="font-medium text-muted-foreground mb-1">Cold-start seed</div>
            <div className="space-y-0.5 font-mono text-[11px]">
              <div>source: {snapshot.coldStart.source}</div>
              <div>grade: {snapshot.coldStart.grade ?? "—"}</div>
              <div>pace: {snapshot.coldStart.pace ?? "—"}</div>
              <div>est. IQ: {snapshot.coldStart.iq ?? "—"}</div>
            </div>
          </section>
        )}

        <section>
          <div className="font-medium text-muted-foreground mb-1">Invalidations ({diag.invalidationCount})</div>
          {diag.recent.length === 0 ? (
            <div className="text-muted-foreground italic">No bumps yet</div>
          ) : (
            <ul className="space-y-1">
              {diag.recent.map((r, i) => (
                <li key={i} className="font-mono text-[11px] flex justify-between gap-2">
                  <span className="truncate">
                    <Badge variant="secondary" className="text-[9px] py-0 h-4 mr-1">{r.reason}</Badge>
                    {r.detail ?? ""}
                  </span>
                  <span className="text-muted-foreground shrink-0">
                    {Math.round((Date.now() - r.at) / 1000)}s
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <div className="font-medium text-muted-foreground mb-1">Recent quality scores</div>
          {scores.length === 0 ? (
            <div className="text-muted-foreground italic">No scores logged yet</div>
          ) : (
            <ul className="space-y-1">
              {scores.map((s, i) => (
                <li key={i} className="font-mono text-[11px] flex justify-between gap-2">
                  <span className="truncate">
                    <Badge variant="outline" className="text-[9px] py-0 h-4 mr-1">{s.feature}</Badge>
                    {s.regenerated ? "(regen) " : ""}
                  </span>
                  <span className={s.score < 0.85 ? "text-destructive" : "text-foreground"}>
                    {s.score.toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <div className="font-medium text-muted-foreground mb-1">Recent helpfulness</div>
          {signals.length === 0 ? (
            <div className="text-muted-foreground italic">No signals yet</div>
          ) : (
            <ul className="space-y-1">
              {signals.map((s, i) => {
                const negative = ['down','too_hard','confusing','off_topic','implicit_regen','implicit_followup_confused'].includes(s.signal);
                return (
                  <li key={i} className="font-mono text-[11px] flex justify-between gap-2">
                    <span className="truncate">
                      <Badge variant="outline" className="text-[9px] py-0 h-4 mr-1">{s.feature}</Badge>
                    </span>
                    <span className={negative ? 'text-destructive' : 'text-foreground'}>
                      {s.signal}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </ScrollArea>

      <div className="px-3 py-2 border-t border-border text-[10px] text-muted-foreground">
        Toggle: <code>localStorage.lumi_diag = "1"</code> or <code>?lumiDiag=1</code>
      </div>
    </Card>
  );
}
