import { useEffect, useState } from "react";
import { Brain, Check, X, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export interface MirrorReveal {
  matched: boolean;
  drift_score: number;
  predicted_answer: string;
  predicted_reasoning: string;
  predicted_misconception: string;
}

/**
 * Slides out under an assistant message to show what Lumina predicted
 * the student would say BEFORE the assistant replied.
 */
export function MirrorRevealCard({
  snapshotId,
  actualAnswer,
}: { snapshotId: string; actualAnswer: string }) {
  const [reveal, setReveal] = useState<MirrorReveal | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    if (!snapshotId || !actualAnswer) return;
    const run = async () => {
      setLoading(true);
      setErr(null);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/predict-student/reveal`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ snapshot_id: snapshotId, actual_answer: actualAnswer }),
          },
        );
        if (!res.ok) throw new Error("reveal failed");
        const j = await res.json();
        if (!cancel) setReveal(j);
      } catch (e) {
        if (!cancel) setErr(e instanceof Error ? e.message : "reveal failed");
      } finally {
        if (!cancel) setLoading(false);
      }
    };
    run();
    return () => { cancel = true; };
  }, [snapshotId, actualAnswer]);

  if (loading || err || !reveal) return null;

  const tone = reveal.matched ? "text-emerald-500" : "text-amber-500";
  const Icon = reveal.matched ? Check : X;

  return (
    <div className="mt-2 rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors"
      >
        <Brain size={14} className="text-muted-foreground shrink-0" />
        <span className="text-xs font-medium text-foreground">Mirror reveal</span>
        <Icon size={12} className={cn("shrink-0", tone)} />
        <span className={cn("text-[11px]", tone)}>
          {reveal.matched ? "I predicted you" : "You surprised me"}
          {" "}· drift {reveal.drift_score.toFixed(0)}
        </span>
        <span className="ml-auto">
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-1.5 text-[12px] leading-snug">
          <div>
            <span className="text-muted-foreground">Predicted answer: </span>
            <span className="text-foreground">{reveal.predicted_answer || "—"}</span>
          </div>
          <div>
            <span className="text-muted-foreground">In your voice: </span>
            <span className="text-foreground italic">"{reveal.predicted_reasoning || "—"}"</span>
          </div>
          {reveal.predicted_misconception && (
            <div>
              <span className="text-muted-foreground">Likely misconception: </span>
              <span className="text-foreground">{reveal.predicted_misconception}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
