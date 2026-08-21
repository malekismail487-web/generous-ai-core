-- Fix invite_requests_status_check to match application statuses
-- App uses: pending/approved/rejected, while older constraint allowed: pending/accepted/denied
ALTER TABLE public.invite_requests DROP CONSTRAINT IF EXISTS invite_requests_status_check;

ALTER TABLE public.invite_requests
ADD CONSTRAINT invite_requests_status_check
CHECK (
  status = ANY (ARRAY[
    'pending'::text,
    'approved'::text,
    'rejected'::text,
    'accepted'::text,
    'denied'::text
  ])
);