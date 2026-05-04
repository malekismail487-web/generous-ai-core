CREATE OR REPLACE FUNCTION public.get_weakest_topics(
  p_user_id uuid,
  p_subject text DEFAULT NULL,
  p_limit integer DEFAULT 5,
  p_school_id uuid DEFAULT NULL
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
      AND (p_school_id IS NULL OR cm.school_id IS NULL OR cm.school_id = p_school_id)
    ORDER BY cm.mastery_score ASC, cm.last_practiced_at ASC NULLS FIRST
    LIMIT GREATEST(1, LEAST(p_limit, 50));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_due_reviews(
  p_user_id uuid,
  p_limit integer DEFAULT 10,
  p_school_id uuid DEFAULT NULL
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
      AND (p_school_id IS NULL OR cm.school_id IS NULL OR cm.school_id = p_school_id)
    ORDER BY cm.next_review_at ASC
    LIMIT GREATEST(1, LEAST(p_limit, 50));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_weakest_topics(uuid, text, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_due_reviews(uuid, integer, uuid) TO authenticated;