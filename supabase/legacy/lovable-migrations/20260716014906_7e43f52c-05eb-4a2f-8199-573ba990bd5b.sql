
-- ============================================================
-- MC3–MC11: Ministry Control Center — Domain layer
-- ============================================================

-- ---------- Helper: caller has tenant governance access ----------
CREATE OR REPLACE FUNCTION public.mc_can_govern_tenant(p_tenant uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin_caller() OR EXISTS (
    SELECT 1 FROM public.ministry_role_assignments
    WHERE user_id = auth.uid() AND tenant_id = p_tenant
  );
$$;
GRANT EXECUTE ON FUNCTION public.mc_can_govern_tenant(uuid) TO authenticated, anon;

-- ============================================================
-- MC3: Curriculum
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mc_curriculum_version_defs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  label text NOT NULL,
  effective_from date,
  effective_to date,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','retired')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, label)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mc_curriculum_version_defs TO authenticated;
GRANT ALL ON public.mc_curriculum_version_defs TO service_role;
ALTER TABLE public.mc_curriculum_version_defs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mc_cvd tenant read" ON public.mc_curriculum_version_defs
  FOR SELECT USING (public.mc_can_govern_tenant(tenant_id));
CREATE POLICY "mc_cvd super admin write" ON public.mc_curriculum_version_defs
  FOR ALL USING (public.is_super_admin_caller()) WITH CHECK (public.is_super_admin_caller());

CREATE TABLE IF NOT EXISTS public.mc_curriculum_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  subject_code text NOT NULL,
  name text NOT NULL,
  description text,
  applies_grades int[] NOT NULL DEFAULT '{}'::int[],
  version_id uuid REFERENCES public.mc_curriculum_version_defs(id) ON DELETE SET NULL,
  language text,
  learning_standards jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),
  is_official boolean NOT NULL DEFAULT true,
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, subject_code)
);
CREATE INDEX IF NOT EXISTS idx_mc_cs_tenant ON public.mc_curriculum_subjects(tenant_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mc_curriculum_subjects TO authenticated;
GRANT ALL ON public.mc_curriculum_subjects TO service_role;
ALTER TABLE public.mc_curriculum_subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mc_cs tenant read" ON public.mc_curriculum_subjects
  FOR SELECT USING (public.mc_can_govern_tenant(tenant_id));
CREATE POLICY "mc_cs super admin write" ON public.mc_curriculum_subjects
  FOR ALL USING (public.is_super_admin_caller()) WITH CHECK (public.is_super_admin_caller());

-- ============================================================
-- MC4: Educational Policy
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mc_educational_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  policy_key text NOT NULL, -- e.g. grading.system, calendar.academic, promotion.rules, attendance.min
  title text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  allows_school_override boolean NOT NULL DEFAULT false,
  effective_from date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, policy_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mc_educational_policies TO authenticated;
GRANT ALL ON public.mc_educational_policies TO service_role;
ALTER TABLE public.mc_educational_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mc_ep tenant read" ON public.mc_educational_policies
  FOR SELECT USING (public.mc_can_govern_tenant(tenant_id));
CREATE POLICY "mc_ep super admin write" ON public.mc_educational_policies
  FOR ALL USING (public.is_super_admin_caller()) WITH CHECK (public.is_super_admin_caller());

-- ============================================================
-- MC5: School Lifecycle (extends existing schools table)
-- ============================================================
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS governance_status text
  CHECK (governance_status IN ('operational','suspended','archived'));

CREATE TABLE IF NOT EXISTS public.mc_school_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  previous_status text,
  new_status text NOT NULL,
  reason text,
  actor_label text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mc_sle_school ON public.mc_school_lifecycle_events(school_id, created_at DESC);
GRANT SELECT, INSERT ON public.mc_school_lifecycle_events TO authenticated;
GRANT ALL ON public.mc_school_lifecycle_events TO service_role;
ALTER TABLE public.mc_school_lifecycle_events ENABLE ROW LEVEL SECURITY;
REVOKE UPDATE, DELETE ON public.mc_school_lifecycle_events FROM authenticated, anon, public;
CREATE POLICY "mc_sle tenant read" ON public.mc_school_lifecycle_events
  FOR SELECT USING (public.mc_can_govern_tenant(tenant_id));
CREATE POLICY "mc_sle insert" ON public.mc_school_lifecycle_events
  FOR INSERT WITH CHECK (true);

-- ============================================================
-- MC7: Regional Structure
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mc_regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  kind text NOT NULL DEFAULT 'region' CHECK (kind IN ('region','district','zone')),
  parent_id uuid REFERENCES public.mc_regions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name, kind)
);
CREATE INDEX IF NOT EXISTS idx_mc_regions_tenant ON public.mc_regions(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mc_regions TO authenticated;
GRANT ALL ON public.mc_regions TO service_role;
ALTER TABLE public.mc_regions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mc_regions tenant read" ON public.mc_regions
  FOR SELECT USING (public.mc_can_govern_tenant(tenant_id));
CREATE POLICY "mc_regions super admin write" ON public.mc_regions
  FOR ALL USING (public.is_super_admin_caller()) WITH CHECK (public.is_super_admin_caller());

CREATE TABLE IF NOT EXISTS public.mc_school_region_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  region_id uuid NOT NULL REFERENCES public.mc_regions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, region_id)
);
GRANT SELECT, INSERT, DELETE ON public.mc_school_region_assignments TO authenticated;
GRANT ALL ON public.mc_school_region_assignments TO service_role;
ALTER TABLE public.mc_school_region_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mc_sra tenant read" ON public.mc_school_region_assignments
  FOR SELECT USING (public.mc_can_govern_tenant(tenant_id));
CREATE POLICY "mc_sra super admin write" ON public.mc_school_region_assignments
  FOR ALL USING (public.is_super_admin_caller()) WITH CHECK (public.is_super_admin_caller());

-- ============================================================
-- MC8: Lumina Configuration (presentation only, never reasoning)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mc_lumina_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE UNIQUE,
  terminology jsonb NOT NULL DEFAULT '{}'::jsonb,
  explanation_style jsonb NOT NULL DEFAULT '{}'::jsonb,
  vocabulary jsonb NOT NULL DEFAULT '{}'::jsonb,
  pacing jsonb NOT NULL DEFAULT '{}'::jsonb,
  accessibility jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.mc_lumina_config TO authenticated;
GRANT ALL ON public.mc_lumina_config TO service_role;
ALTER TABLE public.mc_lumina_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mc_lc tenant read" ON public.mc_lumina_config
  FOR SELECT USING (public.mc_can_govern_tenant(tenant_id));
CREATE POLICY "mc_lc super admin write" ON public.mc_lumina_config
  FOR ALL USING (public.is_super_admin_caller()) WITH CHECK (public.is_super_admin_caller());

-- ============================================================
-- MC9: Feature Management — tri-state
-- ============================================================
ALTER TABLE public.tenant_feature_flags ADD COLUMN IF NOT EXISTS mode text
  DEFAULT 'optional' CHECK (mode IN ('disabled','optional','required'));

-- ============================================================
-- updated_at triggers
-- ============================================================
DROP TRIGGER IF EXISTS trg_mc_cvd_touch ON public.mc_curriculum_version_defs;
CREATE TRIGGER trg_mc_cvd_touch BEFORE UPDATE ON public.mc_curriculum_version_defs
  FOR EACH ROW EXECUTE FUNCTION public.mc_touch_updated_at();
DROP TRIGGER IF EXISTS trg_mc_cs_touch ON public.mc_curriculum_subjects;
CREATE TRIGGER trg_mc_cs_touch BEFORE UPDATE ON public.mc_curriculum_subjects
  FOR EACH ROW EXECUTE FUNCTION public.mc_touch_updated_at();
DROP TRIGGER IF EXISTS trg_mc_ep_touch ON public.mc_educational_policies;
CREATE TRIGGER trg_mc_ep_touch BEFORE UPDATE ON public.mc_educational_policies
  FOR EACH ROW EXECUTE FUNCTION public.mc_touch_updated_at();
DROP TRIGGER IF EXISTS trg_mc_regions_touch ON public.mc_regions;
CREATE TRIGGER trg_mc_regions_touch BEFORE UPDATE ON public.mc_regions
  FOR EACH ROW EXECUTE FUNCTION public.mc_touch_updated_at();
DROP TRIGGER IF EXISTS trg_mc_lc_touch ON public.mc_lumina_config;
CREATE TRIGGER trg_mc_lc_touch BEFORE UPDATE ON public.mc_lumina_config
  FOR EACH ROW EXECUTE FUNCTION public.mc_touch_updated_at();

-- ============================================================
-- Appliers (each returns jsonb, invoked dynamically by publish_change_request)
-- ============================================================

-- MC3: curriculum.subject   payload = { subject_code, name, description?, applies_grades:int[], version_id?, language?, action?: 'upsert'|'retire' }
CREATE OR REPLACE FUNCTION public.apply_curriculum_subject_change(p_request_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_req RECORD; v_id uuid; v_action text;
BEGIN
  SELECT * INTO v_req FROM public.ministry_change_requests WHERE id = p_request_id;
  v_action := COALESCE(p_payload->>'action', 'upsert');
  IF v_action = 'retire' THEN
    UPDATE public.mc_curriculum_subjects
       SET status='retired', retired_at=now()
     WHERE tenant_id = v_req.tenant_id AND subject_code = p_payload->>'subject_code'
     RETURNING id INTO v_id;
    RETURN jsonb_build_object('applied', true, 'action','retire', 'id', v_id);
  END IF;
  INSERT INTO public.mc_curriculum_subjects
    (tenant_id, subject_code, name, description, applies_grades, version_id, language, learning_standards, is_official)
  VALUES (
    v_req.tenant_id,
    p_payload->>'subject_code',
    p_payload->>'name',
    p_payload->>'description',
    COALESCE((SELECT array_agg((x)::int) FROM jsonb_array_elements_text(COALESCE(p_payload->'applies_grades','[]'::jsonb)) x), '{}'::int[]),
    NULLIF(p_payload->>'version_id','')::uuid,
    p_payload->>'language',
    COALESCE(p_payload->'learning_standards','[]'::jsonb),
    true
  )
  ON CONFLICT (tenant_id, subject_code) DO UPDATE SET
    name=EXCLUDED.name,
    description=EXCLUDED.description,
    applies_grades=EXCLUDED.applies_grades,
    version_id=EXCLUDED.version_id,
    language=EXCLUDED.language,
    learning_standards=EXCLUDED.learning_standards,
    status='active',
    retired_at=NULL,
    updated_at=now()
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('applied', true, 'action','upsert', 'id', v_id);
END; $$;

-- MC3: curriculum.version   payload = { label, effective_from?, effective_to?, status?, notes? }
CREATE OR REPLACE FUNCTION public.apply_curriculum_version_change(p_request_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_req RECORD; v_id uuid;
BEGIN
  SELECT * INTO v_req FROM public.ministry_change_requests WHERE id = p_request_id;
  INSERT INTO public.mc_curriculum_version_defs (tenant_id, label, effective_from, effective_to, status, notes)
  VALUES (
    v_req.tenant_id,
    p_payload->>'label',
    NULLIF(p_payload->>'effective_from','')::date,
    NULLIF(p_payload->>'effective_to','')::date,
    COALESCE(p_payload->>'status','active'),
    p_payload->>'notes'
  )
  ON CONFLICT (tenant_id, label) DO UPDATE SET
    effective_from=EXCLUDED.effective_from,
    effective_to=EXCLUDED.effective_to,
    status=EXCLUDED.status,
    notes=EXCLUDED.notes,
    updated_at=now()
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('applied', true, 'id', v_id);
END; $$;

-- MC4: policy.set   payload = { policy_key, title, config, allows_school_override?, effective_from?, status? }
CREATE OR REPLACE FUNCTION public.apply_educational_policy_change(p_request_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_req RECORD; v_id uuid;
BEGIN
  SELECT * INTO v_req FROM public.ministry_change_requests WHERE id = p_request_id;
  INSERT INTO public.mc_educational_policies
    (tenant_id, policy_key, title, config, allows_school_override, effective_from, status)
  VALUES (
    v_req.tenant_id,
    p_payload->>'policy_key',
    p_payload->>'title',
    COALESCE(p_payload->'config','{}'::jsonb),
    COALESCE((p_payload->>'allows_school_override')::boolean, false),
    NULLIF(p_payload->>'effective_from','')::date,
    COALESCE(p_payload->>'status','active')
  )
  ON CONFLICT (tenant_id, policy_key) DO UPDATE SET
    title=EXCLUDED.title,
    config=EXCLUDED.config,
    allows_school_override=EXCLUDED.allows_school_override,
    effective_from=EXCLUDED.effective_from,
    status=EXCLUDED.status,
    updated_at=now()
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('applied', true, 'id', v_id);
END; $$;

-- MC5: school.lifecycle   payload = { school_id, new_status: operational|suspended|archived, reason? }
CREATE OR REPLACE FUNCTION public.apply_school_lifecycle_change(p_request_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_req RECORD; v_school RECORD; v_new text;
BEGIN
  SELECT * INTO v_req FROM public.ministry_change_requests WHERE id = p_request_id;
  v_new := p_payload->>'new_status';
  IF v_new NOT IN ('operational','suspended','archived') THEN
    RAISE EXCEPTION 'Invalid school status %', v_new;
  END IF;
  SELECT * INTO v_school FROM public.schools WHERE id = (p_payload->>'school_id')::uuid AND tenant_id = v_req.tenant_id;
  IF v_school IS NULL THEN RAISE EXCEPTION 'School not found in tenant'; END IF;

  INSERT INTO public.mc_school_lifecycle_events (tenant_id, school_id, previous_status, new_status, reason, actor_label)
  VALUES (v_req.tenant_id, v_school.id, v_school.governance_status, v_new, p_payload->>'reason', v_req.publisher_label);

  UPDATE public.schools SET governance_status = v_new, updated_at = now() WHERE id = v_school.id;
  RETURN jsonb_build_object('applied', true, 'school_id', v_school.id, 'new_status', v_new);
END; $$;

-- MC5 / MC7: school.region_assignment   payload = { school_id, region_id, action?: 'assign'|'unassign' }
CREATE OR REPLACE FUNCTION public.apply_school_region_assignment(p_request_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_req RECORD; v_action text;
BEGIN
  SELECT * INTO v_req FROM public.ministry_change_requests WHERE id = p_request_id;
  v_action := COALESCE(p_payload->>'action','assign');
  IF v_action = 'unassign' THEN
    DELETE FROM public.mc_school_region_assignments
     WHERE school_id = (p_payload->>'school_id')::uuid AND region_id = (p_payload->>'region_id')::uuid;
    RETURN jsonb_build_object('applied', true, 'action','unassign');
  END IF;
  INSERT INTO public.mc_school_region_assignments (tenant_id, school_id, region_id)
  VALUES (v_req.tenant_id, (p_payload->>'school_id')::uuid, (p_payload->>'region_id')::uuid)
  ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('applied', true, 'action','assign');
END; $$;

-- MC6: user.role_assign   payload = { user_id, role: ministry_role, action?: 'assign'|'revoke' }
CREATE OR REPLACE FUNCTION public.apply_user_role_change(p_request_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_req RECORD; v_id uuid; v_action text; v_role public.ministry_role;
BEGIN
  SELECT * INTO v_req FROM public.ministry_change_requests WHERE id = p_request_id;
  v_action := COALESCE(p_payload->>'action','assign');
  v_role := (p_payload->>'role')::public.ministry_role;
  IF v_action = 'revoke' THEN
    DELETE FROM public.ministry_role_assignments
     WHERE tenant_id = v_req.tenant_id
       AND user_id = (p_payload->>'user_id')::uuid
       AND role = v_role;
    RETURN jsonb_build_object('applied', true, 'action','revoke');
  END IF;
  INSERT INTO public.ministry_role_assignments (tenant_id, user_id, role, assigned_by)
  VALUES (v_req.tenant_id, (p_payload->>'user_id')::uuid, v_role, v_req.publisher_id)
  ON CONFLICT (tenant_id, user_id, role) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('applied', true, 'action','assign', 'id', v_id);
END; $$;

-- MC7: region.upsert   payload = { name, kind, code?, parent_id?, id? }
CREATE OR REPLACE FUNCTION public.apply_region_change(p_request_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_req RECORD; v_id uuid;
BEGIN
  SELECT * INTO v_req FROM public.ministry_change_requests WHERE id = p_request_id;
  IF p_payload ? 'id' AND (p_payload->>'id') <> '' THEN
    UPDATE public.mc_regions
       SET name = p_payload->>'name',
           kind = COALESCE(p_payload->>'kind', kind),
           code = p_payload->>'code',
           parent_id = NULLIF(p_payload->>'parent_id','')::uuid,
           updated_at = now()
     WHERE id = (p_payload->>'id')::uuid AND tenant_id = v_req.tenant_id
     RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.mc_regions (tenant_id, name, kind, code, parent_id)
    VALUES (v_req.tenant_id, p_payload->>'name',
            COALESCE(p_payload->>'kind','region'), p_payload->>'code',
            NULLIF(p_payload->>'parent_id','')::uuid)
    ON CONFLICT (tenant_id, name, kind) DO UPDATE SET code = EXCLUDED.code, updated_at = now()
    RETURNING id INTO v_id;
  END IF;
  RETURN jsonb_build_object('applied', true, 'id', v_id);
END; $$;

-- MC8: lumina.config   payload = { terminology?, explanation_style?, vocabulary?, pacing?, accessibility? }
CREATE OR REPLACE FUNCTION public.apply_lumina_config_change(p_request_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_req RECORD; v_id uuid;
BEGIN
  SELECT * INTO v_req FROM public.ministry_change_requests WHERE id = p_request_id;
  INSERT INTO public.mc_lumina_config
    (tenant_id, terminology, explanation_style, vocabulary, pacing, accessibility)
  VALUES (
    v_req.tenant_id,
    COALESCE(p_payload->'terminology','{}'::jsonb),
    COALESCE(p_payload->'explanation_style','{}'::jsonb),
    COALESCE(p_payload->'vocabulary','{}'::jsonb),
    COALESCE(p_payload->'pacing','{}'::jsonb),
    COALESCE(p_payload->'accessibility','{}'::jsonb)
  )
  ON CONFLICT (tenant_id) DO UPDATE SET
    terminology = COALESCE(EXCLUDED.terminology, mc_lumina_config.terminology),
    explanation_style = COALESCE(EXCLUDED.explanation_style, mc_lumina_config.explanation_style),
    vocabulary = COALESCE(EXCLUDED.vocabulary, mc_lumina_config.vocabulary),
    pacing = COALESCE(EXCLUDED.pacing, mc_lumina_config.pacing),
    accessibility = COALESCE(EXCLUDED.accessibility, mc_lumina_config.accessibility),
    updated_at = now()
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('applied', true, 'id', v_id);
END; $$;

-- MC9: feature.mode   payload = { flag_key, mode: disabled|optional|required, description? }
CREATE OR REPLACE FUNCTION public.apply_feature_mode_change(p_request_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_req RECORD; v_id uuid; v_mode text;
BEGIN
  SELECT * INTO v_req FROM public.ministry_change_requests WHERE id = p_request_id;
  v_mode := COALESCE(p_payload->>'mode','optional');
  IF v_mode NOT IN ('disabled','optional','required') THEN
    RAISE EXCEPTION 'Invalid feature mode %', v_mode;
  END IF;
  INSERT INTO public.tenant_feature_flags (tenant_id, flag_key, enabled, mode, description)
  VALUES (
    v_req.tenant_id,
    p_payload->>'flag_key',
    (v_mode <> 'disabled'),
    v_mode,
    p_payload->>'description'
  )
  ON CONFLICT (tenant_id, flag_key) DO UPDATE SET
    enabled = (v_mode <> 'disabled'),
    mode = v_mode,
    description = COALESCE(EXCLUDED.description, tenant_feature_flags.description),
    updated_at = now()
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('applied', true, 'id', v_id, 'mode', v_mode);
END; $$;

-- MC10: communication.notice   payload = { title, body, severity? }
CREATE OR REPLACE FUNCTION public.apply_national_notice_change(p_request_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_req RECORD; v_id uuid;
BEGIN
  SELECT * INTO v_req FROM public.ministry_change_requests WHERE id = p_request_id;
  INSERT INTO public.ministry_announcements
    (tenant_id, title, body, severity, published, published_at, author_id)
  VALUES (
    v_req.tenant_id,
    p_payload->>'title',
    p_payload->>'body',
    COALESCE(p_payload->>'severity','info'),
    true,
    now(),
    v_req.publisher_id
  )
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('applied', true, 'announcement_id', v_id);
END; $$;

-- ============================================================
-- Register appliers
-- ============================================================
INSERT INTO public.ministry_change_appliers (entity_type, applier_function, description, registered_by_phase) VALUES
  ('curriculum.subject','apply_curriculum_subject_change','Upsert or retire an official ministry subject.','MC3'),
  ('curriculum.version','apply_curriculum_version_change','Create or update a named curriculum version.','MC3'),
  ('policy.set','apply_educational_policy_change','Set or update a national educational policy (grading, calendar, promotion, etc.).','MC4'),
  ('school.lifecycle','apply_school_lifecycle_change','Transition a school between operational, suspended, and archived.','MC5'),
  ('school.region_assignment','apply_school_region_assignment','Assign or unassign a school from a region.','MC5'),
  ('user.role_assign','apply_user_role_change','Assign or revoke a ministry role for a named user.','MC6'),
  ('region.upsert','apply_region_change','Create or update a region, district, or educational zone.','MC7'),
  ('lumina.config','apply_lumina_config_change','Update tenant Lumina presentation config (terminology, style, pacing, accessibility).','MC8'),
  ('feature.mode','apply_feature_mode_change','Set feature availability to disabled, optional, or required.','MC9'),
  ('communication.notice','apply_national_notice_change','Publish a national ministry notice.','MC10')
ON CONFLICT (entity_type) DO UPDATE SET
  applier_function = EXCLUDED.applier_function,
  description = EXCLUDED.description,
  registered_by_phase = EXCLUDED.registered_by_phase;

-- ============================================================
-- MC11: Ministry sessions read RPC (Security & Sessions)
-- ============================================================
CREATE OR REPLACE FUNCTION public.list_ministry_sessions(
  p_session_token text DEFAULT NULL,
  p_limit integer DEFAULT 100
) RETURNS TABLE(
  id uuid,
  tenant_id uuid,
  ip_address text,
  is_active boolean,
  created_at timestamptz,
  last_activity timestamptz,
  expires_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid;
BEGIN
  v_tenant := public.ministry_session_tenant(p_session_token);
  IF v_tenant IS NULL AND NOT public.is_super_admin_caller() THEN RETURN; END IF;
  RETURN QUERY
    SELECT s.id, s.tenant_id, s.ip_address, s.is_active,
           s.created_at, s.last_activity, s.expires_at
    FROM public.ministry_sessions s
    WHERE (v_tenant IS NULL OR s.tenant_id = v_tenant)
    ORDER BY s.created_at DESC
    LIMIT p_limit;
END; $$;
GRANT EXECUTE ON FUNCTION public.list_ministry_sessions(text, integer) TO authenticated, anon;

-- ============================================================
-- MC3–MC10 read RPCs (session-token aware)
-- ============================================================
CREATE OR REPLACE FUNCTION public.list_mc_curriculum_subjects(p_session_token text DEFAULT NULL)
RETURNS SETOF public.mc_curriculum_subjects LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid;
BEGIN
  v_tenant := public.ministry_session_tenant(p_session_token);
  IF v_tenant IS NULL AND NOT public.is_super_admin_caller() THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM public.mc_curriculum_subjects
   WHERE (v_tenant IS NULL OR tenant_id = v_tenant) ORDER BY subject_code;
END; $$;

CREATE OR REPLACE FUNCTION public.list_mc_curriculum_versions(p_session_token text DEFAULT NULL)
RETURNS SETOF public.mc_curriculum_version_defs LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid;
BEGIN
  v_tenant := public.ministry_session_tenant(p_session_token);
  IF v_tenant IS NULL AND NOT public.is_super_admin_caller() THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM public.mc_curriculum_version_defs
   WHERE (v_tenant IS NULL OR tenant_id = v_tenant) ORDER BY created_at DESC;
END; $$;

CREATE OR REPLACE FUNCTION public.list_mc_policies(p_session_token text DEFAULT NULL)
RETURNS SETOF public.mc_educational_policies LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid;
BEGIN
  v_tenant := public.ministry_session_tenant(p_session_token);
  IF v_tenant IS NULL AND NOT public.is_super_admin_caller() THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM public.mc_educational_policies
   WHERE (v_tenant IS NULL OR tenant_id = v_tenant) ORDER BY policy_key;
END; $$;

CREATE OR REPLACE FUNCTION public.list_mc_regions(p_session_token text DEFAULT NULL)
RETURNS SETOF public.mc_regions LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid;
BEGIN
  v_tenant := public.ministry_session_tenant(p_session_token);
  IF v_tenant IS NULL AND NOT public.is_super_admin_caller() THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM public.mc_regions
   WHERE (v_tenant IS NULL OR tenant_id = v_tenant) ORDER BY kind, name;
END; $$;

CREATE OR REPLACE FUNCTION public.list_mc_lumina_config(p_session_token text DEFAULT NULL)
RETURNS SETOF public.mc_lumina_config LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid;
BEGIN
  v_tenant := public.ministry_session_tenant(p_session_token);
  IF v_tenant IS NULL AND NOT public.is_super_admin_caller() THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM public.mc_lumina_config
   WHERE (v_tenant IS NULL OR tenant_id = v_tenant);
END; $$;

CREATE OR REPLACE FUNCTION public.list_mc_schools(p_session_token text DEFAULT NULL)
RETURNS TABLE(id uuid, name text, code text, status text, governance_status text, tenant_id uuid, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid;
BEGIN
  v_tenant := public.ministry_session_tenant(p_session_token);
  IF v_tenant IS NULL AND NOT public.is_super_admin_caller() THEN RETURN; END IF;
  RETURN QUERY SELECT s.id, s.name, s.code, s.status, s.governance_status, s.tenant_id, s.created_at
    FROM public.schools s
    WHERE (v_tenant IS NULL OR s.tenant_id = v_tenant)
    ORDER BY s.name;
END; $$;

CREATE OR REPLACE FUNCTION public.list_mc_feature_flags(p_session_token text DEFAULT NULL)
RETURNS SETOF public.tenant_feature_flags LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid;
BEGIN
  v_tenant := public.ministry_session_tenant(p_session_token);
  IF v_tenant IS NULL AND NOT public.is_super_admin_caller() THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM public.tenant_feature_flags
   WHERE (v_tenant IS NULL OR tenant_id = v_tenant) ORDER BY flag_key;
END; $$;

CREATE OR REPLACE FUNCTION public.list_mc_notices(p_session_token text DEFAULT NULL)
RETURNS SETOF public.ministry_announcements LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid;
BEGIN
  v_tenant := public.ministry_session_tenant(p_session_token);
  IF v_tenant IS NULL AND NOT public.is_super_admin_caller() THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM public.ministry_announcements
   WHERE (v_tenant IS NULL OR tenant_id = v_tenant) ORDER BY created_at DESC LIMIT 100;
END; $$;

GRANT EXECUTE ON FUNCTION public.list_mc_curriculum_subjects(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.list_mc_curriculum_versions(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.list_mc_policies(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.list_mc_regions(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.list_mc_lumina_config(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.list_mc_schools(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.list_mc_feature_flags(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.list_mc_notices(text) TO authenticated, anon;
