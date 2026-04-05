
-- Student Memory Table (long-term AI memory)
CREATE TABLE public.student_memory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  memory_type TEXT NOT NULL DEFAULT 'fact' CHECK (memory_type IN ('fact', 'preference', 'struggle', 'strength', 'personal', 'personality')),
  content TEXT NOT NULL,
  subject TEXT,
  confidence NUMERIC(3,2) NOT NULL DEFAULT 0.80,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Knowledge Gaps Table (auto-detected weak areas)
CREATE TABLE public.knowledge_gaps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  topic TEXT NOT NULL,
  gap_description TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'moderate' CHECK (severity IN ('minor', 'moderate', 'critical')),
  detected_from TEXT NOT NULL DEFAULT 'chat',
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_student_memory_user ON public.student_memory(user_id);
CREATE INDEX idx_student_memory_type ON public.student_memory(user_id, memory_type);
CREATE INDEX idx_knowledge_gaps_user ON public.knowledge_gaps(user_id);
CREATE INDEX idx_knowledge_gaps_unresolved ON public.knowledge_gaps(user_id, resolved) WHERE resolved = false;

-- Enable RLS
ALTER TABLE public.student_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_gaps ENABLE ROW LEVEL SECURITY;

-- RLS Policies for student_memory
CREATE POLICY "Users can view own memories" ON public.student_memory
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own memories" ON public.student_memory
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own memories" ON public.student_memory
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own memories" ON public.student_memory
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- RLS Policies for knowledge_gaps
CREATE POLICY "Users can view own gaps" ON public.knowledge_gaps
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own gaps" ON public.knowledge_gaps
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own gaps" ON public.knowledge_gaps
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own gaps" ON public.knowledge_gaps
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Service role policy for edge functions
CREATE POLICY "Service role full access memory" ON public.student_memory
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access gaps" ON public.knowledge_gaps
  FOR ALL TO service_role USING (true) WITH CHECK (true);
