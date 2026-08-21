
-- Security definer function to get ministry dashboard data
-- Validates session token and returns all data
CREATE OR REPLACE FUNCTION public.get_ministry_dashboard_data(p_session_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_session RECORD;
  v_schools json;
  v_profiles json;
  v_assignments json;
  v_submissions json;
  v_materials json;
  v_learning_profiles json;
BEGIN
  -- Validate session
  SELECT * INTO v_session FROM ministry_sessions
  WHERE session_token = p_session_token AND is_active = true AND expires_at > now();

  IF v_session IS NULL THEN
    RETURN json_build_object('error', 'Invalid or expired session');
  END IF;

  -- Refresh session
  UPDATE ministry_sessions SET last_activity = now(), expires_at = now() + interval '15 minutes'
  WHERE id = v_session.id;

  -- Fetch all data
  SELECT json_agg(row_to_json(s)) INTO v_schools FROM (SELECT id, name, status FROM schools) s;
  SELECT json_agg(row_to_json(p)) INTO v_profiles FROM (SELECT id, school_id, user_type, is_active, full_name, grade_level, status FROM profiles WHERE is_active = true) p;
  SELECT json_agg(row_to_json(a)) INTO v_assignments FROM (SELECT id, school_id FROM assignments) a;
  SELECT json_agg(row_to_json(sub)) INTO v_submissions FROM (SELECT id, assignment_id FROM assignment_submissions) sub;
  SELECT json_agg(row_to_json(m)) INTO v_materials FROM (SELECT id, school_id FROM course_materials) m;
  SELECT json_agg(row_to_json(lp)) INTO v_learning_profiles FROM (SELECT user_id, subject, difficulty_level, recent_accuracy, total_questions_answered, correct_answers FROM student_learning_profiles) lp;

  RETURN json_build_object(
    'success', true,
    'schools', COALESCE(v_schools, '[]'::json),
    'profiles', COALESCE(v_profiles, '[]'::json),
    'assignments', COALESCE(v_assignments, '[]'::json),
    'submissions', COALESCE(v_submissions, '[]'::json),
    'materials', COALESCE(v_materials, '[]'::json),
    'learningProfiles', COALESCE(v_learning_profiles, '[]'::json)
  );
END;
$$;
