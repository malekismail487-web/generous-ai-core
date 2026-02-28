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
  | 'page_visit'
  | 'content_time_spent'
  | 'question_asked'
  | 'explanation_request'
  | 'comprehension_signal';

export type ActivityCategory =
  | 'assessment'
  | 'learning'
  | 'content_consumption'
  | 'creation'
  | 'engagement'
  | 'general'
  | 'behavioral';

// Content modality types for behavioral tracking
export type ContentModality = 'visual' | 'logical' | 'verbal' | 'kinesthetic' | 'conceptual';

// Question type classification
export type QuestionType = 'why' | 'show_me' | 'how_relate' | 'real_example' | 'step_by_step' | 'general';

const BEHAVIOR_STORAGE_KEY = 'lumina_behavioral_data';

export interface BehavioralDataPoint {
  timestamp: number;
  type: 'time_spent' | 'question_type' | 'request_pattern' | 'comprehension' | 'content_choice';
  modality: ContentModality;
  subject?: string;
  weight: number; // how significant this signal is (0-3)
  details?: Record<string, unknown>;
}

export interface BehavioralProfile {
  dataPoints: BehavioralDataPoint[];
  totalInteractions: number;
  lastUpdated: number;
}

function getStoredBehavior(): BehavioralProfile {
  try {
    const raw = localStorage.getItem(BEHAVIOR_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { dataPoints: [], totalInteractions: 0, lastUpdated: Date.now() };
}

function storeBehavior(profile: BehavioralProfile) {
  try {
    // Keep last 500 data points to prevent localStorage bloat
    if (profile.dataPoints.length > 500) {
      profile.dataPoints = profile.dataPoints.slice(-500);
    }
    localStorage.setItem(BEHAVIOR_STORAGE_KEY, JSON.stringify(profile));
  } catch { /* ignore */ }
}

function addBehavioralPoint(point: BehavioralDataPoint) {
  const profile = getStoredBehavior();
  profile.dataPoints.push(point);
  profile.totalInteractions += 1;
  profile.lastUpdated = Date.now();
  storeBehavior(profile);
}

/**
 * Classify a user question into a learning modality signal.
 * Analyzes the TYPE of question, not the topic.
 */
function classifyQuestion(text: string): { modality: ContentModality; type: QuestionType } {
  const lower = text.toLowerCase();

  // Visual signals
  if (/\b(show|diagram|picture|image|draw|chart|graph|visuali[sz]e|map|flowchart|illustrat)\b/.test(lower)) {
    return { modality: 'visual', type: 'show_me' };
  }

  // Logical signals
  if (/\b(why does|how does .* work|step.?by.?step|logica?l|reason|prove|formula|cause|because|if.*then|derive|calculat)\b/.test(lower)) {
    return { modality: 'logical', type: 'why' };
  }

  // Kinesthetic signals
  if (/\b(real.?(life|world)|example|practic|hands.?on|experiment|try|build|make|create|appli|use this)\b/.test(lower)) {
    return { modality: 'kinesthetic', type: 'real_example' };
  }

  // Conceptual signals
  if (/\b(relat|connect|big picture|overview|how does .* fit|context|broader|system|framework|analogy)\b/.test(lower)) {
    return { modality: 'conceptual', type: 'how_relate' };
  }

  // Verbal signals (requests for more explanation/detail)
  if (/\b(explain|tell me|describe|elaborate|detail|story|narrat|what is|define|meaning)\b/.test(lower)) {
    return { modality: 'verbal', type: 'step_by_step' };
  }

  return { modality: 'verbal', type: 'general' };
}

/**
 * Classify an explicit request for explanation format
 */
function classifyExplicitRequest(text: string): ContentModality | null {
  const lower = text.toLowerCase();
  if (/\b(draw|diagram|chart|visual|picture|image|graph)\b/.test(lower)) return 'visual';
  if (/\b(step.?by.?step|logic|reason|proof|formula|systematic)\b/.test(lower)) return 'logical';
  if (/\b(real|example|practical|hands.?on|try|build|experiment)\b/.test(lower)) return 'kinesthetic';
  if (/\b(big picture|connect|relat|overview|analogy|framework)\b/.test(lower)) return 'conceptual';
  if (/\b(explain more|elaborate|tell me|discuss|talk about)\b/.test(lower)) return 'verbal';
  return null;
}

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

  // ============ BEHAVIORAL TRACKING METHODS ============

  /**
   * Track time spent on a specific content modality.
   * Call this when user finishes engaging with content.
   */
  const trackTimeOnContent = useCallback((modality: ContentModality, durationSeconds: number, subject?: string) => {
    if (durationSeconds < 5) return; // Ignore trivial interactions
    
    const weight = durationSeconds >= 300 ? 3 : durationSeconds >= 120 ? 2 : 1;
    
    addBehavioralPoint({
      timestamp: Date.now(),
      type: 'time_spent',
      modality,
      subject,
      weight,
      details: { durationSeconds },
    });

    trackActivity({
      activityType: 'content_time_spent',
      category: 'behavioral',
      subject,
      details: { modality, duration: durationSeconds },
      durationSeconds,
    });
  }, [trackActivity]);

  /**
   * Analyze and track a user's question to classify their thinking pattern.
   * Call this every time a user asks a question to the AI.
   */
  const trackQuestionAsked = useCallback((questionText: string, subject?: string) => {
    const { modality, type } = classifyQuestion(questionText);
    
    addBehavioralPoint({
      timestamp: Date.now(),
      type: 'question_type',
      modality,
      subject,
      weight: 1.5,
      details: { questionType: type, preview: questionText.slice(0, 100) },
    });

    trackActivity({
      activityType: 'question_asked',
      category: 'behavioral',
      subject,
      details: { modality, question_type: type },
    });
  }, [trackActivity]);

  /**
   * Track when a user explicitly requests a specific explanation format.
   * E.g., "Can you draw that?" or "Explain the steps logically"
   */
  const trackExplicitRequest = useCallback((requestText: string, subject?: string) => {
    const modality = classifyExplicitRequest(requestText);
    if (!modality) return;

    addBehavioralPoint({
      timestamp: Date.now(),
      type: 'request_pattern',
      modality,
      subject,
      weight: 2, // explicit requests are strong signals
      details: { preview: requestText.slice(0, 100) },
    });

    trackActivity({
      activityType: 'explanation_request',
      category: 'behavioral',
      subject,
      details: { modality },
    });
  }, [trackActivity]);

  /**
   * Track comprehension signal: user got a question right/wrong after a specific explanation type.
   * This correlates explanation format with understanding.
   */
  const trackComprehensionSignal = useCallback((params: {
    explanationModality: ContentModality;
    understood: boolean;
    subject?: string;
  }) => {
    addBehavioralPoint({
      timestamp: Date.now(),
      type: 'comprehension',
      modality: params.explanationModality,
      subject: params.subject,
      weight: params.understood ? 2.5 : -1.5, // positive for understanding, negative for misunderstanding
      details: { understood: params.understood },
    });

    trackActivity({
      activityType: 'comprehension_signal',
      category: 'behavioral',
      subject: params.subject,
      details: { modality: params.explanationModality, understood: params.understood },
    });
  }, [trackActivity]);

  /**
   * Track when user chooses a specific content type from multiple options.
   * E.g., clicking on diagram vs text explanation.
   */
  const trackContentChoice = useCallback((chosenModality: ContentModality, subject?: string) => {
    addBehavioralPoint({
      timestamp: Date.now(),
      type: 'content_choice',
      modality: chosenModality,
      subject,
      weight: 1.5,
    });
  }, []);

  // ============ CONVENIENCE METHODS (legacy support) ============

  const trackExamStarted = useCallback((subject: string, questionCount: number, difficulty: string) => {
    trackActivity({ activityType: 'exam_started', category: 'assessment', subject, details: { question_count: questionCount, difficulty } });
  }, [trackActivity]);

  const trackExamCompleted = useCallback((subject: string, score: number, total: number, difficulty: string, timeTaken: number) => {
    trackActivity({ activityType: 'exam_completed', category: 'assessment', subject, details: { score, total, percentage: Math.round((score / total) * 100), difficulty }, durationSeconds: timeTaken });
    // Also track comprehension: if score > 70%, the assessment format worked
    trackComprehensionSignal({ explanationModality: 'logical', understood: (score / total) >= 0.7, subject });
  }, [trackActivity, trackComprehensionSignal]);

  const trackLectureViewed = useCallback((subject: string, topic: string, durationSeconds: number) => {
    trackActivity({ activityType: 'lecture_viewed', category: 'content_consumption', subject, details: { topic }, durationSeconds });
    trackTimeOnContent('verbal', durationSeconds, subject);
  }, [trackActivity, trackTimeOnContent]);

  const trackPodcastListened = useCallback((fileName: string, completionPercent: number, durationSeconds: number) => {
    trackActivity({ activityType: 'podcast_listened', category: 'content_consumption', details: { file_name: fileName, completion_percent: completionPercent }, durationSeconds });
    trackTimeOnContent('verbal', durationSeconds);
  }, [trackActivity, trackTimeOnContent]);

  const trackStudyBuddyChat = useCallback((subject: string, messageCount: number) => {
    trackActivity({ activityType: 'study_buddy_chat', category: 'learning', subject, details: { message_count: messageCount } });
  }, [trackActivity]);

  const trackAITutorChat = useCallback((subject: string, messageCount: number) => {
    trackActivity({ activityType: 'ai_tutor_chat', category: 'learning', subject, details: { message_count: messageCount } });
  }, [trackActivity]);

  const trackMaterialViewed = useCallback((subject: string, topic: string, materialType: string) => {
    trackActivity({ activityType: 'material_viewed', category: 'content_consumption', subject, details: { topic, material_type: materialType } });
    // Classify material type into modality
    const modality: ContentModality = materialType.includes('video') ? 'visual' 
      : materialType.includes('pdf') || materialType.includes('doc') ? 'verbal' 
      : 'visual';
    trackTimeOnContent(modality, 60, subject); // estimate 1 min view
  }, [trackActivity, trackTimeOnContent]);

  const trackFocusSession = useCallback((durationSeconds: number, mode: string) => {
    trackActivity({ activityType: 'focus_session', category: 'engagement', details: { mode }, durationSeconds });
  }, [trackActivity]);

  const trackPageVisit = useCallback((page: string) => {
    trackActivity({ activityType: 'page_visit', category: 'general', details: { page } });
  }, [trackActivity]);

  return {
    trackActivity,
    // Behavioral tracking (new)
    trackTimeOnContent,
    trackQuestionAsked,
    trackExplicitRequest,
    trackComprehensionSignal,
    trackContentChoice,
    // Convenience methods (legacy)
    trackExamStarted,
    trackExamCompleted,
    trackLectureViewed,
    trackPodcastListened,
    trackStudyBuddyChat,
    trackAITutorChat,
    trackMaterialViewed,
    trackFocusSession,
    trackPageVisit,
    // Utilities
    getStoredBehavior,
  };
}

export { getStoredBehavior, classifyQuestion, classifyExplicitRequest };
