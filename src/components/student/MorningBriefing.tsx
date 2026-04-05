import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { Sparkles, ChevronRight, X } from 'lucide-react';
import { LuminaLogo } from '@/components/LuminaLogo';

interface BriefingItem {
  emoji: string;
  text: string;
}

export function MorningBriefing({ onNavigate }: { onNavigate: (action: string & {}) => void }) {
  const { user } = useAuth();
  const { t } = useThemeLanguage();
  const [items, setItems] = useState<BriefingItem[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    // Only show once per day
    const key = `briefing-${new Date().toDateString()}`;
    if (sessionStorage.getItem(key)) {
      setLoading(false);
      return;
    }
    generateBriefing();
  }, [user]);

  const generateBriefing = async () => {
    if (!user) return;
    const briefing: BriefingItem[] = [];

    try {
      // Check streak
      const { data: streak } = await supabase
        .from('daily_streaks')
        .select('current_streak')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (streak) {
        briefing.push({
          emoji: '🔥',
          text: t(
            `${streak.current_streak}-day streak! Keep it going!`,
            `سلسلة ${streak.current_streak} يوم! استمر!`
          ),
        });
      }

      // Check knowledge gaps
      const { data: gaps } = await supabase
        .from('knowledge_gaps')
        .select('subject, topic')
        .eq('user_id', user.id)
        .eq('resolved', false)
        .in('severity', ['critical', 'moderate'])
        .limit(2);

      if (gaps && gaps.length > 0) {
        briefing.push({
          emoji: '🎯',
          text: t(
            `Focus on: ${gaps.map(g => g.topic).join(', ')}`,
            `ركز على: ${gaps.map(g => g.topic).join('، ')}`
          ),
        });
      }

      // Check weak subjects
      const { data: weakProfiles } = await supabase
        .from('student_learning_profiles')
        .select('subject, recent_accuracy')
        .eq('user_id', user.id)
        .lt('recent_accuracy', 60)
        .limit(1);

      if (weakProfiles && weakProfiles.length > 0) {
        briefing.push({
          emoji: '📈',
          text: t(
            `${weakProfiles[0].subject} needs attention (${weakProfiles[0].recent_accuracy}% accuracy)`,
            `${weakProfiles[0].subject} يحتاج اهتمام (${weakProfiles[0].recent_accuracy}% دقة)`
          ),
        });
      }

      // Check incomplete goals
      const { data: goals } = await supabase
        .from('student_goals')
        .select('title')
        .eq('user_id', user.id)
        .eq('completed', false)
        .limit(1);

      if (goals && goals.length > 0) {
        briefing.push({
          emoji: '✅',
          text: t(
            `Pending goal: "${goals[0].title}"`,
            `هدف معلق: "${goals[0].title}"`
          ),
        });
      }

      if (briefing.length === 0) {
        briefing.push({
          emoji: '✨',
          text: t("You're all caught up! Explore something new today.", "أنت مستعد! اكتشف شيئًا جديدًا اليوم."),
        });
      }
    } catch {
      briefing.push({
        emoji: '✨',
        text: t("Ready to learn something amazing today!", "مستعد لتعلم شيء مذهل اليوم!"),
      });
    }

    setItems(briefing);
    setLoading(false);
    sessionStorage.setItem(`briefing-${new Date().toDateString()}`, 'shown');
  };

  if (dismissed || loading || items.length === 0) return null;

  return (
    <div className="mx-3 mb-4 rounded-2xl border border-border/40 bg-card/80 backdrop-blur-sm p-4 animate-fade-in relative">
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-2 right-2 p-1 rounded-lg hover:bg-muted/50 text-muted-foreground"
      >
        <X size={14} />
      </button>
      <div className="flex items-center gap-2 mb-3">
        <LuminaLogo size={20} />
        <span className="text-sm font-bold text-foreground">
          {t("Lumina's Daily Brief", "ملخص لومينا اليومي")}
        </span>
        <Sparkles size={14} className="text-primary" />
      </div>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-2 text-sm">
            <span>{item.emoji}</span>
            <span className="text-muted-foreground">{item.text}</span>
          </div>
        ))}
      </div>
      <button
        onClick={() => onNavigate('studybuddy')}
        className="mt-3 flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        {t('Talk to Lumina', 'تحدث مع لومينا')}
        <ChevronRight size={12} />
      </button>
    </div>
  );
}
