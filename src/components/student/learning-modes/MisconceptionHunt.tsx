import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Search, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface MisconceptionHuntProps {
  subject: string;
  topic: string;
  onExit: () => void;
}

interface Statement { id: string; text: string; }
interface ResultItem {
  id: string; text: string; your_mark: boolean; truth: boolean;
  explanation_score: number; rationale: string; correct: boolean;
}

export function MisconceptionHunt({ subject, topic, onExit }: MisconceptionHuntProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [statements, setStatements] = useState<Statement[]>([]);
  const [marks, setMarks] = useState<Record<string, boolean>>({});
  const [explanations, setExplanations] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<ResultItem[] | null>(null);
  const [score, setScore] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('misconception-hunt-generate', {
          body: { subject, topic },
        });
        if (cancelled) return;
        if (error) throw error;
        const d = data as any;
        if (d?.error) throw new Error(d.error);
        setSessionId(d.session_id);
        setStatements(d.statements ?? []);
      } catch (e: any) {
        if (!cancelled) toast.error(`Could not load: ${e.message ?? 'try again'}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [subject, topic]);

  const allMarked = statements.length > 0 && statements.every(s => marks[s.id] !== undefined);
  const allExplained = statements.length > 0 && statements.every(s => (explanations[s.id] ?? '').trim().length >= 5);

  const submit = async () => {
    if (!sessionId || !allMarked || !allExplained) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('misconception-hunt-grade', {
        body: { session_id: sessionId, marks, explanations },
      });
      if (error) throw error;
      const d = data as any;
      if (d?.error) throw new Error(d.error);
      setResults(d.results ?? []);
      setScore(d.score ?? 0);
    } catch (e: any) {
      toast.error(`Could not grade: ${e.message ?? 'try again'}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="w-5 h-5" /> Misconception Hunt — {subject} · {topic}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 max-h-[calc(100vh-260px)] overflow-y-auto pb-24">
        {results === null ? (
          <>
            <p className="text-sm text-muted-foreground">
              Some of these statements are subtly wrong. Mark each True or False, then explain your reasoning in one sentence.
            </p>
            {statements.map((s, i) => (
              <div key={s.id} className="rounded-lg border border-border p-3 space-y-2">
                <p className="text-sm font-serif" style={{ fontFamily: '"Source Serif 4", serif' }}>
                  <span className="font-semibold text-muted-foreground">{i + 1}. </span>{s.text}
                </p>
                <div className="flex gap-2">
                  {([true, false] as const).map(v => (
                    <button
                      key={String(v)}
                      type="button"
                      onClick={() => setMarks(prev => ({ ...prev, [s.id]: v }))}
                      className={cn(
                        'px-3 py-1.5 rounded-md border text-sm transition-colors',
                        marks[s.id] === v
                          ? 'border-foreground bg-foreground text-background'
                          : 'border-border bg-card text-foreground hover:border-foreground/40',
                      )}
                    >
                      {v ? 'True' : 'False'}
                    </button>
                  ))}
                </div>
                <Textarea
                  value={explanations[s.id] ?? ''}
                  onChange={e => setExplanations(prev => ({ ...prev, [s.id]: e.target.value }))}
                  placeholder="Why? (one sentence)"
                  rows={2}
                  className="text-sm resize-none"
                />
              </div>
            ))}
            <div className="flex gap-2">
              <Button onClick={submit} disabled={submitting || !allMarked || !allExplained}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Submit answers'}
              </Button>
              <Button variant="ghost" onClick={onExit}>Cancel</Button>
            </div>
            {!allMarked && (
              <p className="text-xs text-muted-foreground">Mark each statement True or False.</p>
            )}
            {allMarked && !allExplained && (
              <p className="text-xs text-muted-foreground">Add a brief reason for each (5+ characters).</p>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-foreground/30 bg-muted p-4 flex items-center justify-between">
              <span className="font-semibold flex items-center gap-2"><Check className="w-4 h-4" /> Graded</span>
              <span className="text-2xl font-bold tabular-nums">{score}/100</span>
            </div>
            {results.map((r, i) => (
              <div key={r.id} className="rounded-lg border border-border p-3 space-y-1">
                <div className="flex items-start gap-2">
                  {r.correct ? <Check className="w-4 h-4 mt-0.5 shrink-0" /> : <X className="w-4 h-4 mt-0.5 shrink-0" />}
                  <p className="text-sm font-serif flex-1" style={{ fontFamily: '"Source Serif 4", serif' }}>
                    <span className="font-semibold text-muted-foreground">{i + 1}. </span>{r.text}
                  </p>
                </div>
                <div className="text-xs text-muted-foreground pl-6">
                  Truth: <span className="font-semibold">{r.truth ? 'True' : 'False'}</span>
                  {' · '}You said: <span className="font-semibold">{r.your_mark ? 'True' : 'False'}</span>
                  {r.correct && <> · Reasoning: {r.explanation_score}/5</>}
                </div>
                <p className="text-xs italic pl-6 font-serif" style={{ fontFamily: '"Source Serif 4", serif' }}>{r.rationale}</p>
              </div>
            ))}
            <Button onClick={onExit} size="sm">Back to modes</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
