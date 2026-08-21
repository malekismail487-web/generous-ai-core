
-- Student learning profiles: stores computed difficulty level per subject
CREATE TABLE public.student_learning_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  subject TEXT NOT NULL,
  difficulty_level TEXT NOT NULL DEFAULT 'intermediate',
  total_questions_answered INTEGER NOT NULL DEFAULT 0,
  correct_answers INTEGER NOT NULL DEFAULT 0,
  recent_accuracy NUMERIC(5,2) DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, subject)
);

-- Answer history: tracks every answer for adaptive analysis
CREATE TABLE public.student_answer_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  subject TEXT NOT NULL,
  question_text TEXT,
  student_answer TEXT,
  correct_answer TEXT,
  is_correct BOOLEAN NOT NULL,
  difficulty TEXT DEFAULT 'medium',
  source TEXT NOT NULL DEFAULT 'quiz',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.student_learning_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_answer_history ENABLE ROW LEVEL SECURITY;

-- RLS policies for learning profiles
CREATE POLICY "Users can view their own learning profile"
  ON public.student_learning_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own learning profile"
  ON public.student_learning_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own learning profile"
  ON public.student_learning_profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS policies for answer history
CREATE POLICY "Users can view their own answer history"
  ON public.student_answer_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own answers"
  ON public.student_answer_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Function to recalculate difficulty level based on last 20 answers
CREATE OR REPLACE FUNCTION public.recalculate_difficulty_level()
RETURNS TRIGGER AS $$
DECLARE
  recent_correct INTEGER;
  recent_total INTEGER;
  accuracy NUMERIC(5,2);
  new_level TEXT;
BEGIN
  -- Get last 20 answers for this user+subject
  SELECT 
    COUNT(*) FILTER (WHERE is_correct = true),
    COUNT(*)
  INTO recent_correct, recent_total
  FROM (
    SELECT is_correct 
    FROM public.student_answer_history
    WHERE user_id = NEW.user_id AND subject = NEW.subject
    ORDER BY created_at DESC
    LIMIT 20
  ) recent;

  IF recent_total = 0 THEN
    accuracy := 0;
    new_level := 'intermediate';
  ELSE
    accuracy := (recent_correct::NUMERIC / recent_total) * 100;
    IF accuracy >= 85 THEN
      new_level := 'advanced';
    ELSIF accuracy >= 55 THEN
      new_level := 'intermediate';
    ELSE
      new_level := 'beginner';
    END IF;
  END IF;

  -- Upsert the learning profile
  INSERT INTO public.student_learning_profiles (user_id, subject, difficulty_level, total_questions_answered, correct_answers, recent_accuracy, updated_at)
  VALUES (NEW.user_id, NEW.subject, new_level, 1, CASE WHEN NEW.is_correct THEN 1 ELSE 0 END, accuracy, now())
  ON CONFLICT (user_id, subject)
  DO UPDATE SET
    difficulty_level = new_level,
    total_questions_answered = student_learning_profiles.total_questions_answered + 1,
    correct_answers = student_learning_profiles.correct_answers + CASE WHEN NEW.is_correct THEN 1 ELSE 0 END,
    recent_accuracy = accuracy,
    updated_at = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger: auto-recalculate on every new answer
CREATE TRIGGER trigger_recalculate_difficulty
  AFTER INSERT ON public.student_answer_history
  FOR EACH ROW
  EXECUTE FUNCTION public.recalculate_difficulty_level();
