-- Canonical Lumina schema source: immutable authority and school-scoped operations

CREATE FUNCTION public.prevent_platform_audit_mutation() RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'platform_audit_log is append-only' USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER platform_audit_log_append_only
BEFORE UPDATE OR DELETE ON public.platform_audit_log
FOR EACH ROW EXECUTE FUNCTION public.prevent_platform_audit_mutation();

CREATE FUNCTION public.current_aal() RETURNS text
LANGUAGE sql STABLE
SET search_path TO 'pg_catalog', 'auth'
AS $$
  SELECT COALESCE(auth.jwt() ->> 'aal', 'aal1');
$$;

CREATE FUNCTION public.is_super_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $$
  SELECT auth.uid() IS NOT NULL
    AND public.current_aal() = 'aal2'
    AND EXISTS (
      SELECT 1
      FROM public.platform_role_assignments pra
      WHERE pra.user_id = auth.uid()
        AND pra.role = 'super_admin'::public.platform_role
        AND pra.active
    );
$$;

CREATE FUNCTION public.is_super_admin(uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $$
  SELECT uid IS NOT NULL AND uid = auth.uid() AND public.is_super_admin();
$$;

CREATE FUNCTION public.is_super_admin_user(uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $$
  SELECT uid IS NOT NULL AND uid = auth.uid() AND public.is_super_admin();
$$;

CREATE FUNCTION public.is_super_admin_caller() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $$
  SELECT public.is_super_admin();
$$;

CREATE FUNCTION public.is_school_admin_of(user_uuid uuid, check_school_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $$
  SELECT user_uuid IS NOT NULL
    AND check_school_id IS NOT NULL
    AND user_uuid = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.school_admins sa
        ON sa.user_id = p.id
       AND sa.school_id = p.school_id
       AND sa.active
      WHERE p.id = user_uuid
        AND p.school_id = check_school_id
        AND p.user_type = 'school_admin'
        AND p.status = 'approved'
        AND p.is_active
    );
$$;

CREATE FUNCTION public.is_school_admin(user_uuid uuid, check_school_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $$
  SELECT public.is_school_admin_of(user_uuid, check_school_id);
$$;

CREATE FUNCTION public.get_authority_context() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $$
  SELECT jsonb_build_object(
    'user_id', auth.uid(),
    'aal', public.current_aal(),
    'is_super_admin', public.is_super_admin(),
    'school_admin_school_ids', COALESCE((
      SELECT jsonb_agg(sa.school_id ORDER BY sa.school_id)
      FROM public.school_admins sa
      JOIN public.profiles p ON p.id = sa.user_id AND p.school_id = sa.school_id
      WHERE sa.user_id = auth.uid()
        AND sa.active
        AND p.user_type = 'school_admin'
        AND p.status = 'approved'
        AND p.is_active
    ), '[]'::jsonb)
  )
  WHERE auth.uid() IS NOT NULL;
$$;

CREATE FUNCTION public.grant_platform_role(target_user_id uuid, target_role public.platform_role DEFAULT 'super_admin') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super Admin with AAL2 required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = target_user_id) THEN
    RAISE EXCEPTION 'Target authentication identity does not exist' USING ERRCODE = '23503';
  END IF;
  IF (SELECT is_open FROM public.platform_bootstrap_state WHERE singleton) THEN
    RAISE EXCEPTION 'Owner bootstrap ceremony has not been completed' USING ERRCODE = '55000';
  END IF;

  PERFORM pg_advisory_xact_lock(pg_catalog.hashtext('lumina.platform_role_assignments'));
  INSERT INTO public.platform_role_assignments (
    user_id, role, active, granted_at, granted_by, revoked_at, revoked_by
  ) VALUES (
    target_user_id, target_role, true, now(), auth.uid(), NULL, NULL
  )
  ON CONFLICT (user_id, role) DO UPDATE SET
    active = true,
    granted_at = now(),
    granted_by = auth.uid(),
    revoked_at = NULL,
    revoked_by = NULL;

  INSERT INTO public.platform_audit_log (event_type, actor_user_id, target_user_id, detail)
  VALUES ('platform.role_granted', auth.uid(), target_user_id, jsonb_build_object('role', target_role));
  RETURN jsonb_build_object('success', true, 'user_id', target_user_id, 'role', target_role);
END;
$$;

CREATE FUNCTION public.revoke_platform_role(target_user_id uuid, target_role public.platform_role DEFAULT 'super_admin') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $$
DECLARE
  active_super_admins integer;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super Admin with AAL2 required' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(pg_catalog.hashtext('lumina.platform_role_assignments'));

  SELECT count(*) INTO active_super_admins
  FROM public.platform_role_assignments
  WHERE role = 'super_admin'::public.platform_role AND active;

  IF target_role = 'super_admin'::public.platform_role
     AND active_super_admins <= 1
     AND EXISTS (
       SELECT 1 FROM public.platform_role_assignments
       WHERE user_id = target_user_id AND role = target_role AND active
     ) THEN
    RAISE EXCEPTION 'Cannot revoke the last active Super Admin' USING ERRCODE = '23514';
  END IF;

  UPDATE public.platform_role_assignments
  SET active = false, revoked_at = now(), revoked_by = auth.uid()
  WHERE user_id = target_user_id AND role = target_role AND active;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'already_inactive', true);
  END IF;

  INSERT INTO public.platform_audit_log (event_type, actor_user_id, target_user_id, detail)
  VALUES ('platform.role_revoked', auth.uid(), target_user_id, jsonb_build_object('role', target_role));
  RETURN jsonb_build_object('success', true, 'user_id', target_user_id, 'role', target_role);
END;
$$;

CREATE FUNCTION public.create_school_with_code(
  school_name text,
  school_code text,
  activation_code_input text,
  school_address text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
AS $$
DECLARE
  new_school_id uuid;
  tenant_id uuid;
  code_hash text;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super Admin with AAL2 required' USING ERRCODE = '42501';
  END IF;
  IF btrim(COALESCE(school_name, '')) = '' OR btrim(COALESCE(school_code, '')) = '' THEN
    RAISE EXCEPTION 'School name and code are required' USING ERRCODE = '22023';
  END IF;
  IF upper(btrim(COALESCE(activation_code_input, ''))) !~ '^[A-Z0-9_-]{16,128}$' THEN
    RAISE EXCEPTION 'Activation code must be 16-128 characters using A-Z, 0-9, underscore, or hyphen' USING ERRCODE = '22023';
  END IF;
  code_hash := encode(extensions.digest(upper(btrim(activation_code_input)), 'sha256'), 'hex');
  IF EXISTS (SELECT 1 FROM public.schools s WHERE s.activation_code_hash = code_hash) THEN
    RAISE EXCEPTION 'Activation code already exists' USING ERRCODE = '23505';
  END IF;

  SELECT t.id INTO tenant_id
  FROM public.tenants t
  WHERE t.status = 'active' AND t.is_visible
  ORDER BY t.created_at, t.id
  LIMIT 1;
  IF tenant_id IS NULL THEN
    RAISE EXCEPTION 'No active tenant configured' USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.schools (name, code, activation_code_hash, address, status, code_used, tenant_id)
  VALUES (btrim(school_name), upper(btrim(school_code)), code_hash, NULLIF(btrim(school_address), ''), 'active', false, tenant_id)
  RETURNING id INTO new_school_id;

  INSERT INTO public.platform_audit_log (event_type, actor_user_id, school_id, detail)
  VALUES ('school.created', auth.uid(), new_school_id, jsonb_build_object('school_code', upper(btrim(school_code))));
  RETURN jsonb_build_object('success', true, 'school_id', new_school_id);
END;
$$;

CREATE FUNCTION public.activate_school(activation_code_input text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
AS $$
DECLARE
  actor_id uuid := auth.uid();
  actor_email text;
  actor_name text;
  code_hash text;
  school_record public.schools%ROWTYPE;
  current_profile public.profiles%ROWTYPE;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF upper(btrim(COALESCE(activation_code_input, ''))) !~ '^[A-Z0-9_-]{16,128}$' THEN
    RAISE EXCEPTION 'Invalid activation code' USING ERRCODE = '22023';
  END IF;
  code_hash := encode(extensions.digest(upper(btrim(activation_code_input)), 'sha256'), 'hex');

  SELECT s.* INTO school_record
  FROM public.schools s
  WHERE s.activation_code_hash = code_hash
    AND NOT s.code_used
    AND s.status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or already used activation code' USING ERRCODE = '22023';
  END IF;

  SELECT p.* INTO current_profile FROM public.profiles p WHERE p.id = actor_id FOR UPDATE;
  IF FOUND AND current_profile.school_id IS NOT NULL AND current_profile.school_id <> school_record.id THEN
    RAISE EXCEPTION 'Authenticated identity already belongs to another school' USING ERRCODE = '42501';
  END IF;

  SELECT u.email, COALESCE(NULLIF(u.raw_user_meta_data ->> 'full_name', ''), split_part(u.email, '@', 1), 'School Admin')
  INTO actor_email, actor_name
  FROM auth.users u WHERE u.id = actor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Authenticated identity does not exist' USING ERRCODE = '42501';
  END IF;

  UPDATE public.schools
  SET code_used = true, code_used_by = actor_id, code_used_at = now()
  WHERE id = school_record.id AND NOT code_used;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Activation code was consumed concurrently' USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.profiles (id, school_id, full_name, user_type, status, is_active, email)
  VALUES (actor_id, school_record.id, actor_name, 'school_admin', 'approved', true, actor_email)
  ON CONFLICT (id) DO UPDATE SET
    school_id = EXCLUDED.school_id,
    full_name = EXCLUDED.full_name,
    user_type = 'school_admin',
    status = 'approved',
    is_active = true,
    email = EXCLUDED.email;

  INSERT INTO public.school_admins (user_id, school_id, active, granted_at, granted_by, revoked_at, revoked_by)
  VALUES (actor_id, school_record.id, true, now(), actor_id, NULL, NULL)
  ON CONFLICT (user_id, school_id) DO UPDATE SET
    active = true, granted_at = now(), granted_by = actor_id, revoked_at = NULL, revoked_by = NULL;

  PERFORM public.seed_default_subjects(school_record.id);
  PERFORM public.seed_default_teacher_categories(school_record.id);
  INSERT INTO public.platform_audit_log (event_type, actor_user_id, school_id)
  VALUES ('school.activation_completed', actor_id, school_record.id);

  RETURN jsonb_build_object(
    'success', true,
    'school_id', school_record.id,
    'school_name', school_record.name,
    'tenant_id', school_record.tenant_id
  );
END;
$$;

CREATE FUNCTION public.approve_invite_request(p_request_id uuid, p_grade text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $$
DECLARE
  actor_id uuid := auth.uid();
  request_record record;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT ir.*, ic.school_id, ic.role, ic.subject_id
  INTO request_record
  FROM public.invite_requests ir
  JOIN public.invite_codes ic ON ic.id = ir.code_id
  WHERE ir.id = p_request_id
  FOR UPDATE OF ir, ic;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invite request not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.is_school_admin_of(actor_id, request_record.school_id) THEN
    RAISE EXCEPTION 'School Admin authority required for this school' USING ERRCODE = '42501';
  END IF;
  IF request_record.status = 'approved' THEN
    RETURN jsonb_build_object('success', true, 'already_approved', true, 'profile_id', request_record.user_id);
  END IF;
  IF request_record.status <> 'pending' OR request_record.user_id IS NULL THEN
    RAISE EXCEPTION 'Only a pending request bound to an authenticated identity can be approved' USING ERRCODE = '55000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = request_record.user_id) THEN
    RAISE EXCEPTION 'Invite identity does not exist' USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.profiles (id, school_id, full_name, email, user_type, status, is_active, grade_level, teacher_subject_id)
  VALUES (
    request_record.user_id, request_record.school_id, request_record.name, request_record.email,
    request_record.role, 'approved', true,
    CASE WHEN request_record.role = 'student' THEN p_grade ELSE NULL END,
    CASE WHEN request_record.role = 'teacher' THEN request_record.subject_id ELSE NULL END
  )
  ON CONFLICT (id) DO UPDATE SET
    school_id = EXCLUDED.school_id, full_name = EXCLUDED.full_name, email = EXCLUDED.email,
    user_type = EXCLUDED.user_type, status = 'approved', is_active = true,
    grade_level = EXCLUDED.grade_level, teacher_subject_id = EXCLUDED.teacher_subject_id;

  IF request_record.role IN ('teacher', 'student') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (request_record.user_id, request_record.role::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  UPDATE public.invite_requests
  SET status = 'approved', processed_by = actor_id, updated_at = now()
  WHERE id = p_request_id AND status = 'pending';
  UPDATE public.invite_codes SET used = true, used_by = request_record.user_id WHERE id = request_record.code_id;
  INSERT INTO public.platform_audit_log (event_type, actor_user_id, target_user_id, school_id, request_id)
  VALUES ('school.invite_approved', actor_id, request_record.user_id, request_record.school_id, p_request_id);
  RETURN jsonb_build_object('success', true, 'profile_id', request_record.user_id);
END;
$$;

CREATE FUNCTION public.deny_invite_request(p_request_id uuid, p_reason text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $$
DECLARE
  actor_id uuid := auth.uid();
  request_record record;
  normalized_reason text := NULLIF(left(btrim(COALESCE(p_reason, '')), 1000), '');
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT ir.*, ic.school_id
  INTO request_record
  FROM public.invite_requests ir
  JOIN public.invite_codes ic ON ic.id = ir.code_id
  WHERE ir.id = p_request_id
  FOR UPDATE OF ir;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invite request not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.is_school_admin_of(actor_id, request_record.school_id) THEN
    RAISE EXCEPTION 'School Admin authority required for this school' USING ERRCODE = '42501';
  END IF;
  IF request_record.status = 'denied' THEN
    RETURN jsonb_build_object('success', true, 'already_denied', true);
  END IF;
  IF request_record.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending invite requests can be denied' USING ERRCODE = '55000';
  END IF;

  UPDATE public.invite_requests
  SET status = 'denied', processed_by = actor_id, denied_at = now(), denial_reason = normalized_reason, updated_at = now()
  WHERE id = p_request_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Invite request changed concurrently' USING ERRCODE = '40001'; END IF;
  INSERT INTO public.platform_audit_log (event_type, actor_user_id, target_user_id, school_id, request_id, detail)
  VALUES (
    'school.invite_denied', actor_id, request_record.user_id, request_record.school_id, p_request_id,
    jsonb_build_object('reason_recorded', normalized_reason IS NOT NULL)
  );
  RETURN jsonb_build_object('success', true);
END;
$$;
