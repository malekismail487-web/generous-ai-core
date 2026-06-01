
CREATE TABLE IF NOT EXISTS public.anchor_recalibrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL,
  anchor_count integer NOT NULL DEFAULT 0,
  responses_considered integer NOT NULL DEFAULT 0,
  mean_drift numeric(6,3) NOT NULL DEFAULT 0,
  items_shifted integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.anchor_recalibrations TO authenticated;
GRANT ALL ON public.anchor_recalibrations TO service_role;

ALTER TABLE public.anchor_recalibrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super admin reads anchor recalibrations"
  ON public.anchor_recalibrations
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin_user(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_anchor_recalibrations_subject_time
  ON public.anchor_recalibrations(subject, created_at DESC);

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
