-- Fix RLS warning: table had RLS enabled but no policies
CREATE POLICY "Super admin can manage super admin verification"
ON public.super_admin_verification
FOR ALL
USING ((auth.jwt() ->> 'email') = 'malekismail487@gmail.com')
WITH CHECK ((auth.jwt() ->> 'email') = 'malekismail487@gmail.com');