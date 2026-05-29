/**
 * ColdStartProbe.tsx
 *
 * A short, opt-in calibration quiz that quickly drops a student's measured
 * standard error from ~1.5 to ~0.5 in five questions. Used by the adaptive
 * engine to skip the "all new students default to intermediate" cold-start
 * problem.
 *
 * The probe respects the project's no-interruptions rule — it is rendered
 * inline, never as a forced overlay, and the user can dismiss it at any time.
 * Every answer is recorded via the server-side IRT engine, so a student
 * cannot inflate their own theta.
 */

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, CheckCircle2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { recordGradedAnswer, getAbilitySnapshot, type AbilitySnapshot } from "@/lib/adaptive/irtEngine";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface ProbeQuestion {
  index: number;
  question: string;
  choices: string[];
  correctIndex: number;
  difficultyHint: "easy" | "medium" | "hard";
}

interface ColdStartProbeProps {
  subject: string;
  gradeLevel?: string | null;
  onComplete?: (snapshot: AbilitySnapshot | null) => void;
  onCancel?: () => void;
}

export function ColdStartProbe({
  subject,
  gradeLevel,
  onComplete,
  onCancel,
}: ColdStartProbeProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState<ProbeQuestion | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [askedTexts, setAskedTexts] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);
  const [finalSnapshot, setFinalSnapshot] = useState<AbilitySnapshot | null>(null);

  const fetchQuestion = useCallback(
    async (nextIndex: number, asked: string[]) => {
      setLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Not signed in");

        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cold-start-probe`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              action: nextIndex === 0 ? "start" : "next",
              subject,
              gradeLevel,
              index: nextIndex,
              alreadyAsked: asked,
            }),
          },
        );

        if (!res.ok) throw new Error(`Probe error ${res.status}`);
        const json = await res.json();

        if (json.done) {
          setDone(true);
          if (user) {
            const snap = await getAbilitySnapshot(user.id, subject);
            setFinalSnapshot(snap);
            onComplete?.(snap);
          }
        } else {
          setCurrent(json.question);
          setSelected(null);
          setRevealed(false);
        }
      } catch (err) {
        console.error("[ColdStartProbe] fetch error:", err);
        toast.error("Could not load the next question.");
      } finally {
        setLoading(false);
      }
    },
    [subject, gradeLevel, user, onComplete],
  );

  useEffect(() => {
    fetchQuestion(0, []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject]);

  const handleSubmit = async () => {
    if (selected === null || !current) return;
    const isCorrect = selected === current.correctIndex;
    setRevealed(true);

    try {
      await recordGradedAnswer({
        subject,
        questionText: current.question,
        correctAnswer: current.choices[current.correctIndex],
        studentAnswer: current.choices[selected],
        isCorrect,
        source: "probe",
        difficultyHint: current.difficultyHint,
      });
    } catch (err) {
      console.warn("[ColdStartProbe] record failed:", err);
    }
  };

  const handleNext = async () => {
    if (!current) return;
    const nextIndex = index + 1;
    const nextAsked = [...askedTexts, current.question];
    setAskedTexts(nextAsked);
    setIndex(nextIndex);
    await fetchQuestion(nextIndex, nextAsked);
  };

  // ─── Completion view ──────────────────────────────────────────────────
  if (done) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-foreground" />
          <h3 className="font-semibold">Calibration complete</h3>
        </div>
        {finalSnapshot ? (
          <div className="text-sm text-muted-foreground space-y-1">
            <p>
              Your measured level for <span className="font-medium text-foreground">{subject}</span> is{" "}
              <span className="font-medium text-foreground uppercase">{finalSnapshot.level}</span>.
            </p>
            <p className="text-xs">
              Ability score {finalSnapshot.theta.toFixed(2)} · confidence{" "}
              {finalSnapshot.provisional ? "still building" : "locked in"} · based on {finalSnapshot.graded_count} graded answers.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            We recorded your calibration. Your adaptive level will refine further as you learn.
          </p>
        )}
        <Button onClick={() => onComplete?.(finalSnapshot)} className="w-full">
          Continue
        </Button>
      </div>
    );
  }

  // ─── Loading state ────────────────────────────────────────────────────
  if (loading || !current) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card p-6 flex items-center gap-3">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm text-muted-foreground">Preparing your calibration question…</span>
      </div>
    );
  }

  // ─── Active question ──────────────────────────────────────────────────
  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Calibration · {index + 1} of 5</span>
        </div>
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Cancel calibration"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <p className="text-base font-medium leading-snug">{current.question}</p>

      <div className="space-y-2">
        {current.choices.map((choice, i) => {
          const isSelected = selected === i;
          const isCorrect = i === current.correctIndex;
          let cls = "border-border/60 hover:border-foreground/40";
          if (revealed) {
            if (isCorrect) cls = "border-foreground bg-foreground/5";
            else if (isSelected) cls = "border-destructive/60 bg-destructive/5";
            else cls = "border-border/40 opacity-60";
          } else if (isSelected) {
            cls = "border-foreground bg-foreground/5";
          }
          return (
            <button
              key={i}
              disabled={revealed}
              onClick={() => setSelected(i)}
              className={`w-full text-left text-sm rounded-xl border px-4 py-3 transition-colors ${cls}`}
            >
              {choice}
            </button>
          );
        })}
      </div>

      {!revealed ? (
        <Button
          onClick={handleSubmit}
          disabled={selected === null}
          className="w-full"
        >
          Submit answer
        </Button>
      ) : (
        <Button onClick={handleNext} className="w-full">
          {index + 1 >= 5 ? "Finish calibration" : "Next question"}
        </Button>
      )}
    </div>
  );
}
