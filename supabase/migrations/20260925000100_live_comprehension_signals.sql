-- Student feedback reaches the teacher without publishing a child's ALE
-- profile, prompt, explanation text, or free-form personal message.
CREATE TABLE public.live_comprehension_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_seq bigint NOT NULL CHECK (event_seq > 0),
  kind text NOT NULL DEFAULT 'EXPLANATION_NOT_CLEAR' CHECK (kind = 'EXPLANATION_NOT_CLEAR'),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged')),
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users(id),
  UNIQUE (lesson_id, student_id, event_seq, kind)
);
CREATE INDEX live_comprehension_teacher_idx
  ON public.live_comprehension_signals(lesson_id, status, event_seq);

ALTER TABLE public.live_comprehension_signals ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.live_comprehension_signals TO authenticated;

CREATE POLICY "student sees own comprehension signals" ON public.live_comprehension_signals
  FOR SELECT TO authenticated USING (student_id = auth.uid());

CREATE POLICY "meeting teacher sees comprehension signals" ON public.live_comprehension_signals
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.live_meetings m
    WHERE m.lesson_id = live_comprehension_signals.lesson_id
      AND m.school_id = live_comprehension_signals.school_id
      AND m.teacher_id = auth.uid()
  ));

CREATE POLICY "student signals visible teacher event" ON public.live_comprehension_signals
  FOR INSERT TO authenticated WITH CHECK (
    student_id = auth.uid() AND status = 'open'
    AND acknowledged_at IS NULL AND acknowledged_by IS NULL
    AND EXISTS (
      SELECT 1 FROM public.live_meetings m
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE m.lesson_id = live_comprehension_signals.lesson_id
        AND m.school_id = live_comprehension_signals.school_id
        AND m.status = 'live'
        AND p.school_id = m.school_id AND p.grade_level = m.grade_level
        AND p.user_type = 'student' AND p.is_active
    )
    AND EXISTS (
      SELECT 1 FROM public.lesson_events e
      WHERE e.lesson_id = live_comprehension_signals.lesson_id
        AND e.school_id = live_comprehension_signals.school_id
        AND e.seq = live_comprehension_signals.event_seq
        AND e.teacher_visible
    )
  );

CREATE POLICY "meeting teacher acknowledges signal" ON public.live_comprehension_signals
  FOR UPDATE TO authenticated USING (EXISTS (
    SELECT 1 FROM public.live_meetings m
    WHERE m.lesson_id = live_comprehension_signals.lesson_id
      AND m.school_id = live_comprehension_signals.school_id
      AND m.teacher_id = auth.uid()
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM public.live_meetings m
    WHERE m.lesson_id = live_comprehension_signals.lesson_id
      AND m.school_id = live_comprehension_signals.school_id
      AND m.teacher_id = auth.uid()
  ));

CREATE FUNCTION public.guard_live_comprehension_signal() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
    RETURN NEW;
  END IF;
  IF NEW.lesson_id IS DISTINCT FROM OLD.lesson_id OR NEW.school_id IS DISTINCT FROM OLD.school_id
     OR NEW.student_id IS DISTINCT FROM OLD.student_id OR NEW.event_seq IS DISTINCT FROM OLD.event_seq
     OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'comprehension_signal_identity_immutable';
  END IF;
  IF OLD.status = 'acknowledged' OR NEW.status <> 'acknowledged' THEN
    RAISE EXCEPTION 'comprehension_signal_transition_forbidden';
  END IF;
  NEW.acknowledged_at := now();
  NEW.acknowledged_by := auth.uid();
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_live_comprehension_signal_before_insert_update
  BEFORE INSERT OR UPDATE ON public.live_comprehension_signals FOR EACH ROW
  EXECUTE FUNCTION public.guard_live_comprehension_signal();

ALTER PUBLICATION supabase_realtime ADD TABLE public.live_comprehension_signals;
