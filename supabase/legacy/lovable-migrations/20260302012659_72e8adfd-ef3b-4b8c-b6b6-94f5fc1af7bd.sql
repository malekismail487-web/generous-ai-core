CREATE POLICY "Parents can view their child profile" ON public.profiles
  FOR SELECT USING (
    id IN (SELECT student_id FROM parent_students WHERE parent_id = auth.uid())
  );