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
  IF p_user_id IS NULL OR p_email IS NULL OR length(trim(p_email)) = 0 THEN
    RETURN json_build_object('success', false, 'linked', false, 'reason', 'missing_user_or_email');
  END IF;

  UPDATE public.invite_requests
    SET user_id = p_user_id,
        updated_at = now()
  WHERE lower(email) = lower(p_email)
    AND status = 'pending'
    AND (user_id IS NULL OR user_id = p_user_id);

  SELECT id
    INTO v_old_profile_id
  FROM public.profiles
  WHERE lower(email) = lower(p_email)
    AND id <> p_user_id
    AND status IN ('pending', 'approved', 'rejected')
  ORDER BY
    CASE WHEN is_active = true THEN 0 ELSE 1 END,
    CASE status WHEN 'approved' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
    updated_at DESC
  LIMIT 1;

  IF v_old_profile_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
      UPDATE public.profiles
        SET email = lower(p_email),
            updated_at = now()
      WHERE id = p_user_id
        AND (email IS NULL OR lower(email) <> lower(p_email));
    END IF;
    RETURN json_build_object('success', true, 'linked', false, 'reason', 'no_migration_needed');
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RETURN json_build_object('success', false, 'linked', false, 'reason', 'target_profile_id_exists');
  END IF;

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

  UPDATE public.parent_students
    SET parent_id = p_user_id
  WHERE parent_id = v_old_profile_id;

  UPDATE public.parent_invite_codes
    SET used_by = p_user_id
  WHERE used_by = v_old_profile_id;

  UPDATE public.invite_requests
    SET user_id = p_user_id,
        updated_at = now()
  WHERE lower(email) = lower(p_email)
    AND (user_id IS NULL OR user_id = v_old_profile_id OR user_id = p_user_id);

  UPDATE public.profiles
    SET id = p_user_id,
        email = lower(p_email),
        updated_at = now()
  WHERE id = v_old_profile_id;

  RETURN json_build_object('success', true, 'linked', true, 'old_profile_id', v_old_profile_id, 'new_profile_id', p_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_profile_after_signup(uuid, text) TO authenticated;