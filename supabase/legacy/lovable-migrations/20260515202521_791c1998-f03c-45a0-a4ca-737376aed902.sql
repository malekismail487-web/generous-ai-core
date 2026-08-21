-- Phase 4: Per-output helpfulness signals (explicit + implicit)
CREATE TABLE public.ai_output_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  school_id UUID,
  feature TEXT NOT NULL,
  subject TEXT,
  topic TEXT,
  output_hash TEXT NOT NULL,
  output_excerpt TEXT,
  signal TEXT NOT NULL CHECK (signal IN (
    'up','down',
    'too_easy','too_hard','confusing','perfect','off_topic',
    'implicit_dwell_positive','implicit_regen','implicit_followup_confused'
  )),
  reason TEXT,
  profile_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_aos_user_created ON public.ai_output_signals (user_id, created_at DESC);
CREATE INDEX idx_aos_school_created ON public.ai_output_signals (school_id, created_at DESC);
CREATE INDEX idx_aos_feature ON public.ai_output_signals (feature);
CREATE INDEX idx_aos_output_hash ON public.ai_output_signals (output_hash);

ALTER TABLE public.ai_output_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view own signals"
ON public.ai_output_signals FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "users insert own signals"
ON public.ai_output_signals FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "school staff view signals in school"
ON public.ai_output_signals FOR SELECT
USING (
  school_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.school_id = ai_output_signals.school_id
      AND p.user_type IN ('teacher','school_admin')
      AND p.is_active = true
  )
);

CREATE POLICY "super admin views all signals"
ON public.ai_output_signals FOR SELECT
USING (public.is_super_admin_user(auth.uid()));