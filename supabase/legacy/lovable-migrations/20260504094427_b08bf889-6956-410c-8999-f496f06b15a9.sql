-- Phase 2B: Cross-Surface Mastery Engine read RPCs

CREATE OR REPLACE FUNCTION public.can_view_student_mastery(p_viewer uuid, p_student uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_viewer_school uuid;
  v_student_school uuid;
  v_viewer_type text;
  v_viewer_email text;
BEGIN
  IF p_viewer IS NULL OR p_student IS NULL THEN
    RETURN false;
  END IF;

  -- Self
  IF p_viewer = p_student THEN
    RETURN true;
  END IF;

  -- Super admin
  SELECT email INTO v_viewer_email FROM auth.users WHERE id = p_viewer;
  IF v_viewer_email = 'malekismail487@gmail.com' THEN
    RETURN true;
  END IF;

  SELECT school_id, user_type INTO v_viewer_school, v_viewer_type
  FROM public.profiles WHERE id = p_viewer;

  SELECT school_id INTO v_student_school
  FROM public.profiles WHERE id = p_student;

  -- Parent link
  IF v_viewer_type = 'parent' AND public.is_parent_of(p_viewer, p_student) THEN
    RETURN true;
  END IF;

  -- Teacher / school_admin in same school
  IF v_viewer_type IN ('teacher','school_admin')
     AND v_viewer_school IS NOT NULL
     AND v_viewer_school = v_student_school THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_weakest_topics(
  p_user_id uuid,
  p_subject text DEFAULT NULL,
  p_limit integer DEFAULT 5
)
RETURNS TABLE (
  subject text,
  topic text,
  mastery_score numeric,
  next_review_at timestamptz,
  last_practiced_at timestamptz,
  repetitions integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_view_student_mastery(auth.uid(), p_user_id) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  RETURN QUERY
    SELECT cm.subject, cm.topic, cm.mastery_score,
           cm.next_review_at, cm.last_practiced_at, cm.repetitions
    FROM public.concept_mastery cm
    WHERE cm.user_id = p_user_id
      AND (p_subject IS NULL OR cm.subject = p_subject)
    ORDER BY cm.mastery_score ASC, cm.last_practiced_at ASC NULLS FIRST
    LIMIT GREATEST(1, LEAST(p_limit, 50));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_due_reviews(
  p_user_id uuid,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  subject text,
  topic text,
  mastery_score numeric,
  next_review_at timestamptz,
  overdue_hours numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_view_student_mastery(auth.uid(), p_user_id) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  RETURN QUERY
    SELECT cm.subject, cm.topic, cm.mastery_score, cm.next_review_at,
           EXTRACT(EPOCH FROM (now() - cm.next_review_at)) / 3600.0 AS overdue_hours
    FROM public.concept_mastery cm
    WHERE cm.user_id = p_user_id
      AND cm.next_review_at IS NOT NULL
      AND cm.next_review_at <= now()
    ORDER BY cm.next_review_at ASC
    LIMIT GREATEST(1, LEAST(p_limit, 50));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_weakest_topics(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_due_reviews(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_student_mastery(uuid, uuid) TO authenticated;