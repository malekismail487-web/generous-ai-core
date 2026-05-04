-- Phase 2A: Novel Learning Modes
CREATE TABLE public.learning_mode_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  school_id UUID,
  mode TEXT NOT NULL CHECK (mode IN ('socratic','teach_back','misconception_hunt')),
  subject TEXT NOT NULL,
  topic TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','abandoned')),
  score NUMERIC CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  turns_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_test_data BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lms_user_status ON public.learning_mode_sessions(user_id, status, started_at DESC);
CREATE INDEX idx_lms_school_mode ON public.learning_mode_sessions(school_id, mode, subject, topic);

ALTER TABLE public.learning_mode_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "students manage own learning sessions"
  ON public.learning_mode_sessions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "school staff read same-school learning sessions"
  ON public.learning_mode_sessions FOR SELECT
  USING (
    school_id IS NOT NULL
    AND school_id = public.get_user_school_id(auth.uid())
    AND (public.is_teacher(auth.uid()) OR public.is_school_admin_of(auth.uid(), school_id))
  );

CREATE POLICY "parents read child learning sessions"
  ON public.learning_mode_sessions FOR SELECT
  USING (user_id IN (SELECT student_id FROM public.parent_students WHERE parent_id = auth.uid()));

CREATE POLICY "super admin all learning sessions"
  ON public.learning_mode_sessions FOR SELECT
  USING (lower((auth.jwt() ->> 'email')) = 'malekismail487@gmail.com');

CREATE TRIGGER trg_learning_mode_sessions_updated
BEFORE UPDATE ON public.learning_mode_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();