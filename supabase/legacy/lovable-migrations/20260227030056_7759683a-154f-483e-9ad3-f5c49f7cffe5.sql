-- Ensure adaptive profile recalculation runs automatically after each answer
DROP TRIGGER IF EXISTS trg_recalculate_difficulty_level ON public.student_answer_history;

CREATE TRIGGER trg_recalculate_difficulty_level
AFTER INSERT ON public.student_answer_history
FOR EACH ROW
EXECUTE FUNCTION public.recalculate_difficulty_level();

-- Backfill/refresh learning profiles from existing answer history (last 20 answers drive difficulty)
WITH ranked AS (
  SELECT
    user_id,
    subject,
    is_correct,
    created_at,
    ROW_NUMBER() OVER (PARTITION BY user_id, subject ORDER BY created_at DESC) AS rn
  FROM public.student_answer_history
),
agg AS (
  SELECT
    user_id,
    subject,
    COUNT(*)::int AS total_questions_answered,
    COUNT(*) FILTER (WHERE is_correct)::int AS correct_answers,
    COUNT(*) FILTER (WHERE rn <= 20)::int AS recent_total,
    COUNT(*) FILTER (WHERE rn <= 20 AND is_correct)::int AS recent_correct
  FROM ranked
  GROUP BY user_id, subject
)
INSERT INTO public.student_learning_profiles (
  user_id,
  subject,
  difficulty_level,
  total_questions_answered,
  correct_answers,
  recent_accuracy,
  created_at,
  updated_at
)
SELECT
  user_id,
  subject,
  CASE
    WHEN COALESCE((recent_correct::numeric / NULLIF(recent_total, 0)) * 100, 0) >= 85 THEN 'advanced'
    WHEN COALESCE((recent_correct::numeric / NULLIF(recent_total, 0)) * 100, 0) >= 55 THEN 'intermediate'
    ELSE 'beginner'
  END AS difficulty_level,
  total_questions_answered,
  correct_answers,
  COALESCE((recent_correct::numeric / NULLIF(recent_total, 0)) * 100, 0) AS recent_accuracy,
  now(),
  now()
FROM agg
ON CONFLICT (user_id, subject)
DO UPDATE SET
  difficulty_level = EXCLUDED.difficulty_level,
  total_questions_answered = EXCLUDED.total_questions_answered,
  correct_answers = EXCLUDED.correct_answers,
  recent_accuracy = EXCLUDED.recent_accuracy,
  updated_at = now();