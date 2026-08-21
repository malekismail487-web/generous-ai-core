
CREATE TABLE public.model_evaluation_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  triggered_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  scope TEXT NOT NULL DEFAULT 'global',
  scope_key TEXT NULL,
  window_start TIMESTAMPTZ NULL,
  window_end TIMESTAMPTZ NULL,
  n_predictions INTEGER NOT NULL DEFAULT 0,
  n_with_outcome INTEGER NOT NULL DEFAULT 0,
  base_rate NUMERIC NULL,
  bootstrap_iterations INTEGER NOT NULL DEFAULT 0,
  notes TEXT NULL,
  status TEXT NOT NULL DEFAULT 'ok',
  error TEXT NULL,
  duration_ms INTEGER NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_meval_runs_created_at ON public.model_evaluation_runs (created_at DESC);
CREATE INDEX idx_meval_runs_scope ON public.model_evaluation_runs (scope, scope_key);
GRANT SELECT ON public.model_evaluation_runs TO authenticated;
GRANT ALL ON public.model_evaluation_runs TO service_role;
ALTER TABLE public.model_evaluation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role manages eval runs" ON public.model_evaluation_runs FOR ALL
  TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "admins read eval runs" ON public.model_evaluation_runs FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.model_evaluation_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.model_evaluation_runs(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  slice_kind TEXT NOT NULL DEFAULT 'overall',
  slice_key TEXT NULL,
  n INTEGER NOT NULL,
  base_rate NUMERIC NOT NULL,
  brier NUMERIC NOT NULL,
  log_loss NUMERIC NOT NULL,
  ece NUMERIC NOT NULL,
  auc NUMERIC NOT NULL,
  pr_auc NUMERIC NOT NULL,
  brier_skill NUMERIC NOT NULL,
  reliability NUMERIC NOT NULL,
  resolution NUMERIC NOT NULL,
  uncertainty NUMERIC NOT NULL,
  accuracy NUMERIC NOT NULL,
  ci_auc_lo NUMERIC NULL,
  ci_auc_hi NUMERIC NULL,
  ci_brier_lo NUMERIC NULL,
  ci_brier_hi NUMERIC NULL,
  reliability_bins JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_meval_metrics_run ON public.model_evaluation_metrics (run_id);
CREATE INDEX idx_meval_metrics_channel ON public.model_evaluation_metrics (channel, slice_kind);
GRANT SELECT ON public.model_evaluation_metrics TO authenticated;
GRANT ALL ON public.model_evaluation_metrics TO service_role;
ALTER TABLE public.model_evaluation_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role manages eval metrics" ON public.model_evaluation_metrics FOR ALL
  TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "admins read eval metrics" ON public.model_evaluation_metrics FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));
