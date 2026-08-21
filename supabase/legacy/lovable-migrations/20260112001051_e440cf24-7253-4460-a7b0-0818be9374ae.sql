-- Schools table
CREATE TABLE public.schools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

-- Everyone can view schools (to validate codes)
CREATE POLICY "Anyone can view schools"
ON public.schools
FOR SELECT
TO authenticated
USING (true);

-- Only super admins can manage schools
CREATE POLICY "Super admins can insert schools"
ON public.schools
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Super admins can update schools"
ON public.schools
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Super admins can delete schools"
ON public.schools
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- User profiles table with school association
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    school_id UUID REFERENCES public.schools(id),
    full_name TEXT NOT NULL,
    student_teacher_id TEXT,
    grade_level TEXT,
    department TEXT,
    user_type TEXT NOT NULL CHECK (user_type IN ('student', 'teacher')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Users can update their own profile (but not status)
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id);

-- Users can insert their own profile
CREATE POLICY "Users can insert own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- School admins table
CREATE TABLE public.school_admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, school_id)
);

ALTER TABLE public.school_admins ENABLE ROW LEVEL SECURITY;

-- School admins can view their assignment
CREATE POLICY "Users can view their school admin status"
ON public.school_admins
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Super admins can manage school admins
CREATE POLICY "Super admins can manage school admins"
ON public.school_admins
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Function to check if user is school admin
CREATE OR REPLACE FUNCTION public.is_school_admin(_user_id UUID, _school_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.school_admins
        WHERE user_id = _user_id AND school_id = _school_id
    )
$$;

-- School admins can view profiles from their school
CREATE POLICY "School admins can view school profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.school_admins sa
        WHERE sa.user_id = auth.uid() AND sa.school_id = profiles.school_id
    )
);

-- School admins can update profiles in their school (for approval)
CREATE POLICY "School admins can update school profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.school_admins sa
        WHERE sa.user_id = auth.uid() AND sa.school_id = profiles.school_id
    )
);

-- Update course_materials to be school-specific
ALTER TABLE public.course_materials ADD COLUMN school_id UUID REFERENCES public.schools(id);

-- Update the select policy for course materials
DROP POLICY IF EXISTS "Anyone can view course materials" ON public.course_materials;
CREATE POLICY "Users can view their school materials"
ON public.course_materials
FOR SELECT
TO authenticated
USING (
    school_id IN (
        SELECT school_id FROM public.profiles WHERE id = auth.uid() AND status = 'approved'
    )
);

-- Triggers for updated_at
CREATE TRIGGER update_schools_updated_at
BEFORE UPDATE ON public.schools
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();