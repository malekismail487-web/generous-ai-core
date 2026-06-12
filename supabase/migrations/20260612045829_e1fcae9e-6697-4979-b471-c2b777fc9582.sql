
-- Stage 3: per-subject probability calibration
CREATE TABLE IF NOT EXISTS public.calibration_state (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject      TEXT NOT NULL,            -- '*' = global fallback
  method       TEXT NOT NULL DEFAULT 'identity'
               CHECK (method IN ('identity','temperature','platt')),
  temperature  NUMERIC NOT NULL DEFAULT 1.0,
  platt_a      NUMERIC NOT NULL DEFAULT 1.0,
  platt_b      NUMERIC NOT NULL DEFAULT 0.0,
  -- Diagnostics measured on the fit window.
  n_events     INT     NOT NULL DEFAULT 0,
  brier_raw    NUMERIC NULL,
  brier_cal    NUMERIC NULL,
  ece_raw      NUMERIC NULL,
  ece_cal      NUMERIC NULL,
  auc_raw      NUMERIC NULL,
  auc_cal      NUMERIC NULL,
  fitted_at    TIMESTAMPTZ NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (subject)
);
GRANT SELECT ON public.calibration_state TO authenticated;
GRANT ALL ON public.calibration_state TO service_role;
ALTER TABLE public.calibration_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone signed in can read calibration"
  ON public.calibration_state FOR SELECT
  TO authenticated
  USING (true);

DROP TRIGGER IF EXISTS trg_calibration_state_updated ON public.calibration_state;
CREATE TRIGGER trg_calibration_state_updated
  BEFORE UPDATE ON public.calibration_state
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.calibration_state (subject, method, temperature, platt_a, platt_b)
SELECT '*', 'identity', 1.0, 1.0, 0.0
WHERE NOT EXISTS (SELECT 1 FROM public.calibration_state WHERE subject = '*');
