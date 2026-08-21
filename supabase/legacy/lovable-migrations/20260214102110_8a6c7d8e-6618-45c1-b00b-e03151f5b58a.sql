
-- Fix "Super admin can manage all profiles" policy to not reference auth.users directly
DROP POLICY IF EXISTS "Super admin can manage all profiles" ON public.profiles;
CREATE POLICY "Super admin can manage all profiles"
ON public.profiles FOR ALL
USING (lower((auth.jwt() ->> 'email'::text)) = 'malekismail487@gmail.com')
WITH CHECK (lower((auth.jwt() ->> 'email'::text)) = 'malekismail487@gmail.com');

-- Fix "Super admin can manage all schools" policy to not reference auth.users directly
DROP POLICY IF EXISTS "Super admin can manage all schools" ON public.schools;
CREATE POLICY "Super admin can manage all schools"
ON public.schools FOR ALL
USING (lower((auth.jwt() ->> 'email'::text)) = 'malekismail487@gmail.com')
WITH CHECK (lower((auth.jwt() ->> 'email'::text)) = 'malekismail487@gmail.com');
