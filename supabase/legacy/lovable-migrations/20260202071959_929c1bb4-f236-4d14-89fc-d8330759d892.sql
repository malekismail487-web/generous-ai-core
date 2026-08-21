-- Update link_profile_after_signup to handle both pending and approved profiles
CREATE OR REPLACE FUNCTION public.link_profile_after_signup(p_user_id uuid, p_email text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_profile RECORD;
BEGIN
  -- Check if there's a profile with matching email (either pending or approved)
  SELECT p.* INTO v_profile
  FROM public.profiles p
  WHERE LOWER(p.email) = LOWER(p_email)
    AND p.status IN ('pending', 'approved')
    AND p.id != p_user_id;
  
  IF v_profile IS NOT NULL THEN
    -- Update invite_requests to link to auth user
    UPDATE public.invite_requests 
    SET user_id = p_user_id 
    WHERE LOWER(email) = LOWER(p_email);
    
    -- Add teacher role if approved teacher
    IF v_profile.user_type = 'teacher' AND v_profile.status = 'approved' THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (p_user_id, 'teacher')
      ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
    
    -- Delete the old profile (placeholder)
    DELETE FROM public.profiles WHERE id = v_profile.id;
    
    -- Create profile with the auth user's ID, preserving the original status
    INSERT INTO public.profiles (id, school_id, full_name, email, user_type, status, is_active, grade_level, department, student_teacher_id)
    VALUES (
      p_user_id,
      v_profile.school_id,
      v_profile.full_name,
      v_profile.email,
      v_profile.user_type,
      v_profile.status,
      CASE WHEN v_profile.status = 'approved' THEN true ELSE false END,
      v_profile.grade_level,
      v_profile.department,
      v_profile.student_teacher_id
    )
    ON CONFLICT (id) DO UPDATE SET
      school_id = EXCLUDED.school_id,
      full_name = EXCLUDED.full_name,
      email = EXCLUDED.email,
      user_type = EXCLUDED.user_type,
      status = EXCLUDED.status,
      is_active = EXCLUDED.is_active,
      grade_level = EXCLUDED.grade_level,
      department = EXCLUDED.department,
      student_teacher_id = EXCLUDED.student_teacher_id;
    
    RETURN json_build_object('success', true, 'linked', true, 'user_type', v_profile.user_type, 'status', v_profile.status);
  END IF;
  
  RETURN json_build_object('success', true, 'linked', false);
END;
$function$;