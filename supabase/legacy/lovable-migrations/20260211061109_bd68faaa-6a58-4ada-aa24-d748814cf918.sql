
-- Fix 1: Allow teachers to view profiles in their school (fixes "Unknown Student")
CREATE POLICY "Teachers can view profiles in their school"
ON public.profiles FOR SELECT
USING (
  school_id = get_user_school_id(auth.uid()) 
  AND is_teacher(auth.uid())
);

-- Fix 2: Create a function to cascade-delete a school and all related data
CREATE OR REPLACE FUNCTION public.delete_school_cascade(school_uuid UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete submissions for assignments in this school
  DELETE FROM public.submissions WHERE assignment_id IN (SELECT id FROM public.assignments WHERE school_id = school_uuid);
  -- Delete assignment views
  DELETE FROM public.assignment_views WHERE assignment_id IN (SELECT id FROM public.assignments WHERE school_id = school_uuid);
  -- Delete assignment submissions
  DELETE FROM public.assignment_submissions WHERE assignment_id IN (SELECT id FROM public.assignments WHERE school_id = school_uuid);
  -- Delete assignments
  DELETE FROM public.assignments WHERE school_id = school_uuid;
  -- Delete exam submissions
  DELETE FROM public.exam_submissions WHERE exam_id IN (SELECT id FROM public.exams WHERE school_id = school_uuid);
  -- Delete exams
  DELETE FROM public.exams WHERE school_id = school_uuid;
  -- Delete lesson plans
  DELETE FROM public.lesson_plans WHERE school_id = school_uuid;
  -- Delete course materials
  DELETE FROM public.course_materials WHERE school_id = school_uuid;
  -- Delete material views for materials in this school
  DELETE FROM public.material_views WHERE material_id IN (SELECT id FROM public.course_materials WHERE school_id = school_uuid);
  -- Delete material comments
  DELETE FROM public.material_comments WHERE material_id IN (SELECT id FROM public.course_materials WHERE school_id = school_uuid);
  -- Delete report cards
  DELETE FROM public.report_cards WHERE school_id = school_uuid;
  -- Delete teacher subjects for subjects in this school
  DELETE FROM public.teacher_subjects WHERE subject_id IN (SELECT id FROM public.subjects WHERE school_id = school_uuid);
  -- Delete subjects
  DELETE FROM public.subjects WHERE school_id = school_uuid;
  -- Delete student classes for classes in this school
  DELETE FROM public.student_classes WHERE class_id IN (SELECT id FROM public.classes WHERE school_id = school_uuid);
  -- Delete attendance
  DELETE FROM public.attendance WHERE class_id IN (SELECT id FROM public.classes WHERE school_id = school_uuid);
  -- Delete classes
  DELETE FROM public.classes WHERE school_id = school_uuid;
  -- Delete chat messages in chat rooms of this school
  DELETE FROM public.chat_messages WHERE chat_room_id IN (SELECT id FROM public.chat_rooms WHERE school_id = school_uuid);
  -- Delete chat rooms
  DELETE FROM public.chat_rooms WHERE school_id = school_uuid;
  -- Delete announcements
  DELETE FROM public.announcements WHERE school_id = school_uuid;
  -- Delete awards
  DELETE FROM public.awards WHERE school_id = school_uuid;
  -- Delete user strikes
  DELETE FROM public.user_strikes WHERE school_id = school_uuid;
  -- Delete activity logs
  DELETE FROM public.activity_logs WHERE school_id = school_uuid;
  -- Delete admin logs
  DELETE FROM public.admin_logs WHERE school_id = school_uuid;
  -- Delete invite requests for invite codes of this school
  DELETE FROM public.invite_requests WHERE code_id IN (SELECT id FROM public.invite_codes WHERE school_id = school_uuid);
  -- Delete invite codes
  DELETE FROM public.invite_codes WHERE school_id = school_uuid;
  -- Delete school admins
  DELETE FROM public.school_admins WHERE school_id = school_uuid;
  -- Delete profiles in this school
  DELETE FROM public.profiles WHERE school_id = school_uuid;
  -- Finally delete the school
  DELETE FROM public.schools WHERE id = school_uuid;
END;
$$;
