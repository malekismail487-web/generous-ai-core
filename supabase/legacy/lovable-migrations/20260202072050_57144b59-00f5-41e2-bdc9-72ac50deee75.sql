-- Update signup_with_invite_code to also create a pending profile placeholder
CREATE OR REPLACE FUNCTION public.signup_with_invite_code(p_email text, p_invite_code text, p_full_name text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_code_record RECORD;
  v_request_id UUID;
  v_profile_id UUID;
BEGIN
  -- Find the invite code
  SELECT ic.*, s.name as school_name, s.id as sid
  INTO v_code_record
  FROM public.invite_codes ic
  JOIN public.schools s ON s.id = ic.school_id
  WHERE ic.code = UPPER(p_invite_code)
    AND ic.used = false
    AND ic.expires_at > NOW();
  
  IF v_code_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid or expired invite code');
  END IF;
  
  -- Check if email already has a pending request for this code
  IF EXISTS (
    SELECT 1 FROM public.invite_requests 
    WHERE email = LOWER(p_email) AND code_id = v_code_record.id AND status = 'pending'
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Request already pending for this email');
  END IF;
  
  -- Create invite request
  INSERT INTO public.invite_requests (code_id, name, email, status)
  VALUES (v_code_record.id, p_full_name, LOWER(p_email), 'pending')
  RETURNING id INTO v_request_id;
  
  -- Create a pending profile placeholder with the email
  v_profile_id := gen_random_uuid();
  INSERT INTO public.profiles (id, school_id, full_name, email, user_type, status, is_active)
  VALUES (
    v_profile_id,
    v_code_record.school_id,
    p_full_name,
    LOWER(p_email),
    v_code_record.role,
    'pending',
    false
  )
  ON CONFLICT DO NOTHING;
  
  RETURN json_build_object(
    'success', true,
    'request_id', v_request_id,
    'school_name', v_code_record.school_name,
    'role', v_code_record.role
  );
END;
$function$;