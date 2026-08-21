
CREATE TYPE public.mi_event_type AS ENUM (
  'homework_submission','exam_submission','material_view','lesson_event',
  'tutor_interaction','lecture_generated','material_uploaded'
);

CREATE TABLE public.mi_educational_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  school_id    uuid REFERENCES public.schools(id) ON DELETE SET NULL,
  region_id    uuid REFERENCES public.mc_regions(id) ON DELETE SET NULL,
  subject_id   uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  concept_ref  text,
  grade_level  text,
  event_type   public.mi_event_type NOT NULL,
  student_hash text,
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX mi_events_tenant_time_idx ON public.mi_educational_events (tenant_id, occurred_at DESC);
CREATE INDEX mi_events_school_time_idx ON public.mi_educational_events (school_id, occurred_at DESC);
CREATE INDEX mi_events_region_time_idx ON public.mi_educational_events (region_id, occurred_at DESC);
CREATE INDEX mi_events_type_idx        ON public.mi_educational_events (event_type);
CREATE INDEX mi_events_subject_idx     ON public.mi_educational_events (subject_id);

GRANT SELECT ON public.mi_educational_events TO authenticated;
GRANT ALL    ON public.mi_educational_events TO service_role;

ALTER TABLE public.mi_educational_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "School admins can read own-school events"
ON public.mi_educational_events FOR SELECT TO authenticated
USING (
  school_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.school_admins sa
    WHERE sa.school_id = mi_educational_events.school_id
      AND sa.user_id   = auth.uid()
  )
);

CREATE POLICY "Super admin can read all mi events"
ON public.mi_educational_events FOR SELECT TO authenticated
USING (public.is_super_admin_caller());

-- Helpers --------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mi_hash_student(_tenant_id uuid, _student_id uuid)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN _student_id IS NULL THEN NULL
    ELSE md5(_tenant_id::text || ':' || _student_id::text)
  END
$$;

CREATE OR REPLACE FUNCTION public.mi_school_region(_school_id uuid)
RETURNS uuid LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT region_id FROM public.mc_school_region_assignments
  WHERE school_id = _school_id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.mi_emit_event(
  _tenant_id uuid, _school_id uuid, _subject_id uuid, _concept_ref text,
  _grade_level text, _event_type public.mi_event_type, _student_id uuid, _payload jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _tenant_id IS NULL THEN RETURN; END IF;

  INSERT INTO public.mi_educational_events (
    tenant_id, school_id, region_id, subject_id, concept_ref,
    grade_level, event_type, student_hash, payload, occurred_at
  ) VALUES (
    _tenant_id, _school_id, public.mi_school_region(_school_id),
    _subject_id, _concept_ref, _grade_level, _event_type,
    public.mi_hash_student(_tenant_id, _student_id),
    COALESCE(_payload, '{}'::jsonb), now()
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'mi_emit_event failed: %', SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.mi_emit_event(uuid, uuid, uuid, text, text, public.mi_event_type, uuid, jsonb) FROM PUBLIC;

-- Triggers -------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mi_tg_assignment_submission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid; v_school uuid; v_subject uuid; v_grade text;
BEGIN
  SELECT a.school_id, a.subject_id, a.grade_level INTO v_school, v_subject, v_grade
    FROM public.assignments a WHERE a.id = NEW.assignment_id;
  SELECT tenant_id INTO v_tenant FROM public.schools WHERE id = v_school;
  PERFORM public.mi_emit_event(v_tenant, v_school, v_subject, NULL, v_grade,
    'homework_submission'::public.mi_event_type, NEW.student_id,
    jsonb_build_object('grade', NEW.grade, 'graded', NEW.graded_at IS NOT NULL, 'submitted_at', NEW.submitted_at));
  RETURN NEW;
END; $$;
CREATE TRIGGER mi_after_assignment_submission AFTER INSERT ON public.assignment_submissions
FOR EACH ROW EXECUTE FUNCTION public.mi_tg_assignment_submission();

CREATE OR REPLACE FUNCTION public.mi_tg_exam_submission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid; v_school uuid; v_subject uuid;
BEGIN
  SELECT e.school_id, e.subject_id INTO v_school, v_subject FROM public.exams e WHERE e.id = NEW.exam_id;
  SELECT tenant_id INTO v_tenant FROM public.schools WHERE id = v_school;
  PERFORM public.mi_emit_event(v_tenant, v_school, v_subject, NULL, NULL,
    'exam_submission'::public.mi_event_type, NEW.student_id,
    jsonb_build_object('score', NEW.score, 'auto_graded', NEW.auto_graded, 'submitted_at', NEW.submitted_at));
  RETURN NEW;
END; $$;
CREATE TRIGGER mi_after_exam_submission AFTER INSERT ON public.exam_submissions
FOR EACH ROW EXECUTE FUNCTION public.mi_tg_exam_submission();

CREATE OR REPLACE FUNCTION public.mi_tg_material_view()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid; v_school uuid;
BEGIN
  SELECT m.school_id INTO v_school FROM public.materials m WHERE m.id = NEW.material_id;
  IF v_school IS NULL THEN
    SELECT cm.school_id INTO v_school FROM public.course_materials cm WHERE cm.id = NEW.material_id;
  END IF;
  SELECT tenant_id INTO v_tenant FROM public.schools WHERE id = v_school;
  PERFORM public.mi_emit_event(v_tenant, v_school, NULL, NULL, NULL,
    'material_view'::public.mi_event_type, NEW.user_id,
    jsonb_build_object('material_id', NEW.material_id));
  RETURN NEW;
END; $$;
CREATE TRIGGER mi_after_material_view AFTER INSERT ON public.material_views
FOR EACH ROW EXECUTE FUNCTION public.mi_tg_material_view();

CREATE OR REPLACE FUNCTION public.mi_tg_lesson_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.schools WHERE id = NEW.school_id;
  PERFORM public.mi_emit_event(v_tenant, NEW.school_id, NULL, NEW.concept_ref, NULL,
    'lesson_event'::public.mi_event_type, NULL,
    jsonb_build_object('kind', NEW.kind, 'priority', NEW.priority));
  RETURN NEW;
END; $$;
CREATE TRIGGER mi_after_lesson_event AFTER INSERT ON public.lesson_events
FOR EACH ROW EXECUTE FUNCTION public.mi_tg_lesson_event();

CREATE OR REPLACE FUNCTION public.mi_tg_chat_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid; v_school uuid;
BEGIN
  SELECT p.school_id INTO v_school FROM public.profiles p WHERE p.id = NEW.user_id;
  SELECT tenant_id INTO v_tenant FROM public.schools WHERE id = v_school;
  PERFORM public.mi_emit_event(v_tenant, v_school, NULL, NULL, NULL,
    'tutor_interaction'::public.mi_event_type, NEW.user_id,
    jsonb_build_object('length', COALESCE(char_length(NEW.content), 0)));
  RETURN NEW;
END; $$;
CREATE TRIGGER mi_after_chat_message AFTER INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.mi_tg_chat_message();

CREATE OR REPLACE FUNCTION public.mi_tg_saved_lecture()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.schools WHERE id = NEW.school_id;
  PERFORM public.mi_emit_event(v_tenant, NEW.school_id, NULL, NULL, NEW.grade_level,
    'lecture_generated'::public.mi_event_type, NEW.user_id,
    jsonb_build_object('subject', NEW.subject, 'mode', NEW.mode));
  RETURN NEW;
END; $$;
CREATE TRIGGER mi_after_saved_lecture AFTER INSERT ON public.saved_lectures
FOR EACH ROW EXECUTE FUNCTION public.mi_tg_saved_lecture();

CREATE OR REPLACE FUNCTION public.mi_tg_course_material()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.schools WHERE id = NEW.school_id;
  PERFORM public.mi_emit_event(v_tenant, NEW.school_id, NULL, NULL, NEW.grade_level,
    'material_uploaded'::public.mi_event_type, NEW.uploaded_by,
    jsonb_build_object('subject', NEW.subject, 'has_file', NEW.file_url IS NOT NULL));
  RETURN NEW;
END; $$;
CREATE TRIGGER mi_after_course_material AFTER INSERT ON public.course_materials
FOR EACH ROW EXECUTE FUNCTION public.mi_tg_course_material();
