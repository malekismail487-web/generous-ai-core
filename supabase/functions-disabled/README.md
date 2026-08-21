# Non-deployable Edge Function Evidence

This directory is outside `supabase/functions/` and is therefore not part of
Lumina's approved Edge Function deployment surface.

- `activate-school/` is the retired, non-transactional legacy School Admin
  activation implementation. The canonical replacement is the authenticated
  `public.activate_school(text)` RPC.
- `mi-aggregate/` and `unified-optimize/` remain default-deny because the
  repository does not prove a safe caller and authorization contract.

These files are retained only for review evidence. Moving any directory back
under `supabase/functions/` requires a reviewed caller, authentication,
authorization, tenant/resource binding, idempotency, audit, cost/rate, and
hostile-negative-test contract.
