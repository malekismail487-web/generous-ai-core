
-- Fix the permissive RLS policy on invite_requests
DROP POLICY IF EXISTS "Users can create invite requests" ON public.invite_requests;

-- More restrictive policy - users can only create invite requests if the code exists and is valid
CREATE POLICY "Users can create invite requests with valid code"
ON public.invite_requests FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.invite_codes ic
        WHERE ic.id = code_id
        AND ic.used = false
        AND ic.expires_at > now()
    )
);
