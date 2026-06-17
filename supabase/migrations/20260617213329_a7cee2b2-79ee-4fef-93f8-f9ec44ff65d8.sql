
-- ============================================================================
-- Stage 8 — Cold-start bootstrapping infrastructure
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.population_priors (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope        text NOT NULL CHECK (scope IN (
                 'global','subject_global','subject_school',
                 'concept_global','concept_school'
               )),
  school_id    uuid NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  subject      text NULL,
  concept_id   uuid NULL REFERENCES public.concepts(id) ON DELETE CASCADE,

  theta_mean   double precision NOT NULL DEFAULT 0,
  theta_var    double precision NOT NULL DEFAULT 1,
  se_seed      double precision NOT NULL DEFAULT 1.5,

  mastery_mean double precision NOT NULL DEFAULT 0.5,
  mastery_var  double precision NOT NULL DEFAULT 0.08,

  ensemble_weights jsonb NULL,

  n_theta      bigint NOT NULL DEFAULT 0,
  n_mastery    bigint NOT NULL DEFAULT 0,
  n_weights    bigint NOT NULL DEFAULT 0,

  computed_at  timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS population_priors_global_uniq
  ON public.population_priors ((1)) WHERE scope = 'global';
CREATE UNIQUE INDEX IF NOT EXISTS population_priors_subject_global_uniq
  ON public.population_priors (subject) WHERE scope = 'subject_global';
CREATE UNIQUE INDEX IF NOT EXISTS population_priors_subject_school_uniq
  ON public.population_priors (school_id, subject) WHERE scope = 'subject_school';
CREATE UNIQUE INDEX IF NOT EXISTS population_priors_concept_global_uniq
  ON public.population_priors (concept_id) WHERE scope = 'concept_global';
CREATE UNIQUE INDEX IF NOT EXISTS population_priors_concept_school_uniq
  ON public.population_priors (school_id, concept_id) WHERE scope = 'concept_school';

CREATE INDEX IF NOT EXISTS population_priors_scope_subject_idx
  ON public.population_priors (scope, subject);
CREATE INDEX IF NOT EXISTS population_priors_school_subject_idx
  ON public.population_priors (school_id, subject) WHERE school_id IS NOT NULL;

GRANT ALL ON public.population_priors TO service_role;
ALTER TABLE public.population_priors ENABLE ROW LEVEL SECURITY;
-- Server-only: no anon/authenticated grants or policies.

CREATE OR REPLACE FUNCTION public.touch_population_priors_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_population_priors_touch ON public.population_priors;
CREATE TRIGGER trg_population_priors_touch
  BEFORE UPDATE ON public.population_priors
  FOR EACH ROW EXECUTE FUNCTION public.touch_population_priors_updated_at();

-- ── Audit ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.population_prior_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_by    uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  scope_filter    text NULL,
  rows_examined   integer NOT NULL DEFAULT 0,
  rows_written    integer NOT NULL DEFAULT 0,
  ms_elapsed      integer NOT NULL DEFAULT 0,
  ok              boolean NOT NULL DEFAULT true,
  error_message   text NULL,
  metrics         jsonb NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS population_prior_runs_created_idx
  ON public.population_prior_runs (created_at DESC);

GRANT ALL ON public.population_prior_runs TO service_role;
GRANT SELECT ON public.population_prior_runs TO authenticated;
ALTER TABLE public.population_prior_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read prior run audit"
  ON public.population_prior_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
