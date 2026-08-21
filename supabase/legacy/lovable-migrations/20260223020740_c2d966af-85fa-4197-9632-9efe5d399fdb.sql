
-- IQ Test results table
CREATE TABLE public.iq_test_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  score integer NOT NULL DEFAULT 0,
  total_questions integer NOT NULL DEFAULT 15,
  answers_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  processing_speed_score integer DEFAULT 0,
  logical_reasoning_score integer DEFAULT 0,
  pattern_recognition_score integer DEFAULT 0,
  spatial_reasoning_score integer DEFAULT 0,
  verbal_reasoning_score integer DEFAULT 0,
  mathematical_ability_score integer DEFAULT 0,
  abstract_thinking_score integer DEFAULT 0,
  estimated_iq integer DEFAULT 100,
  learning_pace text DEFAULT 'moderate',
  completed_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.iq_test_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own IQ results"
  ON public.iq_test_results FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own IQ results"
  ON public.iq_test_results FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Comprehensive activity tracking table
CREATE TABLE public.user_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  activity_type text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  subject text,
  details_json jsonb DEFAULT '{}'::jsonb,
  duration_seconds integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.user_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own activity"
  ON public.user_activity_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own activity"
  ON public.user_activity_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Learning style profile (detected from activity data)
CREATE TABLE public.learning_style_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  visual_score numeric(5,2) DEFAULT 0,
  logical_score numeric(5,2) DEFAULT 0,
  verbal_score numeric(5,2) DEFAULT 0,
  kinesthetic_score numeric(5,2) DEFAULT 0,
  conceptual_score numeric(5,2) DEFAULT 0,
  dominant_style text DEFAULT 'balanced',
  secondary_style text,
  total_interactions integer DEFAULT 0,
  last_analyzed_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.learning_style_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own learning style"
  ON public.learning_style_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own learning style"
  ON public.learning_style_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own learning style"
  ON public.learning_style_profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- Add index for fast lookups
CREATE INDEX idx_user_activity_log_user_id ON public.user_activity_log(user_id);
CREATE INDEX idx_user_activity_log_type ON public.user_activity_log(activity_type);
CREATE INDEX idx_user_activity_log_created ON public.user_activity_log(created_at);
CREATE INDEX idx_iq_test_results_user_id ON public.iq_test_results(user_id);
