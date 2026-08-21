
-- Allow teachers to view learning profiles of students in their school
CREATE POLICY "Teachers can view student learning profiles in their school"
ON public.student_learning_profiles FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles teacher_p
    JOIN public.profiles student_p ON student_p.id = student_learning_profiles.user_id
    WHERE teacher_p.id = auth.uid()
      AND teacher_p.user_type = 'teacher'
      AND teacher_p.is_active = true
      AND student_p.school_id = teacher_p.school_id
  )
);
