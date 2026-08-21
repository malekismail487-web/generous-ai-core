
-- ─── bandit_arm_state ──────────────────────────────────────────────────────
CREATE TABLE public.bandit_arm_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scope TEXT NOT NULL DEFAULT 'user' CHECK (scope IN ('user', 'population')),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  arm_id TEXT NOT NULL,
  dim INTEGER NOT NULL DEFAULT 8 CHECK (dim BETWEEN 1 AND 64),
  alpha NUMERIC NOT NULL DEFAULT 1.0 CHECK (alpha >= 0),
  lambda NUMERIC NOT NULL DEFAULT 1.0 CHECK (lambda > 0),
  a_inv JSONB NOT NULL,
  b_vector JSONB NOT NULL,
  n_pulls INTEGER NOT NULL DEFAULT 0 CHECK (n_pulls >= 0),
  cumulative_reward NUMERIC NOT NULL DEFAULT 0,
  last_decision_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bandit_arm_state_scope_user_chk CHECK (
    (scope = 'user' AND user_id IS NOT NULL) OR
    (scope = 'population' AND user_id IS NULL)
  )
);

CREATE UNIQUE INDEX bandit_arm_state_user_uq
  ON public.bandit_arm_state (user_id, subject, arm_id)
  WHERE scope = 'user';
CREATE UNIQUE INDEX bandit_arm_state_pop_uq
  ON public.bandit_arm_state (subject, arm_id)
  WHERE scope = 'population';
CREATE INDEX bandit_arm_state_lookup_idx
  ON public.bandit_arm_state (subject, arm_id, scope);

GRANT SELECT ON public.bandit_arm_state TO authenticated;
GRANT ALL ON public.bandit_arm_state TO service_role;

ALTER TABLE public.bandit_arm_state ENABLE ROW LEVEL SECURITY;

-- Students may read their own arm state for diagnostics.
CREATE POLICY "Students read own bandit state"
  ON public.bandit_arm_state FOR SELECT
  TO authenticated
  USING (scope = 'user' AND user_id = auth.uid());

-- Teachers/admins with mastery-view permission read the student's state.
CREATE POLICY "Authorized viewers read student bandit state"
  ON public.bandit_arm_state FOR SELECT
  TO authenticated
  USING (
    scope = 'user'
    AND user_id IS NOT NULL
    AND public.can_view_student_mastery(auth.uid(), user_id)
  );

-- Population priors visible to everyone authenticated (read-only).
CREATE POLICY "Population priors readable"
  ON public.bandit_arm_state FOR SELECT
  TO authenticated
  USING (scope = 'population');

-- ─── bandit_decisions ──────────────────────────────────────────────────────
CREATE TABLE public.bandit_decisions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  arm_id TEXT NOT NULL,
  concept_id UUID,
  lecture_id UUID,
  context_vec JSONB NOT NULL,
  ucb NUMERIC NOT NULL,
  mean NUMERIC NOT NULL,
  bonus NUMERIC NOT NULL,
  alternatives JSONB,
  ensemble_p_at_decision NUMERIC,
  source TEXT NOT NULL DEFAULT 'teaching-generate',
  rewarded BOOLEAN NOT NULL DEFAULT false,
  reward NUMERIC,
  rewarded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX bandit_decisions_user_subject_idx
  ON public.bandit_decisions (user_id, subject, created_at DESC);
CREATE INDEX bandit_decisions_pending_reward_idx
  ON public.bandit_decisions (user_id, subject, concept_id)
  WHERE rewarded = false;
CREATE INDEX bandit_decisions_arm_idx
  ON public.bandit_decisions (subject, arm_id, created_at DESC);

GRANT SELECT ON public.bandit_decisions TO authenticated;
GRANT ALL ON public.bandit_decisions TO service_role;

ALTER TABLE public.bandit_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students read own bandit decisions"
  ON public.bandit_decisions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Authorized viewers read student bandit decisions"
  ON public.bandit_decisions FOR SELECT
  TO authenticated
  USING (public.can_view_student_mastery(auth.uid(), user_id));

-- ─── updated_at trigger ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_bandit_arm_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER bandit_arm_state_touch
  BEFORE UPDATE ON public.bandit_arm_state
  FOR EACH ROW EXECUTE FUNCTION public.touch_bandit_arm_state();

-- ─── attach_bandit_reward RPC ──────────────────────────────────────────────
-- Called by ability-update after a graded_event lands. Marks the most-recent
-- unrewarded decision for (user, subject, concept) as rewarded and returns
-- its id + arm_id + context_vec so the edge function can apply the LinUCB
-- update via Sherman–Morrison. Security definer so it bypasses RLS for the
-- platform-internal flow but only operates on the caller's own rows.
CREATE OR REPLACE FUNCTION public.attach_bandit_reward(
  p_user_id UUID,
  p_subject TEXT,
  p_concept_id UUID,
  p_reward NUMERIC
)
RETURNS TABLE (
  decision_id UUID,
  arm_id TEXT,
  context_vec JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_decision_id UUID;
  v_arm_id TEXT;
  v_context JSONB;
BEGIN
  SELECT d.id, d.arm_id, d.context_vec
    INTO v_decision_id, v_arm_id, v_context
  FROM public.bandit_decisions d
  WHERE d.user_id = p_user_id
    AND d.subject = p_subject
    AND (p_concept_id IS NULL OR d.concept_id = p_concept_id)
    AND d.rewarded = false
  ORDER BY d.created_at DESC
  LIMIT 1;

  IF v_decision_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.bandit_decisions
     SET rewarded = true,
         reward = LEAST(1, GREATEST(-1, p_reward)),
         rewarded_at = now()
   WHERE id = v_decision_id;

  decision_id := v_decision_id;
  arm_id := v_arm_id;
  context_vec := v_context;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.attach_bandit_reward(UUID, TEXT, UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attach_bandit_reward(UUID, TEXT, UUID, NUMERIC) TO service_role;
