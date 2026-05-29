
-- ============================================================
-- Adaptive Intelligence v2 — schema foundation
-- ============================================================

-- 1. ability_estimates -------------------------------------------------
CREATE TABLE public.ability_estimates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  school_id UUID,
  subject TEXT NOT NULL,
  concept_id TEXT,                       -- NULL = subject-level estimate
  theta NUMERIC(6,3) NOT NULL DEFAULT 0.0,   -- ability, ~ -3.0 .. +3.0
  theta_se NUMERIC(6,3) NOT NULL DEFAULT 1.5, -- standard error; <0.4 = locked in
  graded_count INTEGER NOT NULL DEFAULT 0,
  last_graded_at TIMESTAMPTZ,
  provisional BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, subject, concept_id)
);

CREATE INDEX idx_ability_user_subject ON public.ability_estimates(user_id, subject);
CREATE INDEX idx_ability_user_concept ON public.ability_estimates(user_id, concept_id);

GRANT SELECT ON public.ability_estimates TO authenticated;
GRANT ALL ON public.ability_estimates TO service_role;

ALTER TABLE public.ability_estimates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students read own ability"
  ON public.ability_estimates FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Authorised viewers read student ability"
  ON public.ability_estimates FOR SELECT TO authenticated
  USING (public.can_view_student_mastery(auth.uid(), user_id));

CREATE TRIGGER trg_ability_estimates_updated_at
  BEFORE UPDATE ON public.ability_estimates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. question_bank -----------------------------------------------------
CREATE TABLE public.question_bank (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subject TEXT NOT NULL,
  concept_id TEXT,
  question_hash TEXT NOT NULL UNIQUE,         -- sha256 of normalised question text
  question_text TEXT NOT NULL,
  correct_answer TEXT,
  source TEXT NOT NULL DEFAULT 'ai',          -- ai | teacher | exam | probe
  difficulty_b NUMERIC(6,3) NOT NULL DEFAULT 0.0,  -- empirical difficulty
  difficulty_provisional BOOLEAN NOT NULL DEFAULT true,
  times_seen INTEGER NOT NULL DEFAULT 0,
  times_correct INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_qbank_subject ON public.question_bank(subject);
CREATE INDEX idx_qbank_concept ON public.question_bank(concept_id);

GRANT SELECT ON public.question_bank TO authenticated;
GRANT ALL ON public.question_bank TO service_role;

ALTER TABLE public.question_bank ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Any signed-in user can read questions"
  ON public.question_bank FOR SELECT TO authenticated
  USING (true);

CREATE TRIGGER trg_question_bank_updated_at
  BEFORE UPDATE ON public.question_bank
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. graded_events -----------------------------------------------------
CREATE TABLE public.graded_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  school_id UUID,
  subject TEXT NOT NULL,
  concept_id TEXT,
  question_id UUID REFERENCES public.question_bank(id) ON DELETE SET NULL,
  difficulty_b NUMERIC(6,3) NOT NULL DEFAULT 0.0,
  theta_before NUMERIC(6,3) NOT NULL DEFAULT 0.0,
  theta_after NUMERIC(6,3) NOT NULL DEFAULT 0.0,
  se_before NUMERIC(6,3) NOT NULL DEFAULT 1.5,
  se_after NUMERIC(6,3) NOT NULL DEFAULT 1.5,
  expected_p NUMERIC(6,4) NOT NULL DEFAULT 0.5,   -- P(correct) before answering
  was_correct BOOLEAN NOT NULL,
  response_time_ms INTEGER,
  source TEXT NOT NULL DEFAULT 'quiz',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_graded_events_user_subject ON public.graded_events(user_id, subject, created_at DESC);

GRANT SELECT ON public.graded_events TO authenticated;
GRANT ALL ON public.graded_events TO service_role;

ALTER TABLE public.graded_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students read own graded events"
  ON public.graded_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Authorised viewers read graded events"
  ON public.graded_events FOR SELECT TO authenticated
  USING (public.can_view_student_mastery(auth.uid(), user_id));

-- 4. derive_level helper ----------------------------------------------
CREATE OR REPLACE FUNCTION public.derive_level(p_theta NUMERIC)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_theta IS NULL THEN 'intermediate'
    WHEN p_theta < -0.5 THEN 'beginner'
    WHEN p_theta >  0.5 THEN 'advanced'
    ELSE 'intermediate'
  END
$$;

-- 5. Backfill from existing student_learning_profiles -----------------
-- Map recent_accuracy (0..100) to a starting theta and a high SE so the
-- engine treats the seed as provisional and quickly refines it.
INSERT INTO public.ability_estimates
  (user_id, school_id, subject, concept_id, theta, theta_se, graded_count, provisional, last_graded_at)
SELECT
  slp.user_id,
  (SELECT school_id FROM public.profiles p WHERE p.id = slp.user_id LIMIT 1) AS school_id,
  slp.subject,
  NULL,
  -- Map: 0% -> -1.5, 50% -> 0.0, 100% -> +1.5
  GREATEST(-3.0, LEAST(3.0, ((COALESCE(slp.recent_accuracy, 50)::numeric - 50.0) / 50.0) * 1.5))::numeric(6,3),
  1.2::numeric(6,3),       -- high SE: seed is provisional
  COALESCE(slp.total_questions_answered, 0),
  true,
  slp.updated_at
FROM public.student_learning_profiles slp
ON CONFLICT (user_id, subject, concept_id) DO NOTHING;
