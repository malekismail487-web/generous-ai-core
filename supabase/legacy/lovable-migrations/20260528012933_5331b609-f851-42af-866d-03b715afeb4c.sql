CREATE TABLE public.saved_lectures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  school_id UUID,
  mode TEXT NOT NULL DEFAULT 'student',
  title TEXT NOT NULL,
  subject TEXT,
  topic TEXT,
  grade_level TEXT,
  duration_minutes INTEGER,
  expertise TEXT,
  outline_json JSONB NOT NULL,
  hero_url TEXT,
  image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_lectures TO authenticated;
GRANT ALL ON public.saved_lectures TO service_role;

ALTER TABLE public.saved_lectures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own saved lectures"
  ON public.saved_lectures FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users create own saved lectures"
  ON public.saved_lectures FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own saved lectures"
  ON public.saved_lectures FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own saved lectures"
  ON public.saved_lectures FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_saved_lectures_updated_at
  BEFORE UPDATE ON public.saved_lectures
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_saved_lectures_user_created ON public.saved_lectures(user_id, created_at DESC);