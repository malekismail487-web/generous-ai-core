
CREATE OR REPLACE FUNCTION public.approve_invite_request(p_request_id uuid, p_grade text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_request RECORD;
  v_profile_id UUID;
  v_user_id UUID;
  v_subject_id UUID;
BEGIN
  SELECT ir.*, ic.school_id, ic.role, ic.subject_id
  INTO v_request
  FROM public.invite_requests ir
  JOIN public.invite_codes ic ON ic.id = ir.code_id
  WHERE ir.id = p_request_id AND ir.status = 'pending';

  IF v_request IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Request not found or already processed');
  END IF;

  IF NOT is_school_admin_of(auth.uid(), v_request.school_id) THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;

  v_user_id := v_request.user_id;
  v_subject_id := v_request.subject_id;

  IF v_user_id IS NOT NULL THEN
    v_profile_id := v_user_id;
    INSERT INTO public.profiles (id, school_id, full_name, email, user_type, status, is_active, grade_level, teacher_subject_id)
    VALUES (
      v_profile_id, v_request.school_id, v_request.name, v_request.email, v_request.role,
      'approved', true,
      CASE WHEN v_request.role = 'student' THEN p_grade ELSE NULL END,
      CASE WHEN v_request.role = 'teacher' THEN v_subject_id ELSE NULL END
    )
    ON CONFLICT (id) DO UPDATE SET
      school_id = EXCLUDED.school_id,
      full_name = EXCLUDED.full_name,
      user_type = EXCLUDED.user_type,
      status = 'approved',
      is_active = true,
      grade_level = CASE WHEN v_request.role = 'student' THEN p_grade ELSE profiles.grade_level END,
      teacher_subject_id = CASE WHEN v_request.role = 'teacher' THEN v_subject_id ELSE profiles.teacher_subject_id END;
  ELSE
    v_profile_id := gen_random_uuid();
    INSERT INTO public.profiles (id, school_id, full_name, email, user_type, status, is_active, grade_level, teacher_subject_id)
    VALUES (
      v_profile_id, v_request.school_id, v_request.name, v_request.email, v_request.role,
      'approved', true,
      CASE WHEN v_request.role = 'student' THEN p_grade ELSE NULL END,
      CASE WHEN v_request.role = 'teacher' THEN v_subject_id ELSE NULL END
    );
  END IF;

  IF v_request.role = 'teacher' AND v_user_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, 'teacher')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  UPDATE public.invite_requests
    SET status = 'approved', user_id = COALESCE(user_id, v_user_id), updated_at = now()
  WHERE id = p_request_id;

  UPDATE public.invite_codes SET used = true, used_by = v_user_id
  WHERE id = v_request.code_id;

  RETURN json_build_object('success', true, 'profile_id', v_profile_id);
END;
$function$;
