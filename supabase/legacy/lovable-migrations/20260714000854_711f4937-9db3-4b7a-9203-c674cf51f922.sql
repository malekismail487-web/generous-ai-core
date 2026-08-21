
-- Phase T2: return tenant identity from every code-based onboarding RPC so the
-- client can override any pre-selected country with the code's real tenant.

-- 1) signup_with_invite_code -----------------------------------------------
CREATE OR REPLACE FUNCTION public.signup_with_invite_code(p_email text, p_invite_code text, p_full_name text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_code_record RECORD;
  v_perm_record RECORD;
  v_request_id UUID;
  v_profile_id UUID;
  v_tcat_id UUID;
  v_school_id UUID;
  v_role TEXT;
  v_school_name TEXT;
  v_tenant_id UUID;
  v_tenant_slug TEXT;
  v_tenant_name TEXT;
BEGIN
  SELECT ic.*, s.name as school_name, s.id as sid, s.tenant_id as tid
    INTO v_code_record
  FROM public.invite_codes ic
  JOIN public.schools s ON s.id = ic.school_id
  WHERE ic.code = UPPER(p_invite_code)
    AND ic.used = false
    AND ic.expires_at > NOW();

  IF v_code_record.id IS NOT NULL THEN
    v_school_id := v_code_record.school_id;
    v_role := v_code_record.role;
    v_school_name := v_code_record.school_name;
    v_tcat_id := v_code_record.teacher_category_id;
    v_tenant_id := v_code_record.tid;
  ELSE
    SELECT tc.id AS tcat_id, tc.school_id, s.name AS school_name, s.tenant_id AS tid
      INTO v_perm_record
    FROM public.teacher_categories tc
    JOIN public.schools s ON s.id = tc.school_id
    WHERE tc.permanent_invite_code = UPPER(p_invite_code)
    LIMIT 1;

    IF v_perm_record.tcat_id IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Invalid or expired invite code');
    END IF;

    v_school_id := v_perm_record.school_id;
    v_role := 'teacher';
    v_school_name := v_perm_record.school_name;
    v_tcat_id := v_perm_record.tcat_id;
    v_tenant_id := v_perm_record.tid;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.invite_requests
    WHERE email = LOWER(p_email)
      AND (code_id = v_code_record.id OR (v_code_record.id IS NULL))
      AND status = 'pending'
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Request already pending for this email');
  END IF;

  INSERT INTO public.invite_requests (code_id, name, email, status)
  VALUES (v_code_record.id, p_full_name, LOWER(p_email), 'pending')
  RETURNING id INTO v_request_id;

  v_profile_id := gen_random_uuid();
  INSERT INTO public.profiles (id, school_id, full_name, email, user_type, status, is_active, teacher_category_id)
  VALUES (v_profile_id, v_school_id, p_full_name, LOWER(p_email), v_role, 'pending', false, v_tcat_id)
  ON CONFLICT DO NOTHING;

  SELECT slug, country_name INTO v_tenant_slug, v_tenant_name
    FROM public.tenants WHERE id = v_tenant_id;

  RETURN json_build_object(
    'success', true,
    'request_id', v_request_id,
    'school_name', v_school_name,
    'role', v_role,
    'tenant_id', v_tenant_id,
    'tenant_slug', v_tenant_slug,
    'tenant_name', v_tenant_name
  );
END;
$function$;

-- 2) activate_school_with_code ---------------------------------------------
CREATE OR REPLACE FUNCTION public.activate_school_with_code(activation_code_input text, user_uuid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    school_record record;
    user_email text;
    v_tenant_slug text;
    v_tenant_name text;
BEGIN
    SELECT email INTO user_email FROM auth.users WHERE id = user_uuid;

    SELECT * INTO school_record FROM public.schools
    WHERE UPPER(activation_code) = UPPER(activation_code_input)
      AND code_used = false AND status = 'active';

    IF school_record IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid or already used activation code');
    END IF;

    UPDATE public.schools
    SET code_used = true, code_used_by = user_uuid, code_used_at = now()
    WHERE id = school_record.id;

    INSERT INTO public.profiles (id, school_id, full_name, user_type, status, is_active, email)
    VALUES (user_uuid, school_record.id, COALESCE(user_email, 'School Admin'), 'school_admin', 'approved', true, user_email)
    ON CONFLICT (id) DO UPDATE SET
        school_id = school_record.id, user_type = 'school_admin',
        status = 'approved', is_active = true, email = user_email;

    INSERT INTO public.user_roles (user_id, role) VALUES (user_uuid, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;

    INSERT INTO public.school_admins (user_id, school_id) VALUES (user_uuid, school_record.id)
    ON CONFLICT DO NOTHING;

    PERFORM public.seed_default_subjects(school_record.id);
    PERFORM public.seed_default_teacher_categories(school_record.id);

    BEGIN
      INSERT INTO public.admin_logs (admin_id, school_id, action, target_id, target_type, details)
      VALUES (user_uuid, school_record.id, 'school_activated', school_record.id, 'school',
              jsonb_build_object('activation_code', activation_code_input));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    SELECT slug, country_name INTO v_tenant_slug, v_tenant_name
      FROM public.tenants WHERE id = school_record.tenant_id;

    RETURN jsonb_build_object(
      'success', true,
      'school_id', school_record.id,
      'school_name', school_record.name,
      'tenant_id', school_record.tenant_id,
      'tenant_slug', v_tenant_slug,
      'tenant_name', v_tenant_name
    );
END;
$function$;

-- 3) signup_as_parent -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.signup_as_parent(
  p_parent_user_id uuid,
  p_parent_code text,
  p_full_name text
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_code_rec RECORD;
  v_parent_email text;
  v_tenant_slug text;
  v_tenant_name text;
BEGIN
  SELECT pic.*, s.name as school_name, s.tenant_id as tid
  INTO v_code_rec
  FROM parent_invite_codes pic
  JOIN schools s ON s.id = pic.school_id
  WHERE pic.code = upper(p_parent_code)
    AND pic.used = false;

  IF v_code_rec IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid or already used parent code.');
  END IF;

  SELECT email INTO v_parent_email FROM auth.users WHERE id = p_parent_user_id;

  INSERT INTO profiles (id, school_id, full_name, email, user_type, status, is_active)
  VALUES (p_parent_user_id, v_code_rec.school_id, p_full_name, v_parent_email, 'parent', 'approved', true)
  ON CONFLICT (id) DO UPDATE SET
    school_id = v_code_rec.school_id,
    full_name = p_full_name,
    user_type = 'parent',
    status = 'approved',
    is_active = true;

  INSERT INTO parent_students (parent_id, student_id, school_id)
  VALUES (p_parent_user_id, v_code_rec.student_id, v_code_rec.school_id)
  ON CONFLICT (parent_id, student_id) DO NOTHING;

  UPDATE parent_invite_codes SET used = true, used_by = p_parent_user_id WHERE id = v_code_rec.id;

  SELECT slug, country_name INTO v_tenant_slug, v_tenant_name
    FROM public.tenants WHERE id = v_code_rec.tid;

  RETURN json_build_object(
    'success', true,
    'school_name', v_code_rec.school_name,
    'student_id', v_code_rec.student_id,
    'tenant_id', v_code_rec.tid,
    'tenant_slug', v_tenant_slug,
    'tenant_name', v_tenant_name
  );
END;
$$;
