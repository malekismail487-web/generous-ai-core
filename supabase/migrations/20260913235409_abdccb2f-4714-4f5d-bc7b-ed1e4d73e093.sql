CREATE OR REPLACE FUNCTION public.is_email_verified(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE lower(u.email) = lower(trim(p_email))
      AND u.email_confirmed_at IS NOT NULL
  );
$$;

REVOKE ALL ON FUNCTION public.is_email_verified(text) FROM public;
GRANT EXECUTE ON FUNCTION public.is_email_verified(text) TO anon, authenticated, service_role;