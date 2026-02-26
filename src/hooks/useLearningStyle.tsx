import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface LearningStyleProfile {
  visual_score: number;
  logical_score: number;
  verbal_score: number;
  kinesthetic_score: number;
  conceptual_score: number;
  dominant_style: string;
  secondary_style: string | null;
  total_interactions: number;
}

const STYLE_LABELS: Record<string, string> = {
  visual: '🎨 Visual',
  logical: '🧠 Logical',
  verbal: '💬 Verbal',
  kinesthetic: '🖐️ Kinesthetic',
  conceptual: '💡 Conceptual',
  balanced: '⚖️ Balanced',
};

export function useLearningStyle() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<LearningStyleProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    
    const { data } = await supabase
      .from('learning_style_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (data) {
      setProfile({
        visual_score: Number(data.visual_score),
        logical_score: Number(data.logical_score),
        verbal_score: Number(data.verbal_score),
        kinesthetic_score: Number(data.kinesthetic_score),
        conceptual_score: Number(data.conceptual_score),
        dominant_style: data.dominant_style,
        secondary_style: data.secondary_style,
        total_interactions: data.total_interactions,
      });
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  /**
   * Recalculate learning style from activity logs.
   * Called periodically or after significant activity.
   */
  const recalculate = useCallback(async () => {
    if (!user) return;

    // Fetch recent activity
    const { data: activities } = await supabase
      .from('user_activity_log')
      .select('activity_type, category, details_json, duration_seconds')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200);

    if (!activities || activities.length === 0) return;

    let visual = 0, logical = 0, verbal = 0, kinesthetic = 0, conceptual = 0;
    let total = activities.length;

    for (const a of activities) {
      switch (a.activity_type) {
        case 'material_viewed':
        case 'lecture_viewed':
          visual += 2;
          conceptual += 1;
          break;
        case 'podcast_listened':
          verbal += 3;
          break;
        case 'study_buddy_chat':
        case 'ai_tutor_chat':
          verbal += 2;
          logical += 1;
          break;
        case 'exam_completed':
        case 'quiz_answer':
          kinesthetic += 2;
          logical += 2;
          break;
        case 'exam_started':
          kinesthetic += 1;
          logical += 1;
          break;
        case 'flashcard_studied':
          visual += 1;
          kinesthetic += 1;
          break;
        case 'note_created':
        case 'note_edited':
          verbal += 1;
          conceptual += 2;
          break;
        case 'focus_session':
          logical += 1;
          kinesthetic += 1;
          break;
        case 'subject_explored':
          conceptual += 2;
          visual += 1;
          break;
        case 'page_visit': {
          // Infer learning style from which pages are visited
          const page = (a.details_json as any)?.page;
          if (page === 'subjects' || page === 'flashcards') { visual += 1; }
          else if (page === 'examination' || page === 'sat') { logical += 1; kinesthetic += 1; }
          else if (page === 'chat' || page === 'studybuddy' || page === 'podcasts') { verbal += 1; }
          else if (page === 'notes' || page === 'aiplans') { conceptual += 1; }
          else if (page === 'focustimer' || page === 'goals') { kinesthetic += 1; }
          else { conceptual += 0.5; verbal += 0.5; }
          break;
        }
        case 'assignment_submitted':
          kinesthetic += 2;
          logical += 1;
          break;
        case 'goal_created':
        case 'goal_completed':
          kinesthetic += 1;
          conceptual += 1;
          break;
        case 'iq_test_completed':
          logical += 3;
          break;
        default:
          // Give small weight to any interaction
          verbal += 0.25;
          conceptual += 0.25;
          break;
      }
    }

    // Normalize to percentages
    const totalWeight = visual + logical + verbal + kinesthetic + conceptual || 1;
    const scores = {
      visual: Math.round((visual / totalWeight) * 100),
      logical: Math.round((logical / totalWeight) * 100),
      verbal: Math.round((verbal / totalWeight) * 100),
      kinesthetic: Math.round((kinesthetic / totalWeight) * 100),
      conceptual: Math.round((conceptual / totalWeight) * 100),
    };

    // Find dominant and secondary
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const dominant = sorted[0][1] > 25 ? sorted[0][0] : 'balanced';
    const secondary = sorted[1][1] > 20 ? sorted[1][0] : null;

    // Upsert
    await supabase
      .from('learning_style_profiles')
      .upsert({
        user_id: user.id,
        visual_score: scores.visual,
        logical_score: scores.logical,
        verbal_score: scores.verbal,
        kinesthetic_score: scores.kinesthetic,
        conceptual_score: scores.conceptual,
        dominant_style: dominant,
        secondary_style: secondary,
        total_interactions: total,
        last_analyzed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    await fetchProfile();
  }, [user, fetchProfile]);

  /**
   * Generate a prompt modifier for AI based on learning style
   */
  const getLearningStylePrompt = useCallback((): string => {
    if (!profile || profile.dominant_style === 'balanced') {
      return 'Use a balanced teaching approach mixing visual descriptions, logical reasoning, verbal explanations, and practical examples.';
    }

    const prompts: Record<string, string> = {
      visual: 'This student is a VISUAL learner. Use diagrams, charts, color-coded content, spatial arrangements, and vivid imagery. Format content with clear visual hierarchy, bullet points, and structured layouts.',
      logical: 'This student is a LOGICAL learner. Use step-by-step proofs, reasoning frameworks, cause-and-effect chains, and systematic breakdowns. Show WHY things work, not just WHAT they are.',
      verbal: 'This student is a VERBAL learner. Use rich explanations, discussions, analogies, storytelling, and word-based mnemonics. Explain concepts conversationally as if teaching a friend.',
      kinesthetic: 'This student is a KINESTHETIC learner. Focus on hands-on problems, interactive exercises, real-world applications, and learn-by-doing approaches. Give them problems to solve immediately after each concept.',
      conceptual: 'This student is a CONCEPTUAL learner. Start with the big picture, show how concepts connect to each other, use mind-maps and relationship diagrams. Help them see the forest before the trees.',
    };

    let prompt = prompts[profile.dominant_style] || prompts.visual;
    
    if (profile.secondary_style && profile.secondary_style !== profile.dominant_style) {
      prompt += ` Secondary style: ${profile.secondary_style} — incorporate elements of this style as well.`;
    }

    return prompt;
  }, [profile]);

  return {
    profile,
    loading,
    recalculate,
    getLearningStylePrompt,
    STYLE_LABELS,
  };
}
