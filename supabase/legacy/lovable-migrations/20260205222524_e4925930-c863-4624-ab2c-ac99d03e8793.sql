-- Create table to track super admin verification attempts
CREATE TABLE public.super_admin_verification (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMP WITH TIME ZONE,
  last_attempt_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  is_high_alert BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(email)
);

-- Enable RLS
ALTER TABLE public.super_admin_verification ENABLE ROW LEVEL SECURITY;

-- No direct access policies - all access through security definer functions
-- This ensures the verification system cannot be bypassed

-- Create a secure function to check and increment attempts
CREATE OR REPLACE FUNCTION public.verify_super_admin_code(
  p_email TEXT,
  p_code TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record super_admin_verification%ROWTYPE;
  v_correct_code TEXT := 'SA7cF9Qm'; -- 8-character verification code
  v_max_attempts INTEGER := 3;
  v_lockout_hours INTEGER := 24;
BEGIN
  -- Only allow for super admin email
  IF lower(p_email) != 'malekismail487@gmail.com' THEN
    RETURN json_build_object('success', false, 'error', 'Invalid request');
  END IF;

  -- Get or create verification record
  SELECT * INTO v_record FROM super_admin_verification WHERE email = lower(p_email);
  
  IF NOT FOUND THEN
    INSERT INTO super_admin_verification (email, attempts)
    VALUES (lower(p_email), 0)
    RETURNING * INTO v_record;
  END IF;

  -- Check if account is locked
  IF v_record.locked_until IS NOT NULL AND v_record.locked_until > now() THEN
    RETURN json_build_object(
      'success', false, 
      'error', 'Account locked',
      'locked', true,
      'locked_until', v_record.locked_until,
      'is_high_alert', v_record.is_high_alert
    );
  END IF;

  -- If was locked but time passed, reset attempts
  IF v_record.locked_until IS NOT NULL AND v_record.locked_until <= now() THEN
    UPDATE super_admin_verification 
    SET attempts = 0, locked_until = NULL, updated_at = now()
    WHERE email = lower(p_email)
    RETURNING * INTO v_record;
  END IF;

  -- Verify the code
  IF p_code = v_correct_code THEN
    -- Success - reset attempts
    UPDATE super_admin_verification 
    SET attempts = 0, locked_until = NULL, is_high_alert = FALSE, updated_at = now()
    WHERE email = lower(p_email);
    
    RETURN json_build_object('success', true);
  ELSE
    -- Failed attempt
    v_record.attempts := v_record.attempts + 1;
    
    IF v_record.attempts >= v_max_attempts THEN
      -- Lock the account for 24 hours and set high alert
      UPDATE super_admin_verification 
      SET 
        attempts = v_record.attempts,
        locked_until = now() + (v_lockout_hours || ' hours')::interval,
        is_high_alert = TRUE,
        last_attempt_at = now(),
        updated_at = now()
      WHERE email = lower(p_email);
      
      RETURN json_build_object(
        'success', false, 
        'error', 'Access denied. Account locked for 24 hours.',
        'locked', true,
        'attempts_remaining', 0,
        'is_high_alert', true
      );
    ELSE
      -- Increment attempts
      UPDATE super_admin_verification 
      SET attempts = v_record.attempts, last_attempt_at = now(), updated_at = now()
      WHERE email = lower(p_email);
      
      RETURN json_build_object(
        'success', false, 
        'error', 'Invalid verification code',
        'locked', false,
        'attempts_remaining', v_max_attempts - v_record.attempts
      );
    END IF;
  END IF;
END;
$$;

-- Function to check if super admin is locked
CREATE OR REPLACE FUNCTION public.check_super_admin_lock_status(p_email TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record super_admin_verification%ROWTYPE;
BEGIN
  IF lower(p_email) != 'malekismail487@gmail.com' THEN
    RETURN json_build_object('is_super_admin', false);
  END IF;

  SELECT * INTO v_record FROM super_admin_verification WHERE email = lower(p_email);
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'is_super_admin', true,
      'locked', false,
      'is_high_alert', false
    );
  END IF;

  IF v_record.locked_until IS NOT NULL AND v_record.locked_until > now() THEN
    RETURN json_build_object(
      'is_super_admin', true,
      'locked', true,
      'locked_until', v_record.locked_until,
      'is_high_alert', v_record.is_high_alert
    );
  END IF;

  RETURN json_build_object(
    'is_super_admin', true,
    'locked', false,
    'is_high_alert', v_record.is_high_alert
  );
END;
$$;