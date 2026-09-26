-- Reuse the existing private student/teacher learning-record exchange instead of
-- creating a second help-message system. A linked question retains plan provenance.
ALTER TABLE public.student_learning_records
  ADD COLUMN support_plan_id uuid REFERENCES public.learning_support_plans(id) ON DELETE RESTRICT;

CREATE INDEX student_learning_records_support_plan_idx
  ON public.student_learning_records(support_plan_id, created_at DESC)
  WHERE support_plan_id IS NOT NULL;

CREATE FUNCTION public.guard_support_plan_learning_question() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  source_plan public.learning_support_plans%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.support_plan_id IS DISTINCT FROM OLD.support_plan_id THEN
      RAISE EXCEPTION 'support_question_plan_immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.support_plan_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO source_plan FROM public.learning_support_plans WHERE id = NEW.support_plan_id;
  IF NOT FOUND OR source_plan.status <> 'active' OR NEW.student_id IS DISTINCT FROM auth.uid()
     OR NEW.kind <> 'QUESTION' OR NEW.school_id IS DISTINCT FROM source_plan.school_id
     OR NEW.student_id IS DISTINCT FROM source_plan.student_id
     OR NEW.teacher_id IS DISTINCT FROM source_plan.teacher_id
     OR NEW.subject IS DISTINCT FROM source_plan.subject
     OR NEW.topic IS DISTINCT FROM source_plan.topic THEN
    RAISE EXCEPTION 'support_question_plan_mismatch';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_support_plan_learning_question_before_insert
  BEFORE INSERT ON public.student_learning_records FOR EACH ROW
  EXECUTE FUNCTION public.guard_support_plan_learning_question();
CREATE TRIGGER guard_support_plan_learning_question_before_update
  BEFORE UPDATE ON public.student_learning_records FOR EACH ROW
  EXECUTE FUNCTION public.guard_support_plan_learning_question();
