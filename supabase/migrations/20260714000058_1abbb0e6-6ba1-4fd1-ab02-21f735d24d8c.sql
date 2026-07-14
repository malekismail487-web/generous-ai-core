
-- =========================================================================
-- T1: MULTI-TENANT FOUNDATION
-- =========================================================================

-- 1) tenants ---------------------------------------------------------------
CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  country_name text NOT NULL,
  country_code text NOT NULL UNIQUE,          -- ISO-3166 alpha-2
  ministry_name text NOT NULL,
  default_language text NOT NULL DEFAULT 'en',
  supported_languages text[] NOT NULL DEFAULT ARRAY['en']::text[],
  grading_system jsonb NOT NULL DEFAULT '{}'::jsonb,
  academic_calendar jsonb NOT NULL DEFAULT '{}'::jsonb,
  curriculum_framework text,
  ai_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'provisioning'
    CHECK (status IN ('active','provisioning','suspended')),
  is_visible boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tenants TO authenticated;
GRANT ALL    ON public.tenants TO service_role;

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- Anyone signed in can read active + visible tenants (for country pickers).
CREATE POLICY "Read active visible tenants"
  ON public.tenants FOR SELECT
  TO authenticated
  USING (status = 'active' AND is_visible = true);

-- Super Admin manages everything.
CREATE POLICY "Super admin manages tenants"
  ON public.tenants FOR ALL
  TO authenticated
  USING (public.is_super_admin_user(auth.uid()))
  WITH CHECK (public.is_super_admin_user(auth.uid()));

CREATE TRIGGER tenants_touch_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2) tenant_roles ----------------------------------------------------------
CREATE TABLE public.tenant_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('ministry_admin','ministry_analyst','ministry_curriculum')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tenant_id, role)
);

GRANT SELECT ON public.tenant_roles TO authenticated;
GRANT ALL    ON public.tenant_roles TO service_role;

ALTER TABLE public.tenant_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant role holders read their assignments"
  ON public.tenant_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin_user(auth.uid()));

CREATE POLICY "Super admin manages tenant roles"
  ON public.tenant_roles FOR ALL
  TO authenticated
  USING (public.is_super_admin_user(auth.uid()))
  WITH CHECK (public.is_super_admin_user(auth.uid()));

-- 3) tenant_id columns (nullable first) -----------------------------------
ALTER TABLE public.schools                 ADD COLUMN tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.curriculum_standards    ADD COLUMN tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.curriculum_versions     ADD COLUMN tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.ministry_access_codes   ADD COLUMN tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.ministry_access_requests ADD COLUMN tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.ministry_sessions       ADD COLUMN tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.ministry_ip_bans        ADD COLUMN tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.moderator_invite_codes  ADD COLUMN tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.lct_exams               ADD COLUMN tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.lct_exam_students       ADD COLUMN tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.lct_exam_locks          ADD COLUMN tenant_id uuid REFERENCES public.tenants(id);

-- 4) Seed the Saudi Arabia tenant + backfill ------------------------------
WITH sa AS (
  INSERT INTO public.tenants (
    slug, country_name, country_code, ministry_name,
    default_language, supported_languages,
    curriculum_framework, status, is_visible
  ) VALUES (
    'sa',
    'Kingdom of Saudi Arabia',
    'SA',
    'Ministry of Education',
    'ar',
    ARRAY['ar','en']::text[],
    'sa-moe-2024',
    'active',
    true
  )
  RETURNING id
)
UPDATE public.schools s SET tenant_id = sa.id FROM sa WHERE s.tenant_id IS NULL;

-- Everything else backfills from the single Saudi tenant.
UPDATE public.curriculum_standards     SET tenant_id = (SELECT id FROM public.tenants WHERE slug='sa') WHERE tenant_id IS NULL;
UPDATE public.curriculum_versions      SET tenant_id = (SELECT id FROM public.tenants WHERE slug='sa') WHERE tenant_id IS NULL;
UPDATE public.ministry_access_codes    SET tenant_id = (SELECT id FROM public.tenants WHERE slug='sa') WHERE tenant_id IS NULL;
UPDATE public.ministry_access_requests SET tenant_id = (SELECT id FROM public.tenants WHERE slug='sa') WHERE tenant_id IS NULL;
UPDATE public.ministry_sessions        SET tenant_id = (SELECT id FROM public.tenants WHERE slug='sa') WHERE tenant_id IS NULL;
UPDATE public.ministry_ip_bans         SET tenant_id = (SELECT id FROM public.tenants WHERE slug='sa') WHERE tenant_id IS NULL;
UPDATE public.moderator_invite_codes   SET tenant_id = (SELECT id FROM public.tenants WHERE slug='sa') WHERE tenant_id IS NULL;
UPDATE public.lct_exams                SET tenant_id = (SELECT id FROM public.tenants WHERE slug='sa') WHERE tenant_id IS NULL;
UPDATE public.lct_exam_students        SET tenant_id = (SELECT id FROM public.tenants WHERE slug='sa') WHERE tenant_id IS NULL;
UPDATE public.lct_exam_locks           SET tenant_id = (SELECT id FROM public.tenants WHERE slug='sa') WHERE tenant_id IS NULL;

-- 5) Enforce NOT NULL now that every row has a tenant.
ALTER TABLE public.schools                 ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.curriculum_standards    ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.curriculum_versions     ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.ministry_access_codes   ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.ministry_access_requests ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.ministry_sessions       ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.ministry_ip_bans        ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.moderator_invite_codes  ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.lct_exams               ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.lct_exam_students       ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.lct_exam_locks          ALTER COLUMN tenant_id SET NOT NULL;

-- 6) Helper functions ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_tenant_id(uid uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.tenant_id
    FROM public.profiles p
    JOIN public.schools  s ON s.id = p.school_id
   WHERE p.id = uid
   LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.is_super_admin_user(uid) $$;

CREATE OR REPLACE FUNCTION public.has_tenant_role(uid uuid, tenant uuid, role_name text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_roles
     WHERE user_id = uid AND tenant_id = tenant AND role = role_name
  )
$$;

-- 7) Tenant boundary — RESTRICTIVE policies (AND-combined with existing) --
-- schools
CREATE POLICY "Tenant boundary on schools"
  ON public.schools AS RESTRICTIVE FOR ALL
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR tenant_id = public.get_user_tenant_id(auth.uid())
  );

-- curriculum_standards
CREATE POLICY "Tenant boundary on curriculum_standards"
  ON public.curriculum_standards AS RESTRICTIVE FOR ALL
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR tenant_id = public.get_user_tenant_id(auth.uid())
  );

-- curriculum_versions
CREATE POLICY "Tenant boundary on curriculum_versions"
  ON public.curriculum_versions AS RESTRICTIVE FOR ALL
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR tenant_id = public.get_user_tenant_id(auth.uid())
  );

-- lct_exams
CREATE POLICY "Tenant boundary on lct_exams"
  ON public.lct_exams AS RESTRICTIVE FOR ALL
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR tenant_id = public.get_user_tenant_id(auth.uid())
  );

-- lct_exam_students
CREATE POLICY "Tenant boundary on lct_exam_students"
  ON public.lct_exam_students AS RESTRICTIVE FOR ALL
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR tenant_id = public.get_user_tenant_id(auth.uid())
  );

-- lct_exam_locks
CREATE POLICY "Tenant boundary on lct_exam_locks"
  ON public.lct_exam_locks AS RESTRICTIVE FOR ALL
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR tenant_id = public.get_user_tenant_id(auth.uid())
  );

-- 8) Ministry RPCs — tenant-aware -----------------------------------------
CREATE OR REPLACE FUNCTION public.verify_ministry_code(
  p_code text,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_device_fingerprint text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_code_row RECORD;
  v_session_token text;
  v_banned boolean;
BEGIN
  IF p_ip_address IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM ministry_ip_bans WHERE ip_address = p_ip_address) INTO v_banned;
    IF v_banned THEN RETURN json_build_object('success', false, 'error', 'ACCESS DENIED', 'banned', true); END IF;
  END IF;

  IF p_device_fingerprint IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM ministry_ip_bans WHERE device_fingerprint = p_device_fingerprint) INTO v_banned;
    IF v_banned THEN RETURN json_build_object('success', false, 'error', 'ACCESS DENIED', 'banned', true); END IF;
  END IF;

  IF length(p_code) != 100 THEN
    RETURN json_build_object('success', false, 'error', 'Invalid access code');
  END IF;

  SELECT id, tenant_id
    INTO v_code_row
    FROM ministry_access_codes
   WHERE code_hash = encode(sha256(p_code::bytea), 'hex')
     AND is_active = true
     AND (expires_at IS NULL OR expires_at > now())
   LIMIT 1;

  IF v_code_row.id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid access code');
  END IF;

  v_session_token := encode(extensions.gen_random_bytes(64), 'hex');

  INSERT INTO ministry_access_requests (session_token, ip_address, user_agent, device_fingerprint, status, tenant_id)
  VALUES (v_session_token, p_ip_address, p_user_agent, p_device_fingerprint, 'pending', v_code_row.tenant_id);

  RETURN json_build_object(
    'success', true,
    'session_token', v_session_token,
    'tenant_id', v_code_row.tenant_id,
    'message', 'Awaiting super admin approval'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_ministry_dashboard_data(p_session_token text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_session RECORD;
  v_tenant uuid;
  v_schools json;
  v_profiles json;
  v_assignments json;
  v_submissions json;
  v_materials json;
  v_learning_profiles json;
BEGIN
  SELECT * INTO v_session FROM ministry_sessions
   WHERE session_token = p_session_token AND is_active = true AND expires_at > now();

  IF v_session IS NULL THEN
    RETURN json_build_object('error', 'Invalid or expired session');
  END IF;

  v_tenant := v_session.tenant_id;

  UPDATE ministry_sessions SET last_activity = now(), expires_at = now() + interval '15 minutes'
   WHERE id = v_session.id;

  SELECT json_agg(row_to_json(s)) INTO v_schools
    FROM (SELECT id, name, status FROM schools WHERE tenant_id = v_tenant) s;

  SELECT json_agg(row_to_json(p)) INTO v_profiles
    FROM (
      SELECT p.id, p.school_id, p.user_type, p.is_active, p.full_name, p.grade_level, p.status
        FROM profiles p JOIN schools s ON s.id = p.school_id
       WHERE p.is_active = true AND s.tenant_id = v_tenant
    ) p;

  SELECT json_agg(row_to_json(a)) INTO v_assignments
    FROM (
      SELECT a.id, a.school_id FROM assignments a
       JOIN schools s ON s.id = a.school_id
       WHERE s.tenant_id = v_tenant
    ) a;

  SELECT json_agg(row_to_json(sub)) INTO v_submissions
    FROM (
      SELECT sub.id, sub.assignment_id
        FROM assignment_submissions sub
        JOIN assignments a ON a.id = sub.assignment_id
        JOIN schools s ON s.id = a.school_id
       WHERE s.tenant_id = v_tenant
    ) sub;

  SELECT json_agg(row_to_json(m)) INTO v_materials
    FROM (
      SELECT m.id, m.school_id FROM course_materials m
       JOIN schools s ON s.id = m.school_id
       WHERE s.tenant_id = v_tenant
    ) m;

  SELECT json_agg(row_to_json(lp)) INTO v_learning_profiles
    FROM (
      SELECT lp.user_id, lp.subject, lp.difficulty_level, lp.recent_accuracy,
             lp.total_questions_answered, lp.correct_answers
        FROM student_learning_profiles lp
        JOIN profiles pr ON pr.id = lp.user_id
        JOIN schools s   ON s.id = pr.school_id
       WHERE s.tenant_id = v_tenant
    ) lp;

  RETURN json_build_object(
    'success', true,
    'tenant_id', v_tenant,
    'schools', COALESCE(v_schools, '[]'::json),
    'profiles', COALESCE(v_profiles, '[]'::json),
    'assignments', COALESCE(v_assignments, '[]'::json),
    'submissions', COALESCE(v_submissions, '[]'::json),
    'materials', COALESCE(v_materials, '[]'::json),
    'learningProfiles', COALESCE(v_learning_profiles, '[]'::json)
  );
END;
$$;

-- 9) Tenant lifecycle RPCs -------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_active_tenants()
RETURNS TABLE (
  id uuid, slug text, country_name text, country_code text, ministry_name text,
  default_language text, supported_languages text[]
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, slug, country_name, country_code, ministry_name,
         default_language, supported_languages
    FROM public.tenants
   WHERE status = 'active' AND is_visible = true
   ORDER BY country_name
$$;

CREATE OR REPLACE FUNCTION public.provision_tenant(payload jsonb)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.is_super_admin_user(auth.uid()) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  INSERT INTO public.tenants (
    slug, country_name, country_code, ministry_name,
    default_language, supported_languages,
    curriculum_framework, grading_system, academic_calendar, ai_config,
    status, is_visible
  ) VALUES (
    lower(payload->>'slug'),
    payload->>'country_name',
    upper(payload->>'country_code'),
    payload->>'ministry_name',
    COALESCE(payload->>'default_language', 'en'),
    COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(payload->'supported_languages')),
      ARRAY['en']::text[]
    ),
    payload->>'curriculum_framework',
    COALESCE(payload->'grading_system',    '{}'::jsonb),
    COALESCE(payload->'academic_calendar', '{}'::jsonb),
    COALESCE(payload->'ai_config',         '{}'::jsonb),
    'provisioning',
    false
  )
  RETURNING id INTO v_id;

  RETURN json_build_object('success', true, 'tenant_id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_tenant(p_tenant_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin_user(auth.uid()) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  UPDATE public.tenants
     SET status = 'active', is_visible = true, updated_at = now()
   WHERE id = p_tenant_id;

  RETURN json_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.suspend_tenant(p_tenant_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin_user(auth.uid()) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  UPDATE public.tenants
     SET status = 'suspended', is_visible = false, updated_at = now()
   WHERE id = p_tenant_id;

  RETURN json_build_object('success', true);
END;
$$;

COMMENT ON TABLE public.tenants IS
  'Country-level tenant. One row per country adopting Lumina. All schools, ministry data, and curriculum belong to exactly one tenant.';
