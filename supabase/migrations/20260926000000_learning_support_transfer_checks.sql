-- A separate, teacher-reviewed transfer probe for an existing support plan.
-- It is evidence of one response, never automatic proof that an intervention caused learning.
CREATE TABLE public.learning_support_transfer_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.learning_support_plans(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES auth.users(id),
  prompt text NOT NULL CHECK (char_length(btrim(prompt)) BETWEEN 20 AND 2000),
  success_criteria text NOT NULL CHECK (char_length(btrim(success_criteria)) BETWEEN 10 AND 1000),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'SUBMITTED', 'REVIEWED')),
  student_response text CHECK (student_response IS NULL OR char_length(btrim(student_response)) BETWEEN 10 AND 5000),
  submitted_at timestamptz,
  verdict text CHECK (verdict IS NULL OR verdict IN ('DEMONSTRATED', 'NOT_YET', 'INCONCLUSIVE')),
  teacher_feedback text CHECK (teacher_feedback IS NULL OR char_length(btrim(teacher_feedback)) BETWEEN 10 AND 2000),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (status = 'OPEN' AND student_response IS NULL AND submitted_at IS NULL AND verdict IS NULL AND teacher_feedback IS NULL AND reviewed_at IS NULL)
    OR (status = 'SUBMITTED' AND student_response IS NOT NULL AND submitted_at IS NOT NULL AND verdict IS NULL AND teacher_feedback IS NULL AND reviewed_at IS NULL)
    OR (status = 'REVIEWED' AND student_response IS NOT NULL AND submitted_at IS NOT NULL AND verdict IS NOT NULL AND teacher_feedback IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);

CREATE INDEX learning_support_transfer_checks_plan_idx
  ON public.learning_support_transfer_checks(plan_id, created_at DESC);
CREATE INDEX learning_support_transfer_checks_student_idx
  ON public.learning_support_transfer_checks(student_id, status, created_at DESC);
CREATE INDEX learning_support_transfer_checks_teacher_idx
  ON public.learning_support_transfer_checks(teacher_id, status, created_at DESC);
CREATE UNIQUE INDEX learning_support_transfer_checks_one_pending_per_plan
  ON public.learning_support_transfer_checks(plan_id) WHERE status <> 'REVIEWED';

CREATE FUNCTION public.initialize_learning_support_transfer_check() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE source_plan public.learning_support_plans%ROWTYPE;
BEGIN
  SELECT * INTO source_plan FROM public.learning_support_plans WHERE id = NEW.plan_id;
  IF NOT FOUND OR source_plan.teacher_id IS DISTINCT FROM auth.uid() OR source_plan.status = 'closed' THEN
    RAISE EXCEPTION 'transfer_check_plan_unavailable';
  END IF;
  NEW.school_id := source_plan.school_id;
  NEW.student_id := source_plan.student_id;
  NEW.teacher_id := source_plan.teacher_id;
  NEW.status := 'OPEN';
  NEW.student_response := NULL;
  NEW.submitted_at := NULL;
  NEW.verdict := NULL;
  NEW.teacher_feedback := NULL;
  NEW.reviewed_at := NULL;
  NEW.created_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER initialize_learning_support_transfer_check_before_insert
  BEFORE INSERT ON public.learning_support_transfer_checks FOR EACH ROW
  EXECUTE FUNCTION public.initialize_learning_support_transfer_check();

CREATE FUNCTION public.guard_learning_support_transfer_check_update() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.plan_id IS DISTINCT FROM OLD.plan_id
     OR NEW.school_id IS DISTINCT FROM OLD.school_id OR NEW.student_id IS DISTINCT FROM OLD.student_id
     OR NEW.teacher_id IS DISTINCT FROM OLD.teacher_id OR NEW.prompt IS DISTINCT FROM OLD.prompt
     OR NEW.success_criteria IS DISTINCT FROM OLD.success_criteria OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'transfer_check_identity_immutable';
  END IF;

  IF auth.uid() = OLD.student_id AND OLD.status = 'OPEN' AND NEW.status = 'SUBMITTED' THEN
    IF NEW.verdict IS DISTINCT FROM OLD.verdict OR NEW.teacher_feedback IS DISTINCT FROM OLD.teacher_feedback
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at THEN
      RAISE EXCEPTION 'transfer_check_student_scope';
    END IF;
    NEW.submitted_at := now();
  ELSIF auth.uid() = OLD.teacher_id AND OLD.status = 'SUBMITTED' AND NEW.status = 'REVIEWED' THEN
    IF NEW.student_response IS DISTINCT FROM OLD.student_response OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
      RAISE EXCEPTION 'transfer_check_teacher_scope';
    END IF;
    NEW.reviewed_at := now();
  ELSE
    RAISE EXCEPTION 'transfer_check_transition_forbidden';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_learning_support_transfer_check_before_update
  BEFORE UPDATE ON public.learning_support_transfer_checks FOR EACH ROW
  EXECUTE FUNCTION public.guard_learning_support_transfer_check_update();

ALTER TABLE public.learning_support_transfer_checks ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.learning_support_transfer_checks TO authenticated;

CREATE POLICY "support transfer audience reads" ON public.learning_support_transfer_checks
  FOR SELECT TO authenticated USING (
    (student_id = auth.uid() OR teacher_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.school_id = learning_support_transfer_checks.school_id AND p.is_active)
  );

CREATE POLICY "support teacher creates transfer probe" ON public.learning_support_transfer_checks
  FOR INSERT TO authenticated WITH CHECK (
    teacher_id = auth.uid() AND public.has_role(auth.uid(), 'teacher'::app_role)
    AND EXISTS (SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.school_id = learning_support_transfer_checks.school_id AND p.is_active)
    AND EXISTS (SELECT 1 FROM public.learning_support_plans plan
      WHERE plan.id = plan_id AND plan.teacher_id = auth.uid() AND plan.school_id = learning_support_transfer_checks.school_id)
  );

CREATE POLICY "support learner submits transfer response" ON public.learning_support_transfer_checks
  FOR UPDATE TO authenticated USING (
    student_id = auth.uid() AND status = 'OPEN'
    AND EXISTS (SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.school_id = learning_support_transfer_checks.school_id AND p.is_active)
  ) WITH CHECK (
    student_id = auth.uid() AND status = 'SUBMITTED'
    AND EXISTS (SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.school_id = learning_support_transfer_checks.school_id AND p.is_active)
  );

CREATE POLICY "support teacher reviews transfer response" ON public.learning_support_transfer_checks
  FOR UPDATE TO authenticated USING (
    teacher_id = auth.uid() AND status = 'SUBMITTED' AND public.has_role(auth.uid(), 'teacher'::app_role)
    AND EXISTS (SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.school_id = learning_support_transfer_checks.school_id AND p.is_active)
  ) WITH CHECK (
    teacher_id = auth.uid() AND status = 'REVIEWED' AND public.has_role(auth.uid(), 'teacher'::app_role)
    AND EXISTS (SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.school_id = learning_support_transfer_checks.school_id AND p.is_active)
  );
