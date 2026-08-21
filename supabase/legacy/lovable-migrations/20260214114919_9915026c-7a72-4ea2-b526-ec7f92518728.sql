
-- Track attack attempts per device (not per account)
CREATE TABLE IF NOT EXISTS public.super_admin_attack_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_fingerprint TEXT NOT NULL UNIQUE,
  attempts INT DEFAULT 0,
  locked_until TIMESTAMPTZ,
  is_high_alert BOOLEAN DEFAULT false,
  permanently_blocked BOOLEAN DEFAULT false,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.super_admin_attack_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin can manage attack attempts"
ON public.super_admin_attack_attempts
FOR ALL
TO authenticated
USING (auth.jwt() ->> 'email' = 'malekismail487@gmail.com')
WITH CHECK (auth.jwt() ->> 'email' = 'malekismail487@gmail.com');

-- Attack logs for admin review
CREATE TABLE IF NOT EXISTS public.super_admin_attack_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_fingerprint TEXT NOT NULL,
  user_agent TEXT,
  attempt_count INT DEFAULT 0,
  status TEXT DEFAULT 'unreviewed',
  resolved_action TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

ALTER TABLE public.super_admin_attack_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin can manage attack logs"
ON public.super_admin_attack_logs
FOR ALL
TO authenticated
USING (auth.jwt() ->> 'email' = 'malekismail487@gmail.com')
WITH CHECK (auth.jwt() ->> 'email' = 'malekismail487@gmail.com');

-- Drop old functions to replace with device-aware versions
DROP FUNCTION IF EXISTS public.check_super_admin_lock_status(text);
DROP FUNCTION IF EXISTS public.verify_super_admin_code(text, text);

-- Recreate: check lock per device, not per account
CREATE OR REPLACE FUNCTION public.check_super_admin_lock_status(
  p_email TEXT,
  p_device_fingerprint TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  device_rec RECORD;
  has_unreviewed BOOLEAN;
BEGIN
  IF p_email != 'malekismail487@gmail.com' THEN
    RETURN json_build_object('is_super_admin', false, 'locked', false);
  END IF;

  -- Check for unreviewed attacks
  SELECT EXISTS(SELECT 1 FROM super_admin_attack_logs WHERE status = 'unreviewed') INTO has_unreviewed;

  IF p_device_fingerprint IS NULL THEN
    RETURN json_build_object('is_super_admin', true, 'locked', false, 'has_attacks', has_unreviewed);
  END IF;

  SELECT * INTO device_rec FROM super_admin_attack_attempts WHERE device_fingerprint = p_device_fingerprint;

  IF device_rec IS NULL THEN
    RETURN json_build_object('is_super_admin', true, 'locked', false, 'has_attacks', has_unreviewed);
  END IF;

  IF device_rec.permanently_blocked THEN
    RETURN json_build_object('is_super_admin', true, 'locked', true, 'locked_until', 'permanent', 'is_high_alert', true);
  END IF;

  IF device_rec.locked_until IS NOT NULL AND device_rec.locked_until > now() THEN
    RETURN json_build_object('is_super_admin', true, 'locked', true, 'locked_until', device_rec.locked_until, 'is_high_alert', COALESCE(device_rec.is_high_alert, false));
  END IF;

  -- Lock expired, reset
  IF device_rec.locked_until IS NOT NULL AND device_rec.locked_until <= now() THEN
    UPDATE super_admin_attack_attempts SET attempts = 0, locked_until = NULL, is_high_alert = false, updated_at = now()
    WHERE device_fingerprint = p_device_fingerprint;
  END IF;

  RETURN json_build_object('is_super_admin', true, 'locked', false, 'has_attacks', has_unreviewed);
END;
$$;

-- Recreate: verify code with device-level tracking
CREATE OR REPLACE FUNCTION public.verify_super_admin_code(
  p_email TEXT,
  p_code TEXT,
  p_device_fingerprint TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  correct_code TEXT := 'SA7cF9Qm';
  device_rec RECORD;
  new_attempts INT;
BEGIN
  IF p_email != 'malekismail487@gmail.com' THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Check device lock
  IF p_device_fingerprint IS NOT NULL THEN
    SELECT * INTO device_rec FROM super_admin_attack_attempts WHERE device_fingerprint = p_device_fingerprint;
    IF device_rec IS NOT NULL THEN
      IF device_rec.permanently_blocked THEN
        RETURN json_build_object('success', false, 'error', 'Device permanently blocked.', 'locked', true, 'is_high_alert', true);
      END IF;
      IF device_rec.locked_until IS NOT NULL AND device_rec.locked_until > now() THEN
        RETURN json_build_object('success', false, 'error', 'Device locked.', 'locked', true, 'locked_until', device_rec.locked_until, 'is_high_alert', COALESCE(device_rec.is_high_alert, false));
      END IF;
    END IF;
  END IF;

  -- Correct code
  IF p_code = correct_code THEN
    IF p_device_fingerprint IS NOT NULL AND device_rec IS NOT NULL THEN
      UPDATE super_admin_attack_attempts SET attempts = 0, locked_until = NULL, is_high_alert = false, updated_at = now()
      WHERE device_fingerprint = p_device_fingerprint;
    END IF;
    RETURN json_build_object('success', true);
  END IF;

  -- Wrong code - track per device
  IF p_device_fingerprint IS NOT NULL THEN
    IF device_rec IS NULL THEN
      INSERT INTO super_admin_attack_attempts (device_fingerprint, attempts, user_agent, updated_at)
      VALUES (p_device_fingerprint, 1, p_user_agent, now());
      new_attempts := 1;
    ELSE
      new_attempts := COALESCE(device_rec.attempts, 0) + 1;
      UPDATE super_admin_attack_attempts SET attempts = new_attempts, user_agent = COALESCE(p_user_agent, device_rec.user_agent), updated_at = now()
      WHERE device_fingerprint = p_device_fingerprint;
    END IF;

    IF new_attempts >= 3 THEN
      UPDATE super_admin_attack_attempts SET locked_until = now() + interval '24 hours', is_high_alert = true, updated_at = now()
      WHERE device_fingerprint = p_device_fingerprint;

      INSERT INTO super_admin_attack_logs (device_fingerprint, user_agent, attempt_count)
      VALUES (p_device_fingerprint, p_user_agent, new_attempts);

      RETURN json_build_object('success', false, 'error', 'Device locked for 24 hours.', 'locked', true, 'locked_until', now() + interval '24 hours', 'is_high_alert', true, 'attempts_remaining', 0);
    END IF;

    RETURN json_build_object('success', false, 'error', 'Invalid verification code.', 'attempts_remaining', 3 - new_attempts);
  END IF;

  RETURN json_build_object('success', false, 'error', 'Invalid verification code.', 'attempts_remaining', 2);
END;
$$;
