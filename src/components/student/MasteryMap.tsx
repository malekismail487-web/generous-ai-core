import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { getWeakestTopics, getDueReviews, type WeakTopic, type DueReview } from '@/lib/mastery';
import { Card } from '@/components/ui/card';
import { Brain, Clock, Loader2, Target } from 'lucide-react';
import { cn } from '@/lib/utils';

function masteryColor(score: number): string {
  if (score < 0.35) return 'bg-foreground/10 text-foreground';
  if (score < 0.7) return 'bg-foreground/20 text-foreground';
  return 'bg-foreground/40 text-background';
}

export function MasteryMap() {
  const { user } = useAuth();
  const [weak, setWeak] = useState<WeakTopic[]>([]);
  const [due, setDue] = useState<DueReview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [w, d] = await Promise.all([
        getWeakestTopics(user.id, null, 12),
        getDueReviews(user.id, 8),
      ]);
      if (!cancelled) {
        setWeak(w);
        setDue(d);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (loading) {
    return (
      <Card className="p-6 flex items-center gap-3 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading your mastery map…</span>
      </Card>
    );
  }

  if (!weak.length && !due.length) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-1">
          <Brain className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-semibold">Mastery Map</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Complete a few questions to start mapping your concept mastery across subjects.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-5 space-y-5">
      <div className="flex items-center gap-2">
        <Brain className="w-4 h-4 text-muted-foreground" />
        <h3 className="font-semibold">Mastery Map</h3>
      </div>

      {weak.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <Target className="w-3.5 h-3.5" />
            Weakest concepts
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {weak.map((w) => (
              <div
                key={`${w.subject}-${w.topic}`}
                className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{w.topic}</div>
                  <div className="text-xs text-muted-foreground truncate">{w.subject}</div>
                </div>
                <span
                  className={cn(
                    'text-xs px-2 py-1 rounded-full font-medium',
                    masteryColor(Number(w.mastery_score) || 0),
                  )}
                >
                  {Math.round((Number(w.mastery_score) || 0) * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {due.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            Due for review
          </div>
          <ul className="space-y-1.5">
            {due.map((d) => (
              <li
                key={`${d.subject}-${d.topic}`}
                className="flex items-center justify-between text-sm border-l-2 border-foreground/30 pl-3"
              >
                <span className="truncate">
                  <span className="font-medium">{d.topic}</span>
                  <span className="text-muted-foreground"> · {d.subject}</span>
                </span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {d.overdue_hours < 24
                    ? `${Math.max(0, d.overdue_hours).toFixed(0)}h overdue`
                    : `${(d.overdue_hours / 24).toFixed(0)}d overdue`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
