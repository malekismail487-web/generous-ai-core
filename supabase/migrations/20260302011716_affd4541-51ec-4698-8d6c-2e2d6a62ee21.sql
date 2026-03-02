
-- Parent invite codes table - auto-generated when student is approved
CREATE TABLE public.parent_invite_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  school_id uuid NOT NULL REFERENCES public.schools(id),
  code text NOT NULL UNIQUE,
  used boolean NOT NULL DEFAULT false,
  used_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Parent-student linking table
CREATE TABLE public.parent_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL,
  student_id uuid NOT NULL,
  school_id uuid NOT NULL REFERENCES public.schools(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(parent_id, student_id)
);

-- Enable RLS
ALTER TABLE public.parent_invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_students ENABLE ROW LEVEL SECURITY;

-- RLS for parent_invite_codes
CREATE POLICY "School admins can view parent codes" ON public.parent_invite_codes
  FOR SELECT USING (is_school_admin_of(auth.uid(), school_id));

CREATE POLICY "Students can view their own parent code" ON public.parent_invite_codes
  FOR SELECT USING (student_id = auth.uid());

-- RLS for parent_students
CREATE POLICY "Parents can view their links" ON public.parent_students
  FOR SELECT USING (parent_id = auth.uid());

CREATE POLICY "Parents can view child school data" ON public.parent_students
  FOR SELECT USING (parent_id = auth.uid());

CREATE POLICY "School admins can view parent links" ON public.parent_students
  FOR SELECT USING (is_school_admin_of(auth.uid(), school_id));

-- Helper function: check if user is a parent of a student
CREATE OR REPLACE FUNCTION public.is_parent_of(p_parent_id uuid, p_student_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM parent_students WHERE parent_id = p_parent_id AND student_id = p_student_id
  )
$$;

-- Function to generate parent code when student is approved
CREATE OR REPLACE FUNCTION public.generate_parent_code_on_approval()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_code text;
BEGIN
  -- Only trigger when student profile becomes approved + active
  IF NEW.user_type = 'student' AND NEW.status = 'approved' AND NEW.is_active = true
     AND (OLD.status != 'approved' OR OLD.is_active != true) THEN
    -- Generate 8-char alphanumeric code
    new_code := 'P' || upper(substr(md5(random()::text || NEW.id::text), 1, 7));
    
    -- Only create if no code exists yet for this student
    INSERT INTO parent_invite_codes (student_id, school_id, code)
    VALUES (NEW.id, NEW.school_id, new_code)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_generate_parent_code
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION generate_parent_code_on_approval();

-- Function for parent signup with code
CREATE OR REPLACE FUNCTION public.signup_as_parent(
  p_parent_user_id uuid,
  p_parent_code text,
  p_full_name text
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_code_rec RECORD;
  v_parent_email text;
BEGIN
  -- Find the parent invite code
  SELECT pic.*, s.name as school_name
  INTO v_code_rec
  FROM parent_invite_codes pic
  JOIN schools s ON s.id = pic.school_id
  WHERE pic.code = upper(p_parent_code)
    AND pic.used = false;

  IF v_code_rec IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid or already used parent code.');
  END IF;

  -- Get parent email from auth
  SELECT email INTO v_parent_email FROM auth.users WHERE id = p_parent_user_id;

  -- Create parent profile
  INSERT INTO profiles (id, school_id, full_name, email, user_type, status, is_active)
  VALUES (p_parent_user_id, v_code_rec.school_id, p_full_name, v_parent_email, 'parent', 'approved', true)
  ON CONFLICT (id) DO UPDATE SET
    school_id = v_code_rec.school_id,
    full_name = p_full_name,
    user_type = 'parent',
    status = 'approved',
    is_active = true;

  -- Link parent to student
  INSERT INTO parent_students (parent_id, student_id, school_id)
  VALUES (p_parent_user_id, v_code_rec.student_id, v_code_rec.school_id)
  ON CONFLICT (parent_id, student_id) DO NOTHING;

  -- Mark code as used
  UPDATE parent_invite_codes SET used = true, used_by = p_parent_user_id WHERE id = v_code_rec.id;

  RETURN json_build_object('success', true, 'school_name', v_code_rec.school_name, 'student_id', v_code_rec.student_id);
END;
$$;

-- Add RLS policies so parents can see their child's data

-- Parents can view their child's assignments
CREATE POLICY "Parents can view child assignments" ON public.assignments
  FOR SELECT USING (
    school_id IN (SELECT school_id FROM parent_students WHERE parent_id = auth.uid())
  );

-- Parents can view child's submissions
CREATE POLICY "Parents can view child submissions" ON public.submissions
  FOR SELECT USING (
    student_id IN (SELECT student_id FROM parent_students WHERE parent_id = auth.uid())
  );

-- Parents can view child's assignment submissions
CREATE POLICY "Parents can view child assignment submissions" ON public.assignment_submissions
  FOR SELECT USING (
    student_id IN (SELECT student_id FROM parent_students WHERE parent_id = auth.uid())
  );

-- Parents can view child's report cards
CREATE POLICY "Parents can view child report cards" ON public.report_cards
  FOR SELECT USING (
    student_id IN (SELECT student_id FROM parent_students WHERE parent_id = auth.uid())
  );

-- Parents can view child's attendance
CREATE POLICY "Parents can view child attendance" ON public.attendance
  FOR SELECT USING (
    student_id IN (SELECT student_id FROM parent_students WHERE parent_id = auth.uid())
  );

-- Parents can view announcements in their school
CREATE POLICY "Parents can view school announcements" ON public.announcements
  FOR SELECT USING (
    school_id IN (SELECT school_id FROM parent_students WHERE parent_id = auth.uid())
  );

-- Parents can view child's streaks
CREATE POLICY "Parents can view child streaks" ON public.daily_streaks
  FOR SELECT USING (
    user_id IN (SELECT student_id FROM parent_students WHERE parent_id = auth.uid())
  );

-- Parents can view child's learning profile
CREATE POLICY "Parents can view child learning profiles" ON public.student_learning_profiles
  FOR SELECT USING (
    user_id IN (SELECT student_id FROM parent_students WHERE parent_id = auth.uid())
  );
