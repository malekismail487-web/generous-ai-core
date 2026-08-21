-- Create chat rooms table for school-based messaging
CREATE TABLE public.chat_rooms (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'General',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

-- Enable RLS
ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;

-- Chat room messages
CREATE TABLE public.chat_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_room_id uuid NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Strikes table for user violations
CREATE TABLE public.user_strikes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  reason text NOT NULL,
  issued_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true
);

ALTER TABLE public.user_strikes ENABLE ROW LEVEL SECURITY;

-- Assignments table for teacher-created assignments
CREATE TABLE public.assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  subject text NOT NULL,
  grade_level text NOT NULL,
  due_date timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

-- Assignment submissions
CREATE TABLE public.assignment_submissions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  content text,
  submitted_at timestamp with time zone NOT NULL DEFAULT now(),
  grade text,
  feedback text,
  graded_at timestamp with time zone,
  graded_by uuid
);

ALTER TABLE public.assignment_submissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for chat_rooms
CREATE POLICY "Users can view chat rooms in their school"
ON public.chat_rooms FOR SELECT
USING (
  school_id IN (
    SELECT profiles.school_id FROM profiles 
    WHERE profiles.id = auth.uid() AND profiles.status = 'approved'
  )
);

CREATE POLICY "Teachers and admins can create chat rooms"
ON public.chat_rooms FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'teacher'::app_role) OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Chat room creators can delete"
ON public.chat_rooms FOR DELETE
USING (created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for chat_messages
CREATE POLICY "Users can view messages in their school chat rooms"
ON public.chat_messages FOR SELECT
USING (
  chat_room_id IN (
    SELECT cr.id FROM chat_rooms cr
    JOIN profiles p ON p.school_id = cr.school_id
    WHERE p.id = auth.uid() AND p.status = 'approved'
  )
);

CREATE POLICY "Approved users can send messages"
ON public.chat_messages FOR INSERT
WITH CHECK (
  auth.uid() = user_id AND
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() AND profiles.status = 'approved'
  )
);

CREATE POLICY "Users can delete their own messages"
ON public.chat_messages FOR DELETE
USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for user_strikes
CREATE POLICY "Users can view their own strikes"
ON public.user_strikes FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "School admins can view school strikes"
ON public.user_strikes FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM school_admins 
    WHERE school_admins.user_id = auth.uid() 
    AND school_admins.school_id = user_strikes.school_id
  )
);

CREATE POLICY "School admins can issue strikes"
ON public.user_strikes FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM school_admins 
    WHERE school_admins.user_id = auth.uid() 
    AND school_admins.school_id = user_strikes.school_id
  ) OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can update strikes"
ON public.user_strikes FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for assignments
CREATE POLICY "Users can view assignments in their school"
ON public.assignments FOR SELECT
USING (
  school_id IN (
    SELECT profiles.school_id FROM profiles 
    WHERE profiles.id = auth.uid() AND profiles.status = 'approved'
  )
);

CREATE POLICY "Teachers can create assignments"
ON public.assignments FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'teacher'::app_role) AND auth.uid() = teacher_id
);

CREATE POLICY "Teachers can update their assignments"
ON public.assignments FOR UPDATE
USING (teacher_id = auth.uid());

CREATE POLICY "Teachers can delete their assignments"
ON public.assignments FOR DELETE
USING (teacher_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for assignment_submissions
CREATE POLICY "Students can view their own submissions"
ON public.assignment_submissions FOR SELECT
USING (student_id = auth.uid());

CREATE POLICY "Teachers can view submissions for their assignments"
ON public.assignment_submissions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM assignments 
    WHERE assignments.id = assignment_submissions.assignment_id 
    AND assignments.teacher_id = auth.uid()
  )
);

CREATE POLICY "Students can submit assignments"
ON public.assignment_submissions FOR INSERT
WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Students can update their ungraded submissions"
ON public.assignment_submissions FOR UPDATE
USING (student_id = auth.uid() AND graded_at IS NULL);

CREATE POLICY "Teachers can grade submissions"
ON public.assignment_submissions FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM assignments 
    WHERE assignments.id = assignment_submissions.assignment_id 
    AND assignments.teacher_id = auth.uid()
  )
);

-- Enable realtime for chat messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;