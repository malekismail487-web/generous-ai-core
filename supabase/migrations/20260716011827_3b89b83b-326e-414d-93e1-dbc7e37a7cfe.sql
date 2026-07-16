
CREATE OR REPLACE FUNCTION public.create_school_with_code(
    school_name text,
    school_code text,
    activation_code_input text,
    school_address text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_school_id uuid;
    caller_email text;
    v_tenant_id uuid;
BEGIN
    SELECT email INTO caller_email FROM auth.users WHERE id = auth.uid();

    IF caller_email != 'malekismail487@gmail.com' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Access denied');
    END IF;

    IF EXISTS (SELECT 1 FROM public.schools WHERE activation_code = activation_code_input) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Activation code already exists');
    END IF;

    -- Every school must belong to a tenant. Default to Saudi Arabia until the
    -- Super Admin page becomes tenant-aware.
    SELECT id INTO v_tenant_id
      FROM public.tenants
     WHERE slug = 'sa'
     LIMIT 1;

    IF v_tenant_id IS NULL THEN
      SELECT id INTO v_tenant_id
        FROM public.tenants
       WHERE status = 'active' AND is_visible = true
       ORDER BY created_at ASC
       LIMIT 1;
    END IF;

    IF v_tenant_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'No active tenant configured');
    END IF;

    INSERT INTO public.schools (name, code, activation_code, address, status, code_used, tenant_id)
    VALUES (school_name, school_code, activation_code_input, school_address, 'active', false, v_tenant_id)
    RETURNING id INTO new_school_id;

    RETURN jsonb_build_object('success', true, 'school_id', new_school_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_ministry_code(
  p_code text,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_device_fingerprint text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_code_row RECORD;
  v_tenant RECORD;
  v_session_token text;
  v_banned boolean;
BEGIN
  IF p_ip_address IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM ministry_ip_bans WHERE ip_address = p_ip_address) INTO v_banned;
    IF v_banned THEN RETURN json_build_object('success', false, 'error', 'ACCESS DENIED', 'banned', true); END IF;
  END IF;

  IF p_device_fingerprint IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM ministry_ip_bans WHERE device_fingerprint = p_device_fingerprint) INTO v_banned;
    IF v_banned THEN RETURN json_build_object('success', false, 'error', 'ACCESS DENIED', 'banned', true); END IF;
  END IF;

  IF length(p_code) != 100 THEN
    RETURN json_build_object('success', false, 'error', 'Invalid access code');
  END IF;

  SELECT id, tenant_id
    INTO v_code_row
    FROM ministry_access_codes
   WHERE code_hash = encode(sha256(p_code::bytea), 'hex')
     AND is_active = true
     AND (expires_at IS NULL OR expires_at > now())
   LIMIT 1;

  IF v_code_row.id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid access code');
  END IF;

  SELECT slug, country_name
    INTO v_tenant
    FROM public.tenants
   WHERE id = v_code_row.tenant_id
   LIMIT 1;

  v_session_token := encode(extensions.gen_random_bytes(64), 'hex');

  INSERT INTO ministry_access_requests (session_token, ip_address, user_agent, device_fingerprint, status, tenant_id)
  VALUES (v_session_token, p_ip_address, p_user_agent, p_device_fingerprint, 'pending', v_code_row.tenant_id);

  RETURN json_build_object(
    'success', true,
    'session_token', v_session_token,
    'tenant_id', v_code_row.tenant_id,
    'tenant_slug', v_tenant.slug,
    'tenant_name', v_tenant.country_name,
    'message', 'Awaiting super admin approval'
  );
END;
$$;
