-- Create assignment_views table to track which students have viewed assignments
CREATE TABLE public.assignment_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  viewed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(assignment_id, user_id)
);

-- Enable Row Level Security
ALTER TABLE public.assignment_views ENABLE ROW LEVEL SECURITY;

-- Students can insert their own views
CREATE POLICY "Students can record their assignment views"
ON public.assignment_views
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Students can view their own views
CREATE POLICY "Students can view their own assignment views"
ON public.assignment_views
FOR SELECT
USING (auth.uid() = user_id);

-- Teachers can view assignment views for their assignments
CREATE POLICY "Teachers can view assignment views for their assignments"
ON public.assignment_views
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.assignments a
    WHERE a.id = assignment_views.assignment_id
    AND a.teacher_id = auth.uid()
  )
);

-- Create index for faster lookups
CREATE INDEX idx_assignment_views_assignment ON public.assignment_views(assignment_id);
CREATE INDEX idx_assignment_views_user ON public.assignment_views(user_id);