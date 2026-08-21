-- Create user roles enum and table
CREATE TYPE public.app_role AS ENUM ('teacher', 'student');

-- User roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL DEFAULT 'student',
    UNIQUE (user_id, role)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS policies for user_roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Teacher-uploaded course materials table
CREATE TABLE public.course_materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    file_url TEXT,
    uploaded_by UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.course_materials ENABLE ROW LEVEL SECURITY;

-- Everyone can view course materials
CREATE POLICY "Anyone can view course materials"
ON public.course_materials
FOR SELECT
TO authenticated
USING (true);

-- Only teachers can insert
CREATE POLICY "Teachers can insert course materials"
ON public.course_materials
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'teacher'));

-- Only teachers can update their own materials
CREATE POLICY "Teachers can update their own materials"
ON public.course_materials
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'teacher') AND uploaded_by = auth.uid());

-- Only teachers can delete their own materials
CREATE POLICY "Teachers can delete their own materials"
ON public.course_materials
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'teacher') AND uploaded_by = auth.uid());

-- Material views tracking (for students)
CREATE TABLE public.material_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    material_id UUID REFERENCES public.course_materials(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (material_id, user_id)
);

ALTER TABLE public.material_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own material views"
ON public.material_views
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own views"
ON public.material_views
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Material comments
CREATE TABLE public.material_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    material_id UUID REFERENCES public.course_materials(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    comment TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.material_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view comments"
ON public.material_comments
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can insert their own comments"
ON public.material_comments
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own comments"
ON public.material_comments
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Trigger for updated_at on course_materials
CREATE TRIGGER update_course_materials_updated_at
BEFORE UPDATE ON public.course_materials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();