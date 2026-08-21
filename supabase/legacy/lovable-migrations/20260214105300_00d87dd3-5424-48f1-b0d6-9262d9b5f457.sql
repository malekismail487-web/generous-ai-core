
-- Daily streaks table to track user login streaks
CREATE TABLE public.daily_streaks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  current_streak INTEGER NOT NULL DEFAULT 0,
  max_streak INTEGER NOT NULL DEFAULT 0,
  last_active_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.daily_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own streak"
ON public.daily_streaks FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own streak"
ON public.daily_streaks FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own streak"
ON public.daily_streaks FOR UPDATE
USING (auth.uid() = user_id);

-- Weekly plans table - created by school admins
CREATE TABLE public.weekly_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  title TEXT NOT NULL,
  grade_level TEXT NOT NULL DEFAULT 'All Grades',
  week_start DATE NOT NULL,
  plan_type TEXT NOT NULL DEFAULT 'manual' CHECK (plan_type IN ('manual', 'file')),
  content_json JSONB,
  file_url TEXT,
  file_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.weekly_plans ENABLE ROW LEVEL SECURITY;

-- School admins can manage weekly plans
CREATE POLICY "School admins can manage weekly plans"
ON public.weekly_plans FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.school_admins sa
    WHERE sa.school_id = weekly_plans.school_id AND sa.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.school_admins sa
    WHERE sa.school_id = weekly_plans.school_id AND sa.user_id = auth.uid()
  )
);

-- Students can view weekly plans for their school and grade
CREATE POLICY "Students can view weekly plans"
ON public.weekly_plans FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.school_id = weekly_plans.school_id
    AND p.is_active = true
    AND (weekly_plans.grade_level = 'All Grades' OR p.grade_level = weekly_plans.grade_level)
  )
);

-- Teachers can view weekly plans for their school
CREATE POLICY "Teachers can view weekly plans"
ON public.weekly_plans FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.school_id = weekly_plans.school_id
    AND p.user_type = 'teacher'
    AND p.is_active = true
  )
);

-- Super admin access
CREATE POLICY "Super admin can manage weekly plans"
ON public.weekly_plans FOR ALL
USING (lower((auth.jwt() ->> 'email'::text)) = 'malekismail487@gmail.com')
WITH CHECK (lower((auth.jwt() ->> 'email'::text)) = 'malekismail487@gmail.com');

-- Trigger for updated_at
CREATE TRIGGER update_daily_streaks_updated_at
BEFORE UPDATE ON public.daily_streaks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_weekly_plans_updated_at
BEFORE UPDATE ON public.weekly_plans
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
