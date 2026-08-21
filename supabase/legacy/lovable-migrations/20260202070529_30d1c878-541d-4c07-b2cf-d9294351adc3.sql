-- Fix the approve_invite_request function to handle the profile linking properly
-- The issue is that approved profiles get random UUIDs instead of the auth user's ID
-- We need to store the user_id from auth when they sign up

CREATE OR REPLACE FUNCTION public.approve_invite_request(p_request_id uuid, p_grade text DEFAULT NULL::text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
  v_profile_id UUID;
  v_user_id UUID;
BEGIN
  -- Get the request
  SELECT ir.*, ic.school_id, ic.role
  INTO v_request
  FROM public.invite_requests ir
  JOIN public.invite_codes ic ON ic.id = ir.code_id
  WHERE ir.id = p_request_id AND ir.status = 'pending';
  
  IF v_request IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Request not found or already processed');
  END IF;
  
  -- Check if caller is school admin for this school
  IF NOT is_school_admin_of(auth.uid(), v_request.school_id) THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;
  
  -- Check if user_id is set (user has authenticated)
  v_user_id := v_request.user_id;
  
  IF v_user_id IS NOT NULL THEN
    -- User has already authenticated - use their auth ID
    v_profile_id := v_user_id;
    
    -- Update existing profile or create new one
    INSERT INTO public.profiles (id, school_id, full_name, email, user_type, status, is_active, grade_level)
    VALUES (
      v_profile_id,
      v_request.school_id,
      v_request.name,
      v_request.email,
      v_request.role,
      'approved',
      true,
      CASE WHEN v_request.role = 'student' THEN p_grade ELSE NULL END
    )
    ON CONFLICT (id) DO UPDATE SET
      school_id = EXCLUDED.school_id,
      full_name = EXCLUDED.full_name,
      user_type = EXCLUDED.role,
      status = 'approved',
      is_active = true,
      grade_level = CASE WHEN v_request.role = 'student' THEN p_grade ELSE profiles.grade_level END;
  ELSE
    -- User has not authenticated yet - create a pending profile with their email
    -- The profile will be linked when they sign up with this email
    v_profile_id := gen_random_uuid();
    
    INSERT INTO public.profiles (id, school_id, full_name, email, user_type, status, is_active, grade_level)
    VALUES (
      v_profile_id,
      v_request.school_id,
      v_request.name,
      v_request.email,
      v_request.role,
      'approved',
      true,
      CASE WHEN v_request.role = 'student' THEN p_grade ELSE NULL END
    );
  END IF;
  
  -- If it's a teacher, add teacher role
  IF v_request.role = 'teacher' AND v_user_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, 'teacher')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  
  -- Update request status
  UPDATE public.invite_requests
  SET status = 'approved', grade = p_grade
  WHERE id = p_request_id;
  
  -- Mark code as used
  UPDATE public.invite_codes
  SET used = true
  WHERE id = v_request.code_id;
  
  RETURN json_build_object('success', true, 'profile_id', v_profile_id);
END;
$$;