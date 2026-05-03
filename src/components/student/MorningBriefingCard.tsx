import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Sparkles, Moon, Check, X, Heart } from "lucide-react";
import { MathRenderer } from "@/components/MathRenderer";
import { recordIntelligentAnswer } from "@/lib/adaptiveIntelligence";
import { cn } from "@/lib/utils";

interface QuizQ { q: string; choices: string[]; answer_index: number; explanation: string; }
interface Briefing {
  id: string;
  briefing_md: string;
  key_insight: string | null;
  leverage_topic: string | null;
  mini_quiz: QuizQ[];
  scheduled_for: string;
  opened_at: string | null;
}

export function MorningBriefingCard() {
  const { user } = useAuth();
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [picked, setPicked] = useState<Record<number, number>>({});

  useEffect(() => {
    if (!user) return;
    let cancel = false;
    const load = async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("morning_briefings")
        .select("id, briefing_md, key_insight, leverage_topic, mini_quiz, scheduled_for, opened_at")
        .eq("user_id", user.id)
        .eq("scheduled_for", today)
        .maybeSingle();
      if (cancel) return;
      if (data) {
        setBriefing(data as unknown as Briefing);
        setLoading(false);
        if (!data.opened_at) {
          supabase.from("morning_briefings").update({ opened_at: new Date().toISOString() }).eq("id", data.id).then(() => {});
        }
      } else {
        // Generate on-demand
        setGenerating(true);
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
          const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dream-consolidate`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({}),
          });
          if (res.ok) {
            const j = await res.json();
            if (!cancel) setBriefing(j.briefing as Briefing);
          }
        } catch { /* silent */ }
        if (!cancel) { setGenerating(false); setLoading(false); }
      }
    };
    load();
    return () => { cancel = true; };
  }, [user]);

  if (loading || generating) {
    return (
      <div className="mx-3 mb-4 rounded-2xl border border-border/40 bg-card/70 backdrop-blur-sm p-4 flex items-center gap-3">
        <Moon size={18} className="text-muted-foreground animate-pulse" />
        <span className="text-xs text-muted-foreground">
          {generating ? "Lumina is consolidating overnight…" : "Loading briefing…"}
        </span>
      </div>
    );
  }
  if (!briefing || dismissed) return null;

  const quiz = Array.isArray(briefing.mini_quiz) ? briefing.mini_quiz : [];

  return (
    <div className="mx-3 mb-4 rounded-2xl border border-border/40 bg-card/80 backdrop-blur-sm p-4 animate-fade-in relative">
      <button onClick={() => setDismissed(true)} className="absolute top-2 right-2 p-1 rounded-lg hover:bg-muted/50 text-muted-foreground">
        <X size={14} />
      </button>
      <div className="flex items-center gap-2 mb-2">
        <Moon size={16} className="text-primary" />
        <span className="text-sm font-bold">Morning Briefing</span>
        <Sparkles size={12} className="text-muted-foreground" />
      </div>
      {briefing.key_insight && (
        <div className="mb-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20 text-[12px] text-foreground">
          <span className="font-medium">Today's leverage: </span>{briefing.key_insight}
          {briefing.leverage_topic && (
            <span className="block text-[10px] text-muted-foreground mt-0.5">{briefing.leverage_topic}</span>
          )}
        </div>
      )}
      <div className="text-[13px]" style={{ fontFamily: "Source Serif 4, serif" }}>
        <MathRenderer content={briefing.briefing_md} />
      </div>
      {quiz.length > 0 && (
        <div className="mt-3 space-y-3">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">90-second mini quiz</div>
          {quiz.map((q, qi) => (
            <div key={qi} className="rounded-lg border border-border/40 p-3">
              <div className="text-[12px] font-medium mb-2">{qi + 1}. {q.q}</div>
              <div className="grid grid-cols-1 gap-1.5">
                {(q.choices ?? []).map((c, ci) => {
                  const chosen = picked[qi];
                  const isAnswered = chosen !== undefined;
                  const isCorrect = ci === q.answer_index;
                  const isPicked = chosen === ci;
                  return (
                    <button
                      key={ci}
                      disabled={isAnswered}
                      onClick={() => setPicked(p => ({ ...p, [qi]: ci }))}
                      className={cn(
                        "text-left text-[12px] px-2.5 py-1.5 rounded-md border transition-colors",
                        !isAnswered && "border-border/50 hover:border-primary/50",
                        isAnswered && isCorrect && "border-emerald-500/60 bg-emerald-500/10",
                        isAnswered && isPicked && !isCorrect && "border-rose-500/60 bg-rose-500/10",
                      )}
                    >
                      <span className="flex items-center gap-2">
                        {isAnswered && isCorrect && <Check size={12} className="text-emerald-500 shrink-0" />}
                        {isAnswered && isPicked && !isCorrect && <X size={12} className="text-rose-500 shrink-0" />}
                        <span>{c}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {picked[qi] !== undefined && q.explanation && (
                <div className="text-[11px] text-muted-foreground mt-2 italic">{q.explanation}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
