
-- Cost ledger for Lumina Singularity features
CREATE TABLE IF NOT EXISTS public.lumina_cost_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  school_id uuid,
  feature text NOT NULL CHECK (feature IN ('debate', 'dream', 'mirror', 'predict')),
  usage_date date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  count integer NOT NULL DEFAULT 0,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, feature, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_lumina_cost_user_date ON public.lumina_cost_ledger(user_id, usage_date DESC);
CREATE INDEX IF NOT EXISTS idx_lumina_cost_school_date ON public.lumina_cost_ledger(school_id, usage_date DESC);

ALTER TABLE public.lumina_cost_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "students view own usage"
  ON public.lumina_cost_ledger FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "school admins view school usage"
  ON public.lumina_cost_ledger FOR SELECT TO authenticated
  USING (is_school_admin_of(auth.uid(), school_id));

-- Atomic cap-check + increment
CREATE OR REPLACE FUNCTION public.check_and_increment_cost(
  p_user_id uuid,
  p_school_id uuid,
  p_feature text,
  p_daily_cap integer
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_current integer;
BEGIN
  INSERT INTO public.lumina_cost_ledger (user_id, school_id, feature, usage_date, count, last_used_at)
  VALUES (p_user_id, p_school_id, p_feature, (now() AT TIME ZONE 'UTC')::date, 0, now())
  ON CONFLICT (user_id, feature, usage_date) DO NOTHING;

  SELECT count INTO v_current
  FROM public.lumina_cost_ledger
  WHERE user_id = p_user_id AND feature = p_feature AND usage_date = (now() AT TIME ZONE 'UTC')::date
  FOR UPDATE;

  IF v_current >= p_daily_cap THEN
    RETURN json_build_object('allowed', false, 'used', v_current, 'cap', p_daily_cap);
  END IF;

  UPDATE public.lumina_cost_ledger
  SET count = count + 1, last_used_at = now()
  WHERE user_id = p_user_id AND feature = p_feature AND usage_date = (now() AT TIME ZONE 'UTC')::date;

  RETURN json_build_object('allowed', true, 'used', v_current + 1, 'cap', p_daily_cap);
END;
$$;

-- Enable pg_cron + pg_net for autonomous Dream Consolidation
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
