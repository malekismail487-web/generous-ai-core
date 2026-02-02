-- Add grade_level column to course_materials table
ALTER TABLE public.course_materials
ADD COLUMN IF NOT EXISTS grade_level TEXT DEFAULT 'All';

-- Update RLS policies to ensure school-scoped access
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view course materials" ON public.course_materials;
DROP POLICY IF EXISTS "Teachers can insert materials" ON public.course_materials;
DROP POLICY IF EXISTS "Teachers can update own materials" ON public.course_materials;
DROP POLICY IF EXISTS "Teachers can delete own materials" ON public.course_materials;

-- Create new school-scoped policies
CREATE POLICY "Users can view materials from their school"
ON public.course_materials
FOR SELECT
USING (
  school_id IS NOT NULL AND
  school_id = (SELECT school_id FROM public.profiles WHERE id = auth.uid())
);

CREATE POLICY "Teachers can insert materials to their school"
ON public.course_materials
FOR INSERT
WITH CHECK (
  school_id = (SELECT school_id FROM public.profiles WHERE id = auth.uid()) AND
  public.is_teacher(auth.uid())
);

CREATE POLICY "Teachers can update own materials"
ON public.course_materials
FOR UPDATE
USING (
  uploaded_by = auth.uid() AND
  public.is_teacher(auth.uid())
);

CREATE POLICY "Teachers can delete own materials"
ON public.course_materials
FOR DELETE
USING (
  uploaded_by = auth.uid() AND
  public.is_teacher(auth.uid())
);