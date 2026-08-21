
CREATE TABLE IF NOT EXISTS public.lesson_explanations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT,
  concept_id UUID,
  lecture_id UUID,
  bandit_decision_id UUID REFERENCES public.bandit_decisions(id) ON DELETE SET NULL,
  prediction_log_id UUID,
  config_snapshot_id TEXT NOT NULL,
  enforcement_status TEXT NOT NULL CHECK (enforcement_status IN ('ok','repaired','degraded')),
  integrity_report JSONB NOT NULL,
  explanation JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.lesson_explanations TO authenticated;
GRANT ALL              ON public.lesson_explanations TO service_role;
ALTER TABLE public.lesson_explanations ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS lesson_explanations_user_idx
  ON public.lesson_explanations (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lesson_explanations_subject_idx
  ON public.lesson_explanations (subject, created_at DESC);
CREATE INDEX IF NOT EXISTS lesson_explanations_status_idx
  ON public.lesson_explanations (enforcement_status, created_at DESC);
CREATE POLICY "Students read own explanations"
  ON public.lesson_explanations FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Admins read all explanations"
  ON public.lesson_explanations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.continuous_validation_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL,
  window_end   TIMESTAMPTZ NOT NULL,
  n_predictions INTEGER NOT NULL DEFAULT 0,
  n_decisions   INTEGER NOT NULL DEFAULT 0,
  base_rate     NUMERIC,
  brier         NUMERIC,
  reliability   NUMERIC,
  resolution    NUMERIC,
  uncertainty   NUMERIC,
  ece           NUMERIC,
  cumulative_regret NUMERIC,
  ensemble_weight_std NUMERIC,
  alerts        JSONB NOT NULL DEFAULT '[]'::jsonb,
  status        TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','warn','alert')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.continuous_validation_runs TO authenticated;
GRANT ALL    ON public.continuous_validation_runs TO service_role;
ALTER TABLE public.continuous_validation_runs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS continuous_validation_runs_created_idx
  ON public.continuous_validation_runs (created_at DESC);
CREATE POLICY "Admins read validation runs"
  ON public.continuous_validation_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.engine_drift_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID REFERENCES public.continuous_validation_runs(id) ON DELETE CASCADE,
  severity TEXT NOT NULL CHECK (severity IN ('info','warn','alert')),
  metric TEXT NOT NULL,
  observed NUMERIC,
  baseline NUMERIC,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.engine_drift_alerts TO authenticated;
GRANT ALL    ON public.engine_drift_alerts TO service_role;
ALTER TABLE public.engine_drift_alerts ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS engine_drift_alerts_created_idx
  ON public.engine_drift_alerts (created_at DESC);
CREATE POLICY "Admins read drift alerts"
  ON public.engine_drift_alerts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
