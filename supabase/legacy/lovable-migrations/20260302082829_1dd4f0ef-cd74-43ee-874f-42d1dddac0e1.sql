
-- Ministry access code table (stores the hashed 100-char code)
CREATE TABLE public.ministry_access_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  description text
);

ALTER TABLE public.ministry_access_codes ENABLE ROW LEVEL SECURITY;

-- No direct access - only via security definer functions
CREATE POLICY "No direct access to ministry codes"
  ON public.ministry_access_codes FOR SELECT
  USING (false);

-- Ministry access requests (tracks login attempts requiring super admin approval)
CREATE TABLE public.ministry_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token text NOT NULL UNIQUE,
  ip_address text,
  user_agent text,
  device_fingerprint text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes')
);

ALTER TABLE public.ministry_access_requests ENABLE ROW LEVEL SECURITY;

-- Super admin can manage ministry access requests
CREATE POLICY "Super admin can manage ministry requests"
  ON public.ministry_access_requests FOR ALL
  USING (lower(auth.jwt() ->> 'email') = 'malekismail487@gmail.com')
  WITH CHECK (lower(auth.jwt() ->> 'email') = 'malekismail487@gmail.com');

-- Anyone can insert (the ministry login page inserts)
CREATE POLICY "Anyone can create ministry access request"
  ON public.ministry_access_requests FOR INSERT
  WITH CHECK (true);

-- Anyone can read their own request by session_token (handled in code)
CREATE POLICY "Anyone can read pending requests"
  ON public.ministry_access_requests FOR SELECT
  USING (true);

-- Ministry IP bans
CREATE TABLE public.ministry_ip_bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  device_fingerprint text,
  reason text DEFAULT 'Ministry access denied',
  banned_at timestamptz NOT NULL DEFAULT now(),
  banned_by uuid
);

ALTER TABLE public.ministry_ip_bans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin can manage IP bans"
  ON public.ministry_ip_bans FOR ALL
  USING (lower(auth.jwt() ->> 'email') = 'malekismail487@gmail.com')
  WITH CHECK (lower(auth.jwt() ->> 'email') = 'malekismail487@gmail.com');

-- Ministry sessions (tracks active ministry sessions with 15-min timeout)
CREATE TABLE public.ministry_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token text NOT NULL UNIQUE,
  ip_address text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_activity timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes')
);

ALTER TABLE public.ministry_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin can manage ministry sessions"
  ON public.ministry_sessions FOR ALL
  USING (lower(auth.jwt() ->> 'email') = 'malekismail487@gmail.com')
  WITH CHECK (lower(auth.jwt() ->> 'email') = 'malekismail487@gmail.com');

CREATE POLICY "Anyone can read ministry sessions"
  ON public.ministry_sessions FOR SELECT
  USING (true);

-- Enable realtime for ministry_access_requests so super admin gets alerts
ALTER PUBLICATION supabase_realtime ADD TABLE public.ministry_access_requests;

-- Function to verify ministry code and create access request
CREATE OR REPLACE FUNCTION public.verify_ministry_code(
  p_code text,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_device_fingerprint text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  -- Generate session token
  v_session_token := encode(gen_random_bytes(64), 'hex');

  -- Create pending access request
  INSERT INTO ministry_access_requests (session_token, ip_address, user_agent, device_fingerprint, status)
  VALUES (v_session_token, p_ip_address, p_user_agent, p_device_fingerprint, 'pending');

  RETURN json_build_object('success', true, 'session_token', v_session_token, 'message', 'Awaiting super admin approval');
END;
$$;

-- Function to approve/deny ministry access
CREATE OR REPLACE FUNCTION public.resolve_ministry_request(
  p_request_id uuid,
  p_action text -- 'approve' or 'deny'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_request RECORD;
  v_caller_email text;
BEGIN
  -- Only super admin
  SELECT email INTO v_caller_email FROM auth.users WHERE id = auth.uid();
  IF v_caller_email != 'malekismail487@gmail.com' THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO v_request FROM ministry_access_requests WHERE id = p_request_id AND status = 'pending';
  IF v_request IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Request not found or already resolved');
  END IF;

  IF p_action = 'approve' THEN
    -- Update request
    UPDATE ministry_access_requests SET status = 'approved', resolved_at = now(), resolved_by = auth.uid()
    WHERE id = p_request_id;

    -- Create ministry session
    INSERT INTO ministry_sessions (session_token, ip_address, is_active, expires_at)
    VALUES (v_request.session_token, v_request.ip_address, true, now() + interval '15 minutes');

    RETURN json_build_object('success', true, 'action', 'approved');

  ELSIF p_action = 'deny' THEN
    -- Update request
    UPDATE ministry_access_requests SET status = 'denied', resolved_at = now(), resolved_by = auth.uid()
    WHERE id = p_request_id;

    -- Ban the IP and device
    IF v_request.ip_address IS NOT NULL THEN
      INSERT INTO ministry_ip_bans (ip_address, device_fingerprint, banned_by, reason)
      VALUES (v_request.ip_address, v_request.device_fingerprint, auth.uid(), 'Ministry access denied by super admin');
    END IF;

    RETURN json_build_object('success', true, 'action', 'denied', 'ip_banned', v_request.ip_address);
  END IF;

  RETURN json_build_object('success', false, 'error', 'Invalid action');
END;
$$;

-- Function to check ministry session validity
CREATE OR REPLACE FUNCTION public.check_ministry_session(p_session_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_session RECORD;
BEGIN
  SELECT * INTO v_session FROM ministry_sessions
  WHERE session_token = p_session_token AND is_active = true;

  IF v_session IS NULL THEN
    RETURN json_build_object('valid', false, 'reason', 'Session not found');
  END IF;

  -- Check expiry (15 min timeout)
  IF v_session.expires_at < now() THEN
    UPDATE ministry_sessions SET is_active = false WHERE id = v_session.id;
    RETURN json_build_object('valid', false, 'reason', 'Session expired');
  END IF;

  -- Refresh timeout
  UPDATE ministry_sessions SET last_activity = now(), expires_at = now() + interval '15 minutes'
  WHERE id = v_session.id;

  RETURN json_build_object('valid', true, 'session_id', v_session.id);
END;
$$;

-- Function to check ministry IP ban
CREATE OR REPLACE FUNCTION public.check_ministry_ip_ban(p_ip text, p_fingerprint text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM ministry_ip_bans WHERE ip_address = p_ip) THEN
    RETURN json_build_object('banned', true);
  END IF;
  IF p_fingerprint IS NOT NULL AND EXISTS(SELECT 1 FROM ministry_ip_bans WHERE device_fingerprint = p_fingerprint) THEN
    RETURN json_build_object('banned', true);
  END IF;
  RETURN json_build_object('banned', false);
END;
$$;
