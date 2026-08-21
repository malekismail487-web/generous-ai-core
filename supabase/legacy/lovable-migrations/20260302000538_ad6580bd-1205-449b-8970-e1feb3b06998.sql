
-- Super admin needs to see ALL data across ALL schools for Global Analytics Dashboard
-- Super admin email: malekismail487@gmail.com

-- 1. Super admin can view ALL assignments (across all schools)
CREATE POLICY "Super admin can view all assignments"
  ON public.assignments FOR SELECT
  USING (lower((auth.jwt() ->> 'email'::text)) = 'malekismail487@gmail.com'::text);

-- 2. Super admin can view ALL profiles (across all schools)
CREATE POLICY "Super admin can view all profiles"
  ON public.profiles FOR SELECT
  USING (lower((auth.jwt() ->> 'email'::text)) = 'malekismail487@gmail.com'::text);

-- 3. Super admin can view ALL course_materials (across all schools)
CREATE POLICY "Super admin can view all course materials"
  ON public.course_materials FOR SELECT
  USING (lower((auth.jwt() ->> 'email'::text)) = 'malekismail487@gmail.com'::text);

-- 4. Super admin can view ALL student_learning_profiles
CREATE POLICY "Super admin can view all learning profiles"
  ON public.student_learning_profiles FOR SELECT
  USING (lower((auth.jwt() ->> 'email'::text)) = 'malekismail487@gmail.com'::text);

-- 5. Super admin can view ALL learning_style_profiles
CREATE POLICY "Super admin can view all learning style profiles"
  ON public.learning_style_profiles FOR SELECT
  USING (lower((auth.jwt() ->> 'email'::text)) = 'malekismail487@gmail.com'::text);

-- 6. Super admin can view ALL activity_logs
CREATE POLICY "Super admin can view all activity logs"
  ON public.activity_logs FOR SELECT
  USING (lower((auth.jwt() ->> 'email'::text)) = 'malekismail487@gmail.com'::text);

-- 7. Super admin can view ALL submissions
CREATE POLICY "Super admin can view all submissions"
  ON public.submissions FOR SELECT
  USING (lower((auth.jwt() ->> 'email'::text)) = 'malekismail487@gmail.com'::text);

-- 8. School admins can view student_learning_profiles for students in their school
CREATE POLICY "School admins can view student learning profiles"
  ON public.student_learning_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles student_p
      JOIN profiles admin_p ON admin_p.id = auth.uid()
      WHERE student_p.id = student_learning_profiles.user_id
        AND student_p.school_id = admin_p.school_id
        AND admin_p.user_type = 'school_admin'
        AND admin_p.is_active = true
    )
  );

-- 9. School admins can view submissions for assignments in their school
CREATE POLICY "School admins can view submissions in their school"
  ON public.submissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM assignments a
      JOIN profiles p ON p.id = auth.uid()
      WHERE a.id = submissions.assignment_id
        AND a.school_id = p.school_id
        AND p.user_type = 'school_admin'
        AND p.is_active = true
    )
  );
