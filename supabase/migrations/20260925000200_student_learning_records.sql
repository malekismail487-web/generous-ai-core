-- Student-to-school learning evidence. Questions, corrections and portfolio
-- claims are deliberately self-reports until an authorized teacher responds.
CREATE TABLE public.student_learning_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  teacher_id uuid REFERENCES auth.users(id),
  kind text NOT NULL CHECK (kind IN ('QUESTION', 'MISCONCEPTION', 'EVIDENCE')),
  subject text NOT NULL CHECK (char_length(btrim(subject)) BETWEEN 1 AND 120),
  topic text NOT NULL CHECK (char_length(btrim(topic)) BETWEEN 1 AND 180),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 10 AND 2000),
  correction text CHECK (correction IS NULL OR char_length(btrim(correction)) BETWEEN 10 AND 2000),
  next_step text CHECK (next_step IS NULL OR char_length(btrim(next_step)) BETWEEN 5 AND 500),
  teacher_reply text CHECK (teacher_reply IS NULL OR char_length(btrim(teacher_reply)) BETWEEN 5 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  teacher_replied_at timestamptz,
  CHECK (kind <> 'QUESTION' OR teacher_id IS NOT NULL),
  CHECK (teacher_reply IS NULL OR teacher_id IS NOT NULL),
  CHECK (kind <> 'MISCONCEPTION' OR correction IS NOT NULL),
  CHECK (kind <> 'EVIDENCE' OR next_step IS NOT NULL)
);
CREATE INDEX student_learning_records_student_idx
  ON public.student_learning_records(student_id, created_at DESC);
CREATE INDEX student_learning_records_teacher_idx
  ON public.student_learning_records(teacher_id, created_at DESC)
  WHERE teacher_id IS NOT NULL;

ALTER TABLE public.student_learning_records ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.student_learning_records TO authenticated;

-- Students cannot read every teacher's profile under existing RLS. This
-- narrow definer check evaluates the relationship without exposing profiles.
CREATE FUNCTION public.can_route_student_learning_record(
  p_student_id uuid, p_school_id uuid, p_teacher_id uuid, p_subject text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_student_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.profiles student
      WHERE student.id = p_student_id AND student.school_id = p_school_id
        AND student.user_type = 'student' AND student.is_active AND student.status = 'approved')
    AND (p_teacher_id IS NULL OR (
      EXISTS (SELECT 1 FROM public.profiles teacher
        WHERE teacher.id = p_teacher_id AND teacher.school_id = p_school_id
          AND teacher.user_type = 'teacher' AND teacher.is_active AND teacher.status = 'approved')
      AND (
        EXISTS (SELECT 1 FROM public.profiles student
          WHERE student.id = p_student_id AND student.student_teacher_id = p_teacher_id::text)
        OR EXISTS (SELECT 1 FROM public.learning_support_plans plan
          WHERE plan.student_id = p_student_id AND plan.school_id = p_school_id
            AND plan.teacher_id = p_teacher_id
            AND lower(btrim(plan.subject)) = lower(btrim(p_subject)))
        OR EXISTS (SELECT 1 FROM public.assignments assignment
          JOIN public.profiles student ON student.id = p_student_id
          WHERE assignment.school_id = p_school_id AND assignment.teacher_id = p_teacher_id
            AND lower(btrim(assignment.subject)) = lower(btrim(p_subject))
            AND assignment.grade_level IN (student.grade_level, 'All')
            AND (assignment.class_id IS NULL OR EXISTS (
              SELECT 1 FROM public.student_classes membership
              WHERE membership.student_id = p_student_id AND membership.class_id = assignment.class_id)))
      )
    ));
$$;
REVOKE ALL ON FUNCTION public.can_route_student_learning_record(uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_route_student_learning_record(uuid, uuid, uuid, text) TO authenticated;

CREATE POLICY "student records own school learning evidence"
  ON public.student_learning_records FOR INSERT TO authenticated WITH CHECK (
    student_id = auth.uid() AND teacher_reply IS NULL AND teacher_replied_at IS NULL
    AND public.can_route_student_learning_record(student_id, school_id, teacher_id, subject)
  );

CREATE POLICY "learner and assigned teacher read learning record"
  ON public.student_learning_records FOR SELECT TO authenticated USING (
    (student_id = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.school_id = student_learning_records.school_id))
    OR (teacher_id = auth.uid() AND public.has_role(auth.uid(), 'teacher'::app_role)
      AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
        AND p.school_id = student_learning_records.school_id AND p.is_active))
  );

CREATE POLICY "assigned teacher replies to learning record"
  ON public.student_learning_records FOR UPDATE TO authenticated USING (
    teacher_id = auth.uid() AND public.has_role(auth.uid(), 'teacher'::app_role)
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.school_id = student_learning_records.school_id AND p.is_active)
  ) WITH CHECK (
    teacher_id = auth.uid() AND public.has_role(auth.uid(), 'teacher'::app_role)
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
      AND p.school_id = student_learning_records.school_id AND p.is_active)
  );

-- RLS alone cannot stop an assigned teacher from rewriting the student's
-- claim during UPDATE. Allow only the reply, and stamp time on the server.
CREATE FUNCTION public.guard_student_learning_record() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
    NEW.teacher_replied_at := NULL;
  ELSE
    IF OLD.teacher_reply IS NOT NULL OR NEW.teacher_reply IS NULL THEN
      RAISE EXCEPTION 'teacher_reply_append_only';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.school_id IS DISTINCT FROM OLD.school_id
       OR NEW.student_id IS DISTINCT FROM OLD.student_id OR NEW.teacher_id IS DISTINCT FROM OLD.teacher_id
       OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.subject IS DISTINCT FROM OLD.subject
       OR NEW.topic IS DISTINCT FROM OLD.topic OR NEW.body IS DISTINCT FROM OLD.body
       OR NEW.correction IS DISTINCT FROM OLD.correction OR NEW.next_step IS DISTINCT FROM OLD.next_step
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'student_learning_record_immutable';
    END IF;
    NEW.teacher_replied_at := CASE WHEN NEW.teacher_reply IS NULL THEN NULL ELSE now() END;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_student_learning_record_before_insert
  BEFORE INSERT ON public.student_learning_records FOR EACH ROW
  EXECUTE FUNCTION public.guard_student_learning_record();
CREATE TRIGGER guard_student_learning_record_before_update
  BEFORE UPDATE ON public.student_learning_records FOR EACH ROW
  EXECUTE FUNCTION public.guard_student_learning_record();
