
-- Cognitive Mirror snapshots
CREATE TABLE IF NOT EXISTS public.cognitive_mirror_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  school_id uuid,
  subject text,
  topic text,
  question text NOT NULL,
  predicted_answer text,
  predicted_reasoning text,
  predicted_misconception text,
  actual_answer text,
  was_correct boolean,
  prediction_matched boolean,
  drift_score numeric(5,2),
  context jsonb DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'chat',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_cms_user ON public.cognitive_mirror_snapshots(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cms_school ON public.cognitive_mirror_snapshots(school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cms_unresolved ON public.cognitive_mirror_snapshots(user_id) WHERE resolved_at IS NULL;

ALTER TABLE public.cognitive_mirror_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "students read own snapshots"
  ON public.cognitive_mirror_snapshots FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "school staff read same-school snapshots"
  ON public.cognitive_mirror_snapshots FOR SELECT
  USING (
    school_id IS NOT NULL AND school_id = public.get_user_school_id(auth.uid())
    AND (public.is_teacher(auth.uid()) OR public.is_school_admin_of(auth.uid(), school_id))
  );

CREATE POLICY "super admin reads all snapshots"
  ON public.cognitive_mirror_snapshots FOR SELECT
  USING (public.is_super_admin_user(auth.uid()));

-- Stats cache
CREATE TABLE IF NOT EXISTS public.cognitive_mirror_stats (
  user_id uuid PRIMARY KEY,
  school_id uuid,
  total_predictions int NOT NULL DEFAULT 0,
  matched_predictions int NOT NULL DEFAULT 0,
  rolling_accuracy numeric(5,2) NOT NULL DEFAULT 0,
  avg_drift numeric(5,2) NOT NULL DEFAULT 0,
  last_updated timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cognitive_mirror_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "students read own stats"
  ON public.cognitive_mirror_stats FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "school staff read same-school stats"
  ON public.cognitive_mirror_stats FOR SELECT
  USING (
    school_id IS NOT NULL AND school_id = public.get_user_school_id(auth.uid())
    AND (public.is_teacher(auth.uid()) OR public.is_school_admin_of(auth.uid(), school_id))
  );

CREATE POLICY "super admin reads all stats"
  ON public.cognitive_mirror_stats FOR SELECT
  USING (public.is_super_admin_user(auth.uid()));

-- Recompute trigger
CREATE OR REPLACE FUNCTION public.recompute_mirror_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int;
  v_matched int;
  v_acc numeric(5,2);
  v_drift numeric(5,2);
BEGIN
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE prediction_matched IS TRUE),
    COALESCE(AVG(drift_score) FILTER (WHERE drift_score IS NOT NULL), 0)
  INTO v_total, v_matched, v_drift
  FROM (
    SELECT prediction_matched, drift_score
    FROM public.cognitive_mirror_snapshots
    WHERE user_id = NEW.user_id AND prediction_matched IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 50
  ) recent;

  IF v_total = 0 THEN
    v_acc := 0;
  ELSE
    v_acc := (v_matched::numeric / v_total) * 100;
  END IF;

  INSERT INTO public.cognitive_mirror_stats (user_id, school_id, total_predictions, matched_predictions, rolling_accuracy, avg_drift, last_updated)
  VALUES (NEW.user_id, NEW.school_id, v_total, v_matched, v_acc, v_drift, now())
  ON CONFLICT (user_id) DO UPDATE SET
    school_id = COALESCE(EXCLUDED.school_id, cognitive_mirror_stats.school_id),
    total_predictions = EXCLUDED.total_predictions,
    matched_predictions = EXCLUDED.matched_predictions,
    rolling_accuracy = EXCLUDED.rolling_accuracy,
    avg_drift = EXCLUDED.avg_drift,
    last_updated = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_mirror_stats ON public.cognitive_mirror_snapshots;
CREATE TRIGGER trg_recompute_mirror_stats
  AFTER INSERT OR UPDATE OF prediction_matched, drift_score
  ON public.cognitive_mirror_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.recompute_mirror_stats();
