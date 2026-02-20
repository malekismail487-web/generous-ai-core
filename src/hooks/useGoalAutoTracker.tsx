import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Auto-tracks student goals by checking actual activity counts in the database.
 * Uses a ref to avoid infinite re-render loops.
 */
export function useGoalAutoTracker(goals: { id: string; goal_type: string; current_count: number; target_count: number; completed: boolean; created_at: string }[], refetch: () => void) {
  const { user } = useAuth();
  const goalsRef = useRef(goals);
  const refetchRef = useRef(refetch);
  const isSyncing = useRef(false);

  // Keep refs updated without triggering effects
  useEffect(() => { goalsRef.current = goals; }, [goals]);
  useEffect(() => { refetchRef.current = refetch; }, [refetch]);

  const syncGoals = useCallback(async () => {
    if (!user || goalsRef.current.length === 0 || isSyncing.current) return;
    isSyncing.current = true;

    let anyUpdated = false;

    for (const goal of goalsRef.current) {
      if (goal.completed) continue;

      let actualCount = 0;
      const createdAt = goal.created_at;

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

        const cappedCount = Math.min(actualCount, goal.target_count);
        const isCompleted = cappedCount >= goal.target_count;

        if (cappedCount !== goal.current_count || isCompleted !== goal.completed) {
          await supabase
            .from('student_goals')
            .update({ current_count: cappedCount, completed: isCompleted })
            .eq('id', goal.id);
          anyUpdated = true;
        }
      } catch (err) {
        console.error(`Goal auto-track error for ${goal.goal_type}:`, err);
      }
    }

    isSyncing.current = false;
    if (anyUpdated) {
      refetchRef.current();
    }
  }, [user]); // Only depends on user, reads goals from ref

  // Run sync on mount and every 60 seconds
  useEffect(() => {
    syncGoals();
    const interval = setInterval(syncGoals, 60000);
    return () => clearInterval(interval);
  }, [syncGoals]);
}
