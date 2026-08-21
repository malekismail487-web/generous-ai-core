-- Create a function to link a newly authenticated user to their approved invite request profile
-- This runs when a user signs up and matches an existing approved profile by email
CREATE OR REPLACE FUNCTION public.link_auth_user_to_approved_profile()
RETURNS TRIGGER AS $$
DECLARE
  v_profile RECORD;
BEGIN
  -- Check if there's an approved profile with matching email that doesn't have an auth user yet
  SELECT p.* INTO v_profile
  FROM public.profiles p
  WHERE LOWER(p.email) = LOWER(NEW.email)
    AND p.status = 'approved'
    AND p.id != NEW.id;
  
  IF v_profile IS NOT NULL THEN
    -- Update the old profile to use the new auth user's ID
    -- First, update any related records
    UPDATE public.invite_requests 
    SET user_id = NEW.id 
    WHERE email = v_profile.email;
    
    -- Add teacher role if needed
    IF v_profile.user_type = 'teacher' THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (NEW.id, 'teacher')
      ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
    
    -- Delete the old profile (we'll create a new one with correct ID)
    DELETE FROM public.profiles WHERE id = v_profile.id;
    
    -- Create profile with the auth user's ID
    INSERT INTO public.profiles (id, school_id, full_name, email, user_type, status, is_active, grade_level, department, student_teacher_id)
    VALUES (
      NEW.id,
      v_profile.school_id,
      v_profile.full_name,
      v_profile.email,
      v_profile.user_type,
      'approved',
      true,
      v_profile.grade_level,
      v_profile.department,
      v_profile.student_teacher_id
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger on auth.users to link profiles
-- Note: We can't create triggers on auth.users directly from migrations
-- Instead, we'll handle this in the application when user signs in

-- Alternative: Create a function that the app can call after signup
CREATE OR REPLACE FUNCTION public.link_profile_after_signup(p_user_id uuid, p_email text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile RECORD;
BEGIN
  -- Check if there's an approved profile with matching email
  SELECT p.* INTO v_profile
  FROM public.profiles p
  WHERE LOWER(p.email) = LOWER(p_email)
    AND p.status = 'approved'
    AND p.id != p_user_id;
  
  IF v_profile IS NOT NULL THEN
    -- Update invite_requests
    UPDATE public.invite_requests 
    SET user_id = p_user_id 
    WHERE LOWER(email) = LOWER(p_email);
    
    -- Add teacher role if needed
    IF v_profile.user_type = 'teacher' THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (p_user_id, 'teacher')
      ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
    
    -- Delete the old profile
    DELETE FROM public.profiles WHERE id = v_profile.id;
    
    -- Create profile with the auth user's ID
    INSERT INTO public.profiles (id, school_id, full_name, email, user_type, status, is_active, grade_level, department, student_teacher_id)
    VALUES (
      p_user_id,
      v_profile.school_id,
      v_profile.full_name,
      v_profile.email,
      v_profile.user_type,
      'approved',
      true,
      v_profile.grade_level,
      v_profile.department,
      v_profile.student_teacher_id
    );
    
    RETURN json_build_object('success', true, 'linked', true, 'user_type', v_profile.user_type);
  END IF;
  
  RETURN json_build_object('success', true, 'linked', false);
END;
$$;