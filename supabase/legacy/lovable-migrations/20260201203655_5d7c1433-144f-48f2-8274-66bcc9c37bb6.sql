
-- Drop existing tables that need restructuring (careful with dependencies)
-- First, let's add new columns to schools table
ALTER TABLE public.schools 
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
ADD COLUMN IF NOT EXISTS activation_code text UNIQUE,
ADD COLUMN IF NOT EXISTS code_used boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS code_used_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS code_used_at timestamp with time zone;

-- Update profiles table to add is_active column
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Create subjects table
CREATE TABLE IF NOT EXISTS public.subjects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create classes table (for grouping students)
CREATE TABLE IF NOT EXISTS public.classes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    name text NOT NULL,
    grade_level text,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create teacher_subjects junction table
CREATE TABLE IF NOT EXISTS public.teacher_subjects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE(teacher_id, subject_id)
);

-- Create invite_codes table
CREATE TABLE IF NOT EXISTS public.invite_codes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    code text NOT NULL,
    role text NOT NULL CHECK (role IN ('teacher', 'student', 'parent')),
    used boolean NOT NULL DEFAULT false,
    used_by uuid REFERENCES auth.users(id),
    expires_at timestamp with time zone NOT NULL,
    created_by uuid NOT NULL REFERENCES auth.users(id),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE(school_id, code)
);

-- Create invite_requests table
CREATE TABLE IF NOT EXISTS public.invite_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code_id uuid NOT NULL REFERENCES public.invite_codes(id) ON DELETE CASCADE,
    name text NOT NULL,
    email text NOT NULL,
    user_id uuid REFERENCES auth.users(id),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'denied')),
    grade text,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create lesson_plans table
CREATE TABLE IF NOT EXISTS public.lesson_plans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    title text NOT NULL,
    description text,
    content_json jsonb DEFAULT '{}'::jsonb,
    files text[] DEFAULT ARRAY[]::text[],
    objectives text,
    standards text,
    strategies text,
    activities text,
    pre_learning text,
    notes text,
    publish_date timestamp with time zone,
    is_published boolean NOT NULL DEFAULT false,
    is_shareable boolean NOT NULL DEFAULT false,
    class_ids uuid[] DEFAULT ARRAY[]::uuid[],
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create student_classes junction table
CREATE TABLE IF NOT EXISTS public.student_classes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE(student_id, class_id)
);

-- Modify assignments table to work with new structure
ALTER TABLE public.assignments
ADD COLUMN IF NOT EXISTS class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS points integer DEFAULT 100,
ADD COLUMN IF NOT EXISTS subject_id uuid REFERENCES public.subjects(id) ON DELETE CASCADE;

-- Create submissions table for student assignment submissions
CREATE TABLE IF NOT EXISTS public.submissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
    student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content text,
    files text[] DEFAULT ARRAY[]::text[],
    submitted_at timestamp with time zone NOT NULL DEFAULT now(),
    grade integer,
    feedback text,
    graded_at timestamp with time zone,
    graded_by uuid REFERENCES auth.users(id),
    UNIQUE(assignment_id, student_id)
);

-- Create exams table
CREATE TABLE IF NOT EXISTS public.exams (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    title text NOT NULL,
    description text,
    questions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
    duration_minutes integer NOT NULL DEFAULT 60,
    total_points integer NOT NULL DEFAULT 100,
    scheduled_at timestamp with time zone,
    class_ids uuid[] DEFAULT ARRAY[]::uuid[],
    is_published boolean NOT NULL DEFAULT false,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create exam_submissions table
CREATE TABLE IF NOT EXISTS public.exam_submissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    answers_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    score integer,
    started_at timestamp with time zone NOT NULL DEFAULT now(),
    submitted_at timestamp with time zone,
    auto_graded boolean NOT NULL DEFAULT false,
    UNIQUE(exam_id, student_id)
);

-- Create report_cards table
CREATE TABLE IF NOT EXISTS public.report_cards (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    term text NOT NULL,
    scores_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    average numeric(5,2),
    comments text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create awards table
CREATE TABLE IF NOT EXISTS public.awards (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    teacher_id uuid NOT NULL REFERENCES auth.users(id),
    school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    type text NOT NULL CHECK (type IN ('medal', 'certificate', 'badge')),
    title text NOT NULL,
    description text,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create activity_logs table
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    action text NOT NULL,
    details jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create admin_logs table
CREATE TABLE IF NOT EXISTS public.admin_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
    action text NOT NULL,
    target_id uuid,
    target_type text,
    details jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create announcements table
CREATE TABLE IF NOT EXISTS public.announcements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    title text NOT NULL,
    body text NOT NULL,
    created_by uuid NOT NULL REFERENCES auth.users(id),
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create attendance table
CREATE TABLE IF NOT EXISTS public.attendance (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    teacher_id uuid NOT NULL REFERENCES auth.users(id),
    date date NOT NULL,
    status text NOT NULL CHECK (status IN ('present', 'absent', 'late', 'excused')),
    notes text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE(student_id, class_id, date)
);

-- Insert the 3 hardcoded schools with activation codes
INSERT INTO public.schools (name, code, activation_code, status, code_used)
VALUES 
    ('Quimam El Hayat International Schools', 'QEHI', 'QMM001', 'active', false),
    ('Lumina Test Academy', 'LTA', 'LUMI100', 'active', false),
    ('Test School', 'TS', 'TEST999', 'active', false)
ON CONFLICT (code) DO UPDATE SET 
    activation_code = EXCLUDED.activation_code,
    name = EXCLUDED.name;

-- Enable RLS on all new tables
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- Helper function to get user's school_id
CREATE OR REPLACE FUNCTION public.get_user_school_id(user_uuid uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT school_id FROM public.profiles WHERE id = user_uuid LIMIT 1
$$;

-- Helper function to check if user is school admin of a specific school
CREATE OR REPLACE FUNCTION public.is_school_admin_of(user_uuid uuid, check_school_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = user_uuid 
        AND school_id = check_school_id 
        AND user_type = 'school_admin'
        AND is_active = true
    )
$$;

-- Helper function to check if user is teacher
CREATE OR REPLACE FUNCTION public.is_teacher(user_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = user_uuid 
        AND user_type = 'teacher'
        AND is_active = true
    )
$$;

-- Helper function to check if user is student
CREATE OR REPLACE FUNCTION public.is_student(user_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = user_uuid 
        AND user_type = 'student'
        AND is_active = true
    )
$$;

-- Function to activate school with code and make user school admin
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
    
    -- Find school with this activation code that hasn't been used
    SELECT * INTO school_record 
    FROM public.schools 
    WHERE activation_code = activation_code_input 
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
    INSERT INTO public.profiles (id, school_id, full_name, user_type, status, is_active)
    VALUES (user_uuid, school_record.id, COALESCE(user_email, 'School Admin'), 'school_admin', 'approved', true)
    ON CONFLICT (id) DO UPDATE SET
        school_id = school_record.id,
        user_type = 'school_admin',
        status = 'approved',
        is_active = true;
    
    -- Add to school_admins table
    INSERT INTO public.school_admins (user_id, school_id)
    VALUES (user_uuid, school_record.id)
    ON CONFLICT DO NOTHING;
    
    -- Log the action
    INSERT INTO public.admin_logs (admin_id, school_id, action, target_id, target_type, details)
    VALUES (user_uuid, school_record.id, 'school_activated', school_record.id, 'school', 
            jsonb_build_object('activation_code', activation_code_input));
    
    RETURN jsonb_build_object(
        'success', true, 
        'school_id', school_record.id, 
        'school_name', school_record.name
    );
END;
$$;

-- Function for super admin to create new school with activation code
CREATE OR REPLACE FUNCTION public.create_school_with_code(
    school_name text,
    school_code text,
    activation_code_input text,
    school_address text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_school_id uuid;
    caller_email text;
BEGIN
    -- Get caller email
    SELECT email INTO caller_email FROM auth.users WHERE id = auth.uid();
    
    -- Only super admin can create schools
    IF caller_email != 'malekismail487@gmail.com' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Access denied');
    END IF;
    
    -- Check if activation code already exists
    IF EXISTS (SELECT 1 FROM public.schools WHERE activation_code = activation_code_input) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Activation code already exists');
    END IF;
    
    -- Create school
    INSERT INTO public.schools (name, code, activation_code, address, status, code_used)
    VALUES (school_name, school_code, activation_code_input, school_address, 'active', false)
    RETURNING id INTO new_school_id;
    
    RETURN jsonb_build_object('success', true, 'school_id', new_school_id);
END;
$$;

-- RLS Policies for subjects
CREATE POLICY "Users can view subjects in their school"
ON public.subjects FOR SELECT
USING (school_id = get_user_school_id(auth.uid()));

CREATE POLICY "School admins can manage subjects"
ON public.subjects FOR ALL
USING (is_school_admin_of(auth.uid(), school_id));

-- RLS Policies for classes
CREATE POLICY "Users can view classes in their school"
ON public.classes FOR SELECT
USING (school_id = get_user_school_id(auth.uid()));

CREATE POLICY "School admins can manage classes"
ON public.classes FOR ALL
USING (is_school_admin_of(auth.uid(), school_id));

-- RLS Policies for teacher_subjects
CREATE POLICY "Teachers can view their subjects"
ON public.teacher_subjects FOR SELECT
USING (teacher_id = auth.uid());

CREATE POLICY "School admins can manage teacher subjects"
ON public.teacher_subjects FOR ALL
USING (EXISTS (
    SELECT 1 FROM public.subjects s 
    WHERE s.id = subject_id 
    AND is_school_admin_of(auth.uid(), s.school_id)
));

-- RLS Policies for invite_codes
CREATE POLICY "School admins can manage invite codes"
ON public.invite_codes FOR ALL
USING (is_school_admin_of(auth.uid(), school_id));

-- RLS Policies for invite_requests
CREATE POLICY "School admins can manage invite requests"
ON public.invite_requests FOR ALL
USING (EXISTS (
    SELECT 1 FROM public.invite_codes ic 
    WHERE ic.id = code_id 
    AND is_school_admin_of(auth.uid(), ic.school_id)
));

CREATE POLICY "Users can create invite requests"
ON public.invite_requests FOR INSERT
WITH CHECK (true);

-- RLS Policies for lesson_plans
CREATE POLICY "Teachers can manage their lesson plans"
ON public.lesson_plans FOR ALL
USING (teacher_id = auth.uid());

CREATE POLICY "Students can view published lesson plans in their school"
ON public.lesson_plans FOR SELECT
USING (
    school_id = get_user_school_id(auth.uid()) 
    AND is_published = true
);

CREATE POLICY "School admins can view all lesson plans"
ON public.lesson_plans FOR SELECT
USING (is_school_admin_of(auth.uid(), school_id));

-- RLS Policies for student_classes
CREATE POLICY "Students can view their classes"
ON public.student_classes FOR SELECT
USING (student_id = auth.uid());

CREATE POLICY "School admins can manage student classes"
ON public.student_classes FOR ALL
USING (EXISTS (
    SELECT 1 FROM public.classes c 
    WHERE c.id = class_id 
    AND is_school_admin_of(auth.uid(), c.school_id)
));

-- RLS Policies for submissions
CREATE POLICY "Students can manage their submissions"
ON public.submissions FOR ALL
USING (student_id = auth.uid());

CREATE POLICY "Teachers can view and grade submissions for their assignments"
ON public.submissions FOR ALL
USING (EXISTS (
    SELECT 1 FROM public.assignments a 
    WHERE a.id = assignment_id 
    AND a.teacher_id = auth.uid()
));

-- RLS Policies for exams
CREATE POLICY "Teachers can manage their exams"
ON public.exams FOR ALL
USING (teacher_id = auth.uid());

CREATE POLICY "Students can view published exams in their school"
ON public.exams FOR SELECT
USING (
    school_id = get_user_school_id(auth.uid()) 
    AND is_published = true
);

-- RLS Policies for exam_submissions
CREATE POLICY "Students can manage their exam submissions"
ON public.exam_submissions FOR ALL
USING (student_id = auth.uid());

CREATE POLICY "Teachers can view exam submissions for their exams"
ON public.exam_submissions FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.exams e 
    WHERE e.id = exam_id 
    AND e.teacher_id = auth.uid()
));

-- RLS Policies for report_cards
CREATE POLICY "Students can view their report cards"
ON public.report_cards FOR SELECT
USING (student_id = auth.uid());

CREATE POLICY "Teachers can manage report cards in their school"
ON public.report_cards FOR ALL
USING (
    school_id = get_user_school_id(auth.uid()) 
    AND is_teacher(auth.uid())
);

CREATE POLICY "School admins can view all report cards"
ON public.report_cards FOR SELECT
USING (is_school_admin_of(auth.uid(), school_id));

-- RLS Policies for awards
CREATE POLICY "Students can view their awards"
ON public.awards FOR SELECT
USING (student_id = auth.uid());

CREATE POLICY "Teachers can manage awards"
ON public.awards FOR ALL
USING (teacher_id = auth.uid());

-- RLS Policies for activity_logs
CREATE POLICY "Users can view their own activity"
ON public.activity_logs FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "School admins can view school activity"
ON public.activity_logs FOR SELECT
USING (is_school_admin_of(auth.uid(), school_id));

CREATE POLICY "System can insert activity logs"
ON public.activity_logs FOR INSERT
WITH CHECK (user_id = auth.uid());

-- RLS Policies for admin_logs
CREATE POLICY "School admins can view their logs"
ON public.admin_logs FOR SELECT
USING (admin_id = auth.uid() OR is_school_admin_of(auth.uid(), school_id));

CREATE POLICY "Admins can insert logs"
ON public.admin_logs FOR INSERT
WITH CHECK (admin_id = auth.uid());

-- RLS Policies for announcements
CREATE POLICY "Users can view announcements in their school"
ON public.announcements FOR SELECT
USING (school_id = get_user_school_id(auth.uid()));

CREATE POLICY "School admins can manage announcements"
ON public.announcements FOR ALL
USING (is_school_admin_of(auth.uid(), school_id));

-- RLS Policies for attendance
CREATE POLICY "Students can view their attendance"
ON public.attendance FOR SELECT
USING (student_id = auth.uid());

CREATE POLICY "Teachers can manage attendance"
ON public.attendance FOR ALL
USING (teacher_id = auth.uid());

CREATE POLICY "School admins can view all attendance"
ON public.attendance FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.classes c 
    WHERE c.id = class_id 
    AND is_school_admin_of(auth.uid(), c.school_id)
));

-- Super admin policy for schools (view all, suspend, delete)
DROP POLICY IF EXISTS "Super admins can delete schools" ON public.schools;
DROP POLICY IF EXISTS "Super admins can update schools" ON public.schools;

CREATE POLICY "Super admin can manage all schools"
ON public.schools FOR ALL
USING (
    (SELECT email FROM auth.users WHERE id = auth.uid()) = 'malekismail487@gmail.com'
);

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.announcements;
ALTER PUBLICATION supabase_realtime ADD TABLE public.submissions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.invite_requests;
