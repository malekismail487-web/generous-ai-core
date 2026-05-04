import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Brain, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface DueConcept {
  id: string;
  subject: string;
  topic: string;
  mastery_score: number;
  next_review_at: string;
}

/**
 * Decay dashboard card — shows topics that are about to be forgotten,
 * lets the student answer a 1-question AI refresher to bump mastery.
 */
export function DecayDashboardCard({ userId }: { userId: string }) {
  const [due, setDue] = useState<DueConcept[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<DueConcept | null>(null);
  const [genLoading, setGenLoading] = useState(false);
  const [refresher, setRefresher] = useState<{
    refresher_id: string;
    question_text: string;
    options: string[];
  } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<{
    was_correct: boolean;
    correct_index: number;
    mastery_score: number | null;
  } | null>(null);
  const [grading, setGrading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("concept_mastery")
      .select("id, subject, topic, mastery_score, next_review_at")
      .eq("user_id", userId)
      .lte("next_review_at", new Date().toISOString())
      .order("next_review_at", { ascending: true })
      .limit(8);
    setDue((data ?? []) as DueConcept[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const startRefresher = async (concept: DueConcept) => {
    setActive(concept);
    setRefresher(null);
    setResult(null);
    setSelected(null);
    setGenLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "decay-generate-refresher",
        { body: { concept_mastery_id: concept.id } },
      );
      if (error || !data) {
        setActive(null);
        return;
      }
      setRefresher(data as any);
    } finally {
      setGenLoading(false);
    }
  };

  const submitAnswer = async () => {
    if (!refresher || selected === null) return;
    setGrading(true);
    try {
      const { data } = await supabase.functions.invoke(
        "decay-grade-refresher",
        { body: { refresher_id: refresher.refresher_id, selected_index: selected } },
      );
      if (data) setResult(data as any);
    } finally {
      setGrading(false);
    }
  };

  const close = () => {
    setActive(null);
    setRefresher(null);
    setResult(null);
    setSelected(null);
    load();
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="w-4 h-4" />
            Topics fading
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-24 flex items-center justify-center text-sm text-muted-foreground">
              Loading...
            </div>
          ) : due.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Nothing fading right now. Keep practicing to build long-term mastery.
            </div>
          ) : (
            <div className="space-y-2">
              {due.slice(0, 4).map((c) => (
                <button
                  key={c.id}
                  onClick={() => startRefresher(c)}
                  className="w-full text-left rounded-lg border border-border bg-card hover:border-foreground/40 transition-colors px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{c.topic}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{c.subject}</div>
                    </div>
                    <div className="text-[11px] tabular-nums text-muted-foreground shrink-0">
                      {Math.round(c.mastery_score * 100)}%
                    </div>
                  </div>
                </button>
              ))}
              {due.length > 4 && (
                <div className="text-xs text-muted-foreground pt-1">
                  +{due.length - 4} more due
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!active} onOpenChange={(o) => { if (!o) close(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Quick refresher</DialogTitle>
            <DialogDescription>
              {active?.subject} · {active?.topic}
            </DialogDescription>
          </DialogHeader>

          {genLoading || !refresher ? (
            <div className="py-10 flex items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Generating a question...
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-sm font-serif" style={{ fontFamily: '"Source Serif 4", serif' }}>
                {refresher.question_text}
              </div>
              <div className="space-y-2">
                {refresher.options.map((opt, idx) => {
                  const isSelected = selected === idx;
                  const isCorrect = result && idx === result.correct_index;
                  const isWrongPicked = result && isSelected && !result.was_correct;
                  return (
                    <button
                      key={idx}
                      disabled={!!result || grading}
                      onClick={() => setSelected(idx)}
                      className={cn(
                        "w-full text-left rounded-lg border px-3 py-2.5 text-sm transition-colors",
                        "border-border bg-card hover:border-foreground/40",
                        isSelected && !result && "border-foreground bg-foreground text-background",
                        result && isCorrect && "border-emerald-500 bg-emerald-500/10",
                        isWrongPicked && "border-red-500 bg-red-500/10",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] tabular-nums opacity-60 w-4">
                          {String.fromCharCode(65 + idx)}
                        </span>
                        <span className="flex-1">{opt}</span>
                        {result && isCorrect && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                        {isWrongPicked && <XCircle className="w-4 h-4 text-red-500" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              {!result ? (
                <Button
                  className="w-full"
                  disabled={selected === null || grading}
                  onClick={submitAnswer}
                >
                  {grading ? "Grading..." : "Submit"}
                </Button>
              ) : (
                <div className="space-y-2">
                  <div className={cn(
                    "rounded-lg p-3 text-sm",
                    result.was_correct ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-red-500/10 text-red-700 dark:text-red-400",
                  )}>
                    {result.was_correct
                      ? "Correct — your mastery on this topic just went up."
                      : "Not quite — we'll review this topic again sooner."}
                    {result.mastery_score !== null && (
                      <div className="text-xs mt-1 opacity-80">
                        Mastery: {Math.round(result.mastery_score * 100)}%
                      </div>
                    )}
                  </div>
                  <Button className="w-full" variant="secondary" onClick={close}>
                    Done
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
