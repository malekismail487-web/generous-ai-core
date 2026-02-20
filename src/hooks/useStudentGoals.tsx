import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface StudentGoal {
  id: string;
  title: string;
  target_count: number;
  current_count: number;
  goal_type: string;
  subject: string | null;
  week_start: string;
  completed: boolean;
  created_at: string;
}

export function useStudentGoals() {
  const { user } = useAuth();
  const [goals, setGoals] = useState<StudentGoal[]>([]);
  const [loading, setLoading] = useState(true);

  const hasFetchedOnce = useRef(false);

  const fetchGoals = useCallback(async () => {
    if (!user) return;
    // Only show loading spinner on first fetch, not on refetch
    if (!hasFetchedOnce.current) setLoading(true);

    // Get current week start (Sunday)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - dayOfWeek);
    weekStart.setHours(0, 0, 0, 0);
    const weekStartStr = weekStart.toISOString().split('T')[0];

    const { data } = await supabase
      .from('student_goals')
      .select('*')
      .eq('user_id', user.id)
      .gte('week_start', weekStartStr)
      .order('created_at', { ascending: false });

    setGoals((data || []) as StudentGoal[]);
    setLoading(false);
    hasFetchedOnce.current = true;
  }, [user]);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const addGoal = useCallback(async (title: string, targetCount: number, goalType: string = 'custom', subject?: string) => {
    if (!user) return null;

    const now = new Date();
    const dayOfWeek = now.getDay();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - dayOfWeek);
    const weekStartStr = weekStart.toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('student_goals')
      .insert({
        user_id: user.id,
        title,
        target_count: targetCount,
        goal_type: goalType,
        subject: subject || null,
        week_start: weekStartStr,
      })
      .select()
      .single();

    if (!error) {
      await fetchGoals();
      return data;
    }
    return null;
  }, [user, fetchGoals]);

  const incrementGoal = useCallback(async (goalId: string) => {
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;

    const newCount = Math.min(goal.current_count + 1, goal.target_count);
    const completed = newCount >= goal.target_count;

    await supabase
      .from('student_goals')
      .update({ current_count: newCount, completed })
      .eq('id', goalId);

    await fetchGoals();
  }, [goals, fetchGoals]);

  const deleteGoal = useCallback(async (goalId: string) => {
    await supabase.from('student_goals').delete().eq('id', goalId);
    await fetchGoals();
  }, [fetchGoals]);

  const completedCount = goals.filter(g => g.completed).length;
  const totalCount = goals.length;
  const overallProgress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return {
    goals,
    loading,
    addGoal,
    incrementGoal,
    deleteGoal,
    completedCount,
    totalCount,
    overallProgress,
    refetch: fetchGoals,
  };
}
