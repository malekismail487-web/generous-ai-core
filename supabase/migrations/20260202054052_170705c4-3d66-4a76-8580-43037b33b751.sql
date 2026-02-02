-- Fix profiles_user_type_check to allow school_admin (required for school activation)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_user_type_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_user_type_check
CHECK (user_type = ANY (ARRAY['student'::text, 'teacher'::text, 'school_admin'::text]));
