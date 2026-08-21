
-- Stage 2: KT sequence state + DASH features + stacked ensemble
-- ─────────────────────────────────────────────────────────────────
-- kt_sequence_state: per-(user, subject) rolling window of the last
-- N interactions used by simpleKT-lite (attention-based KT) and DASH
-- (forgetting-aware logistic). Stored as JSONB to keep schema flexible
-- while we iterate on the feature set without migrations.
CREATE TABLE IF NOT EXISTS public.kt_sequence_state (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id    UUID NULL,
  subject      TEXT NOT NULL,
  -- Last up-to-256 interactions: [{cid, qid, c (0/1), dt_min, rt_ms, a, b, ts}]
  interactions JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Cached DASH per-concept counts: { "<concept_id>": { s_recent, f_recent, last_ts } }
  dash_state   JSONB NOT NULL DEFAULT '{}'::jsonb,
  seq_len      INT  NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, subject)
);
GRANT SELECT ON public.kt_sequence_state TO authenticated;
GRANT ALL ON public.kt_sequence_state TO service_role;
ALTER TABLE public.kt_sequence_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own kt state"
  ON public.kt_sequence_state FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_kt_seq_user_subj
  ON public.kt_sequence_state(user_id, subject);

-- ensemble_weights: per-(user, subject) blending weights for the four
-- predictors {p_2pl, p_elo, p_akt, p_dash}. NULL user_id rows hold the
-- population prior, used as cold-start fallback.
CREATE TABLE IF NOT EXISTS public.ensemble_weights (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject      TEXT NOT NULL,
  w_2pl        NUMERIC NOT NULL DEFAULT 0.40,
  w_elo        NUMERIC NOT NULL DEFAULT 0.15,
  w_akt        NUMERIC NOT NULL DEFAULT 0.30,
  w_dash       NUMERIC NOT NULL DEFAULT 0.15,
  bias         NUMERIC NOT NULL DEFAULT 0.0,
  -- Diagnostic: fit metrics over the holdout window used to fit the weights.
  n_events     INT     NOT NULL DEFAULT 0,
  brier        NUMERIC NULL,
  auc          NUMERIC NULL,
  ece          NUMERIC NULL,
  fitted_at    TIMESTAMPTZ NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ensemble_weights TO authenticated;
GRANT ALL ON public.ensemble_weights TO service_role;
ALTER TABLE public.ensemble_weights ENABLE ROW LEVEL SECURITY;
-- Users can read their own row; population prior (user_id IS NULL) is readable to all authed users.
CREATE POLICY "Users read own or population weights"
  ON public.ensemble_weights FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ensemble_user_subj
  ON public.ensemble_weights(COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid), subject);

-- updated_at maintenance
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_kt_seq_updated ON public.kt_sequence_state;
CREATE TRIGGER trg_kt_seq_updated BEFORE UPDATE ON public.kt_sequence_state
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_ens_w_updated ON public.ensemble_weights;
CREATE TRIGGER trg_ens_w_updated BEFORE UPDATE ON public.ensemble_weights
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed a single global population prior row (subject='*') if missing.
INSERT INTO public.ensemble_weights (user_id, subject, w_2pl, w_elo, w_akt, w_dash, bias)
SELECT NULL, '*', 0.40, 0.15, 0.30, 0.15, 0.0
WHERE NOT EXISTS (
  SELECT 1 FROM public.ensemble_weights WHERE user_id IS NULL AND subject = '*'
);
