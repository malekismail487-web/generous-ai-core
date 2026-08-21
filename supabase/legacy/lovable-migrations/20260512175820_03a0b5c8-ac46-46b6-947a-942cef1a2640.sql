-- Phase 1: Adaptive output validation tracking
CREATE TABLE public.adaptive_quality_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  school_id UUID,
  feature TEXT NOT NULL,
  subject TEXT,
  score NUMERIC(4,3) NOT NULL CHECK (score >= 0 AND score <= 1),
  dimensions JSONB NOT NULL DEFAULT '{}'::jsonb,
  failures TEXT[] NOT NULL DEFAULT '{}',
  regenerated BOOLEAN NOT NULL DEFAULT false,
  profile_snapshot JSONB,
  output_excerpt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_aqs_user_created ON public.adaptive_quality_scores (user_id, created_at DESC);
CREATE INDEX idx_aqs_school_created ON public.adaptive_quality_scores (school_id, created_at DESC);
CREATE INDEX idx_aqs_feature ON public.adaptive_quality_scores (feature);

ALTER TABLE public.adaptive_quality_scores ENABLE ROW LEVEL SECURITY;

-- Students see their own
CREATE POLICY "users view own quality scores"
ON public.adaptive_quality_scores FOR SELECT
USING (auth.uid() = user_id);

-- Teachers/school admins see scores for students in their school
CREATE POLICY "school staff view scores in school"
ON public.adaptive_quality_scores FOR SELECT
USING (
  school_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.school_id = adaptive_quality_scores.school_id
      AND p.user_type IN ('teacher','school_admin')
      AND p.is_active = true
  )
);

-- Super admin sees all
CREATE POLICY "super admin views all quality scores"
ON public.adaptive_quality_scores FOR SELECT
USING (public.is_super_admin_user(auth.uid()));

-- Authenticated users can insert their own scores (edge function with user JWT)
CREATE POLICY "users insert own quality scores"
ON public.adaptive_quality_scores FOR INSERT
WITH CHECK (auth.uid() = user_id);