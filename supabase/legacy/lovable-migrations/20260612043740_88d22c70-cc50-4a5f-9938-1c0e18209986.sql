
-- Stage 1 — 2PL IRT + Elo fast-path
-- Adds item discrimination parameter (a) and Elo ratings for both items and
-- per-(user,subject) ability rows. The 2PL Rasch update and the Elo update
-- run in parallel inside the ability-update edge function; Elo provides a
-- fast drift signal for new items before the 2PL has converged.

ALTER TABLE public.question_bank
  ADD COLUMN IF NOT EXISTS discrimination_a NUMERIC(5,3) NOT NULL DEFAULT 1.000,
  ADD COLUMN IF NOT EXISTS elo_rating       NUMERIC(7,2) NOT NULL DEFAULT 1500.00,
  ADD COLUMN IF NOT EXISTS elo_count        INTEGER      NOT NULL DEFAULT 0;

ALTER TABLE public.ability_estimates
  ADD COLUMN IF NOT EXISTS elo_rating       NUMERIC(7,2) NOT NULL DEFAULT 1500.00,
  ADD COLUMN IF NOT EXISTS elo_count        INTEGER      NOT NULL DEFAULT 0;

-- Safety clamps as CHECK constraints would be immutable-safe (no time deps),
-- but we prefer runtime clamping in the edge function so out-of-range writes
-- become loud bugs in tests, not silent rejections in production.

CREATE INDEX IF NOT EXISTS idx_qbank_discrimination
  ON public.question_bank(discrimination_a)
  WHERE discrimination_a >= 0.3;

CREATE INDEX IF NOT EXISTS idx_qbank_elo
  ON public.question_bank(subject, elo_rating);

-- Audit log: per-item joint (a, b) recalibration runs from recalibrate-anchors.
CREATE TABLE IF NOT EXISTS public.item_parameter_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id     UUID NOT NULL REFERENCES public.question_bank(id) ON DELETE CASCADE,
  subject         TEXT NOT NULL,
  a_before        NUMERIC(5,3) NOT NULL,
  a_after         NUMERIC(5,3) NOT NULL,
  b_before        NUMERIC(6,3) NOT NULL,
  b_after         NUMERIC(6,3) NOT NULL,
  responses_used  INTEGER NOT NULL,
  log_likelihood  NUMERIC(10,3),
  method          TEXT NOT NULL DEFAULT '2pl_joint_em',
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_iph_question ON public.item_parameter_history(question_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_iph_subject  ON public.item_parameter_history(subject, created_at DESC);

GRANT SELECT ON public.item_parameter_history TO authenticated;
GRANT ALL    ON public.item_parameter_history TO service_role;

ALTER TABLE public.item_parameter_history ENABLE ROW LEVEL SECURITY;

-- Read-only audit: only the super-admin email can inspect item parameter drift.
CREATE POLICY "Super admin reads item parameter history"
  ON public.item_parameter_history
  FOR SELECT
  TO authenticated
  USING (lower((auth.jwt() ->> 'email')) = 'malekismail487@gmail.com');
