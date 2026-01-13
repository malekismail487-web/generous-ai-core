-- =====================================================
-- SUPER ADMIN & TEST DATA SETUP
-- =====================================================

-- 1. Create admin_access_codes table for fallback admin verification
CREATE TABLE IF NOT EXISTS public.admin_access_codes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code_hash text NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    used_at timestamp with time zone,
    used_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.admin_access_codes ENABLE ROW LEVEL SECURITY;

-- Only super admins can view access codes
CREATE POLICY "Super admins can view access codes"
ON public.admin_access_codes FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- 2. Create hardcoded_admins table for permanent admin emails
CREATE TABLE IF NOT EXISTS public.hardcoded_admins (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text UNIQUE NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.hardcoded_admins ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can check if their email is hardcoded admin
CREATE POLICY "Users can check their own admin status"
ON public.hardcoded_admins FOR SELECT
USING (true);

-- 3. Insert the hardcoded super admin email
INSERT INTO public.hardcoded_admins (email, description)
VALUES ('malekismail487@gmail.com', 'Primary super admin / developer - permanent access')
ON CONFLICT (email) DO NOTHING;

-- 4. Insert the hashed admin access code (SHA256 hash of admin_7cF9QmA2P8xR4LJwKZ6DTeYH5VnS)
-- Hash: 5a8dd3ad0756a93ded72b823b19dd877e9af90c0f0e0f8c5ef9c4dbeae7e0b1d
INSERT INTO public.admin_access_codes (code_hash, description, is_active)
VALUES (
    encode(sha256('admin_7cF9QmA2P8xR4LJwKZ6DTeYH5VnS'::bytea), 'hex'),
    'Primary admin recovery code',
    true
);

-- 5. Create function to verify admin access code
CREATE OR REPLACE FUNCTION public.verify_admin_access_code(input_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    code_exists boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.admin_access_codes
        WHERE code_hash = encode(sha256(input_code::bytea), 'hex')
        AND is_active = true
    ) INTO code_exists;
    
    RETURN code_exists;
END;
$$;

-- 6. Create function to grant admin via access code
CREATE OR REPLACE FUNCTION public.grant_admin_via_code(input_code text, target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    code_valid boolean;
    code_id uuid;
BEGIN
    -- Verify code
    SELECT id INTO code_id
    FROM public.admin_access_codes
    WHERE code_hash = encode(sha256(input_code::bytea), 'hex')
    AND is_active = true;
    
    IF code_id IS NULL THEN
        RETURN false;
    END IF;
    
    -- Grant admin role if not already have it
    INSERT INTO public.user_roles (user_id, role)
    VALUES (target_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
    
    -- Log usage
    UPDATE public.admin_access_codes
    SET used_at = now(), used_by = target_user_id
    WHERE id = code_id;
    
    RETURN true;
END;
$$;

-- 7. Create function to check if email is hardcoded admin
CREATE OR REPLACE FUNCTION public.is_hardcoded_admin(check_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.hardcoded_admins
        WHERE lower(email) = lower(check_email)
    )
$$;

-- 8. Add is_test_data column to profiles for flagging test accounts
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_test_data boolean DEFAULT false;

-- 9. Add is_test_data column to schools for flagging test schools
ALTER TABLE public.schools
ADD COLUMN IF NOT EXISTS is_test_data boolean DEFAULT false;

-- =====================================================
-- CREATE TEST SCHOOL
-- =====================================================

INSERT INTO public.schools (id, name, code, address, is_test_data)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    '🧪 Lumina Test Academy',
    'TESTSCHOOL',
    '123 Test Street, Demo City - FOR TESTING ONLY',
    true
)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    address = EXCLUDED.address,
    is_test_data = true;