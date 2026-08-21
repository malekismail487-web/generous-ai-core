-- Fix ID alignment between authenticated users and profiles.
-- The app currently creates profiles with non-auth UUIDs during invite/pre-registration,
-- but RLS policies across the app expect profiles.id = auth.uid().
-- This function links (migrates) the active profile row for an email to the authenticated user id,
-- and rewrites dependent rows that stored the old profile id.

CREATE OR REPLACE FUNCTION public.link_profile_after_signup(
  p_email text,
  p_user_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_profile_id uuid;
  v_linked boolean := false;
BEGIN
  -- Find the currently active profile for this email (created during pre-registration)
  SELECT id
    INTO v_old_profile_id
  FROM public.profiles
  WHERE lower(email) = lower(p_email)
    AND is_active = true
  ORDER BY updated_at DESC
  LIMIT 1;

  IF v_old_profile_id IS NULL THEN
    RETURN json_build_object('success', true, 'linked', false, 'reason', 'no_active_profile');
  END IF;

  -- If already aligned, nothing to do
  IF v_old_profile_id = p_user_id THEN
    RETURN json_build_object('success', true, 'linked', true, 'reason', 'already_linked');
  END IF;

  -- Safety: don't overwrite an existing profile row with the target auth id
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RETURN json_build_object('success', false, 'linked', false, 'reason', 'target_profile_id_exists');
  END IF;

  -- Rewrite dependent rows that may have stored the old profile id
  UPDATE public.assignments
    SET teacher_id = p_user_id
  WHERE teacher_id = v_old_profile_id;

  UPDATE public.course_materials
    SET uploaded_by = p_user_id
  WHERE uploaded_by = v_old_profile_id;

  UPDATE public.submissions
    SET graded_by = p_user_id
  WHERE graded_by = v_old_profile_id;

  UPDATE public.activity_logs
    SET user_id = p_user_id
  WHERE user_id = v_old_profile_id;

  -- Finally, migrate the profile primary key to match auth uid
  UPDATE public.profiles
    SET id = p_user_id,
        updated_at = now()
  WHERE id = v_old_profile_id;

  v_linked := true;
  RETURN json_build_object('success', true, 'linked', v_linked, 'old_profile_id', v_old_profile_id, 'new_profile_id', p_user_id);
END;
$$;

-- Ensure the function is callable by authenticated users (RPC call from the client)
GRANT EXECUTE ON FUNCTION public.link_profile_after_signup(text, uuid) TO authenticated;
