
-- ─── ensemble_predictions ──────────────────────────────────────────────────
CREATE TABLE public.ensemble_predictions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  concept_id UUID,
  question_id UUID,
  bandit_decision_id UUID REFERENCES public.bandit_decisions(id) ON DELETE SET NULL,
  p_2pl NUMERIC CHECK (p_2pl IS NULL OR (p_2pl >= 0 AND p_2pl <= 1)),
  p_elo NUMERIC CHECK (p_elo IS NULL OR (p_elo >= 0 AND p_elo <= 1)),
  p_akt NUMERIC CHECK (p_akt IS NULL OR (p_akt >= 0 AND p_akt <= 1)),
  p_dash NUMERIC CHECK (p_dash IS NULL OR (p_dash >= 0 AND p_dash <= 1)),
  p_fsrs NUMERIC CHECK (p_fsrs IS NULL OR (p_fsrs >= 0 AND p_fsrs <= 1)),
  p_hawkes NUMERIC CHECK (p_hawkes IS NULL OR (p_hawkes >= 0 AND p_hawkes <= 1)),
  blended_p NUMERIC CHECK (blended_p IS NULL OR (blended_p >= 0 AND blended_p <= 1)),
  calibrated_p NUMERIC CHECK (calibrated_p IS NULL OR (calibrated_p >= 0 AND calibrated_p <= 1)),
  weights_used JSONB,
  outcome SMALLINT CHECK (outcome IS NULL OR outcome IN (0, 1)),
  outcome_attached_at TIMESTAMPTZ,
  helpfulness_signal SMALLINT CHECK (helpfulness_signal IS NULL OR helpfulness_signal IN (-1, 0, 1)),
  quality_score NUMERIC CHECK (quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 1)),
  source TEXT NOT NULL DEFAULT 'teaching-generate',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ensemble_predictions_user_subject_idx
  ON public.ensemble_predictions (user_id, subject, created_at DESC);
CREATE INDEX ensemble_predictions_pending_outcome_idx
  ON public.ensemble_predictions (user_id, subject, concept_id)
  WHERE outcome IS NULL;
CREATE INDEX ensemble_predictions_subject_labeled_idx
  ON public.ensemble_predictions (subject, outcome_attached_at DESC)
  WHERE outcome IS NOT NULL;

GRANT SELECT ON public.ensemble_predictions TO authenticated;
GRANT ALL ON public.ensemble_predictions TO service_role;

ALTER TABLE public.ensemble_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students read own predictions"
  ON public.ensemble_predictions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Authorized viewers read student predictions"
  ON public.ensemble_predictions FOR SELECT
  TO authenticated
  USING (public.can_view_student_mastery(auth.uid(), user_id));

-- ─── ensemble_fit_runs ─────────────────────────────────────────────────────
CREATE TABLE public.ensemble_fit_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scope TEXT NOT NULL DEFAULT 'user' CHECK (scope IN ('user', 'population')),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  n_samples INTEGER NOT NULL,
  brier_before NUMERIC,
  brier_after NUMERIC,
  logloss_before NUMERIC,
  logloss_after NUMERIC,
  ece_after NUMERIC,
  epochs INTEGER NOT NULL,
  accepted BOOLEAN NOT NULL DEFAULT false,
  weights_before JSONB,
  weights_after JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ensemble_fit_runs_scope_user_chk CHECK (
    (scope = 'user' AND user_id IS NOT NULL) OR
    (scope = 'population' AND user_id IS NULL)
  )
);

CREATE INDEX ensemble_fit_runs_user_subject_idx
  ON public.ensemble_fit_runs (user_id, subject, created_at DESC);
CREATE INDEX ensemble_fit_runs_pop_idx
  ON public.ensemble_fit_runs (subject, created_at DESC)
  WHERE scope = 'population';

GRANT SELECT ON public.ensemble_fit_runs TO authenticated;
GRANT ALL ON public.ensemble_fit_runs TO service_role;

ALTER TABLE public.ensemble_fit_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students read own fit runs"
  ON public.ensemble_fit_runs FOR SELECT
  TO authenticated
  USING (scope = 'user' AND user_id = auth.uid());

CREATE POLICY "Authorized viewers read student fit runs"
  ON public.ensemble_fit_runs FOR SELECT
  TO authenticated
  USING (scope = 'user' AND user_id IS NOT NULL
         AND public.can_view_student_mastery(auth.uid(), user_id));

CREATE POLICY "Population fits readable"
  ON public.ensemble_fit_runs FOR SELECT
  TO authenticated
  USING (scope = 'population');

-- ─── attach_ensemble_outcome RPC ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.attach_ensemble_outcome(
  p_user_id UUID,
  p_subject TEXT,
  p_concept_id UUID,
  p_outcome SMALLINT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_outcome NOT IN (0, 1) THEN
    RAISE EXCEPTION 'outcome must be 0 or 1';
  END IF;
  SELECT id INTO v_id
  FROM public.ensemble_predictions
  WHERE user_id = p_user_id
    AND subject = p_subject
    AND (p_concept_id IS NULL OR concept_id = p_concept_id)
    AND outcome IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.ensemble_predictions
     SET outcome = p_outcome,
         outcome_attached_at = now()
   WHERE id = v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.attach_ensemble_outcome(UUID, TEXT, UUID, SMALLINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attach_ensemble_outcome(UUID, TEXT, UUID, SMALLINT) TO service_role;
