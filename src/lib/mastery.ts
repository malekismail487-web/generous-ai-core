import { supabase } from '@/integrations/supabase/client';

export type WeakTopic = {
  subject: string;
  topic: string;
  mastery_score: number;
  next_review_at: string | null;
  last_practiced_at: string | null;
  repetitions: number;
};

export type DueReview = {
  subject: string;
  topic: string;
  mastery_score: number;
  next_review_at: string;
  overdue_hours: number;
};

export async function getWeakestTopics(
  userId: string,
  subject?: string | null,
  limit = 5,
): Promise<WeakTopic[]> {
  const { data, error } = await supabase.rpc('get_weakest_topics', {
    p_user_id: userId,
    p_subject: subject ?? null,
    p_limit: limit,
  });
  if (error) {
    console.warn('[mastery] get_weakest_topics failed', error.message);
    return [];
  }
  return (data || []) as WeakTopic[];
}

export async function getDueReviews(userId: string, limit = 10): Promise<DueReview[]> {
  const { data, error } = await supabase.rpc('get_due_reviews', {
    p_user_id: userId,
    p_limit: limit,
  });
  if (error) {
    console.warn('[mastery] get_due_reviews failed', error.message);
    return [];
  }
  return (data || []) as DueReview[];
}

/**
 * Translate mastery score [0..1] to a difficulty bias instruction injected into AI prompts.
 * Used by Practice Quiz, Examination, and Study Buddy to keep difficulty calibrated to mastery.
 */
export function masteryDifficultyHint(score: number | null | undefined): string {
  if (score == null || Number.isNaN(score)) return '';
  if (score < 0.35) {
    return 'The student has LOW mastery on this topic. Use simpler vocabulary, smaller steps, and a foundational question.';
  }
  if (score < 0.7) {
    return 'The student has MODERATE mastery. Ask a question that builds on basics but stretches understanding by one step.';
  }
  return 'The student has HIGH mastery. Ask a challenging question that applies the concept in a novel context.';
}

/**
 * Build a short prompt block summarising weakest topics + due reviews,
 * suitable for injection into Study Buddy / Lumi system prompts.
 */
export function buildMasteryPromptBlock(weak: WeakTopic[], due: DueReview[]): string {
  if (!weak.length && !due.length) return '';
  const weakLines = weak
    .slice(0, 5)
    .map((w) => `- ${w.subject} / ${w.topic}: mastery ${(w.mastery_score * 100).toFixed(0)}%`)
    .join('\n');
  const dueLines = due
    .slice(0, 5)
    .map((d) => `- ${d.subject} / ${d.topic} (overdue ${Math.max(0, d.overdue_hours).toFixed(1)}h)`)
    .join('\n');
  return [
    '\n=== CROSS-SURFACE MASTERY SIGNAL ===',
    weakLines && `Weakest topics:\n${weakLines}`,
    dueLines && `Due for spaced review:\n${dueLines}`,
    'When relevant to the conversation, gently steer toward these weak/due areas. Do not list them verbatim to the student.',
  ]
    .filter(Boolean)
    .join('\n');
}
