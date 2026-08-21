
-- 1) Extend subjects
ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS emoji TEXT,
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS subjects_school_slug_unique
  ON public.subjects(school_id, slug) WHERE slug IS NOT NULL;

-- 2) Schools sync toggle
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS subjects_sync_enabled BOOLEAN NOT NULL DEFAULT true;

-- 3) Invite codes get subject binding
ALTER TABLE public.invite_codes
  ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE;

-- 4) Profiles teacher_subject_id
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS teacher_subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL;

-- 5) Seed default subjects function
CREATE OR REPLACE FUNCTION public.seed_default_subjects(p_school_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  defaults JSONB := '[
    {"slug":"biology","name":"Biology","emoji":"🧬","color":"from-emerald-500 to-green-600"},
    {"slug":"physics","name":"Physics","emoji":"⚛️","color":"from-blue-500 to-cyan-600"},
    {"slug":"mathematics","name":"Mathematics","emoji":"📐","color":"from-violet-500 to-purple-600"},
    {"slug":"chemistry","name":"Chemistry","emoji":"🧪","color":"from-orange-500 to-amber-600"},
    {"slug":"english","name":"English","emoji":"📚","color":"from-rose-500 to-pink-600"},
    {"slug":"social_studies","name":"Social Studies","emoji":"🌍","color":"from-teal-500 to-emerald-600"},
    {"slug":"technology","name":"Technology","emoji":"💻","color":"from-indigo-500 to-blue-600"},
    {"slug":"arabic","name":"اللغة العربية","emoji":"🕌","color":"from-amber-500 to-yellow-600"},
    {"slug":"islamic_studies","name":"Islamic Studies","emoji":"☪️","color":"from-green-600 to-emerald-700"},
    {"slug":"ksa_history","name":"KSA History","emoji":"🏛️","color":"from-amber-600 to-orange-700"},
    {"slug":"art_design","name":"Art and Design","emoji":"🎨","color":"from-pink-500 to-rose-600"},
    {"slug":"entrepreneurship","name":"Entrepreneurship","emoji":"💼","color":"from-cyan-500 to-sky-600"}
  ]'::jsonb;
  item JSONB;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(defaults) LOOP
    INSERT INTO public.subjects(school_id, name, slug, emoji, color, is_default)
    VALUES (p_school_id, item->>'name', item->>'slug', item->>'emoji', item->>'color', true)
    ON CONFLICT (school_id, slug) WHERE slug IS NOT NULL DO NOTHING;
  END LOOP;
END;
$$;

-- 6) Backfill existing schools that have no subjects yet
DO $$
DECLARE
  s RECORD;
BEGIN
  FOR s IN SELECT id FROM public.schools LOOP
    PERFORM public.seed_default_subjects(s.id);
  END LOOP;
END$$;

-- Best-effort: tag existing rows that match default slugs as defaults with emoji/color
UPDATE public.subjects sub SET
  slug = COALESCE(sub.slug, lower(regexp_replace(sub.name, '[^a-zA-Z0-9]+', '_', 'g')))
WHERE sub.slug IS NULL;

-- 7) Update activate_school_with_code to also seed defaults
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

    -- Seed default subject tiles
    PERFORM public.seed_default_subjects(school_record.id);

    BEGIN
      INSERT INTO public.admin_logs (admin_id, school_id, action, target_id, target_type, details)
      VALUES (user_uuid, school_record.id, 'school_activated', school_record.id, 'school',
              jsonb_build_object('activation_code', activation_code_input));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    RETURN jsonb_build_object('success', true, 'school_id', school_record.id, 'school_name', school_record.name);
END;
$function$;

-- 8) Sync trigger: on subject delete, if sync enabled, clean up unused invites + unassign teachers
CREATE OR REPLACE FUNCTION public.subjects_sync_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sync_enabled boolean;
BEGIN
  SELECT subjects_sync_enabled INTO v_sync_enabled FROM public.schools WHERE id = OLD.school_id;
  IF COALESCE(v_sync_enabled, true) THEN
    -- Unused teacher invites for this subject get removed
    DELETE FROM public.invite_codes
     WHERE subject_id = OLD.id AND used = false;
    -- Teachers linked to this subject get unassigned (ON DELETE SET NULL already handles FK, but be explicit for clarity in case of cached rows)
    UPDATE public.profiles SET teacher_subject_id = NULL
     WHERE teacher_subject_id = OLD.id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_subjects_sync_on_delete ON public.subjects;
CREATE TRIGGER trg_subjects_sync_on_delete
BEFORE DELETE ON public.subjects
FOR EACH ROW EXECUTE FUNCTION public.subjects_sync_on_delete();

-- 9) Allow teachers/students to read schools.subjects_sync_enabled implicitly via existing schools SELECT policy (already permits same-school SELECT). No new policy needed.
