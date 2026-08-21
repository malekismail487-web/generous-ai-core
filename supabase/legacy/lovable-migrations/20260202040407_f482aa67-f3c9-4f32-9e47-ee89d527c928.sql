-- Update the activate_school_with_code function to also add the admin role
CREATE OR REPLACE FUNCTION public.activate_school_with_code(activation_code_input text, user_uuid uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    school_record record;
    user_email text;
BEGIN
    -- Get user email
    SELECT email INTO user_email FROM auth.users WHERE id = user_uuid;
    
    -- Find school with this activation code that hasn't been used (case insensitive)
    SELECT * INTO school_record 
    FROM public.schools 
    WHERE UPPER(activation_code) = UPPER(activation_code_input)
    AND code_used = false
    AND status = 'active';
    
    IF school_record IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid or already used activation code');
    END IF;
    
    -- Mark code as used
    UPDATE public.schools 
    SET code_used = true, 
        code_used_by = user_uuid,
        code_used_at = now()
    WHERE id = school_record.id;
    
    -- Create or update profile as school_admin
    INSERT INTO public.profiles (id, school_id, full_name, user_type, status, is_active, email)
    VALUES (user_uuid, school_record.id, COALESCE(user_email, 'School Admin'), 'school_admin', 'approved', true, user_email)
    ON CONFLICT (id) DO UPDATE SET
        school_id = school_record.id,
        user_type = 'school_admin',
        status = 'approved',
        is_active = true,
        email = user_email;
    
    -- Add admin role to user_roles table
    INSERT INTO public.user_roles (user_id, role)
    VALUES (user_uuid, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
    
    -- Add to school_admins table
    INSERT INTO public.school_admins (user_id, school_id)
    VALUES (user_uuid, school_record.id)
    ON CONFLICT DO NOTHING;
    
    -- Log the action (wrapped in exception handler in case of RLS issues)
    BEGIN
        INSERT INTO public.admin_logs (admin_id, school_id, action, target_id, target_type, details)
        VALUES (user_uuid, school_record.id, 'school_activated', school_record.id, 'school', 
                jsonb_build_object('activation_code', activation_code_input));
    EXCEPTION WHEN OTHERS THEN
        -- Ignore logging errors, activation should still succeed
        NULL;
    END;
    
    RETURN jsonb_build_object(
        'success', true, 
        'school_id', school_record.id, 
        'school_name', school_record.name
    );
END;
$$;