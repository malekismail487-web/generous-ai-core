
-- =========================================================================
-- Teacher Categories: separate from student Subjects, with optional Sync.
-- Each category auto-spawns a permanent invite code; using it locks teacher
-- to that category. Free-text emoji (no preset constraint).
-- =========================================================================

-- 1) teacher_categories table ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.teacher_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  emoji TEXT,
  color TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  permanent_invite_code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS teacher_categories_school_idx ON public.teacher_categories(school_id);
CREATE INDEX IF NOT EXISTS teacher_categories_subject_idx ON public.teacher_categories(subject_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_categories TO authenticated;
GRANT ALL ON public.teacher_categories TO service_role;

ALTER TABLE public.teacher_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "School members read teacher_categories"
  ON public.teacher_categories FOR SELECT
  TO authenticated
  USING (
    school_id = public.get_user_school_id(auth.uid())
    OR public.is_school_admin_of(auth.uid(), school_id)
  );

CREATE POLICY "School admins manage teacher_categories"
  ON public.teacher_categories FOR ALL
  TO authenticated
  USING (public.is_school_admin_of(auth.uid(), school_id))
  WITH CHECK (public.is_school_admin_of(auth.uid(), school_id));

CREATE TRIGGER teacher_categories_updated_at
  BEFORE UPDATE ON public.teacher_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Add teacher_category_id on profiles & invite_codes ---------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS teacher_category_id UUID
    REFERENCES public.teacher_categories(id) ON DELETE SET NULL;

ALTER TABLE public.invite_codes
  ADD COLUMN IF NOT EXISTS teacher_category_id UUID
    REFERENCES public.teacher_categories(id) ON DELETE CASCADE;

-- 3) Code generator helper --------------------------------------------------
CREATE OR REPLACE FUNCTION public.gen_teacher_category_code(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prefix TEXT;
  suffix TEXT;
  attempt INT := 0;
  candidate TEXT;
BEGIN
  prefix := upper(regexp_replace(coalesce(p_name,'TC'), '[^A-Za-z0-9]', '', 'g'));
  IF length(prefix) < 2 THEN prefix := 'TC'; END IF;
  prefix := substr(prefix, 1, 3);
  LOOP
    suffix := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    candidate := prefix || '-' || suffix;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.teacher_categories WHERE permanent_invite_code = candidate);
    attempt := attempt + 1;
    IF attempt > 10 THEN
      candidate := prefix || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 8));
      EXIT;
    END IF;
  END LOOP;
  RETURN candidate;
END;
$$;

-- 4) Seed default teacher categories ----------------------------------------
CREATE OR REPLACE FUNCTION public.seed_default_teacher_categories(p_school_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s RECORD;
BEGIN
  FOR s IN
    SELECT id, name, emoji, color
      FROM public.subjects
     WHERE school_id = p_school_id AND is_default = true
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.teacher_categories
       WHERE school_id = p_school_id AND subject_id = s.id
    ) THEN
      INSERT INTO public.teacher_categories
        (school_id, name, emoji, color, is_default, subject_id, permanent_invite_code)
      VALUES
        (p_school_id, s.name, s.emoji, s.color, true, s.id,
         public.gen_teacher_category_code(s.name));
    END IF;
  END LOOP;
END;
$$;

-- 5) Patch activate_school_with_code to seed teacher categories too ---------
CREATE OR REPLACE FUNCTION public.activate_school_with_code(activation_code_input text, user_uuid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    school_record record;
    user_email text;
BEGIN
    SELECT email INTO user_email FROM auth.users WHERE id = user_uuid;

    SELECT * INTO school_record FROM public.schools
    WHERE UPPER(activation_code) = UPPER(activation_code_input)
      AND code_used = false AND status = 'active';

    IF school_record IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid or already used activation code');
    END IF;

    UPDATE public.schools
    SET code_used = true, code_used_by = user_uuid, code_used_at = now()
    WHERE id = school_record.id;

    INSERT INTO public.profiles (id, school_id, full_name, user_type, status, is_active, email)
    VALUES (user_uuid, school_record.id, COALESCE(user_email, 'School Admin'), 'school_admin', 'approved', true, user_email)
    ON CONFLICT (id) DO UPDATE SET
        school_id = school_record.id, user_type = 'school_admin',
        status = 'approved', is_active = true, email = user_email;

    INSERT INTO public.user_roles (user_id, role) VALUES (user_uuid, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;

    INSERT INTO public.school_admins (user_id, school_id) VALUES (user_uuid, school_record.id)
    ON CONFLICT DO NOTHING;

    PERFORM public.seed_default_subjects(school_record.id);
    PERFORM public.seed_default_teacher_categories(school_record.id);

    BEGIN
      INSERT INTO public.admin_logs (admin_id, school_id, action, target_id, target_type, details)
      VALUES (user_uuid, school_record.id, 'school_activated', school_record.id, 'school',
              jsonb_build_object('activation_code', activation_code_input));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    RETURN jsonb_build_object('success', true, 'school_id', school_record.id, 'school_name', school_record.name);
END;
$function$;

-- 6) Sync triggers ----------------------------------------------------------
--   * When Sync ON, creating a teacher_category without subject_id creates a
--     matching subject. Creating a subject creates a matching category.
--   * When Sync ON, deleting one cascades to the other.

CREATE OR REPLACE FUNCTION public.tc_after_insert_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sync BOOLEAN;
  v_subj_id UUID;
  v_slug TEXT;
BEGIN
  IF NEW.subject_id IS NOT NULL THEN RETURN NEW; END IF;
  SELECT COALESCE(subjects_sync_enabled, true) INTO v_sync FROM public.schools WHERE id = NEW.school_id;
  IF NOT v_sync THEN RETURN NEW; END IF;

  v_slug := lower(regexp_replace(NEW.name, '[^a-zA-Z0-9]+', '_', 'g'));
  v_slug := trim(both '_' from v_slug);

  -- Try to find an existing subject by slug or name
  SELECT id INTO v_subj_id FROM public.subjects
   WHERE school_id = NEW.school_id AND (slug = v_slug OR lower(name) = lower(NEW.name))
   LIMIT 1;

  IF v_subj_id IS NULL THEN
    INSERT INTO public.subjects(school_id, name, slug, emoji, color, is_default)
    VALUES (NEW.school_id, NEW.name, v_slug, NEW.emoji, NEW.color, false)
    RETURNING id INTO v_subj_id;
  END IF;

  UPDATE public.teacher_categories SET subject_id = v_subj_id WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS teacher_categories_after_insert ON public.teacher_categories;
CREATE TRIGGER teacher_categories_after_insert
  AFTER INSERT ON public.teacher_categories
  FOR EACH ROW EXECUTE FUNCTION public.tc_after_insert_sync();

CREATE OR REPLACE FUNCTION public.tc_after_delete_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sync BOOLEAN;
BEGIN
  SELECT COALESCE(subjects_sync_enabled, true) INTO v_sync FROM public.schools WHERE id = OLD.school_id;
  -- Always remove unused invites for this category
  DELETE FROM public.invite_codes WHERE teacher_category_id = OLD.id AND used = false;
  IF v_sync AND OLD.subject_id IS NOT NULL THEN
    DELETE FROM public.subjects WHERE id = OLD.subject_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS teacher_categories_after_delete ON public.teacher_categories;
CREATE TRIGGER teacher_categories_after_delete
  AFTER DELETE ON public.teacher_categories
  FOR EACH ROW EXECUTE FUNCTION public.tc_after_delete_sync();

CREATE OR REPLACE FUNCTION public.subjects_after_insert_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sync BOOLEAN;
BEGIN
  SELECT COALESCE(subjects_sync_enabled, true) INTO v_sync FROM public.schools WHERE id = NEW.school_id;
  IF NOT v_sync THEN RETURN NEW; END IF;

  IF EXISTS (SELECT 1 FROM public.teacher_categories WHERE subject_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.teacher_categories(school_id, name, emoji, color, is_default, subject_id, permanent_invite_code)
  VALUES (NEW.school_id, NEW.name, NEW.emoji, NEW.color, NEW.is_default, NEW.id,
          public.gen_teacher_category_code(NEW.name));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subjects_after_insert_sync ON public.subjects;
CREATE TRIGGER subjects_after_insert_sync
  AFTER INSERT ON public.subjects
  FOR EACH ROW EXECUTE FUNCTION public.subjects_after_insert_sync();

-- Replace older subjects_sync_on_delete to also delete linked teacher_categories
CREATE OR REPLACE FUNCTION public.subjects_sync_on_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sync_enabled boolean;
BEGIN
  SELECT subjects_sync_enabled INTO v_sync_enabled FROM public.schools WHERE id = OLD.school_id;
  IF COALESCE(v_sync_enabled, true) THEN
    -- Linked teacher categories follow (also nukes their invites via cascade trigger)
    DELETE FROM public.teacher_categories WHERE subject_id = OLD.id;
    -- Unused legacy subject-bound invites
    DELETE FROM public.invite_codes WHERE subject_id = OLD.id AND used = false;
    UPDATE public.profiles SET teacher_subject_id = NULL WHERE teacher_subject_id = OLD.id;
  END IF;
  RETURN OLD;
END;
$function$;

-- 7) Permanent code rotation -----------------------------------------------
CREATE OR REPLACE FUNCTION public.rotate_teacher_category_code(p_category_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school UUID;
  v_name TEXT;
  v_new TEXT;
BEGIN
  SELECT school_id, name INTO v_school, v_name
    FROM public.teacher_categories WHERE id = p_category_id;
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'Category not found';
  END IF;
  IF NOT public.is_school_admin_of(auth.uid(), v_school) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  v_new := public.gen_teacher_category_code(v_name);
  UPDATE public.teacher_categories SET permanent_invite_code = v_new, updated_at = now()
   WHERE id = p_category_id;
  RETURN v_new;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rotate_teacher_category_code(UUID) TO authenticated;

-- 8) signup_with_invite_code: propagate teacher_category_id -----------------
CREATE OR REPLACE FUNCTION public.signup_with_invite_code(p_email text, p_invite_code text, p_full_name text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_code_record RECORD;
  v_perm_record RECORD;
  v_request_id UUID;
  v_profile_id UUID;
  v_tcat_id UUID;
  v_school_id UUID;
  v_role TEXT;
  v_school_name TEXT;
BEGIN
  -- 1) Try single-use invite_codes
  SELECT ic.*, s.name as school_name, s.id as sid
    INTO v_code_record
  FROM public.invite_codes ic
  JOIN public.schools s ON s.id = ic.school_id
  WHERE ic.code = UPPER(p_invite_code)
    AND ic.used = false
    AND ic.expires_at > NOW();

  IF v_code_record.id IS NOT NULL THEN
    v_school_id := v_code_record.school_id;
    v_role := v_code_record.role;
    v_school_name := v_code_record.school_name;
    v_tcat_id := v_code_record.teacher_category_id;
  ELSE
    -- 2) Try permanent teacher category code
    SELECT tc.id AS tcat_id, tc.school_id, s.name AS school_name
      INTO v_perm_record
    FROM public.teacher_categories tc
    JOIN public.schools s ON s.id = tc.school_id
    WHERE tc.permanent_invite_code = UPPER(p_invite_code)
    LIMIT 1;

    IF v_perm_record.tcat_id IS NULL THEN
      RETURN json_build_object('success', false, 'error', 'Invalid or expired invite code');
    END IF;

    v_school_id := v_perm_record.school_id;
    v_role := 'teacher';
    v_school_name := v_perm_record.school_name;
    v_tcat_id := v_perm_record.tcat_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.invite_requests
    WHERE email = LOWER(p_email)
      AND (code_id = v_code_record.id OR (v_code_record.id IS NULL))
      AND status = 'pending'
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Request already pending for this email');
  END IF;

  INSERT INTO public.invite_requests (code_id, name, email, status)
  VALUES (v_code_record.id, p_full_name, LOWER(p_email), 'pending')
  RETURNING id INTO v_request_id;

  v_profile_id := gen_random_uuid();
  INSERT INTO public.profiles (id, school_id, full_name, email, user_type, status, is_active, teacher_category_id)
  VALUES (
    v_profile_id,
    v_school_id,
    p_full_name,
    LOWER(p_email),
    v_role,
    'pending',
    false,
    v_tcat_id
  )
  ON CONFLICT DO NOTHING;

  RETURN json_build_object(
    'success', true,
    'request_id', v_request_id,
    'school_name', v_school_name,
    'role', v_role
  );
END;
$function$;

-- 9) Backfill teacher categories for existing schools -----------------------
DO $$
DECLARE
  s RECORD;
BEGIN
  FOR s IN SELECT id FROM public.schools LOOP
    PERFORM public.seed_default_teacher_categories(s.id);
  END LOOP;
END $$;

-- Backfill: copy teacher_subject_id -> teacher_category_id where mapping is obvious
UPDATE public.profiles p
   SET teacher_category_id = tc.id
  FROM public.teacher_categories tc
 WHERE p.teacher_category_id IS NULL
   AND p.teacher_subject_id IS NOT NULL
   AND tc.subject_id = p.teacher_subject_id
   AND tc.school_id = p.school_id;

-- 10) Realtime --------------------------------------------------------------
DO $$ BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.teacher_categories';
EXCEPTION WHEN duplicate_object OR others THEN NULL;
END $$;
