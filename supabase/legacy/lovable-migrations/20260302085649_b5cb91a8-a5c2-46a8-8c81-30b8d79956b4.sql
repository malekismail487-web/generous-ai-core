-- Enable pgcrypto extension for gen_random_bytes
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;

-- Recreate verify_ministry_code to use extensions.gen_random_bytes
CREATE OR REPLACE FUNCTION public.verify_ministry_code(p_code text, p_ip_address text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text, p_device_fingerprint text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  code_valid boolean;
  v_session_token text;
  v_banned boolean;
BEGIN
  -- Check IP ban
  IF p_ip_address IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM ministry_ip_bans WHERE ip_address = p_ip_address
    ) INTO v_banned;
    IF v_banned THEN
      RETURN json_build_object('success', false, 'error', 'ACCESS DENIED', 'banned', true);
    END IF;
  END IF;

  -- Check device fingerprint ban
  IF p_device_fingerprint IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM ministry_ip_bans WHERE device_fingerprint = p_device_fingerprint
    ) INTO v_banned;
    IF v_banned THEN
      RETURN json_build_object('success', false, 'error', 'ACCESS DENIED', 'banned', true);
    END IF;
  END IF;

  -- Check code length
  IF length(p_code) != 100 THEN
    RETURN json_build_object('success', false, 'error', 'Invalid access code');
  END IF;

  -- Verify code
  SELECT EXISTS(
    SELECT 1 FROM ministry_access_codes
    WHERE code_hash = encode(sha256(p_code::bytea), 'hex')
    AND is_active = true
  ) INTO code_valid;

  IF NOT code_valid THEN
    RETURN json_build_object('success', false, 'error', 'Invalid access code');
  END IF;

  -- Generate session token using pgcrypto
  v_session_token := encode(extensions.gen_random_bytes(64), 'hex');

  -- Create pending access request
  INSERT INTO ministry_access_requests (session_token, ip_address, user_agent, device_fingerprint, status)
  VALUES (v_session_token, p_ip_address, p_user_agent, p_device_fingerprint, 'pending');

  RETURN json_build_object('success', true, 'session_token', v_session_token, 'message', 'Awaiting super admin approval');
END;
$function$;

GRANT EXECUTE ON FUNCTION public.verify_ministry_code(text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.verify_ministry_code(text, text, text, text) TO authenticated;