-- Add RLS policy to allow users to view their own profile by email
-- This is needed because during the invite code flow, profiles are created 
-- before the user signs up, so the profile.id won't match auth.uid()

CREATE POLICY "Users can view own profile by email"
ON public.profiles
FOR SELECT
USING (
  auth.jwt() ->> 'email' IS NOT NULL 
  AND LOWER(email) = LOWER(auth.jwt() ->> 'email')
);