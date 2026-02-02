-- Fix assignments INSERT policy - allow teachers based on profile user_type
DROP POLICY IF EXISTS "Teachers can create assignments" ON public.assignments;

CREATE POLICY "Teachers can create assignments"
ON public.assignments
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = teacher_id 
  AND (
    has_role(auth.uid(), 'teacher'::app_role) 
    OR is_teacher(auth.uid())
  )
);

-- Fix course_materials INSERT policies - simplify to use is_teacher function
DROP POLICY IF EXISTS "Teachers can insert course materials" ON public.course_materials;
DROP POLICY IF EXISTS "Teachers can insert materials to their school" ON public.course_materials;

CREATE POLICY "Teachers can insert course materials"
ON public.course_materials
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = uploaded_by 
  AND is_teacher(auth.uid())
);