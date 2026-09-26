-- School operations by grade cohort. These are service/workflow signals, not
-- learning outcomes or comparisons of teacher quality. Suppress small cohorts.
CREATE FUNCTION public.get_school_learning_attention_by_grade(p_school_id uuid)
RETURNS TABLE (
  grade_label text,
  learner_count bigint,
  learners_with_active_plans bigint,
  learners_with_recent_help bigint,
  learners_awaiting_teacher_reply bigint,
  learners_with_reviewed_transfer bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_school_id IS NULL OR NOT COALESCE(public.is_school_admin_of(auth.uid(), p_school_id), false) THEN
    RAISE EXCEPTION 'school_learning_attention_forbidden';
  END IF;

  RETURN QUERY
    WITH cohort AS (
      SELECT p.id AS learner_id, COALESCE(NULLIF(btrim(p.grade_level), ''), 'Unassigned') AS cohort_grade
      FROM public.profiles p
      WHERE p.school_id = p_school_id AND p.user_type = 'student'
        AND p.is_active AND p.status = 'approved'
    ), signals AS (
      SELECT c.cohort_grade,
        EXISTS (SELECT 1 FROM public.learning_support_plans sp
          WHERE sp.school_id = p_school_id AND sp.student_id = c.learner_id
            AND sp.status = 'active') AS active_plan,
        EXISTS (SELECT 1 FROM public.learning_support_checkins ci
          JOIN public.learning_support_plans sp ON sp.id = ci.plan_id
          WHERE sp.school_id = p_school_id AND sp.student_id = c.learner_id
            AND ci.kind = 'NEEDS_HELP' AND ci.created_at >= now() - interval '30 days') AS recent_help,
        EXISTS (SELECT 1 FROM public.student_learning_records lr
          WHERE lr.school_id = p_school_id AND lr.student_id = c.learner_id
            AND lr.support_plan_id IS NOT NULL AND lr.teacher_reply IS NULL) AS awaiting_reply,
        EXISTS (SELECT 1 FROM public.learning_support_transfer_checks tc
          WHERE tc.school_id = p_school_id AND tc.student_id = c.learner_id
            AND tc.status = 'REVIEWED' AND tc.reviewed_at >= now() - interval '90 days') AS reviewed_transfer
      FROM cohort c
    )
    SELECT s.cohort_grade, COUNT(*),
      COUNT(*) FILTER (WHERE s.active_plan),
      COUNT(*) FILTER (WHERE s.recent_help),
      COUNT(*) FILTER (WHERE s.awaiting_reply),
      COUNT(*) FILTER (WHERE s.reviewed_transfer)
    FROM signals s
    GROUP BY s.cohort_grade
    HAVING COUNT(*) >= 3
    ORDER BY s.cohort_grade;
END;
$$;

REVOKE ALL ON FUNCTION public.get_school_learning_attention_by_grade(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_school_learning_attention_by_grade(uuid) TO authenticated;
