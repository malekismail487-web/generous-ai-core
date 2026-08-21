-- Add content column to store the AI explanation text for each podcast
ALTER TABLE public.podcast_generations ADD COLUMN content text;

-- Add index for faster user queries
CREATE INDEX IF NOT EXISTS idx_podcast_generations_user_id ON public.podcast_generations(user_id, created_at DESC);