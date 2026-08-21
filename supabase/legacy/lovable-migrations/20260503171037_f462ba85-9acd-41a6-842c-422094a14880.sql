
CREATE TABLE IF NOT EXISTS public.morning_briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  school_id uuid,
  briefing_md text NOT NULL,
  key_insight text,
  leverage_topic text,
  mini_quiz jsonb DEFAULT '[]'::jsonb,
  scheduled_for date NOT NULL DEFAULT (now()::date),
  opened_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, scheduled_for)
);
CREATE INDEX IF NOT EXISTS idx_mb_user ON public.morning_briefings(user_id, scheduled_for DESC);
ALTER TABLE public.morning_briefings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "students read own briefings" ON public.morning_briefings
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "students update own briefings" ON public.morning_briefings
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "school staff read same-school briefings" ON public.morning_briefings
  FOR SELECT USING (
    school_id IS NOT NULL AND school_id = public.get_user_school_id(auth.uid())
    AND (public.is_teacher(auth.uid()) OR public.is_school_admin_of(auth.uid(), school_id))
  );
CREATE POLICY "super admin reads all briefings" ON public.morning_briefings
  FOR SELECT USING (public.is_super_admin_user(auth.uid()));

CREATE TABLE IF NOT EXISTS public.recall_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  school_id uuid,
  subject text,
  concept text NOT NULL,
  reason text,
  due_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rs_due ON public.recall_schedule(user_id, due_at) WHERE delivered_at IS NULL;
ALTER TABLE public.recall_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "students read own recall" ON public.recall_schedule
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "students update own recall" ON public.recall_schedule
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "super admin reads all recall" ON public.recall_schedule
  FOR SELECT USING (public.is_super_admin_user(auth.uid()));
