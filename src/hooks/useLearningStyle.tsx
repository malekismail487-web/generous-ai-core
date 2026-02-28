import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getStoredBehavior, type BehavioralDataPoint, type ContentModality } from '@/hooks/useActivityTracker';

export interface LearningStyleProfile {
  visual_score: number;
  logical_score: number;
  verbal_score: number;
  kinesthetic_score: number;
  conceptual_score: number;
  dominant_style: string;
  secondary_style: string | null;
  total_interactions: number;
  confidence: number; // 0-100
  subject_profiles?: Record<string, {
    visual: number; logical: number; verbal: number; kinesthetic: number; conceptual: number;
  }>;
}

const STYLE_LABELS: Record<string, string> = {
  visual: '🎨 Visual',
  logical: '🧠 Logical',
  verbal: '💬 Verbal',
  kinesthetic: '🖐️ Kinesthetic',
  conceptual: '💡 Conceptual',
  balanced: '⚖️ Balanced',
};

const MIN_INTERACTIONS_FOR_PROFILE = 20;
const HIGH_CONFIDENCE_THRESHOLD = 100;

/**
 * Analyze behavioral data points to calculate learning style percentages.
 * This uses WEIGHTED behavioral signals, not feature-to-style mappings.
 */
function analyzeBehavioralData(dataPoints: BehavioralDataPoint[]): {
  scores: Record<ContentModality, number>;
  confidence: number;
  subjectProfiles: Record<string, Record<ContentModality, number>>;
} {
  const modalities: ContentModality[] = ['visual', 'logical', 'verbal', 'kinesthetic', 'conceptual'];
  const weights: Record<ContentModality, number> = { visual: 0, logical: 0, verbal: 0, kinesthetic: 0, conceptual: 0 };
  const subjectWeights: Record<string, Record<ContentModality, number>> = {};

  for (const dp of dataPoints) {
    const w = dp.weight;
    weights[dp.modality] += w;

    // Track per-subject
    if (dp.subject) {
      if (!subjectWeights[dp.subject]) {
        subjectWeights[dp.subject] = { visual: 0, logical: 0, verbal: 0, kinesthetic: 0, conceptual: 0 };
      }
      subjectWeights[dp.subject][dp.modality] += w;
    }
  }

  // Normalize to percentages
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  const scores: Record<ContentModality, number> = {} as any;
  for (const m of modalities) {
    scores[m] = Math.round((Math.max(0, weights[m]) / totalWeight) * 100);
  }

  // Ensure percentages sum to 100
  const sum = Object.values(scores).reduce((a, b) => a + b, 0);
  if (sum !== 100 && sum > 0) {
    const maxKey = modalities.reduce((a, b) => scores[a] >= scores[b] ? a : b);
    scores[maxKey] += (100 - sum);
  }

  // Subject-specific profiles
  const subjectProfiles: Record<string, Record<ContentModality, number>> = {};
  for (const [subject, sw] of Object.entries(subjectWeights)) {
    const total = Object.values(sw).reduce((a, b) => a + b, 0) || 1;
    subjectProfiles[subject] = {} as any;
    for (const m of modalities) {
      subjectProfiles[subject][m] = Math.round((Math.max(0, sw[m]) / total) * 100);
    }
  }

  // Confidence: scales from 0 to 100 based on number of data points
  const confidence = Math.min(100, Math.round((dataPoints.length / HIGH_CONFIDENCE_THRESHOLD) * 100));

  return { scores, confidence, subjectProfiles };
}

export function useLearningStyle() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<LearningStyleProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    if (!user) { setLoading(false); return; }

    // First try to load from localStorage behavioral data
    const behaviorData = getStoredBehavior();
    
    if (behaviorData.dataPoints.length >= MIN_INTERACTIONS_FOR_PROFILE) {
      const { scores, confidence, subjectProfiles } = analyzeBehavioralData(behaviorData.dataPoints);
      
      const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
      const dominant = sorted[0][1] > 25 ? sorted[0][0] : 'balanced';
      const secondary = sorted[1][1] > 20 ? sorted[1][0] : null;

      const newProfile: LearningStyleProfile = {
        visual_score: scores.visual,
        logical_score: scores.logical,
        verbal_score: scores.verbal,
        kinesthetic_score: scores.kinesthetic,
        conceptual_score: scores.conceptual,
        dominant_style: dominant,
        secondary_style: secondary,
        total_interactions: behaviorData.totalInteractions,
        confidence,
        subject_profiles: subjectProfiles,
      };

      setProfile(newProfile);
      setLoading(false);

      // Sync to DB for server-side AI usage
      await supabase.from('learning_style_profiles').upsert({
        user_id: user.id,
        visual_score: scores.visual,
        logical_score: scores.logical,
        verbal_score: scores.verbal,
        kinesthetic_score: scores.kinesthetic,
        conceptual_score: scores.conceptual,
        dominant_style: dominant,
        secondary_style: secondary,
        total_interactions: behaviorData.totalInteractions,
        last_analyzed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

      return;
    }

    // Fallback: check DB for existing profile
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
        dominant_style: data.dominant_style || 'balanced',
        secondary_style: data.secondary_style,
        total_interactions: data.total_interactions || 0,
        confidence: Math.min(100, Math.round(((data.total_interactions || 0) / HIGH_CONFIDENCE_THRESHOLD) * 100)),
      });
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  /**
   * Recalculate learning style from locally stored behavioral data.
   * Called periodically or after significant activity.
   */
  const recalculate = useCallback(async () => {
    if (!user) return;
    await fetchProfile();
  }, [user, fetchProfile]);

  /**
   * Generate a prompt modifier for AI based on learning style.
   * Uses percentage breakdown for nuanced personalization.
   */
  const getLearningStylePrompt = useCallback((): string => {
    if (!profile) {
      return 'This student has not been profiled yet. Use a balanced teaching approach mixing visual descriptions, logical reasoning, verbal explanations, and practical examples equally. Present multiple explanation formats.';
    }

    if (profile.confidence < 40) {
      return `This student's learning profile is still being calibrated (confidence: ${profile.confidence}%). Current signals suggest: Visual ${profile.visual_score}%, Logical ${profile.logical_score}%, Verbal ${profile.verbal_score}%, Kinesthetic ${profile.kinesthetic_score}%, Conceptual ${profile.conceptual_score}%. Since confidence is low, provide responses using MULTIPLE explanation formats equally weighted. Include visual representations, logical breakdowns, detailed text, practical examples, and big-picture context.`;
    }

    let prompt = `## Student Learning Profile (${profile.confidence}% confidence, ${profile.total_interactions} interactions analyzed)
Modality breakdown: Visual ${profile.visual_score}%, Logical ${profile.logical_score}%, Verbal ${profile.verbal_score}%, Kinesthetic ${profile.kinesthetic_score}%, Conceptual ${profile.conceptual_score}%.

PRIMARY approach (${profile.dominant_style}, ${profile.visual_score >= profile.logical_score && profile.visual_score >= profile.verbal_score ? profile.visual_score : profile.dominant_style === 'logical' ? profile.logical_score : profile.dominant_style === 'verbal' ? profile.verbal_score : profile.dominant_style === 'kinesthetic' ? profile.kinesthetic_score : profile.conceptual_score}%): `;

    const instructions: Record<string, string> = {
      visual: 'Lead with visual representations — diagrams, charts, spatial layouts, color-coded content, structured hierarchies. Use markdown tables and ASCII art when describing structures.',
      logical: 'Lead with step-by-step logical reasoning — numbered sequences, cause-and-effect chains, "if...then" structures, mathematical proofs, systematic breakdowns showing WHY things work.',
      verbal: 'Lead with rich narrative explanations — detailed language, analogies, storytelling, real-world metaphors, conversational tone. Define terms carefully and use multiple phrasings.',
      kinesthetic: 'Lead with hands-on applications — real-world examples, practice problems immediately after concepts, experiments, interactive scenarios, "what would happen if" questions.',
      conceptual: 'Lead with the big picture — how this fits in the larger framework, connections to other ideas, mind-map style relationships, core underlying principles before details.',
    };

    prompt += instructions[profile.dominant_style] || instructions.verbal;

    if (profile.secondary_style && profile.secondary_style !== profile.dominant_style) {
      prompt += `\n\nSECONDARY support (${profile.secondary_style}): Also incorporate ${instructions[profile.secondary_style]?.split('—')[1]?.trim() || 'supplementary explanations in this style.'}`;
    }

    prompt += `\n\nIMPORTANT RULES:
- If the student EXPLICITLY requests a different format, honor that request immediately.
- After explaining, verify understanding and offer alternative explanation formats.
- If the student misunderstands, try a DIFFERENT modality than what was just used.
- Balance personalization with well-rounded education.`;

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
