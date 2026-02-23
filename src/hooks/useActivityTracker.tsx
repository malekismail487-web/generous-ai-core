import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type ActivityType =
  | 'quiz_answer'
  | 'exam_started'
  | 'exam_completed'
  | 'lecture_viewed'
  | 'podcast_listened'
  | 'study_buddy_chat'
  | 'ai_tutor_chat'
  | 'material_viewed'
  | 'flashcard_studied'
  | 'note_created'
  | 'note_edited'
  | 'focus_session'
  | 'goal_created'
  | 'goal_completed'
  | 'subject_explored'
  | 'assignment_submitted'
  | 'iq_test_completed'
  | 'login'
  | 'page_visit';

export type ActivityCategory =
  | 'assessment'
  | 'learning'
  | 'content_consumption'
  | 'creation'
  | 'engagement'
  | 'general';

export function useActivityTracker() {
  const { user } = useAuth();

  const trackActivity = useCallback(async (params: {
    activityType: ActivityType;
    category: ActivityCategory;
    subject?: string;
    details?: Record<string, string | number | boolean | null>;
    durationSeconds?: number;
  }) => {
    if (!user) return;

    try {
      await supabase.from('user_activity_log').insert([{
        user_id: user.id,
        activity_type: params.activityType,
        category: params.category,
        subject: params.subject || null,
        details_json: params.details || {},
        duration_seconds: params.durationSeconds || 0,
      }]);
    } catch (err) {
      console.error('Activity tracking error:', err);
    }
  }, [user]);

  // Convenience methods
  const trackExamStarted = useCallback((subject: string, questionCount: number, difficulty: string) => {
    trackActivity({
      activityType: 'exam_started',
      category: 'assessment',
      subject,
      details: { question_count: questionCount, difficulty },
    });
  }, [trackActivity]);

  const trackExamCompleted = useCallback((subject: string, score: number, total: number, difficulty: string, timeTaken: number) => {
    trackActivity({
      activityType: 'exam_completed',
      category: 'assessment',
      subject,
      details: { score, total, percentage: Math.round((score / total) * 100), difficulty },
      durationSeconds: timeTaken,
    });
  }, [trackActivity]);

  const trackLectureViewed = useCallback((subject: string, topic: string, durationSeconds: number) => {
    trackActivity({
      activityType: 'lecture_viewed',
      category: 'content_consumption',
      subject,
      details: { topic },
      durationSeconds,
    });
  }, [trackActivity]);

  const trackPodcastListened = useCallback((fileName: string, completionPercent: number, durationSeconds: number) => {
    trackActivity({
      activityType: 'podcast_listened',
      category: 'content_consumption',
      details: { file_name: fileName, completion_percent: completionPercent },
      durationSeconds,
    });
  }, [trackActivity]);

  const trackStudyBuddyChat = useCallback((subject: string, messageCount: number) => {
    trackActivity({
      activityType: 'study_buddy_chat',
      category: 'learning',
      subject,
      details: { message_count: messageCount },
    });
  }, [trackActivity]);

  const trackMaterialViewed = useCallback((subject: string, topic: string, materialType: string) => {
    trackActivity({
      activityType: 'material_viewed',
      category: 'content_consumption',
      subject,
      details: { topic, material_type: materialType },
    });
  }, [trackActivity]);

  const trackFocusSession = useCallback((durationSeconds: number, mode: string) => {
    trackActivity({
      activityType: 'focus_session',
      category: 'engagement',
      details: { mode },
      durationSeconds,
    });
  }, [trackActivity]);

  const trackPageVisit = useCallback((page: string) => {
    trackActivity({
      activityType: 'page_visit',
      category: 'general',
      details: { page },
    });
  }, [trackActivity]);

  return {
    trackActivity,
    trackExamStarted,
    trackExamCompleted,
    trackLectureViewed,
    trackPodcastListened,
    trackStudyBuddyChat,
    trackMaterialViewed,
    trackFocusSession,
    trackPageVisit,
  };
}
