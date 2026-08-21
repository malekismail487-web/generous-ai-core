
-- Fix: Remove overly permissive INSERT policy on content_flags (service_role bypasses RLS anyway)
DROP POLICY IF EXISTS "System can insert flags" ON public.content_flags;

-- Fix: Tighten moderator_requests INSERT - only allow if code_id references a valid unused code
DROP POLICY IF EXISTS "Anyone can submit moderator request" ON public.moderator_requests;
CREATE POLICY "Validated moderator signup" ON public.moderator_requests
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM moderator_invite_codes 
      WHERE id = code_id AND used = false AND expires_at > now()
    )
  );
