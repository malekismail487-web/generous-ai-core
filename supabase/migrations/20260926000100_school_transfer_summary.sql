-- School-level portfolio, not individual learner evidence or a causal impact estimate.
-- Fewer than three distinct learners with recent checks yields no counts.
CREATE FUNCTION public.get_school_transfer_summary(p_school_id uuid)
RETURNS TABLE (
  evidence_state text,
  learner_count bigint,
  plans_with_checks bigint,
  awaiting_learner bigint,
  awaiting_teacher bigint,
  demonstrated_on_one_check bigint,
  not_yet_demonstrated bigint,
  inconclusive bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_school_id IS NULL OR NOT COALESCE(public.is_school_admin_of(auth.uid(), p_school_id), false) THEN
    RAISE EXCEPTION 'school_transfer_summary_forbidden';
  END IF;

  RETURN QUERY
    WITH latest AS (
      SELECT DISTINCT ON (tc.plan_id)
        tc.plan_id, tc.student_id, tc.status, tc.verdict
      FROM public.learning_support_transfer_checks tc
      WHERE tc.school_id = p_school_id AND tc.created_at >= now() - interval '90 days'
      ORDER BY tc.plan_id, tc.created_at DESC, tc.id DESC
    ), counts AS (
      SELECT COUNT(DISTINCT latest.student_id) AS learners,
        COUNT(*) AS plans,
        COUNT(*) FILTER (WHERE latest.status = 'OPEN') AS open_count,
        COUNT(*) FILTER (WHERE latest.status = 'SUBMITTED') AS submitted_count,
        COUNT(*) FILTER (WHERE latest.status = 'REVIEWED' AND latest.verdict = 'DEMONSTRATED') AS demonstrated_count,
        COUNT(*) FILTER (WHERE latest.status = 'REVIEWED' AND latest.verdict = 'NOT_YET') AS not_yet_count,
        COUNT(*) FILTER (WHERE latest.status = 'REVIEWED' AND latest.verdict = 'INCONCLUSIVE') AS inconclusive_count
      FROM latest
    )
    SELECT CASE WHEN counts.learners >= 3 THEN 'AVAILABLE' ELSE 'INSUFFICIENT_COHORT' END,
      CASE WHEN counts.learners >= 3 THEN counts.learners ELSE NULL::bigint END,
      CASE WHEN counts.learners >= 3 THEN counts.plans ELSE NULL::bigint END,
      CASE WHEN counts.learners >= 3 THEN counts.open_count ELSE NULL::bigint END,
      CASE WHEN counts.learners >= 3 THEN counts.submitted_count ELSE NULL::bigint END,
      CASE WHEN counts.learners >= 3 THEN counts.demonstrated_count ELSE NULL::bigint END,
      CASE WHEN counts.learners >= 3 THEN counts.not_yet_count ELSE NULL::bigint END,
      CASE WHEN counts.learners >= 3 THEN counts.inconclusive_count ELSE NULL::bigint END
    FROM counts;
END;
$$;

REVOKE ALL ON FUNCTION public.get_school_transfer_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_school_transfer_summary(uuid) TO authenticated;
