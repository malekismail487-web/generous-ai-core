-- Allow school admins to delete profiles in their school
CREATE POLICY "School admins can delete school profiles"
ON public.profiles
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM school_admins sa
    WHERE sa.user_id = auth.uid() AND sa.school_id = profiles.school_id
  )
);

-- Allow super admin to manage all profiles (update/delete for suspend/activate)
CREATE POLICY "Super admin can manage all profiles"
ON public.profiles
FOR ALL
TO authenticated
USING (
  (SELECT email FROM auth.users WHERE id = auth.uid()) = 'malekismail487@gmail.com'
)
WITH CHECK (
  (SELECT email FROM auth.users WHERE id = auth.uid()) = 'malekismail487@gmail.com'
);