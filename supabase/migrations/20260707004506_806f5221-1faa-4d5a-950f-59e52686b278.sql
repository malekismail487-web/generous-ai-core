-- LSE Stage A5 — Realtime private-channel authorization for lesson:<uuid> topics.
--
-- The Stage A1 AFTER INSERT trigger on public.lesson_events calls
-- realtime.send(payload, 'lesson_event', 'lesson:' || lesson_id, TRUE).
-- The TRUE flag marks the channel private, which means Realtime enforces
-- SELECT-style RLS on realtime.messages before delivering the frame to any
-- subscriber. Without a policy here, no client can receive events.
--
-- Contract: a subscriber may read frames on topic 'lesson:<uuid>' iff they
-- have an established, school-scoped relationship to that lesson. The three
-- allowed relationships are enumerated below; anything else is denied by
-- default (RLS is deny-by-default when enabled and no policy matches).

-- Idempotent: this migration may be re-run safely.
DROP POLICY IF EXISTS "LSE lesson channel authenticated read" ON realtime.messages;

CREATE POLICY "LSE lesson channel authenticated read"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() LIKE 'lesson:%'
  AND (
    -- 1. Student enrolled in the lesson session.
    EXISTS (
      SELECT 1
      FROM public.lesson_sessions ls
      WHERE ls.lesson_id::text = substring(realtime.topic() FROM 8)
        AND ls.student_id = (SELECT auth.uid())
    )
    OR
    -- 2. Teacher who has authored at least one event for this lesson.
    EXISTS (
      SELECT 1
      FROM public.lesson_events le
      WHERE le.lesson_id::text = substring(realtime.topic() FROM 8)
        AND le.teacher_id = (SELECT auth.uid())
    )
    OR
    -- 3. School administrator whose school owns the lesson.
    (
      public.has_role((SELECT auth.uid()), 'admin'::app_role)
      AND EXISTS (
        SELECT 1
        FROM public.lesson_events le
        JOIN public.profiles p ON p.id = (SELECT auth.uid())
        WHERE le.lesson_id::text = substring(realtime.topic() FROM 8)
          AND le.school_id = p.school_id
      )
    )
  )
);

COMMENT ON POLICY "LSE lesson channel authenticated read" ON realtime.messages IS
  'LSE Stage A5. Authorizes subscribers to private lesson:<uuid> channels: '
  'enrolled student (lesson_sessions), authoring teacher (lesson_events), '
  'or same-school admin. Non-lesson topics are unaffected and fall through '
  'to any other policies present.';