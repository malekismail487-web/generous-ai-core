import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Auto-tracks student goals by checking actual activity counts in the database.
 * Maps goal_type to real DB tables and updates current_count accordingly.
 */
export function useGoalAutoTracker(goals: { id: string; goal_type: string; current_count: number; target_count: number; completed: boolean; created_at: string }[], refetch: () => void) {
  const { user } = useAuth();

  const syncGoals = useCallback(async () => {
    if (!user || goals.length === 0) return;

    const goalCreatedDates = new Map(goals.map(g => [g.id, g.created_at]));

    for (const goal of goals) {
      if (goal.completed) continue;

      let actualCount = 0;
      const createdAt = goalCreatedDates.get(goal.id) || goal.created_at;

      try {
        switch (goal.goal_type) {
          case 'exams': {
            const { count } = await supabase
              .from('exam_submissions')
              .select('*', { count: 'exact', head: true })
              .eq('student_id', user.id)
              .not('submitted_at', 'is', null)
              .gte('started_at', createdAt);
            actualCount = count || 0;
            break;
          }
          case 'podcasts': {
            const { count } = await supabase
              .from('podcast_generations')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', user.id)
              .gte('created_at', createdAt);
            actualCount = count || 0;
            break;
          }
          case 'notes': {
            const { count } = await supabase
              .from('notes')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', user.id)
              .gte('created_at', createdAt);
            actualCount = count || 0;
            break;
          }
          case 'assignments': {
            const { count } = await supabase
              .from('assignment_submissions')
              .select('*', { count: 'exact', head: true })
              .eq('student_id', user.id)
              .gte('submitted_at', createdAt);
            actualCount = count || 0;
            break;
          }
          case 'materials': {
            const { count } = await supabase
              .from('material_views')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', user.id)
              .gte('seen_at', createdAt);
            actualCount = count || 0;
            break;
          }
          case 'subjects': {
            const { count } = await supabase
              .from('student_learning_profiles')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', user.id)
              .gte('updated_at', createdAt);
            actualCount = count || 0;
            break;
          }
          case 'tutor': {
            const { data: convos } = await supabase
              .from('conversations')
              .select('id')
              .eq('user_id', user.id)
              .gte('created_at', createdAt);
            actualCount = convos?.length || 0;
            break;
          }
          case 'focus': {
            // Focus sessions are tracked in localStorage, read from there
            try {
              const raw = localStorage.getItem('focus-timer-stats');
              if (raw) {
                const stats = JSON.parse(raw);
                actualCount = stats.sessionsCompleted || 0;
              }
            } catch {
              actualCount = 0;
            }
            break;
          }
          case 'flashcards': {
            // Flashcards don't have a dedicated DB table, use student_answer_history with source
            const { count } = await supabase
              .from('student_answer_history')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', user.id)
              .eq('source', 'flashcard')
              .gte('created_at', createdAt);
            actualCount = count || 0;
            break;
          }
          default:
            continue;
        }

        // Cap at target
        const cappedCount = Math.min(actualCount, goal.target_count);
        const isCompleted = cappedCount >= goal.target_count;

        // Only update if changed
        if (cappedCount !== goal.current_count || isCompleted !== goal.completed) {
          await supabase
            .from('student_goals')
            .update({ current_count: cappedCount, completed: isCompleted })
            .eq('id', goal.id);
        }
      } catch (err) {
        console.error(`Goal auto-track error for ${goal.goal_type}:`, err);
      }
    }

    refetch();
  }, [user, goals, refetch]);

  // Run sync on mount and every 30 seconds
  useEffect(() => {
    syncGoals();
    const interval = setInterval(syncGoals, 30000);
    return () => clearInterval(interval);
  }, [syncGoals]);
}
