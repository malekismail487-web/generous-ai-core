import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useThemeLanguage } from '@/hooks/useThemeLanguage';
import { toast } from 'sonner';


export function SmartNudges() {
  const { user } = useAuth();
  const { t } = useThemeLanguage();

  useEffect(() => {
    if (!user) return;
    const key = `smart-nudges-${new Date().toDateString()}`;
    if (localStorage.getItem(key)) return;
    const timer = setTimeout(() => {
      localStorage.setItem(key, 'shown');
      generateNudges();
    }, 2000);
    return () => clearTimeout(timer);
  }, [user]);

  const generateNudges = async () => {
    if (!user) return;

    // Track which nudge index to show today (rotate daily)
    const rotationKey = `smart-nudge-rotation-${user.id}`;
    const lastRotation = parseInt(localStorage.getItem(rotationKey) || '0', 10);
    const nudgeIndex = (lastRotation + 1) % 4; // 4 nudge types
    localStorage.setItem(rotationKey, String(nudgeIndex));

    try {
      // Nudge type 0: Critical knowledge gaps
      if (nudgeIndex === 0) {
        const { data: gaps } = await supabase
          .from('knowledge_gaps')
          .select('subject, topic, severity')
          .eq('user_id', user.id)
          .eq('resolved', false)
          .eq('severity', 'critical')
          .limit(3);

        if (gaps && gaps.length > 0) {
          // Pick a random gap instead of always the first
          const gap = gaps[Math.floor(Math.random() * gaps.length)];
          toast.info(
            t(
              `🧠 Lumina noticed you're struggling with ${gap.topic} in ${gap.subject}. Want to review it?`,
              `🧠 لاحظت لومينا أنك تواجه صعوبة في ${gap.topic} في ${gap.subject}. هل تريد مراجعته؟`
            ),
            { duration: 8000 }
          );
          return;
        }
      }

      // Nudge type 1: Low accuracy subjects (only if actually practiced enough)
      if (nudgeIndex === 1) {
        const { data: lowAccuracy } = await supabase
          .from('student_learning_profiles')
          .select('subject, recent_accuracy, total_questions_answered')
          .eq('user_id', user.id)
          .lt('recent_accuracy', 60)
          .gt('total_questions_answered', 5) // Only nudge if they've done enough questions
          .limit(3);

        if (lowAccuracy && lowAccuracy.length > 0) {
          const pick = lowAccuracy[Math.floor(Math.random() * lowAccuracy.length)];
          toast.info(
            t(
              `📉 Your ${pick.subject} accuracy is ${pick.recent_accuracy}%. Let's work on improving it!`,
              `📉 دقتك في ${pick.subject} هي ${pick.recent_accuracy}%. لنعمل على تحسينها!`
            ),
            { duration: 6000 }
          );
          return;
        }
      }

      // Nudge type 2: Incomplete goals progress
      if (nudgeIndex === 2) {
        const { data: goals } = await supabase
          .from('student_goals')
          .select('title, current_count, target_count')
          .eq('user_id', user.id)
          .eq('completed', false)
          .limit(3);

        if (goals && goals.length > 0) {
          const goal = goals[Math.floor(Math.random() * goals.length)];
          const pct = Math.round((goal.current_count / goal.target_count) * 100);
          if (pct > 30) {
            toast.info(
              t(
                `🎯 You're ${pct}% through "${goal.title}"! Keep going!`,
                `🎯 أنت عند ${pct}% من "${goal.title}"! استمر!`
              ),
              { duration: 6000 }
            );
            return;
          }
        }
      }

      // Nudge type 3: Stale subjects (only if recent enough to be relevant, max 14 days)
      if (nudgeIndex === 3) {
        const { data: profiles } = await supabase
          .from('student_learning_profiles')
          .select('subject, updated_at, total_questions_answered')
          .eq('user_id', user.id)
          .gt('total_questions_answered', 3) // Must have meaningful activity
          .order('updated_at', { ascending: true })
          .limit(3);

        if (profiles && profiles.length > 0) {
          // Filter to subjects inactive 3-30 days (not absurdly old stale data)
          const now = Date.now();
          const relevant = profiles.filter(p => {
            const days = Math.floor((now - new Date(p.updated_at).getTime()) / (1000 * 60 * 60 * 24));
            return days >= 3 && days <= 30;
          });

          if (relevant.length > 0) {
            const pick = relevant[Math.floor(Math.random() * relevant.length)];
            const daysSince = Math.floor((now - new Date(pick.updated_at).getTime()) / (1000 * 60 * 60 * 24));
            toast.info(
              t(
                `📚 You haven't practiced ${pick.subject} in ${daysSince} days. Quick review?`,
                `📚 لم تتدرب على ${pick.subject} منذ ${daysSince} أيام. مراجعة سريعة؟`
              ),
              { duration: 6000 }
            );
            return;
          }
        }
      }
    } catch {
      // Non-critical, ignore
    }
  };

  return null; // This component only shows toasts
}
