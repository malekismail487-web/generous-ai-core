import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { toast } from 'sonner';
import { Brain, AlertTriangle, Flame, Target } from 'lucide-react';

interface Nudge {
  id: string;
  message: string;
  messageAr: string;
  icon: typeof Brain;
  type: 'gap' | 'streak' | 'inactive' | 'goal';
}

export function SmartNudges() {
  const { user } = useAuth();
  const { t } = useThemeLanguage();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!user || shown) return;
    const timer = setTimeout(() => generateNudges(), 2000);
    return () => clearTimeout(timer);
  }, [user, shown]);

  const generateNudges = async () => {
    if (!user) return;
    setShown(true);

    try {
      // Check for critical knowledge gaps
      const { data: gaps } = await supabase
        .from('knowledge_gaps')
        .select('subject, topic, severity')
        .eq('user_id', user.id)
        .eq('resolved', false)
        .eq('severity', 'critical')
        .limit(1);

      if (gaps && gaps.length > 0) {
        const gap = gaps[0];
        toast.info(
          t(
            `🧠 Lumina noticed you're struggling with ${gap.topic} in ${gap.subject}. Want to review it?`,
            `🧠 لاحظت لومينا أنك تواجه صعوبة في ${gap.topic} في ${gap.subject}. هل تريد مراجعته؟`
          ),
          { duration: 8000 }
        );
        return;
      }

      // Check for subjects not practiced recently
      const { data: profiles } = await supabase
        .from('student_learning_profiles')
        .select('subject, updated_at, recent_accuracy')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: true })
        .limit(1);

      if (profiles && profiles.length > 0) {
        const oldest = profiles[0];
        const daysSince = Math.floor((Date.now() - new Date(oldest.updated_at).getTime()) / (1000 * 60 * 60 * 24));
        if (daysSince >= 3) {
          toast.info(
            t(
              `📚 You haven't practiced ${oldest.subject} in ${daysSince} days. Quick review?`,
              `📚 لم تتدرب على ${oldest.subject} منذ ${daysSince} أيام. مراجعة سريعة؟`
            ),
            { duration: 6000 }
          );
          return;
        }

        // Check for low accuracy subjects
        if (oldest.recent_accuracy !== null && oldest.recent_accuracy < 60) {
          toast.info(
            t(
              `📉 Your ${oldest.subject} accuracy is ${oldest.recent_accuracy}%. Let's work on improving it!`,
              `📉 دقتك في ${oldest.subject} هي ${oldest.recent_accuracy}%. لنعمل على تحسينها!`
            ),
            { duration: 6000 }
          );
        }
      }

      // Check incomplete goals
      const { data: goals } = await supabase
        .from('student_goals')
        .select('title, current_count, target_count')
        .eq('user_id', user.id)
        .eq('completed', false)
        .limit(1);

      if (goals && goals.length > 0) {
        const goal = goals[0];
        const pct = Math.round((goal.current_count / goal.target_count) * 100);
        if (pct > 50) {
          toast.info(
            t(
              `🎯 You're ${pct}% through "${goal.title}"! Almost there!`,
              `🎯 أنت عند ${pct}% من "${goal.title}"! أوشكت على الانتهاء!`
            ),
            { duration: 6000 }
          );
        }
      }
    } catch {
      // Non-critical, ignore
    }
  };

  return null; // This component only shows toasts
}
