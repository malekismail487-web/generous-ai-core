import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { Trophy, Medal, Flame, Target, Brain, Loader2, Crown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LeaderboardEntry {
  id: string;
  name: string;
  streak: number;
  maxStreak: number;
  questionsAnswered: number;
  correctAnswers: number;
  goalsCompleted: number;
  score: number;
}

export function Leaderboard() {
  const { user } = useAuth();
  const { t } = useThemeLanguage();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  const fetchLeaderboard = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-leaderboard`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
        }
      );

      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setEntries(data.leaderboard || []);
      setCurrentUserId(data.currentUserId);
    } catch (e) {
      console.error('Leaderboard error:', e);
    } finally {
      setLoading(false);
    }
  };

  const getRankIcon = (index: number) => {
    if (index === 0) return <Crown className="w-5 h-5 text-yellow-500" />;
    if (index === 1) return <Medal className="w-5 h-5 text-gray-400" />;
    if (index === 2) return <Medal className="w-5 h-5 text-amber-600" />;
    return <span className="w-5 h-5 flex items-center justify-center text-xs font-bold text-muted-foreground">#{index + 1}</span>;
  };

  const getRankBg = (index: number) => {
    if (index === 0) return 'bg-yellow-500/10 border-yellow-500/30';
    if (index === 1) return 'bg-gray-400/10 border-gray-400/30';
    if (index === 2) return 'bg-amber-600/10 border-amber-600/30';
    return 'bg-card border-border/50';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const currentUserRank = entries.findIndex(e => e.id === currentUserId);

  return (
    <div className="min-h-0 h-[calc(100vh-120px)] overflow-y-auto pt-16 pb-24">
      <div className="max-w-lg mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-yellow-400 to-amber-600 mb-3 shadow-lg">
            <Trophy className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-xl font-bold">{t('School Leaderboard', 'لوحة المتصدرين')}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t('Rankings based on streaks, quizzes & goals', 'التصنيف بناءً على السلسلة والاختبارات والأهداف')}
          </p>
          {currentUserRank >= 0 && (
            <div className="inline-flex items-center gap-2 mt-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
              <span className="text-xs font-medium text-primary">
                {t(`Your Rank: #${currentUserRank + 1}`, `ترتيبك: #${currentUserRank + 1}`)}
              </span>
            </div>
          )}
        </div>

        {entries.length === 0 ? (
          <div className="text-center py-12 bg-card rounded-2xl border border-border/50">
            <Trophy className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
            <p className="font-medium">{t('No rankings yet', 'لا يوجد تصنيف بعد')}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {t('Start studying to appear on the leaderboard!', 'ابدأ الدراسة للظهور على لوحة المتصدرين!')}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry, index) => {
              const isCurrentUser = entry.id === currentUserId;
              const accuracy = entry.questionsAnswered > 0
                ? Math.round((entry.correctAnswers / entry.questionsAnswered) * 100)
                : 0;

              return (
                <div
                  key={entry.id}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border transition-all",
                    getRankBg(index),
                    isCurrentUser && "ring-2 ring-primary/40"
                  )}
                >
                  {/* Rank */}
                  <div className="flex-shrink-0">{getRankIcon(index)}</div>

                  {/* Avatar */}
                  <div className={cn(
                    "w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0",
                    index === 0 ? "bg-gradient-to-br from-yellow-400 to-amber-600"
                      : index === 1 ? "bg-gradient-to-br from-gray-300 to-gray-500"
                      : index === 2 ? "bg-gradient-to-br from-amber-500 to-amber-700"
                      : "bg-gradient-to-br from-primary/60 to-primary"
                  )}>
                    {entry.name.charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className={cn("font-semibold text-sm truncate", isCurrentUser && "text-primary")}>
                      {entry.name} {isCurrentUser && t('(You)', '(أنت)')}
                    </p>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-0.5">
                        <Flame className="w-3 h-3 text-orange-500" /> {entry.streak}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <Brain className="w-3 h-3 text-blue-500" /> {accuracy}%
                      </span>
                      <span className="flex items-center gap-0.5">
                        <Target className="w-3 h-3 text-green-500" /> {entry.goalsCompleted}
                      </span>
                    </div>
                  </div>

                  {/* Score */}
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-bold">{entry.score}</p>
                    <p className="text-[10px] text-muted-foreground">{t('pts', 'نقاط')}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
