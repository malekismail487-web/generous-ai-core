ALTER TABLE public.bandit_decisions
  ADD COLUMN IF NOT EXISTS behaviour_prob   NUMERIC,
  ADD COLUMN IF NOT EXISTS propensity_dist  JSONB,
  ADD COLUMN IF NOT EXISTS softmax_temp     NUMERIC;

CREATE INDEX IF NOT EXISTS bandit_decisions_propensity_idx
  ON public.bandit_decisions (subject, created_at DESC)
  WHERE behaviour_prob IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.policy_evaluation_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  subject TEXT,
  window_start TIMESTAMPTZ NOT NULL,
  window_end   TIMESTAMPTZ NOT NULL,
  n_decisions  INTEGER NOT NULL,
  mean_behaviour_reward NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.policy_evaluation_runs TO authenticated;
GRANT ALL    ON public.policy_evaluation_runs TO service_role;
ALTER TABLE public.policy_evaluation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read policy eval runs"
  ON public.policy_evaluation_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.policy_evaluation_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.policy_evaluation_runs(id) ON DELETE CASCADE,
  policy_name TEXT NOT NULL,
  estimator   TEXT NOT NULL,
  value NUMERIC NOT NULL,
  stderr NUMERIC NOT NULL,
  ci95_lo NUMERIC NOT NULL,
  ci95_hi NUMERIC NOT NULL,
  effective_sample_size NUMERIC NOT NULL,
  n_used INTEGER NOT NULL,
  cumulative_regret NUMERIC,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS policy_evaluation_results_run_idx
  ON public.policy_evaluation_results (run_id, policy_name, estimator);
GRANT SELECT ON public.policy_evaluation_results TO authenticated;
GRANT ALL    ON public.policy_evaluation_results TO service_role;
ALTER TABLE public.policy_evaluation_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read policy eval results"
  ON public.policy_evaluation_results FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.hyperparameter_tuning_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  algorithm TEXT NOT NULL DEFAULT 'cem',
  population INTEGER NOT NULL,
  elites INTEGER NOT NULL,
  generations INTEGER NOT NULL,
  seed INTEGER NOT NULL,
  best_value NUMERIC NOT NULL,
  best_params JSONB NOT NULL,
  trace JSONB NOT NULL,
  evaluations INTEGER NOT NULL,
  promoted BOOLEAN NOT NULL DEFAULT false,
  promoted_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.hyperparameter_tuning_runs TO authenticated;
GRANT ALL    ON public.hyperparameter_tuning_runs TO service_role;
ALTER TABLE public.hyperparameter_tuning_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read hp tuning runs"
  ON public.hyperparameter_tuning_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.hyperparameter_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scope TEXT NOT NULL DEFAULT 'global',
  params JSONB NOT NULL,
  source_run_id UUID REFERENCES public.hyperparameter_tuning_runs(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS hyperparameter_settings_active_unique
  ON public.hyperparameter_settings (scope) WHERE active = true;
GRANT SELECT ON public.hyperparameter_settings TO authenticated;
GRANT ALL    ON public.hyperparameter_settings TO service_role;
ALTER TABLE public.hyperparameter_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read hp settings"
  ON public.hyperparameter_settings FOR SELECT TO authenticated
  USING (true);

CREATE TABLE IF NOT EXISTS public.policy_regret_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  decision_id UUID REFERENCES public.bandit_decisions(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  bucket_key TEXT NOT NULL,
  realised_reward NUMERIC NOT NULL,
  oracle_reward NUMERIC NOT NULL,
  regret NUMERIC NOT NULL,
  run_id UUID REFERENCES public.policy_evaluation_runs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS policy_regret_log_subject_idx
  ON public.policy_regret_log (subject, created_at DESC);
GRANT SELECT ON public.policy_regret_log TO authenticated;
GRANT ALL    ON public.policy_regret_log TO service_role;
ALTER TABLE public.policy_regret_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students read own regret log"
  ON public.policy_regret_log FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Admins read all regret"
  ON public.policy_regret_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));