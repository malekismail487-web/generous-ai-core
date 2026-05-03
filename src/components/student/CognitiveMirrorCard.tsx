import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Brain, Sparkles, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface Stats {
  total_predictions: number;
  matched_predictions: number;
  rolling_accuracy: number;
  avg_drift: number;
  last_updated: string;
}

export function CognitiveMirrorGauge({ className }: { className?: string }) {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancel = false;
    const load = async () => {
      const { data } = await supabase
        .from("cognitive_mirror_stats")
        .select("total_predictions, matched_predictions, rolling_accuracy, avg_drift, last_updated")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancel) {
        setStats(data as Stats | null);
        setLoading(false);
      }
    };
    load();
    const channel = supabase
      .channel(`mirror-stats-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cognitive_mirror_stats", filter: `user_id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();
    return () => { cancel = true; supabase.removeChannel(channel); };
  }, [user]);

  if (loading) return null;

  const acc = stats?.rolling_accuracy ?? 0;
  const total = stats?.total_predictions ?? 0;
  const tone =
    acc >= 75 ? "text-emerald-500" :
    acc >= 50 ? "text-amber-500" :
    "text-muted-foreground";

  return (
    <div className={cn(
      "rounded-2xl border border-border/40 bg-card/70 backdrop-blur-sm p-4 flex items-center gap-3",
      className,
    )}>
      <div className="w-12 h-12 rounded-xl bg-secondary/60 flex items-center justify-center shrink-0">
        <Brain size={22} className={tone} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">Cognitive Mirror</span>
          <Sparkles size={12} className="text-muted-foreground" />
        </div>
        {total === 0 ? (
          <p className="text-xs text-muted-foreground mt-0.5">
            Lumina is learning how you think. Ask a few questions to start.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground mt-0.5">
            Lumina knows you{" "}
            <span className={cn("font-semibold", tone)}>{acc.toFixed(0)}%</span>
            {" "}— predicted your answer on{" "}
            <span className="font-medium text-foreground">{stats!.matched_predictions}</span>
            /{total} of recent questions.
          </p>
        )}
      </div>
      {total > 0 && (
        <div className="flex flex-col items-end shrink-0">
          <div className={cn("text-lg font-bold tabular-nums", tone)}>{acc.toFixed(0)}%</div>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <TrendingUp size={10} />
            drift {stats!.avg_drift.toFixed(0)}
          </div>
        </div>
      )}
    </div>
  );
}
