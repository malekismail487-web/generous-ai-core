
-- ============================================================
-- FIX 1: Schools table - restrict SELECT to own school + admins
-- ============================================================

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Anyone can view schools" ON public.schools;

-- Users can only see their own school
CREATE POLICY "Users can view their own school"
ON public.schools FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT school_id FROM public.profiles 
    WHERE id = auth.uid() AND status = 'approved'
  )
);

-- Admins can view all schools
CREATE POLICY "Admins can view all schools"
ON public.schools FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- ============================================================
-- FIX 2: Make storage buckets private
-- ============================================================

UPDATE storage.buckets SET public = false WHERE id = 'course-materials';
UPDATE storage.buckets SET public = false WHERE id = 'report-cards';

-- ============================================================
-- FIX 3: Hash the super admin verification code in DB function
-- ============================================================

-- Create a table to store hashed super admin codes
CREATE TABLE IF NOT EXISTS public.super_admin_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.super_admin_codes ENABLE ROW LEVEL SECURITY;

-- No direct access - only via SECURITY DEFINER function
CREATE POLICY "No direct access to super admin codes"
ON public.super_admin_codes FOR SELECT
USING (false);

-- Insert the hashed current code (SA7cF9Qm)
INSERT INTO public.super_admin_codes (code_hash, active)
VALUES (encode(sha256('SA7cF9Qm'::bytea), 'hex'), true);

-- Replace the verify function to use hashed comparison
CREATE OR REPLACE FUNCTION public.verify_super_admin_code(p_email text, p_code text, p_device_fingerprint text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  device_rec RECORD;
  new_attempts INT;
  code_valid BOOLEAN;
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

  -- Check code against hashed values
  SELECT EXISTS(
    SELECT 1 FROM super_admin_codes
    WHERE code_hash = encode(sha256(p_code::bytea), 'hex')
    AND active = true
  ) INTO code_valid;

  -- Correct code
  IF code_valid THEN
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
$function$;
