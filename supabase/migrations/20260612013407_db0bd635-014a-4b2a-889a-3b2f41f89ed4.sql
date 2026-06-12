
-- Add relevance override columns
ALTER TABLE public.course_materials ADD COLUMN IF NOT EXISTS relevance_override boolean NOT NULL DEFAULT false;
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS relevance_override boolean NOT NULL DEFAULT false;

-- Slugify helper (matches client-side slug logic)
CREATE OR REPLACE FUNCTION public._slugify_name(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(both '_' from lower(regexp_replace(coalesce(p,''), '[^a-zA-Z0-9]+', '_', 'g')));
$$;

-- Enforce teacher category trigger function
CREATE OR REPLACE FUNCTION public.enforce_teacher_category()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cat_id uuid;
  v_cat_name text;
  v_subject_slug text;
  v_expected text;
  v_actual text := NEW.subject;
BEGIN
  -- Only enforce for teacher-role users (admins, students unaffected)
  IF v_uid IS NULL THEN RETURN NEW; END IF;
  IF NOT public.has_role(v_uid, 'teacher'::app_role) THEN RETURN NEW; END IF;

  SELECT teacher_category_id INTO v_cat_id
    FROM public.profiles WHERE id = v_uid;

  -- Legacy teachers with no category: no enforcement
  IF v_cat_id IS NULL THEN RETURN NEW; END IF;

  SELECT tc.name, s.slug
    INTO v_cat_name, v_subject_slug
    FROM public.teacher_categories tc
    LEFT JOIN public.subjects s ON s.id = tc.subject_id
    WHERE tc.id = v_cat_id;

  v_expected := COALESCE(v_subject_slug, public._slugify_name(v_cat_name));

  IF v_expected IS NULL OR v_expected = '' THEN RETURN NEW; END IF;

  IF v_actual IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'Teacher category violation: your category is "%", but this content is filed under "%". You can only post for your assigned category.', v_cat_name, v_actual
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_teacher_category_materials ON public.course_materials;
CREATE TRIGGER trg_enforce_teacher_category_materials
  BEFORE INSERT ON public.course_materials
  FOR EACH ROW EXECUTE FUNCTION public.enforce_teacher_category();

DROP TRIGGER IF EXISTS trg_enforce_teacher_category_assignments ON public.assignments;
CREATE TRIGGER trg_enforce_teacher_category_assignments
  BEFORE INSERT ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_teacher_category();
