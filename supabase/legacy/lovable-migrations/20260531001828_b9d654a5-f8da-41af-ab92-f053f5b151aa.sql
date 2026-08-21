ALTER TABLE public.question_bank
  ADD COLUMN IF NOT EXISTS is_anchor boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS confidence numeric NOT NULL DEFAULT 0.0;

ALTER TABLE public.graded_events
  ADD COLUMN IF NOT EXISTS concept_weight numeric,
  ADD COLUMN IF NOT EXISTS k_effective numeric;

CREATE INDEX IF NOT EXISTS idx_qb_anchor ON public.question_bank(subject, is_anchor) WHERE is_anchor;