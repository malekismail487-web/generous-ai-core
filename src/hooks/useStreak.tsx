import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const MAX_STREAK = 288; // 9.5 months cap

export function useStreak() {
  const { user } = useAuth();
  const [currentStreak, setCurrentStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [loading, setLoading] = useState(true);

  const getLocalDateString = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };

  const getLocalDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  const updateStreak = useCallback(async () => {
    if (!user) return;

    const today = getLocalDateString();

    const { data: existing } = await supabase
      .from('daily_streaks')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!existing) {
      const { data } = await supabase
        .from('daily_streaks')
        .insert({ user_id: user.id, current_streak: 1, max_streak: 1, last_active_date: today })
        .select()
        .single();
      if (data) {
        setCurrentStreak(1);
        setMaxStreak(1);
      }
    } else {
      const lastActive = existing.last_active_date;

      if (lastActive === today) {
        setCurrentStreak(Math.min(existing.current_streak, MAX_STREAK));
        setMaxStreak(Math.min(existing.max_streak, MAX_STREAK));
      } else {
        const lastDate = getLocalDate(lastActive);
        const todayDate = getLocalDate(today);
        const diffMs = todayDate.getTime() - lastDate.getTime();
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

        let newStreak: number;
        if (diffDays === 1) {
          // User logged in the very next calendar day — streak continues
          newStreak = Math.min(existing.current_streak + 1, MAX_STREAK);
        } else {
          // Missed 24+ hours past midnight — reset to 1
          newStreak = 1;
        }

        const newMax = Math.min(Math.max(newStreak, existing.max_streak), MAX_STREAK);

        await supabase
          .from('daily_streaks')
          .update({ current_streak: newStreak, max_streak: newMax, last_active_date: today })
          .eq('user_id', user.id);

        setCurrentStreak(newStreak);
        setMaxStreak(newMax);
      }
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    updateStreak();
  }, [updateStreak]);

  const streakPercentage = Math.min((currentStreak / MAX_STREAK) * 100, 100);

  return { currentStreak, maxStreak, streakPercentage, loading, MAX_STREAK };
}
