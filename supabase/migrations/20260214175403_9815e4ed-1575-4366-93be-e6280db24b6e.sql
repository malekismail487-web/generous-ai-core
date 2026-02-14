
CREATE TABLE public.podcast_generations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.podcast_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own podcast generations"
ON public.podcast_generations FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own podcast generations"
ON public.podcast_generations FOR INSERT WITH CHECK (auth.uid() = user_id);
