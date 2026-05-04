
-- ============================================================
-- PHASE 1: Three Foundations
-- ============================================================

-- ---------- 1. confidence_responses ----------
CREATE TABLE public.confidence_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  school_id UUID,
  subject TEXT,
  topic TEXT,
  question_id TEXT,
  question_text TEXT,
  confidence_level SMALLINT NOT NULL CHECK (confidence_level BETWEEN 1 AND 4),
  was_correct BOOLEAN NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('assignment','exam','ai_quiz','lct','refresher')),
  is_test_data BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_conf_resp_user ON public.confidence_responses(user_id, created_at DESC);
CREATE INDEX idx_conf_resp_school_topic ON public.confidence_responses(school_id, subject, topic);
ALTER TABLE public.confidence_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "students insert own confidence"
  ON public.confidence_responses FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "students read own confidence"
  ON public.confidence_responses FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "school staff read same-school confidence"
  ON public.confidence_responses FOR SELECT
  USING (
    school_id IS NOT NULL
    AND school_id = public.get_user_school_id(auth.uid())
    AND (public.is_teacher(auth.uid()) OR public.is_school_admin_of(auth.uid(), school_id))
  );
CREATE POLICY "parents read child confidence"
  ON public.confidence_responses FOR SELECT
  USING (user_id IN (SELECT student_id FROM public.parent_students WHERE parent_id = auth.uid()));
CREATE POLICY "super admin all confidence"
  ON public.confidence_responses FOR SELECT
  USING (lower((auth.jwt() ->> 'email')) = 'malekismail487@gmail.com');

-- ---------- 2. confidence_calibration_stats ----------
CREATE TABLE public.confidence_calibration_stats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  school_id UUID,
  subject TEXT,
  topic TEXT,
  avg_confidence NUMERIC NOT NULL DEFAULT 0,
  avg_accuracy NUMERIC NOT NULL DEFAULT 0,
  calibration_gap NUMERIC NOT NULL DEFAULT 0,
  sample_size INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, subject, topic)
);
CREATE INDEX idx_calib_school ON public.confidence_calibration_stats(school_id, subject, topic);
ALTER TABLE public.confidence_calibration_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "students read own calibration"
  ON public.confidence_calibration_stats FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "school staff read same-school calibration"
  ON public.confidence_calibration_stats FOR SELECT
  USING (
    school_id IS NOT NULL
    AND school_id = public.get_user_school_id(auth.uid())
    AND (public.is_teacher(auth.uid()) OR public.is_school_admin_of(auth.uid(), school_id))
  );
CREATE POLICY "parents read child calibration"
  ON public.confidence_calibration_stats FOR SELECT
  USING (user_id IN (SELECT student_id FROM public.parent_students WHERE parent_id = auth.uid()));
CREATE POLICY "super admin all calibration"
  ON public.confidence_calibration_stats FOR SELECT
  USING (lower((auth.jwt() ->> 'email')) = 'malekismail487@gmail.com');

-- ---------- 3. concept_mastery ----------
CREATE TABLE public.concept_mastery (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  school_id UUID,
  subject TEXT NOT NULL,
  topic TEXT NOT NULL,
  mastery_score NUMERIC NOT NULL DEFAULT 0.5 CHECK (mastery_score BETWEEN 0 AND 1),
  ease_factor NUMERIC NOT NULL DEFAULT 2.5,
  interval_days NUMERIC NOT NULL DEFAULT 1,
  repetitions INTEGER NOT NULL DEFAULT 0,
  last_practiced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  next_review_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '1 day'),
  is_test_data BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, subject, topic)
);
CREATE INDEX idx_mastery_user_due ON public.concept_mastery(user_id, next_review_at);
CREATE INDEX idx_mastery_school ON public.concept_mastery(school_id, subject, topic);
ALTER TABLE public.concept_mastery ENABLE ROW LEVEL SECURITY;

CREATE POLICY "students manage own mastery"
  ON public.concept_mastery FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "school staff read same-school mastery"
  ON public.concept_mastery FOR SELECT
  USING (
    school_id IS NOT NULL
    AND school_id = public.get_user_school_id(auth.uid())
    AND (public.is_teacher(auth.uid()) OR public.is_school_admin_of(auth.uid(), school_id))
  );
CREATE POLICY "parents read child mastery"
  ON public.concept_mastery FOR SELECT
  USING (user_id IN (SELECT student_id FROM public.parent_students WHERE parent_id = auth.uid()));
CREATE POLICY "super admin all mastery"
  ON public.concept_mastery FOR SELECT
  USING (lower((auth.jwt() ->> 'email')) = 'malekismail487@gmail.com');

-- ---------- 4. decay_refreshers ----------
CREATE TABLE public.decay_refreshers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  concept_mastery_id UUID NOT NULL REFERENCES public.concept_mastery(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  options_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_index SMALLINT,
  selected_index SMALLINT,
  was_correct BOOLEAN,
  shown_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_decay_ref_user ON public.decay_refreshers(user_id, created_at DESC);
CREATE INDEX idx_decay_ref_concept ON public.decay_refreshers(concept_mastery_id);
ALTER TABLE public.decay_refreshers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "students manage own refreshers"
  ON public.decay_refreshers FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "super admin all refreshers"
  ON public.decay_refreshers FOR SELECT
  USING (lower((auth.jwt() ->> 'email')) = 'malekismail487@gmail.com');

-- ---------- 5. note_snapshots ----------
CREATE TABLE public.note_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  note_id UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  word_count INTEGER NOT NULL DEFAULT 0,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_note_snap_note ON public.note_snapshots(note_id, snapshot_at DESC);
CREATE INDEX idx_note_snap_user ON public.note_snapshots(user_id, snapshot_at DESC);
ALTER TABLE public.note_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "students read own snapshots"
  ON public.note_snapshots FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "students insert own snapshots"
  ON public.note_snapshots FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "students delete own snapshots"
  ON public.note_snapshots FOR DELETE
  USING (auth.uid() = user_id);
CREATE POLICY "super admin all snapshots"
  ON public.note_snapshots FOR SELECT
  USING (lower((auth.jwt() ->> 'email')) = 'malekismail487@gmail.com');

-- ---------- 6. note_timeline_summaries ----------
CREATE TABLE public.note_timeline_summaries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  note_id UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  summary_md TEXT NOT NULL,
  snapshots_count INTEGER NOT NULL DEFAULT 0,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (note_id)
);
ALTER TABLE public.note_timeline_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "students manage own timeline summaries"
  ON public.note_timeline_summaries FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- TRIGGERS / FUNCTIONS
-- ============================================================

-- Refresh calibration stats after a confidence response
CREATE OR REPLACE FUNCTION public.refresh_confidence_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_avg_conf NUMERIC;
  v_avg_acc NUMERIC;
  v_n INTEGER;
BEGIN
  SELECT
    AVG(confidence_level::NUMERIC / 4.0),
    AVG(CASE WHEN was_correct THEN 1.0 ELSE 0.0 END),
    COUNT(*)
  INTO v_avg_conf, v_avg_acc, v_n
  FROM public.confidence_responses
  WHERE user_id = NEW.user_id
    AND COALESCE(subject,'') = COALESCE(NEW.subject,'')
    AND COALESCE(topic,'') = COALESCE(NEW.topic,'');

  INSERT INTO public.confidence_calibration_stats
    (user_id, school_id, subject, topic, avg_confidence, avg_accuracy, calibration_gap, sample_size, updated_at)
  VALUES
    (NEW.user_id, NEW.school_id, NEW.subject, NEW.topic,
     COALESCE(v_avg_conf,0), COALESCE(v_avg_acc,0),
     COALESCE(v_avg_conf,0) - COALESCE(v_avg_acc,0),
     COALESCE(v_n,0), now())
  ON CONFLICT (user_id, subject, topic) DO UPDATE
    SET avg_confidence = EXCLUDED.avg_confidence,
        avg_accuracy = EXCLUDED.avg_accuracy,
        calibration_gap = EXCLUDED.calibration_gap,
        sample_size = EXCLUDED.sample_size,
        school_id = EXCLUDED.school_id,
        updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_refresh_confidence_stats
AFTER INSERT ON public.confidence_responses
FOR EACH ROW EXECUTE FUNCTION public.refresh_confidence_stats();

-- SM-2-style mastery update helper
CREATE OR REPLACE FUNCTION public.update_concept_mastery(
  p_user_id UUID,
  p_school_id UUID,
  p_subject TEXT,
  p_topic TEXT,
  p_was_correct BOOLEAN
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_ease NUMERIC;
  v_interval NUMERIC;
  v_reps INTEGER;
  v_score NUMERIC;
BEGIN
  SELECT id, ease_factor, interval_days, repetitions, mastery_score
  INTO v_id, v_ease, v_interval, v_reps, v_score
  FROM public.concept_mastery
  WHERE user_id = p_user_id AND subject = p_subject AND topic = p_topic;

  IF v_id IS NULL THEN
    INSERT INTO public.concept_mastery (user_id, school_id, subject, topic, mastery_score, ease_factor, interval_days, repetitions, last_practiced_at, next_review_at)
    VALUES (p_user_id, p_school_id, p_subject, p_topic,
            CASE WHEN p_was_correct THEN 0.6 ELSE 0.3 END,
            2.5, CASE WHEN p_was_correct THEN 1 ELSE 0.5 END,
            CASE WHEN p_was_correct THEN 1 ELSE 0 END,
            now(),
            now() + (CASE WHEN p_was_correct THEN interval '1 day' ELSE interval '6 hours' END))
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  IF p_was_correct THEN
    v_reps := v_reps + 1;
    v_ease := GREATEST(1.3, v_ease + 0.1);
    v_interval := CASE
      WHEN v_reps = 1 THEN 1
      WHEN v_reps = 2 THEN 3
      ELSE LEAST(180, v_interval * v_ease)
    END;
    v_score := LEAST(1.0, v_score + 0.1);
  ELSE
    v_reps := 0;
    v_ease := GREATEST(1.3, v_ease - 0.2);
    v_interval := 0.5;
    v_score := GREATEST(0.0, v_score - 0.15);
  END IF;

  UPDATE public.concept_mastery
  SET ease_factor = v_ease,
      interval_days = v_interval,
      repetitions = v_reps,
      mastery_score = v_score,
      school_id = COALESCE(p_school_id, school_id),
      last_practiced_at = now(),
      next_review_at = now() + (v_interval * interval '1 day'),
      updated_at = now()
  WHERE id = v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_concept_mastery(UUID,UUID,TEXT,TEXT,BOOLEAN) TO authenticated;

-- Note snapshot trigger (skip duplicates by hash)
CREATE OR REPLACE FUNCTION public.snapshot_note_on_save()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash TEXT;
  v_last_hash TEXT;
BEGIN
  v_hash := md5(COALESCE(NEW.title,'') || '||' || COALESCE(NEW.content,''));
  SELECT content_hash INTO v_last_hash
  FROM public.note_snapshots
  WHERE note_id = NEW.id
  ORDER BY snapshot_at DESC
  LIMIT 1;

  IF v_last_hash IS DISTINCT FROM v_hash THEN
    INSERT INTO public.note_snapshots (note_id, user_id, title, content, content_hash, word_count)
    VALUES (NEW.id, NEW.user_id, NEW.title, COALESCE(NEW.content,''), v_hash,
            array_length(regexp_split_to_array(COALESCE(NEW.content,''), '\s+'), 1));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_snapshot_note_insert
AFTER INSERT ON public.notes
FOR EACH ROW EXECUTE FUNCTION public.snapshot_note_on_save();

CREATE TRIGGER trg_snapshot_note_update
AFTER UPDATE ON public.notes
FOR EACH ROW
WHEN (OLD.content IS DISTINCT FROM NEW.content OR OLD.title IS DISTINCT FROM NEW.title)
EXECUTE FUNCTION public.snapshot_note_on_save();

-- updated_at touch trigger for concept_mastery (already handled in update_concept_mastery, but for direct edits)
CREATE TRIGGER trg_concept_mastery_updated
BEFORE UPDATE ON public.concept_mastery
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
