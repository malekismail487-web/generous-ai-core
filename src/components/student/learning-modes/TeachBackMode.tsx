import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, GraduationCap, Check } from 'lucide-react';
import { toast } from 'sonner';

interface TeachBackModeProps {
  subject: string;
  topic: string;
  onExit: () => void;
}

interface RubricScores {
  clarity: number;
  accuracy: number;
  completeness: number;
  examples: number;
}

export function TeachBackMode({ subject, topic, onExit }: TeachBackModeProps) {
  const [explanation, setExplanation] = useState('');
  const [loading, setLoading] = useState(false);
  const [scores, setScores] = useState<RubricScores | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string>('');

  const submit = async () => {
    if (explanation.trim().length < 40) {
      toast.error('Write at least a paragraph (40+ characters).');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('teach-back-grade', {
        body: { subject, topic, explanation: explanation.trim() },
      });
      if (error) throw error;
      const d = data as any;
      if (d?.error) throw new Error(d.error);
      setScores(d.scores);
      setTotal(d.total);
      setFeedback(d.feedback ?? '');
    } catch (e: any) {
      toast.error(`Could not grade: ${e.message ?? 'try again'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GraduationCap className="w-5 h-5" /> Teach-Back — {subject} · {topic}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 max-h-[calc(100vh-260px)] overflow-y-auto pb-24">
        {scores === null ? (
          <>
            <p className="text-sm text-muted-foreground">
              Explain this topic as if teaching a younger student. 2-4 paragraphs. You'll be graded on clarity, accuracy, completeness, and use of examples.
            </p>
            <Textarea
              value={explanation}
              onChange={e => setExplanation(e.target.value)}
              placeholder="Start with the main idea, then build up..."
              rows={10}
              disabled={loading}
              className="resize-y"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground tabular-nums">{explanation.length} chars</span>
              <div className="flex gap-2">
                <Button onClick={submit} disabled={loading || explanation.trim().length < 40}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Submit explanation'}
                </Button>
                <Button variant="ghost" onClick={onExit}>Cancel</Button>
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-foreground/30 bg-muted p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-semibold"><Check className="w-4 h-4" /> Graded</span>
                <span className="text-2xl font-bold tabular-nums">{total}/100</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {(['clarity','accuracy','completeness','examples'] as const).map(k => (
                  <div key={k} className="flex justify-between">
                    <span className="capitalize text-muted-foreground">{k}</span>
                    <span className="tabular-nums font-semibold">{scores[k]}/25</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-1">Feedback</h4>
              <p className="text-sm font-serif" style={{ fontFamily: '"Source Serif 4", serif' }}>{feedback}</p>
            </div>
            <Button onClick={onExit} size="sm">Back to modes</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
