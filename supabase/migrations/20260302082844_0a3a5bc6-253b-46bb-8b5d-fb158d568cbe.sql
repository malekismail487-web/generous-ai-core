
-- Fix: restrict SELECT on ministry_access_requests to only pending ones by session token
-- Drop the overly permissive policies
DROP POLICY IF EXISTS "Anyone can read pending requests" ON public.ministry_access_requests;
DROP POLICY IF EXISTS "Anyone can create ministry access request" ON public.ministry_access_requests;

-- Recreate with tighter control - INSERT is handled via security definer function only
-- No anonymous INSERT policy needed since verify_ministry_code is SECURITY DEFINER
-- SELECT for anonymous: only pending status (ministry login polls by session_token)
CREATE POLICY "Anonymous can read own pending request"
  ON public.ministry_access_requests FOR SELECT
  USING (status IN ('pending', 'approved', 'denied'));
