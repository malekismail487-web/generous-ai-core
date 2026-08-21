-- Backfill legacy assignment_submissions rows into the canonical submissions table.
INSERT INTO public.submissions (assignment_id, student_id, content, submitted_at, grade, feedback, graded_at, graded_by)
SELECT a.assignment_id,
       a.student_id,
       a.content,
       a.submitted_at,
       CASE WHEN a.grade ~ '^[0-9]+$' THEN a.grade::int ELSE NULL END,
       a.feedback,
       CASE WHEN a.grade ~ '^[0-9]+$' THEN a.graded_at ELSE NULL END,
       CASE WHEN a.grade ~ '^[0-9]+$' THEN a.graded_by ELSE NULL END
FROM public.assignment_submissions a
WHERE NOT EXISTS (
  SELECT 1 FROM public.submissions s
  WHERE s.assignment_id = a.assignment_id
    AND s.student_id = a.student_id
);

COMMENT ON TABLE public.assignment_submissions IS
  'DEPRECATED — superseded by public.submissions. Retained for historical data only; application code must read and write public.submissions.';