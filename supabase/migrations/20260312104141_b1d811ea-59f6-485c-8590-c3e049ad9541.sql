
CREATE OR REPLACE FUNCTION public.approve_moderator_request(p_request_id uuid, p_session_token text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_request RECORD;
  v_caller_email text;
  v_user_id uuid;
  v_authorized boolean := false;
BEGIN
  -- Auth path 1: ministry session token
  IF p_session_token IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM ministry_sessions
      WHERE session_token = p_session_token AND is_active = true AND expires_at > now()
    ) THEN
      v_authorized := true;
    END IF;
  END IF;

  -- Auth path 2: direct Supabase auth (super admin email)
  IF NOT v_authorized THEN
    SELECT email INTO v_caller_email FROM auth.users WHERE id = auth.uid();
    IF v_caller_email = 'malekismail487@gmail.com' THEN
      v_authorized := true;
    END IF;
  END IF;

  IF NOT v_authorized THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO v_request FROM moderator_requests WHERE id = p_request_id AND status = 'pending';
  IF v_request IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Request not found');
  END IF;

  v_user_id := v_request.user_id;

  IF v_user_id IS NOT NULL THEN
    INSERT INTO profiles (id, full_name, email, user_type, status, is_active)
    VALUES (v_user_id, v_request.name, v_request.email, 'moderator', 'approved', true)
    ON CONFLICT (id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      user_type = 'moderator',
      status = 'approved',
      is_active = true;
  ELSE
    INSERT INTO profiles (id, full_name, email, user_type, status, is_active)
    VALUES (gen_random_uuid(), v_request.name, v_request.email, 'moderator', 'approved', true);
  END IF;

  UPDATE moderator_requests SET status = 'approved', updated_at = now() WHERE id = p_request_id;
  UPDATE moderator_invite_codes SET used = true, used_by = v_user_id WHERE id = v_request.code_id;

  RETURN json_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.deny_moderator_request(p_request_id uuid, p_session_token text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_caller_email text;
  v_authorized boolean := false;
BEGIN
  -- Auth path 1: ministry session token
  IF p_session_token IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM ministry_sessions
      WHERE session_token = p_session_token AND is_active = true AND expires_at > now()
    ) THEN
      v_authorized := true;
    END IF;
  END IF;

  -- Auth path 2: direct Supabase auth
  IF NOT v_authorized THEN
    SELECT email INTO v_caller_email FROM auth.users WHERE id = auth.uid();
    IF v_caller_email = 'malekismail487@gmail.com' THEN
      v_authorized := true;
    END IF;
  END IF;

  IF NOT v_authorized THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  UPDATE moderator_requests SET status = 'rejected', updated_at = now() WHERE id = p_request_id AND status = 'pending';

  RETURN json_build_object('success', true);
END;
$$;
