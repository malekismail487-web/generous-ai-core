CREATE TABLE IF NOT EXISTS public.fsrs_card_state (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id       uuid REFERENCES public.schools(id) ON DELETE SET NULL,
  subject         text NOT NULL,
  concept_id      uuid REFERENCES public.concepts(id) ON DELETE CASCADE,
  stability       numeric(10, 4) NOT NULL DEFAULT 0,
  difficulty      numeric(6, 4)  NOT NULL DEFAULT 0,
  reps            integer        NOT NULL DEFAULT 0,
  lapses          integer        NOT NULL DEFAULT 0,
  last_review_at  timestamptz,
  next_review_at  timestamptz,
  request_retention numeric(5, 4) NOT NULL DEFAULT 0.9,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS fsrs_card_state_unique
  ON public.fsrs_card_state (user_id, subject, COALESCE(concept_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS fsrs_card_state_due
  ON public.fsrs_card_state (user_id, next_review_at);

GRANT SELECT ON public.fsrs_card_state TO authenticated;
GRANT ALL    ON public.fsrs_card_state TO service_role;

ALTER TABLE public.fsrs_card_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fsrs_card_state self read"
  ON public.fsrs_card_state FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

ALTER TABLE public.ensemble_weights
  ADD COLUMN IF NOT EXISTS w_fsrs   numeric NOT NULL DEFAULT 0.13,
  ADD COLUMN IF NOT EXISTS w_hawkes numeric NOT NULL DEFAULT 0.10;