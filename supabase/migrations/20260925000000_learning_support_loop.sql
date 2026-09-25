-- An evidence-linked learning support loop. Teacher plans are distinct from
-- learner/family observations; a learner cannot rewrite the teacher's goal.
CREATE TABLE public.learning_support_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES auth.users(id),
  subject text NOT NULL CHECK (char_length(btrim(subject)) BETWEEN 1 AND 120),
  topic text NOT NULL CHECK (char_length(btrim(topic)) BETWEEN 1 AND 180),
  goal text NOT NULL CHECK (char_length(btrim(goal)) BETWEEN 5 AND 1000),
  learner_step text NOT NULL CHECK (char_length(btrim(learner_step)) BETWEEN 5 AND 1000),
  family_step text CHECK (family_step IS NULL OR char_length(btrim(family_step)) BETWEEN 5 AND 1000),
  family_visible boolean NOT NULL DEFAULT false,
  source_kind text NOT NULL CHECK (source_kind IN ('ALE_MASTERY', 'TEACHER_OBSERVATION')),
  baseline_mastery numeric CHECK (baseline_mastery IS NULL OR baseline_mastery BETWEEN 0 AND 1),
  ale_observed_at timestamptz,
  target_mastery numeric CHECK (target_mastery IS NULL OR target_mastery BETWEEN 0 AND 1),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'review', 'closed')),
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  CHECK (NOT family_visible OR family_step IS NOT NULL),
  CHECK (source_kind <> 'ALE_MASTERY' OR (baseline_mastery IS NOT NULL AND ale_observed_at IS NOT NULL)),
  CHECK (target_mastery IS NULL OR baseline_mastery IS NULL OR target_mastery >= baseline_mastery)
);

CREATE INDEX learning_support_plans_student_idx ON public.learning_support_plans(student_id, status, created_at DESC);
CREATE INDEX learning_support_plans_teacher_idx ON public.learning_support_plans(teacher_id, status, created_at DESC);
CREATE INDEX learning_support_plans_school_idx ON public.learning_support_plans(school_id, status, created_at DESC);

CREATE TABLE public.learning_support_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.learning_support_plans(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  kind text NOT NULL CHECK (kind IN ('PRACTICED', 'NEEDS_HELP', 'FAMILY_SUPPORTED')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX learning_support_checkins_plan_idx ON public.learning_support_checkins(plan_id, created_at DESC);

-- The client may select a concept, but it cannot assert an ALE score. The
-- database copies the currently observed mastery within the same school.
CREATE FUNCTION public.bind_learning_support_ale_snapshot() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.source_kind = 'ALE_MASTERY' THEN
    SELECT cm.mastery_score, cm.updated_at INTO NEW.baseline_mastery, NEW.ale_observed_at
    FROM public.concept_mastery cm
    WHERE cm.user_id = NEW.student_id AND (cm.school_id = NEW.school_id OR cm.school_id IS NULL)
      AND cm.subject = NEW.subject AND cm.topic = NEW.topic AND NOT cm.is_test_data
    ORDER BY cm.updated_at DESC LIMIT 1;
    IF NEW.baseline_mastery IS NULL THEN
      RAISE EXCEPTION 'support_plan_ale_evidence_missing';
    END IF;
  ELSE
    NEW.baseline_mastery := NULL;
    NEW.ale_observed_at := NULL;
  END IF;
  NEW.created_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER bind_learning_support_ale_snapshot_before_insert
  BEFORE INSERT ON public.learning_support_plans FOR EACH ROW
  EXECUTE FUNCTION public.bind_learning_support_ale_snapshot();

CREATE FUNCTION public.stamp_learning_support_checkin() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.created_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER stamp_learning_support_checkin_before_insert
  BEFORE INSERT ON public.learning_support_checkins FOR EACH ROW
  EXECUTE FUNCTION public.stamp_learning_support_checkin();

ALTER TABLE public.learning_support_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_support_checkins ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.learning_support_plans TO authenticated;
GRANT SELECT, INSERT ON public.learning_support_checkins TO authenticated;

CREATE POLICY "teacher creates school support plan" ON public.learning_support_plans
  FOR INSERT TO authenticated WITH CHECK (
    teacher_id = auth.uid()
    AND public.has_role(auth.uid(), 'teacher'::app_role)
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.school_id = learning_support_plans.school_id AND p.is_active)
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = learning_support_plans.student_id AND p.school_id = learning_support_plans.school_id AND p.user_type = 'student' AND p.is_active)
  );

CREATE POLICY "teacher revises own support plan" ON public.learning_support_plans
  FOR UPDATE TO authenticated USING (
    teacher_id = auth.uid()
    AND public.has_role(auth.uid(), 'teacher'::app_role)
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.school_id = learning_support_plans.school_id AND p.is_active)
  ) WITH CHECK (
    teacher_id = auth.uid()
    AND public.has_role(auth.uid(), 'teacher'::app_role)
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.school_id = learning_support_plans.school_id AND p.is_active)
  );

CREATE POLICY "audience reads school support plan" ON public.learning_support_plans
  FOR SELECT TO authenticated USING (
    (student_id = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.school_id = learning_support_plans.school_id))
    OR (teacher_id = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.school_id = learning_support_plans.school_id))
    OR public.is_school_admin_of(auth.uid(), school_id)
    OR (family_visible AND EXISTS (
      SELECT 1 FROM public.parent_students ps
      WHERE ps.parent_id = auth.uid() AND ps.student_id = learning_support_plans.student_id AND ps.school_id = learning_support_plans.school_id
    ))
  );

CREATE POLICY "audience reads support checkins" ON public.learning_support_checkins
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.learning_support_plans p WHERE p.id = plan_id)
  );

CREATE POLICY "learner or family appends support checkin" ON public.learning_support_checkins
  FOR INSERT TO authenticated WITH CHECK (
    actor_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.learning_support_plans p WHERE p.id = plan_id AND p.status = 'active' AND (
        (p.student_id = auth.uid() AND kind IN ('PRACTICED', 'NEEDS_HELP'))
        OR (kind = 'FAMILY_SUPPORTED' AND p.family_visible AND EXISTS (
          SELECT 1 FROM public.parent_students ps WHERE ps.parent_id = auth.uid() AND ps.student_id = p.student_id AND ps.school_id = p.school_id
        ))
      )
    )
  );

-- Preserve identity, source and tenant binding once issued. Avoid a plan being
-- moved to a different learner or its evidence origin being rewritten.
CREATE FUNCTION public.guard_learning_support_plan_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.school_id IS DISTINCT FROM OLD.school_id OR NEW.student_id IS DISTINCT FROM OLD.student_id
     OR NEW.teacher_id IS DISTINCT FROM OLD.teacher_id OR NEW.source_kind IS DISTINCT FROM OLD.source_kind
     OR NEW.baseline_mastery IS DISTINCT FROM OLD.baseline_mastery
     OR NEW.ale_observed_at IS DISTINCT FROM OLD.ale_observed_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'support_plan_identity_immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_learning_support_plan_identity_before_update
  BEFORE UPDATE ON public.learning_support_plans FOR EACH ROW
  EXECUTE FUNCTION public.guard_learning_support_plan_identity();
