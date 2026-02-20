import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';

export interface LearningProfile {
  subject: string;
  difficulty_level: DifficultyLevel;
  total_questions_answered: number;
  correct_answers: number;
  recent_accuracy: number;
}

export function useAdaptiveLevel(subject?: string) {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<LearningProfile[]>([]);
  const [currentLevel, setCurrentLevel] = useState<DifficultyLevel>('intermediate');
  const [loading, setLoading] = useState(true);

  const fetchProfiles = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    
    let query = supabase
      .from('student_learning_profiles')
      .select('subject, difficulty_level, total_questions_answered, correct_answers, recent_accuracy')
      .eq('user_id', user.id);

    if (subject) {
      query = query.eq('subject', subject.toLowerCase());
    }

    const { data } = await query;
    const parsed = (data ?? []).map((p: any) => ({
      ...p,
      recent_accuracy: Number(p.recent_accuracy),
    }));
    setProfiles(parsed);

    if (subject && parsed.length > 0) {
      setCurrentLevel(parsed[0].difficulty_level as DifficultyLevel);
    } else if (parsed.length > 0) {
      // Overall level = most common level across subjects
      const counts: Record<string, number> = {};
      for (const p of parsed) {
        counts[p.difficulty_level] = (counts[p.difficulty_level] || 0) + 1;
      }
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      setCurrentLevel(sorted[0][0] as DifficultyLevel);
    }

    setLoading(false);
  }, [user, subject]);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const recordAnswer = useCallback(async (params: {
    subject: string;
    questionText?: string;
    studentAnswer?: string;
    correctAnswer?: string;
    isCorrect: boolean;
    difficulty?: string;
    source?: string;
  }) => {
    if (!user) return;

    await supabase.from('student_answer_history').insert({
      user_id: user.id,
      subject: params.subject.toLowerCase(),
      question_text: params.questionText || null,
      student_answer: params.studentAnswer || null,
      correct_answer: params.correctAnswer || null,
      is_correct: params.isCorrect,
      difficulty: params.difficulty || 'medium',
      source: params.source || 'quiz',
    });

    // Refresh profiles after recording
    await fetchProfiles();
  }, [user, fetchProfiles]);

  const getLevelPrompt = useCallback((subjectName?: string): string => {
    const level = subjectName
      ? profiles.find(p => p.subject === subjectName.toLowerCase())?.difficulty_level || currentLevel
      : currentLevel;

    const levelDescriptions: Record<DifficultyLevel, string> = {
      beginner: 'The student is at a BEGINNER level. Use simple vocabulary, short sentences, basic examples, and explain concepts step-by-step from the ground up. Avoid jargon. Use analogies and real-world comparisons.',
      intermediate: 'The student is at an INTERMEDIATE level. Use standard academic language, provide moderate detail, include some technical terms with brief explanations, and offer practical examples.',
      advanced: 'The student is at an ADVANCED level. Use precise technical language, go deeper into theory, include challenging examples, edge cases, and connections to broader concepts. Push their understanding further.',
    };

    return levelDescriptions[level];
  }, [profiles, currentLevel]);

  return {
    profiles,
    currentLevel,
    loading,
    recordAnswer,
    getLevelPrompt,
    refetch: fetchProfiles,
  };
}
