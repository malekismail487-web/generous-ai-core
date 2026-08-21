
-- =====================================================================
-- LSE Stage A1 — Event foundation
-- =====================================================================

-- ---------- lesson_events ---------------------------------------------
CREATE TABLE public.lesson_events (
  id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id       UUID        NOT NULL,
  seq             BIGINT      NOT NULL DEFAULT 0,
  kind            TEXT        NOT NULL CHECK (kind IN (
                    'concept','definition','formula','example',
                    'question','discussion','admin','silence'
                  )),
  text            TEXT        NOT NULL DEFAULT '',
  concept_ref     TEXT,
  priority        SMALLINT    NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  teacher_visible BOOLEAN     NOT NULL DEFAULT TRUE,
  teacher_id      UUID        NOT NULL,
  school_id       UUID        NOT NULL,
  ts              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.lesson_events TO authenticated;
GRANT ALL              ON public.lesson_events TO service_role;

ALTER TABLE public.lesson_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers insert own lesson events"
  ON public.lesson_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    teacher_id = auth.uid()
    AND school_id = public.get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.user_type IN ('teacher','school_admin')
    )
  );

CREATE POLICY "Staff read school lesson events"
  ON public.lesson_events
  FOR SELECT
  TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.user_type IN ('teacher','school_admin')
    )
  );

CREATE POLICY "Students read visible lesson events"
  ON public.lesson_events
  FOR SELECT
  TO authenticated
  USING (
    teacher_visible = TRUE
    AND school_id = public.get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.user_type = 'student'
    )
  );

CREATE POLICY "Admins read all lesson events"
  ON public.lesson_events
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE UNIQUE INDEX lesson_events_lesson_seq_uidx
  ON public.lesson_events (lesson_id, seq);

CREATE INDEX lesson_events_lesson_priority_seq_idx
  ON public.lesson_events (lesson_id, priority, seq);

CREATE INDEX lesson_events_school_ts_idx
  ON public.lesson_events (school_id, ts DESC);


-- ---------- Ordering contract: per-lesson monotonic seq ---------------
CREATE OR REPLACE FUNCTION public.lesson_events_assign_seq()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_seq BIGINT;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.lesson_id::text, 0)::bigint
  );

  SELECT COALESCE(MAX(seq), 0) + 1
    INTO next_seq
    FROM public.lesson_events
   WHERE lesson_id = NEW.lesson_id;

  NEW.seq := next_seq;
  RETURN NEW;
END;
$$;

CREATE TRIGGER lesson_events_assign_seq_trg
  BEFORE INSERT ON public.lesson_events
  FOR EACH ROW
  EXECUTE FUNCTION public.lesson_events_assign_seq();


-- ---------- Broadcast wiring (hot path) -------------------------------
CREATE OR REPLACE FUNCTION public.lesson_events_broadcast()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM realtime.send(
    jsonb_build_object(
      'seq',             NEW.seq,
      'kind',            NEW.kind,
      'priority',        NEW.priority,
      'teacher_visible', NEW.teacher_visible,
      'concept_ref',     NEW.concept_ref,
      'text',            NEW.text,
      'ts',              NEW.ts
    ),
    'lesson_event',
    'lesson:' || NEW.lesson_id::text,
    TRUE
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER lesson_events_broadcast_trg
  AFTER INSERT ON public.lesson_events
  FOR EACH ROW
  EXECUTE FUNCTION public.lesson_events_broadcast();


-- ---------- lesson_sessions -------------------------------------------
CREATE TABLE public.lesson_sessions (
  id           UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id    UUID        NOT NULL,
  student_id   UUID        NOT NULL,
  school_id    UUID        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','paused','ended')),
  last_seq     BIGINT      NOT NULL DEFAULT 0,
  summary      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at     TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, student_id)
);

GRANT SELECT, INSERT, UPDATE ON public.lesson_sessions TO authenticated;
GRANT ALL                    ON public.lesson_sessions TO service_role;

ALTER TABLE public.lesson_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students manage own sessions"
  ON public.lesson_sessions
  FOR ALL
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (
    student_id = auth.uid()
    AND school_id = public.get_user_school_id(auth.uid())
  );

CREATE POLICY "Staff read school sessions"
  ON public.lesson_sessions
  FOR SELECT
  TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.user_type IN ('teacher','school_admin')
    )
  );

CREATE INDEX lesson_sessions_lesson_idx
  ON public.lesson_sessions (lesson_id);

CREATE INDEX lesson_sessions_student_idx
  ON public.lesson_sessions (student_id);

CREATE OR REPLACE FUNCTION public.lse_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER lesson_sessions_touch_updated_at
  BEFORE UPDATE ON public.lesson_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.lse_touch_updated_at();


-- ---------- lesson_state_snapshots ------------------------------------
CREATE TABLE public.lesson_state_snapshots (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id   UUID        NOT NULL,
  school_id   UUID        NOT NULL,
  seq         BIGINT      NOT NULL,
  state       JSONB       NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.lesson_state_snapshots TO authenticated;
GRANT ALL             ON public.lesson_state_snapshots TO service_role;

ALTER TABLE public.lesson_state_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "School members read snapshots"
  ON public.lesson_state_snapshots
  FOR SELECT
  TO authenticated
  USING (school_id = public.get_user_school_id(auth.uid()));

CREATE POLICY "Staff write snapshots"
  ON public.lesson_state_snapshots
  FOR INSERT
  TO authenticated
  WITH CHECK (
    school_id = public.get_user_school_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.user_type IN ('teacher','school_admin')
    )
  );

CREATE INDEX lesson_state_snapshots_lesson_seq_idx
  ON public.lesson_state_snapshots (lesson_id, seq DESC);
