
CREATE OR REPLACE FUNCTION public.check_device_ban(p_device_fingerprint text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  device_rec RECORD;
BEGIN
  IF p_device_fingerprint IS NULL THEN
    RETURN json_build_object('banned', false);
  END IF;

  SELECT * INTO device_rec 
  FROM super_admin_attack_attempts 
  WHERE device_fingerprint = p_device_fingerprint 
    AND permanently_blocked = true;

  IF device_rec IS NOT NULL THEN
    RETURN json_build_object(
      'banned', true,
      'message', 'Your device has been permanently banned from accessing this platform due to unauthorized access attempts. Contact the system administrator if you believe this is an error.'
    );
  END IF;

  RETURN json_build_object('banned', false);
END;
$$;
