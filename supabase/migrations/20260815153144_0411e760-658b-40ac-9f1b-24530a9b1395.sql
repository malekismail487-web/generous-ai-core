-- Legacy school-admin panel approves/rejects an existing profile row directly.
-- These functions give that path the same side effects as approve_invite_request.
CREATE OR REPLACE FUNCTION public.approve_school_profile(p_profile_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile RECORD;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_profile_id;
  IF v_profile IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Profile not found');
  END IF;

  IF NOT (is_school_admin_of(auth.uid(), v_profile.school_id) OR is_super_admin()) THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;

  UPDATE public.profiles
     SET status = 'approved', is_active = true
   WHERE id = p_profile_id;

  IF v_profile.user_type IN ('teacher', 'student') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (p_profile_id, v_profile.user_type::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  UPDATE public.invite_requests
     SET status = 'approved', updated_at = now()
   WHERE status = 'pending'
     AND (user_id = p_profile_id OR lower(email) = lower(v_profile.email));

  RETURN json_build_object('success', true, 'profile_id', p_profile_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_school_profile(p_profile_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile RECORD;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_profile_id;
  IF v_profile IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Profile not found');
  END IF;

  IF NOT (is_school_admin_of(auth.uid(), v_profile.school_id) OR is_super_admin()) THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;

  UPDATE public.profiles
     SET status = 'rejected', is_active = false
   WHERE id = p_profile_id;

  UPDATE public.invite_requests
     SET status = 'denied', updated_at = now()
   WHERE status = 'pending'
     AND (user_id = p_profile_id OR lower(email) = lower(v_profile.email));

  RETURN json_build_object('success', true, 'profile_id', p_profile_id);
END;
$$;

REVOKE ALL ON FUNCTION public.approve_school_profile(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_school_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_school_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_school_profile(uuid) TO authenticated;