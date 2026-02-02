-- Fix duplicate/overloaded link_profile_after_signup functions.
-- The client calls rpc('link_profile_after_signup', { p_user_id, p_email }) and expects signature (uuid, text).

DROP FUNCTION IF EXISTS public.link_profile_after_signup(text, uuid);

CREATE OR REPLACE FUNCTION public.link_profile_after_signup(
  p_user_id uuid,
  p_email text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_profile_id uuid;
BEGIN
  -- Find active profile for this email that isn't already the auth id
  SELECT id
    INTO v_old_profile_id
  FROM public.profiles
  WHERE lower(email) = lower(p_email)
    AND is_active = true
    AND id <> p_user_id
  ORDER BY updated_at DESC
  LIMIT 1;

  IF v_old_profile_id IS NULL THEN
    RETURN json_build_object('success', true, 'linked', false, 'reason', 'no_migration_needed');
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

  -- Migrate the profile primary key to match auth uid
  UPDATE public.profiles
    SET id = p_user_id,
        updated_at = now()
  WHERE id = v_old_profile_id;

  RETURN json_build_object('success', true, 'linked', true, 'old_profile_id', v_old_profile_id, 'new_profile_id', p_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_profile_after_signup(uuid, text) TO authenticated;
