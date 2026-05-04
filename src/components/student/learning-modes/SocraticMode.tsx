import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Brain, ArrowRight, Check } from 'lucide-react';
import { toast } from 'sonner';

interface SocraticModeProps {
  subject: string;
  topic: string;
  onExit: () => void;
}

interface Turn {
  question: string;
  answer?: string;
  grade?: number;
  feedback?: string;
}

export function SocraticMode({ subject, topic, onExit }: SocraticModeProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [started, setStarted] = useState(false);

  const begin = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('socratic-next-turn', {
        body: { subject, topic },
      });
      if (error) throw error;
      const d = data as any;
      if (d?.error) throw new Error(d.error);
      setSessionId(d.session_id);
      setTurns([{ question: d.question }]);
      setStarted(true);
    } catch (e: any) {
      toast.error(`Could not start: ${e.message ?? 'try again'}`);
    } finally {
      setLoading(false);
    }
  };

  const submitAnswer = async () => {
    if (!currentAnswer.trim() || !sessionId) return;
    setLoading(true);
    const ans = currentAnswer.trim();
    try {
      const { data, error } = await supabase.functions.invoke('socratic-next-turn', {
        body: { session_id: sessionId, subject, topic, last_response: ans },
      });
      if (error) throw error;
      const d = data as any;
      if (d?.error) throw new Error(d.error);

      setTurns(prev => {
        const next = [...prev];
        if (next.length > 0) {
          next[next.length - 1] = {
            ...next[next.length - 1],
            answer: ans,
            grade: d.prev_grade ?? undefined,
            feedback: d.prev_feedback ?? undefined,
          };
        }
        if (d.completed) {
          setCompleted(true);
          setFinalScore(d.score ?? null);
        } else if (d.question) {
          next.push({ question: d.question });
        }
        return next;
      });
      setCurrentAnswer('');
    } catch (e: any) {
      toast.error(`Could not grade: ${e.message ?? 'try again'}`);
    } finally {
      setLoading(false);
    }
  };

  if (!started) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5" /> Socratic Mode — {subject} · {topic}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The AI will ask you 5 increasingly deeper questions. It will not give you the answers — only probe your reasoning. Your replies are graded on reasoning quality.
          </p>
          <div className="flex gap-2">
            <Button onClick={begin} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Begin session'}
            </Button>
            <Button variant="ghost" onClick={onExit}>Cancel</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const answeredCount = turns.filter(t => typeof t.grade === 'number').length;
  const currentTurn = turns[turns.length - 1];
  const awaitingAnswer = currentTurn && currentTurn.answer === undefined;

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2"><Brain className="w-5 h-5" /> Socratic — {topic}</span>
          <span className="text-xs font-normal text-muted-foreground tabular-nums">
            {Math.min(answeredCount + (awaitingAnswer ? 1 : 0), 5)} / 5
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 max-h-[calc(100vh-260px)] overflow-y-auto pb-24">
        {turns.map((t, i) => (
          <div key={i} className="space-y-2 border-l-2 border-border pl-3">
            <p className="text-sm font-serif" style={{ fontFamily: '"Source Serif 4", serif' }}>
              <span className="font-semibold text-muted-foreground">Q{i + 1}: </span>{t.question}
            </p>
            {t.answer && (
              <>
                <p className="text-sm text-foreground/90 whitespace-pre-wrap">
                  <span className="font-semibold text-muted-foreground">You: </span>{t.answer}
                </p>
                {typeof t.grade === 'number' && (
                  <div className="text-xs text-muted-foreground italic font-serif" style={{ fontFamily: '"Source Serif 4", serif' }}>
                    Reasoning: {t.grade}/5 — {t.feedback}
                  </div>
                )}
              </>
            )}
          </div>
        ))}

        {completed ? (
          <div className="rounded-lg border border-foreground/30 bg-muted p-4 space-y-2">
            <div className="flex items-center gap-2 font-semibold"><Check className="w-4 h-4" /> Session complete</div>
            <div className="text-sm">Score: <span className="tabular-nums font-semibold">{finalScore}/100</span></div>
            <Button onClick={onExit} variant="default" size="sm">Back to modes</Button>
          </div>
        ) : awaitingAnswer ? (
          <div className="space-y-2">
            <Textarea
              value={currentAnswer}
              onChange={e => setCurrentAnswer(e.target.value)}
              placeholder="Reason out loud — 2 to 4 sentences"
              rows={4}
              disabled={loading}
              className="resize-none"
            />
            <div className="flex gap-2">
              <Button onClick={submitAnswer} disabled={loading || !currentAnswer.trim()}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Submit <ArrowRight className="w-4 h-4 ml-1" /></>}
              </Button>
              <Button variant="ghost" onClick={onExit}>Exit</Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
