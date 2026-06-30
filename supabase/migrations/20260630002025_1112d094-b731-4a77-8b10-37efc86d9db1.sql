CREATE TABLE IF NOT EXISTS public.unified_student_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL,
  subject text NOT NULL,
  z_vector jsonb NOT NULL,
  layout_version smallint NOT NULL DEFAULT 1,
  subsystem_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS unified_state_user_subject_idx ON public.unified_student_state (user_id, subject, created_at DESC);
GRANT SELECT, INSERT ON public.unified_student_state TO authenticated;
GRANT ALL ON public.unified_student_state TO service_role;
ALTER TABLE public.unified_student_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "self read unified state" ON public.unified_student_state FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "service inserts unified state" ON public.unified_student_state FOR INSERT TO service_role WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.misconception_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  concept_id text NOT NULL,
  misconception_id text NOT NULL,
  embedding jsonb NOT NULL,
  activation double precision NOT NULL DEFAULT 0,
  posterior double precision NOT NULL DEFAULT 0 CHECK (posterior >= 0 AND posterior <= 1),
  last_updated timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, concept_id, misconception_id)
);
GRANT SELECT, INSERT, UPDATE ON public.misconception_embeddings TO authenticated;
GRANT ALL ON public.misconception_embeddings TO service_role;
ALTER TABLE public.misconception_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "self read misconceptions" ON public.misconception_embeddings FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "service writes misconceptions" ON public.misconception_embeddings FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.unified_policy_weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL UNIQUE,
  weights jsonb NOT NULL,
  lambdas jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT false,
  promoted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.unified_policy_weights TO authenticated;
GRANT ALL ON public.unified_policy_weights TO service_role;
ALTER TABLE public.unified_policy_weights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth reads policy weights" ON public.unified_policy_weights FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.unified_policy_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL,
  z_vector jsonb NOT NULL,
  action jsonb NOT NULL,
  probabilities jsonb NOT NULL,
  joint_propensity double precision NOT NULL,
  weights_version text NOT NULL,
  shadow_mode boolean NOT NULL DEFAULT true,
  realised_reward double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS unified_policy_decisions_user_idx ON public.unified_policy_decisions (user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.unified_policy_decisions TO authenticated;
GRANT ALL ON public.unified_policy_decisions TO service_role;
ALTER TABLE public.unified_policy_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "self read policy decisions" ON public.unified_policy_decisions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "service writes policy decisions" ON public.unified_policy_decisions FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.symbolic_alignment_matrices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL UNIQUE,
  standard_ids jsonb NOT NULL,
  forward jsonb NOT NULL,
  inverse jsonb NOT NULL,
  forward_bias jsonb NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.symbolic_alignment_matrices TO authenticated;
GRANT ALL ON public.symbolic_alignment_matrices TO service_role;
ALTER TABLE public.symbolic_alignment_matrices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth reads alignment matrices" ON public.symbolic_alignment_matrices FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.unified_objective_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  sample_count integer NOT NULL DEFAULT 0,
  loss_before double precision,
  loss_after double precision,
  breakdown_before jsonb,
  breakdown_after jsonb,
  candidate_version text,
  promoted boolean NOT NULL DEFAULT false,
  notes text
);
GRANT SELECT ON public.unified_objective_runs TO authenticated;
GRANT ALL ON public.unified_objective_runs TO service_role;
ALTER TABLE public.unified_objective_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth reads objective runs" ON public.unified_objective_runs FOR SELECT TO authenticated USING (true);