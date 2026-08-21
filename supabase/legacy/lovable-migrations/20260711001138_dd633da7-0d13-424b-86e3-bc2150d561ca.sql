
CREATE TABLE IF NOT EXISTS public.live_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  subject text,
  title text NOT NULL,
  grade_level text NOT NULL,
  share_code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','ended')),
  scheduled_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS live_meetings_school_grade_status_idx
  ON public.live_meetings (school_id, grade_level, status);
CREATE INDEX IF NOT EXISTS live_meetings_lesson_idx
  ON public.live_meetings (lesson_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_meetings TO authenticated;
GRANT ALL ON public.live_meetings TO service_role;

ALTER TABLE public.live_meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers manage own live meetings"
  ON public.live_meetings FOR ALL
  TO authenticated
  USING (
    teacher_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.school_id = live_meetings.school_id)
  )
  WITH CHECK (
    teacher_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.school_id = live_meetings.school_id)
  );

CREATE POLICY "Students view meetings for their grade"
  ON public.live_meetings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.school_id = live_meetings.school_id
        AND p.grade_level = live_meetings.grade_level
    )
  );

CREATE POLICY "Admins view all meetings in school"
  ON public.live_meetings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.school_id = live_meetings.school_id
    )
    AND public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE OR REPLACE FUNCTION public.update_live_meetings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_live_meetings_updated_at ON public.live_meetings;
CREATE TRIGGER trg_live_meetings_updated_at
  BEFORE UPDATE ON public.live_meetings
  FOR EACH ROW EXECUTE FUNCTION public.update_live_meetings_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.live_meetings;

GRANT SELECT, INSERT ON public.lesson_events TO authenticated;
GRANT ALL ON public.lesson_events TO service_role;
ALTER TABLE public.lesson_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Teachers insert events into own meetings" ON public.lesson_events;
CREATE POLICY "Teachers insert events into own meetings"
  ON public.lesson_events FOR INSERT
  TO authenticated
  WITH CHECK (
    teacher_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.live_meetings m
      WHERE m.lesson_id = lesson_events.lesson_id
        AND m.teacher_id = auth.uid()
        AND m.school_id = lesson_events.school_id
    )
  );

DROP POLICY IF EXISTS "Participants read events for their meetings" ON public.lesson_events;
CREATE POLICY "Participants read events for their meetings"
  ON public.lesson_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.live_meetings m
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE m.lesson_id = lesson_events.lesson_id
        AND p.school_id = m.school_id
        AND (m.teacher_id = auth.uid() OR p.grade_level = m.grade_level)
    )
  );
