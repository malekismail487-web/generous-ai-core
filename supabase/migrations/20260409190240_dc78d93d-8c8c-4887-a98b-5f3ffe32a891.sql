
-- 1. lct_exams - Master exam record
CREATE TABLE public.lct_exams (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL DEFAULT 'Luminary Cognitive Test',
  status text NOT NULL DEFAULT 'draft',
  questions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  answer_key_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid NOT NULL,
  started_at timestamp with time zone,
  ends_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.lct_exams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access lct_exams"
  ON public.lct_exams FOR ALL
  USING (lower((auth.jwt() ->> 'email'::text)) = 'malekismail487@gmail.com'::text)
  WITH CHECK (lower((auth.jwt() ->> 'email'::text)) = 'malekismail487@gmail.com'::text);

-- 2. lct_exam_schools - Schools included in an exam
CREATE TABLE public.lct_exam_schools (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  exam_id uuid NOT NULL REFERENCES public.lct_exams(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(exam_id, school_id)
);

ALTER TABLE public.lct_exam_schools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access lct_exam_schools"
  ON public.lct_exam_schools FOR ALL
  USING (lower((auth.jwt() ->> 'email'::text)) = 'malekismail487@gmail.com'::text)
  WITH CHECK (lower((auth.jwt() ->> 'email'::text)) = 'malekismail487@gmail.com'::text);

-- 3. lct_exam_students - Per-student translated exam + submission
CREATE TABLE public.lct_exam_students (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  exam_id uuid NOT NULL REFERENCES public.lct_exams(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  learning_style text NOT NULL DEFAULT 'balanced',
  translated_questions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  answers_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  score integer,
  status text NOT NULL DEFAULT 'pending',
  started_at timestamp with time zone,
  submitted_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(exam_id, student_id)
);

ALTER TABLE public.lct_exam_students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access lct_exam_students"
  ON public.lct_exam_students FOR ALL
  USING (lower((auth.jwt() ->> 'email'::text)) = 'malekismail487@gmail.com'::text)
  WITH CHECK (lower((auth.jwt() ->> 'email'::text)) = 'malekismail487@gmail.com'::text);

CREATE POLICY "Students can view their own lct exam"
  ON public.lct_exam_students FOR SELECT
  USING (student_id = auth.uid());

CREATE POLICY "Students can update their own lct exam answers"
  ON public.lct_exam_students FOR UPDATE
  USING (student_id = auth.uid());

-- 4. lct_exam_locks - Active lock flag per student
CREATE TABLE public.lct_exam_locks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid NOT NULL UNIQUE,
  exam_id uuid NOT NULL REFERENCES public.lct_exams(id) ON DELETE CASCADE,
  locked_until timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.lct_exam_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access lct_exam_locks"
  ON public.lct_exam_locks FOR ALL
  USING (lower((auth.jwt() ->> 'email'::text)) = 'malekismail487@gmail.com'::text)
  WITH CHECK (lower((auth.jwt() ->> 'email'::text)) = 'malekismail487@gmail.com'::text);

CREATE POLICY "Students can view their own lock"
  ON public.lct_exam_locks FOR SELECT
  USING (student_id = auth.uid());

-- 5. check_lct_lock RPC - Security definer function
CREATE OR REPLACE FUNCTION public.check_lct_lock(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT jsonb_build_object(
        'locked', true,
        'exam_id', l.exam_id,
        'locked_until', l.locked_until
      )
      FROM public.lct_exam_locks l
      WHERE l.student_id = p_user_id
        AND l.locked_until > now()
      LIMIT 1
    ),
    jsonb_build_object('locked', false, 'exam_id', null, 'locked_until', null)
  );
$$;
