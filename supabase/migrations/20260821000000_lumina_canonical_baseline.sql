-- LUMINA canonical baseline for fresh user-owned Supabase environments.
-- Truthful provenance: reviewed rebaseline from repository evidence; not recovered deployment history.
-- The 128 Lovable-era files are non-executable evidence under supabase/legacy/lovable-migrations.

BEGIN;
SET LOCAL statement_timeout = '120s';
SET LOCAL lock_timeout = '10s';

-- Canonical Lumina schema source: schemas and extensions
-- Fresh owned backends only. This is a reviewed rebaseline, not recovered history.

CREATE SCHEMA IF NOT EXISTS public;
CREATE SCHEMA IF NOT EXISTS extensions;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

SET check_function_bodies = false;

-- Canonical Lumina schema source: types
-- Derived from reviewed repository evidence; not historical deployment provenance.

--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'teacher',
    'student'
);


--

--
-- Name: extension_blueprint_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.extension_blueprint_status AS ENUM (
    'draft',
    'preview',
    'pushed',
    'approved',
    'rejected',
    'deployed',
    'rolled_back'
);


--

--
-- Name: extension_request_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.extension_request_status AS ENUM (
    'in_review',
    'approved',
    'rejected',
    'withdrawn'
);


--

--
-- Name: mi_event_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.mi_event_type AS ENUM (
    'homework_submission',
    'exam_submission',
    'material_view',
    'lesson_event',
    'tutor_interaction',
    'lecture_generated',
    'material_uploaded'
);


--

--
-- Name: mi_insight_scope; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.mi_insight_scope AS ENUM (
    'national',
    'regional',
    'school'
);


--

--
-- Name: mi_insight_severity; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.mi_insight_severity AS ENUM (
    'info',
    'watch',
    'concern',
    'urgent'
);


--

--
-- Name: ministry_change_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ministry_change_status AS ENUM (
    'draft',
    'in_review',
    'approved',
    'published',
    'rejected',
    'withdrawn'
);


--

--
-- Name: ministry_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ministry_role AS ENUM (
    'minister',
    'deputy_minister',
    'curriculum_officer',
    'regional_supervisor',
    'ministry_admin',
    'viewer'
);


--

-- Canonical Lumina schema source: server-bound platform authority

CREATE TYPE public.platform_role AS ENUM ('super_admin');

CREATE TABLE public.platform_bootstrap_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  is_open boolean NOT NULL DEFAULT true,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  closed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT platform_bootstrap_once_closed CHECK (
    (is_open AND closed_at IS NULL AND closed_by IS NULL)
    OR (NOT is_open AND closed_at IS NOT NULL AND closed_by IS NOT NULL)
  )
);

INSERT INTO public.platform_bootstrap_state (singleton, is_open) VALUES (true, true);

CREATE TABLE public.platform_role_assignments (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  role public.platform_role NOT NULL,
  active boolean NOT NULL DEFAULT true,
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  PRIMARY KEY (user_id, role),
  CONSTRAINT platform_role_assignment_state CHECK (
    (active AND revoked_at IS NULL AND revoked_by IS NULL)
    OR (NOT active AND revoked_at IS NOT NULL AND revoked_by IS NOT NULL)
  )
);

CREATE INDEX platform_role_assignments_active_role_idx
  ON public.platform_role_assignments (role, user_id)
  WHERE active;

CREATE TABLE public.platform_audit_log (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  event_type text NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  school_id uuid,
  request_id uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_audit_event_type_nonempty CHECK (btrim(event_type) <> ''),
  CONSTRAINT platform_audit_detail_object CHECK (jsonb_typeof(detail) = 'object')
);

CREATE INDEX platform_audit_log_occurred_at_idx
  ON public.platform_audit_log (occurred_at DESC);
CREATE INDEX platform_audit_log_actor_idx
  ON public.platform_audit_log (actor_user_id, occurred_at DESC);
CREATE INDEX platform_audit_log_school_idx
  ON public.platform_audit_log (school_id, occurred_at DESC)
  WHERE school_id IS NOT NULL;

ALTER TABLE public.platform_bootstrap_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_audit_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.platform_bootstrap_state FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.platform_role_assignments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.platform_audit_log FROM PUBLIC, anon, authenticated;

-- Canonical Lumina schema source: retained domain functions
-- Derived from reviewed repository evidence; not historical deployment provenance.

--
-- Name: _slugify_name(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._slugify_name(p text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT trim(both '_' from lower(regexp_replace(coalesce(p,''), '[^a-zA-Z0-9]+', '_', 'g')));
$$;


--

--
-- Name: activate_tenant(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.activate_tenant(p_tenant_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
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


--

--
-- Name: apply_curriculum_subject_change(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_curriculum_subject_change(p_request_id uuid, p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
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


--

--
-- Name: apply_curriculum_version_change(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_curriculum_version_change(p_request_id uuid, p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
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


--

--
-- Name: apply_educational_policy_change(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_educational_policy_change(p_request_id uuid, p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
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


--

--
-- Name: apply_feature_mode_change(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_feature_mode_change(p_request_id uuid, p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
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


--

--
-- Name: apply_lumina_config_change(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_lumina_config_change(p_request_id uuid, p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
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


--

--
-- Name: apply_national_notice_change(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_national_notice_change(p_request_id uuid, p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
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


--

--
-- Name: apply_region_change(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_region_change(p_request_id uuid, p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
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


--

--
-- Name: apply_school_lifecycle_change(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_school_lifecycle_change(p_request_id uuid, p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
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


--

--
-- Name: apply_school_region_assignment(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_school_region_assignment(p_request_id uuid, p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
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


--

--
-- Name: apply_test_change(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_test_change(p_request_id uuid, p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
BEGIN
  RETURN jsonb_build_object('applied', true, 'entity_type', 'mc.test',
    'echo', p_payload, 'at', now());
END; $$;


--

--
-- Name: apply_user_role_change(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_user_role_change(p_request_id uuid, p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
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


--

--
-- Name: approve_moderator_request(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_moderator_request(p_request_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE
  v_request RECORD;
  v_caller_email text;
  v_user_id uuid;
BEGIN
  SELECT email INTO v_caller_email FROM auth.users WHERE id = auth.uid();
  IF NOT public.is_super_admin() THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO v_request FROM moderator_requests WHERE id = p_request_id AND status = 'pending';
  IF v_request IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Request not found');
  END IF;

  v_user_id := v_request.user_id;

  -- Create profile
  IF v_user_id IS NOT NULL THEN
    INSERT INTO profiles (id, full_name, email, user_type, status, is_active)
    VALUES (v_user_id, v_request.name, v_request.email, 'moderator', 'approved', true)
    ON CONFLICT (id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      user_type = 'moderator',
      status = 'approved',
      is_active = true;
  ELSE
    INSERT INTO profiles (id, full_name, email, user_type, status, is_active)
    VALUES (gen_random_uuid(), v_request.name, v_request.email, 'moderator', 'approved', true);
  END IF;

  UPDATE moderator_requests SET status = 'approved', updated_at = now() WHERE id = p_request_id;
  UPDATE moderator_invite_codes SET used = true, used_by = v_user_id WHERE id = v_request.code_id;

  RETURN json_build_object('success', true);
END;
$$;


--

--
-- Name: approve_moderator_request(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_moderator_request(p_request_id uuid, p_session_token text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE
  v_request RECORD;
  v_caller_email text;
  v_user_id uuid;
  v_authorized boolean := false;
BEGIN
  -- Auth path 1: ministry session token
  IF p_session_token IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM ministry_sessions
      WHERE session_token = p_session_token AND is_active = true AND expires_at > now()
    ) THEN
      v_authorized := true;
    END IF;
  END IF;

  -- Auth path 2: direct Supabase auth (super admin email)
  IF NOT v_authorized THEN
    SELECT email INTO v_caller_email FROM auth.users WHERE id = auth.uid();
    IF public.is_super_admin() THEN
      v_authorized := true;
    END IF;
  END IF;

  IF NOT v_authorized THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO v_request FROM moderator_requests WHERE id = p_request_id AND status = 'pending';
  IF v_request IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Request not found');
  END IF;

  v_user_id := v_request.user_id;

  IF v_user_id IS NOT NULL THEN
    INSERT INTO profiles (id, full_name, email, user_type, status, is_active)
    VALUES (v_user_id, v_request.name, v_request.email, 'moderator', 'approved', true)
    ON CONFLICT (id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      user_type = 'moderator',
      status = 'approved',
      is_active = true;
  ELSE
    INSERT INTO profiles (id, full_name, email, user_type, status, is_active)
    VALUES (gen_random_uuid(), v_request.name, v_request.email, 'moderator', 'approved', true);
  END IF;

  UPDATE moderator_requests SET status = 'approved', updated_at = now() WHERE id = p_request_id;
  UPDATE moderator_invite_codes SET used = true, used_by = v_user_id WHERE id = v_request.code_id;

  RETURN json_build_object('success', true);
END;
$$;


--

--
-- Name: approve_school_profile(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_school_profile(p_profile_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE
  v_profile RECORD;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_profile_id;
  IF v_profile IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Profile not found');
  END IF;

  IF NOT (is_school_admin_of(auth.uid(), v_profile.school_id) OR is_super_admin()) THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;

  UPDATE public.profiles
     SET status = 'approved', is_active = true
   WHERE id = p_profile_id;

  IF v_profile.user_type IN ('teacher', 'student') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (p_profile_id, v_profile.user_type::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  UPDATE public.invite_requests
     SET status = 'approved', updated_at = now()
   WHERE status = 'pending'
     AND (user_id = p_profile_id OR lower(email) = lower(v_profile.email));

  RETURN json_build_object('success', true, 'profile_id', p_profile_id);
END;
$$;


--

--
-- Name: assign_ministry_role(uuid, uuid, public.ministry_role, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_ministry_role(p_tenant_id uuid, p_user_id uuid, p_role public.ministry_role, p_session_token text DEFAULT NULL::text, p_actor_label text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.has_ministry_capability(auth.uid(), p_tenant_id, 'permissions.assign', p_session_token) THEN
    RAISE EXCEPTION 'Not authorized to assign ministry roles';
  END IF;

  INSERT INTO public.ministry_role_assignments (tenant_id, user_id, role, assigned_by)
  VALUES (p_tenant_id, p_user_id, p_role, auth.uid())
  ON CONFLICT (tenant_id, user_id, role) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_id;

  PERFORM public.ministry_audit(p_tenant_id, auth.uid(),
    COALESCE(p_actor_label, 'Ministry Session'),
    'role.assign', 'ministry_role_assignment', v_id,
    NULL, jsonb_build_object('user_id', p_user_id, 'role', p_role), NULL);
  RETURN v_id;
END; $$;


--

--
-- Name: attach_bandit_reward(uuid, text, uuid, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.attach_bandit_reward(p_user_id uuid, p_subject text, p_concept_id uuid, p_reward numeric) RETURNS TABLE(decision_id uuid, arm_id text, context_vec jsonb)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE
  v_decision_id UUID;
  v_arm_id TEXT;
  v_context JSONB;
BEGIN
  SELECT d.id, d.arm_id, d.context_vec
    INTO v_decision_id, v_arm_id, v_context
  FROM public.bandit_decisions d
  WHERE d.user_id = p_user_id
    AND d.subject = p_subject
    AND (p_concept_id IS NULL OR d.concept_id = p_concept_id)
    AND d.rewarded = false
  ORDER BY d.created_at DESC
  LIMIT 1;

  IF v_decision_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.bandit_decisions
     SET rewarded = true,
         reward = LEAST(1, GREATEST(-1, p_reward)),
         rewarded_at = now()
   WHERE id = v_decision_id;

  decision_id := v_decision_id;
  arm_id := v_arm_id;
  context_vec := v_context;
  RETURN NEXT;
END;
$$;


--

--
-- Name: attach_ensemble_outcome(uuid, text, uuid, smallint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.attach_ensemble_outcome(p_user_id uuid, p_subject text, p_concept_id uuid, p_outcome smallint) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_outcome NOT IN (0, 1) THEN
    RAISE EXCEPTION 'outcome must be 0 or 1';
  END IF;
  SELECT id INTO v_id
  FROM public.ensemble_predictions
  WHERE user_id = p_user_id
    AND subject = p_subject
    AND (p_concept_id IS NULL OR concept_id = p_concept_id)
    AND outcome IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.ensemble_predictions
     SET outcome = p_outcome,
         outcome_attached_at = now()
   WHERE id = v_id;
  RETURN v_id;
END;
$$;


--

--
-- Name: can_view_student_mastery(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_view_student_mastery(p_viewer uuid, p_student uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE
  v_viewer_school uuid;
  v_student_school uuid;
  v_viewer_type text;
  v_viewer_email text;
BEGIN
  IF p_viewer IS NULL OR p_student IS NULL THEN
    RETURN false;
  END IF;

  -- Self
  IF p_viewer = p_student THEN
    RETURN true;
  END IF;

  -- Super admin
  SELECT email INTO v_viewer_email FROM auth.users WHERE id = p_viewer;
  IF public.is_super_admin(p_viewer) THEN
    RETURN true;
  END IF;

  SELECT school_id, user_type INTO v_viewer_school, v_viewer_type
  FROM public.profiles WHERE id = p_viewer;

  SELECT school_id INTO v_student_school
  FROM public.profiles WHERE id = p_student;

  -- Parent link
  IF v_viewer_type = 'parent' AND public.is_parent_of(p_viewer, p_student) THEN
    RETURN true;
  END IF;

  -- Teacher / school_admin in same school
  IF v_viewer_type IN ('teacher','school_admin')
     AND v_viewer_school IS NOT NULL
     AND v_viewer_school = v_student_school THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;


--

--
-- Name: check_and_increment_cost(uuid, uuid, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_and_increment_cost(p_user_id uuid, p_school_id uuid, p_feature text, p_daily_cap integer) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE
  v_current integer;
BEGIN
  INSERT INTO public.lumina_cost_ledger (user_id, school_id, feature, usage_date, count, last_used_at)
  VALUES (p_user_id, p_school_id, p_feature, (now() AT TIME ZONE 'UTC')::date, 0, now())
  ON CONFLICT (user_id, feature, usage_date) DO NOTHING;

  SELECT count INTO v_current
  FROM public.lumina_cost_ledger
  WHERE user_id = p_user_id AND feature = p_feature AND usage_date = (now() AT TIME ZONE 'UTC')::date
  FOR UPDATE;

  IF v_current >= p_daily_cap THEN
    RETURN json_build_object('allowed', false, 'used', v_current, 'cap', p_daily_cap);
  END IF;

  UPDATE public.lumina_cost_ledger
  SET count = count + 1, last_used_at = now()
  WHERE user_id = p_user_id AND feature = p_feature AND usage_date = (now() AT TIME ZONE 'UTC')::date;

  RETURN json_build_object('allowed', true, 'used', v_current + 1, 'cap', p_daily_cap);
END;
$$;


--

--
-- Name: check_lct_lock(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_lct_lock(p_user_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
  SELECT COALESCE(
    (
      SELECT jsonb_build_object(
        'locked', true,
        'exam_id', l.exam_id,
        'locked_until', l.locked_until
      )
      FROM public.lct_exam_locks l
      WHERE l.student_id = p_user_id
        AND l.locked_until > now()
      LIMIT 1
    ),
    jsonb_build_object('locked', false, 'exam_id', null, 'locked_until', null)
  );
$$;


--

--
-- Name: check_ministry_ip_ban(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_ministry_ip_ban(p_ip text, p_fingerprint text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM ministry_ip_bans WHERE ip_address = p_ip) THEN
    RETURN json_build_object('banned', true);
  END IF;
  IF p_fingerprint IS NOT NULL AND EXISTS(SELECT 1 FROM ministry_ip_bans WHERE device_fingerprint = p_fingerprint) THEN
    RETURN json_build_object('banned', true);
  END IF;
  RETURN json_build_object('banned', false);
END;
$$;


--

--
-- Name: check_ministry_session(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_ministry_session(p_session_token text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE
  v_session RECORD;
BEGIN
  SELECT * INTO v_session FROM ministry_sessions
  WHERE session_token = p_session_token AND is_active = true;

  IF v_session IS NULL THEN
    RETURN json_build_object('valid', false, 'reason', 'Session not found');
  END IF;

  -- Check expiry (15 min timeout)
  IF v_session.expires_at < now() THEN
    UPDATE ministry_sessions SET is_active = false WHERE id = v_session.id;
    RETURN json_build_object('valid', false, 'reason', 'Session expired');
  END IF;

  -- Refresh timeout
  UPDATE ministry_sessions SET last_activity = now(), expires_at = now() + interval '15 minutes'
  WHERE id = v_session.id;

  RETURN json_build_object('valid', true, 'session_id', v_session.id);
END;
$$;


--

--
-- Name: concepts_fill_parents(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.concepts_fill_parents() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
BEGIN
  IF NEW.subject_id IS NULL OR NEW.school_id IS NULL THEN
    SELECT subject_id, school_id INTO NEW.subject_id, NEW.school_id
    FROM public.lectures WHERE id = NEW.lecture_id;
  END IF;
  RETURN NEW;
END;
$$;


--

--
-- Name: delete_school_cascade(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_school_cascade(school_uuid uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super Admin with AAL2 required' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.platform_audit_log (event_type, actor_user_id, school_id, detail)
  VALUES ('school.deletion_started', auth.uid(), school_uuid, jsonb_build_object('school_id', school_uuid));
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


--

--
-- Name: deny_moderator_request(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.deny_moderator_request(p_request_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE
  v_caller_email text;
BEGIN
  SELECT email INTO v_caller_email FROM auth.users WHERE id = auth.uid();
  IF NOT public.is_super_admin() THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  UPDATE moderator_requests SET status = 'rejected', updated_at = now() WHERE id = p_request_id AND status = 'pending';

  RETURN json_build_object('success', true);
END;
$$;


--

--
-- Name: deny_moderator_request(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.deny_moderator_request(p_request_id uuid, p_session_token text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE
  v_caller_email text;
  v_authorized boolean := false;
BEGIN
  -- Auth path 1: ministry session token
  IF p_session_token IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM ministry_sessions
      WHERE session_token = p_session_token AND is_active = true AND expires_at > now()
    ) THEN
      v_authorized := true;
    END IF;
  END IF;

  -- Auth path 2: direct Supabase auth
  IF NOT v_authorized THEN
    SELECT email INTO v_caller_email FROM auth.users WHERE id = auth.uid();
    IF public.is_super_admin() THEN
      v_authorized := true;
    END IF;
  END IF;

  IF NOT v_authorized THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  UPDATE moderator_requests SET status = 'rejected', updated_at = now() WHERE id = p_request_id AND status = 'pending';

  RETURN json_build_object('success', true);
END;
$$;


--

--
-- Name: derive_level(numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.derive_level(p_theta numeric) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  SELECT CASE
    WHEN p_theta IS NULL THEN 'intermediate'
    WHEN p_theta < -0.5 THEN 'beginner'
    WHEN p_theta >  0.5 THEN 'advanced'
    ELSE 'intermediate'
  END
$$;


--

--
-- Name: enforce_teacher_category(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_teacher_category() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cat_id uuid;
  v_cat_name text;
  v_subject_slug text;
  v_expected text;
  v_actual text := NEW.subject;
BEGIN
  -- Only enforce for teacher-role users (admins, students unaffected)
  IF v_uid IS NULL THEN RETURN NEW; END IF;
  IF NOT public.has_role(v_uid, 'teacher'::app_role) THEN RETURN NEW; END IF;

  SELECT teacher_category_id INTO v_cat_id
    FROM public.profiles WHERE id = v_uid;

  -- Legacy teachers with no category: no enforcement
  IF v_cat_id IS NULL THEN RETURN NEW; END IF;

  SELECT tc.name, s.slug
    INTO v_cat_name, v_subject_slug
    FROM public.teacher_categories tc
    LEFT JOIN public.subjects s ON s.id = tc.subject_id
    WHERE tc.id = v_cat_id;

  v_expected := COALESCE(v_subject_slug, public._slugify_name(v_cat_name));

  IF v_expected IS NULL OR v_expected = '' THEN RETURN NEW; END IF;

  IF v_actual IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'Teacher category violation: your category is "%", but this content is filed under "%". You can only post for your assigned category.', v_cat_name, v_actual
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;


--

--
-- Name: ext_append_audit_message(uuid, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ext_append_audit_message(p_request_id uuid, p_role text, p_parts jsonb) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_super_admin_caller() THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF p_role NOT IN ('user','assistant','system') THEN
    RETURN json_build_object('success', false, 'error', 'bad_role');
  END IF;
  INSERT INTO public.extension_audit_chats (request_id, role, parts)
  VALUES (p_request_id, p_role, COALESCE(p_parts,'[]'::jsonb))
  RETURNING id INTO v_id;
  RETURN json_build_object('success', true, 'id', v_id);
END $$;


--

--
-- Name: ext_append_message(text, uuid, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ext_append_message(p_session_token text, p_conversation_id uuid, p_role text, p_parts jsonb) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_tenant uuid; v_id uuid;
BEGIN
  v_tenant := public.ext_tenant_from_session(p_session_token);
  IF v_tenant IS NULL THEN RETURN json_build_object('success', false, 'error', 'invalid_session'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.extension_conversations
    WHERE id = p_conversation_id AND tenant_id = v_tenant) THEN
    RETURN json_build_object('success', false, 'error', 'not_found');
  END IF;
  IF p_role NOT IN ('user','assistant','system') THEN
    RETURN json_build_object('success', false, 'error', 'bad_role');
  END IF;
  INSERT INTO public.extension_messages (conversation_id, tenant_id, role, parts)
  VALUES (p_conversation_id, v_tenant, p_role, COALESCE(p_parts, '[]'::jsonb))
  RETURNING id INTO v_id;
  UPDATE public.extension_conversations SET updated_at = now() WHERE id = p_conversation_id;
  RETURN json_build_object('success', true, 'id', v_id);
END $$;


--

--
-- Name: ext_approve_request(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ext_approve_request(p_request_id uuid, p_notes text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_req public.extension_requests; v_bp public.extension_blueprints;
        v_ver_id uuid; v_sig text;
BEGIN
  IF NOT public.is_super_admin_caller() THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT * INTO v_req FROM public.extension_requests WHERE id = p_request_id;
  IF NOT FOUND OR v_req.status <> 'in_review' THEN
    RETURN json_build_object('success', false, 'error', 'not_pending');
  END IF;
  SELECT * INTO v_bp FROM public.extension_blueprints WHERE id = v_req.blueprint_id;
  UPDATE public.extension_versions
    SET active = false, rolled_back_at = now(), rolled_back_by = auth.uid()
    WHERE tenant_id = v_bp.tenant_id AND name = v_bp.name AND active = true;
  v_sig := encode(extensions.digest(v_bp.manifest::text || v_req.id::text || now()::text, 'sha256'), 'hex');
  INSERT INTO public.extension_versions
    (blueprint_id, tenant_id, name, version, manifest, signature, deployed_by_user_id)
  VALUES (v_bp.id, v_bp.tenant_id, v_bp.name, v_bp.version, v_bp.manifest, v_sig, auth.uid())
  RETURNING id INTO v_ver_id;
  UPDATE public.extension_blueprints SET status = 'deployed' WHERE id = v_bp.id;
  UPDATE public.extension_requests
    SET status = 'approved', decision_notes = p_notes, reviewer_user_id = auth.uid(), decided_at = now()
    WHERE id = p_request_id;
  RETURN json_build_object('success', true, 'version_id', v_ver_id, 'signature', v_sig);
END $$;


--

--
-- Name: ext_create_conversation(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ext_create_conversation(p_session_token text, p_title text DEFAULT 'Untitled workspace'::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_tenant uuid; v_id uuid;
BEGIN
  v_tenant := public.ext_tenant_from_session(p_session_token);
  IF v_tenant IS NULL THEN RETURN json_build_object('success', false, 'error', 'invalid_session'); END IF;
  INSERT INTO public.extension_conversations (tenant_id, title, created_by_session)
  VALUES (v_tenant, COALESCE(NULLIF(trim(p_title),''), 'Untitled workspace'), p_session_token)
  RETURNING id INTO v_id;
  RETURN json_build_object('success', true, 'id', v_id);
END $$;


--

--
-- Name: ext_list_active_for_me(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ext_list_active_for_me() RETURNS TABLE(version_id uuid, name text, version integer, manifest jsonb, deployed_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_tenant uuid;
BEGIN
  SELECT s.tenant_id INTO v_tenant
  FROM public.schools s JOIN public.profiles p ON p.school_id = s.id
  WHERE p.id = auth.uid() LIMIT 1;
  IF v_tenant IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT v.id, v.name, v.version, v.manifest, v.deployed_at
    FROM public.extension_versions v
    WHERE v.tenant_id = v_tenant AND v.active = true
    ORDER BY v.deployed_at DESC;
END $$;


--

--
-- Name: ext_list_conversations(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ext_list_conversations(p_session_token text) RETURNS TABLE(id uuid, title text, archived boolean, created_at timestamp with time zone, updated_at timestamp with time zone, message_count bigint, latest_blueprint_status public.extension_blueprint_status)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_tenant uuid;
BEGIN
  v_tenant := public.ext_tenant_from_session(p_session_token);
  IF v_tenant IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT c.id, c.title, c.archived, c.created_at, c.updated_at,
      (SELECT count(*) FROM public.extension_messages m WHERE m.conversation_id = c.id),
      (SELECT b.status FROM public.extension_blueprints b
        WHERE b.conversation_id = c.id ORDER BY b.version DESC LIMIT 1)
    FROM public.extension_conversations c
    WHERE c.tenant_id = v_tenant
    ORDER BY c.updated_at DESC;
END $$;


--

--
-- Name: ext_list_pending_requests(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ext_list_pending_requests() RETURNS TABLE(request_id uuid, submitted_at timestamp with time zone, tenant_id uuid, tenant_name text, blueprint_id uuid, blueprint_name text, blueprint_summary text, blueprint_version integer, requested_capabilities text[], manifest jsonb, status public.extension_request_status)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
BEGIN
  IF NOT public.is_super_admin_caller() THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY
    SELECT r.id, r.submitted_at, r.tenant_id, t.name,
           b.id, b.name, b.summary, b.version, b.requested_capabilities, b.manifest, r.status
    FROM public.extension_requests r
    JOIN public.extension_blueprints b ON b.id = r.blueprint_id
    JOIN public.tenants t ON t.id = r.tenant_id
    ORDER BY r.submitted_at DESC;
END $$;


--

--
-- Name: ext_load_audit_chat(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ext_load_audit_chat(p_request_id uuid) RETURNS TABLE(id uuid, role text, parts jsonb, created_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
BEGIN
  IF NOT public.is_super_admin_caller() THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY SELECT c.id, c.role, c.parts, c.created_at
    FROM public.extension_audit_chats c
    WHERE c.request_id = p_request_id ORDER BY c.created_at;
END $$;


--

--
-- Name: ext_load_conversation(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ext_load_conversation(p_session_token text, p_conversation_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_tenant uuid; v_result json;
BEGIN
  v_tenant := public.ext_tenant_from_session(p_session_token);
  IF v_tenant IS NULL THEN RETURN json_build_object('success', false, 'error', 'invalid_session'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.extension_conversations
    WHERE id = p_conversation_id AND tenant_id = v_tenant) THEN
    RETURN json_build_object('success', false, 'error', 'not_found');
  END IF;
  SELECT json_build_object(
    'success', true,
    'conversation', (SELECT row_to_json(c) FROM public.extension_conversations c WHERE c.id = p_conversation_id),
    'messages', COALESCE((SELECT json_agg(row_to_json(m) ORDER BY m.created_at)
      FROM public.extension_messages m WHERE m.conversation_id = p_conversation_id), '[]'::json),
    'blueprints', COALESCE((SELECT json_agg(row_to_json(b) ORDER BY b.version DESC)
      FROM public.extension_blueprints b WHERE b.conversation_id = p_conversation_id), '[]'::json)
  ) INTO v_result;
  RETURN v_result;
END $$;


--

--
-- Name: ext_push_forward(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ext_push_forward(p_session_token text, p_blueprint_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_tenant uuid; v_bp public.extension_blueprints; v_req_id uuid;
BEGIN
  v_tenant := public.ext_tenant_from_session(p_session_token);
  IF v_tenant IS NULL THEN RETURN json_build_object('success', false, 'error', 'invalid_session'); END IF;
  SELECT * INTO v_bp FROM public.extension_blueprints WHERE id = p_blueprint_id AND tenant_id = v_tenant;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'not_found'); END IF;
  IF v_bp.status NOT IN ('preview','draft') THEN
    RETURN json_build_object('success', false, 'error', 'already_submitted');
  END IF;
  UPDATE public.extension_blueprints SET status = 'pushed' WHERE id = p_blueprint_id;
  INSERT INTO public.extension_requests (blueprint_id, tenant_id, submitted_by_session)
  VALUES (p_blueprint_id, v_tenant, p_session_token) RETURNING id INTO v_req_id;
  RETURN json_build_object('success', true, 'request_id', v_req_id);
END $$;


--

--
-- Name: ext_reject_request(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ext_reject_request(p_request_id uuid, p_notes text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_bp_id uuid;
BEGIN
  IF NOT public.is_super_admin_caller() THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT blueprint_id INTO v_bp_id FROM public.extension_requests
  WHERE id = p_request_id AND status = 'in_review';
  IF v_bp_id IS NULL THEN RETURN json_build_object('success', false, 'error', 'not_pending'); END IF;
  UPDATE public.extension_requests
    SET status = 'rejected', decision_notes = p_notes,
        reviewer_user_id = auth.uid(), decided_at = now()
    WHERE id = p_request_id;
  UPDATE public.extension_blueprints SET status = 'rejected' WHERE id = v_bp_id;
  RETURN json_build_object('success', true);
END $$;


--

--
-- Name: ext_rollback_version(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ext_rollback_version(p_version_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
BEGIN
  IF NOT public.is_super_admin_caller() THEN RAISE EXCEPTION 'not authorized'; END IF;
  UPDATE public.extension_versions
    SET active = false, rolled_back_at = now(), rolled_back_by = auth.uid()
    WHERE id = p_version_id;
  RETURN json_build_object('success', true);
END $$;


--

--
-- Name: ext_save_blueprint(text, uuid, text, text, jsonb, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ext_save_blueprint(p_session_token text, p_conversation_id uuid, p_name text, p_summary text, p_manifest jsonb, p_capabilities text[]) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_tenant uuid; v_version int; v_id uuid;
BEGIN
  v_tenant := public.ext_tenant_from_session(p_session_token);
  IF v_tenant IS NULL THEN RETURN json_build_object('success', false, 'error', 'invalid_session'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.extension_conversations
    WHERE id = p_conversation_id AND tenant_id = v_tenant) THEN
    RETURN json_build_object('success', false, 'error', 'not_found');
  END IF;
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_version
  FROM public.extension_blueprints WHERE conversation_id = p_conversation_id;
  INSERT INTO public.extension_blueprints
    (conversation_id, tenant_id, version, name, summary, manifest, requested_capabilities, status)
  VALUES (p_conversation_id, v_tenant, v_version, p_name, p_summary, p_manifest,
     COALESCE(p_capabilities, '{}'), 'preview')
  RETURNING id INTO v_id;
  RETURN json_build_object('success', true, 'id', v_id, 'version', v_version);
END $$;


--

--
-- Name: ext_tenant_from_session(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ext_tenant_from_session(p_session_token text) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
  SELECT tenant_id FROM public.ministry_sessions
  WHERE session_token = p_session_token AND is_active = true AND expires_at > now()
  LIMIT 1;
$$;


--

--
-- Name: ext_withdraw_request(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ext_withdraw_request(p_session_token text, p_request_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_tenant uuid; v_bp_id uuid;
BEGIN
  v_tenant := public.ext_tenant_from_session(p_session_token);
  IF v_tenant IS NULL THEN RETURN json_build_object('success', false, 'error', 'invalid_session'); END IF;
  SELECT blueprint_id INTO v_bp_id FROM public.extension_requests
  WHERE id = p_request_id AND tenant_id = v_tenant AND status = 'in_review';
  IF v_bp_id IS NULL THEN RETURN json_build_object('success', false, 'error', 'not_found'); END IF;
  UPDATE public.extension_requests SET status = 'withdrawn', decided_at = now() WHERE id = p_request_id;
  UPDATE public.extension_blueprints SET status = 'preview' WHERE id = v_bp_id;
  RETURN json_build_object('success', true);
END $$;


--

--
-- Name: gen_teacher_category_code(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gen_teacher_category_code(p_name text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
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


--

--
-- Name: generate_ministry_invite_code(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_ministry_invite_code() RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE
  v_caller_email text;
  v_raw_bytes bytea;
  v_plaintext text;
  v_hash text;
  v_last_generated timestamptz;
  v_chars text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  v_i int;
  v_byte int;
BEGIN
  -- Only super admin
  SELECT email INTO v_caller_email FROM auth.users WHERE id = auth.uid();
  IF NOT public.is_super_admin() THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Check 15-minute cooldown from last generated code
  SELECT created_at INTO v_last_generated
  FROM ministry_access_codes
  WHERE expires_at IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_last_generated IS NOT NULL AND v_last_generated > now() - interval '15 minutes' THEN
    RETURN json_build_object('success', false, 'error', 'Cooldown active. Wait before generating another code.', 'cooldown_until', (v_last_generated + interval '15 minutes'));
  END IF;

  -- Generate 100-character alphanumeric code using pgcrypto
  v_raw_bytes := gen_random_bytes(100);
  v_plaintext := '';
  FOR v_i IN 0..99 LOOP
    v_byte := get_byte(v_raw_bytes, v_i);
    v_plaintext := v_plaintext || substr(v_chars, (v_byte % 62) + 1, 1);
  END LOOP;

  -- Hash it
  v_hash := encode(sha256(v_plaintext::bytea), 'hex');

  -- Deactivate all previous active codes
  UPDATE ministry_access_codes SET is_active = false WHERE is_active = true;

  -- Insert new hashed code with 15-min expiry
  INSERT INTO ministry_access_codes (code_hash, is_active, expires_at, description)
  VALUES (v_hash, true, now() + interval '15 minutes', 'Dynamic code generated by super admin');

  RETURN json_build_object('success', true, 'code', v_plaintext, 'expires_at', now() + interval '15 minutes');
END;
$$;


--

--
-- Name: generate_moderator_invite_code(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_moderator_invite_code() RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE
  v_caller_email text;
  v_code text;
  v_expires_at timestamptz;
BEGIN
  SELECT email INTO v_caller_email FROM auth.users WHERE id = auth.uid();
  IF NOT public.is_super_admin() THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  v_expires_at := now() + interval '48 hours';

  FOR i IN 1..5 LOOP
    v_code := 'MOD-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    BEGIN
      INSERT INTO moderator_invite_codes (code, expires_at)
      VALUES (v_code, v_expires_at);
      RETURN json_build_object('success', true, 'code', v_code, 'expires_at', v_expires_at);
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;
  END LOOP;

  RETURN json_build_object('success', false, 'error', 'Failed to generate unique code');
END;
$$;


--

--
-- Name: generate_parent_code_on_approval(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_parent_code_on_approval() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
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


--

--
-- Name: get_active_tenants(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_active_tenants() RETURNS TABLE(id uuid, slug text, country_name text, country_code text, ministry_name text, default_language text, supported_languages text[])
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
  SELECT id, slug, country_name, country_code, ministry_name,
         default_language, supported_languages
    FROM public.tenants
   WHERE status = 'active' AND is_visible = true
   ORDER BY country_name
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--

--
-- The typed-view function is created after public.tenant_analytics_view in 47_view_functions.sql.
--
-- Name: get_due_reviews(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_due_reviews(p_user_id uuid, p_limit integer DEFAULT 10) RETURNS TABLE(subject text, topic text, mastery_score numeric, next_review_at timestamp with time zone, overdue_hours numeric)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
BEGIN
  IF NOT public.can_view_student_mastery(auth.uid(), p_user_id) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  RETURN QUERY
    SELECT cm.subject, cm.topic, cm.mastery_score, cm.next_review_at,
           EXTRACT(EPOCH FROM (now() - cm.next_review_at)) / 3600.0 AS overdue_hours
    FROM public.concept_mastery cm
    WHERE cm.user_id = p_user_id
      AND cm.next_review_at IS NOT NULL
      AND cm.next_review_at <= now()
    ORDER BY cm.next_review_at ASC
    LIMIT GREATEST(1, LEAST(p_limit, 50));
END;
$$;


--

--
-- Name: get_due_reviews(uuid, integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_due_reviews(p_user_id uuid, p_limit integer DEFAULT 10, p_school_id uuid DEFAULT NULL::uuid) RETURNS TABLE(subject text, topic text, mastery_score numeric, next_review_at timestamp with time zone, overdue_hours numeric)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
BEGIN
  IF NOT public.can_view_student_mastery(auth.uid(), p_user_id) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  RETURN QUERY
    SELECT cm.subject, cm.topic, cm.mastery_score, cm.next_review_at,
           EXTRACT(EPOCH FROM (now() - cm.next_review_at)) / 3600.0 AS overdue_hours
    FROM public.concept_mastery cm
    WHERE cm.user_id = p_user_id
      AND cm.next_review_at IS NOT NULL
      AND cm.next_review_at <= now()
      AND (p_school_id IS NULL OR cm.school_id IS NULL OR cm.school_id = p_school_id)
    ORDER BY cm.next_review_at ASC
    LIMIT GREATEST(1, LEAST(p_limit, 50));
END;
$$;


--

--
-- Name: get_fsrs_due_cards(uuid, integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_fsrs_due_cards(p_user_id uuid, p_limit integer DEFAULT 20, p_school_id uuid DEFAULT NULL::uuid) RETURNS TABLE(card_id uuid, subject text, concept_id uuid, concept_name text, stability numeric, difficulty numeric, reps integer, lapses integer, is_leech boolean, last_review_at timestamp with time zone, next_review_at timestamp with time zone, overdue_hours numeric, retrievability numeric, priority numeric)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  IF auth.uid() <> p_user_id AND NOT public.is_super_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    f.id                                                AS card_id,
    f.subject,
    f.concept_id,
    COALESCE(c.name, f.subject)                         AS concept_name,
    f.stability,
    f.difficulty,
    f.reps,
    f.lapses,
    f.is_leech,
    f.last_review_at,
    f.next_review_at,
    GREATEST(0, EXTRACT(EPOCH FROM (now() - f.next_review_at)) / 3600.0)::numeric AS overdue_hours,
    CASE
      WHEN f.last_review_at IS NULL OR f.stability <= 0 THEN 0.5
      ELSE GREATEST(0.01, LEAST(0.99,
             1.0 / (1.0 + GREATEST(0, EXTRACT(EPOCH FROM (now() - f.last_review_at)) / 86400.0)
                          / (9.0 * f.stability))))
    END                                                 AS retrievability,
    f.priority
  FROM public.fsrs_card_state f
  LEFT JOIN public.concepts c ON c.id = f.concept_id
  WHERE f.user_id = p_user_id
    AND (p_school_id IS NULL OR f.school_id = p_school_id)
    AND (f.suspended_until IS NULL OR f.suspended_until <= now())
    AND (f.next_review_at IS NULL OR f.next_review_at <= now())
  ORDER BY f.priority DESC NULLS LAST, f.next_review_at NULLS FIRST
  LIMIT GREATEST(1, LEAST(p_limit, 200));
END;
$$;


--

--
-- Name: get_ministry_dashboard_data(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_ministry_dashboard_data(p_session_token text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
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


--

--
-- Name: get_tenant_analytics(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_tenant_analytics(p_tenant_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_tenant uuid; v_row public.tenant_analytics_view%ROWTYPE;
BEGIN
  IF public.is_super_admin(auth.uid()) THEN
    v_tenant := p_tenant_id;
    IF v_tenant IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'tenant_id required');
    END IF;
  ELSE
    v_tenant := public.get_user_tenant_id(auth.uid());
    IF v_tenant IS NULL THEN RETURN NULL; END IF;
    IF p_tenant_id IS NOT NULL AND p_tenant_id <> v_tenant THEN
      RETURN jsonb_build_object('success', false, 'error', 'Cross-tenant access denied');
    END IF;
  END IF;
  SELECT * INTO v_row FROM public.tenant_analytics_view WHERE tenant_id = v_tenant;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN to_jsonb(v_row);
END;$$;


--

--
-- Name: get_tenant_config(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_tenant_config() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE
  v_tid uuid;
  v_row public.tenants%ROWTYPE;
BEGIN
  v_tid := public.get_user_tenant_id(auth.uid());

  IF v_tid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_row FROM public.tenants WHERE id = v_tid;

  IF v_row.id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id',                   v_row.id,
    'slug',                 v_row.slug,
    'country_name',         v_row.country_name,
    'country_code',         v_row.country_code,
    'ministry_name',        v_row.ministry_name,
    'default_language',     v_row.default_language,
    'supported_languages',  to_jsonb(v_row.supported_languages),
    'curriculum_framework', v_row.curriculum_framework,
    'grading_system',       v_row.grading_system,
    'academic_calendar',    v_row.academic_calendar,
    'default_subjects',     v_row.default_subjects,
    'ai_config',            v_row.ai_config,
    'status',               v_row.status
  );
END;
$$;


--

--
-- Name: get_user_school_id(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_school_id(user_uuid uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
    SELECT school_id FROM public.profiles WHERE id = user_uuid LIMIT 1
$$;


--

--
-- Name: get_user_tenant_id(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_tenant_id(uid uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
  SELECT s.tenant_id
    FROM public.profiles p
    JOIN public.schools  s ON s.id = p.school_id
   WHERE p.id = uid
   LIMIT 1
$$;


--

--
-- Name: get_weakest_topics(uuid, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_weakest_topics(p_user_id uuid, p_subject text DEFAULT NULL::text, p_limit integer DEFAULT 5) RETURNS TABLE(subject text, topic text, mastery_score numeric, next_review_at timestamp with time zone, last_practiced_at timestamp with time zone, repetitions integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
BEGIN
  IF NOT public.can_view_student_mastery(auth.uid(), p_user_id) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  RETURN QUERY
    SELECT cm.subject, cm.topic, cm.mastery_score,
           cm.next_review_at, cm.last_practiced_at, cm.repetitions
    FROM public.concept_mastery cm
    WHERE cm.user_id = p_user_id
      AND (p_subject IS NULL OR cm.subject = p_subject)
    ORDER BY cm.mastery_score ASC, cm.last_practiced_at ASC NULLS FIRST
    LIMIT GREATEST(1, LEAST(p_limit, 50));
END;
$$;


--

--
-- Name: get_weakest_topics(uuid, text, integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_weakest_topics(p_user_id uuid, p_subject text DEFAULT NULL::text, p_limit integer DEFAULT 5, p_school_id uuid DEFAULT NULL::uuid) RETURNS TABLE(subject text, topic text, mastery_score numeric, next_review_at timestamp with time zone, last_practiced_at timestamp with time zone, repetitions integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
BEGIN
  IF NOT public.can_view_student_mastery(auth.uid(), p_user_id) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  RETURN QUERY
    SELECT cm.subject, cm.topic, cm.mastery_score,
           cm.next_review_at, cm.last_practiced_at, cm.repetitions
    FROM public.concept_mastery cm
    WHERE cm.user_id = p_user_id
      AND (p_subject IS NULL OR cm.subject = p_subject)
      AND (p_school_id IS NULL OR cm.school_id IS NULL OR cm.school_id = p_school_id)
    ORDER BY cm.mastery_score ASC, cm.last_practiced_at ASC NULLS FIRST
    LIMIT GREATEST(1, LEAST(p_limit, 50));
END;
$$;


--

--
-- Name: has_ministry_capability(uuid, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_ministry_capability(p_user_id uuid, p_tenant_id uuid, p_capability text, p_session_token text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_session_tenant uuid;
BEGIN
  -- Super admin bypass
  IF public.is_super_admin_caller() THEN RETURN true; END IF;

  -- Ministry session bootstrap: session holder acts as Minister of its tenant
  IF p_session_token IS NOT NULL THEN
    v_session_tenant := public.ministry_session_tenant(p_session_token);
    IF v_session_tenant IS NOT NULL AND v_session_tenant = p_tenant_id THEN
      RETURN EXISTS (
        SELECT 1 FROM public.ministry_capabilities
        WHERE role = 'minister' AND capability = p_capability
      );
    END IF;
  END IF;

  -- Named role assignment
  IF p_user_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.ministry_role_assignments mra
      JOIN public.ministry_capabilities mc ON mc.role = mra.role
      WHERE mra.user_id = p_user_id
        AND mra.tenant_id = p_tenant_id
        AND mc.capability = p_capability
    );
  END IF;

  RETURN false;
END; $$;


--

--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;


--

--
-- Name: has_tenant_role(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_tenant_role(uid uuid, tenant uuid, role_name text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_roles
     WHERE user_id = uid AND tenant_id = tenant AND role = role_name
  )
$$;


--

--
-- Name: is_feature_enabled(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_feature_enabled(p_tenant_id uuid, p_flag_key text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
  SELECT COALESCE(
    (SELECT enabled FROM public.tenant_feature_flags
      WHERE tenant_id = p_tenant_id AND flag_key = p_flag_key LIMIT 1),
    false);
$$;


--

--
-- Name: is_moderator(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_moderator(user_uuid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = user_uuid AND user_type = 'moderator' AND is_active = true AND status = 'approved'
  )
$$;


--

--
-- Name: is_parent_of(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_parent_of(p_parent_id uuid, p_student_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM parent_students WHERE parent_id = p_parent_id AND student_id = p_student_id
  )
$$;


--

--
-- Name: is_student(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_student(user_uuid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = user_uuid
        AND user_type = 'student'
        AND is_active = true
    )
$$;


--

--
-- Name: is_teacher(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_teacher(user_uuid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = user_uuid
        AND user_type = 'teacher'
        AND is_active = true
    )
$$;


--

--
-- Name: lectures_fill_school_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.lectures_fill_school_id() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
BEGIN
  IF NEW.school_id IS NULL THEN
    SELECT school_id INTO NEW.school_id FROM public.subjects WHERE id = NEW.subject_id;
  END IF;
  RETURN NEW;
END;
$$;


--

--
-- Name: lesson_events_assign_seq(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.lesson_events_assign_seq() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE
  next_seq BIGINT;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.lesson_id::text, 0)::bigint
  );

  SELECT COALESCE(MAX(seq), 0) + 1
    INTO next_seq
    FROM public.lesson_events
   WHERE lesson_id = NEW.lesson_id;

  NEW.seq := next_seq;
  RETURN NEW;
END;
$$;


--

--
-- Name: lesson_events_broadcast(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.lesson_events_broadcast() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
BEGIN
  PERFORM realtime.send(
    jsonb_build_object(
      'seq',             NEW.seq,
      'kind',            NEW.kind,
      'priority',        NEW.priority,
      'teacher_visible', NEW.teacher_visible,
      'concept_ref',     NEW.concept_ref,
      'text',            NEW.text,
      'ts',              NEW.ts
    ),
    'lesson_event',
    'lesson:' || NEW.lesson_id::text,
    TRUE
  );
  RETURN NEW;
END;
$$;


--

--
-- Name: link_auth_user_to_approved_profile(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.link_auth_user_to_approved_profile() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE
  v_profile RECORD;
BEGIN
  -- Check if there's an approved profile with matching email that doesn't have an auth user yet
  SELECT p.* INTO v_profile
  FROM public.profiles p
  WHERE LOWER(p.email) = LOWER(NEW.email)
    AND p.status = 'approved'
    AND p.id != NEW.id;

  IF v_profile IS NOT NULL THEN
    -- Update the old profile to use the new auth user's ID
    -- First, update any related records
    UPDATE public.invite_requests
    SET user_id = NEW.id
    WHERE email = v_profile.email;

    -- Add teacher role if needed
    IF v_profile.user_type = 'teacher' THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (NEW.id, 'teacher')
      ON CONFLICT (user_id, role) DO NOTHING;
    END IF;

    -- Delete the old profile (we'll create a new one with correct ID)
    DELETE FROM public.profiles WHERE id = v_profile.id;

    -- Create profile with the auth user's ID
    INSERT INTO public.profiles (id, school_id, full_name, email, user_type, status, is_active, grade_level, department, student_teacher_id)
    VALUES (
      NEW.id,
      v_profile.school_id,
      v_profile.full_name,
      v_profile.email,
      v_profile.user_type,
      'approved',
      true,
      v_profile.grade_level,
      v_profile.department,
      v_profile.student_teacher_id
    );
  END IF;

  RETURN NEW;
END;
$$;


--

--
-- Name: link_moderator_after_signup(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.link_moderator_after_signup(p_user_id uuid, p_email text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE
  v_request RECORD;
  v_old_profile_id uuid;
BEGIN
  -- Update moderator_requests with user_id
  UPDATE moderator_requests SET user_id = p_user_id WHERE lower(email) = lower(p_email) AND user_id IS NULL;

  -- Check if there's an approved moderator profile to link
  SELECT id INTO v_old_profile_id FROM profiles
  WHERE lower(email) = lower(p_email) AND user_type = 'moderator' AND status = 'approved' AND id != p_user_id
  LIMIT 1;

  IF v_old_profile_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id) THEN
      UPDATE profiles SET id = p_user_id, updated_at = now() WHERE id = v_old_profile_id;
      RETURN json_build_object('success', true, 'linked', true);
    END IF;
  END IF;

  RETURN json_build_object('success', true, 'linked', false);
END;
$$;


--

--
-- Name: link_profile_after_signup(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.link_profile_after_signup(p_user_id uuid, p_email text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE
  v_old_profile_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_email IS NULL OR length(trim(p_email)) = 0 THEN
    RETURN json_build_object('success', false, 'linked', false, 'reason', 'missing_user_or_email');
  END IF;

  UPDATE public.invite_requests
    SET user_id = p_user_id,
        updated_at = now()
  WHERE lower(email) = lower(p_email)
    AND status = 'pending'
    AND (user_id IS NULL OR user_id = p_user_id);

  SELECT id
    INTO v_old_profile_id
  FROM public.profiles
  WHERE lower(email) = lower(p_email)
    AND id <> p_user_id
    AND status IN ('pending', 'approved', 'rejected')
  ORDER BY
    CASE WHEN is_active = true THEN 0 ELSE 1 END,
    CASE status WHEN 'approved' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
    updated_at DESC
  LIMIT 1;

  IF v_old_profile_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
      UPDATE public.profiles
        SET email = lower(p_email),
            updated_at = now()
      WHERE id = p_user_id
        AND (email IS NULL OR lower(email) <> lower(p_email));
    END IF;
    RETURN json_build_object('success', true, 'linked', false, 'reason', 'no_migration_needed');
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RETURN json_build_object('success', false, 'linked', false, 'reason', 'target_profile_id_exists');
  END IF;

  UPDATE public.assignments
    SET teacher_id = p_user_id
  WHERE teacher_id = v_old_profile_id;

  UPDATE public.course_materials
    SET uploaded_by = p_user_id
  WHERE uploaded_by = v_old_profile_id;

  UPDATE public.submissions
    SET graded_by = p_user_id
  WHERE graded_by = v_old_profile_id;

  UPDATE public.activity_logs
    SET user_id = p_user_id
  WHERE user_id = v_old_profile_id;

  UPDATE public.parent_students
    SET parent_id = p_user_id
  WHERE parent_id = v_old_profile_id;

  UPDATE public.parent_invite_codes
    SET used_by = p_user_id
  WHERE used_by = v_old_profile_id;

  UPDATE public.invite_requests
    SET user_id = p_user_id,
        updated_at = now()
  WHERE lower(email) = lower(p_email)
    AND (user_id IS NULL OR user_id = v_old_profile_id OR user_id = p_user_id);

  UPDATE public.profiles
    SET id = p_user_id,
        email = lower(p_email),
        updated_at = now()
  WHERE id = v_old_profile_id;

  RETURN json_build_object('success', true, 'linked', true, 'old_profile_id', v_old_profile_id, 'new_profile_id', p_user_id);
END;
$$;


--

--
-- Moved list_change_requests(uuid, public.ministry_change_status, text, integer) after table creation.
-- Moved list_feature_flags(uuid) after table creation.
-- Moved list_mc_curriculum_subjects(text) after table creation.
-- Moved list_mc_curriculum_versions(text) after table creation.
-- Moved list_mc_feature_flags(text) after table creation.
-- Moved list_mc_lumina_config(text) after table creation.
-- Moved list_mc_notices(text) after table creation.
-- Moved list_mc_policies(text) after table creation.
-- Moved list_mc_regions(text) after table creation.
-- Name: list_mc_schools(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_mc_schools(p_session_token text DEFAULT NULL::text) RETURNS TABLE(id uuid, name text, code text, status text, governance_status text, tenant_id uuid, created_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_tenant uuid;
BEGIN
  v_tenant := public.ministry_session_tenant(p_session_token);
  IF v_tenant IS NULL AND NOT public.is_super_admin_caller() THEN RETURN; END IF;
  RETURN QUERY SELECT s.id, s.name, s.code, s.status, s.governance_status, s.tenant_id, s.created_at
    FROM public.schools s
    WHERE (v_tenant IS NULL OR s.tenant_id = v_tenant)
    ORDER BY s.name;
END; $$;


--

--
-- Moved list_ministry_audit(uuid, text, integer) after table creation.
-- Moved list_ministry_role_assignments(uuid, text) after table creation.
-- Name: list_ministry_sessions(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_ministry_sessions(p_session_token text DEFAULT NULL::text, p_limit integer DEFAULT 100) RETURNS TABLE(id uuid, tenant_id uuid, ip_address text, is_active boolean, created_at timestamp with time zone, last_activity timestamp with time zone, expires_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
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


--

--
-- Name: lse_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.lse_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--

--
-- Name: mc_can_govern_tenant(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mc_can_govern_tenant(p_tenant uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
  SELECT public.is_super_admin_caller() OR EXISTS (
    SELECT 1 FROM public.ministry_role_assignments
    WHERE user_id = auth.uid() AND tenant_id = p_tenant
  );
$$;


--

--
-- Name: mc_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mc_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;


--

--
-- Name: mi_emit_event(uuid, uuid, uuid, text, text, public.mi_event_type, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mi_emit_event(_tenant_id uuid, _school_id uuid, _subject_id uuid, _concept_ref text, _grade_level text, _event_type public.mi_event_type, _student_id uuid, _payload jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
BEGIN
  IF _tenant_id IS NULL THEN RETURN; END IF;

  INSERT INTO public.mi_educational_events (
    tenant_id, school_id, region_id, subject_id, concept_ref,
    grade_level, event_type, student_hash, payload, occurred_at
  ) VALUES (
    _tenant_id, _school_id, public.mi_school_region(_school_id),
    _subject_id, _concept_ref, _grade_level, _event_type,
    public.mi_hash_student(_tenant_id, _student_id),
    COALESCE(_payload, '{}'::jsonb), now()
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'mi_emit_event failed: %', SQLERRM;
END;
$$;


--

--
-- Name: mi_hash_student(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mi_hash_student(_tenant_id uuid, _student_id uuid) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  SELECT CASE
    WHEN _student_id IS NULL THEN NULL
    ELSE md5(_tenant_id::text || ':' || _student_id::text)
  END
$$;


--

--
-- Name: mi_list_insights(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mi_list_insights(p_session_token text, p_limit integer DEFAULT 50) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.ministry_sessions
   WHERE session_token = p_session_token AND expires_at > now();
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(i) ORDER BY i.created_at DESC)
    FROM (
      SELECT id, scope, school_id, region_id, subject_id, severity,
             title, summary, evidence, window_start, window_end,
             created_at, acknowledged_at
      FROM public.mi_insights
      WHERE tenant_id = v_tenant
      ORDER BY created_at DESC
      LIMIT GREATEST(p_limit, 1)
    ) i
  ), '[]'::jsonb);
END;
$$;


--

--
-- Name: mi_national_overview(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mi_national_overview(p_session_token text, p_days integer DEFAULT 30) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_tenant uuid; v_since date;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.ministry_sessions
   WHERE session_token = p_session_token AND expires_at > now();
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  v_since := (now() - make_interval(days => GREATEST(p_days, 1)))::date;

  RETURN jsonb_build_object(
    'tenant_id', v_tenant,
    'window_days', p_days,
    'totals_by_event', (
      SELECT COALESCE(jsonb_object_agg(event_type, total), '{}'::jsonb)
      FROM (
        SELECT event_type::text, SUM(event_count)::bigint AS total
        FROM public.mi_daily_rollups
        WHERE tenant_id = v_tenant AND day >= v_since
        GROUP BY event_type
      ) t
    ),
    'active_schools', (
      SELECT COUNT(DISTINCT school_id)
      FROM public.mi_daily_rollups
      WHERE tenant_id = v_tenant AND day >= v_since AND school_id IS NOT NULL
    ),
    'active_regions', (
      SELECT COUNT(DISTINCT region_id)
      FROM public.mi_daily_rollups
      WHERE tenant_id = v_tenant AND day >= v_since AND region_id IS NOT NULL
    ),
    'daily_activity', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('day', day, 'events', total) ORDER BY day), '[]'::jsonb)
      FROM (
        SELECT day, SUM(event_count)::bigint AS total
        FROM public.mi_daily_rollups
        WHERE tenant_id = v_tenant AND day >= v_since
        GROUP BY day
      ) d
    )
  );
END;
$$;


--

--
-- Name: mi_regional_breakdown(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mi_regional_breakdown(p_session_token text, p_days integer DEFAULT 30) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_tenant uuid; v_since date;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.ministry_sessions
   WHERE session_token = p_session_token AND expires_at > now();
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  v_since := (now() - make_interval(days => GREATEST(p_days, 1)))::date;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'region_id', r.id,
      'region_name', r.name,
      'event_count', COALESCE(x.total, 0),
      'school_count', COALESCE(x.schools, 0)
    ) ORDER BY r.name)
    FROM public.mc_regions r
    LEFT JOIN (
      SELECT region_id, SUM(event_count)::bigint AS total,
             COUNT(DISTINCT school_id)::bigint AS schools
      FROM public.mi_daily_rollups
      WHERE tenant_id = v_tenant AND day >= v_since AND region_id IS NOT NULL
      GROUP BY region_id
    ) x ON x.region_id = r.id
    WHERE r.tenant_id = v_tenant
  ), '[]'::jsonb);
END;
$$;


--

--
-- Name: mi_run_daily_aggregation(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mi_run_daily_aggregation(_target_day date DEFAULT ((now() - '1 day'::interval))::date) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_inserted integer;
BEGIN
  DELETE FROM public.mi_daily_rollups WHERE day = _target_day;

  WITH agg AS (
    SELECT
      e.tenant_id, e.school_id, e.region_id, e.subject_id, e.grade_level, e.event_type,
      _target_day AS day,
      COUNT(*)::int AS event_count,
      COUNT(DISTINCT e.student_hash)::int AS distinct_actors,
      AVG( NULLIF( (e.payload->>'score')::numeric, NULL) ) AS avg_score,
      SUM( COALESCE((e.payload->>'grade')::numeric,
                    (e.payload->>'score')::numeric,
                    (e.payload->>'length')::numeric, 1) ) AS sum_signal
    FROM public.mi_educational_events e
    WHERE e.occurred_at >= _target_day
      AND e.occurred_at <  _target_day + interval '1 day'
    GROUP BY e.tenant_id, e.school_id, e.region_id, e.subject_id, e.grade_level, e.event_type
  )
  INSERT INTO public.mi_daily_rollups
    (tenant_id, school_id, region_id, subject_id, grade_level, event_type, day,
     event_count, distinct_actors, avg_score, sum_signal)
  SELECT tenant_id, school_id, region_id, subject_id, grade_level, event_type, day,
         event_count, distinct_actors, avg_score, sum_signal
  FROM agg;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN jsonb_build_object('day', _target_day, 'rollups_written', v_inserted);
END;
$$;


--

--
-- Name: mi_school_region(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mi_school_region(_school_id uuid) RETURNS uuid
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT region_id FROM public.mc_school_region_assignments
  WHERE school_id = _school_id LIMIT 1
$$;


--

--
-- Name: mi_school_snapshot(text, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mi_school_snapshot(p_session_token text, p_school_id uuid, p_days integer DEFAULT 30) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_tenant uuid; v_since date; v_school_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.ministry_sessions
   WHERE session_token = p_session_token AND expires_at > now();
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;

  SELECT tenant_id INTO v_school_tenant FROM public.schools WHERE id = p_school_id;
  IF v_school_tenant IS NULL OR v_school_tenant <> v_tenant THEN
    RAISE EXCEPTION 'school not in tenant';
  END IF;

  v_since := (now() - make_interval(days => GREATEST(p_days, 1)))::date;

  RETURN jsonb_build_object(
    'school_id', p_school_id,
    'window_days', p_days,
    'totals_by_event', (
      SELECT COALESCE(jsonb_object_agg(event_type, total), '{}'::jsonb)
      FROM (
        SELECT event_type::text, SUM(event_count)::bigint AS total
        FROM public.mi_daily_rollups
        WHERE tenant_id = v_tenant AND school_id = p_school_id AND day >= v_since
        GROUP BY event_type
      ) t
    ),
    'by_subject', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'subject_id', subject_id, 'events', total
      ) ORDER BY total DESC), '[]'::jsonb)
      FROM (
        SELECT subject_id, SUM(event_count)::bigint AS total
        FROM public.mi_daily_rollups
        WHERE tenant_id = v_tenant AND school_id = p_school_id AND day >= v_since
          AND subject_id IS NOT NULL
        GROUP BY subject_id
      ) s
    )
  );
END;
$$;


--

--
-- Name: mi_tg_assignment_submission(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mi_tg_assignment_submission() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_tenant uuid; v_school uuid; v_subject uuid; v_grade text;
BEGIN
  SELECT a.school_id, a.subject_id, a.grade_level INTO v_school, v_subject, v_grade
    FROM public.assignments a WHERE a.id = NEW.assignment_id;
  SELECT tenant_id INTO v_tenant FROM public.schools WHERE id = v_school;
  PERFORM public.mi_emit_event(v_tenant, v_school, v_subject, NULL, v_grade,
    'homework_submission'::public.mi_event_type, NEW.student_id,
    jsonb_build_object('grade', NEW.grade, 'graded', NEW.graded_at IS NOT NULL, 'submitted_at', NEW.submitted_at));
  RETURN NEW;
END; $$;


--

--
-- Name: mi_tg_chat_message(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mi_tg_chat_message() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_tenant uuid; v_school uuid;
BEGIN
  SELECT p.school_id INTO v_school FROM public.profiles p WHERE p.id = NEW.user_id;
  SELECT tenant_id INTO v_tenant FROM public.schools WHERE id = v_school;
  PERFORM public.mi_emit_event(v_tenant, v_school, NULL, NULL, NULL,
    'tutor_interaction'::public.mi_event_type, NEW.user_id,
    jsonb_build_object('length', COALESCE(char_length(NEW.content), 0)));
  RETURN NEW;
END; $$;


--

--
-- Name: mi_tg_course_material(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mi_tg_course_material() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.schools WHERE id = NEW.school_id;
  PERFORM public.mi_emit_event(v_tenant, NEW.school_id, NULL, NULL, NEW.grade_level,
    'material_uploaded'::public.mi_event_type, NEW.uploaded_by,
    jsonb_build_object('subject', NEW.subject, 'has_file', NEW.file_url IS NOT NULL));
  RETURN NEW;
END; $$;


--

--
-- Name: mi_tg_exam_submission(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mi_tg_exam_submission() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_tenant uuid; v_school uuid; v_subject uuid;
BEGIN
  SELECT e.school_id, e.subject_id INTO v_school, v_subject FROM public.exams e WHERE e.id = NEW.exam_id;
  SELECT tenant_id INTO v_tenant FROM public.schools WHERE id = v_school;
  PERFORM public.mi_emit_event(v_tenant, v_school, v_subject, NULL, NULL,
    'exam_submission'::public.mi_event_type, NEW.student_id,
    jsonb_build_object('score', NEW.score, 'auto_graded', NEW.auto_graded, 'submitted_at', NEW.submitted_at));
  RETURN NEW;
END; $$;


--

--
-- Name: mi_tg_lesson_event(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mi_tg_lesson_event() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.schools WHERE id = NEW.school_id;
  PERFORM public.mi_emit_event(v_tenant, NEW.school_id, NULL, NEW.concept_ref, NULL,
    'lesson_event'::public.mi_event_type, NULL,
    jsonb_build_object('kind', NEW.kind, 'priority', NEW.priority));
  RETURN NEW;
END; $$;


--

--
-- Name: mi_tg_material_view(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mi_tg_material_view() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_tenant uuid; v_school uuid;
BEGIN
  BEGIN
    SELECT cm.school_id INTO v_school FROM public.course_materials cm WHERE cm.id = NEW.material_id;
  EXCEPTION WHEN OTHERS THEN v_school := NULL;
  END;
  IF v_school IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant FROM public.schools WHERE id = v_school;
  END IF;
  PERFORM public.mi_emit_event(v_tenant, v_school, NULL, NULL, NULL,
    'material_view'::public.mi_event_type, NEW.user_id,
    jsonb_build_object('material_id', NEW.material_id));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END; $$;


--

--
-- Name: mi_tg_saved_lecture(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mi_tg_saved_lecture() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.schools WHERE id = NEW.school_id;
  PERFORM public.mi_emit_event(v_tenant, NEW.school_id, NULL, NULL, NEW.grade_level,
    'lecture_generated'::public.mi_event_type, NEW.user_id,
    jsonb_build_object('subject', NEW.subject, 'mode', NEW.mode));
  RETURN NEW;
END; $$;


--

--
-- Name: ministry_audit(uuid, uuid, text, text, text, uuid, jsonb, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ministry_audit(p_tenant_id uuid, p_actor_id uuid, p_actor_label text, p_action text, p_entity_type text, p_entity_id uuid, p_before jsonb, p_after jsonb, p_metadata jsonb DEFAULT NULL::jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.ministry_audit_log
    (tenant_id, actor_id, actor_label, action, entity_type, entity_id, before_state, after_state, metadata)
  VALUES
    (p_tenant_id, p_actor_id, p_actor_label, p_action, p_entity_type, p_entity_id, p_before, p_after, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;


--

--
-- Name: ministry_session_tenant(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ministry_session_tenant(p_session_token text) RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_tenant uuid;
BEGIN
  IF p_session_token IS NULL OR length(p_session_token) < 20 THEN RETURN NULL; END IF;
  SELECT tenant_id INTO v_tenant FROM public.ministry_sessions
   WHERE session_token = p_session_token
     AND is_active = true
     AND expires_at > now()
   LIMIT 1;
  RETURN v_tenant;
END; $$;


--

--
-- Name: provision_tenant(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.provision_tenant(payload jsonb) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
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


--

--
-- Name: publish_change_request(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.publish_change_request(p_request_id uuid, p_session_token text DEFAULT NULL::text, p_publisher_label text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $_$
DECLARE
  v_req RECORD;
  v_actor uuid;
  v_label text;
  v_applier text;
  v_result jsonb;
BEGIN
  SELECT * INTO v_req FROM public.ministry_change_requests WHERE id = p_request_id FOR UPDATE;
  IF v_req IS NULL THEN RAISE EXCEPTION 'Change request not found'; END IF;
  IF v_req.status <> 'approved' THEN
    RAISE EXCEPTION 'Only approved requests can be published (current: %)', v_req.status;
  END IF;
  IF NOT public.has_ministry_capability(auth.uid(), v_req.tenant_id, 'change_request.publish', p_session_token) THEN
    RAISE EXCEPTION 'Not authorized to publish';
  END IF;

  SELECT applier_function INTO v_applier
  FROM public.ministry_change_appliers WHERE entity_type = v_req.entity_type;
  IF v_applier IS NULL THEN
    RAISE EXCEPTION 'No applier registered for entity_type %', v_req.entity_type;
  END IF;

  v_actor := auth.uid();
  v_label := COALESCE(p_publisher_label,
    CASE WHEN p_session_token IS NOT NULL THEN 'Ministry Session' ELSE 'User' END);

  -- Dynamic dispatch to registered applier
  EXECUTE format('SELECT public.%I($1, $2)', v_applier)
    INTO v_result USING p_request_id, v_req.payload;

  UPDATE public.ministry_change_requests
     SET status='published', publisher_id=v_actor, publisher_label=v_label, published_at=now()
   WHERE id = p_request_id;

  PERFORM public.ministry_audit(v_req.tenant_id, v_actor, v_label, 'change_request.publish',
    v_req.entity_type, v_req.entity_id, v_req.previous_snapshot, v_req.payload,
    jsonb_build_object('applier_result', v_result));

  RETURN v_result;
END; $_$;


--

--
-- Name: recalculate_difficulty_level(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recalculate_difficulty_level() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE
  recent_correct INTEGER;
  recent_total INTEGER;
  accuracy NUMERIC(5,2);
  new_level TEXT;
BEGIN
  -- Get last 20 answers for this user+subject
  SELECT
    COUNT(*) FILTER (WHERE is_correct = true),
    COUNT(*)
  INTO recent_correct, recent_total
  FROM (
    SELECT is_correct
    FROM public.student_answer_history
    WHERE user_id = NEW.user_id AND subject = NEW.subject
    ORDER BY created_at DESC
    LIMIT 20
  ) recent;

  IF recent_total = 0 THEN
    accuracy := 0;
    new_level := 'intermediate';
  ELSE
    accuracy := (recent_correct::NUMERIC / recent_total) * 100;
    IF accuracy >= 85 THEN
      new_level := 'advanced';
    ELSIF accuracy >= 55 THEN
      new_level := 'intermediate';
    ELSE
      new_level := 'beginner';
    END IF;
  END IF;

  -- Upsert the learning profile
  INSERT INTO public.student_learning_profiles (user_id, subject, difficulty_level, total_questions_answered, correct_answers, recent_accuracy, updated_at)
  VALUES (NEW.user_id, NEW.subject, new_level, 1, CASE WHEN NEW.is_correct THEN 1 ELSE 0 END, accuracy, now())
  ON CONFLICT (user_id, subject)
  DO UPDATE SET
    difficulty_level = new_level,
    total_questions_answered = student_learning_profiles.total_questions_answered + 1,
    correct_answers = student_learning_profiles.correct_answers + CASE WHEN NEW.is_correct THEN 1 ELSE 0 END,
    recent_accuracy = accuracy,
    updated_at = now();

  RETURN NEW;
END;
$$;


--

--
-- Name: recompute_mirror_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recompute_mirror_stats() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE
  v_total int;
  v_matched int;
  v_acc numeric(5,2);
  v_drift numeric(5,2);
BEGIN
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE prediction_matched IS TRUE),
    COALESCE(AVG(drift_score) FILTER (WHERE drift_score IS NOT NULL), 0)
  INTO v_total, v_matched, v_drift
  FROM (
    SELECT prediction_matched, drift_score
    FROM public.cognitive_mirror_snapshots
    WHERE user_id = NEW.user_id AND prediction_matched IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 50
  ) recent;

  IF v_total = 0 THEN
    v_acc := 0;
  ELSE
    v_acc := (v_matched::numeric / v_total) * 100;
  END IF;

  INSERT INTO public.cognitive_mirror_stats (user_id, school_id, total_predictions, matched_predictions, rolling_accuracy, avg_drift, last_updated)
  VALUES (NEW.user_id, NEW.school_id, v_total, v_matched, v_acc, v_drift, now())
  ON CONFLICT (user_id) DO UPDATE SET
    school_id = COALESCE(EXCLUDED.school_id, cognitive_mirror_stats.school_id),
    total_predictions = EXCLUDED.total_predictions,
    matched_predictions = EXCLUDED.matched_predictions,
    rolling_accuracy = EXCLUDED.rolling_accuracy,
    avg_drift = EXCLUDED.avg_drift,
    last_updated = now();

  RETURN NEW;
END;
$$;


--

--
-- Name: record_review_delivered(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_review_delivered(p_card_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT user_id INTO v_owner FROM public.fsrs_card_state WHERE id = p_card_id;
  IF v_owner IS NULL THEN RETURN; END IF;
  IF auth.uid() <> v_owner AND NOT public.is_super_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.fsrs_card_state
     SET last_delivered_at = now()
   WHERE id = p_card_id;
END;
$$;


--

--
-- Name: refresh_confidence_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_confidence_stats() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE
  v_avg_conf NUMERIC;
  v_avg_acc NUMERIC;
  v_n INTEGER;
BEGIN
  SELECT
    AVG(confidence_level::NUMERIC / 4.0),
    AVG(CASE WHEN was_correct THEN 1.0 ELSE 0.0 END),
    COUNT(*)
  INTO v_avg_conf, v_avg_acc, v_n
  FROM public.confidence_responses
  WHERE user_id = NEW.user_id
    AND COALESCE(subject,'') = COALESCE(NEW.subject,'')
    AND COALESCE(topic,'') = COALESCE(NEW.topic,'');

  INSERT INTO public.confidence_calibration_stats
    (user_id, school_id, subject, topic, avg_confidence, avg_accuracy, calibration_gap, sample_size, updated_at)
  VALUES
    (NEW.user_id, NEW.school_id, NEW.subject, NEW.topic,
     COALESCE(v_avg_conf,0), COALESCE(v_avg_acc,0),
     COALESCE(v_avg_conf,0) - COALESCE(v_avg_acc,0),
     COALESCE(v_n,0), now())
  ON CONFLICT (user_id, subject, topic) DO UPDATE
    SET avg_confidence = EXCLUDED.avg_confidence,
        avg_accuracy = EXCLUDED.avg_accuracy,
        calibration_gap = EXCLUDED.calibration_gap,
        sample_size = EXCLUDED.sample_size,
        school_id = EXCLUDED.school_id,
        updated_at = now();
  RETURN NEW;
END;
$$;


--

--
-- Name: reject_school_profile(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_school_profile(p_profile_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE
  v_profile RECORD;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_profile_id;
  IF v_profile IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Profile not found');
  END IF;

  IF NOT (is_school_admin_of(auth.uid(), v_profile.school_id) OR is_super_admin()) THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;

  UPDATE public.profiles
     SET status = 'rejected', is_active = false
   WHERE id = p_profile_id;

  UPDATE public.invite_requests
     SET status = 'denied', updated_at = now()
   WHERE status = 'pending'
     AND (user_id = p_profile_id OR lower(email) = lower(v_profile.email));

  RETURN json_build_object('success', true, 'profile_id', p_profile_id);
END;
$$;


--

--
-- Name: resolve_ministry_request(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_ministry_request(p_request_id uuid, p_action text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE
  v_request RECORD;
  v_caller_email text;
BEGIN
  -- Only super admin
  SELECT email INTO v_caller_email FROM auth.users WHERE id = auth.uid();
  IF NOT public.is_super_admin() THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO v_request FROM ministry_access_requests WHERE id = p_request_id AND status = 'pending';
  IF v_request IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Request not found or already resolved');
  END IF;

  IF p_action = 'approve' THEN
    -- Update request
    UPDATE ministry_access_requests SET status = 'approved', resolved_at = now(), resolved_by = auth.uid()
    WHERE id = p_request_id;

    -- Create ministry session
    INSERT INTO ministry_sessions (session_token, ip_address, is_active, expires_at)
    VALUES (v_request.session_token, v_request.ip_address, true, now() + interval '15 minutes');

    RETURN json_build_object('success', true, 'action', 'approved');

  ELSIF p_action = 'deny' THEN
    -- Update request
    UPDATE ministry_access_requests SET status = 'denied', resolved_at = now(), resolved_by = auth.uid()
    WHERE id = p_request_id;

    -- Ban the IP and device
    IF v_request.ip_address IS NOT NULL THEN
      INSERT INTO ministry_ip_bans (ip_address, device_fingerprint, banned_by, reason)
      VALUES (v_request.ip_address, v_request.device_fingerprint, auth.uid(), 'Ministry access denied by super admin');
    END IF;

    RETURN json_build_object('success', true, 'action', 'denied', 'ip_banned', v_request.ip_address);
  END IF;

  RETURN json_build_object('success', false, 'error', 'Invalid action');
END;
$$;


--

--
-- Name: review_change_request(uuid, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.review_change_request(p_request_id uuid, p_decision text, p_notes text DEFAULT NULL::text, p_session_token text DEFAULT NULL::text, p_reviewer_label text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_req RECORD; v_actor uuid; v_label text;
BEGIN
  SELECT * INTO v_req FROM public.ministry_change_requests WHERE id = p_request_id FOR UPDATE;
  IF v_req IS NULL THEN RAISE EXCEPTION 'Change request not found'; END IF;
  IF v_req.status <> 'in_review' THEN
    RAISE EXCEPTION 'Only in-review requests can be reviewed (current: %)', v_req.status;
  END IF;
  IF NOT public.has_ministry_capability(auth.uid(), v_req.tenant_id, 'change_request.review', p_session_token) THEN
    RAISE EXCEPTION 'Not authorized to review change requests';
  END IF;
  v_actor := auth.uid();
  v_label := COALESCE(p_reviewer_label,
    CASE WHEN p_session_token IS NOT NULL THEN 'Ministry Session' ELSE 'User' END);

  IF p_decision = 'approve' THEN
    UPDATE public.ministry_change_requests
       SET status='approved', reviewer_id=v_actor, reviewer_label=v_label,
           review_notes=p_notes, approved_at=now()
     WHERE id=p_request_id;
  ELSIF p_decision = 'reject' THEN
    UPDATE public.ministry_change_requests
       SET status='rejected', reviewer_id=v_actor, reviewer_label=v_label,
           reject_reason=p_notes, rejected_at=now()
     WHERE id=p_request_id;
  ELSE
    RAISE EXCEPTION 'Decision must be approve or reject';
  END IF;

  PERFORM public.ministry_audit(v_req.tenant_id, v_actor, v_label, 'change_request.'||p_decision,
    'ministry_change_request', p_request_id,
    to_jsonb(v_req), jsonb_build_object('notes', p_notes), NULL);
END; $$;


--

--
-- Name: revoke_ministry_role(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.revoke_ministry_role(p_assignment_id uuid, p_session_token text DEFAULT NULL::text, p_actor_label text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_a RECORD;
BEGIN
  SELECT * INTO v_a FROM public.ministry_role_assignments WHERE id = p_assignment_id;
  IF v_a IS NULL THEN RETURN; END IF;
  IF NOT public.has_ministry_capability(auth.uid(), v_a.tenant_id, 'permissions.assign', p_session_token) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  DELETE FROM public.ministry_role_assignments WHERE id = p_assignment_id;
  PERFORM public.ministry_audit(v_a.tenant_id, auth.uid(),
    COALESCE(p_actor_label, 'Ministry Session'),
    'role.revoke', 'ministry_role_assignment', p_assignment_id,
    to_jsonb(v_a), NULL, NULL);
END; $$;


--

--
-- Name: rotate_teacher_category_code(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rotate_teacher_category_code(p_category_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
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


--

--
-- Name: seed_default_subjects(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_default_subjects(p_school_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE
  v_tenant_id uuid;
  v_seed      jsonb;
  v_fallback  jsonb := '[
    {"slug":"mathematics","name":"Mathematics","emoji":"📐","color":"from-violet-500 to-purple-600"},
    {"slug":"english","name":"English","emoji":"📚","color":"from-rose-500 to-pink-600"},
    {"slug":"science","name":"Science","emoji":"🔬","color":"from-emerald-500 to-green-600"}
  ]'::jsonb;
  item jsonb;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM public.schools WHERE id = p_school_id;

  IF v_tenant_id IS NOT NULL THEN
    SELECT default_subjects INTO v_seed FROM public.tenants WHERE id = v_tenant_id;
  END IF;

  IF v_seed IS NULL OR jsonb_array_length(v_seed) = 0 THEN
    v_seed := v_fallback;
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(v_seed) LOOP
    INSERT INTO public.subjects(school_id, name, slug, emoji, color, is_default)
    VALUES (
      p_school_id,
      item->>'name',
      item->>'slug',
      COALESCE(item->>'emoji',''),
      COALESCE(item->>'color',''),
      true
    )
    ON CONFLICT (school_id, slug) WHERE slug IS NOT NULL DO NOTHING;
  END LOOP;
END;
$$;


--

--
-- Name: seed_default_teacher_categories(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.seed_default_teacher_categories(p_school_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
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


--

--
-- Name: set_feature_flag(uuid, text, boolean, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_feature_flag(p_tenant_id uuid, p_flag_key text, p_enabled boolean, p_config jsonb DEFAULT '{}'::jsonb, p_description text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_row public.tenant_feature_flags;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorised');
  END IF;
  IF p_tenant_id IS NULL OR p_flag_key IS NULL OR btrim(p_flag_key) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'tenant_id and flag_key are required');
  END IF;
  INSERT INTO public.tenant_feature_flags (tenant_id, flag_key, enabled, config, description)
  VALUES (p_tenant_id, lower(btrim(p_flag_key)), COALESCE(p_enabled,false),
          COALESCE(p_config,'{}'::jsonb), p_description)
  ON CONFLICT (tenant_id, flag_key) DO UPDATE
    SET enabled=EXCLUDED.enabled, config=EXCLUDED.config,
        description=COALESCE(EXCLUDED.description, public.tenant_feature_flags.description),
        updated_at=now()
  RETURNING * INTO v_row;
  RETURN jsonb_build_object('success', true, 'flag', row_to_json(v_row));
END;$$;


--

--
-- Name: signup_as_moderator(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.signup_as_moderator(p_email text, p_invite_code text, p_full_name text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE
  v_code_record RECORD;
  v_request_id uuid;
BEGIN
  SELECT * INTO v_code_record FROM moderator_invite_codes
  WHERE code = upper(p_invite_code) AND used = false AND expires_at > now();

  IF v_code_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid or expired invite code');
  END IF;

  IF EXISTS (SELECT 1 FROM moderator_requests WHERE lower(email) = lower(p_email) AND status = 'pending') THEN
    RETURN json_build_object('success', false, 'error', 'Request already pending');
  END IF;

  INSERT INTO moderator_requests (code_id, name, email, status)
  VALUES (v_code_record.id, p_full_name, lower(p_email), 'pending')
  RETURNING id INTO v_request_id;

  RETURN json_build_object('success', true, 'request_id', v_request_id);
END;
$$;


--

--
-- Name: signup_as_parent(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.signup_as_parent(p_parent_user_id uuid, p_parent_code text, p_full_name text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE
  v_code_rec RECORD;
  v_parent_email text;
  v_tenant_slug text;
  v_tenant_name text;
BEGIN
  SELECT pic.*, s.name as school_name, s.tenant_id as tid
  INTO v_code_rec
  FROM parent_invite_codes pic
  JOIN schools s ON s.id = pic.school_id
  WHERE pic.code = upper(p_parent_code)
    AND pic.used = false;

  IF v_code_rec IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid or already used parent code.');
  END IF;

  SELECT email INTO v_parent_email FROM auth.users WHERE id = p_parent_user_id;

  INSERT INTO profiles (id, school_id, full_name, email, user_type, status, is_active)
  VALUES (p_parent_user_id, v_code_rec.school_id, p_full_name, v_parent_email, 'parent', 'approved', true)
  ON CONFLICT (id) DO UPDATE SET
    school_id = v_code_rec.school_id,
    full_name = p_full_name,
    user_type = 'parent',
    status = 'approved',
    is_active = true;

  INSERT INTO parent_students (parent_id, student_id, school_id)
  VALUES (p_parent_user_id, v_code_rec.student_id, v_code_rec.school_id)
  ON CONFLICT (parent_id, student_id) DO NOTHING;

  UPDATE parent_invite_codes SET used = true, used_by = p_parent_user_id WHERE id = v_code_rec.id;

  SELECT slug, country_name INTO v_tenant_slug, v_tenant_name
    FROM public.tenants WHERE id = v_code_rec.tid;

  RETURN json_build_object(
    'success', true,
    'school_name', v_code_rec.school_name,
    'student_id', v_code_rec.student_id,
    'tenant_id', v_code_rec.tid,
    'tenant_slug', v_tenant_slug,
    'tenant_name', v_tenant_name
  );
END;
$$;


--

--
-- Name: signup_with_invite_code(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.signup_with_invite_code(p_email text, p_invite_code text, p_full_name text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE
  v_code_record RECORD;
  v_perm_record RECORD;
  v_request_id UUID;
  v_profile_id UUID;
  v_tcat_id UUID;
  v_school_id UUID;
  v_role TEXT;
  v_school_name TEXT;
  v_tenant_id UUID;
  v_tenant_slug TEXT;
  v_tenant_name TEXT;
BEGIN
  SELECT ic.*, s.name as school_name, s.id as sid, s.tenant_id as tid
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
    v_tenant_id := v_code_record.tid;
  ELSE
    SELECT tc.id AS tcat_id, tc.school_id, s.name AS school_name, s.tenant_id AS tid
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
    v_tenant_id := v_perm_record.tid;
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
  VALUES (v_profile_id, v_school_id, p_full_name, LOWER(p_email), v_role, 'pending', false, v_tcat_id)
  ON CONFLICT DO NOTHING;

  SELECT slug, country_name INTO v_tenant_slug, v_tenant_name
    FROM public.tenants WHERE id = v_tenant_id;

  RETURN json_build_object(
    'success', true,
    'request_id', v_request_id,
    'school_name', v_school_name,
    'role', v_role,
    'tenant_id', v_tenant_id,
    'tenant_slug', v_tenant_slug,
    'tenant_name', v_tenant_name
  );
END;
$$;


--

--
-- Name: snapshot_note_on_save(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.snapshot_note_on_save() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE
  v_hash TEXT;
  v_last_hash TEXT;
BEGIN
  v_hash := md5(COALESCE(NEW.title,'') || '||' || COALESCE(NEW.content,''));
  SELECT content_hash INTO v_last_hash
  FROM public.note_snapshots
  WHERE note_id = NEW.id
  ORDER BY snapshot_at DESC
  LIMIT 1;

  IF v_last_hash IS DISTINCT FROM v_hash THEN
    INSERT INTO public.note_snapshots (note_id, user_id, title, content, content_hash, word_count)
    VALUES (NEW.id, NEW.user_id, NEW.title, COALESCE(NEW.content,''), v_hash,
            array_length(regexp_split_to_array(COALESCE(NEW.content,''), '\s+'), 1));
  END IF;
  RETURN NEW;
END;
$$;


--

--
-- Name: subjects_after_insert_sync(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.subjects_after_insert_sync() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
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


--

--
-- Name: subjects_sync_on_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.subjects_sync_on_delete() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
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
$$;


--

--
-- Name: submit_change_request(uuid, text, uuid, text, text, jsonb, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_change_request(p_tenant_id uuid, p_entity_type text, p_entity_id uuid, p_title text, p_summary text, p_payload jsonb, p_session_token text DEFAULT NULL::text, p_author_label text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_id uuid; v_actor uuid; v_label text;
BEGIN
  IF NOT public.has_ministry_capability(auth.uid(), p_tenant_id, 'change_request.draft', p_session_token) THEN
    RAISE EXCEPTION 'Not authorized to submit change requests for this tenant';
  END IF;
  v_actor := auth.uid();
  v_label := COALESCE(p_author_label,
    CASE WHEN p_session_token IS NOT NULL THEN 'Ministry Session' ELSE 'User' END);

  INSERT INTO public.ministry_change_requests
    (tenant_id, entity_type, entity_id, title, summary, payload, status,
     author_id, author_label, submitted_at)
  VALUES (p_tenant_id, p_entity_type, p_entity_id, p_title, p_summary, p_payload,
     'in_review', v_actor, v_label, now())
  RETURNING id INTO v_id;

  PERFORM public.ministry_audit(p_tenant_id, v_actor, v_label, 'change_request.submit',
     'ministry_change_request', v_id, NULL,
     jsonb_build_object('entity_type', p_entity_type, 'title', p_title), NULL);
  RETURN v_id;
END; $$;


--

--
-- Name: suspend_tenant(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.suspend_tenant(p_tenant_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
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


--

--
-- Name: tc_after_delete_sync(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tc_after_delete_sync() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
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


--

--
-- Name: tc_after_insert_sync(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tc_after_insert_sync() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
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


--

--
-- Name: touch_bandit_arm_state(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_bandit_arm_state() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--

--
-- Name: touch_population_priors_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_population_priors_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


--

--
-- Name: touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;


--

--
-- Name: update_concept_mastery(uuid, uuid, text, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_concept_mastery(p_user_id uuid, p_school_id uuid, p_subject text, p_topic text, p_was_correct boolean) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE
  v_id UUID;
  v_ease NUMERIC;
  v_interval NUMERIC;
  v_reps INTEGER;
  v_score NUMERIC;
BEGIN
  SELECT id, ease_factor, interval_days, repetitions, mastery_score
  INTO v_id, v_ease, v_interval, v_reps, v_score
  FROM public.concept_mastery
  WHERE user_id = p_user_id AND subject = p_subject AND topic = p_topic;

  IF v_id IS NULL THEN
    INSERT INTO public.concept_mastery (user_id, school_id, subject, topic, mastery_score, ease_factor, interval_days, repetitions, last_practiced_at, next_review_at)
    VALUES (p_user_id, p_school_id, p_subject, p_topic,
            CASE WHEN p_was_correct THEN 0.6 ELSE 0.3 END,
            2.5, CASE WHEN p_was_correct THEN 1 ELSE 0.5 END,
            CASE WHEN p_was_correct THEN 1 ELSE 0 END,
            now(),
            now() + (CASE WHEN p_was_correct THEN interval '1 day' ELSE interval '6 hours' END))
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  IF p_was_correct THEN
    v_reps := v_reps + 1;
    v_ease := GREATEST(1.3, v_ease + 0.1);
    v_interval := CASE
      WHEN v_reps = 1 THEN 1
      WHEN v_reps = 2 THEN 3
      ELSE LEAST(180, v_interval * v_ease)
    END;
    v_score := LEAST(1.0, v_score + 0.1);
  ELSE
    v_reps := 0;
    v_ease := GREATEST(1.3, v_ease - 0.2);
    v_interval := 0.5;
    v_score := GREATEST(0.0, v_score - 0.15);
  END IF;

  UPDATE public.concept_mastery
  SET ease_factor = v_ease,
      interval_days = v_interval,
      repetitions = v_reps,
      mastery_score = v_score,
      school_id = COALESCE(p_school_id, school_id),
      last_practiced_at = now(),
      next_review_at = now() + (v_interval * interval '1 day'),
      updated_at = now()
  WHERE id = v_id;

  RETURN v_id;
END;
$$;


--

--
-- Name: update_live_meetings_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_live_meetings_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


--

--
-- Name: update_tenant_defaults(uuid, jsonb, jsonb, jsonb, text, text[], text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_tenant_defaults(p_tenant_id uuid, p_default_subjects jsonb DEFAULT NULL::jsonb, p_grading_system jsonb DEFAULT NULL::jsonb, p_academic_calendar jsonb DEFAULT NULL::jsonb, p_default_language text DEFAULT NULL::text, p_supported_languages text[] DEFAULT NULL::text[], p_curriculum_framework text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorised');
  END IF;

  UPDATE public.tenants SET
    default_subjects     = COALESCE(p_default_subjects,     default_subjects),
    grading_system       = COALESCE(p_grading_system,       grading_system),
    academic_calendar    = COALESCE(p_academic_calendar,    academic_calendar),
    default_language     = COALESCE(p_default_language,     default_language),
    supported_languages  = COALESCE(p_supported_languages,  supported_languages),
    curriculum_framework = COALESCE(p_curriculum_framework, curriculum_framework),
    updated_at           = now()
  WHERE id = p_tenant_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tenant not found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;


--

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


--

--
-- Name: verify_ministry_code(text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verify_ministry_code(p_code text, p_ip_address text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text, p_device_fingerprint text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE
  v_code_row RECORD;
  v_tenant RECORD;
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

  SELECT slug, country_name
    INTO v_tenant
    FROM public.tenants
   WHERE id = v_code_row.tenant_id
   LIMIT 1;

  v_session_token := encode(extensions.gen_random_bytes(64), 'hex');

  INSERT INTO ministry_access_requests (session_token, ip_address, user_agent, device_fingerprint, status, tenant_id)
  VALUES (v_session_token, p_ip_address, p_user_agent, p_device_fingerprint, 'pending', v_code_row.tenant_id);

  RETURN json_build_object(
    'success', true,
    'session_token', v_session_token,
    'tenant_id', v_code_row.tenant_id,
    'tenant_slug', v_tenant.slug,
    'tenant_name', v_tenant.country_name,
    'message', 'Awaiting super admin approval'
  );
END;
$$;


--

--
-- Name: withdraw_change_request(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.withdraw_change_request(p_request_id uuid, p_session_token text DEFAULT NULL::text, p_actor_label text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_req RECORD; v_actor uuid; v_label text;
BEGIN
  SELECT * INTO v_req FROM public.ministry_change_requests WHERE id = p_request_id FOR UPDATE;
  IF v_req IS NULL THEN RAISE EXCEPTION 'Change request not found'; END IF;
  IF v_req.status IN ('published','withdrawn','rejected') THEN
    RAISE EXCEPTION 'Cannot withdraw a % request', v_req.status;
  END IF;
  IF NOT public.has_ministry_capability(auth.uid(), v_req.tenant_id, 'change_request.draft', p_session_token) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  v_actor := auth.uid();
  v_label := COALESCE(p_actor_label,
    CASE WHEN p_session_token IS NOT NULL THEN 'Ministry Session' ELSE 'User' END);

  UPDATE public.ministry_change_requests
     SET status='withdrawn', withdrawn_at=now() WHERE id=p_request_id;

  PERFORM public.ministry_audit(v_req.tenant_id, v_actor, v_label, 'change_request.withdraw',
    'ministry_change_request', p_request_id, to_jsonb(v_req), NULL, NULL);
END; $$;


--

-- Canonical Lumina schema source: domain tables
-- Derived from reviewed repository evidence; not historical deployment provenance.

--
-- Name: activity_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    school_id uuid NOT NULL,
    action text NOT NULL,
    details jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    teacher_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    subject text NOT NULL,
    grade_level text NOT NULL,
    due_date timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    class_id uuid,
    points integer DEFAULT 100,
    subject_id uuid,
    questions_json jsonb DEFAULT '[]'::jsonb,
    source text DEFAULT 'manual'::text NOT NULL,
    relevance_override boolean DEFAULT false NOT NULL
);


--

--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    school_id uuid,
    full_name text NOT NULL,
    student_teacher_id text,
    grade_level text,
    department text,
    user_type text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_test_data boolean DEFAULT false,
    is_active boolean DEFAULT true NOT NULL,
    email text,
    teacher_subject_id uuid,
    teacher_category_id uuid,
    CONSTRAINT profiles_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))),
    CONSTRAINT profiles_user_type_check CHECK ((user_type = ANY (ARRAY['student'::text, 'teacher'::text, 'school_admin'::text, 'parent'::text, 'moderator'::text])))
);


--

--
-- Name: schools; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schools (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    address text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_test_data boolean DEFAULT false,
    status text DEFAULT 'active'::text NOT NULL,
    activation_code_hash text,
    code_used boolean DEFAULT false NOT NULL,
    code_used_by uuid,
    code_used_at timestamp with time zone,
    subjects_sync_enabled boolean DEFAULT true NOT NULL,
    tenant_id uuid NOT NULL,
    governance_status text,
    CONSTRAINT schools_governance_status_check CHECK ((governance_status = ANY (ARRAY['operational'::text, 'suspended'::text, 'archived'::text]))),
    CONSTRAINT schools_status_check CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text])))
);


--

--
-- Name: submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assignment_id uuid NOT NULL,
    student_id uuid NOT NULL,
    content text,
    files text[] DEFAULT ARRAY[]::text[],
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    grade integer,
    feedback text,
    graded_at timestamp with time zone,
    graded_by uuid
);


--

--
-- Name: tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    country_name text NOT NULL,
    country_code text NOT NULL,
    ministry_name text NOT NULL,
    default_language text DEFAULT 'en'::text NOT NULL,
    supported_languages text[] DEFAULT ARRAY['en'::text] NOT NULL,
    grading_system jsonb DEFAULT '{}'::jsonb NOT NULL,
    academic_calendar jsonb DEFAULT '{}'::jsonb NOT NULL,
    curriculum_framework text,
    ai_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'provisioning'::text NOT NULL,
    is_visible boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    default_subjects jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT tenants_status_check CHECK ((status = ANY (ARRAY['active'::text, 'provisioning'::text, 'suspended'::text])))
);


--

--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role DEFAULT 'student'::public.app_role NOT NULL
);


--

--
-- Name: ministry_change_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ministry_change_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid,
    title text NOT NULL,
    summary text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    previous_snapshot jsonb,
    status public.ministry_change_status DEFAULT 'draft'::public.ministry_change_status NOT NULL,
    author_id uuid,
    author_label text,
    reviewer_id uuid,
    reviewer_label text,
    publisher_id uuid,
    publisher_label text,
    review_notes text,
    reject_reason text,
    submitted_at timestamp with time zone,
    approved_at timestamp with time zone,
    published_at timestamp with time zone,
    rejected_at timestamp with time zone,
    withdrawn_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: tenant_feature_flags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_feature_flags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    flag_key text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    mode text DEFAULT 'optional'::text,
    CONSTRAINT tenant_feature_flags_mode_check CHECK ((mode = ANY (ARRAY['disabled'::text, 'optional'::text, 'required'::text])))
);


--

--
-- Name: mc_curriculum_subjects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mc_curriculum_subjects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    subject_code text NOT NULL,
    name text NOT NULL,
    description text,
    applies_grades integer[] DEFAULT '{}'::integer[] NOT NULL,
    version_id uuid,
    language text,
    learning_standards jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    is_official boolean DEFAULT true NOT NULL,
    retired_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mc_curriculum_subjects_status_check CHECK ((status = ANY (ARRAY['active'::text, 'retired'::text])))
);


--

--
-- Name: mc_curriculum_version_defs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mc_curriculum_version_defs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    label text NOT NULL,
    effective_from date,
    effective_to date,
    status text DEFAULT 'draft'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mc_curriculum_version_defs_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'retired'::text])))
);


--

--
-- Name: mc_lumina_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mc_lumina_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    terminology jsonb DEFAULT '{}'::jsonb NOT NULL,
    explanation_style jsonb DEFAULT '{}'::jsonb NOT NULL,
    vocabulary jsonb DEFAULT '{}'::jsonb NOT NULL,
    pacing jsonb DEFAULT '{}'::jsonb NOT NULL,
    accessibility jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: ministry_announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ministry_announcements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    severity text DEFAULT 'info'::text NOT NULL,
    published boolean DEFAULT true NOT NULL,
    published_at timestamp with time zone DEFAULT now() NOT NULL,
    author_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ministry_announcements_severity_check CHECK ((severity = ANY (ARRAY['info'::text, 'warning'::text, 'critical'::text])))
);


--

--
-- Name: mc_educational_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mc_educational_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    policy_key text NOT NULL,
    title text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    allows_school_override boolean DEFAULT false NOT NULL,
    effective_from date,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mc_educational_policies_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'retired'::text])))
);


--

--
-- Name: mc_regions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mc_regions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    code text,
    kind text DEFAULT 'region'::text NOT NULL,
    parent_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mc_regions_kind_check CHECK ((kind = ANY (ARRAY['region'::text, 'district'::text, 'zone'::text])))
);


--

--
-- Name: ministry_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ministry_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    actor_id uuid,
    actor_label text NOT NULL,
    action text NOT NULL,
    entity_type text,
    entity_id uuid,
    before_state jsonb,
    after_state jsonb,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: ministry_role_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ministry_role_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role public.ministry_role NOT NULL,
    assigned_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: ability_estimates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ability_estimates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    school_id uuid,
    subject text NOT NULL,
    concept_id text,
    theta numeric(6,3) DEFAULT 0.0 NOT NULL,
    theta_se numeric(6,3) DEFAULT 1.5 NOT NULL,
    graded_count integer DEFAULT 0 NOT NULL,
    last_graded_at timestamp with time zone,
    provisional boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    elo_rating numeric(7,2) DEFAULT 1500.00 NOT NULL,
    elo_count integer DEFAULT 0 NOT NULL
);


--

--
-- Name: adaptive_quality_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adaptive_quality_scores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    school_id uuid,
    feature text NOT NULL,
    subject text,
    score numeric(4,3) NOT NULL,
    dimensions jsonb DEFAULT '{}'::jsonb NOT NULL,
    failures text[] DEFAULT '{}'::text[] NOT NULL,
    regenerated boolean DEFAULT false NOT NULL,
    profile_snapshot jsonb,
    output_excerpt text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT adaptive_quality_scores_score_check CHECK (((score >= (0)::numeric) AND (score <= (1)::numeric)))
);


--

--
-- Name: admin_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_id uuid NOT NULL,
    school_id uuid,
    action text NOT NULL,
    target_id uuid,
    target_type text,
    details jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: ai_output_signals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_output_signals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    school_id uuid,
    feature text NOT NULL,
    subject text,
    topic text,
    output_hash text NOT NULL,
    output_excerpt text,
    signal text NOT NULL,
    reason text,
    profile_snapshot jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_output_signals_signal_check CHECK ((signal = ANY (ARRAY['up'::text, 'down'::text, 'too_easy'::text, 'too_hard'::text, 'confusing'::text, 'perfect'::text, 'off_topic'::text, 'implicit_dwell_positive'::text, 'implicit_regen'::text, 'implicit_followup_confused'::text])))
);


--

--
-- Name: ale_api_students; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ale_api_students (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    api_key_id uuid NOT NULL,
    external_ref text NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: ale_api_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ale_api_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    api_key_id uuid,
    action text NOT NULL,
    status_code integer NOT NULL,
    latency_ms integer,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: anchor_recalibrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.anchor_recalibrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subject text NOT NULL,
    anchor_count integer DEFAULT 0 NOT NULL,
    responses_considered integer DEFAULT 0 NOT NULL,
    mean_drift numeric(6,3) DEFAULT 0 NOT NULL,
    items_shifted integer DEFAULT 0 NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: announcement_reads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.announcement_reads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    announcement_id uuid NOT NULL,
    user_id uuid NOT NULL,
    read_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.announcements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: assessment_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assessment_scores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pilot_id uuid,
    school_id uuid,
    student_id uuid NOT NULL,
    subject text NOT NULL,
    phase text NOT NULL,
    score numeric NOT NULL,
    total numeric NOT NULL,
    pct numeric GENERATED ALWAYS AS ((score / total)) STORED,
    measured_at timestamp with time zone DEFAULT now() NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT assessment_scores_phase_check CHECK ((phase = ANY (ARRAY['pretest'::text, 'posttest'::text, 'retention_7d'::text, 'retention_14d'::text, 'retention_30d'::text]))),
    CONSTRAINT assessment_scores_score_check CHECK ((score >= (0)::numeric)),
    CONSTRAINT assessment_scores_total_check CHECK ((total > (0)::numeric))
);


--

--
-- Name: assignment_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assignment_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assignment_id uuid NOT NULL,
    student_id uuid NOT NULL,
    content text,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    grade text,
    feedback text,
    graded_at timestamp with time zone,
    graded_by uuid
);


--

--
-- Name: assignment_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assignment_views (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assignment_id uuid NOT NULL,
    user_id uuid NOT NULL,
    viewed_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    class_id uuid NOT NULL,
    teacher_id uuid NOT NULL,
    date date NOT NULL,
    status text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT attendance_status_check CHECK ((status = ANY (ARRAY['present'::text, 'absent'::text, 'late'::text, 'excused'::text])))
);


--

--
-- Name: awards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.awards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    teacher_id uuid NOT NULL,
    school_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT awards_type_check CHECK ((type = ANY (ARRAY['medal'::text, 'certificate'::text, 'badge'::text])))
);


--

--
-- Name: bandit_arm_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bandit_arm_state (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scope text DEFAULT 'user'::text NOT NULL,
    user_id uuid,
    subject text NOT NULL,
    arm_id text NOT NULL,
    dim integer DEFAULT 8 NOT NULL,
    alpha numeric DEFAULT 1.0 NOT NULL,
    lambda numeric DEFAULT 1.0 NOT NULL,
    a_inv jsonb NOT NULL,
    b_vector jsonb NOT NULL,
    n_pulls integer DEFAULT 0 NOT NULL,
    cumulative_reward numeric DEFAULT 0 NOT NULL,
    last_decision_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bandit_arm_state_alpha_check CHECK ((alpha >= (0)::numeric)),
    CONSTRAINT bandit_arm_state_dim_check CHECK (((dim >= 1) AND (dim <= 64))),
    CONSTRAINT bandit_arm_state_lambda_check CHECK ((lambda > (0)::numeric)),
    CONSTRAINT bandit_arm_state_n_pulls_check CHECK ((n_pulls >= 0)),
    CONSTRAINT bandit_arm_state_scope_check CHECK ((scope = ANY (ARRAY['user'::text, 'population'::text]))),
    CONSTRAINT bandit_arm_state_scope_user_chk CHECK ((((scope = 'user'::text) AND (user_id IS NOT NULL)) OR ((scope = 'population'::text) AND (user_id IS NULL))))
);


--

--
-- Name: bandit_decisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bandit_decisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    subject text NOT NULL,
    arm_id text NOT NULL,
    concept_id uuid,
    lecture_id uuid,
    context_vec jsonb NOT NULL,
    ucb numeric NOT NULL,
    mean numeric NOT NULL,
    bonus numeric NOT NULL,
    alternatives jsonb,
    ensemble_p_at_decision numeric,
    source text DEFAULT 'teaching-generate'::text NOT NULL,
    rewarded boolean DEFAULT false NOT NULL,
    reward numeric,
    rewarded_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    behaviour_prob numeric,
    propensity_dist jsonb,
    softmax_temp numeric
);


--

--
-- Name: calibration_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calibration_state (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subject text NOT NULL,
    method text DEFAULT 'identity'::text NOT NULL,
    temperature numeric DEFAULT 1.0 NOT NULL,
    platt_a numeric DEFAULT 1.0 NOT NULL,
    platt_b numeric DEFAULT 0.0 NOT NULL,
    n_events integer DEFAULT 0 NOT NULL,
    brier_raw numeric,
    brier_cal numeric,
    ece_raw numeric,
    ece_cal numeric,
    auc_raw numeric,
    auc_cal numeric,
    fitted_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT calibration_state_method_check CHECK ((method = ANY (ARRAY['identity'::text, 'temperature'::text, 'platt'::text])))
);


--

--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chat_room_id uuid NOT NULL,
    user_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: chat_rooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_rooms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    name text DEFAULT 'General'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid NOT NULL
);


--

--
-- Name: classes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.classes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    name text NOT NULL,
    grade_level text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: cognitive_mirror_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cognitive_mirror_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    school_id uuid,
    subject text,
    topic text,
    question text NOT NULL,
    predicted_answer text,
    predicted_reasoning text,
    predicted_misconception text,
    actual_answer text,
    was_correct boolean,
    prediction_matched boolean,
    drift_score numeric(5,2),
    context jsonb DEFAULT '{}'::jsonb,
    source text DEFAULT 'chat'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone
);


--

--
-- Name: cognitive_mirror_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cognitive_mirror_stats (
    user_id uuid NOT NULL,
    school_id uuid,
    total_predictions integer DEFAULT 0 NOT NULL,
    matched_predictions integer DEFAULT 0 NOT NULL,
    rolling_accuracy numeric(5,2) DEFAULT 0 NOT NULL,
    avg_drift numeric(5,2) DEFAULT 0 NOT NULL,
    last_updated timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: concept_mastery; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.concept_mastery (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    school_id uuid,
    subject text NOT NULL,
    topic text NOT NULL,
    mastery_score numeric DEFAULT 0.5 NOT NULL,
    ease_factor numeric DEFAULT 2.5 NOT NULL,
    interval_days numeric DEFAULT 1 NOT NULL,
    repetitions integer DEFAULT 0 NOT NULL,
    last_practiced_at timestamp with time zone DEFAULT now() NOT NULL,
    next_review_at timestamp with time zone DEFAULT (now() + '1 day'::interval) NOT NULL,
    is_test_data boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    concept_id uuid,
    CONSTRAINT concept_mastery_mastery_score_check CHECK (((mastery_score >= (0)::numeric) AND (mastery_score <= (1)::numeric)))
);


--

--
-- Name: concept_standard_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.concept_standard_map (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid,
    subject text NOT NULL,
    concept_key text NOT NULL,
    standard_id uuid NOT NULL,
    objective_id uuid,
    alignment_strength numeric DEFAULT 1.0 NOT NULL,
    rationale text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT concept_standard_map_alignment_strength_check CHECK (((alignment_strength >= (0)::numeric) AND (alignment_strength <= (1)::numeric)))
);


--

--
-- Name: concepts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.concepts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lecture_id uuid NOT NULL,
    subject_id uuid NOT NULL,
    school_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    difficulty_weight numeric(4,2) DEFAULT 1.0 NOT NULL,
    order_index integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: confidence_calibration_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.confidence_calibration_stats (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    school_id uuid,
    subject text,
    topic text,
    avg_confidence numeric DEFAULT 0 NOT NULL,
    avg_accuracy numeric DEFAULT 0 NOT NULL,
    calibration_gap numeric DEFAULT 0 NOT NULL,
    sample_size integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: confidence_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.confidence_responses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    school_id uuid,
    subject text,
    topic text,
    question_id text,
    question_text text,
    confidence_level smallint NOT NULL,
    was_correct boolean NOT NULL,
    source text NOT NULL,
    is_test_data boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT confidence_responses_confidence_level_check CHECK (((confidence_level >= 1) AND (confidence_level <= 4))),
    CONSTRAINT confidence_responses_source_check CHECK ((source = ANY (ARRAY['assignment'::text, 'exam'::text, 'ai_quiz'::text, 'lct'::text, 'refresher'::text])))
);


--

--
-- Name: content_flags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_flags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    content_type text NOT NULL,
    content_id text,
    content_text text NOT NULL,
    user_id uuid NOT NULL,
    school_id uuid,
    severity text DEFAULT 'medium'::text NOT NULL,
    reason text,
    status text DEFAULT 'pending'::text NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: continuous_validation_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.continuous_validation_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    window_start timestamp with time zone NOT NULL,
    window_end timestamp with time zone NOT NULL,
    n_predictions integer DEFAULT 0 NOT NULL,
    n_decisions integer DEFAULT 0 NOT NULL,
    base_rate numeric,
    brier numeric,
    reliability numeric,
    resolution numeric,
    uncertainty numeric,
    ece numeric,
    cumulative_regret numeric,
    ensemble_weight_std numeric,
    alerts jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'ok'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT continuous_validation_runs_status_check CHECK ((status = ANY (ARRAY['ok'::text, 'warn'::text, 'alert'::text])))
);


--

--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text DEFAULT 'New Chat'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: course_materials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.course_materials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subject text NOT NULL,
    title text NOT NULL,
    content text,
    file_url text,
    uploaded_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    school_id uuid,
    grade_level text DEFAULT 'All'::text,
    relevance_override boolean DEFAULT false NOT NULL
);


--

--
-- Name: curriculum_standards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.curriculum_standards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid,
    framework text NOT NULL,
    code text NOT NULL,
    grade_level text,
    subject text NOT NULL,
    description text NOT NULL,
    parent_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL
);


--

--
-- Name: curriculum_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.curriculum_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    version_label text,
    changes jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL
);


--

--
-- Name: daily_streaks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_streaks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    current_streak integer DEFAULT 0 NOT NULL,
    max_streak integer DEFAULT 0 NOT NULL,
    last_active_date date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: data_export_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_export_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid,
    requested_by uuid NOT NULL,
    scope text NOT NULL,
    target_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    payload jsonb,
    error text,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT data_export_requests_scope_check CHECK ((scope = ANY (ARRAY['student'::text, 'school'::text]))),
    CONSTRAINT data_export_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text])))
);


--

--
-- Name: decay_refreshers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.decay_refreshers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    concept_mastery_id uuid NOT NULL,
    question_text text NOT NULL,
    options_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    correct_index smallint,
    selected_index smallint,
    was_correct boolean,
    shown_at timestamp with time zone DEFAULT now() NOT NULL,
    answered_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: engine_drift_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.engine_drift_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid,
    severity text NOT NULL,
    metric text NOT NULL,
    observed numeric,
    baseline numeric,
    message text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT engine_drift_alerts_severity_check CHECK ((severity = ANY (ARRAY['info'::text, 'warn'::text, 'alert'::text])))
);


--

--
-- Name: ensemble_fit_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ensemble_fit_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scope text DEFAULT 'user'::text NOT NULL,
    user_id uuid,
    subject text NOT NULL,
    n_samples integer NOT NULL,
    brier_before numeric,
    brier_after numeric,
    logloss_before numeric,
    logloss_after numeric,
    ece_after numeric,
    epochs integer NOT NULL,
    accepted boolean DEFAULT false NOT NULL,
    weights_before jsonb,
    weights_after jsonb,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ensemble_fit_runs_scope_check CHECK ((scope = ANY (ARRAY['user'::text, 'population'::text]))),
    CONSTRAINT ensemble_fit_runs_scope_user_chk CHECK ((((scope = 'user'::text) AND (user_id IS NOT NULL)) OR ((scope = 'population'::text) AND (user_id IS NULL))))
);


--

--
-- Name: ensemble_predictions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ensemble_predictions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    subject text NOT NULL,
    concept_id uuid,
    question_id uuid,
    bandit_decision_id uuid,
    p_2pl numeric,
    p_elo numeric,
    p_akt numeric,
    p_dash numeric,
    p_fsrs numeric,
    p_hawkes numeric,
    blended_p numeric,
    calibrated_p numeric,
    weights_used jsonb,
    outcome smallint,
    outcome_attached_at timestamp with time zone,
    helpfulness_signal smallint,
    quality_score numeric,
    source text DEFAULT 'teaching-generate'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ensemble_predictions_blended_p_check CHECK (((blended_p IS NULL) OR ((blended_p >= (0)::numeric) AND (blended_p <= (1)::numeric)))),
    CONSTRAINT ensemble_predictions_calibrated_p_check CHECK (((calibrated_p IS NULL) OR ((calibrated_p >= (0)::numeric) AND (calibrated_p <= (1)::numeric)))),
    CONSTRAINT ensemble_predictions_helpfulness_signal_check CHECK (((helpfulness_signal IS NULL) OR (helpfulness_signal = ANY (ARRAY['-1'::integer, 0, 1])))),
    CONSTRAINT ensemble_predictions_outcome_check CHECK (((outcome IS NULL) OR (outcome = ANY (ARRAY[0, 1])))),
    CONSTRAINT ensemble_predictions_p_2pl_check CHECK (((p_2pl IS NULL) OR ((p_2pl >= (0)::numeric) AND (p_2pl <= (1)::numeric)))),
    CONSTRAINT ensemble_predictions_p_akt_check CHECK (((p_akt IS NULL) OR ((p_akt >= (0)::numeric) AND (p_akt <= (1)::numeric)))),
    CONSTRAINT ensemble_predictions_p_dash_check CHECK (((p_dash IS NULL) OR ((p_dash >= (0)::numeric) AND (p_dash <= (1)::numeric)))),
    CONSTRAINT ensemble_predictions_p_elo_check CHECK (((p_elo IS NULL) OR ((p_elo >= (0)::numeric) AND (p_elo <= (1)::numeric)))),
    CONSTRAINT ensemble_predictions_p_fsrs_check CHECK (((p_fsrs IS NULL) OR ((p_fsrs >= (0)::numeric) AND (p_fsrs <= (1)::numeric)))),
    CONSTRAINT ensemble_predictions_p_hawkes_check CHECK (((p_hawkes IS NULL) OR ((p_hawkes >= (0)::numeric) AND (p_hawkes <= (1)::numeric)))),
    CONSTRAINT ensemble_predictions_quality_score_check CHECK (((quality_score IS NULL) OR ((quality_score >= (0)::numeric) AND (quality_score <= (1)::numeric))))
);


--

--
-- Name: ensemble_weights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ensemble_weights (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    subject text NOT NULL,
    w_2pl numeric DEFAULT 0.40 NOT NULL,
    w_elo numeric DEFAULT 0.15 NOT NULL,
    w_akt numeric DEFAULT 0.30 NOT NULL,
    w_dash numeric DEFAULT 0.15 NOT NULL,
    bias numeric DEFAULT 0.0 NOT NULL,
    n_events integer DEFAULT 0 NOT NULL,
    brier numeric,
    auc numeric,
    ece numeric,
    fitted_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    w_fsrs numeric DEFAULT 0.13 NOT NULL,
    w_hawkes numeric DEFAULT 0.10 NOT NULL
);


--

--
-- Name: exam_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exam_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    exam_id uuid NOT NULL,
    student_id uuid NOT NULL,
    answers_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    score integer,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    submitted_at timestamp with time zone,
    auto_graded boolean DEFAULT false NOT NULL
);


--

--
-- Name: exams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    teacher_id uuid NOT NULL,
    subject_id uuid NOT NULL,
    school_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    questions_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    duration_minutes integer DEFAULT 60 NOT NULL,
    total_points integer DEFAULT 100 NOT NULL,
    scheduled_at timestamp with time zone,
    class_ids uuid[] DEFAULT ARRAY[]::uuid[],
    is_published boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: extension_audit_chats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.extension_audit_chats (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    role text NOT NULL,
    parts jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT extension_audit_chats_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text])))
);


--

--
-- Name: extension_blueprints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.extension_blueprints (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    name text NOT NULL,
    summary text,
    manifest jsonb NOT NULL,
    requested_capabilities text[] DEFAULT '{}'::text[] NOT NULL,
    status public.extension_blueprint_status DEFAULT 'draft'::public.extension_blueprint_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: extension_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.extension_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    title text DEFAULT 'Untitled workspace'::text NOT NULL,
    created_by_session text,
    archived boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: extension_data; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.extension_data (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    version_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    table_key text NOT NULL,
    owner_user_id uuid,
    "row" jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: extension_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.extension_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    role text NOT NULL,
    parts jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT extension_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text])))
);


--

--
-- Name: extension_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.extension_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    blueprint_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    submitted_by_session text,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    status public.extension_request_status DEFAULT 'in_review'::public.extension_request_status NOT NULL,
    reviewer_user_id uuid,
    decision_notes text,
    decided_at timestamp with time zone
);


--

--
-- Name: extension_sandbox_data; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.extension_sandbox_data (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    blueprint_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    table_key text NOT NULL,
    "row" jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: extension_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.extension_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    blueprint_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    version integer NOT NULL,
    manifest jsonb NOT NULL,
    signature text NOT NULL,
    deployed_by_user_id uuid,
    deployed_at timestamp with time zone DEFAULT now() NOT NULL,
    active boolean DEFAULT true NOT NULL,
    rolled_back_at timestamp with time zone,
    rolled_back_by uuid
);


--

--
-- Name: fsrs_card_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fsrs_card_state (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    school_id uuid,
    subject text NOT NULL,
    concept_id uuid,
    stability numeric(10,4) DEFAULT 0 NOT NULL,
    difficulty numeric(6,4) DEFAULT 0 NOT NULL,
    reps integer DEFAULT 0 NOT NULL,
    lapses integer DEFAULT 0 NOT NULL,
    last_review_at timestamp with time zone,
    next_review_at timestamp with time zone,
    request_retention numeric(5,4) DEFAULT 0.9 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_leech boolean DEFAULT false NOT NULL,
    suspended_until timestamp with time zone,
    fuzzed_interval_days numeric(10,4),
    priority numeric(10,6) DEFAULT 0 NOT NULL,
    last_delivered_at timestamp with time zone
);


--

--
-- Name: governance_audit_trail; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.governance_audit_trail (
    id bigint NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    actor_id uuid,
    actor_role text,
    school_id uuid,
    action text NOT NULL,
    target_type text,
    target_id text,
    ip_address text,
    user_agent text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL
);


--

--
-- Name: graded_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.graded_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    school_id uuid,
    subject text NOT NULL,
    concept_id text,
    question_id uuid,
    difficulty_b numeric(6,3) DEFAULT 0.0 NOT NULL,
    theta_before numeric(6,3) DEFAULT 0.0 NOT NULL,
    theta_after numeric(6,3) DEFAULT 0.0 NOT NULL,
    se_before numeric(6,3) DEFAULT 1.5 NOT NULL,
    se_after numeric(6,3) DEFAULT 1.5 NOT NULL,
    expected_p numeric(6,4) DEFAULT 0.5 NOT NULL,
    was_correct boolean NOT NULL,
    response_time_ms integer,
    source text DEFAULT 'quiz'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    concept_weight numeric,
    k_effective numeric
);


--

--
-- Name: hyperparameter_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hyperparameter_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scope text DEFAULT 'global'::text NOT NULL,
    params jsonb NOT NULL,
    source_run_id uuid,
    active boolean DEFAULT true NOT NULL,
    activated_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text
);


--

--
-- Name: hyperparameter_tuning_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hyperparameter_tuning_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    triggered_by uuid,
    algorithm text DEFAULT 'cem'::text NOT NULL,
    population integer NOT NULL,
    elites integer NOT NULL,
    generations integer NOT NULL,
    seed integer NOT NULL,
    best_value numeric NOT NULL,
    best_params jsonb NOT NULL,
    trace jsonb NOT NULL,
    evaluations integer NOT NULL,
    promoted boolean DEFAULT false NOT NULL,
    promoted_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: invite_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invite_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    code text NOT NULL,
    role text NOT NULL,
    used boolean DEFAULT false NOT NULL,
    used_by uuid,
    expires_at timestamp with time zone NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    subject_id uuid,
    teacher_category_id uuid,
    CONSTRAINT invite_codes_role_check CHECK ((role = ANY (ARRAY['teacher'::text, 'student'::text, 'parent'::text])))
);


--

--
-- Name: invite_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invite_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code_id uuid NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    user_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    grade text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_by uuid,
    denied_at timestamp with time zone,
    denial_reason text,
    CONSTRAINT invite_requests_denial_audit_check CHECK ((status <> 'denied') OR (processed_by IS NOT NULL AND denied_at IS NOT NULL)),
    CONSTRAINT invite_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'accepted'::text, 'denied'::text])))
);


--

--
-- Name: iq_test_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.iq_test_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    score integer DEFAULT 0 NOT NULL,
    total_questions integer DEFAULT 15 NOT NULL,
    answers_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    processing_speed_score integer DEFAULT 0,
    logical_reasoning_score integer DEFAULT 0,
    pattern_recognition_score integer DEFAULT 0,
    spatial_reasoning_score integer DEFAULT 0,
    verbal_reasoning_score integer DEFAULT 0,
    mathematical_ability_score integer DEFAULT 0,
    abstract_thinking_score integer DEFAULT 0,
    estimated_iq integer DEFAULT 100,
    learning_pace text DEFAULT 'moderate'::text,
    completed_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: item_parameter_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.item_parameter_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question_id uuid NOT NULL,
    subject text NOT NULL,
    a_before numeric(5,3) NOT NULL,
    a_after numeric(5,3) NOT NULL,
    b_before numeric(6,3) NOT NULL,
    b_after numeric(6,3) NOT NULL,
    responses_used integer NOT NULL,
    log_likelihood numeric(10,3),
    method text DEFAULT '2pl_joint_em'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: knowledge_gaps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_gaps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    subject text NOT NULL,
    topic text NOT NULL,
    gap_description text NOT NULL,
    severity text DEFAULT 'moderate'::text NOT NULL,
    detected_from text DEFAULT 'chat'::text NOT NULL,
    resolved boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT knowledge_gaps_severity_check CHECK ((severity = ANY (ARRAY['minor'::text, 'moderate'::text, 'critical'::text])))
);


--

--
-- Name: kt_sequence_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kt_sequence_state (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    school_id uuid,
    subject text NOT NULL,
    interactions jsonb DEFAULT '[]'::jsonb NOT NULL,
    dash_state jsonb DEFAULT '{}'::jsonb NOT NULL,
    seq_len integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: lct_exam_locks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lct_exam_locks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    exam_id uuid NOT NULL,
    locked_until timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL
);


--

--
-- Name: lct_exam_schools; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lct_exam_schools (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    exam_id uuid NOT NULL,
    school_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: lct_exam_students; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lct_exam_students (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    exam_id uuid NOT NULL,
    student_id uuid NOT NULL,
    school_id uuid NOT NULL,
    learning_style text DEFAULT 'balanced'::text NOT NULL,
    translated_questions_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    answers_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    score integer,
    status text DEFAULT 'pending'::text NOT NULL,
    started_at timestamp with time zone,
    submitted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL
);


--

--
-- Name: lct_exams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lct_exams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text DEFAULT 'Luminary Cognitive Test'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    questions_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    answer_key_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_by uuid NOT NULL,
    started_at timestamp with time zone,
    ends_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL
);


--

--
-- Name: learning_mode_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_mode_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    school_id uuid,
    mode text NOT NULL,
    subject text NOT NULL,
    topic text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    score numeric,
    turns_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_test_data boolean DEFAULT false NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learning_mode_sessions_mode_check CHECK ((mode = ANY (ARRAY['socratic'::text, 'teach_back'::text, 'misconception_hunt'::text]))),
    CONSTRAINT learning_mode_sessions_score_check CHECK (((score IS NULL) OR ((score >= (0)::numeric) AND (score <= (100)::numeric)))),
    CONSTRAINT learning_mode_sessions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'abandoned'::text])))
);


--

--
-- Name: learning_objectives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_objectives (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    standard_id uuid NOT NULL,
    code text NOT NULL,
    description text NOT NULL,
    bloom_level text DEFAULT 'understand'::text NOT NULL,
    textbook_reference text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: learning_outcomes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_outcomes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid,
    student_id uuid NOT NULL,
    subject text NOT NULL,
    topic text,
    baseline_mastery numeric,
    current_mastery numeric,
    mastery_delta numeric,
    baseline_score numeric,
    current_score numeric,
    score_delta numeric,
    time_to_mastery_sec numeric,
    retention_7d numeric,
    retention_14d numeric,
    retention_30d numeric,
    pilot_arm text,
    computed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT learning_outcomes_pilot_arm_check CHECK ((pilot_arm = ANY (ARRAY['treatment'::text, 'control'::text])))
);


--

--
-- Name: learning_style_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_style_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    visual_score numeric(5,2) DEFAULT 0,
    logical_score numeric(5,2) DEFAULT 0,
    verbal_score numeric(5,2) DEFAULT 0,
    kinesthetic_score numeric(5,2) DEFAULT 0,
    conceptual_score numeric(5,2) DEFAULT 0,
    dominant_style text DEFAULT 'balanced'::text,
    secondary_style text,
    total_interactions integer DEFAULT 0,
    last_analyzed_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: lectures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lectures (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subject_id uuid NOT NULL,
    school_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    order_index integer DEFAULT 0 NOT NULL,
    difficulty_level numeric(4,2) DEFAULT 0.0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: lesson_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lesson_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lesson_id uuid NOT NULL,
    seq bigint DEFAULT 0 NOT NULL,
    kind text NOT NULL,
    text text DEFAULT ''::text NOT NULL,
    concept_ref text,
    priority smallint DEFAULT 3 NOT NULL,
    teacher_visible boolean DEFAULT true NOT NULL,
    teacher_id uuid NOT NULL,
    school_id uuid NOT NULL,
    ts timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lesson_events_kind_check CHECK ((kind = ANY (ARRAY['concept'::text, 'definition'::text, 'formula'::text, 'example'::text, 'question'::text, 'discussion'::text, 'admin'::text, 'silence'::text]))),
    CONSTRAINT lesson_events_priority_check CHECK (((priority >= 1) AND (priority <= 5)))
);


--

--
-- Name: lesson_explanations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lesson_explanations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    subject text,
    concept_id uuid,
    lecture_id uuid,
    bandit_decision_id uuid,
    prediction_log_id uuid,
    config_snapshot_id text NOT NULL,
    enforcement_status text NOT NULL,
    integrity_report jsonb NOT NULL,
    explanation jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lesson_explanations_enforcement_status_check CHECK ((enforcement_status = ANY (ARRAY['ok'::text, 'repaired'::text, 'degraded'::text])))
);


--

--
-- Name: lesson_objective_bindings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lesson_objective_bindings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid,
    student_id uuid NOT NULL,
    subject text NOT NULL,
    topic text,
    lesson_ref text,
    standard_id uuid,
    objective_id uuid,
    standard_code text,
    objective_code text,
    framework text,
    textbook_reference text,
    alignment_trace jsonb DEFAULT '{}'::jsonb NOT NULL,
    generated_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: lesson_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lesson_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    teacher_id uuid NOT NULL,
    subject_id uuid NOT NULL,
    school_id uuid NOT NULL,
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
    is_published boolean DEFAULT false NOT NULL,
    is_shareable boolean DEFAULT false NOT NULL,
    class_ids uuid[] DEFAULT ARRAY[]::uuid[],
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: lesson_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lesson_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lesson_id uuid NOT NULL,
    student_id uuid NOT NULL,
    school_id uuid NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    last_seq bigint DEFAULT 0 NOT NULL,
    summary jsonb DEFAULT '{}'::jsonb NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lesson_sessions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'ended'::text])))
);


--

--
-- Name: lesson_state_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lesson_state_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lesson_id uuid NOT NULL,
    school_id uuid NOT NULL,
    seq bigint NOT NULL,
    state jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: live_meetings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.live_meetings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lesson_id uuid DEFAULT gen_random_uuid() NOT NULL,
    teacher_id uuid NOT NULL,
    school_id uuid NOT NULL,
    subject text,
    title text NOT NULL,
    grade_level text NOT NULL,
    share_code text NOT NULL,
    status text DEFAULT 'scheduled'::text NOT NULL,
    scheduled_at timestamp with time zone,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT live_meetings_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'live'::text, 'ended'::text])))
);


--

--
-- Name: lumina_api_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lumina_api_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    api_key_id uuid NOT NULL,
    endpoint text NOT NULL,
    status_code integer NOT NULL,
    tokens_used integer DEFAULT 0,
    latency_ms integer,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: lumina_cost_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lumina_cost_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    school_id uuid,
    feature text NOT NULL,
    usage_date date DEFAULT ((now() AT TIME ZONE 'UTC'::text))::date NOT NULL,
    count integer DEFAULT 0 NOT NULL,
    last_used_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lumina_cost_ledger_feature_check CHECK ((feature = ANY (ARRAY['debate'::text, 'dream'::text, 'mirror'::text, 'predict'::text])))
);


--

--
-- Name: material_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.material_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    material_id uuid NOT NULL,
    user_id uuid NOT NULL,
    comment text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: material_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.material_views (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    material_id uuid NOT NULL,
    user_id uuid NOT NULL,
    seen_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: materials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.materials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    subject text NOT NULL,
    grade text NOT NULL,
    topic text NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: mc_school_lifecycle_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mc_school_lifecycle_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    previous_status text,
    new_status text NOT NULL,
    reason text,
    actor_label text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: mc_school_region_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mc_school_region_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    school_id uuid NOT NULL,
    region_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    attachments jsonb,
    CONSTRAINT messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text])))
);


--

--
-- Name: mi_daily_rollups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mi_daily_rollups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    school_id uuid,
    region_id uuid,
    subject_id uuid,
    grade_level text,
    event_type public.mi_event_type NOT NULL,
    day date NOT NULL,
    event_count integer DEFAULT 0 NOT NULL,
    distinct_actors integer DEFAULT 0 NOT NULL,
    avg_score numeric,
    sum_signal numeric DEFAULT 0 NOT NULL,
    computed_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: mi_educational_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mi_educational_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    school_id uuid,
    region_id uuid,
    subject_id uuid,
    concept_ref text,
    grade_level text,
    event_type public.mi_event_type NOT NULL,
    student_hash text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: mi_insights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mi_insights (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    scope public.mi_insight_scope NOT NULL,
    school_id uuid,
    region_id uuid,
    subject_id uuid,
    severity public.mi_insight_severity NOT NULL,
    title text NOT NULL,
    summary text NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    window_start date,
    window_end date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    acknowledged_at timestamp with time zone
);


--

--
-- Name: mind_map_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mind_map_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    topic text NOT NULL,
    mind_map_data jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--

--
-- Name: ministry_access_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ministry_access_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code_hash text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    description text,
    expires_at timestamp with time zone,
    tenant_id uuid NOT NULL
);


--

--
-- Name: ministry_access_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ministry_access_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_token text NOT NULL,
    ip_address text,
    user_agent text,
    device_fingerprint text,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    resolved_by uuid,
    expires_at timestamp with time zone DEFAULT (now() + '00:10:00'::interval) NOT NULL,
    tenant_id uuid NOT NULL
);


--

--
-- Name: ministry_capabilities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ministry_capabilities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    role public.ministry_role NOT NULL,
    capability text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: ministry_change_appliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ministry_change_appliers (
    entity_type text NOT NULL,
    applier_function text NOT NULL,
    description text,
    registered_by_phase text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: ministry_ip_bans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ministry_ip_bans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ip_address text NOT NULL,
    device_fingerprint text,
    reason text DEFAULT 'Ministry access denied'::text,
    banned_at timestamp with time zone DEFAULT now() NOT NULL,
    banned_by uuid,
    tenant_id uuid NOT NULL
);


--

--
-- Name: ministry_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ministry_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_token text NOT NULL,
    ip_address text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_activity timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:15:00'::interval) NOT NULL,
    tenant_id uuid NOT NULL
);


--

--
-- Name: misconception_embeddings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.misconception_embeddings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    concept_id text NOT NULL,
    misconception_id text NOT NULL,
    embedding jsonb NOT NULL,
    activation double precision DEFAULT 0 NOT NULL,
    posterior double precision DEFAULT 0 NOT NULL,
    last_updated timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT misconception_embeddings_posterior_check CHECK (((posterior >= (0)::double precision) AND (posterior <= (1)::double precision)))
);


--

--
-- Name: model_evaluation_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.model_evaluation_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    channel text NOT NULL,
    slice_kind text DEFAULT 'overall'::text NOT NULL,
    slice_key text,
    n integer NOT NULL,
    base_rate numeric NOT NULL,
    brier numeric NOT NULL,
    log_loss numeric NOT NULL,
    ece numeric NOT NULL,
    auc numeric NOT NULL,
    pr_auc numeric NOT NULL,
    brier_skill numeric NOT NULL,
    reliability numeric NOT NULL,
    resolution numeric NOT NULL,
    uncertainty numeric NOT NULL,
    accuracy numeric NOT NULL,
    ci_auc_lo numeric,
    ci_auc_hi numeric,
    ci_brier_lo numeric,
    ci_brier_hi numeric,
    reliability_bins jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: model_evaluation_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.model_evaluation_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    triggered_by uuid,
    scope text DEFAULT 'global'::text NOT NULL,
    scope_key text,
    window_start timestamp with time zone,
    window_end timestamp with time zone,
    n_predictions integer DEFAULT 0 NOT NULL,
    n_with_outcome integer DEFAULT 0 NOT NULL,
    base_rate numeric,
    bootstrap_iterations integer DEFAULT 0 NOT NULL,
    notes text,
    status text DEFAULT 'ok'::text NOT NULL,
    error text,
    duration_ms integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: moderation_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.moderation_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    flag_id uuid,
    target_user_id uuid NOT NULL,
    moderator_id uuid NOT NULL,
    action_type text NOT NULL,
    message text,
    school_id uuid,
    expires_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    appeal_status text DEFAULT 'none'::text,
    appealed_by uuid,
    appeal_reason text,
    appeal_resolved_by uuid,
    appeal_resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: moderator_invite_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.moderator_invite_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    used boolean DEFAULT false NOT NULL,
    used_by uuid,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid NOT NULL
);


--

--
-- Name: moderator_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.moderator_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code_id uuid NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    user_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: morning_briefings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.morning_briefings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    school_id uuid,
    briefing_md text NOT NULL,
    key_insight text,
    leverage_topic text,
    mini_quiz jsonb DEFAULT '[]'::jsonb,
    scheduled_for date DEFAULT (now())::date NOT NULL,
    opened_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: note_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.note_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    note_id uuid NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    content_hash text NOT NULL,
    word_count integer DEFAULT 0 NOT NULL,
    snapshot_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: note_timeline_summaries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.note_timeline_summaries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    note_id uuid NOT NULL,
    user_id uuid NOT NULL,
    summary_md text NOT NULL,
    snapshots_count integer DEFAULT 0 NOT NULL,
    generated_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text DEFAULT 'Untitled Note'::text NOT NULL,
    content text DEFAULT ''::text NOT NULL,
    ai_feedback text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: parent_invite_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parent_invite_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    school_id uuid NOT NULL,
    code text NOT NULL,
    used boolean DEFAULT false NOT NULL,
    used_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: parent_students; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parent_students (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_id uuid NOT NULL,
    student_id uuid NOT NULL,
    school_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: pilot_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pilot_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pilot_id uuid NOT NULL,
    student_id uuid NOT NULL,
    arm text NOT NULL,
    enrolled_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pilot_assignments_arm_check CHECK ((arm = ANY (ARRAY['treatment'::text, 'control'::text])))
);


--

--
-- Name: pilot_studies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pilot_studies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid,
    name text NOT NULL,
    hypothesis text NOT NULL,
    treatment_description text DEFAULT 'Lumina adaptive'::text NOT NULL,
    control_description text DEFAULT 'Traditional teaching'::text NOT NULL,
    subject text,
    grade_level text,
    status text DEFAULT 'draft'::text NOT NULL,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pilot_studies_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'running'::text, 'closed'::text, 'archived'::text])))
);


--

--
-- Name: podcast_generations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.podcast_generations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    file_name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    content text
);


--

--
-- Name: policy_evaluation_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.policy_evaluation_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    policy_name text NOT NULL,
    estimator text NOT NULL,
    value numeric NOT NULL,
    stderr numeric NOT NULL,
    ci95_lo numeric NOT NULL,
    ci95_hi numeric NOT NULL,
    effective_sample_size numeric NOT NULL,
    n_used integer NOT NULL,
    cumulative_regret numeric,
    details jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: policy_evaluation_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.policy_evaluation_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    triggered_by uuid,
    subject text,
    window_start timestamp with time zone NOT NULL,
    window_end timestamp with time zone NOT NULL,
    n_decisions integer NOT NULL,
    mean_behaviour_reward numeric,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: policy_regret_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.policy_regret_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    decision_id uuid,
    subject text NOT NULL,
    bucket_key text NOT NULL,
    realised_reward numeric NOT NULL,
    oracle_reward numeric NOT NULL,
    regret numeric NOT NULL,
    run_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: population_prior_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.population_prior_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    triggered_by uuid,
    scope_filter text,
    rows_examined integer DEFAULT 0 NOT NULL,
    rows_written integer DEFAULT 0 NOT NULL,
    ms_elapsed integer DEFAULT 0 NOT NULL,
    ok boolean DEFAULT true NOT NULL,
    error_message text,
    metrics jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: population_priors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.population_priors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scope text NOT NULL,
    school_id uuid,
    subject text,
    concept_id uuid,
    theta_mean double precision DEFAULT 0 NOT NULL,
    theta_var double precision DEFAULT 1 NOT NULL,
    se_seed double precision DEFAULT 1.5 NOT NULL,
    mastery_mean double precision DEFAULT 0.5 NOT NULL,
    mastery_var double precision DEFAULT 0.08 NOT NULL,
    ensemble_weights jsonb,
    n_theta bigint DEFAULT 0 NOT NULL,
    n_mastery bigint DEFAULT 0 NOT NULL,
    n_weights bigint DEFAULT 0 NOT NULL,
    computed_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT population_priors_scope_check CHECK ((scope = ANY (ARRAY['global'::text, 'subject_global'::text, 'subject_school'::text, 'concept_global'::text, 'concept_school'::text])))
);


--

--
-- Name: question_bank; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.question_bank (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subject text NOT NULL,
    concept_id text,
    question_hash text NOT NULL,
    question_text text NOT NULL,
    correct_answer text,
    source text DEFAULT 'ai'::text NOT NULL,
    difficulty_b numeric(6,3) DEFAULT 0.0 NOT NULL,
    difficulty_provisional boolean DEFAULT true NOT NULL,
    times_seen integer DEFAULT 0 NOT NULL,
    times_correct integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_anchor boolean DEFAULT false NOT NULL,
    confidence numeric DEFAULT 0.0 NOT NULL,
    discrimination_a numeric(5,3) DEFAULT 1.000 NOT NULL,
    elo_rating numeric(7,2) DEFAULT 1500.00 NOT NULL,
    elo_count integer DEFAULT 0 NOT NULL
);


--

--
-- Name: recall_schedule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recall_schedule (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    school_id uuid,
    subject text,
    concept text NOT NULL,
    reason text,
    due_at timestamp with time zone DEFAULT now() NOT NULL,
    delivered_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: report_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.report_cards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    subject_id uuid NOT NULL,
    school_id uuid NOT NULL,
    term text NOT NULL,
    scores_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    average numeric(5,2),
    comments text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    file_url text
);


--

--
-- Name: saved_lectures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_lectures (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    school_id uuid,
    mode text DEFAULT 'student'::text NOT NULL,
    title text NOT NULL,
    subject text,
    topic text,
    grade_level text,
    duration_minutes integer,
    expertise text,
    outline_json jsonb NOT NULL,
    hero_url text,
    image_urls jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: school_admins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.school_admins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    school_id uuid NOT NULL,
    active boolean DEFAULT true NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    granted_by uuid,
    revoked_at timestamp with time zone,
    revoked_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT school_admins_revocation_check CHECK ((active AND revoked_at IS NULL AND revoked_by IS NULL) OR (NOT active AND revoked_at IS NOT NULL))
);


--

--
-- Name: student_answer_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_answer_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    subject text NOT NULL,
    question_text text,
    student_answer text,
    correct_answer text,
    is_correct boolean NOT NULL,
    difficulty text DEFAULT 'medium'::text,
    source text DEFAULT 'quiz'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: student_classes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_classes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    class_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: student_goals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_goals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    target_count integer DEFAULT 1 NOT NULL,
    current_count integer DEFAULT 0 NOT NULL,
    goal_type text DEFAULT 'custom'::text NOT NULL,
    subject text,
    week_start date DEFAULT ((date_trunc('week'::text, (CURRENT_DATE + '1 day'::interval)) - '1 day'::interval))::date NOT NULL,
    completed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: student_learning_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_learning_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    subject text NOT NULL,
    difficulty_level text DEFAULT 'intermediate'::text NOT NULL,
    total_questions_answered integer DEFAULT 0 NOT NULL,
    correct_answers integer DEFAULT 0 NOT NULL,
    recent_accuracy numeric(5,2) DEFAULT 0,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: student_memory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_memory (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    memory_type text DEFAULT 'fact'::text NOT NULL,
    content text NOT NULL,
    subject text,
    confidence numeric(3,2) DEFAULT 0.80 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT student_memory_memory_type_check CHECK ((memory_type = ANY (ARRAY['fact'::text, 'preference'::text, 'struggle'::text, 'strength'::text, 'personal'::text, 'personality'::text])))
);


--

--
-- Name: subjects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subjects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    slug text,
    emoji text,
    color text,
    is_default boolean DEFAULT false NOT NULL
);


--

--
-- Name: symbolic_alignment_matrices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.symbolic_alignment_matrices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    version text NOT NULL,
    standard_ids jsonb NOT NULL,
    forward jsonb NOT NULL,
    inverse jsonb NOT NULL,
    forward_bias jsonb NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: teacher_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teacher_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    name text NOT NULL,
    emoji text,
    color text,
    is_default boolean DEFAULT false NOT NULL,
    subject_id uuid,
    permanent_invite_code text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: teacher_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teacher_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    teacher_id uuid NOT NULL,
    scope text NOT NULL,
    student_id uuid,
    class_id uuid,
    subject text,
    topic text,
    override_type text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    reason text,
    active boolean DEFAULT true NOT NULL,
    effective_from timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT teacher_overrides_override_type_check CHECK ((override_type = ANY (ARRAY['difficulty_lock'::text, 'pacing_lock'::text, 'strategy_lock'::text, 'manual_lesson'::text, 'freeze_progression'::text, 'curriculum_pacing'::text]))),
    CONSTRAINT teacher_overrides_scope_check CHECK ((scope = ANY (ARRAY['student'::text, 'class'::text, 'school'::text])))
);


--

--
-- Name: teacher_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teacher_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    reason text,
    admin_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT teacher_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--

--
-- Name: teacher_subjects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teacher_subjects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    teacher_id uuid NOT NULL,
    subject_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: tenant_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    role text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tenant_roles_role_check CHECK ((role = ANY (ARRAY['ministry_admin'::text, 'ministry_analyst'::text, 'ministry_curriculum'::text])))
);


--

--
-- Name: topic_locks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.topic_locks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    teacher_id uuid NOT NULL,
    subject text NOT NULL,
    topic text NOT NULL,
    scope text NOT NULL,
    student_id uuid,
    class_id uuid,
    state text DEFAULT 'locked'::text NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT topic_locks_scope_check CHECK ((scope = ANY (ARRAY['student'::text, 'class'::text, 'school'::text]))),
    CONSTRAINT topic_locks_state_check CHECK ((state = ANY (ARRAY['locked'::text, 'unlocked'::text])))
);


--

--
-- Name: trip_reads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trip_reads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trip_id uuid NOT NULL,
    user_id uuid NOT NULL,
    read_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: trips; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trips (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: unified_objective_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.unified_objective_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    sample_count integer DEFAULT 0 NOT NULL,
    loss_before double precision,
    loss_after double precision,
    breakdown_before jsonb,
    breakdown_after jsonb,
    candidate_version text,
    promoted boolean DEFAULT false NOT NULL,
    notes text
);


--

--
-- Name: unified_policy_decisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.unified_policy_decisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    school_id uuid,
    z_vector jsonb NOT NULL,
    action jsonb NOT NULL,
    probabilities jsonb NOT NULL,
    joint_propensity double precision NOT NULL,
    weights_version text NOT NULL,
    shadow_mode boolean DEFAULT true NOT NULL,
    realised_reward double precision,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: unified_policy_weights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.unified_policy_weights (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    version text NOT NULL,
    weights jsonb NOT NULL,
    lambdas jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    promoted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: unified_student_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.unified_student_state (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    school_id uuid,
    subject text NOT NULL,
    z_vector jsonb NOT NULL,
    layout_version smallint DEFAULT 1 NOT NULL,
    subsystem_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: user_activity_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_activity_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    activity_type text NOT NULL,
    category text DEFAULT 'general'::text NOT NULL,
    subject text,
    details_json jsonb DEFAULT '{}'::jsonb,
    duration_seconds integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

--
-- Name: user_strikes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_strikes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    school_id uuid NOT NULL,
    reason text NOT NULL,
    issued_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--

--
-- Name: weekly_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.weekly_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    created_by uuid NOT NULL,
    title text NOT NULL,
    grade_level text DEFAULT 'All Grades'::text NOT NULL,
    week_start date NOT NULL,
    plan_type text DEFAULT 'manual'::text NOT NULL,
    content_json jsonb,
    file_url text,
    file_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT weekly_plans_plan_type_check CHECK ((plan_type = ANY (ARRAY['manual'::text, 'file'::text])))
);


--

-- Canonical Lumina schema source: views, sequences, defaults, and comments
-- Derived from reviewed repository evidence; not historical deployment provenance.

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--

--
-- Name: TABLE tenants; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.tenants IS 'Country-level tenant. One row per country adopting Lumina. All schools, ministry data, and curriculum belong to exactly one tenant.';


--

--
-- Name: COLUMN tenants.default_subjects; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tenants.default_subjects IS 'Ordered list of subjects auto-seeded into every new school in this tenant. Each element: {"slug":"...","name":"...","emoji":"...","color":"..."}. Curriculum authors (T4) may extend or edit this per country.';


--

--
-- Name: tenant_analytics_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.tenant_analytics_view WITH (security_invoker='true') AS
 SELECT t.id AS tenant_id,
    t.slug AS tenant_slug,
    t.country_name,
    t.status,
    COALESCE(s.school_count, (0)::bigint) AS school_count,
    COALESCE(p.user_count, (0)::bigint) AS user_count,
    COALESCE(r.student_count, (0)::bigint) AS student_count,
    COALESCE(r.teacher_count, (0)::bigint) AS teacher_count,
    COALESCE(al.active_users_7d, (0)::bigint) AS active_users_7d,
    COALESCE(a.assignments_30d, (0)::bigint) AS assignments_30d,
    COALESCE(sub.submissions_30d, (0)::bigint) AS submissions_30d,
    COALESCE(round(sub.avg_grade_30d, 2), (0)::numeric) AS avg_grade_30d,
    now() AS computed_at
   FROM ((((((public.tenants t
     LEFT JOIN ( SELECT schools.tenant_id,
            count(*) AS school_count
           FROM public.schools
          GROUP BY schools.tenant_id) s ON ((s.tenant_id = t.id)))
     LEFT JOIN ( SELECT sc.tenant_id,
            count(*) AS user_count
           FROM (public.profiles pr
             JOIN public.schools sc ON ((sc.id = pr.school_id)))
          GROUP BY sc.tenant_id) p ON ((p.tenant_id = t.id)))
     LEFT JOIN ( SELECT sc.tenant_id,
            count(*) FILTER (WHERE ((ur.role)::text = 'student'::text)) AS student_count,
            count(*) FILTER (WHERE ((ur.role)::text = 'teacher'::text)) AS teacher_count
           FROM ((public.user_roles ur
             JOIN public.profiles pr ON ((pr.id = ur.user_id)))
             JOIN public.schools sc ON ((sc.id = pr.school_id)))
          GROUP BY sc.tenant_id) r ON ((r.tenant_id = t.id)))
     LEFT JOIN ( SELECT sc.tenant_id,
            count(DISTINCT pr.id) AS active_users_7d
           FROM ((public.activity_logs alg
             JOIN public.profiles pr ON ((pr.id = alg.user_id)))
             JOIN public.schools sc ON ((sc.id = pr.school_id)))
          WHERE (alg.created_at >= (now() - '7 days'::interval))
          GROUP BY sc.tenant_id) al ON ((al.tenant_id = t.id)))
     LEFT JOIN ( SELECT sc.tenant_id,
            count(*) AS assignments_30d
           FROM (public.assignments a2
             JOIN public.schools sc ON ((sc.id = a2.school_id)))
          WHERE (a2.created_at >= (now() - '30 days'::interval))
          GROUP BY sc.tenant_id) a ON ((a.tenant_id = t.id)))
     LEFT JOIN ( SELECT sc.tenant_id,
            count(*) AS submissions_30d,
            avg(su.grade) AS avg_grade_30d
           FROM ((public.submissions su
             JOIN public.profiles pr ON ((pr.id = su.student_id)))
             JOIN public.schools sc ON ((sc.id = pr.school_id)))
          WHERE ((su.submitted_at >= (now() - '30 days'::interval)) AND (su.grade IS NOT NULL))
          GROUP BY sc.tenant_id) sub ON ((sub.tenant_id = t.id)));


--

--
-- Name: FUNCTION get_tenant_config(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_tenant_config() IS 'Returns the caller''s tenant configuration (grading, calendar, subjects, languages, curriculum framework, AI config). NULL for users with no tenant (super admin, unassigned). Consumed by useTenantConfig() on the client.';


--

--
-- Name: TABLE assignment_submissions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.assignment_submissions IS 'DEPRECATED — superseded by public.submissions. Retained for historical data only; application code must read and write public.submissions.';


--

--
-- Name: governance_audit_trail_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.governance_audit_trail_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--

--
-- Name: governance_audit_trail_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.governance_audit_trail_id_seq OWNED BY public.governance_audit_trail.id;


--

--
-- Name: governance_audit_trail id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_audit_trail ALTER COLUMN id SET DEFAULT nextval('public.governance_audit_trail_id_seq'::regclass);


--

-- Canonical Lumina schema source: functions whose declared return types require views

CREATE FUNCTION public.get_cross_tenant_observatory() RETURNS SETOF public.tenant_analytics_view
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM public.tenant_analytics_view ORDER BY country_name;
END;
$$;

--
-- Name: list_change_requests(uuid, public.ministry_change_status, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_change_requests(p_tenant_id uuid DEFAULT NULL::uuid, p_status public.ministry_change_status DEFAULT NULL::public.ministry_change_status, p_session_token text DEFAULT NULL::text, p_limit integer DEFAULT 100) RETURNS SETOF public.ministry_change_requests
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_session_tenant uuid;
BEGIN
  v_session_tenant := public.ministry_session_tenant(p_session_token);
  IF v_session_tenant IS NULL AND NOT public.is_super_admin_caller()
     AND NOT EXISTS(SELECT 1 FROM public.ministry_role_assignments WHERE user_id = auth.uid()) THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT * FROM public.ministry_change_requests
    WHERE (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
      AND (v_session_tenant IS NULL OR tenant_id = v_session_tenant)
      AND (p_status IS NULL OR status = p_status)
    ORDER BY created_at DESC
    LIMIT p_limit;
END; $$;


--

--

--
-- Name: list_feature_flags(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_feature_flags(p_tenant_id uuid DEFAULT NULL::uuid) RETURNS SETOF public.tenant_feature_flags
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_tenant uuid;
BEGIN
  IF public.is_super_admin(auth.uid()) THEN
    v_tenant := p_tenant_id;
  ELSE
    v_tenant := public.get_user_tenant_id(auth.uid());
    IF v_tenant IS NULL THEN RETURN; END IF;
    IF p_tenant_id IS NOT NULL AND p_tenant_id <> v_tenant THEN RETURN; END IF;
  END IF;
  RETURN QUERY SELECT * FROM public.tenant_feature_flags
    WHERE (v_tenant IS NULL OR tenant_id = v_tenant) ORDER BY flag_key;
END;$$;


--

--

--
-- Name: list_mc_curriculum_subjects(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_mc_curriculum_subjects(p_session_token text DEFAULT NULL::text) RETURNS SETOF public.mc_curriculum_subjects
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_tenant uuid;
BEGIN
  v_tenant := public.ministry_session_tenant(p_session_token);
  IF v_tenant IS NULL AND NOT public.is_super_admin_caller() THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM public.mc_curriculum_subjects
   WHERE (v_tenant IS NULL OR tenant_id = v_tenant) ORDER BY subject_code;
END; $$;


--

--

--
-- Name: list_mc_curriculum_versions(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_mc_curriculum_versions(p_session_token text DEFAULT NULL::text) RETURNS SETOF public.mc_curriculum_version_defs
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_tenant uuid;
BEGIN
  v_tenant := public.ministry_session_tenant(p_session_token);
  IF v_tenant IS NULL AND NOT public.is_super_admin_caller() THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM public.mc_curriculum_version_defs
   WHERE (v_tenant IS NULL OR tenant_id = v_tenant) ORDER BY created_at DESC;
END; $$;


--

--

--
-- Name: list_mc_feature_flags(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_mc_feature_flags(p_session_token text DEFAULT NULL::text) RETURNS SETOF public.tenant_feature_flags
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_tenant uuid;
BEGIN
  v_tenant := public.ministry_session_tenant(p_session_token);
  IF v_tenant IS NULL AND NOT public.is_super_admin_caller() THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM public.tenant_feature_flags
   WHERE (v_tenant IS NULL OR tenant_id = v_tenant) ORDER BY flag_key;
END; $$;


--

--

--
-- Name: list_mc_lumina_config(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_mc_lumina_config(p_session_token text DEFAULT NULL::text) RETURNS SETOF public.mc_lumina_config
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_tenant uuid;
BEGIN
  v_tenant := public.ministry_session_tenant(p_session_token);
  IF v_tenant IS NULL AND NOT public.is_super_admin_caller() THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM public.mc_lumina_config
   WHERE (v_tenant IS NULL OR tenant_id = v_tenant);
END; $$;


--

--

--
-- Name: list_mc_notices(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_mc_notices(p_session_token text DEFAULT NULL::text) RETURNS SETOF public.ministry_announcements
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_tenant uuid;
BEGIN
  v_tenant := public.ministry_session_tenant(p_session_token);
  IF v_tenant IS NULL AND NOT public.is_super_admin_caller() THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM public.ministry_announcements
   WHERE (v_tenant IS NULL OR tenant_id = v_tenant) ORDER BY created_at DESC LIMIT 100;
END; $$;


--

--

--
-- Name: list_mc_policies(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_mc_policies(p_session_token text DEFAULT NULL::text) RETURNS SETOF public.mc_educational_policies
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_tenant uuid;
BEGIN
  v_tenant := public.ministry_session_tenant(p_session_token);
  IF v_tenant IS NULL AND NOT public.is_super_admin_caller() THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM public.mc_educational_policies
   WHERE (v_tenant IS NULL OR tenant_id = v_tenant) ORDER BY policy_key;
END; $$;


--

--

--
-- Name: list_mc_regions(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_mc_regions(p_session_token text DEFAULT NULL::text) RETURNS SETOF public.mc_regions
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_tenant uuid;
BEGIN
  v_tenant := public.ministry_session_tenant(p_session_token);
  IF v_tenant IS NULL AND NOT public.is_super_admin_caller() THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM public.mc_regions
   WHERE (v_tenant IS NULL OR tenant_id = v_tenant) ORDER BY kind, name;
END; $$;


--

--

--
-- Name: list_ministry_audit(uuid, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_ministry_audit(p_tenant_id uuid DEFAULT NULL::uuid, p_session_token text DEFAULT NULL::text, p_limit integer DEFAULT 200) RETURNS SETOF public.ministry_audit_log
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_session_tenant uuid;
BEGIN
  v_session_tenant := public.ministry_session_tenant(p_session_token);
  IF v_session_tenant IS NULL AND NOT public.is_super_admin_caller()
     AND NOT EXISTS(SELECT 1 FROM public.ministry_role_assignments WHERE user_id = auth.uid()) THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT * FROM public.ministry_audit_log
    WHERE (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
      AND (v_session_tenant IS NULL OR tenant_id = v_session_tenant)
    ORDER BY created_at DESC
    LIMIT p_limit;
END; $$;


--

--

--
-- Name: list_ministry_role_assignments(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_ministry_role_assignments(p_tenant_id uuid DEFAULT NULL::uuid, p_session_token text DEFAULT NULL::text) RETURNS SETOF public.ministry_role_assignments
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
DECLARE v_session_tenant uuid;
BEGIN
  v_session_tenant := public.ministry_session_tenant(p_session_token);
  IF v_session_tenant IS NULL AND NOT public.is_super_admin_caller() THEN
    RETURN QUERY SELECT * FROM public.ministry_role_assignments WHERE user_id = auth.uid();
    RETURN;
  END IF;
  RETURN QUERY
    SELECT * FROM public.ministry_role_assignments
    WHERE (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
      AND (v_session_tenant IS NULL OR tenant_id = v_session_tenant)
    ORDER BY created_at DESC;
END; $$;


--

--

-- Canonical Lumina schema source: constraints and indexes
-- Derived from reviewed repository evidence; not historical deployment provenance.

--
-- Name: ability_estimates ability_estimates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ability_estimates
    ADD CONSTRAINT ability_estimates_pkey PRIMARY KEY (id);


--

--
-- Name: ability_estimates ability_estimates_user_id_subject_concept_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ability_estimates
    ADD CONSTRAINT ability_estimates_user_id_subject_concept_id_key UNIQUE (user_id, subject, concept_id);


--

--
-- Name: activity_logs activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_pkey PRIMARY KEY (id);


--

--
-- Name: adaptive_quality_scores adaptive_quality_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adaptive_quality_scores
    ADD CONSTRAINT adaptive_quality_scores_pkey PRIMARY KEY (id);


--

--
-- Name: admin_logs admin_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_logs
    ADD CONSTRAINT admin_logs_pkey PRIMARY KEY (id);


--

--
-- Name: ai_output_signals ai_output_signals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_output_signals
    ADD CONSTRAINT ai_output_signals_pkey PRIMARY KEY (id);


--

--
-- Name: ale_api_students ale_api_students_api_key_id_external_ref_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ale_api_students
    ADD CONSTRAINT ale_api_students_api_key_id_external_ref_key UNIQUE (api_key_id, external_ref);


--

--
-- Name: ale_api_students ale_api_students_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ale_api_students
    ADD CONSTRAINT ale_api_students_pkey PRIMARY KEY (id);


--

--
-- Name: ale_api_usage ale_api_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ale_api_usage
    ADD CONSTRAINT ale_api_usage_pkey PRIMARY KEY (id);


--

--
-- Name: anchor_recalibrations anchor_recalibrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.anchor_recalibrations
    ADD CONSTRAINT anchor_recalibrations_pkey PRIMARY KEY (id);


--

--
-- Name: announcement_reads announcement_reads_announcement_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcement_reads
    ADD CONSTRAINT announcement_reads_announcement_id_user_id_key UNIQUE (announcement_id, user_id);


--

--
-- Name: announcement_reads announcement_reads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcement_reads
    ADD CONSTRAINT announcement_reads_pkey PRIMARY KEY (id);


--

--
-- Name: announcements announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);


--

--
-- Name: assessment_scores assessment_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_scores
    ADD CONSTRAINT assessment_scores_pkey PRIMARY KEY (id);


--

--
-- Name: assignment_submissions assignment_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_submissions
    ADD CONSTRAINT assignment_submissions_pkey PRIMARY KEY (id);


--

--
-- Name: assignment_views assignment_views_assignment_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_views
    ADD CONSTRAINT assignment_views_assignment_id_user_id_key UNIQUE (assignment_id, user_id);


--

--
-- Name: assignment_views assignment_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_views
    ADD CONSTRAINT assignment_views_pkey PRIMARY KEY (id);


--

--
-- Name: assignments assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_pkey PRIMARY KEY (id);


--

--
-- Name: attendance attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_pkey PRIMARY KEY (id);


--

--
-- Name: attendance attendance_student_id_class_id_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_student_id_class_id_date_key UNIQUE (student_id, class_id, date);


--

--
-- Name: awards awards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.awards
    ADD CONSTRAINT awards_pkey PRIMARY KEY (id);


--

--
-- Name: bandit_arm_state bandit_arm_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bandit_arm_state
    ADD CONSTRAINT bandit_arm_state_pkey PRIMARY KEY (id);


--

--
-- Name: bandit_decisions bandit_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bandit_decisions
    ADD CONSTRAINT bandit_decisions_pkey PRIMARY KEY (id);


--

--
-- Name: calibration_state calibration_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calibration_state
    ADD CONSTRAINT calibration_state_pkey PRIMARY KEY (id);


--

--
-- Name: calibration_state calibration_state_subject_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calibration_state
    ADD CONSTRAINT calibration_state_subject_key UNIQUE (subject);


--

--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--

--
-- Name: chat_rooms chat_rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_rooms
    ADD CONSTRAINT chat_rooms_pkey PRIMARY KEY (id);


--

--
-- Name: classes classes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_pkey PRIMARY KEY (id);


--

--
-- Name: cognitive_mirror_snapshots cognitive_mirror_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cognitive_mirror_snapshots
    ADD CONSTRAINT cognitive_mirror_snapshots_pkey PRIMARY KEY (id);


--

--
-- Name: cognitive_mirror_stats cognitive_mirror_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cognitive_mirror_stats
    ADD CONSTRAINT cognitive_mirror_stats_pkey PRIMARY KEY (user_id);


--

--
-- Name: concept_mastery concept_mastery_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concept_mastery
    ADD CONSTRAINT concept_mastery_pkey PRIMARY KEY (id);


--

--
-- Name: concept_mastery concept_mastery_user_id_subject_topic_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concept_mastery
    ADD CONSTRAINT concept_mastery_user_id_subject_topic_key UNIQUE (user_id, subject, topic);


--

--
-- Name: concept_standard_map concept_standard_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concept_standard_map
    ADD CONSTRAINT concept_standard_map_pkey PRIMARY KEY (id);


--

--
-- Name: concept_standard_map concept_standard_map_school_id_subject_concept_key_standard_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concept_standard_map
    ADD CONSTRAINT concept_standard_map_school_id_subject_concept_key_standard_key UNIQUE (school_id, subject, concept_key, standard_id, objective_id);


--

--
-- Name: concepts concepts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concepts
    ADD CONSTRAINT concepts_pkey PRIMARY KEY (id);


--

--
-- Name: confidence_calibration_stats confidence_calibration_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.confidence_calibration_stats
    ADD CONSTRAINT confidence_calibration_stats_pkey PRIMARY KEY (id);


--

--
-- Name: confidence_calibration_stats confidence_calibration_stats_user_id_subject_topic_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.confidence_calibration_stats
    ADD CONSTRAINT confidence_calibration_stats_user_id_subject_topic_key UNIQUE (user_id, subject, topic);


--

--
-- Name: confidence_responses confidence_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.confidence_responses
    ADD CONSTRAINT confidence_responses_pkey PRIMARY KEY (id);


--

--
-- Name: content_flags content_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_flags
    ADD CONSTRAINT content_flags_pkey PRIMARY KEY (id);


--

--
-- Name: continuous_validation_runs continuous_validation_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.continuous_validation_runs
    ADD CONSTRAINT continuous_validation_runs_pkey PRIMARY KEY (id);


--

--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--

--
-- Name: course_materials course_materials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_materials
    ADD CONSTRAINT course_materials_pkey PRIMARY KEY (id);


--

--
-- Name: curriculum_standards curriculum_standards_framework_code_school_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_standards
    ADD CONSTRAINT curriculum_standards_framework_code_school_id_key UNIQUE (framework, code, school_id);


--

--
-- Name: curriculum_standards curriculum_standards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_standards
    ADD CONSTRAINT curriculum_standards_pkey PRIMARY KEY (id);


--

--
-- Name: curriculum_versions curriculum_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_versions
    ADD CONSTRAINT curriculum_versions_pkey PRIMARY KEY (id);


--

--
-- Name: daily_streaks daily_streaks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_streaks
    ADD CONSTRAINT daily_streaks_pkey PRIMARY KEY (id);


--

--
-- Name: daily_streaks daily_streaks_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_streaks
    ADD CONSTRAINT daily_streaks_user_id_key UNIQUE (user_id);


--

--
-- Name: data_export_requests data_export_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_export_requests
    ADD CONSTRAINT data_export_requests_pkey PRIMARY KEY (id);


--

--
-- Name: decay_refreshers decay_refreshers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.decay_refreshers
    ADD CONSTRAINT decay_refreshers_pkey PRIMARY KEY (id);


--

--
-- Name: engine_drift_alerts engine_drift_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engine_drift_alerts
    ADD CONSTRAINT engine_drift_alerts_pkey PRIMARY KEY (id);


--

--
-- Name: ensemble_fit_runs ensemble_fit_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ensemble_fit_runs
    ADD CONSTRAINT ensemble_fit_runs_pkey PRIMARY KEY (id);


--

--
-- Name: ensemble_predictions ensemble_predictions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ensemble_predictions
    ADD CONSTRAINT ensemble_predictions_pkey PRIMARY KEY (id);


--

--
-- Name: ensemble_weights ensemble_weights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ensemble_weights
    ADD CONSTRAINT ensemble_weights_pkey PRIMARY KEY (id);


--

--
-- Name: exam_submissions exam_submissions_exam_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_submissions
    ADD CONSTRAINT exam_submissions_exam_id_student_id_key UNIQUE (exam_id, student_id);


--

--
-- Name: exam_submissions exam_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_submissions
    ADD CONSTRAINT exam_submissions_pkey PRIMARY KEY (id);


--

--
-- Name: exams exams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_pkey PRIMARY KEY (id);


--

--
-- Name: extension_audit_chats extension_audit_chats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_audit_chats
    ADD CONSTRAINT extension_audit_chats_pkey PRIMARY KEY (id);


--

--
-- Name: extension_blueprints extension_blueprints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_blueprints
    ADD CONSTRAINT extension_blueprints_pkey PRIMARY KEY (id);


--

--
-- Name: extension_conversations extension_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_conversations
    ADD CONSTRAINT extension_conversations_pkey PRIMARY KEY (id);


--

--
-- Name: extension_data extension_data_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_data
    ADD CONSTRAINT extension_data_pkey PRIMARY KEY (id);


--

--
-- Name: extension_messages extension_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_messages
    ADD CONSTRAINT extension_messages_pkey PRIMARY KEY (id);


--

--
-- Name: extension_requests extension_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_requests
    ADD CONSTRAINT extension_requests_pkey PRIMARY KEY (id);


--

--
-- Name: extension_sandbox_data extension_sandbox_data_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_sandbox_data
    ADD CONSTRAINT extension_sandbox_data_pkey PRIMARY KEY (id);


--

--
-- Name: extension_versions extension_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_versions
    ADD CONSTRAINT extension_versions_pkey PRIMARY KEY (id);


--

--
-- Name: fsrs_card_state fsrs_card_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fsrs_card_state
    ADD CONSTRAINT fsrs_card_state_pkey PRIMARY KEY (id);


--

--
-- Name: governance_audit_trail governance_audit_trail_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.governance_audit_trail
    ADD CONSTRAINT governance_audit_trail_pkey PRIMARY KEY (id);


--

--
-- Name: graded_events graded_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.graded_events
    ADD CONSTRAINT graded_events_pkey PRIMARY KEY (id);


--

--
-- Name: hyperparameter_settings hyperparameter_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hyperparameter_settings
    ADD CONSTRAINT hyperparameter_settings_pkey PRIMARY KEY (id);


--

--
-- Name: hyperparameter_tuning_runs hyperparameter_tuning_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hyperparameter_tuning_runs
    ADD CONSTRAINT hyperparameter_tuning_runs_pkey PRIMARY KEY (id);


--

--
-- Name: invite_codes invite_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_codes
    ADD CONSTRAINT invite_codes_pkey PRIMARY KEY (id);


--

--
-- Name: invite_codes invite_codes_school_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_codes
    ADD CONSTRAINT invite_codes_school_id_code_key UNIQUE (school_id, code);


--

--
-- Name: invite_requests invite_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_requests
    ADD CONSTRAINT invite_requests_pkey PRIMARY KEY (id);


--

--
-- Name: iq_test_results iq_test_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.iq_test_results
    ADD CONSTRAINT iq_test_results_pkey PRIMARY KEY (id);


--

--
-- Name: item_parameter_history item_parameter_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_parameter_history
    ADD CONSTRAINT item_parameter_history_pkey PRIMARY KEY (id);


--

--
-- Name: knowledge_gaps knowledge_gaps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_gaps
    ADD CONSTRAINT knowledge_gaps_pkey PRIMARY KEY (id);


--

--
-- Name: kt_sequence_state kt_sequence_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kt_sequence_state
    ADD CONSTRAINT kt_sequence_state_pkey PRIMARY KEY (id);


--

--
-- Name: kt_sequence_state kt_sequence_state_user_id_subject_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kt_sequence_state
    ADD CONSTRAINT kt_sequence_state_user_id_subject_key UNIQUE (user_id, subject);


--

--
-- Name: lct_exam_locks lct_exam_locks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lct_exam_locks
    ADD CONSTRAINT lct_exam_locks_pkey PRIMARY KEY (id);


--

--
-- Name: lct_exam_locks lct_exam_locks_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lct_exam_locks
    ADD CONSTRAINT lct_exam_locks_student_id_key UNIQUE (student_id);


--

--
-- Name: lct_exam_schools lct_exam_schools_exam_id_school_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lct_exam_schools
    ADD CONSTRAINT lct_exam_schools_exam_id_school_id_key UNIQUE (exam_id, school_id);


--

--
-- Name: lct_exam_schools lct_exam_schools_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lct_exam_schools
    ADD CONSTRAINT lct_exam_schools_pkey PRIMARY KEY (id);


--

--
-- Name: lct_exam_students lct_exam_students_exam_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lct_exam_students
    ADD CONSTRAINT lct_exam_students_exam_id_student_id_key UNIQUE (exam_id, student_id);


--

--
-- Name: lct_exam_students lct_exam_students_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lct_exam_students
    ADD CONSTRAINT lct_exam_students_pkey PRIMARY KEY (id);


--

--
-- Name: lct_exams lct_exams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lct_exams
    ADD CONSTRAINT lct_exams_pkey PRIMARY KEY (id);


--

--
-- Name: learning_mode_sessions learning_mode_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_mode_sessions
    ADD CONSTRAINT learning_mode_sessions_pkey PRIMARY KEY (id);


--

--
-- Name: learning_objectives learning_objectives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_objectives
    ADD CONSTRAINT learning_objectives_pkey PRIMARY KEY (id);


--

--
-- Name: learning_objectives learning_objectives_standard_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_objectives
    ADD CONSTRAINT learning_objectives_standard_id_code_key UNIQUE (standard_id, code);


--

--
-- Name: learning_outcomes learning_outcomes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_outcomes
    ADD CONSTRAINT learning_outcomes_pkey PRIMARY KEY (id);


--

--
-- Name: learning_style_profiles learning_style_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_style_profiles
    ADD CONSTRAINT learning_style_profiles_pkey PRIMARY KEY (id);


--

--
-- Name: learning_style_profiles learning_style_profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_style_profiles
    ADD CONSTRAINT learning_style_profiles_user_id_key UNIQUE (user_id);


--

--
-- Name: lectures lectures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lectures
    ADD CONSTRAINT lectures_pkey PRIMARY KEY (id);


--

--
-- Name: lesson_events lesson_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_events
    ADD CONSTRAINT lesson_events_pkey PRIMARY KEY (id);


--

--
-- Name: lesson_explanations lesson_explanations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_explanations
    ADD CONSTRAINT lesson_explanations_pkey PRIMARY KEY (id);


--

--
-- Name: lesson_objective_bindings lesson_objective_bindings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_objective_bindings
    ADD CONSTRAINT lesson_objective_bindings_pkey PRIMARY KEY (id);


--

--
-- Name: lesson_plans lesson_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_plans
    ADD CONSTRAINT lesson_plans_pkey PRIMARY KEY (id);


--

--
-- Name: lesson_sessions lesson_sessions_lesson_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_sessions
    ADD CONSTRAINT lesson_sessions_lesson_id_student_id_key UNIQUE (lesson_id, student_id);


--

--
-- Name: lesson_sessions lesson_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_sessions
    ADD CONSTRAINT lesson_sessions_pkey PRIMARY KEY (id);


--

--
-- Name: lesson_state_snapshots lesson_state_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_state_snapshots
    ADD CONSTRAINT lesson_state_snapshots_pkey PRIMARY KEY (id);


--

--
-- Name: live_meetings live_meetings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_meetings
    ADD CONSTRAINT live_meetings_pkey PRIMARY KEY (id);


--

--
-- Name: live_meetings live_meetings_share_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_meetings
    ADD CONSTRAINT live_meetings_share_code_key UNIQUE (share_code);


--

--
-- Name: lumina_api_usage lumina_api_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lumina_api_usage
    ADD CONSTRAINT lumina_api_usage_pkey PRIMARY KEY (id);


--

--
-- Name: lumina_cost_ledger lumina_cost_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lumina_cost_ledger
    ADD CONSTRAINT lumina_cost_ledger_pkey PRIMARY KEY (id);


--

--
-- Name: lumina_cost_ledger lumina_cost_ledger_user_id_feature_usage_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lumina_cost_ledger
    ADD CONSTRAINT lumina_cost_ledger_user_id_feature_usage_date_key UNIQUE (user_id, feature, usage_date);


--

--
-- Name: material_comments material_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_comments
    ADD CONSTRAINT material_comments_pkey PRIMARY KEY (id);


--

--
-- Name: material_views material_views_material_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_views
    ADD CONSTRAINT material_views_material_id_user_id_key UNIQUE (material_id, user_id);


--

--
-- Name: material_views material_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_views
    ADD CONSTRAINT material_views_pkey PRIMARY KEY (id);


--

--
-- Name: materials materials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materials
    ADD CONSTRAINT materials_pkey PRIMARY KEY (id);


--

--
-- Name: mc_curriculum_subjects mc_curriculum_subjects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_curriculum_subjects
    ADD CONSTRAINT mc_curriculum_subjects_pkey PRIMARY KEY (id);


--

--
-- Name: mc_curriculum_subjects mc_curriculum_subjects_tenant_id_subject_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_curriculum_subjects
    ADD CONSTRAINT mc_curriculum_subjects_tenant_id_subject_code_key UNIQUE (tenant_id, subject_code);


--

--
-- Name: mc_curriculum_version_defs mc_curriculum_version_defs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_curriculum_version_defs
    ADD CONSTRAINT mc_curriculum_version_defs_pkey PRIMARY KEY (id);


--

--
-- Name: mc_curriculum_version_defs mc_curriculum_version_defs_tenant_id_label_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_curriculum_version_defs
    ADD CONSTRAINT mc_curriculum_version_defs_tenant_id_label_key UNIQUE (tenant_id, label);


--

--
-- Name: mc_educational_policies mc_educational_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_educational_policies
    ADD CONSTRAINT mc_educational_policies_pkey PRIMARY KEY (id);


--

--
-- Name: mc_educational_policies mc_educational_policies_tenant_id_policy_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_educational_policies
    ADD CONSTRAINT mc_educational_policies_tenant_id_policy_key_key UNIQUE (tenant_id, policy_key);


--

--
-- Name: mc_lumina_config mc_lumina_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_lumina_config
    ADD CONSTRAINT mc_lumina_config_pkey PRIMARY KEY (id);


--

--
-- Name: mc_lumina_config mc_lumina_config_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_lumina_config
    ADD CONSTRAINT mc_lumina_config_tenant_id_key UNIQUE (tenant_id);


--

--
-- Name: mc_regions mc_regions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_regions
    ADD CONSTRAINT mc_regions_pkey PRIMARY KEY (id);


--

--
-- Name: mc_regions mc_regions_tenant_id_name_kind_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_regions
    ADD CONSTRAINT mc_regions_tenant_id_name_kind_key UNIQUE (tenant_id, name, kind);


--

--
-- Name: mc_school_lifecycle_events mc_school_lifecycle_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_school_lifecycle_events
    ADD CONSTRAINT mc_school_lifecycle_events_pkey PRIMARY KEY (id);


--

--
-- Name: mc_school_region_assignments mc_school_region_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_school_region_assignments
    ADD CONSTRAINT mc_school_region_assignments_pkey PRIMARY KEY (id);


--

--
-- Name: mc_school_region_assignments mc_school_region_assignments_school_id_region_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_school_region_assignments
    ADD CONSTRAINT mc_school_region_assignments_school_id_region_id_key UNIQUE (school_id, region_id);


--

--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--

--
-- Name: mi_daily_rollups mi_daily_rollups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mi_daily_rollups
    ADD CONSTRAINT mi_daily_rollups_pkey PRIMARY KEY (id);


--

--
-- Name: mi_educational_events mi_educational_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mi_educational_events
    ADD CONSTRAINT mi_educational_events_pkey PRIMARY KEY (id);


--

--
-- Name: mi_insights mi_insights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mi_insights
    ADD CONSTRAINT mi_insights_pkey PRIMARY KEY (id);


--

--
-- Name: mind_map_history mind_map_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mind_map_history
    ADD CONSTRAINT mind_map_history_pkey PRIMARY KEY (id);


--

--
-- Name: ministry_access_codes ministry_access_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_access_codes
    ADD CONSTRAINT ministry_access_codes_pkey PRIMARY KEY (id);


--

--
-- Name: ministry_access_requests ministry_access_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_access_requests
    ADD CONSTRAINT ministry_access_requests_pkey PRIMARY KEY (id);


--

--
-- Name: ministry_access_requests ministry_access_requests_session_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_access_requests
    ADD CONSTRAINT ministry_access_requests_session_token_key UNIQUE (session_token);


--

--
-- Name: ministry_announcements ministry_announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_announcements
    ADD CONSTRAINT ministry_announcements_pkey PRIMARY KEY (id);


--

--
-- Name: ministry_audit_log ministry_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_audit_log
    ADD CONSTRAINT ministry_audit_log_pkey PRIMARY KEY (id);


--

--
-- Name: ministry_capabilities ministry_capabilities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_capabilities
    ADD CONSTRAINT ministry_capabilities_pkey PRIMARY KEY (id);


--

--
-- Name: ministry_capabilities ministry_capabilities_role_capability_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_capabilities
    ADD CONSTRAINT ministry_capabilities_role_capability_key UNIQUE (role, capability);


--

--
-- Name: ministry_change_appliers ministry_change_appliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_change_appliers
    ADD CONSTRAINT ministry_change_appliers_pkey PRIMARY KEY (entity_type);


--

--
-- Name: ministry_change_requests ministry_change_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_change_requests
    ADD CONSTRAINT ministry_change_requests_pkey PRIMARY KEY (id);


--

--
-- Name: ministry_ip_bans ministry_ip_bans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_ip_bans
    ADD CONSTRAINT ministry_ip_bans_pkey PRIMARY KEY (id);


--

--
-- Name: ministry_role_assignments ministry_role_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_role_assignments
    ADD CONSTRAINT ministry_role_assignments_pkey PRIMARY KEY (id);


--

--
-- Name: ministry_role_assignments ministry_role_assignments_tenant_id_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_role_assignments
    ADD CONSTRAINT ministry_role_assignments_tenant_id_user_id_role_key UNIQUE (tenant_id, user_id, role);


--

--
-- Name: ministry_sessions ministry_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_sessions
    ADD CONSTRAINT ministry_sessions_pkey PRIMARY KEY (id);


--

--
-- Name: ministry_sessions ministry_sessions_session_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_sessions
    ADD CONSTRAINT ministry_sessions_session_token_key UNIQUE (session_token);


--

--
-- Name: misconception_embeddings misconception_embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.misconception_embeddings
    ADD CONSTRAINT misconception_embeddings_pkey PRIMARY KEY (id);


--

--
-- Name: misconception_embeddings misconception_embeddings_user_id_concept_id_misconception_i_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.misconception_embeddings
    ADD CONSTRAINT misconception_embeddings_user_id_concept_id_misconception_i_key UNIQUE (user_id, concept_id, misconception_id);


--

--
-- Name: model_evaluation_metrics model_evaluation_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_evaluation_metrics
    ADD CONSTRAINT model_evaluation_metrics_pkey PRIMARY KEY (id);


--

--
-- Name: model_evaluation_runs model_evaluation_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_evaluation_runs
    ADD CONSTRAINT model_evaluation_runs_pkey PRIMARY KEY (id);


--

--
-- Name: moderation_actions moderation_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_actions
    ADD CONSTRAINT moderation_actions_pkey PRIMARY KEY (id);


--

--
-- Name: moderator_invite_codes moderator_invite_codes_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderator_invite_codes
    ADD CONSTRAINT moderator_invite_codes_code_key UNIQUE (code);


--

--
-- Name: moderator_invite_codes moderator_invite_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderator_invite_codes
    ADD CONSTRAINT moderator_invite_codes_pkey PRIMARY KEY (id);


--

--
-- Name: moderator_requests moderator_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderator_requests
    ADD CONSTRAINT moderator_requests_pkey PRIMARY KEY (id);


--

--
-- Name: morning_briefings morning_briefings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.morning_briefings
    ADD CONSTRAINT morning_briefings_pkey PRIMARY KEY (id);


--

--
-- Name: morning_briefings morning_briefings_user_id_scheduled_for_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.morning_briefings
    ADD CONSTRAINT morning_briefings_user_id_scheduled_for_key UNIQUE (user_id, scheduled_for);


--

--
-- Name: note_snapshots note_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_snapshots
    ADD CONSTRAINT note_snapshots_pkey PRIMARY KEY (id);


--

--
-- Name: note_timeline_summaries note_timeline_summaries_note_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_timeline_summaries
    ADD CONSTRAINT note_timeline_summaries_note_id_key UNIQUE (note_id);


--

--
-- Name: note_timeline_summaries note_timeline_summaries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_timeline_summaries
    ADD CONSTRAINT note_timeline_summaries_pkey PRIMARY KEY (id);


--

--
-- Name: notes notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_pkey PRIMARY KEY (id);


--

--
-- Name: parent_invite_codes parent_invite_codes_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parent_invite_codes
    ADD CONSTRAINT parent_invite_codes_code_key UNIQUE (code);


--

--
-- Name: parent_invite_codes parent_invite_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parent_invite_codes
    ADD CONSTRAINT parent_invite_codes_pkey PRIMARY KEY (id);


--

--
-- Name: parent_students parent_students_parent_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parent_students
    ADD CONSTRAINT parent_students_parent_id_student_id_key UNIQUE (parent_id, student_id);


--

--
-- Name: parent_students parent_students_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parent_students
    ADD CONSTRAINT parent_students_pkey PRIMARY KEY (id);


--

--
-- Name: pilot_assignments pilot_assignments_pilot_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pilot_assignments
    ADD CONSTRAINT pilot_assignments_pilot_id_student_id_key UNIQUE (pilot_id, student_id);


--

--
-- Name: pilot_assignments pilot_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pilot_assignments
    ADD CONSTRAINT pilot_assignments_pkey PRIMARY KEY (id);


--

--
-- Name: pilot_studies pilot_studies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pilot_studies
    ADD CONSTRAINT pilot_studies_pkey PRIMARY KEY (id);


--

--
-- Name: podcast_generations podcast_generations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.podcast_generations
    ADD CONSTRAINT podcast_generations_pkey PRIMARY KEY (id);


--

--
-- Name: policy_evaluation_results policy_evaluation_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_evaluation_results
    ADD CONSTRAINT policy_evaluation_results_pkey PRIMARY KEY (id);


--

--
-- Name: policy_evaluation_runs policy_evaluation_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_evaluation_runs
    ADD CONSTRAINT policy_evaluation_runs_pkey PRIMARY KEY (id);


--

--
-- Name: policy_regret_log policy_regret_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_regret_log
    ADD CONSTRAINT policy_regret_log_pkey PRIMARY KEY (id);


--

--
-- Name: population_prior_runs population_prior_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.population_prior_runs
    ADD CONSTRAINT population_prior_runs_pkey PRIMARY KEY (id);


--

--
-- Name: population_priors population_priors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.population_priors
    ADD CONSTRAINT population_priors_pkey PRIMARY KEY (id);


--

--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--

--
-- Name: question_bank question_bank_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_bank
    ADD CONSTRAINT question_bank_pkey PRIMARY KEY (id);


--

--
-- Name: question_bank question_bank_question_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_bank
    ADD CONSTRAINT question_bank_question_hash_key UNIQUE (question_hash);


--

--
-- Name: recall_schedule recall_schedule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recall_schedule
    ADD CONSTRAINT recall_schedule_pkey PRIMARY KEY (id);


--

--
-- Name: report_cards report_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_cards
    ADD CONSTRAINT report_cards_pkey PRIMARY KEY (id);


--

--
-- Name: saved_lectures saved_lectures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_lectures
    ADD CONSTRAINT saved_lectures_pkey PRIMARY KEY (id);


--

--
-- Name: school_admins school_admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_admins
    ADD CONSTRAINT school_admins_pkey PRIMARY KEY (id);


--

--
-- Name: school_admins school_admins_user_id_school_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_admins
    ADD CONSTRAINT school_admins_user_id_school_id_key UNIQUE (user_id, school_id);


--

--
-- Name: schools schools_activation_code_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schools
    ADD CONSTRAINT schools_activation_code_hash_key UNIQUE (activation_code_hash);


--

--
-- Name: schools schools_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schools
    ADD CONSTRAINT schools_code_key UNIQUE (code);


--

--
-- Name: schools schools_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schools
    ADD CONSTRAINT schools_pkey PRIMARY KEY (id);


--

--
-- Name: student_answer_history student_answer_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_answer_history
    ADD CONSTRAINT student_answer_history_pkey PRIMARY KEY (id);


--

--
-- Name: student_classes student_classes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_classes
    ADD CONSTRAINT student_classes_pkey PRIMARY KEY (id);


--

--
-- Name: student_classes student_classes_student_id_class_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_classes
    ADD CONSTRAINT student_classes_student_id_class_id_key UNIQUE (student_id, class_id);


--

--
-- Name: student_goals student_goals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_goals
    ADD CONSTRAINT student_goals_pkey PRIMARY KEY (id);


--

--
-- Name: student_learning_profiles student_learning_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_learning_profiles
    ADD CONSTRAINT student_learning_profiles_pkey PRIMARY KEY (id);


--

--
-- Name: student_learning_profiles student_learning_profiles_user_id_subject_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_learning_profiles
    ADD CONSTRAINT student_learning_profiles_user_id_subject_key UNIQUE (user_id, subject);


--

--
-- Name: student_memory student_memory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_memory
    ADD CONSTRAINT student_memory_pkey PRIMARY KEY (id);


--

--
-- Name: subjects subjects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subjects
    ADD CONSTRAINT subjects_pkey PRIMARY KEY (id);


--

--
-- Name: submissions submissions_assignment_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_assignment_id_student_id_key UNIQUE (assignment_id, student_id);


--

--
-- Name: submissions submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_pkey PRIMARY KEY (id);


--

--
-- Name: symbolic_alignment_matrices symbolic_alignment_matrices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.symbolic_alignment_matrices
    ADD CONSTRAINT symbolic_alignment_matrices_pkey PRIMARY KEY (id);


--

--
-- Name: symbolic_alignment_matrices symbolic_alignment_matrices_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.symbolic_alignment_matrices
    ADD CONSTRAINT symbolic_alignment_matrices_version_key UNIQUE (version);


--

--
-- Name: teacher_categories teacher_categories_permanent_invite_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_categories
    ADD CONSTRAINT teacher_categories_permanent_invite_code_key UNIQUE (permanent_invite_code);


--

--
-- Name: teacher_categories teacher_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_categories
    ADD CONSTRAINT teacher_categories_pkey PRIMARY KEY (id);


--

--
-- Name: teacher_overrides teacher_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_overrides
    ADD CONSTRAINT teacher_overrides_pkey PRIMARY KEY (id);


--

--
-- Name: teacher_requests teacher_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_requests
    ADD CONSTRAINT teacher_requests_pkey PRIMARY KEY (id);


--

--
-- Name: teacher_requests teacher_requests_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_requests
    ADD CONSTRAINT teacher_requests_user_id_key UNIQUE (user_id);


--

--
-- Name: teacher_subjects teacher_subjects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_subjects
    ADD CONSTRAINT teacher_subjects_pkey PRIMARY KEY (id);


--

--
-- Name: teacher_subjects teacher_subjects_teacher_id_subject_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_subjects
    ADD CONSTRAINT teacher_subjects_teacher_id_subject_id_key UNIQUE (teacher_id, subject_id);


--

--
-- Name: tenant_feature_flags tenant_feature_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_feature_flags
    ADD CONSTRAINT tenant_feature_flags_pkey PRIMARY KEY (id);


--

--
-- Name: tenant_feature_flags tenant_feature_flags_tenant_id_flag_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_feature_flags
    ADD CONSTRAINT tenant_feature_flags_tenant_id_flag_key_key UNIQUE (tenant_id, flag_key);


--

--
-- Name: tenant_roles tenant_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_roles
    ADD CONSTRAINT tenant_roles_pkey PRIMARY KEY (id);


--

--
-- Name: tenant_roles tenant_roles_user_id_tenant_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_roles
    ADD CONSTRAINT tenant_roles_user_id_tenant_id_role_key UNIQUE (user_id, tenant_id, role);


--

--
-- Name: tenants tenants_country_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_country_code_key UNIQUE (country_code);


--

--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--

--
-- Name: tenants tenants_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_slug_key UNIQUE (slug);


--

--
-- Name: topic_locks topic_locks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_locks
    ADD CONSTRAINT topic_locks_pkey PRIMARY KEY (id);


--

--
-- Name: trip_reads trip_reads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_reads
    ADD CONSTRAINT trip_reads_pkey PRIMARY KEY (id);


--

--
-- Name: trip_reads trip_reads_trip_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_reads
    ADD CONSTRAINT trip_reads_trip_id_user_id_key UNIQUE (trip_id, user_id);


--

--
-- Name: trips trips_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_pkey PRIMARY KEY (id);


--

--
-- Name: unified_objective_runs unified_objective_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unified_objective_runs
    ADD CONSTRAINT unified_objective_runs_pkey PRIMARY KEY (id);


--

--
-- Name: unified_policy_decisions unified_policy_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unified_policy_decisions
    ADD CONSTRAINT unified_policy_decisions_pkey PRIMARY KEY (id);


--

--
-- Name: unified_policy_weights unified_policy_weights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unified_policy_weights
    ADD CONSTRAINT unified_policy_weights_pkey PRIMARY KEY (id);


--

--
-- Name: unified_policy_weights unified_policy_weights_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unified_policy_weights
    ADD CONSTRAINT unified_policy_weights_version_key UNIQUE (version);


--

--
-- Name: unified_student_state unified_student_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unified_student_state
    ADD CONSTRAINT unified_student_state_pkey PRIMARY KEY (id);


--

--
-- Name: user_activity_log user_activity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_activity_log
    ADD CONSTRAINT user_activity_log_pkey PRIMARY KEY (id);


--

--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--

--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--

--
-- Name: user_strikes user_strikes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_strikes
    ADD CONSTRAINT user_strikes_pkey PRIMARY KEY (id);


--

--
-- Name: weekly_plans weekly_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_plans
    ADD CONSTRAINT weekly_plans_pkey PRIMARY KEY (id);


--

--
-- Name: ale_api_usage_key_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ale_api_usage_key_created_idx ON public.ale_api_usage USING btree (api_key_id, created_at DESC);


--

--
-- Name: bandit_arm_state_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bandit_arm_state_lookup_idx ON public.bandit_arm_state USING btree (subject, arm_id, scope);


--

--
-- Name: bandit_arm_state_pop_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX bandit_arm_state_pop_uq ON public.bandit_arm_state USING btree (subject, arm_id) WHERE (scope = 'population'::text);


--

--
-- Name: bandit_arm_state_user_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX bandit_arm_state_user_uq ON public.bandit_arm_state USING btree (user_id, subject, arm_id) WHERE (scope = 'user'::text);


--

--
-- Name: bandit_decisions_arm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bandit_decisions_arm_idx ON public.bandit_decisions USING btree (subject, arm_id, created_at DESC);


--

--
-- Name: bandit_decisions_pending_reward_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bandit_decisions_pending_reward_idx ON public.bandit_decisions USING btree (user_id, subject, concept_id) WHERE (rewarded = false);


--

--
-- Name: bandit_decisions_propensity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bandit_decisions_propensity_idx ON public.bandit_decisions USING btree (subject, created_at DESC) WHERE (behaviour_prob IS NOT NULL);


--

--
-- Name: bandit_decisions_user_subject_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bandit_decisions_user_subject_idx ON public.bandit_decisions USING btree (user_id, subject, created_at DESC);


--

--
-- Name: continuous_validation_runs_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX continuous_validation_runs_created_idx ON public.continuous_validation_runs USING btree (created_at DESC);


--

--
-- Name: engine_drift_alerts_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX engine_drift_alerts_created_idx ON public.engine_drift_alerts USING btree (created_at DESC);


--

--
-- Name: ensemble_fit_runs_pop_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ensemble_fit_runs_pop_idx ON public.ensemble_fit_runs USING btree (subject, created_at DESC) WHERE (scope = 'population'::text);


--

--
-- Name: ensemble_fit_runs_user_subject_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ensemble_fit_runs_user_subject_idx ON public.ensemble_fit_runs USING btree (user_id, subject, created_at DESC);


--

--
-- Name: ensemble_predictions_pending_outcome_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ensemble_predictions_pending_outcome_idx ON public.ensemble_predictions USING btree (user_id, subject, concept_id) WHERE (outcome IS NULL);


--

--
-- Name: ensemble_predictions_subject_labeled_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ensemble_predictions_subject_labeled_idx ON public.ensemble_predictions USING btree (subject, outcome_attached_at DESC) WHERE (outcome IS NOT NULL);


--

--
-- Name: ensemble_predictions_user_subject_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ensemble_predictions_user_subject_idx ON public.ensemble_predictions USING btree (user_id, subject, created_at DESC);


--

--
-- Name: fsrs_card_state_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fsrs_card_state_due ON public.fsrs_card_state USING btree (user_id, next_review_at);


--

--
-- Name: fsrs_card_state_leech; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fsrs_card_state_leech ON public.fsrs_card_state USING btree (user_id) WHERE (is_leech = true);


--

--
-- Name: fsrs_card_state_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX fsrs_card_state_priority ON public.fsrs_card_state USING btree (user_id, priority DESC);


--

--
-- Name: fsrs_card_state_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX fsrs_card_state_unique ON public.fsrs_card_state USING btree (user_id, subject, COALESCE(concept_id, '00000000-0000-0000-0000-000000000000'::uuid));


--

--
-- Name: hyperparameter_settings_active_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX hyperparameter_settings_active_unique ON public.hyperparameter_settings USING btree (scope) WHERE (active = true);


--

--
-- Name: idx_ability_user_concept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ability_user_concept ON public.ability_estimates USING btree (user_id, concept_id);


--

--
-- Name: idx_ability_user_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ability_user_subject ON public.ability_estimates USING btree (user_id, subject);


--

--
-- Name: idx_anchor_recalibrations_subject_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_anchor_recalibrations_subject_time ON public.anchor_recalibrations USING btree (subject, created_at DESC);


--

--
-- Name: idx_aos_feature; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aos_feature ON public.ai_output_signals USING btree (feature);


--

--
-- Name: idx_aos_output_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aos_output_hash ON public.ai_output_signals USING btree (output_hash);


--

--
-- Name: idx_aos_school_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aos_school_created ON public.ai_output_signals USING btree (school_id, created_at DESC);


--

--
-- Name: idx_aos_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aos_user_created ON public.ai_output_signals USING btree (user_id, created_at DESC);


--

--
-- Name: idx_aqs_feature; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aqs_feature ON public.adaptive_quality_scores USING btree (feature);


--

--
-- Name: idx_aqs_school_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aqs_school_created ON public.adaptive_quality_scores USING btree (school_id, created_at DESC);


--

--
-- Name: idx_aqs_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aqs_user_created ON public.adaptive_quality_scores USING btree (user_id, created_at DESC);


--

--
-- Name: idx_assignment_views_assignment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assignment_views_assignment ON public.assignment_views USING btree (assignment_id);


--

--
-- Name: idx_assignment_views_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assignment_views_user ON public.assignment_views USING btree (user_id);


--

--
-- Name: idx_audit_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_action ON public.governance_audit_trail USING btree (action, occurred_at DESC);


--

--
-- Name: idx_audit_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_entity ON public.ministry_audit_log USING btree (entity_type, entity_id);


--

--
-- Name: idx_audit_school_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_school_time ON public.governance_audit_trail USING btree (school_id, occurred_at DESC);


--

--
-- Name: idx_audit_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_target ON public.governance_audit_trail USING btree (target_type, target_id);


--

--
-- Name: idx_audit_tenant_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_tenant_time ON public.ministry_audit_log USING btree (tenant_id, created_at DESC);


--

--
-- Name: idx_calib_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calib_school ON public.confidence_calibration_stats USING btree (school_id, subject, topic);


--

--
-- Name: idx_cms_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cms_school ON public.cognitive_mirror_snapshots USING btree (school_id, created_at DESC);


--

--
-- Name: idx_cms_unresolved; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cms_unresolved ON public.cognitive_mirror_snapshots USING btree (user_id) WHERE (resolved_at IS NULL);


--

--
-- Name: idx_cms_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cms_user ON public.cognitive_mirror_snapshots USING btree (user_id, created_at DESC);


--

--
-- Name: idx_concept_mastery_concept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_concept_mastery_concept ON public.concept_mastery USING btree (concept_id);


--

--
-- Name: idx_concepts_lecture; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_concepts_lecture ON public.concepts USING btree (lecture_id);


--

--
-- Name: idx_concepts_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_concepts_school ON public.concepts USING btree (school_id);


--

--
-- Name: idx_concepts_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_concepts_subject ON public.concepts USING btree (subject_id);


--

--
-- Name: idx_conf_resp_school_topic; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conf_resp_school_topic ON public.confidence_responses USING btree (school_id, subject, topic);


--

--
-- Name: idx_conf_resp_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conf_resp_user ON public.confidence_responses USING btree (user_id, created_at DESC);


--

--
-- Name: idx_curriculum_versions_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_curriculum_versions_school ON public.curriculum_versions USING btree (school_id);


--

--
-- Name: idx_decay_ref_concept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_decay_ref_concept ON public.decay_refreshers USING btree (concept_mastery_id);


--

--
-- Name: idx_decay_ref_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_decay_ref_user ON public.decay_refreshers USING btree (user_id, created_at DESC);


--

--
-- Name: idx_ext_audit_req; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ext_audit_req ON public.extension_audit_chats USING btree (request_id, created_at);


--

--
-- Name: idx_ext_bp_conv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ext_bp_conv ON public.extension_blueprints USING btree (conversation_id, version);


--

--
-- Name: idx_ext_bp_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ext_bp_tenant ON public.extension_blueprints USING btree (tenant_id, status);


--

--
-- Name: idx_ext_data_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ext_data_lookup ON public.extension_data USING btree (version_id, table_key);


--

--
-- Name: idx_ext_msgs_conv; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ext_msgs_conv ON public.extension_messages USING btree (conversation_id, created_at);


--

--
-- Name: idx_ext_req_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ext_req_status ON public.extension_requests USING btree (status, submitted_at DESC);


--

--
-- Name: idx_ext_sandbox; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ext_sandbox ON public.extension_sandbox_data USING btree (blueprint_id, table_key);


--

--
-- Name: idx_ext_ver_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ext_ver_active ON public.extension_versions USING btree (tenant_id, active);


--

--
-- Name: idx_graded_events_user_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_graded_events_user_subject ON public.graded_events USING btree (user_id, subject, created_at DESC);


--

--
-- Name: idx_iph_question; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_iph_question ON public.item_parameter_history USING btree (question_id, created_at DESC);


--

--
-- Name: idx_iph_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_iph_subject ON public.item_parameter_history USING btree (subject, created_at DESC);


--

--
-- Name: idx_iq_test_results_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_iq_test_results_user_id ON public.iq_test_results USING btree (user_id);


--

--
-- Name: idx_knowledge_gaps_unresolved; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_gaps_unresolved ON public.knowledge_gaps USING btree (user_id, resolved) WHERE (resolved = false);


--

--
-- Name: idx_knowledge_gaps_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_gaps_user ON public.knowledge_gaps USING btree (user_id);


--

--
-- Name: idx_kt_seq_user_subj; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kt_seq_user_subj ON public.kt_sequence_state USING btree (user_id, subject);


--

--
-- Name: idx_lectures_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lectures_school ON public.lectures USING btree (school_id);


--

--
-- Name: idx_lectures_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lectures_subject ON public.lectures USING btree (subject_id);


--

--
-- Name: idx_lms_school_mode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lms_school_mode ON public.learning_mode_sessions USING btree (school_id, mode, subject, topic);


--

--
-- Name: idx_lms_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lms_user_status ON public.learning_mode_sessions USING btree (user_id, status, started_at DESC);


--

--
-- Name: idx_lumina_api_usage_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lumina_api_usage_key ON public.lumina_api_usage USING btree (api_key_id, created_at DESC);


--

--
-- Name: idx_lumina_cost_school_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lumina_cost_school_date ON public.lumina_cost_ledger USING btree (school_id, usage_date DESC);


--

--
-- Name: idx_lumina_cost_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lumina_cost_user_date ON public.lumina_cost_ledger USING btree (user_id, usage_date DESC);


--

--
-- Name: idx_mastery_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mastery_school ON public.concept_mastery USING btree (school_id, subject, topic);


--

--
-- Name: idx_mastery_user_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mastery_user_due ON public.concept_mastery USING btree (user_id, next_review_at);


--

--
-- Name: idx_materials_user_subject_grade; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_materials_user_subject_grade ON public.materials USING btree (user_id, subject, grade);


--

--
-- Name: idx_mb_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mb_user ON public.morning_briefings USING btree (user_id, scheduled_for DESC);


--

--
-- Name: idx_mc_cs_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mc_cs_tenant ON public.mc_curriculum_subjects USING btree (tenant_id, status);


--

--
-- Name: idx_mc_regions_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mc_regions_tenant ON public.mc_regions USING btree (tenant_id);


--

--
-- Name: idx_mc_sle_school; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mc_sle_school ON public.mc_school_lifecycle_events USING btree (school_id, created_at DESC);


--

--
-- Name: idx_mcr_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mcr_entity ON public.ministry_change_requests USING btree (entity_type, entity_id);


--

--
-- Name: idx_mcr_tenant_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mcr_tenant_status ON public.ministry_change_requests USING btree (tenant_id, status);


--

--
-- Name: idx_meval_metrics_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meval_metrics_channel ON public.model_evaluation_metrics USING btree (channel, slice_kind);


--

--
-- Name: idx_meval_metrics_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meval_metrics_run ON public.model_evaluation_metrics USING btree (run_id);


--

--
-- Name: idx_meval_runs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meval_runs_created_at ON public.model_evaluation_runs USING btree (created_at DESC);


--

--
-- Name: idx_meval_runs_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meval_runs_scope ON public.model_evaluation_runs USING btree (scope, scope_key);


--

--
-- Name: idx_ministry_announcements_tenant_pub; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ministry_announcements_tenant_pub ON public.ministry_announcements USING btree (tenant_id, published, published_at DESC);


--

--
-- Name: idx_mra_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mra_tenant ON public.ministry_role_assignments USING btree (tenant_id);


--

--
-- Name: idx_mra_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mra_user ON public.ministry_role_assignments USING btree (user_id);


--

--
-- Name: idx_note_snap_note; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_note_snap_note ON public.note_snapshots USING btree (note_id, snapshot_at DESC);


--

--
-- Name: idx_note_snap_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_note_snap_user ON public.note_snapshots USING btree (user_id, snapshot_at DESC);


--

--
-- Name: idx_overrides_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_overrides_active ON public.teacher_overrides USING btree (school_id, active, scope, student_id, subject) WHERE (active = true);


--

--
-- Name: idx_podcast_generations_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_podcast_generations_user_id ON public.podcast_generations USING btree (user_id, created_at DESC);


--

--
-- Name: idx_qb_anchor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qb_anchor ON public.question_bank USING btree (subject, is_anchor) WHERE is_anchor;


--

--
-- Name: idx_qbank_concept; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qbank_concept ON public.question_bank USING btree (concept_id);


--

--
-- Name: idx_qbank_discrimination; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qbank_discrimination ON public.question_bank USING btree (discrimination_a) WHERE (discrimination_a >= 0.3);


--

--
-- Name: idx_qbank_elo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qbank_elo ON public.question_bank USING btree (subject, elo_rating);


--

--
-- Name: idx_qbank_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qbank_subject ON public.question_bank USING btree (subject);


--

--
-- Name: idx_rs_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rs_due ON public.recall_schedule USING btree (user_id, due_at) WHERE (delivered_at IS NULL);


--

--
-- Name: idx_saved_lectures_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_saved_lectures_user_created ON public.saved_lectures USING btree (user_id, created_at DESC);


--

--
-- Name: idx_student_memory_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_memory_type ON public.student_memory USING btree (user_id, memory_type);


--

--
-- Name: idx_student_memory_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_student_memory_user ON public.student_memory USING btree (user_id);


--

--
-- Name: idx_tenant_feature_flags_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenant_feature_flags_tenant ON public.tenant_feature_flags USING btree (tenant_id);


--

--
-- Name: idx_user_activity_log_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_activity_log_created ON public.user_activity_log USING btree (created_at);


--

--
-- Name: idx_user_activity_log_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_activity_log_type ON public.user_activity_log USING btree (activity_type);


--

--
-- Name: idx_user_activity_log_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_activity_log_user_id ON public.user_activity_log USING btree (user_id);


--

--
-- Name: lesson_events_lesson_priority_seq_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lesson_events_lesson_priority_seq_idx ON public.lesson_events USING btree (lesson_id, priority, seq);


--

--
-- Name: lesson_events_lesson_seq_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX lesson_events_lesson_seq_uidx ON public.lesson_events USING btree (lesson_id, seq);


--

--
-- Name: lesson_events_school_ts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lesson_events_school_ts_idx ON public.lesson_events USING btree (school_id, ts DESC);


--

--
-- Name: lesson_explanations_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lesson_explanations_status_idx ON public.lesson_explanations USING btree (enforcement_status, created_at DESC);


--

--
-- Name: lesson_explanations_subject_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lesson_explanations_subject_idx ON public.lesson_explanations USING btree (subject, created_at DESC);


--

--
-- Name: lesson_explanations_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lesson_explanations_user_idx ON public.lesson_explanations USING btree (user_id, created_at DESC);


--

--
-- Name: lesson_sessions_lesson_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lesson_sessions_lesson_idx ON public.lesson_sessions USING btree (lesson_id);


--

--
-- Name: lesson_sessions_student_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lesson_sessions_student_idx ON public.lesson_sessions USING btree (student_id);


--

--
-- Name: lesson_state_snapshots_lesson_seq_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lesson_state_snapshots_lesson_seq_idx ON public.lesson_state_snapshots USING btree (lesson_id, seq DESC);


--

--
-- Name: live_meetings_lesson_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX live_meetings_lesson_idx ON public.live_meetings USING btree (lesson_id);


--

--
-- Name: live_meetings_school_grade_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX live_meetings_school_grade_status_idx ON public.live_meetings USING btree (school_id, grade_level, status);


--

--
-- Name: mi_events_region_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mi_events_region_time_idx ON public.mi_educational_events USING btree (region_id, occurred_at DESC);


--

--
-- Name: mi_events_school_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mi_events_school_time_idx ON public.mi_educational_events USING btree (school_id, occurred_at DESC);


--

--
-- Name: mi_events_subject_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mi_events_subject_idx ON public.mi_educational_events USING btree (subject_id);


--

--
-- Name: mi_events_tenant_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mi_events_tenant_time_idx ON public.mi_educational_events USING btree (tenant_id, occurred_at DESC);


--

--
-- Name: mi_events_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mi_events_type_idx ON public.mi_educational_events USING btree (event_type);


--

--
-- Name: mi_insights_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mi_insights_scope_idx ON public.mi_insights USING btree (scope);


--

--
-- Name: mi_insights_tenant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mi_insights_tenant_idx ON public.mi_insights USING btree (tenant_id, created_at DESC);


--

--
-- Name: mi_rollups_region_day_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mi_rollups_region_day_idx ON public.mi_daily_rollups USING btree (region_id, day DESC);


--

--
-- Name: mi_rollups_school_day_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mi_rollups_school_day_idx ON public.mi_daily_rollups USING btree (school_id, day DESC);


--

--
-- Name: mi_rollups_subject_day_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mi_rollups_subject_day_idx ON public.mi_daily_rollups USING btree (subject_id, day DESC);


--

--
-- Name: mi_rollups_tenant_day_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mi_rollups_tenant_day_idx ON public.mi_daily_rollups USING btree (tenant_id, day DESC);


--

--
-- Name: mi_rollups_unique_slice; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX mi_rollups_unique_slice ON public.mi_daily_rollups USING btree (tenant_id, day, event_type, COALESCE(school_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(region_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(subject_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(grade_level, ''::text));


--

--
-- Name: policy_evaluation_results_run_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX policy_evaluation_results_run_idx ON public.policy_evaluation_results USING btree (run_id, policy_name, estimator);


--

--
-- Name: policy_regret_log_subject_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX policy_regret_log_subject_idx ON public.policy_regret_log USING btree (subject, created_at DESC);


--

--
-- Name: population_prior_runs_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX population_prior_runs_created_idx ON public.population_prior_runs USING btree (created_at DESC);


--

--
-- Name: population_priors_concept_global_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX population_priors_concept_global_uniq ON public.population_priors USING btree (concept_id) WHERE (scope = 'concept_global'::text);


--

--
-- Name: population_priors_concept_school_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX population_priors_concept_school_uniq ON public.population_priors USING btree (school_id, concept_id) WHERE (scope = 'concept_school'::text);


--

--
-- Name: population_priors_global_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX population_priors_global_uniq ON public.population_priors USING btree ((1)) WHERE (scope = 'global'::text);


--

--
-- Name: population_priors_school_subject_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX population_priors_school_subject_idx ON public.population_priors USING btree (school_id, subject) WHERE (school_id IS NOT NULL);


--

--
-- Name: population_priors_scope_subject_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX population_priors_scope_subject_idx ON public.population_priors USING btree (scope, subject);


--

--
-- Name: population_priors_subject_global_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX population_priors_subject_global_uniq ON public.population_priors USING btree (subject) WHERE (scope = 'subject_global'::text);


--

--
-- Name: population_priors_subject_school_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX population_priors_subject_school_uniq ON public.population_priors USING btree (school_id, subject) WHERE (scope = 'subject_school'::text);


--

--
-- Name: subjects_school_slug_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX subjects_school_slug_unique ON public.subjects USING btree (school_id, slug) WHERE (slug IS NOT NULL);


--

--
-- Name: teacher_categories_school_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX teacher_categories_school_idx ON public.teacher_categories USING btree (school_id);


--

--
-- Name: teacher_categories_subject_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX teacher_categories_subject_idx ON public.teacher_categories USING btree (subject_id);


--

--
-- Name: unified_policy_decisions_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX unified_policy_decisions_user_idx ON public.unified_policy_decisions USING btree (user_id, created_at DESC);


--

--
-- Name: unified_state_user_subject_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX unified_state_user_subject_idx ON public.unified_student_state USING btree (user_id, subject, created_at DESC);


--

--
-- Name: uq_ensemble_user_subj; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_ensemble_user_subj ON public.ensemble_weights USING btree (COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid), subject);


--

--
-- Name: activity_logs activity_logs_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: activity_logs activity_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: admin_logs admin_logs_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_logs
    ADD CONSTRAINT admin_logs_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: admin_logs admin_logs_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_logs
    ADD CONSTRAINT admin_logs_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: announcement_reads announcement_reads_announcement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcement_reads
    ADD CONSTRAINT announcement_reads_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES public.announcements(id) ON DELETE CASCADE;


--

--
-- Name: announcements announcements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--

--
-- Name: announcements announcements_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: assessment_scores assessment_scores_pilot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_scores
    ADD CONSTRAINT assessment_scores_pilot_id_fkey FOREIGN KEY (pilot_id) REFERENCES public.pilot_studies(id) ON DELETE SET NULL;


--

--
-- Name: assessment_scores assessment_scores_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessment_scores
    ADD CONSTRAINT assessment_scores_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: assignment_submissions assignment_submissions_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_submissions
    ADD CONSTRAINT assignment_submissions_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.assignments(id) ON DELETE CASCADE;


--

--
-- Name: assignment_views assignment_views_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_views
    ADD CONSTRAINT assignment_views_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.assignments(id) ON DELETE CASCADE;


--

--
-- Name: assignments assignments_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--

--
-- Name: assignments assignments_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: assignments assignments_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignments
    ADD CONSTRAINT assignments_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE CASCADE;


--

--
-- Name: attendance attendance_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--

--
-- Name: attendance attendance_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_student_id_fkey FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: attendance attendance_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES auth.users(id);


--

--
-- Name: awards awards_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.awards
    ADD CONSTRAINT awards_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: awards awards_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.awards
    ADD CONSTRAINT awards_student_id_fkey FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: awards awards_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.awards
    ADD CONSTRAINT awards_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES auth.users(id);


--

--
-- Name: bandit_arm_state bandit_arm_state_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bandit_arm_state
    ADD CONSTRAINT bandit_arm_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: bandit_decisions bandit_decisions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bandit_decisions
    ADD CONSTRAINT bandit_decisions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: chat_messages chat_messages_chat_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_chat_room_id_fkey FOREIGN KEY (chat_room_id) REFERENCES public.chat_rooms(id) ON DELETE CASCADE;


--

--
-- Name: chat_rooms chat_rooms_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_rooms
    ADD CONSTRAINT chat_rooms_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: classes classes_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: concept_mastery concept_mastery_concept_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concept_mastery
    ADD CONSTRAINT concept_mastery_concept_id_fkey FOREIGN KEY (concept_id) REFERENCES public.concepts(id) ON DELETE SET NULL;


--

--
-- Name: concept_standard_map concept_standard_map_objective_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concept_standard_map
    ADD CONSTRAINT concept_standard_map_objective_id_fkey FOREIGN KEY (objective_id) REFERENCES public.learning_objectives(id) ON DELETE SET NULL;


--

--
-- Name: concept_standard_map concept_standard_map_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concept_standard_map
    ADD CONSTRAINT concept_standard_map_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: concept_standard_map concept_standard_map_standard_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concept_standard_map
    ADD CONSTRAINT concept_standard_map_standard_id_fkey FOREIGN KEY (standard_id) REFERENCES public.curriculum_standards(id) ON DELETE CASCADE;


--

--
-- Name: concepts concepts_lecture_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concepts
    ADD CONSTRAINT concepts_lecture_id_fkey FOREIGN KEY (lecture_id) REFERENCES public.lectures(id) ON DELETE CASCADE;


--

--
-- Name: concepts concepts_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concepts
    ADD CONSTRAINT concepts_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: concepts concepts_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concepts
    ADD CONSTRAINT concepts_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE CASCADE;


--

--
-- Name: content_flags content_flags_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_flags
    ADD CONSTRAINT content_flags_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);


--

--
-- Name: course_materials course_materials_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_materials
    ADD CONSTRAINT course_materials_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);


--

--
-- Name: course_materials course_materials_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_materials
    ADD CONSTRAINT course_materials_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: curriculum_standards curriculum_standards_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_standards
    ADD CONSTRAINT curriculum_standards_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.curriculum_standards(id) ON DELETE SET NULL;


--

--
-- Name: curriculum_standards curriculum_standards_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_standards
    ADD CONSTRAINT curriculum_standards_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: curriculum_standards curriculum_standards_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_standards
    ADD CONSTRAINT curriculum_standards_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--

--
-- Name: curriculum_versions curriculum_versions_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_versions
    ADD CONSTRAINT curriculum_versions_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: curriculum_versions curriculum_versions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.curriculum_versions
    ADD CONSTRAINT curriculum_versions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--

--
-- Name: data_export_requests data_export_requests_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_export_requests
    ADD CONSTRAINT data_export_requests_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: decay_refreshers decay_refreshers_concept_mastery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.decay_refreshers
    ADD CONSTRAINT decay_refreshers_concept_mastery_id_fkey FOREIGN KEY (concept_mastery_id) REFERENCES public.concept_mastery(id) ON DELETE CASCADE;


--

--
-- Name: engine_drift_alerts engine_drift_alerts_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.engine_drift_alerts
    ADD CONSTRAINT engine_drift_alerts_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.continuous_validation_runs(id) ON DELETE CASCADE;


--

--
-- Name: ensemble_fit_runs ensemble_fit_runs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ensemble_fit_runs
    ADD CONSTRAINT ensemble_fit_runs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: ensemble_predictions ensemble_predictions_bandit_decision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ensemble_predictions
    ADD CONSTRAINT ensemble_predictions_bandit_decision_id_fkey FOREIGN KEY (bandit_decision_id) REFERENCES public.bandit_decisions(id) ON DELETE SET NULL;


--

--
-- Name: ensemble_predictions ensemble_predictions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ensemble_predictions
    ADD CONSTRAINT ensemble_predictions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: ensemble_weights ensemble_weights_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ensemble_weights
    ADD CONSTRAINT ensemble_weights_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: exam_submissions exam_submissions_exam_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_submissions
    ADD CONSTRAINT exam_submissions_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(id) ON DELETE CASCADE;


--

--
-- Name: exam_submissions exam_submissions_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exam_submissions
    ADD CONSTRAINT exam_submissions_student_id_fkey FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: exams exams_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: exams exams_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE CASCADE;


--

--
-- Name: exams exams_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exams
    ADD CONSTRAINT exams_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: extension_audit_chats extension_audit_chats_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_audit_chats
    ADD CONSTRAINT extension_audit_chats_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.extension_requests(id) ON DELETE CASCADE;


--

--
-- Name: extension_blueprints extension_blueprints_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_blueprints
    ADD CONSTRAINT extension_blueprints_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.extension_conversations(id) ON DELETE CASCADE;


--

--
-- Name: extension_blueprints extension_blueprints_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_blueprints
    ADD CONSTRAINT extension_blueprints_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: extension_conversations extension_conversations_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_conversations
    ADD CONSTRAINT extension_conversations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: extension_data extension_data_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_data
    ADD CONSTRAINT extension_data_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES auth.users(id);


--

--
-- Name: extension_data extension_data_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_data
    ADD CONSTRAINT extension_data_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: extension_data extension_data_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_data
    ADD CONSTRAINT extension_data_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.extension_versions(id) ON DELETE CASCADE;


--

--
-- Name: extension_messages extension_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_messages
    ADD CONSTRAINT extension_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.extension_conversations(id) ON DELETE CASCADE;


--

--
-- Name: extension_messages extension_messages_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_messages
    ADD CONSTRAINT extension_messages_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: extension_requests extension_requests_blueprint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_requests
    ADD CONSTRAINT extension_requests_blueprint_id_fkey FOREIGN KEY (blueprint_id) REFERENCES public.extension_blueprints(id) ON DELETE CASCADE;


--

--
-- Name: extension_requests extension_requests_reviewer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_requests
    ADD CONSTRAINT extension_requests_reviewer_user_id_fkey FOREIGN KEY (reviewer_user_id) REFERENCES auth.users(id);


--

--
-- Name: extension_requests extension_requests_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_requests
    ADD CONSTRAINT extension_requests_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: extension_sandbox_data extension_sandbox_data_blueprint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_sandbox_data
    ADD CONSTRAINT extension_sandbox_data_blueprint_id_fkey FOREIGN KEY (blueprint_id) REFERENCES public.extension_blueprints(id) ON DELETE CASCADE;


--

--
-- Name: extension_sandbox_data extension_sandbox_data_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_sandbox_data
    ADD CONSTRAINT extension_sandbox_data_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: extension_versions extension_versions_blueprint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_versions
    ADD CONSTRAINT extension_versions_blueprint_id_fkey FOREIGN KEY (blueprint_id) REFERENCES public.extension_blueprints(id) ON DELETE CASCADE;


--

--
-- Name: extension_versions extension_versions_deployed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_versions
    ADD CONSTRAINT extension_versions_deployed_by_user_id_fkey FOREIGN KEY (deployed_by_user_id) REFERENCES auth.users(id);


--

--
-- Name: extension_versions extension_versions_rolled_back_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_versions
    ADD CONSTRAINT extension_versions_rolled_back_by_fkey FOREIGN KEY (rolled_back_by) REFERENCES auth.users(id);


--

--
-- Name: extension_versions extension_versions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extension_versions
    ADD CONSTRAINT extension_versions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: fsrs_card_state fsrs_card_state_concept_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fsrs_card_state
    ADD CONSTRAINT fsrs_card_state_concept_id_fkey FOREIGN KEY (concept_id) REFERENCES public.concepts(id) ON DELETE CASCADE;


--

--
-- Name: fsrs_card_state fsrs_card_state_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fsrs_card_state
    ADD CONSTRAINT fsrs_card_state_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;


--

--
-- Name: fsrs_card_state fsrs_card_state_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fsrs_card_state
    ADD CONSTRAINT fsrs_card_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: graded_events graded_events_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.graded_events
    ADD CONSTRAINT graded_events_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.question_bank(id) ON DELETE SET NULL;


--

--
-- Name: hyperparameter_settings hyperparameter_settings_source_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hyperparameter_settings
    ADD CONSTRAINT hyperparameter_settings_source_run_id_fkey FOREIGN KEY (source_run_id) REFERENCES public.hyperparameter_tuning_runs(id) ON DELETE SET NULL;


--

--
-- Name: hyperparameter_tuning_runs hyperparameter_tuning_runs_triggered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hyperparameter_tuning_runs
    ADD CONSTRAINT hyperparameter_tuning_runs_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--

--
-- Name: invite_codes invite_codes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_codes
    ADD CONSTRAINT invite_codes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--

--
-- Name: invite_codes invite_codes_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_codes
    ADD CONSTRAINT invite_codes_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: invite_codes invite_codes_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_codes
    ADD CONSTRAINT invite_codes_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE CASCADE;


--

--
-- Name: invite_codes invite_codes_teacher_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_codes
    ADD CONSTRAINT invite_codes_teacher_category_id_fkey FOREIGN KEY (teacher_category_id) REFERENCES public.teacher_categories(id) ON DELETE CASCADE;


--

--
-- Name: invite_codes invite_codes_used_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_codes
    ADD CONSTRAINT invite_codes_used_by_fkey FOREIGN KEY (used_by) REFERENCES auth.users(id);


--

--
-- Name: invite_requests invite_requests_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_requests
    ADD CONSTRAINT invite_requests_code_id_fkey FOREIGN KEY (code_id) REFERENCES public.invite_codes(id) ON DELETE CASCADE;


--

--
-- Name: invite_requests invite_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_requests
    ADD CONSTRAINT invite_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--

--
-- Name: item_parameter_history item_parameter_history_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.item_parameter_history
    ADD CONSTRAINT item_parameter_history_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.question_bank(id) ON DELETE CASCADE;


--

--
-- Name: knowledge_gaps knowledge_gaps_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_gaps
    ADD CONSTRAINT knowledge_gaps_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: kt_sequence_state kt_sequence_state_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kt_sequence_state
    ADD CONSTRAINT kt_sequence_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: lct_exam_locks lct_exam_locks_exam_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lct_exam_locks
    ADD CONSTRAINT lct_exam_locks_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.lct_exams(id) ON DELETE CASCADE;


--

--
-- Name: lct_exam_locks lct_exam_locks_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lct_exam_locks
    ADD CONSTRAINT lct_exam_locks_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--

--
-- Name: lct_exam_schools lct_exam_schools_exam_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lct_exam_schools
    ADD CONSTRAINT lct_exam_schools_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.lct_exams(id) ON DELETE CASCADE;


--

--
-- Name: lct_exam_schools lct_exam_schools_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lct_exam_schools
    ADD CONSTRAINT lct_exam_schools_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: lct_exam_students lct_exam_students_exam_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lct_exam_students
    ADD CONSTRAINT lct_exam_students_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.lct_exams(id) ON DELETE CASCADE;


--

--
-- Name: lct_exam_students lct_exam_students_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lct_exam_students
    ADD CONSTRAINT lct_exam_students_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: lct_exam_students lct_exam_students_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lct_exam_students
    ADD CONSTRAINT lct_exam_students_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--

--
-- Name: lct_exams lct_exams_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lct_exams
    ADD CONSTRAINT lct_exams_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--

--
-- Name: learning_objectives learning_objectives_standard_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_objectives
    ADD CONSTRAINT learning_objectives_standard_id_fkey FOREIGN KEY (standard_id) REFERENCES public.curriculum_standards(id) ON DELETE CASCADE;


--

--
-- Name: learning_outcomes learning_outcomes_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_outcomes
    ADD CONSTRAINT learning_outcomes_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: lectures lectures_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lectures
    ADD CONSTRAINT lectures_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: lectures lectures_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lectures
    ADD CONSTRAINT lectures_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE CASCADE;


--

--
-- Name: lesson_explanations lesson_explanations_bandit_decision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_explanations
    ADD CONSTRAINT lesson_explanations_bandit_decision_id_fkey FOREIGN KEY (bandit_decision_id) REFERENCES public.bandit_decisions(id) ON DELETE SET NULL;


--

--
-- Name: lesson_explanations lesson_explanations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_explanations
    ADD CONSTRAINT lesson_explanations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: lesson_objective_bindings lesson_objective_bindings_objective_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_objective_bindings
    ADD CONSTRAINT lesson_objective_bindings_objective_id_fkey FOREIGN KEY (objective_id) REFERENCES public.learning_objectives(id) ON DELETE SET NULL;


--

--
-- Name: lesson_objective_bindings lesson_objective_bindings_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_objective_bindings
    ADD CONSTRAINT lesson_objective_bindings_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: lesson_objective_bindings lesson_objective_bindings_standard_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_objective_bindings
    ADD CONSTRAINT lesson_objective_bindings_standard_id_fkey FOREIGN KEY (standard_id) REFERENCES public.curriculum_standards(id) ON DELETE SET NULL;


--

--
-- Name: lesson_plans lesson_plans_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_plans
    ADD CONSTRAINT lesson_plans_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: lesson_plans lesson_plans_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_plans
    ADD CONSTRAINT lesson_plans_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE CASCADE;


--

--
-- Name: lesson_plans lesson_plans_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_plans
    ADD CONSTRAINT lesson_plans_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: live_meetings live_meetings_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_meetings
    ADD CONSTRAINT live_meetings_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: material_comments material_comments_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_comments
    ADD CONSTRAINT material_comments_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.course_materials(id) ON DELETE CASCADE;


--

--
-- Name: material_comments material_comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_comments
    ADD CONSTRAINT material_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: material_views material_views_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_views
    ADD CONSTRAINT material_views_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.course_materials(id) ON DELETE CASCADE;


--

--
-- Name: material_views material_views_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_views
    ADD CONSTRAINT material_views_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: mc_curriculum_subjects mc_curriculum_subjects_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_curriculum_subjects
    ADD CONSTRAINT mc_curriculum_subjects_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: mc_curriculum_subjects mc_curriculum_subjects_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_curriculum_subjects
    ADD CONSTRAINT mc_curriculum_subjects_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.mc_curriculum_version_defs(id) ON DELETE SET NULL;


--

--
-- Name: mc_curriculum_version_defs mc_curriculum_version_defs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_curriculum_version_defs
    ADD CONSTRAINT mc_curriculum_version_defs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: mc_educational_policies mc_educational_policies_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_educational_policies
    ADD CONSTRAINT mc_educational_policies_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: mc_lumina_config mc_lumina_config_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_lumina_config
    ADD CONSTRAINT mc_lumina_config_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: mc_regions mc_regions_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_regions
    ADD CONSTRAINT mc_regions_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.mc_regions(id) ON DELETE SET NULL;


--

--
-- Name: mc_regions mc_regions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_regions
    ADD CONSTRAINT mc_regions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: mc_school_lifecycle_events mc_school_lifecycle_events_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_school_lifecycle_events
    ADD CONSTRAINT mc_school_lifecycle_events_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: mc_school_lifecycle_events mc_school_lifecycle_events_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_school_lifecycle_events
    ADD CONSTRAINT mc_school_lifecycle_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: mc_school_region_assignments mc_school_region_assignments_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_school_region_assignments
    ADD CONSTRAINT mc_school_region_assignments_region_id_fkey FOREIGN KEY (region_id) REFERENCES public.mc_regions(id) ON DELETE CASCADE;


--

--
-- Name: mc_school_region_assignments mc_school_region_assignments_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_school_region_assignments
    ADD CONSTRAINT mc_school_region_assignments_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: mc_school_region_assignments mc_school_region_assignments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mc_school_region_assignments
    ADD CONSTRAINT mc_school_region_assignments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: messages messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--

--
-- Name: mi_daily_rollups mi_daily_rollups_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mi_daily_rollups
    ADD CONSTRAINT mi_daily_rollups_region_id_fkey FOREIGN KEY (region_id) REFERENCES public.mc_regions(id) ON DELETE SET NULL;


--

--
-- Name: mi_daily_rollups mi_daily_rollups_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mi_daily_rollups
    ADD CONSTRAINT mi_daily_rollups_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: mi_daily_rollups mi_daily_rollups_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mi_daily_rollups
    ADD CONSTRAINT mi_daily_rollups_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE SET NULL;


--

--
-- Name: mi_daily_rollups mi_daily_rollups_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mi_daily_rollups
    ADD CONSTRAINT mi_daily_rollups_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: mi_educational_events mi_educational_events_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mi_educational_events
    ADD CONSTRAINT mi_educational_events_region_id_fkey FOREIGN KEY (region_id) REFERENCES public.mc_regions(id) ON DELETE SET NULL;


--

--
-- Name: mi_educational_events mi_educational_events_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mi_educational_events
    ADD CONSTRAINT mi_educational_events_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;


--

--
-- Name: mi_educational_events mi_educational_events_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mi_educational_events
    ADD CONSTRAINT mi_educational_events_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE SET NULL;


--

--
-- Name: mi_educational_events mi_educational_events_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mi_educational_events
    ADD CONSTRAINT mi_educational_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: mi_insights mi_insights_region_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mi_insights
    ADD CONSTRAINT mi_insights_region_id_fkey FOREIGN KEY (region_id) REFERENCES public.mc_regions(id) ON DELETE SET NULL;


--

--
-- Name: mi_insights mi_insights_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mi_insights
    ADD CONSTRAINT mi_insights_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: mi_insights mi_insights_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mi_insights
    ADD CONSTRAINT mi_insights_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE SET NULL;


--

--
-- Name: mi_insights mi_insights_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mi_insights
    ADD CONSTRAINT mi_insights_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: mind_map_history mind_map_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mind_map_history
    ADD CONSTRAINT mind_map_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: ministry_access_codes ministry_access_codes_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_access_codes
    ADD CONSTRAINT ministry_access_codes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--

--
-- Name: ministry_access_requests ministry_access_requests_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_access_requests
    ADD CONSTRAINT ministry_access_requests_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--

--
-- Name: ministry_announcements ministry_announcements_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_announcements
    ADD CONSTRAINT ministry_announcements_author_id_fkey FOREIGN KEY (author_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--

--
-- Name: ministry_announcements ministry_announcements_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_announcements
    ADD CONSTRAINT ministry_announcements_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: ministry_audit_log ministry_audit_log_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_audit_log
    ADD CONSTRAINT ministry_audit_log_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE SET NULL;


--

--
-- Name: ministry_change_requests ministry_change_requests_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_change_requests
    ADD CONSTRAINT ministry_change_requests_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: ministry_ip_bans ministry_ip_bans_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_ip_bans
    ADD CONSTRAINT ministry_ip_bans_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--

--
-- Name: ministry_role_assignments ministry_role_assignments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_role_assignments
    ADD CONSTRAINT ministry_role_assignments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: ministry_sessions ministry_sessions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ministry_sessions
    ADD CONSTRAINT ministry_sessions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--

--
-- Name: misconception_embeddings misconception_embeddings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.misconception_embeddings
    ADD CONSTRAINT misconception_embeddings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: model_evaluation_metrics model_evaluation_metrics_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_evaluation_metrics
    ADD CONSTRAINT model_evaluation_metrics_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.model_evaluation_runs(id) ON DELETE CASCADE;


--

--
-- Name: model_evaluation_runs model_evaluation_runs_triggered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.model_evaluation_runs
    ADD CONSTRAINT model_evaluation_runs_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--

--
-- Name: moderation_actions moderation_actions_flag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_actions
    ADD CONSTRAINT moderation_actions_flag_id_fkey FOREIGN KEY (flag_id) REFERENCES public.content_flags(id);


--

--
-- Name: moderation_actions moderation_actions_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_actions
    ADD CONSTRAINT moderation_actions_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);


--

--
-- Name: moderator_invite_codes moderator_invite_codes_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderator_invite_codes
    ADD CONSTRAINT moderator_invite_codes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--

--
-- Name: moderator_requests moderator_requests_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderator_requests
    ADD CONSTRAINT moderator_requests_code_id_fkey FOREIGN KEY (code_id) REFERENCES public.moderator_invite_codes(id);


--

--
-- Name: note_snapshots note_snapshots_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_snapshots
    ADD CONSTRAINT note_snapshots_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.notes(id) ON DELETE CASCADE;


--

--
-- Name: note_timeline_summaries note_timeline_summaries_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_timeline_summaries
    ADD CONSTRAINT note_timeline_summaries_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.notes(id) ON DELETE CASCADE;


--

--
-- Name: parent_invite_codes parent_invite_codes_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parent_invite_codes
    ADD CONSTRAINT parent_invite_codes_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);


--

--
-- Name: parent_students parent_students_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parent_students
    ADD CONSTRAINT parent_students_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);


--

--
-- Name: pilot_assignments pilot_assignments_pilot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pilot_assignments
    ADD CONSTRAINT pilot_assignments_pilot_id_fkey FOREIGN KEY (pilot_id) REFERENCES public.pilot_studies(id) ON DELETE CASCADE;


--

--
-- Name: pilot_studies pilot_studies_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pilot_studies
    ADD CONSTRAINT pilot_studies_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: policy_evaluation_results policy_evaluation_results_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_evaluation_results
    ADD CONSTRAINT policy_evaluation_results_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.policy_evaluation_runs(id) ON DELETE CASCADE;


--

--
-- Name: policy_evaluation_runs policy_evaluation_runs_triggered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_evaluation_runs
    ADD CONSTRAINT policy_evaluation_runs_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--

--
-- Name: policy_regret_log policy_regret_log_decision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_regret_log
    ADD CONSTRAINT policy_regret_log_decision_id_fkey FOREIGN KEY (decision_id) REFERENCES public.bandit_decisions(id) ON DELETE CASCADE;


--

--
-- Name: policy_regret_log policy_regret_log_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_regret_log
    ADD CONSTRAINT policy_regret_log_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.policy_evaluation_runs(id) ON DELETE SET NULL;


--

--
-- Name: policy_regret_log policy_regret_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_regret_log
    ADD CONSTRAINT policy_regret_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: population_prior_runs population_prior_runs_triggered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.population_prior_runs
    ADD CONSTRAINT population_prior_runs_triggered_by_fkey FOREIGN KEY (triggered_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--

--
-- Name: population_priors population_priors_concept_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.population_priors
    ADD CONSTRAINT population_priors_concept_id_fkey FOREIGN KEY (concept_id) REFERENCES public.concepts(id) ON DELETE CASCADE;


--

--
-- Name: population_priors population_priors_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.population_priors
    ADD CONSTRAINT population_priors_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: profiles profiles_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);


--

--
-- Name: profiles profiles_teacher_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_teacher_category_id_fkey FOREIGN KEY (teacher_category_id) REFERENCES public.teacher_categories(id) ON DELETE SET NULL;


--

--
-- Name: profiles profiles_teacher_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_teacher_subject_id_fkey FOREIGN KEY (teacher_subject_id) REFERENCES public.subjects(id) ON DELETE SET NULL;


--

--
-- Name: report_cards report_cards_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_cards
    ADD CONSTRAINT report_cards_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: report_cards report_cards_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_cards
    ADD CONSTRAINT report_cards_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--

--
-- Name: report_cards report_cards_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_cards
    ADD CONSTRAINT report_cards_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE CASCADE;


--

--
-- Name: school_admins school_admins_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_admins
    ADD CONSTRAINT school_admins_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: school_admins school_admins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_admins
    ADD CONSTRAINT school_admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: schools schools_code_used_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schools
    ADD CONSTRAINT schools_code_used_by_fkey FOREIGN KEY (code_used_by) REFERENCES auth.users(id);


--

--
-- Name: schools schools_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schools
    ADD CONSTRAINT schools_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--

--
-- Name: student_classes student_classes_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_classes
    ADD CONSTRAINT student_classes_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--

--
-- Name: student_classes student_classes_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_classes
    ADD CONSTRAINT student_classes_student_id_fkey FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: student_memory student_memory_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_memory
    ADD CONSTRAINT student_memory_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: subjects subjects_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subjects
    ADD CONSTRAINT subjects_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: submissions submissions_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.assignments(id) ON DELETE CASCADE;


--

--
-- Name: submissions submissions_graded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_graded_by_fkey FOREIGN KEY (graded_by) REFERENCES auth.users(id);


--

--
-- Name: submissions submissions_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_student_id_fkey FOREIGN KEY (student_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: teacher_categories teacher_categories_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_categories
    ADD CONSTRAINT teacher_categories_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: teacher_categories teacher_categories_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_categories
    ADD CONSTRAINT teacher_categories_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE SET NULL;


--

--
-- Name: teacher_overrides teacher_overrides_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_overrides
    ADD CONSTRAINT teacher_overrides_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: teacher_requests teacher_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_requests
    ADD CONSTRAINT teacher_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: teacher_subjects teacher_subjects_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_subjects
    ADD CONSTRAINT teacher_subjects_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE CASCADE;


--

--
-- Name: teacher_subjects teacher_subjects_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_subjects
    ADD CONSTRAINT teacher_subjects_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: tenant_feature_flags tenant_feature_flags_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_feature_flags
    ADD CONSTRAINT tenant_feature_flags_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: tenant_roles tenant_roles_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_roles
    ADD CONSTRAINT tenant_roles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--

--
-- Name: tenant_roles tenant_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_roles
    ADD CONSTRAINT tenant_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: topic_locks topic_locks_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topic_locks
    ADD CONSTRAINT topic_locks_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: trip_reads trip_reads_trip_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_reads
    ADD CONSTRAINT trip_reads_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;


--

--
-- Name: trips trips_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: unified_policy_decisions unified_policy_decisions_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unified_policy_decisions
    ADD CONSTRAINT unified_policy_decisions_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;


--

--
-- Name: unified_policy_decisions unified_policy_decisions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unified_policy_decisions
    ADD CONSTRAINT unified_policy_decisions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: unified_student_state unified_student_state_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unified_student_state
    ADD CONSTRAINT unified_student_state_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;


--

--
-- Name: unified_student_state unified_student_state_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unified_student_state
    ADD CONSTRAINT unified_student_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

--
-- Name: user_strikes user_strikes_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_strikes
    ADD CONSTRAINT user_strikes_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

--
-- Name: weekly_plans weekly_plans_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_plans
    ADD CONSTRAINT weekly_plans_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--

-- Canonical Lumina schema source: authority and audit relationships

ALTER TABLE ONLY public.school_admins
  ADD CONSTRAINT school_admins_granted_by_fkey
  FOREIGN KEY (granted_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.school_admins
  ADD CONSTRAINT school_admins_revoked_by_fkey
  FOREIGN KEY (revoked_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public.invite_requests
  ADD CONSTRAINT invite_requests_processed_by_fkey
  FOREIGN KEY (processed_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
CREATE INDEX school_admins_active_school_idx
  ON public.school_admins (school_id, user_id)
  WHERE active;
CREATE INDEX invite_requests_denied_at_idx
  ON public.invite_requests (denied_at DESC)
  WHERE status = 'denied';

-- Canonical Lumina schema source: triggers
-- Derived from reviewed repository evidence; not historical deployment provenance.

--
-- Name: bandit_arm_state bandit_arm_state_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER bandit_arm_state_touch BEFORE UPDATE ON public.bandit_arm_state FOR EACH ROW EXECUTE FUNCTION public.touch_bandit_arm_state();


--

--
-- Name: lesson_events lesson_events_assign_seq_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lesson_events_assign_seq_trg BEFORE INSERT ON public.lesson_events FOR EACH ROW EXECUTE FUNCTION public.lesson_events_assign_seq();


--

--
-- Name: lesson_events lesson_events_broadcast_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lesson_events_broadcast_trg AFTER INSERT ON public.lesson_events FOR EACH ROW EXECUTE FUNCTION public.lesson_events_broadcast();


--

--
-- Name: lesson_sessions lesson_sessions_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lesson_sessions_touch_updated_at BEFORE UPDATE ON public.lesson_sessions FOR EACH ROW EXECUTE FUNCTION public.lse_touch_updated_at();


--

--
-- Name: assignment_submissions mi_after_assignment_submission; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mi_after_assignment_submission AFTER INSERT ON public.assignment_submissions FOR EACH ROW EXECUTE FUNCTION public.mi_tg_assignment_submission();


--

--
-- Name: chat_messages mi_after_chat_message; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mi_after_chat_message AFTER INSERT ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION public.mi_tg_chat_message();


--

--
-- Name: course_materials mi_after_course_material; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mi_after_course_material AFTER INSERT ON public.course_materials FOR EACH ROW EXECUTE FUNCTION public.mi_tg_course_material();


--

--
-- Name: exam_submissions mi_after_exam_submission; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mi_after_exam_submission AFTER INSERT ON public.exam_submissions FOR EACH ROW EXECUTE FUNCTION public.mi_tg_exam_submission();


--

--
-- Name: lesson_events mi_after_lesson_event; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mi_after_lesson_event AFTER INSERT ON public.lesson_events FOR EACH ROW EXECUTE FUNCTION public.mi_tg_lesson_event();


--

--
-- Name: material_views mi_after_material_view; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mi_after_material_view AFTER INSERT ON public.material_views FOR EACH ROW EXECUTE FUNCTION public.mi_tg_material_view();


--

--
-- Name: saved_lectures mi_after_saved_lecture; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mi_after_saved_lecture AFTER INSERT ON public.saved_lectures FOR EACH ROW EXECUTE FUNCTION public.mi_tg_saved_lecture();


--

--
-- Name: subjects subjects_after_insert_sync; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER subjects_after_insert_sync AFTER INSERT ON public.subjects FOR EACH ROW EXECUTE FUNCTION public.subjects_after_insert_sync();


--

--
-- Name: teacher_categories teacher_categories_after_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER teacher_categories_after_delete AFTER DELETE ON public.teacher_categories FOR EACH ROW EXECUTE FUNCTION public.tc_after_delete_sync();


--

--
-- Name: teacher_categories teacher_categories_after_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER teacher_categories_after_insert AFTER INSERT ON public.teacher_categories FOR EACH ROW EXECUTE FUNCTION public.tc_after_insert_sync();


--

--
-- Name: teacher_categories teacher_categories_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER teacher_categories_updated_at BEFORE UPDATE ON public.teacher_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

--
-- Name: tenants tenants_touch_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tenants_touch_updated_at BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--

--
-- Name: ability_estimates trg_ability_estimates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ability_estimates_updated_at BEFORE UPDATE ON public.ability_estimates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

--
-- Name: calibration_state trg_calibration_state_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_calibration_state_updated BEFORE UPDATE ON public.calibration_state FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--

--
-- Name: concept_mastery trg_concept_mastery_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_concept_mastery_updated BEFORE UPDATE ON public.concept_mastery FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

--
-- Name: concepts trg_concepts_fill_parents; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_concepts_fill_parents BEFORE INSERT ON public.concepts FOR EACH ROW EXECUTE FUNCTION public.concepts_fill_parents();


--

--
-- Name: concepts trg_concepts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_concepts_updated_at BEFORE UPDATE ON public.concepts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

--
-- Name: curriculum_standards trg_curriculum_standards_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_curriculum_standards_touch BEFORE UPDATE ON public.curriculum_standards FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--

--
-- Name: assignments trg_enforce_teacher_category_assignments; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_teacher_category_assignments BEFORE INSERT ON public.assignments FOR EACH ROW EXECUTE FUNCTION public.enforce_teacher_category();


--

--
-- Name: course_materials trg_enforce_teacher_category_materials; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_teacher_category_materials BEFORE INSERT ON public.course_materials FOR EACH ROW EXECUTE FUNCTION public.enforce_teacher_category();


--

--
-- Name: ensemble_weights trg_ens_w_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ens_w_updated BEFORE UPDATE ON public.ensemble_weights FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--

--
-- Name: profiles trg_generate_parent_code; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_generate_parent_code AFTER UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.generate_parent_code_on_approval();


--

--
-- Name: kt_sequence_state trg_kt_seq_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_kt_seq_updated BEFORE UPDATE ON public.kt_sequence_state FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--

--
-- Name: learning_mode_sessions trg_learning_mode_sessions_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_learning_mode_sessions_updated BEFORE UPDATE ON public.learning_mode_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

--
-- Name: lectures trg_lectures_fill_school; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_lectures_fill_school BEFORE INSERT ON public.lectures FOR EACH ROW EXECUTE FUNCTION public.lectures_fill_school_id();


--

--
-- Name: lectures trg_lectures_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_lectures_updated_at BEFORE UPDATE ON public.lectures FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

--
-- Name: live_meetings trg_live_meetings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_live_meetings_updated_at BEFORE UPDATE ON public.live_meetings FOR EACH ROW EXECUTE FUNCTION public.update_live_meetings_updated_at();


--

--
-- Name: mc_curriculum_subjects trg_mc_cs_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_mc_cs_touch BEFORE UPDATE ON public.mc_curriculum_subjects FOR EACH ROW EXECUTE FUNCTION public.mc_touch_updated_at();


--

--
-- Name: mc_curriculum_version_defs trg_mc_cvd_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_mc_cvd_touch BEFORE UPDATE ON public.mc_curriculum_version_defs FOR EACH ROW EXECUTE FUNCTION public.mc_touch_updated_at();


--

--
-- Name: mc_educational_policies trg_mc_ep_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_mc_ep_touch BEFORE UPDATE ON public.mc_educational_policies FOR EACH ROW EXECUTE FUNCTION public.mc_touch_updated_at();


--

--
-- Name: mc_lumina_config trg_mc_lc_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_mc_lc_touch BEFORE UPDATE ON public.mc_lumina_config FOR EACH ROW EXECUTE FUNCTION public.mc_touch_updated_at();


--

--
-- Name: mc_regions trg_mc_regions_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_mc_regions_touch BEFORE UPDATE ON public.mc_regions FOR EACH ROW EXECUTE FUNCTION public.mc_touch_updated_at();


--

--
-- Name: ministry_change_requests trg_mcr_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_mcr_touch BEFORE UPDATE ON public.ministry_change_requests FOR EACH ROW EXECUTE FUNCTION public.mc_touch_updated_at();


--

--
-- Name: ministry_announcements trg_ministry_announcements_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ministry_announcements_updated BEFORE UPDATE ON public.ministry_announcements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

--
-- Name: ministry_role_assignments trg_mra_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_mra_touch BEFORE UPDATE ON public.ministry_role_assignments FOR EACH ROW EXECUTE FUNCTION public.mc_touch_updated_at();


--

--
-- Name: pilot_studies trg_pilot_studies_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pilot_studies_touch BEFORE UPDATE ON public.pilot_studies FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--

--
-- Name: population_priors trg_population_priors_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_population_priors_touch BEFORE UPDATE ON public.population_priors FOR EACH ROW EXECUTE FUNCTION public.touch_population_priors_updated_at();


--

--
-- Name: question_bank trg_question_bank_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_question_bank_updated_at BEFORE UPDATE ON public.question_bank FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

--
-- Name: student_answer_history trg_recalculate_difficulty_level; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_recalculate_difficulty_level AFTER INSERT ON public.student_answer_history FOR EACH ROW EXECUTE FUNCTION public.recalculate_difficulty_level();


--

--
-- Name: cognitive_mirror_snapshots trg_recompute_mirror_stats; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_recompute_mirror_stats AFTER INSERT OR UPDATE OF prediction_matched, drift_score ON public.cognitive_mirror_snapshots FOR EACH ROW EXECUTE FUNCTION public.recompute_mirror_stats();


--

--
-- Name: confidence_responses trg_refresh_confidence_stats; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_refresh_confidence_stats AFTER INSERT ON public.confidence_responses FOR EACH ROW EXECUTE FUNCTION public.refresh_confidence_stats();


--

--
-- Name: notes trg_snapshot_note_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_snapshot_note_insert AFTER INSERT ON public.notes FOR EACH ROW EXECUTE FUNCTION public.snapshot_note_on_save();


--

--
-- Name: notes trg_snapshot_note_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_snapshot_note_update AFTER UPDATE ON public.notes FOR EACH ROW WHEN (((old.content IS DISTINCT FROM new.content) OR (old.title IS DISTINCT FROM new.title))) EXECUTE FUNCTION public.snapshot_note_on_save();


--

--
-- Name: subjects trg_subjects_sync_on_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_subjects_sync_on_delete BEFORE DELETE ON public.subjects FOR EACH ROW EXECUTE FUNCTION public.subjects_sync_on_delete();


--

--
-- Name: teacher_overrides trg_teacher_overrides_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_teacher_overrides_touch BEFORE UPDATE ON public.teacher_overrides FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--

--
-- Name: tenant_feature_flags trg_tenant_feature_flags_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tenant_feature_flags_updated BEFORE UPDATE ON public.tenant_feature_flags FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

--
-- Name: topic_locks trg_topic_locks_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_topic_locks_touch BEFORE UPDATE ON public.topic_locks FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--

--
-- Name: student_answer_history trigger_recalculate_difficulty; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_recalculate_difficulty AFTER INSERT ON public.student_answer_history FOR EACH ROW EXECUTE FUNCTION public.recalculate_difficulty_level();


--

--
-- Name: conversations update_conversations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

--
-- Name: course_materials update_course_materials_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_course_materials_updated_at BEFORE UPDATE ON public.course_materials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

--
-- Name: daily_streaks update_daily_streaks_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_daily_streaks_updated_at BEFORE UPDATE ON public.daily_streaks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

--
-- Name: materials update_materials_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_materials_updated_at BEFORE UPDATE ON public.materials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

--
-- Name: notes update_notes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_notes_updated_at BEFORE UPDATE ON public.notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

--
-- Name: saved_lectures update_saved_lectures_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_saved_lectures_updated_at BEFORE UPDATE ON public.saved_lectures FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

--
-- Name: schools update_schools_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_schools_updated_at BEFORE UPDATE ON public.schools FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

--
-- Name: student_goals update_student_goals_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_student_goals_updated_at BEFORE UPDATE ON public.student_goals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

--
-- Name: teacher_requests update_teacher_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_teacher_requests_updated_at BEFORE UPDATE ON public.teacher_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

--
-- Name: weekly_plans update_weekly_plans_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_weekly_plans_updated_at BEFORE UPDATE ON public.weekly_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

-- Canonical Lumina schema source: immutable authority and school-scoped operations

CREATE FUNCTION public.prevent_platform_audit_mutation() RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'platform_audit_log is append-only' USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER platform_audit_log_append_only
BEFORE UPDATE OR DELETE ON public.platform_audit_log
FOR EACH ROW EXECUTE FUNCTION public.prevent_platform_audit_mutation();

CREATE FUNCTION public.current_aal() RETURNS text
LANGUAGE sql STABLE
SET search_path TO 'pg_catalog', 'auth'
AS $$
  SELECT COALESCE(auth.jwt() ->> 'aal', 'aal1');
$$;

CREATE FUNCTION public.is_super_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $$
  SELECT auth.uid() IS NOT NULL
    AND public.current_aal() = 'aal2'
    AND EXISTS (
      SELECT 1
      FROM public.platform_role_assignments pra
      WHERE pra.user_id = auth.uid()
        AND pra.role = 'super_admin'::public.platform_role
        AND pra.active
    );
$$;

CREATE FUNCTION public.is_super_admin(uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $$
  SELECT uid IS NOT NULL AND uid = auth.uid() AND public.is_super_admin();
$$;

CREATE FUNCTION public.is_super_admin_user(uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $$
  SELECT uid IS NOT NULL AND uid = auth.uid() AND public.is_super_admin();
$$;

CREATE FUNCTION public.is_super_admin_caller() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $$
  SELECT public.is_super_admin();
$$;

CREATE FUNCTION public.is_school_admin_of(user_uuid uuid, check_school_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $$
  SELECT user_uuid IS NOT NULL
    AND check_school_id IS NOT NULL
    AND user_uuid = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.school_admins sa
        ON sa.user_id = p.id
       AND sa.school_id = p.school_id
       AND sa.active
      WHERE p.id = user_uuid
        AND p.school_id = check_school_id
        AND p.user_type = 'school_admin'
        AND p.status = 'approved'
        AND p.is_active
    );
$$;

CREATE FUNCTION public.is_school_admin(user_uuid uuid, check_school_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $$
  SELECT public.is_school_admin_of(user_uuid, check_school_id);
$$;

CREATE FUNCTION public.get_authority_context() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $$
  SELECT jsonb_build_object(
    'user_id', auth.uid(),
    'aal', public.current_aal(),
    'is_super_admin', public.is_super_admin(),
    'school_admin_school_ids', COALESCE((
      SELECT jsonb_agg(sa.school_id ORDER BY sa.school_id)
      FROM public.school_admins sa
      JOIN public.profiles p ON p.id = sa.user_id AND p.school_id = sa.school_id
      WHERE sa.user_id = auth.uid()
        AND sa.active
        AND p.user_type = 'school_admin'
        AND p.status = 'approved'
        AND p.is_active
    ), '[]'::jsonb)
  )
  WHERE auth.uid() IS NOT NULL;
$$;

CREATE FUNCTION public.grant_platform_role(target_user_id uuid, target_role public.platform_role DEFAULT 'super_admin') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super Admin with AAL2 required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = target_user_id) THEN
    RAISE EXCEPTION 'Target authentication identity does not exist' USING ERRCODE = '23503';
  END IF;
  IF (SELECT is_open FROM public.platform_bootstrap_state WHERE singleton) THEN
    RAISE EXCEPTION 'Owner bootstrap ceremony has not been completed' USING ERRCODE = '55000';
  END IF;

  PERFORM pg_advisory_xact_lock(pg_catalog.hashtext('lumina.platform_role_assignments'));
  INSERT INTO public.platform_role_assignments (
    user_id, role, active, granted_at, granted_by, revoked_at, revoked_by
  ) VALUES (
    target_user_id, target_role, true, now(), auth.uid(), NULL, NULL
  )
  ON CONFLICT (user_id, role) DO UPDATE SET
    active = true,
    granted_at = now(),
    granted_by = auth.uid(),
    revoked_at = NULL,
    revoked_by = NULL;

  INSERT INTO public.platform_audit_log (event_type, actor_user_id, target_user_id, detail)
  VALUES ('platform.role_granted', auth.uid(), target_user_id, jsonb_build_object('role', target_role));
  RETURN jsonb_build_object('success', true, 'user_id', target_user_id, 'role', target_role);
END;
$$;

CREATE FUNCTION public.revoke_platform_role(target_user_id uuid, target_role public.platform_role DEFAULT 'super_admin') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $$
DECLARE
  active_super_admins integer;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super Admin with AAL2 required' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(pg_catalog.hashtext('lumina.platform_role_assignments'));

  SELECT count(*) INTO active_super_admins
  FROM public.platform_role_assignments
  WHERE role = 'super_admin'::public.platform_role AND active;

  IF target_role = 'super_admin'::public.platform_role
     AND active_super_admins <= 1
     AND EXISTS (
       SELECT 1 FROM public.platform_role_assignments
       WHERE user_id = target_user_id AND role = target_role AND active
     ) THEN
    RAISE EXCEPTION 'Cannot revoke the last active Super Admin' USING ERRCODE = '23514';
  END IF;

  UPDATE public.platform_role_assignments
  SET active = false, revoked_at = now(), revoked_by = auth.uid()
  WHERE user_id = target_user_id AND role = target_role AND active;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'already_inactive', true);
  END IF;

  INSERT INTO public.platform_audit_log (event_type, actor_user_id, target_user_id, detail)
  VALUES ('platform.role_revoked', auth.uid(), target_user_id, jsonb_build_object('role', target_role));
  RETURN jsonb_build_object('success', true, 'user_id', target_user_id, 'role', target_role);
END;
$$;

CREATE FUNCTION public.create_school_with_code(
  school_name text,
  school_code text,
  activation_code_input text,
  school_address text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
AS $$
DECLARE
  new_school_id uuid;
  tenant_id uuid;
  code_hash text;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super Admin with AAL2 required' USING ERRCODE = '42501';
  END IF;
  IF btrim(COALESCE(school_name, '')) = '' OR btrim(COALESCE(school_code, '')) = '' THEN
    RAISE EXCEPTION 'School name and code are required' USING ERRCODE = '22023';
  END IF;
  IF upper(btrim(COALESCE(activation_code_input, ''))) !~ '^[A-Z0-9_-]{16,128}$' THEN
    RAISE EXCEPTION 'Activation code must be 16-128 characters using A-Z, 0-9, underscore, or hyphen' USING ERRCODE = '22023';
  END IF;
  code_hash := encode(extensions.digest(upper(btrim(activation_code_input)), 'sha256'), 'hex');
  IF EXISTS (SELECT 1 FROM public.schools s WHERE s.activation_code_hash = code_hash) THEN
    RAISE EXCEPTION 'Activation code already exists' USING ERRCODE = '23505';
  END IF;

  SELECT t.id INTO tenant_id
  FROM public.tenants t
  WHERE t.status = 'active' AND t.is_visible
  ORDER BY t.created_at, t.id
  LIMIT 1;
  IF tenant_id IS NULL THEN
    RAISE EXCEPTION 'No active tenant configured' USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.schools (name, code, activation_code_hash, address, status, code_used, tenant_id)
  VALUES (btrim(school_name), upper(btrim(school_code)), code_hash, NULLIF(btrim(school_address), ''), 'active', false, tenant_id)
  RETURNING id INTO new_school_id;

  INSERT INTO public.platform_audit_log (event_type, actor_user_id, school_id, detail)
  VALUES ('school.created', auth.uid(), new_school_id, jsonb_build_object('school_code', upper(btrim(school_code))));
  RETURN jsonb_build_object('success', true, 'school_id', new_school_id);
END;
$$;

CREATE FUNCTION public.activate_school(activation_code_input text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
AS $$
DECLARE
  actor_id uuid := auth.uid();
  actor_email text;
  actor_name text;
  code_hash text;
  school_record public.schools%ROWTYPE;
  current_profile public.profiles%ROWTYPE;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF upper(btrim(COALESCE(activation_code_input, ''))) !~ '^[A-Z0-9_-]{16,128}$' THEN
    RAISE EXCEPTION 'Invalid activation code' USING ERRCODE = '22023';
  END IF;
  code_hash := encode(extensions.digest(upper(btrim(activation_code_input)), 'sha256'), 'hex');

  SELECT s.* INTO school_record
  FROM public.schools s
  WHERE s.activation_code_hash = code_hash
    AND NOT s.code_used
    AND s.status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or already used activation code' USING ERRCODE = '22023';
  END IF;

  SELECT p.* INTO current_profile FROM public.profiles p WHERE p.id = actor_id FOR UPDATE;
  IF FOUND AND current_profile.school_id IS NOT NULL AND current_profile.school_id <> school_record.id THEN
    RAISE EXCEPTION 'Authenticated identity already belongs to another school' USING ERRCODE = '42501';
  END IF;

  SELECT u.email, COALESCE(NULLIF(u.raw_user_meta_data ->> 'full_name', ''), split_part(u.email, '@', 1), 'School Admin')
  INTO actor_email, actor_name
  FROM auth.users u WHERE u.id = actor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Authenticated identity does not exist' USING ERRCODE = '42501';
  END IF;

  UPDATE public.schools
  SET code_used = true, code_used_by = actor_id, code_used_at = now()
  WHERE id = school_record.id AND NOT code_used;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Activation code was consumed concurrently' USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.profiles (id, school_id, full_name, user_type, status, is_active, email)
  VALUES (actor_id, school_record.id, actor_name, 'school_admin', 'approved', true, actor_email)
  ON CONFLICT (id) DO UPDATE SET
    school_id = EXCLUDED.school_id,
    full_name = EXCLUDED.full_name,
    user_type = 'school_admin',
    status = 'approved',
    is_active = true,
    email = EXCLUDED.email;

  INSERT INTO public.school_admins (user_id, school_id, active, granted_at, granted_by, revoked_at, revoked_by)
  VALUES (actor_id, school_record.id, true, now(), actor_id, NULL, NULL)
  ON CONFLICT (user_id, school_id) DO UPDATE SET
    active = true, granted_at = now(), granted_by = actor_id, revoked_at = NULL, revoked_by = NULL;

  PERFORM public.seed_default_subjects(school_record.id);
  PERFORM public.seed_default_teacher_categories(school_record.id);
  INSERT INTO public.platform_audit_log (event_type, actor_user_id, school_id)
  VALUES ('school.activation_completed', actor_id, school_record.id);

  RETURN jsonb_build_object(
    'success', true,
    'school_id', school_record.id,
    'school_name', school_record.name,
    'tenant_id', school_record.tenant_id
  );
END;
$$;

CREATE FUNCTION public.approve_invite_request(p_request_id uuid, p_grade text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $$
DECLARE
  actor_id uuid := auth.uid();
  request_record record;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT ir.*, ic.school_id, ic.role, ic.subject_id
  INTO request_record
  FROM public.invite_requests ir
  JOIN public.invite_codes ic ON ic.id = ir.code_id
  WHERE ir.id = p_request_id
  FOR UPDATE OF ir, ic;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invite request not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.is_school_admin_of(actor_id, request_record.school_id) THEN
    RAISE EXCEPTION 'School Admin authority required for this school' USING ERRCODE = '42501';
  END IF;
  IF request_record.status = 'approved' THEN
    RETURN jsonb_build_object('success', true, 'already_approved', true, 'profile_id', request_record.user_id);
  END IF;
  IF request_record.status <> 'pending' OR request_record.user_id IS NULL THEN
    RAISE EXCEPTION 'Only a pending request bound to an authenticated identity can be approved' USING ERRCODE = '55000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = request_record.user_id) THEN
    RAISE EXCEPTION 'Invite identity does not exist' USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.profiles (id, school_id, full_name, email, user_type, status, is_active, grade_level, teacher_subject_id)
  VALUES (
    request_record.user_id, request_record.school_id, request_record.name, request_record.email,
    request_record.role, 'approved', true,
    CASE WHEN request_record.role = 'student' THEN p_grade ELSE NULL END,
    CASE WHEN request_record.role = 'teacher' THEN request_record.subject_id ELSE NULL END
  )
  ON CONFLICT (id) DO UPDATE SET
    school_id = EXCLUDED.school_id, full_name = EXCLUDED.full_name, email = EXCLUDED.email,
    user_type = EXCLUDED.user_type, status = 'approved', is_active = true,
    grade_level = EXCLUDED.grade_level, teacher_subject_id = EXCLUDED.teacher_subject_id;

  IF request_record.role IN ('teacher', 'student') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (request_record.user_id, request_record.role::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  UPDATE public.invite_requests
  SET status = 'approved', processed_by = actor_id, updated_at = now()
  WHERE id = p_request_id AND status = 'pending';
  UPDATE public.invite_codes SET used = true, used_by = request_record.user_id WHERE id = request_record.code_id;
  INSERT INTO public.platform_audit_log (event_type, actor_user_id, target_user_id, school_id, request_id)
  VALUES ('school.invite_approved', actor_id, request_record.user_id, request_record.school_id, p_request_id);
  RETURN jsonb_build_object('success', true, 'profile_id', request_record.user_id);
END;
$$;

CREATE FUNCTION public.deny_invite_request(p_request_id uuid, p_reason text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $$
DECLARE
  actor_id uuid := auth.uid();
  request_record record;
  normalized_reason text := NULLIF(left(btrim(COALESCE(p_reason, '')), 1000), '');
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT ir.*, ic.school_id
  INTO request_record
  FROM public.invite_requests ir
  JOIN public.invite_codes ic ON ic.id = ir.code_id
  WHERE ir.id = p_request_id
  FOR UPDATE OF ir;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invite request not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.is_school_admin_of(actor_id, request_record.school_id) THEN
    RAISE EXCEPTION 'School Admin authority required for this school' USING ERRCODE = '42501';
  END IF;
  IF request_record.status = 'denied' THEN
    RETURN jsonb_build_object('success', true, 'already_denied', true);
  END IF;
  IF request_record.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending invite requests can be denied' USING ERRCODE = '55000';
  END IF;

  UPDATE public.invite_requests
  SET status = 'denied', processed_by = actor_id, denied_at = now(), denial_reason = normalized_reason, updated_at = now()
  WHERE id = p_request_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Invite request changed concurrently' USING ERRCODE = '40001'; END IF;
  INSERT INTO public.platform_audit_log (event_type, actor_user_id, target_user_id, school_id, request_id, detail)
  VALUES (
    'school.invite_denied', actor_id, request_record.user_id, request_record.school_id, p_request_id,
    jsonb_build_object('reason_recorded', normalized_reason IS NOT NULL)
  );
  RETURN jsonb_build_object('success', true);
END;
$$;

-- Canonical Lumina schema source: row-level security and policies
-- Derived from reviewed repository evidence; not historical deployment provenance.

--
-- Canonical replacement for historical policy: user_roles Admins can delete user roles
--

CREATE POLICY "Super Admin can delete user roles" ON public.user_roles FOR DELETE TO authenticated USING (public.is_super_admin());

--
-- Name: admin_logs Admins can insert logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert logs" ON public.admin_logs FOR INSERT WITH CHECK ((admin_id = auth.uid()));


--

--
-- Canonical replacement for historical policy: user_roles Admins can insert user roles
--

CREATE POLICY "Super Admin can insert user roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());

--
-- Canonical replacement for historical policy: teacher_requests Admins can update requests
--

CREATE POLICY "School Admin can update school teacher requests" ON public.teacher_requests FOR UPDATE TO authenticated USING (public.is_school_admin_of(auth.uid(), (SELECT p.school_id FROM public.profiles p WHERE p.id = teacher_requests.user_id)) OR public.is_super_admin()) WITH CHECK (public.is_school_admin_of(auth.uid(), (SELECT p.school_id FROM public.profiles p WHERE p.id = teacher_requests.user_id)) OR public.is_super_admin());

--
-- Canonical replacement for historical policy: user_strikes Admins can update strikes
--

CREATE POLICY "School Admin can update school strikes" ON public.user_strikes FOR UPDATE TO authenticated USING (public.is_school_admin_of(auth.uid(), user_strikes.school_id) OR public.is_super_admin()) WITH CHECK (public.is_school_admin_of(auth.uid(), user_strikes.school_id) OR public.is_super_admin());

--
-- Canonical replacement for historical policy: teacher_requests Admins can view all requests
--

CREATE POLICY "School Admin can view school teacher requests" ON public.teacher_requests FOR SELECT TO authenticated USING (public.is_school_admin_of(auth.uid(), (SELECT p.school_id FROM public.profiles p WHERE p.id = teacher_requests.user_id)) OR public.is_super_admin());

--
-- Canonical replacement for historical policy: schools Admins can view all schools
--

CREATE POLICY "Super Admin can view all schools" ON public.schools FOR SELECT TO authenticated USING (public.is_super_admin());

--
-- Canonical replacement for historical policy: lesson_explanations Admins read all explanations
--

CREATE POLICY "Super Admin reads all explanations" ON public.lesson_explanations FOR SELECT TO authenticated USING (public.is_super_admin());

--
-- Canonical replacement for historical policy: lesson_events Admins read all lesson events
--

CREATE POLICY "Super Admin reads all lesson events" ON public.lesson_events FOR SELECT TO authenticated USING (public.is_super_admin());

--
-- Canonical replacement for historical policy: policy_regret_log Admins read all regret
--

CREATE POLICY "Super Admin reads all policy regret" ON public.policy_regret_log FOR SELECT TO authenticated USING (public.is_super_admin());

--
-- Canonical replacement for historical policy: engine_drift_alerts Admins read drift alerts
--

CREATE POLICY "Super Admin reads drift alerts" ON public.engine_drift_alerts FOR SELECT TO authenticated USING (public.is_super_admin());

--
-- Canonical replacement for historical policy: hyperparameter_tuning_runs Admins read hp tuning runs
--

CREATE POLICY "Super Admin reads tuning runs" ON public.hyperparameter_tuning_runs FOR SELECT TO authenticated USING (public.is_super_admin());

--
-- Canonical replacement for historical policy: policy_evaluation_results Admins read policy eval results
--

CREATE POLICY "Super Admin reads policy evaluation results" ON public.policy_evaluation_results FOR SELECT TO authenticated USING (public.is_super_admin());

--
-- Canonical replacement for historical policy: policy_evaluation_runs Admins read policy eval runs
--

CREATE POLICY "Super Admin reads policy evaluation runs" ON public.policy_evaluation_runs FOR SELECT TO authenticated USING (public.is_super_admin());

--
-- Canonical replacement for historical policy: population_prior_runs Admins read prior run audit
--

CREATE POLICY "Super Admin reads population prior runs" ON public.population_prior_runs FOR SELECT TO authenticated USING (public.is_super_admin());

--
-- Canonical replacement for historical policy: continuous_validation_runs Admins read validation runs
--

CREATE POLICY "Super Admin reads validation runs" ON public.continuous_validation_runs FOR SELECT TO authenticated USING (public.is_super_admin());

--
-- Canonical replacement for historical policy: live_meetings Admins view all meetings in school
--

CREATE POLICY "School Admin views school meetings" ON public.live_meetings FOR SELECT TO authenticated USING (public.is_school_admin_of(auth.uid(), live_meetings.school_id) OR public.is_super_admin());

--
-- Name: ministry_access_requests Anonymous can read own pending request; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anonymous can read own pending request" ON public.ministry_access_requests FOR SELECT USING ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'denied'::text])));


--

--
-- Name: question_bank Any signed-in user can read questions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Any signed-in user can read questions" ON public.question_bank FOR SELECT TO authenticated USING (true);


--

--
-- Name: ministry_sessions Anyone can read ministry sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read ministry sessions" ON public.ministry_sessions FOR SELECT USING (true);


--

--
-- Name: material_comments Anyone can view comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view comments" ON public.material_comments FOR SELECT TO authenticated USING (true);


--

--
-- Name: calibration_state Anyone signed in can read calibration; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone signed in can read calibration" ON public.calibration_state FOR SELECT TO authenticated USING (true);


--

--
-- Name: ministry_change_appliers Appliers readable by authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Appliers readable by authenticated" ON public.ministry_change_appliers FOR SELECT USING (true);


--

--
-- Name: chat_messages Approved users can send messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Approved users can send messages" ON public.chat_messages FOR INSERT WITH CHECK (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.status = 'approved'::text))))));


--

--
-- Name: ministry_audit_log Audit insert self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Audit insert self" ON public.ministry_audit_log FOR INSERT WITH CHECK (true);


--

--
-- Name: ministry_audit_log Audit super admin read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Audit super admin read" ON public.ministry_audit_log FOR SELECT USING (public.is_super_admin_caller());


--

--
-- Name: ministry_audit_log Audit tenant read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Audit tenant read" ON public.ministry_audit_log FOR SELECT USING (((tenant_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.ministry_role_assignments mra
  WHERE ((mra.user_id = auth.uid()) AND (mra.tenant_id = ministry_audit_log.tenant_id))))));


--

--
-- Name: hyperparameter_settings Authenticated read hp settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated read hp settings" ON public.hyperparameter_settings FOR SELECT TO authenticated USING (true);


--

--
-- Name: graded_events Authorised viewers read graded events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authorised viewers read graded events" ON public.graded_events FOR SELECT TO authenticated USING (public.can_view_student_mastery(auth.uid(), user_id));


--

--
-- Name: ability_estimates Authorised viewers read student ability; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authorised viewers read student ability" ON public.ability_estimates FOR SELECT TO authenticated USING (public.can_view_student_mastery(auth.uid(), user_id));


--

--
-- Name: bandit_decisions Authorized viewers read student bandit decisions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authorized viewers read student bandit decisions" ON public.bandit_decisions FOR SELECT TO authenticated USING (public.can_view_student_mastery(auth.uid(), user_id));


--

--
-- Name: bandit_arm_state Authorized viewers read student bandit state; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authorized viewers read student bandit state" ON public.bandit_arm_state FOR SELECT TO authenticated USING (((scope = 'user'::text) AND (user_id IS NOT NULL) AND public.can_view_student_mastery(auth.uid(), user_id)));


--

--
-- Name: ensemble_fit_runs Authorized viewers read student fit runs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authorized viewers read student fit runs" ON public.ensemble_fit_runs FOR SELECT TO authenticated USING (((scope = 'user'::text) AND (user_id IS NOT NULL) AND public.can_view_student_mastery(auth.uid(), user_id)));


--

--
-- Name: ensemble_predictions Authorized viewers read student predictions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authorized viewers read student predictions" ON public.ensemble_predictions FOR SELECT TO authenticated USING (public.can_view_student_mastery(auth.uid(), user_id));


--

--
-- Name: ministry_capabilities Capabilities readable by all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Capabilities readable by all" ON public.ministry_capabilities FOR SELECT USING (true);


--

--
-- Canonical replacement for historical policy: chat_rooms Chat room creators can delete
--

CREATE POLICY "Chat room creators and School Admin can delete" ON public.chat_rooms FOR DELETE TO authenticated USING (created_by = auth.uid() OR public.is_school_admin_of(auth.uid(), chat_rooms.school_id) OR public.is_super_admin());

--
-- Name: ministry_change_requests MCR super admin all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "MCR super admin all" ON public.ministry_change_requests USING (public.is_super_admin_caller()) WITH CHECK (public.is_super_admin_caller());


--

--
-- Name: ministry_change_requests MCR tenant members read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "MCR tenant members read" ON public.ministry_change_requests FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.ministry_role_assignments mra
  WHERE ((mra.user_id = auth.uid()) AND (mra.tenant_id = ministry_change_requests.tenant_id)))));


--

--
-- Name: ministry_role_assignments MRA self read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "MRA self read" ON public.ministry_role_assignments FOR SELECT USING (((user_id = auth.uid()) OR public.is_super_admin_caller()));


--

--
-- Name: ministry_role_assignments MRA super admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "MRA super admin write" ON public.ministry_role_assignments USING (public.is_super_admin_caller()) WITH CHECK (public.is_super_admin_caller());


--

--
-- Name: moderation_actions Moderators can manage actions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Moderators can manage actions" ON public.moderation_actions USING (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.user_type = 'moderator'::text) AND (profiles.is_active = true)))) OR public.is_super_admin())) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.user_type = 'moderator'::text) AND (profiles.is_active = true)))) OR public.is_super_admin()));


--

--
-- Name: content_flags Moderators can update flags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Moderators can update flags" ON public.content_flags FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.user_type = 'moderator'::text) AND (profiles.is_active = true)))) OR public.is_super_admin()));


--

--
-- Name: content_flags Moderators can view all flags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Moderators can view all flags" ON public.content_flags FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.user_type = 'moderator'::text) AND (profiles.is_active = true)))) OR public.is_super_admin()));


--

--
-- Name: ministry_access_codes No direct access to ministry codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "No direct access to ministry codes" ON public.ministry_access_codes FOR SELECT USING (false);


--

--
-- Name: assignment_submissions Parents can view child assignment submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Parents can view child assignment submissions" ON public.assignment_submissions FOR SELECT USING ((student_id IN ( SELECT parent_students.student_id
   FROM public.parent_students
  WHERE (parent_students.parent_id = auth.uid()))));


--

--
-- Name: assignments Parents can view child assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Parents can view child assignments" ON public.assignments FOR SELECT USING ((school_id IN ( SELECT parent_students.school_id
   FROM public.parent_students
  WHERE (parent_students.parent_id = auth.uid()))));


--

--
-- Name: attendance Parents can view child attendance; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Parents can view child attendance" ON public.attendance FOR SELECT USING ((student_id IN ( SELECT parent_students.student_id
   FROM public.parent_students
  WHERE (parent_students.parent_id = auth.uid()))));


--

--
-- Name: student_learning_profiles Parents can view child learning profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Parents can view child learning profiles" ON public.student_learning_profiles FOR SELECT USING ((user_id IN ( SELECT parent_students.student_id
   FROM public.parent_students
  WHERE (parent_students.parent_id = auth.uid()))));


--

--
-- Name: report_cards Parents can view child report cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Parents can view child report cards" ON public.report_cards FOR SELECT USING ((student_id IN ( SELECT parent_students.student_id
   FROM public.parent_students
  WHERE (parent_students.parent_id = auth.uid()))));


--

--
-- Name: parent_students Parents can view child school data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Parents can view child school data" ON public.parent_students FOR SELECT USING ((parent_id = auth.uid()));


--

--
-- Name: daily_streaks Parents can view child streaks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Parents can view child streaks" ON public.daily_streaks FOR SELECT USING ((user_id IN ( SELECT parent_students.student_id
   FROM public.parent_students
  WHERE (parent_students.parent_id = auth.uid()))));


--

--
-- Name: submissions Parents can view child submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Parents can view child submissions" ON public.submissions FOR SELECT USING ((student_id IN ( SELECT parent_students.student_id
   FROM public.parent_students
  WHERE (parent_students.parent_id = auth.uid()))));


--

--
-- Name: announcements Parents can view school announcements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Parents can view school announcements" ON public.announcements FOR SELECT USING ((school_id IN ( SELECT parent_students.school_id
   FROM public.parent_students
  WHERE (parent_students.parent_id = auth.uid()))));


--

--
-- Name: profiles Parents can view their child profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Parents can view their child profile" ON public.profiles FOR SELECT USING ((id IN ( SELECT parent_students.student_id
   FROM public.parent_students
  WHERE (parent_students.parent_id = auth.uid()))));


--

--
-- Name: parent_students Parents can view their links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Parents can view their links" ON public.parent_students FOR SELECT USING ((parent_id = auth.uid()));


--

--
-- Name: lesson_events Participants read events for their meetings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Participants read events for their meetings" ON public.lesson_events FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.live_meetings m
     JOIN public.profiles p ON ((p.id = auth.uid())))
  WHERE ((m.lesson_id = lesson_events.lesson_id) AND (p.school_id = m.school_id) AND ((m.teacher_id = auth.uid()) OR (p.grade_level = m.grade_level))))));


--

--
-- Name: ensemble_fit_runs Population fits readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Population fits readable" ON public.ensemble_fit_runs FOR SELECT TO authenticated USING ((scope = 'population'::text));


--

--
-- Name: bandit_arm_state Population priors readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Population priors readable" ON public.bandit_arm_state FOR SELECT TO authenticated USING ((scope = 'population'::text));


--

--
-- Name: tenants Read active visible tenants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Read active visible tenants" ON public.tenants FOR SELECT TO authenticated USING (((status = 'active'::text) AND (is_visible = true)));


--

--
-- Name: moderation_actions School admins can appeal actions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can appeal actions" ON public.moderation_actions FOR UPDATE USING (((school_id IS NOT NULL) AND public.is_school_admin_of(auth.uid(), school_id)));


--

--
-- Canonical replacement for historical policy: user_strikes School admins can issue strikes
--

CREATE POLICY "School Admin can issue school strikes" ON public.user_strikes FOR INSERT TO authenticated WITH CHECK (issued_by = auth.uid() AND public.is_school_admin_of(auth.uid(), user_strikes.school_id));

--
-- Name: announcements School admins can manage announcements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can manage announcements" ON public.announcements USING (public.is_school_admin_of(auth.uid(), school_id));


--

--
-- Name: classes School admins can manage classes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can manage classes" ON public.classes USING (public.is_school_admin_of(auth.uid(), school_id));


--

--
-- Name: invite_codes School admins can manage invite codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can manage invite codes" ON public.invite_codes USING (public.is_school_admin_of(auth.uid(), school_id));


--

--
-- Name: invite_requests School admins can manage invite requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can manage invite requests" ON public.invite_requests USING ((EXISTS ( SELECT 1
   FROM public.invite_codes ic
  WHERE ((ic.id = invite_requests.code_id) AND public.is_school_admin_of(auth.uid(), ic.school_id)))));


--

--
-- Name: report_cards School admins can manage report cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can manage report cards" ON public.report_cards USING (public.is_school_admin_of(auth.uid(), school_id)) WITH CHECK (public.is_school_admin_of(auth.uid(), school_id));


--

--
-- Name: student_classes School admins can manage student classes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can manage student classes" ON public.student_classes USING ((EXISTS ( SELECT 1
   FROM public.classes c
  WHERE ((c.id = student_classes.class_id) AND public.is_school_admin_of(auth.uid(), c.school_id)))));


--

--
-- Name: subjects School admins can manage subjects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can manage subjects" ON public.subjects USING (public.is_school_admin_of(auth.uid(), school_id));


--

--
-- Name: teacher_subjects School admins can manage teacher subjects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can manage teacher subjects" ON public.teacher_subjects USING ((EXISTS ( SELECT 1
   FROM public.subjects s
  WHERE ((s.id = teacher_subjects.subject_id) AND public.is_school_admin_of(auth.uid(), s.school_id)))));


--

--
-- Name: trips School admins can manage trips; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can manage trips" ON public.trips USING (public.is_school_admin_of(auth.uid(), school_id));


--

--
-- Name: weekly_plans School admins can manage weekly plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can manage weekly plans" ON public.weekly_plans USING ((EXISTS ( SELECT 1
   FROM public.school_admins sa
  WHERE ((sa.school_id = weekly_plans.school_id) AND (sa.user_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.school_admins sa
  WHERE ((sa.school_id = weekly_plans.school_id) AND (sa.user_id = auth.uid())))));


--

--
-- Name: mi_educational_events School admins can read own-school events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can read own-school events" ON public.mi_educational_events FOR SELECT TO authenticated USING (((school_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.school_admins sa
  WHERE ((sa.school_id = mi_educational_events.school_id) AND (sa.user_id = auth.uid()))))));


--

--
-- Name: profiles School admins can update school profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can update school profiles" ON public.profiles FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.school_admins sa
  WHERE ((sa.user_id = auth.uid()) AND (sa.school_id = profiles.school_id)))));


--

--
-- Name: attendance School admins can view all attendance; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can view all attendance" ON public.attendance FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.classes c
  WHERE ((c.id = attendance.class_id) AND public.is_school_admin_of(auth.uid(), c.school_id)))));


--

--
-- Name: lesson_plans School admins can view all lesson plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can view all lesson plans" ON public.lesson_plans FOR SELECT USING (public.is_school_admin_of(auth.uid(), school_id));


--

--
-- Name: announcement_reads School admins can view all reads for their announcements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can view all reads for their announcements" ON public.announcement_reads FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.announcements a
  WHERE ((a.id = announcement_reads.announcement_id) AND public.is_school_admin_of(auth.uid(), a.school_id)))));


--

--
-- Name: report_cards School admins can view all report cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can view all report cards" ON public.report_cards FOR SELECT USING (public.is_school_admin_of(auth.uid(), school_id));


--

--
-- Name: trip_reads School admins can view all trip reads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can view all trip reads" ON public.trip_reads FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.trips t
  WHERE ((t.id = trip_reads.trip_id) AND public.is_school_admin_of(auth.uid(), t.school_id)))));


--

--
-- Name: parent_invite_codes School admins can view parent codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can view parent codes" ON public.parent_invite_codes FOR SELECT USING (public.is_school_admin_of(auth.uid(), school_id));


--

--
-- Name: parent_students School admins can view parent links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can view parent links" ON public.parent_students FOR SELECT USING (public.is_school_admin_of(auth.uid(), school_id));


--

--
-- Name: moderation_actions School admins can view school actions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can view school actions" ON public.moderation_actions FOR SELECT USING (((school_id IS NOT NULL) AND public.is_school_admin_of(auth.uid(), school_id)));


--

--
-- Name: activity_logs School admins can view school activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can view school activity" ON public.activity_logs FOR SELECT USING (public.is_school_admin_of(auth.uid(), school_id));


--

--
-- Name: profiles School admins can view school profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can view school profiles" ON public.profiles FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.school_admins sa
  WHERE ((sa.user_id = auth.uid()) AND (sa.school_id = profiles.school_id)))));


--

--
-- Name: user_strikes School admins can view school strikes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can view school strikes" ON public.user_strikes FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.school_admins
  WHERE ((school_admins.user_id = auth.uid()) AND (school_admins.school_id = user_strikes.school_id)))));


--

--
-- Name: student_learning_profiles School admins can view student learning profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can view student learning profiles" ON public.student_learning_profiles FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.profiles student_p
     JOIN public.profiles admin_p ON ((admin_p.id = auth.uid())))
  WHERE ((student_p.id = student_learning_profiles.user_id) AND (student_p.school_id = admin_p.school_id) AND (admin_p.user_type = 'school_admin'::text) AND (admin_p.is_active = true)))));


--

--
-- Name: submissions School admins can view submissions in their school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can view submissions in their school" ON public.submissions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.assignments a
     JOIN public.profiles p ON ((p.id = auth.uid())))
  WHERE ((a.id = submissions.assignment_id) AND (a.school_id = p.school_id) AND (p.user_type = 'school_admin'::text) AND (p.is_active = true)))));


--

--
-- Name: admin_logs School admins can view their logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins can view their logs" ON public.admin_logs FOR SELECT USING (((admin_id = auth.uid()) OR public.is_school_admin_of(auth.uid(), school_id)));


--

--
-- Name: teacher_categories School admins manage teacher_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins manage teacher_categories" ON public.teacher_categories TO authenticated USING (public.is_school_admin_of(auth.uid(), school_id)) WITH CHECK (public.is_school_admin_of(auth.uid(), school_id));


--

--
-- Name: mi_insights School admins read own-school insights; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins read own-school insights" ON public.mi_insights FOR SELECT TO authenticated USING (((scope = 'school'::public.mi_insight_scope) AND (school_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.school_admins sa
  WHERE ((sa.school_id = mi_insights.school_id) AND (sa.user_id = auth.uid()))))));


--

--
-- Name: mi_daily_rollups School admins read own-school rollups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School admins read own-school rollups" ON public.mi_daily_rollups FOR SELECT TO authenticated USING (((school_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.school_admins sa
  WHERE ((sa.school_id = mi_daily_rollups.school_id) AND (sa.user_id = auth.uid()))))));


--

--
-- Name: lesson_state_snapshots School members read snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School members read snapshots" ON public.lesson_state_snapshots FOR SELECT TO authenticated USING ((school_id = public.get_user_school_id(auth.uid())));


--

--
-- Name: teacher_categories School members read teacher_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "School members read teacher_categories" ON public.teacher_categories FOR SELECT TO authenticated USING (((school_id = public.get_user_school_id(auth.uid())) OR public.is_school_admin_of(auth.uid(), school_id)));


--

--
-- Name: knowledge_gaps Service role full access gaps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access gaps" ON public.knowledge_gaps TO service_role USING (true) WITH CHECK (true);


--

--
-- Name: student_memory Service role full access memory; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role full access memory" ON public.student_memory TO service_role USING (true) WITH CHECK (true);


--

--
-- Name: lesson_events Staff read school lesson events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read school lesson events" ON public.lesson_events FOR SELECT TO authenticated USING (((school_id = public.get_user_school_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.user_type = ANY (ARRAY['teacher'::text, 'school_admin'::text])))))));


--

--
-- Name: lesson_sessions Staff read school sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff read school sessions" ON public.lesson_sessions FOR SELECT TO authenticated USING (((school_id = public.get_user_school_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.user_type = ANY (ARRAY['teacher'::text, 'school_admin'::text])))))));


--

--
-- Name: lesson_state_snapshots Staff write snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff write snapshots" ON public.lesson_state_snapshots FOR INSERT TO authenticated WITH CHECK (((school_id = public.get_user_school_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.user_type = ANY (ARRAY['teacher'::text, 'school_admin'::text])))))));


--

--
-- Name: exam_submissions Students can manage their exam submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can manage their exam submissions" ON public.exam_submissions USING ((student_id = auth.uid()));


--

--
-- Name: submissions Students can manage their submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can manage their submissions" ON public.submissions USING ((student_id = auth.uid()));


--

--
-- Name: assignment_views Students can record their assignment views; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can record their assignment views" ON public.assignment_views FOR INSERT WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: assignment_submissions Students can submit assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can submit assignments" ON public.assignment_submissions FOR INSERT WITH CHECK ((auth.uid() = student_id));


--

--
-- Name: lct_exam_students Students can update their own lct exam answers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can update their own lct exam answers" ON public.lct_exam_students FOR UPDATE USING ((student_id = auth.uid()));


--

--
-- Name: assignment_submissions Students can update their ungraded submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can update their ungraded submissions" ON public.assignment_submissions FOR UPDATE USING (((student_id = auth.uid()) AND (graded_at IS NULL)));


--

--
-- Name: exams Students can view published exams in their school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can view published exams in their school" ON public.exams FOR SELECT USING (((school_id = public.get_user_school_id(auth.uid())) AND (is_published = true)));


--

--
-- Name: lesson_plans Students can view published lesson plans in their school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can view published lesson plans in their school" ON public.lesson_plans FOR SELECT USING (((school_id = public.get_user_school_id(auth.uid())) AND (is_published = true)));


--

--
-- Name: attendance Students can view their attendance; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can view their attendance" ON public.attendance FOR SELECT USING ((student_id = auth.uid()));


--

--
-- Name: awards Students can view their awards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can view their awards" ON public.awards FOR SELECT USING ((student_id = auth.uid()));


--

--
-- Name: student_classes Students can view their classes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can view their classes" ON public.student_classes FOR SELECT USING ((student_id = auth.uid()));


--

--
-- Name: assignment_views Students can view their own assignment views; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can view their own assignment views" ON public.assignment_views FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: lct_exam_students Students can view their own lct exam; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can view their own lct exam" ON public.lct_exam_students FOR SELECT USING ((student_id = auth.uid()));


--

--
-- Name: lct_exam_locks Students can view their own lock; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can view their own lock" ON public.lct_exam_locks FOR SELECT USING ((student_id = auth.uid()));


--

--
-- Name: parent_invite_codes Students can view their own parent code; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can view their own parent code" ON public.parent_invite_codes FOR SELECT USING ((student_id = auth.uid()));


--

--
-- Name: assignment_submissions Students can view their own submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can view their own submissions" ON public.assignment_submissions FOR SELECT USING ((student_id = auth.uid()));


--

--
-- Name: report_cards Students can view their report cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can view their report cards" ON public.report_cards FOR SELECT USING ((student_id = auth.uid()));


--

--
-- Name: weekly_plans Students can view weekly plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students can view weekly plans" ON public.weekly_plans FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.school_id = weekly_plans.school_id) AND (p.is_active = true) AND ((weekly_plans.grade_level = 'All Grades'::text) OR (p.grade_level = weekly_plans.grade_level))))));


--

--
-- Name: lesson_sessions Students manage own sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students manage own sessions" ON public.lesson_sessions TO authenticated USING ((student_id = auth.uid())) WITH CHECK (((student_id = auth.uid()) AND (school_id = public.get_user_school_id(auth.uid()))));


--

--
-- Name: ability_estimates Students read own ability; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students read own ability" ON public.ability_estimates FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--

--
-- Name: bandit_decisions Students read own bandit decisions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students read own bandit decisions" ON public.bandit_decisions FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--

--
-- Name: bandit_arm_state Students read own bandit state; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students read own bandit state" ON public.bandit_arm_state FOR SELECT TO authenticated USING (((scope = 'user'::text) AND (user_id = auth.uid())));


--

--
-- Name: lesson_explanations Students read own explanations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students read own explanations" ON public.lesson_explanations FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--

--
-- Name: ensemble_fit_runs Students read own fit runs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students read own fit runs" ON public.ensemble_fit_runs FOR SELECT TO authenticated USING (((scope = 'user'::text) AND (user_id = auth.uid())));


--

--
-- Name: graded_events Students read own graded events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students read own graded events" ON public.graded_events FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--

--
-- Name: ensemble_predictions Students read own predictions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students read own predictions" ON public.ensemble_predictions FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--

--
-- Name: policy_regret_log Students read own regret log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students read own regret log" ON public.policy_regret_log FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--

--
-- Name: lesson_events Students read visible lesson events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students read visible lesson events" ON public.lesson_events FOR SELECT TO authenticated USING (((teacher_visible = true) AND (school_id = public.get_user_school_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.user_type = 'student'::text))))));


--

--
-- Name: live_meetings Students view meetings for their grade; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Students view meetings for their grade" ON public.live_meetings FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.school_id = live_meetings.school_id) AND (p.grade_level = live_meetings.grade_level)))));


--

--
-- Name: ministry_ip_bans Super admin can manage IP bans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can manage IP bans" ON public.ministry_ip_bans USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--

--
-- Name: profiles Super admin can manage all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can manage all profiles" ON public.profiles USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--

--
-- Name: schools Super admin can manage all schools; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can manage all schools" ON public.schools USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--

--
-- Name: ministry_access_requests Super admin can manage ministry requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can manage ministry requests" ON public.ministry_access_requests USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--

--
-- Name: ministry_sessions Super admin can manage ministry sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can manage ministry sessions" ON public.ministry_sessions USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--

--
-- Name: moderator_invite_codes Super admin can manage moderator codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can manage moderator codes" ON public.moderator_invite_codes USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--

--
-- Name: moderator_requests Super admin can manage moderator requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can manage moderator requests" ON public.moderator_requests USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--

--
-- Name: weekly_plans Super admin can manage weekly plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can manage weekly plans" ON public.weekly_plans USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--

--
-- Name: mi_educational_events Super admin can read all mi events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can read all mi events" ON public.mi_educational_events FOR SELECT TO authenticated USING (public.is_super_admin_caller());


--

--
-- Name: ale_api_usage Super admin can view ALE api usage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can view ALE api usage" ON public.ale_api_usage FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));


--

--
-- Name: activity_logs Super admin can view all activity logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can view all activity logs" ON public.activity_logs FOR SELECT USING (public.is_super_admin());


--

--
-- Name: assignments Super admin can view all assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can view all assignments" ON public.assignments FOR SELECT USING (public.is_super_admin());


--

--
-- Name: course_materials Super admin can view all course materials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can view all course materials" ON public.course_materials FOR SELECT USING (public.is_super_admin());


--

--
-- Name: student_learning_profiles Super admin can view all learning profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can view all learning profiles" ON public.student_learning_profiles FOR SELECT USING (public.is_super_admin());


--

--
-- Name: learning_style_profiles Super admin can view all learning style profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can view all learning style profiles" ON public.learning_style_profiles FOR SELECT USING (public.is_super_admin());


--

--
-- Name: profiles Super admin can view all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can view all profiles" ON public.profiles FOR SELECT USING (public.is_super_admin());


--

--
-- Name: submissions Super admin can view all submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin can view all submissions" ON public.submissions FOR SELECT USING (public.is_super_admin());


--

--
-- Name: lct_exam_locks Super admin full access lct_exam_locks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin full access lct_exam_locks" ON public.lct_exam_locks USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--

--
-- Name: lct_exam_schools Super admin full access lct_exam_schools; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin full access lct_exam_schools" ON public.lct_exam_schools USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--

--
-- Name: lct_exam_students Super admin full access lct_exam_students; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin full access lct_exam_students" ON public.lct_exam_students USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--

--
-- Name: lct_exams Super admin full access lct_exams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin full access lct_exams" ON public.lct_exams USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--

--
-- Name: tenant_roles Super admin manages tenant roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin manages tenant roles" ON public.tenant_roles TO authenticated USING (public.is_super_admin_user(auth.uid())) WITH CHECK (public.is_super_admin_user(auth.uid()));


--

--
-- Name: tenants Super admin manages tenants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin manages tenants" ON public.tenants TO authenticated USING (public.is_super_admin_user(auth.uid())) WITH CHECK (public.is_super_admin_user(auth.uid()));


--

--
-- Name: mi_insights Super admin reads insights; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin reads insights" ON public.mi_insights FOR SELECT TO authenticated USING (public.is_super_admin_caller());


--

--
-- Name: item_parameter_history Super admin reads item parameter history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin reads item parameter history" ON public.item_parameter_history FOR SELECT TO authenticated USING (public.is_super_admin());


--

--
-- Name: mi_daily_rollups Super admin reads rollups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin reads rollups" ON public.mi_daily_rollups FOR SELECT TO authenticated USING (public.is_super_admin_caller());


--

--
-- Name: lumina_api_usage Super admin views usage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super admin views usage" ON public.lumina_api_usage FOR SELECT USING (public.is_super_admin_user(auth.uid()));


--

--
-- Canonical replacement for historical policy: schools Super admins can insert schools
--

CREATE POLICY "Super Admin can insert schools" ON public.schools FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());

--
-- Canonical replacement for historical policy: school_admins Super admins can manage school admins
--

CREATE POLICY "Super Admin can manage School Admin memberships" ON public.school_admins TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

--
-- Name: activity_logs System can insert activity logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can insert activity logs" ON public.activity_logs FOR INSERT WITH CHECK ((user_id = auth.uid()));


--

--
-- Canonical replacement for historical policy: chat_rooms Teachers and admins can create chat rooms
--

CREATE POLICY "Teachers and School Admin can create school chat rooms" ON public.chat_rooms FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'teacher'::public.app_role) OR public.is_school_admin_of(auth.uid(), chat_rooms.school_id) OR public.is_super_admin());

--
-- Name: assignments Teachers can create assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can create assignments" ON public.assignments FOR INSERT TO authenticated WITH CHECK (((auth.uid() = teacher_id) AND (public.has_role(auth.uid(), 'teacher'::public.app_role) OR public.is_teacher(auth.uid()))));


--

--
-- Name: course_materials Teachers can delete own materials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can delete own materials" ON public.course_materials FOR DELETE USING (((uploaded_by = auth.uid()) AND public.is_teacher(auth.uid())));


--

--
-- Canonical replacement for historical policy: assignments Teachers can delete their assignments
--

CREATE POLICY "Teachers and School Admin can delete school assignments" ON public.assignments FOR DELETE TO authenticated USING (teacher_id = auth.uid() OR public.is_school_admin_of(auth.uid(), assignments.school_id) OR public.is_super_admin());

--
-- Name: course_materials Teachers can delete their own materials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can delete their own materials" ON public.course_materials FOR DELETE TO authenticated USING ((public.has_role(auth.uid(), 'teacher'::public.app_role) AND (uploaded_by = auth.uid())));


--

--
-- Name: assignment_submissions Teachers can grade submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can grade submissions" ON public.assignment_submissions FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.assignments
  WHERE ((assignments.id = assignment_submissions.assignment_id) AND (assignments.teacher_id = auth.uid())))));


--

--
-- Name: course_materials Teachers can insert course materials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can insert course materials" ON public.course_materials FOR INSERT TO authenticated WITH CHECK (((auth.uid() = uploaded_by) AND public.is_teacher(auth.uid())));


--

--
-- Name: attendance Teachers can manage attendance; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can manage attendance" ON public.attendance USING ((teacher_id = auth.uid()));


--

--
-- Name: awards Teachers can manage awards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can manage awards" ON public.awards USING ((teacher_id = auth.uid()));


--

--
-- Name: report_cards Teachers can manage report cards in their school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can manage report cards in their school" ON public.report_cards USING (((school_id = public.get_user_school_id(auth.uid())) AND public.is_teacher(auth.uid())));


--

--
-- Name: exams Teachers can manage their exams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can manage their exams" ON public.exams USING ((teacher_id = auth.uid()));


--

--
-- Name: lesson_plans Teachers can manage their lesson plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can manage their lesson plans" ON public.lesson_plans USING ((teacher_id = auth.uid()));


--

--
-- Name: course_materials Teachers can update own materials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can update own materials" ON public.course_materials FOR UPDATE USING (((uploaded_by = auth.uid()) AND public.is_teacher(auth.uid())));


--

--
-- Name: assignments Teachers can update their assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can update their assignments" ON public.assignments FOR UPDATE USING ((teacher_id = auth.uid()));


--

--
-- Name: course_materials Teachers can update their own materials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can update their own materials" ON public.course_materials FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'teacher'::public.app_role) AND (uploaded_by = auth.uid())));


--

--
-- Name: submissions Teachers can view and grade submissions for their assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can view and grade submissions for their assignments" ON public.submissions USING ((EXISTS ( SELECT 1
   FROM public.assignments a
  WHERE ((a.id = submissions.assignment_id) AND (a.teacher_id = auth.uid())))));


--

--
-- Name: assignment_views Teachers can view assignment views for their assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can view assignment views for their assignments" ON public.assignment_views FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.assignments a
  WHERE ((a.id = assignment_views.assignment_id) AND (a.teacher_id = auth.uid())))));


--

--
-- Name: exam_submissions Teachers can view exam submissions for their exams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can view exam submissions for their exams" ON public.exam_submissions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.exams e
  WHERE ((e.id = exam_submissions.exam_id) AND (e.teacher_id = auth.uid())))));


--

--
-- Name: profiles Teachers can view profiles in their school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can view profiles in their school" ON public.profiles FOR SELECT USING (((school_id = public.get_user_school_id(auth.uid())) AND public.is_teacher(auth.uid())));


--

--
-- Name: student_learning_profiles Teachers can view student learning profiles in their school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can view student learning profiles in their school" ON public.student_learning_profiles FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.profiles teacher_p
     JOIN public.profiles student_p ON ((student_p.id = student_learning_profiles.user_id)))
  WHERE ((teacher_p.id = auth.uid()) AND (teacher_p.user_type = 'teacher'::text) AND (teacher_p.is_active = true) AND (student_p.school_id = teacher_p.school_id)))));


--

--
-- Name: assignment_submissions Teachers can view submissions for their assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can view submissions for their assignments" ON public.assignment_submissions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.assignments
  WHERE ((assignments.id = assignment_submissions.assignment_id) AND (assignments.teacher_id = auth.uid())))));


--

--
-- Name: teacher_subjects Teachers can view their subjects; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can view their subjects" ON public.teacher_subjects FOR SELECT USING ((teacher_id = auth.uid()));


--

--
-- Name: weekly_plans Teachers can view weekly plans; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers can view weekly plans" ON public.weekly_plans FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.school_id = weekly_plans.school_id) AND (p.user_type = 'teacher'::text) AND (p.is_active = true)))));


--

--
-- Name: lesson_events Teachers insert events into own meetings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers insert events into own meetings" ON public.lesson_events FOR INSERT TO authenticated WITH CHECK (((teacher_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.live_meetings m
  WHERE ((m.lesson_id = lesson_events.lesson_id) AND (m.teacher_id = auth.uid()) AND (m.school_id = lesson_events.school_id))))));


--

--
-- Name: lesson_events Teachers insert own lesson events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers insert own lesson events" ON public.lesson_events FOR INSERT TO authenticated WITH CHECK (((teacher_id = auth.uid()) AND (school_id = public.get_user_school_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.user_type = ANY (ARRAY['teacher'::text, 'school_admin'::text])))))));


--

--
-- Name: live_meetings Teachers manage own live meetings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Teachers manage own live meetings" ON public.live_meetings TO authenticated USING (((teacher_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.school_id = live_meetings.school_id)))))) WITH CHECK (((teacher_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.school_id = live_meetings.school_id))))));


--

--
-- Name: curriculum_standards Tenant boundary on curriculum_standards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant boundary on curriculum_standards" ON public.curriculum_standards AS RESTRICTIVE TO authenticated USING ((public.is_super_admin(auth.uid()) OR (tenant_id = public.get_user_tenant_id(auth.uid()))));


--

--
-- Name: curriculum_versions Tenant boundary on curriculum_versions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant boundary on curriculum_versions" ON public.curriculum_versions AS RESTRICTIVE TO authenticated USING ((public.is_super_admin(auth.uid()) OR (tenant_id = public.get_user_tenant_id(auth.uid()))));


--

--
-- Name: lct_exam_locks Tenant boundary on lct_exam_locks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant boundary on lct_exam_locks" ON public.lct_exam_locks AS RESTRICTIVE TO authenticated USING ((public.is_super_admin(auth.uid()) OR (tenant_id = public.get_user_tenant_id(auth.uid()))));


--

--
-- Name: lct_exam_students Tenant boundary on lct_exam_students; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant boundary on lct_exam_students" ON public.lct_exam_students AS RESTRICTIVE TO authenticated USING ((public.is_super_admin(auth.uid()) OR (tenant_id = public.get_user_tenant_id(auth.uid()))));


--

--
-- Name: lct_exams Tenant boundary on lct_exams; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant boundary on lct_exams" ON public.lct_exams AS RESTRICTIVE TO authenticated USING ((public.is_super_admin(auth.uid()) OR (tenant_id = public.get_user_tenant_id(auth.uid()))));


--

--
-- Name: schools Tenant boundary on schools; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant boundary on schools" ON public.schools AS RESTRICTIVE TO authenticated USING ((public.is_super_admin(auth.uid()) OR (tenant_id = public.get_user_tenant_id(auth.uid()))));


--

--
-- Name: tenant_roles Tenant role holders read their assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tenant role holders read their assignments" ON public.tenant_roles FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_super_admin_user(auth.uid())));


--

--
-- Name: invite_requests Users can create invite requests with valid code; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create invite requests with valid code" ON public.invite_requests FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.invite_codes ic
  WHERE ((ic.id = invite_requests.code_id) AND (ic.used = false) AND (ic.expires_at > now())))));


--

--
-- Name: messages Users can create messages in their conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create messages in their conversations" ON public.messages FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.conversations
  WHERE ((conversations.id = messages.conversation_id) AND (conversations.user_id = auth.uid())))));


--

--
-- Name: conversations Users can create their own conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own conversations" ON public.conversations FOR INSERT WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: student_goals Users can create their own goals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own goals" ON public.student_goals FOR INSERT WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: materials Users can create their own materials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own materials" ON public.materials FOR INSERT WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: notes Users can create their own notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own notes" ON public.notes FOR INSERT WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: teacher_requests Users can create their own request; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own request" ON public.teacher_requests FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: messages Users can delete messages in their conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete messages in their conversations" ON public.messages FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.conversations
  WHERE ((conversations.id = messages.conversation_id) AND (conversations.user_id = auth.uid())))));


--

--
-- Name: knowledge_gaps Users can delete own gaps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own gaps" ON public.knowledge_gaps FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--

--
-- Name: student_memory Users can delete own memories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own memories" ON public.student_memory FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--

--
-- Name: material_comments Users can delete their own comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own comments" ON public.material_comments FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--

--
-- Name: conversations Users can delete their own conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own conversations" ON public.conversations FOR DELETE USING ((auth.uid() = user_id));


--

--
-- Name: student_goals Users can delete their own goals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own goals" ON public.student_goals FOR DELETE USING ((auth.uid() = user_id));


--

--
-- Name: materials Users can delete their own materials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own materials" ON public.materials FOR DELETE USING ((auth.uid() = user_id));


--

--
-- Canonical replacement for historical policy: chat_messages Users can delete their own messages
--

CREATE POLICY "Users and School Admin can delete school messages" ON public.chat_messages FOR DELETE TO authenticated USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.chat_rooms cr WHERE cr.id = chat_messages.room_id AND public.is_school_admin_of(auth.uid(), cr.school_id)) OR public.is_super_admin());

--
-- Name: notes Users can delete their own notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own notes" ON public.notes FOR DELETE USING ((auth.uid() = user_id));


--

--
-- Name: knowledge_gaps Users can insert own gaps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own gaps" ON public.knowledge_gaps FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: student_memory Users can insert own memories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own memories" ON public.student_memory FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: profiles Users can insert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((auth.uid() = id));


--

--
-- Name: iq_test_results Users can insert their own IQ results; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own IQ results" ON public.iq_test_results FOR INSERT WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: user_activity_log Users can insert their own activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own activity" ON public.user_activity_log FOR INSERT WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: student_answer_history Users can insert their own answers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own answers" ON public.student_answer_history FOR INSERT WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: material_comments Users can insert their own comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own comments" ON public.material_comments FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: student_learning_profiles Users can insert their own learning profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own learning profile" ON public.student_learning_profiles FOR INSERT WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: learning_style_profiles Users can insert their own learning style; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own learning style" ON public.learning_style_profiles FOR INSERT WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: podcast_generations Users can insert their own podcast generations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own podcast generations" ON public.podcast_generations FOR INSERT WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: announcement_reads Users can insert their own reads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own reads" ON public.announcement_reads FOR INSERT WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: daily_streaks Users can insert their own streak; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own streak" ON public.daily_streaks FOR INSERT WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: trip_reads Users can insert their own trip reads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own trip reads" ON public.trip_reads FOR INSERT WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: material_views Users can insert their own views; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own views" ON public.material_views FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: knowledge_gaps Users can update own gaps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own gaps" ON public.knowledge_gaps FOR UPDATE TO authenticated USING ((auth.uid() = user_id));


--

--
-- Name: student_memory Users can update own memories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own memories" ON public.student_memory FOR UPDATE TO authenticated USING ((auth.uid() = user_id));


--

--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING ((auth.uid() = id));


--

--
-- Name: conversations Users can update their own conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own conversations" ON public.conversations FOR UPDATE USING ((auth.uid() = user_id));


--

--
-- Name: student_goals Users can update their own goals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own goals" ON public.student_goals FOR UPDATE USING ((auth.uid() = user_id));


--

--
-- Name: student_learning_profiles Users can update their own learning profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own learning profile" ON public.student_learning_profiles FOR UPDATE USING ((auth.uid() = user_id));


--

--
-- Name: learning_style_profiles Users can update their own learning style; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own learning style" ON public.learning_style_profiles FOR UPDATE USING ((auth.uid() = user_id));


--

--
-- Name: materials Users can update their own materials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own materials" ON public.materials FOR UPDATE USING ((auth.uid() = user_id));


--

--
-- Name: notes Users can update their own notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own notes" ON public.notes FOR UPDATE USING ((auth.uid() = user_id));


--

--
-- Name: daily_streaks Users can update their own streak; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own streak" ON public.daily_streaks FOR UPDATE USING ((auth.uid() = user_id));


--

--
-- Name: announcements Users can view announcements in their school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view announcements in their school" ON public.announcements FOR SELECT USING ((school_id = public.get_user_school_id(auth.uid())));


--

--
-- Name: assignments Users can view assignments in their school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view assignments in their school" ON public.assignments FOR SELECT USING ((school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.status = 'approved'::text)))));


--

--
-- Name: chat_rooms Users can view chat rooms in their school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view chat rooms in their school" ON public.chat_rooms FOR SELECT USING ((school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.status = 'approved'::text)))));


--

--
-- Name: classes Users can view classes in their school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view classes in their school" ON public.classes FOR SELECT USING ((school_id = public.get_user_school_id(auth.uid())));


--

--
-- Name: course_materials Users can view materials from their school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view materials from their school" ON public.course_materials FOR SELECT USING (((school_id IS NOT NULL) AND (school_id = ( SELECT profiles.school_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid())))));


--

--
-- Name: messages Users can view messages in their conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view messages in their conversations" ON public.messages FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.conversations
  WHERE ((conversations.id = messages.conversation_id) AND (conversations.user_id = auth.uid())))));


--

--
-- Name: chat_messages Users can view messages in their school chat rooms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view messages in their school chat rooms" ON public.chat_messages FOR SELECT USING ((chat_room_id IN ( SELECT cr.id
   FROM (public.chat_rooms cr
     JOIN public.profiles p ON ((p.school_id = cr.school_id)))
  WHERE ((p.id = auth.uid()) AND (p.status = 'approved'::text)))));


--

--
-- Name: moderation_actions Users can view own actions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own actions" ON public.moderation_actions FOR SELECT USING ((target_user_id = auth.uid()));


--

--
-- Name: knowledge_gaps Users can view own gaps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own gaps" ON public.knowledge_gaps FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--

--
-- Name: student_memory Users can view own memories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own memories" ON public.student_memory FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--

--
-- Canonical immutable-identity replacement: moderator_requests Users can view own moderator request by email
--

CREATE POLICY "Users can view own moderator request" ON public.moderator_requests FOR SELECT TO authenticated USING (user_id = auth.uid());

--
-- Name: profiles Users can view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING ((auth.uid() = id));


--

--
-- Canonical immutable-identity replacement: profiles Users can view own profile by email
--

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());

--
-- Name: subjects Users can view subjects in their school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view subjects in their school" ON public.subjects FOR SELECT USING ((school_id = public.get_user_school_id(auth.uid())));


--

--
-- Name: iq_test_results Users can view their own IQ results; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own IQ results" ON public.iq_test_results FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: activity_logs Users can view their own activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own activity" ON public.activity_logs FOR SELECT USING ((user_id = auth.uid()));


--

--
-- Name: user_activity_log Users can view their own activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own activity" ON public.user_activity_log FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: student_answer_history Users can view their own answer history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own answer history" ON public.student_answer_history FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: conversations Users can view their own conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own conversations" ON public.conversations FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: student_goals Users can view their own goals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own goals" ON public.student_goals FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: student_learning_profiles Users can view their own learning profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own learning profile" ON public.student_learning_profiles FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: learning_style_profiles Users can view their own learning style; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own learning style" ON public.learning_style_profiles FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: material_views Users can view their own material views; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own material views" ON public.material_views FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--

--
-- Name: materials Users can view their own materials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own materials" ON public.materials FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: notes Users can view their own notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own notes" ON public.notes FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: podcast_generations Users can view their own podcast generations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own podcast generations" ON public.podcast_generations FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: announcement_reads Users can view their own reads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own reads" ON public.announcement_reads FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: teacher_requests Users can view their own requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own requests" ON public.teacher_requests FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--

--
-- Name: user_roles Users can view their own roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--

--
-- Name: schools Users can view their own school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own school" ON public.schools FOR SELECT TO authenticated USING ((id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.status = 'approved'::text)))));


--

--
-- Name: daily_streaks Users can view their own streak; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own streak" ON public.daily_streaks FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: user_strikes Users can view their own strikes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own strikes" ON public.user_strikes FOR SELECT USING ((user_id = auth.uid()));


--

--
-- Name: trip_reads Users can view their own trip reads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own trip reads" ON public.trip_reads FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: school_admins Users can view their school admin status; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their school admin status" ON public.school_admins FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--

--
-- Name: course_materials Users can view their school materials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their school materials" ON public.course_materials FOR SELECT TO authenticated USING ((school_id IN ( SELECT profiles.school_id
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.status = 'approved'::text)))));


--

--
-- Name: trips Users can view trips in their school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view trips in their school" ON public.trips FOR SELECT USING ((school_id = public.get_user_school_id(auth.uid())));


--

--
-- Name: saved_lectures Users create own saved lectures; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users create own saved lectures" ON public.saved_lectures FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: saved_lectures Users delete own saved lectures; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users delete own saved lectures" ON public.saved_lectures FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--

--
-- Name: mind_map_history Users manage own mind maps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own mind maps" ON public.mind_map_history TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: kt_sequence_state Users read own kt state; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users read own kt state" ON public.kt_sequence_state FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--

--
-- Name: ensemble_weights Users read own or population weights; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users read own or population weights" ON public.ensemble_weights FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR (user_id IS NULL)));


--

--
-- Name: saved_lectures Users update own saved lectures; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users update own saved lectures" ON public.saved_lectures FOR UPDATE TO authenticated USING ((auth.uid() = user_id));


--

--
-- Name: saved_lectures Users view own saved lectures; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users view own saved lectures" ON public.saved_lectures FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--

--
-- Name: moderator_requests Validated moderator signup; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Validated moderator signup" ON public.moderator_requests FOR INSERT TO authenticated, anon WITH CHECK ((EXISTS ( SELECT 1
   FROM public.moderator_invite_codes
  WHERE ((moderator_invite_codes.id = moderator_requests.code_id) AND (moderator_invite_codes.used = false) AND (moderator_invite_codes.expires_at > now())))));


--

--
-- Name: ability_estimates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ability_estimates ENABLE ROW LEVEL SECURITY;

--

--
-- Name: activity_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

--

--
-- Name: adaptive_quality_scores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.adaptive_quality_scores ENABLE ROW LEVEL SECURITY;

--

--
-- Name: data_export_requests admin/teacher request exports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin/teacher request exports" ON public.data_export_requests FOR INSERT TO authenticated WITH CHECK (((requested_by = auth.uid()) AND (((school_id IS NOT NULL) AND public.is_school_admin_of(auth.uid(), school_id)) OR public.has_role(auth.uid(), 'teacher'::public.app_role) OR ((scope = 'student'::text) AND (target_id = auth.uid())))));


--

--
-- Name: admin_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

--

--
-- Canonical replacement for historical policy: model_evaluation_metrics admins read eval metrics
--

CREATE POLICY "Super Admin reads evaluation metrics" ON public.model_evaluation_metrics FOR SELECT TO authenticated USING (public.is_super_admin());

--
-- Canonical replacement for historical policy: model_evaluation_runs admins read eval runs
--

CREATE POLICY "Super Admin reads evaluation runs" ON public.model_evaluation_runs FOR SELECT TO authenticated USING (public.is_super_admin());

--
-- Name: governance_audit_trail admins read own school audit; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins read own school audit" ON public.governance_audit_trail FOR SELECT TO authenticated USING (((school_id IS NULL) OR public.is_school_admin_of(auth.uid(), school_id) OR public.is_super_admin_user(auth.uid())));


--

--
-- Name: pilot_assignments admins write pilot assignments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins write pilot assignments" ON public.pilot_assignments TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.pilot_studies p
  WHERE ((p.id = pilot_assignments.pilot_id) AND ((p.school_id IS NULL) OR public.is_school_admin_of(auth.uid(), p.school_id)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.pilot_studies p
  WHERE ((p.id = pilot_assignments.pilot_id) AND ((p.school_id IS NULL) OR public.is_school_admin_of(auth.uid(), p.school_id))))));


--

--
-- Name: ai_output_signals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_output_signals ENABLE ROW LEVEL SECURITY;

--

--
-- Name: ale_api_students; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ale_api_students ENABLE ROW LEVEL SECURITY;

--

--
-- Name: ale_api_usage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ale_api_usage ENABLE ROW LEVEL SECURITY;

--

--
-- Name: anchor_recalibrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.anchor_recalibrations ENABLE ROW LEVEL SECURITY;

--

--
-- Name: announcement_reads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

--

--
-- Name: announcements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

--

--
-- Name: governance_audit_trail any authenticated may append own audit row; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "any authenticated may append own audit row" ON public.governance_audit_trail FOR INSERT TO authenticated WITH CHECK (((actor_id = auth.uid()) OR (actor_id IS NULL)));


--

--
-- Name: assessment_scores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assessment_scores ENABLE ROW LEVEL SECURITY;

--

--
-- Name: assignment_submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assignment_submissions ENABLE ROW LEVEL SECURITY;

--

--
-- Name: assignment_views; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assignment_views ENABLE ROW LEVEL SECURITY;

--

--
-- Name: assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

--

--
-- Name: attendance; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

--

--
-- Name: symbolic_alignment_matrices auth reads alignment matrices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth reads alignment matrices" ON public.symbolic_alignment_matrices FOR SELECT TO authenticated USING (true);


--

--
-- Name: unified_objective_runs auth reads objective runs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth reads objective runs" ON public.unified_objective_runs FOR SELECT TO authenticated USING (true);


--

--
-- Name: unified_policy_weights auth reads policy weights; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth reads policy weights" ON public.unified_policy_weights FOR SELECT TO authenticated USING (true);


--

--
-- Name: awards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.awards ENABLE ROW LEVEL SECURITY;

--

--
-- Name: bandit_arm_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bandit_arm_state ENABLE ROW LEVEL SECURITY;

--

--
-- Name: bandit_decisions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bandit_decisions ENABLE ROW LEVEL SECURITY;

--

--
-- Name: calibration_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calibration_state ENABLE ROW LEVEL SECURITY;

--

--
-- Name: chat_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

--

--
-- Name: chat_rooms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;

--

--
-- Name: classes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

--

--
-- Name: cognitive_mirror_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cognitive_mirror_snapshots ENABLE ROW LEVEL SECURITY;

--

--
-- Name: cognitive_mirror_stats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cognitive_mirror_stats ENABLE ROW LEVEL SECURITY;

--

--
-- Name: concept_mastery; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.concept_mastery ENABLE ROW LEVEL SECURITY;

--

--
-- Name: concept_standard_map; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.concept_standard_map ENABLE ROW LEVEL SECURITY;

--

--
-- Name: concepts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.concepts ENABLE ROW LEVEL SECURITY;

--

--
-- Name: concepts concepts_select_same_school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY concepts_select_same_school ON public.concepts FOR SELECT TO authenticated USING (((school_id = public.get_user_school_id(auth.uid())) OR public.is_super_admin_user(auth.uid())));


--

--
-- Name: concepts concepts_write_school_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY concepts_write_school_staff ON public.concepts TO authenticated USING ((public.is_super_admin_user(auth.uid()) OR ((school_id = public.get_user_school_id(auth.uid())) AND (public.is_school_admin_of(auth.uid(), school_id) OR public.is_teacher(auth.uid()))))) WITH CHECK ((public.is_super_admin_user(auth.uid()) OR ((school_id = public.get_user_school_id(auth.uid())) AND (public.is_school_admin_of(auth.uid(), school_id) OR public.is_teacher(auth.uid())))));


--

--
-- Name: confidence_calibration_stats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.confidence_calibration_stats ENABLE ROW LEVEL SECURITY;

--

--
-- Name: confidence_responses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.confidence_responses ENABLE ROW LEVEL SECURITY;

--

--
-- Name: content_flags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.content_flags ENABLE ROW LEVEL SECURITY;

--

--
-- Name: continuous_validation_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.continuous_validation_runs ENABLE ROW LEVEL SECURITY;

--

--
-- Name: conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

--

--
-- Name: course_materials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.course_materials ENABLE ROW LEVEL SECURITY;

--

--
-- Name: curriculum_standards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.curriculum_standards ENABLE ROW LEVEL SECURITY;

--

--
-- Name: curriculum_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.curriculum_versions ENABLE ROW LEVEL SECURITY;

--

--
-- Name: curriculum_versions curriculum_versions_select_same_school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY curriculum_versions_select_same_school ON public.curriculum_versions FOR SELECT TO authenticated USING (((school_id = public.get_user_school_id(auth.uid())) OR public.is_super_admin_user(auth.uid())));


--

--
-- Name: curriculum_versions curriculum_versions_write_school_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY curriculum_versions_write_school_admin ON public.curriculum_versions TO authenticated USING ((public.is_super_admin_user(auth.uid()) OR ((school_id = public.get_user_school_id(auth.uid())) AND public.is_school_admin_of(auth.uid(), school_id)))) WITH CHECK ((public.is_super_admin_user(auth.uid()) OR ((school_id = public.get_user_school_id(auth.uid())) AND public.is_school_admin_of(auth.uid(), school_id))));


--

--
-- Name: daily_streaks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_streaks ENABLE ROW LEVEL SECURITY;

--

--
-- Name: data_export_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.data_export_requests ENABLE ROW LEVEL SECURITY;

--

--
-- Name: decay_refreshers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.decay_refreshers ENABLE ROW LEVEL SECURITY;

--

--
-- Name: engine_drift_alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.engine_drift_alerts ENABLE ROW LEVEL SECURITY;

--

--
-- Name: ensemble_fit_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ensemble_fit_runs ENABLE ROW LEVEL SECURITY;

--

--
-- Name: ensemble_predictions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ensemble_predictions ENABLE ROW LEVEL SECURITY;

--

--
-- Name: ensemble_weights; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ensemble_weights ENABLE ROW LEVEL SECURITY;

--

--
-- Name: exam_submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exam_submissions ENABLE ROW LEVEL SECURITY;

--

--
-- Name: exams; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;

--

--
-- Name: extension_audit_chats ext_audit super admin read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ext_audit super admin read" ON public.extension_audit_chats FOR SELECT USING (public.is_super_admin_caller());


--

--
-- Name: extension_blueprints ext_bp super admin read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ext_bp super admin read" ON public.extension_blueprints FOR SELECT USING (public.is_super_admin_caller());


--

--
-- Name: extension_conversations ext_conv super admin read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ext_conv super admin read" ON public.extension_conversations FOR SELECT USING (public.is_super_admin_caller());


--

--
-- Name: extension_data ext_data owner delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ext_data owner delete" ON public.extension_data FOR DELETE TO authenticated USING ((owner_user_id = auth.uid()));


--

--
-- Name: extension_data ext_data owner update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ext_data owner update" ON public.extension_data FOR UPDATE TO authenticated USING ((owner_user_id = auth.uid())) WITH CHECK ((owner_user_id = auth.uid()));


--

--
-- Name: extension_data ext_data tenant insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ext_data tenant insert" ON public.extension_data FOR INSERT TO authenticated WITH CHECK (((tenant_id IN ( SELECT s.tenant_id
   FROM (public.schools s
     JOIN public.profiles p ON ((p.school_id = s.id)))
  WHERE (p.id = auth.uid()))) AND ((owner_user_id IS NULL) OR (owner_user_id = auth.uid()))));


--

--
-- Name: extension_data ext_data tenant read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ext_data tenant read" ON public.extension_data FOR SELECT TO authenticated USING ((public.is_super_admin_caller() OR (tenant_id IN ( SELECT s.tenant_id
   FROM (public.schools s
     JOIN public.profiles p ON ((p.school_id = s.id)))
  WHERE (p.id = auth.uid())))));


--

--
-- Name: extension_messages ext_msg super admin read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ext_msg super admin read" ON public.extension_messages FOR SELECT USING (public.is_super_admin_caller());


--

--
-- Name: extension_requests ext_req super admin read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ext_req super admin read" ON public.extension_requests FOR SELECT USING (public.is_super_admin_caller());


--

--
-- Name: extension_sandbox_data ext_sandbox super admin read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ext_sandbox super admin read" ON public.extension_sandbox_data FOR SELECT USING (public.is_super_admin_caller());


--

--
-- Name: extension_versions ext_ver active read for tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ext_ver active read for tenant" ON public.extension_versions FOR SELECT USING (((active = true) AND (public.is_super_admin_caller() OR (tenant_id IN ( SELECT s.tenant_id
   FROM (public.schools s
     JOIN public.profiles p ON ((p.school_id = s.id)))
  WHERE (p.id = auth.uid()))))));


--

--
-- Name: extension_audit_chats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.extension_audit_chats ENABLE ROW LEVEL SECURITY;

--

--
-- Name: extension_blueprints; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.extension_blueprints ENABLE ROW LEVEL SECURITY;

--

--
-- Name: extension_conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.extension_conversations ENABLE ROW LEVEL SECURITY;

--

--
-- Name: extension_data; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.extension_data ENABLE ROW LEVEL SECURITY;

--

--
-- Name: extension_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.extension_messages ENABLE ROW LEVEL SECURITY;

--

--
-- Name: extension_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.extension_requests ENABLE ROW LEVEL SECURITY;

--

--
-- Name: extension_sandbox_data; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.extension_sandbox_data ENABLE ROW LEVEL SECURITY;

--

--
-- Name: extension_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.extension_versions ENABLE ROW LEVEL SECURITY;

--

--
-- Name: fsrs_card_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fsrs_card_state ENABLE ROW LEVEL SECURITY;

--

--
-- Name: fsrs_card_state fsrs_card_state self read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "fsrs_card_state self read" ON public.fsrs_card_state FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--

--
-- Name: governance_audit_trail; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.governance_audit_trail ENABLE ROW LEVEL SECURITY;

--

--
-- Name: graded_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.graded_events ENABLE ROW LEVEL SECURITY;

--

--
-- Name: hyperparameter_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hyperparameter_settings ENABLE ROW LEVEL SECURITY;

--

--
-- Name: hyperparameter_tuning_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hyperparameter_tuning_runs ENABLE ROW LEVEL SECURITY;

--

--
-- Name: concept_standard_map in-school read of mappings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "in-school read of mappings" ON public.concept_standard_map FOR SELECT TO authenticated USING (((school_id IS NULL) OR (school_id = public.get_user_school_id(auth.uid()))));


--

--
-- Name: topic_locks in-school topic lock management; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "in-school topic lock management" ON public.topic_locks TO authenticated USING ((public.is_school_admin_of(auth.uid(), school_id) OR (public.has_role(auth.uid(), 'teacher'::public.app_role) AND (school_id = public.get_user_school_id(auth.uid()))))) WITH CHECK ((public.is_school_admin_of(auth.uid(), school_id) OR (public.has_role(auth.uid(), 'teacher'::public.app_role) AND (school_id = public.get_user_school_id(auth.uid())) AND (teacher_id = auth.uid()))));


--

--
-- Name: invite_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;

--

--
-- Name: invite_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invite_requests ENABLE ROW LEVEL SECURITY;

--

--
-- Name: iq_test_results; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.iq_test_results ENABLE ROW LEVEL SECURITY;

--

--
-- Name: item_parameter_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.item_parameter_history ENABLE ROW LEVEL SECURITY;

--

--
-- Name: knowledge_gaps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.knowledge_gaps ENABLE ROW LEVEL SECURITY;

--

--
-- Name: kt_sequence_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kt_sequence_state ENABLE ROW LEVEL SECURITY;

--

--
-- Name: lct_exam_locks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lct_exam_locks ENABLE ROW LEVEL SECURITY;

--

--
-- Name: lct_exam_schools; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lct_exam_schools ENABLE ROW LEVEL SECURITY;

--

--
-- Name: lct_exam_students; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lct_exam_students ENABLE ROW LEVEL SECURITY;

--

--
-- Name: lct_exams; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lct_exams ENABLE ROW LEVEL SECURITY;

--

--
-- Name: learning_mode_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_mode_sessions ENABLE ROW LEVEL SECURITY;

--

--
-- Name: learning_objectives; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_objectives ENABLE ROW LEVEL SECURITY;

--

--
-- Name: learning_outcomes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_outcomes ENABLE ROW LEVEL SECURITY;

--

--
-- Name: learning_style_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_style_profiles ENABLE ROW LEVEL SECURITY;

--

--
-- Name: lectures; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lectures ENABLE ROW LEVEL SECURITY;

--

--
-- Name: lectures lectures_select_same_school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lectures_select_same_school ON public.lectures FOR SELECT TO authenticated USING (((school_id = public.get_user_school_id(auth.uid())) OR public.is_super_admin_user(auth.uid())));


--

--
-- Name: lectures lectures_write_school_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY lectures_write_school_staff ON public.lectures TO authenticated USING ((public.is_super_admin_user(auth.uid()) OR ((school_id = public.get_user_school_id(auth.uid())) AND (public.is_school_admin_of(auth.uid(), school_id) OR public.is_teacher(auth.uid()))))) WITH CHECK ((public.is_super_admin_user(auth.uid()) OR ((school_id = public.get_user_school_id(auth.uid())) AND (public.is_school_admin_of(auth.uid(), school_id) OR public.is_teacher(auth.uid())))));


--

--
-- Name: lesson_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lesson_events ENABLE ROW LEVEL SECURITY;

--

--
-- Name: lesson_explanations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lesson_explanations ENABLE ROW LEVEL SECURITY;

--

--
-- Name: lesson_objective_bindings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lesson_objective_bindings ENABLE ROW LEVEL SECURITY;

--

--
-- Name: lesson_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lesson_plans ENABLE ROW LEVEL SECURITY;

--

--
-- Name: lesson_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lesson_sessions ENABLE ROW LEVEL SECURITY;

--

--
-- Name: lesson_state_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lesson_state_snapshots ENABLE ROW LEVEL SECURITY;

--

--
-- Name: live_meetings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.live_meetings ENABLE ROW LEVEL SECURITY;

--

--
-- Name: lumina_api_usage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lumina_api_usage ENABLE ROW LEVEL SECURITY;

--

--
-- Name: lumina_cost_ledger; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lumina_cost_ledger ENABLE ROW LEVEL SECURITY;

--

--
-- Name: material_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.material_comments ENABLE ROW LEVEL SECURITY;

--

--
-- Name: material_views; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.material_views ENABLE ROW LEVEL SECURITY;

--

--
-- Name: materials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

--

--
-- Name: mc_curriculum_subjects mc_cs super admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mc_cs super admin write" ON public.mc_curriculum_subjects USING (public.is_super_admin_caller()) WITH CHECK (public.is_super_admin_caller());


--

--
-- Name: mc_curriculum_subjects mc_cs tenant read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mc_cs tenant read" ON public.mc_curriculum_subjects FOR SELECT USING (public.mc_can_govern_tenant(tenant_id));


--

--
-- Name: mc_curriculum_subjects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mc_curriculum_subjects ENABLE ROW LEVEL SECURITY;

--

--
-- Name: mc_curriculum_version_defs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mc_curriculum_version_defs ENABLE ROW LEVEL SECURITY;

--

--
-- Name: mc_curriculum_version_defs mc_cvd super admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mc_cvd super admin write" ON public.mc_curriculum_version_defs USING (public.is_super_admin_caller()) WITH CHECK (public.is_super_admin_caller());


--

--
-- Name: mc_curriculum_version_defs mc_cvd tenant read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mc_cvd tenant read" ON public.mc_curriculum_version_defs FOR SELECT USING (public.mc_can_govern_tenant(tenant_id));


--

--
-- Name: mc_educational_policies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mc_educational_policies ENABLE ROW LEVEL SECURITY;

--

--
-- Name: mc_educational_policies mc_ep super admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mc_ep super admin write" ON public.mc_educational_policies USING (public.is_super_admin_caller()) WITH CHECK (public.is_super_admin_caller());


--

--
-- Name: mc_educational_policies mc_ep tenant read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mc_ep tenant read" ON public.mc_educational_policies FOR SELECT USING (public.mc_can_govern_tenant(tenant_id));


--

--
-- Name: mc_lumina_config mc_lc super admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mc_lc super admin write" ON public.mc_lumina_config USING (public.is_super_admin_caller()) WITH CHECK (public.is_super_admin_caller());


--

--
-- Name: mc_lumina_config mc_lc tenant read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mc_lc tenant read" ON public.mc_lumina_config FOR SELECT USING (public.mc_can_govern_tenant(tenant_id));


--

--
-- Name: mc_lumina_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mc_lumina_config ENABLE ROW LEVEL SECURITY;

--

--
-- Name: mc_regions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mc_regions ENABLE ROW LEVEL SECURITY;

--

--
-- Name: mc_regions mc_regions super admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mc_regions super admin write" ON public.mc_regions USING (public.is_super_admin_caller()) WITH CHECK (public.is_super_admin_caller());


--

--
-- Name: mc_regions mc_regions tenant read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mc_regions tenant read" ON public.mc_regions FOR SELECT USING (public.mc_can_govern_tenant(tenant_id));


--

--
-- Name: mc_school_lifecycle_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mc_school_lifecycle_events ENABLE ROW LEVEL SECURITY;

--

--
-- Name: mc_school_region_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mc_school_region_assignments ENABLE ROW LEVEL SECURITY;

--

--
-- Name: mc_school_lifecycle_events mc_sle insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mc_sle insert" ON public.mc_school_lifecycle_events FOR INSERT WITH CHECK (true);


--

--
-- Name: mc_school_lifecycle_events mc_sle tenant read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mc_sle tenant read" ON public.mc_school_lifecycle_events FOR SELECT USING (public.mc_can_govern_tenant(tenant_id));


--

--
-- Name: mc_school_region_assignments mc_sra super admin write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mc_sra super admin write" ON public.mc_school_region_assignments USING (public.is_super_admin_caller()) WITH CHECK (public.is_super_admin_caller());


--

--
-- Name: mc_school_region_assignments mc_sra tenant read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mc_sra tenant read" ON public.mc_school_region_assignments FOR SELECT USING (public.mc_can_govern_tenant(tenant_id));


--

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--

--
-- Name: mi_daily_rollups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mi_daily_rollups ENABLE ROW LEVEL SECURITY;

--

--
-- Name: mi_educational_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mi_educational_events ENABLE ROW LEVEL SECURITY;

--

--
-- Name: mi_insights; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mi_insights ENABLE ROW LEVEL SECURITY;

--

--
-- Name: mind_map_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mind_map_history ENABLE ROW LEVEL SECURITY;

--

--
-- Name: ministry_access_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ministry_access_codes ENABLE ROW LEVEL SECURITY;

--

--
-- Name: ministry_access_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ministry_access_requests ENABLE ROW LEVEL SECURITY;

--

--
-- Name: ministry_announcements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ministry_announcements ENABLE ROW LEVEL SECURITY;

--

--
-- Name: ministry_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ministry_audit_log ENABLE ROW LEVEL SECURITY;

--

--
-- Name: ministry_capabilities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ministry_capabilities ENABLE ROW LEVEL SECURITY;

--

--
-- Name: ministry_change_appliers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ministry_change_appliers ENABLE ROW LEVEL SECURITY;

--

--
-- Name: ministry_change_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ministry_change_requests ENABLE ROW LEVEL SECURITY;

--

--
-- Name: ministry_ip_bans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ministry_ip_bans ENABLE ROW LEVEL SECURITY;

--

--
-- Name: ministry_role_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ministry_role_assignments ENABLE ROW LEVEL SECURITY;

--

--
-- Name: ministry_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ministry_sessions ENABLE ROW LEVEL SECURITY;

--

--
-- Name: misconception_embeddings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.misconception_embeddings ENABLE ROW LEVEL SECURITY;

--

--
-- Name: model_evaluation_metrics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.model_evaluation_metrics ENABLE ROW LEVEL SECURITY;

--

--
-- Name: model_evaluation_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.model_evaluation_runs ENABLE ROW LEVEL SECURITY;

--

--
-- Name: moderation_actions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.moderation_actions ENABLE ROW LEVEL SECURITY;

--

--
-- Name: moderator_invite_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.moderator_invite_codes ENABLE ROW LEVEL SECURITY;

--

--
-- Name: moderator_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.moderator_requests ENABLE ROW LEVEL SECURITY;

--

--
-- Name: morning_briefings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.morning_briefings ENABLE ROW LEVEL SECURITY;

--

--
-- Name: note_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.note_snapshots ENABLE ROW LEVEL SECURITY;

--

--
-- Name: note_timeline_summaries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.note_timeline_summaries ENABLE ROW LEVEL SECURITY;

--

--
-- Name: notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

--

--
-- Name: learning_objectives objectives follow parent standard; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "objectives follow parent standard" ON public.learning_objectives FOR SELECT TO authenticated, anon USING ((EXISTS ( SELECT 1
   FROM public.curriculum_standards cs
  WHERE ((cs.id = learning_objectives.standard_id) AND ((cs.school_id IS NULL) OR (cs.school_id = public.get_user_school_id(auth.uid())))))));


--

--
-- Name: learning_outcomes outcome read scoping; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "outcome read scoping" ON public.learning_outcomes FOR SELECT TO authenticated USING (((student_id = auth.uid()) OR ((school_id IS NOT NULL) AND public.is_school_admin_of(auth.uid(), school_id)) OR public.can_view_student_mastery(auth.uid(), student_id)));


--

--
-- Name: parent_invite_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.parent_invite_codes ENABLE ROW LEVEL SECURITY;

--

--
-- Name: parent_students; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.parent_students ENABLE ROW LEVEL SECURITY;

--

--
-- Name: confidence_calibration_stats parents read child calibration; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "parents read child calibration" ON public.confidence_calibration_stats FOR SELECT USING ((user_id IN ( SELECT parent_students.student_id
   FROM public.parent_students
  WHERE (parent_students.parent_id = auth.uid()))));


--

--
-- Name: confidence_responses parents read child confidence; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "parents read child confidence" ON public.confidence_responses FOR SELECT USING ((user_id IN ( SELECT parent_students.student_id
   FROM public.parent_students
  WHERE (parent_students.parent_id = auth.uid()))));


--

--
-- Name: learning_mode_sessions parents read child learning sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "parents read child learning sessions" ON public.learning_mode_sessions FOR SELECT USING ((user_id IN ( SELECT parent_students.student_id
   FROM public.parent_students
  WHERE (parent_students.parent_id = auth.uid()))));


--

--
-- Name: concept_mastery parents read child mastery; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "parents read child mastery" ON public.concept_mastery FOR SELECT USING ((user_id IN ( SELECT parent_students.student_id
   FROM public.parent_students
  WHERE (parent_students.parent_id = auth.uid()))));


--

--
-- Name: pilot_assignments pilot assignments visible to admins or student; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pilot assignments visible to admins or student" ON public.pilot_assignments FOR SELECT TO authenticated USING (((student_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.pilot_studies p
  WHERE ((p.id = pilot_assignments.pilot_id) AND ((p.school_id IS NULL) OR public.is_school_admin_of(auth.uid(), p.school_id)))))));


--

--
-- Name: pilot_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pilot_assignments ENABLE ROW LEVEL SECURITY;

--

--
-- Name: pilot_studies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pilot_studies ENABLE ROW LEVEL SECURITY;

--

--
-- Name: podcast_generations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.podcast_generations ENABLE ROW LEVEL SECURITY;

--

--
-- Name: policy_evaluation_results; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.policy_evaluation_results ENABLE ROW LEVEL SECURITY;

--

--
-- Name: policy_evaluation_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.policy_evaluation_runs ENABLE ROW LEVEL SECURITY;

--

--
-- Name: policy_regret_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.policy_regret_log ENABLE ROW LEVEL SECURITY;

--

--
-- Name: population_prior_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.population_prior_runs ENABLE ROW LEVEL SECURITY;

--

--
-- Name: population_priors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.population_priors ENABLE ROW LEVEL SECURITY;

--

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--

--
-- Name: question_bank; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.question_bank ENABLE ROW LEVEL SECURITY;

--

--
-- Name: tenant_feature_flags read own tenant flags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read own tenant flags" ON public.tenant_feature_flags FOR SELECT TO authenticated USING ((public.is_super_admin(auth.uid()) OR (tenant_id = public.get_user_tenant_id(auth.uid()))));


--

--
-- Name: ministry_announcements read own tenant ministry announcements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read own tenant ministry announcements" ON public.ministry_announcements FOR SELECT TO authenticated USING ((public.is_super_admin(auth.uid()) OR ((published = true) AND (tenant_id = public.get_user_tenant_id(auth.uid())))));


--

--
-- Name: recall_schedule; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recall_schedule ENABLE ROW LEVEL SECURITY;

--

--
-- Name: report_cards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.report_cards ENABLE ROW LEVEL SECURITY;

--

--
-- Name: data_export_requests requester reads own exports; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "requester reads own exports" ON public.data_export_requests FOR SELECT TO authenticated USING (((requested_by = auth.uid()) OR ((school_id IS NOT NULL) AND public.is_school_admin_of(auth.uid(), school_id))));


--

--
-- Name: saved_lectures; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.saved_lectures ENABLE ROW LEVEL SECURITY;

--

--
-- Name: concept_standard_map school admins manage mappings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "school admins manage mappings" ON public.concept_standard_map TO authenticated USING (((school_id IS NOT NULL) AND public.is_school_admin_of(auth.uid(), school_id))) WITH CHECK (((school_id IS NOT NULL) AND public.is_school_admin_of(auth.uid(), school_id)));


--

--
-- Name: learning_objectives school admins manage objectives; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "school admins manage objectives" ON public.learning_objectives TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.curriculum_standards cs
  WHERE ((cs.id = learning_objectives.standard_id) AND (cs.school_id IS NOT NULL) AND public.is_school_admin_of(auth.uid(), cs.school_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.curriculum_standards cs
  WHERE ((cs.id = learning_objectives.standard_id) AND (cs.school_id IS NOT NULL) AND public.is_school_admin_of(auth.uid(), cs.school_id)))));


--

--
-- Name: pilot_studies school admins manage pilots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "school admins manage pilots" ON public.pilot_studies TO authenticated USING (((school_id IS NULL) OR public.is_school_admin_of(auth.uid(), school_id))) WITH CHECK (((school_id IS NULL) OR public.is_school_admin_of(auth.uid(), school_id)));


--

--
-- Name: curriculum_standards school admins manage standards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "school admins manage standards" ON public.curriculum_standards TO authenticated USING (((school_id IS NOT NULL) AND public.is_school_admin_of(auth.uid(), school_id))) WITH CHECK (((school_id IS NOT NULL) AND public.is_school_admin_of(auth.uid(), school_id)));


--

--
-- Name: lumina_cost_ledger school admins view school usage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "school admins view school usage" ON public.lumina_cost_ledger FOR SELECT TO authenticated USING (public.is_school_admin_of(auth.uid(), school_id));


--

--
-- Name: morning_briefings school staff read same-school briefings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "school staff read same-school briefings" ON public.morning_briefings FOR SELECT USING (((school_id IS NOT NULL) AND (school_id = public.get_user_school_id(auth.uid())) AND (public.is_teacher(auth.uid()) OR public.is_school_admin_of(auth.uid(), school_id))));


--

--
-- Name: confidence_calibration_stats school staff read same-school calibration; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "school staff read same-school calibration" ON public.confidence_calibration_stats FOR SELECT USING (((school_id IS NOT NULL) AND (school_id = public.get_user_school_id(auth.uid())) AND (public.is_teacher(auth.uid()) OR public.is_school_admin_of(auth.uid(), school_id))));


--

--
-- Name: confidence_responses school staff read same-school confidence; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "school staff read same-school confidence" ON public.confidence_responses FOR SELECT USING (((school_id IS NOT NULL) AND (school_id = public.get_user_school_id(auth.uid())) AND (public.is_teacher(auth.uid()) OR public.is_school_admin_of(auth.uid(), school_id))));


--

--
-- Name: learning_mode_sessions school staff read same-school learning sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "school staff read same-school learning sessions" ON public.learning_mode_sessions FOR SELECT USING (((school_id IS NOT NULL) AND (school_id = public.get_user_school_id(auth.uid())) AND (public.is_teacher(auth.uid()) OR public.is_school_admin_of(auth.uid(), school_id))));


--

--
-- Name: concept_mastery school staff read same-school mastery; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "school staff read same-school mastery" ON public.concept_mastery FOR SELECT USING (((school_id IS NOT NULL) AND (school_id = public.get_user_school_id(auth.uid())) AND (public.is_teacher(auth.uid()) OR public.is_school_admin_of(auth.uid(), school_id))));


--

--
-- Name: cognitive_mirror_snapshots school staff read same-school snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "school staff read same-school snapshots" ON public.cognitive_mirror_snapshots FOR SELECT USING (((school_id IS NOT NULL) AND (school_id = public.get_user_school_id(auth.uid())) AND (public.is_teacher(auth.uid()) OR public.is_school_admin_of(auth.uid(), school_id))));


--

--
-- Name: cognitive_mirror_stats school staff read same-school stats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "school staff read same-school stats" ON public.cognitive_mirror_stats FOR SELECT USING (((school_id IS NOT NULL) AND (school_id = public.get_user_school_id(auth.uid())) AND (public.is_teacher(auth.uid()) OR public.is_school_admin_of(auth.uid(), school_id))));


--

--
-- Name: adaptive_quality_scores school staff view scores in school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "school staff view scores in school" ON public.adaptive_quality_scores FOR SELECT USING (((school_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.school_id = adaptive_quality_scores.school_id) AND (p.user_type = ANY (ARRAY['teacher'::text, 'school_admin'::text])) AND (p.is_active = true))))));


--

--
-- Name: ai_output_signals school staff view signals in school; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "school staff view signals in school" ON public.ai_output_signals FOR SELECT USING (((school_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.school_id = ai_output_signals.school_id) AND (p.user_type = ANY (ARRAY['teacher'::text, 'school_admin'::text])) AND (p.is_active = true))))));


--

--
-- Name: school_admins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.school_admins ENABLE ROW LEVEL SECURITY;

--

--
-- Name: schools; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

--

--
-- Name: misconception_embeddings self read misconceptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "self read misconceptions" ON public.misconception_embeddings FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--

--
-- Name: unified_policy_decisions self read policy decisions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "self read policy decisions" ON public.unified_policy_decisions FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--

--
-- Name: unified_student_state self read unified state; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "self read unified state" ON public.unified_student_state FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--

--
-- Name: unified_student_state service inserts unified state; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "service inserts unified state" ON public.unified_student_state FOR INSERT TO service_role WITH CHECK (true);


--

--
-- Name: misconception_embeddings service writes misconceptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "service writes misconceptions" ON public.misconception_embeddings TO service_role USING (true) WITH CHECK (true);


--

--
-- Name: unified_policy_decisions service writes policy decisions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "service writes policy decisions" ON public.unified_policy_decisions TO service_role USING (true) WITH CHECK (true);


--

--
-- Name: model_evaluation_metrics service_role manages eval metrics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "service_role manages eval metrics" ON public.model_evaluation_metrics TO service_role USING (true) WITH CHECK (true);


--

--
-- Name: model_evaluation_runs service_role manages eval runs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "service_role manages eval runs" ON public.model_evaluation_runs TO service_role USING (true) WITH CHECK (true);


--

--
-- Name: curriculum_standards standards readable in-school or global; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "standards readable in-school or global" ON public.curriculum_standards FOR SELECT TO authenticated, anon USING (((school_id IS NULL) OR (school_id = public.get_user_school_id(auth.uid()))));


--

--
-- Name: lesson_objective_bindings student or in-school read of bindings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "student or in-school read of bindings" ON public.lesson_objective_bindings FOR SELECT TO authenticated USING (((student_id = auth.uid()) OR ((school_id IS NOT NULL) AND public.is_school_admin_of(auth.uid(), school_id)) OR public.can_view_student_mastery(auth.uid(), student_id)));


--

--
-- Name: student_answer_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_answer_history ENABLE ROW LEVEL SECURITY;

--

--
-- Name: student_classes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_classes ENABLE ROW LEVEL SECURITY;

--

--
-- Name: student_goals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_goals ENABLE ROW LEVEL SECURITY;

--

--
-- Name: student_learning_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_learning_profiles ENABLE ROW LEVEL SECURITY;

--

--
-- Name: student_memory; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_memory ENABLE ROW LEVEL SECURITY;

--

--
-- Name: note_snapshots students delete own snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "students delete own snapshots" ON public.note_snapshots FOR DELETE USING ((auth.uid() = user_id));


--

--
-- Name: confidence_responses students insert own confidence; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "students insert own confidence" ON public.confidence_responses FOR INSERT WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: note_snapshots students insert own snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "students insert own snapshots" ON public.note_snapshots FOR INSERT WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: learning_mode_sessions students manage own learning sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "students manage own learning sessions" ON public.learning_mode_sessions USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: concept_mastery students manage own mastery; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "students manage own mastery" ON public.concept_mastery USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: decay_refreshers students manage own refreshers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "students manage own refreshers" ON public.decay_refreshers USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: note_timeline_summaries students manage own timeline summaries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "students manage own timeline summaries" ON public.note_timeline_summaries USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: morning_briefings students read own briefings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "students read own briefings" ON public.morning_briefings FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: confidence_calibration_stats students read own calibration; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "students read own calibration" ON public.confidence_calibration_stats FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: confidence_responses students read own confidence; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "students read own confidence" ON public.confidence_responses FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: teacher_overrides students read own overrides; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "students read own overrides" ON public.teacher_overrides FOR SELECT TO authenticated USING ((student_id = auth.uid()));


--

--
-- Name: recall_schedule students read own recall; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "students read own recall" ON public.recall_schedule FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: assessment_scores students read own scores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "students read own scores" ON public.assessment_scores FOR SELECT TO authenticated USING (((student_id = auth.uid()) OR ((school_id IS NOT NULL) AND public.is_school_admin_of(auth.uid(), school_id)) OR public.can_view_student_mastery(auth.uid(), student_id)));


--

--
-- Name: cognitive_mirror_snapshots students read own snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "students read own snapshots" ON public.cognitive_mirror_snapshots FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: note_snapshots students read own snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "students read own snapshots" ON public.note_snapshots FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: cognitive_mirror_stats students read own stats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "students read own stats" ON public.cognitive_mirror_stats FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: topic_locks students see locks affecting them; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "students see locks affecting them" ON public.topic_locks FOR SELECT TO authenticated USING ((student_id = auth.uid()));


--

--
-- Name: morning_briefings students update own briefings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "students update own briefings" ON public.morning_briefings FOR UPDATE USING ((auth.uid() = user_id));


--

--
-- Name: recall_schedule students update own recall; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "students update own recall" ON public.recall_schedule FOR UPDATE USING ((auth.uid() = user_id));


--

--
-- Name: lumina_cost_ledger students view own usage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "students view own usage" ON public.lumina_cost_ledger FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--

--
-- Name: subjects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

--

--
-- Name: submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

--

--
-- Name: confidence_calibration_stats super admin all calibration; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "super admin all calibration" ON public.confidence_calibration_stats FOR SELECT USING (public.is_super_admin());


--

--
-- Name: confidence_responses super admin all confidence; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "super admin all confidence" ON public.confidence_responses FOR SELECT USING (public.is_super_admin());


--

--
-- Name: learning_mode_sessions super admin all learning sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "super admin all learning sessions" ON public.learning_mode_sessions FOR SELECT USING (public.is_super_admin());


--

--
-- Name: concept_mastery super admin all mastery; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "super admin all mastery" ON public.concept_mastery FOR SELECT USING (public.is_super_admin());


--

--
-- Name: decay_refreshers super admin all refreshers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "super admin all refreshers" ON public.decay_refreshers FOR SELECT USING (public.is_super_admin());


--

--
-- Name: note_snapshots super admin all snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "super admin all snapshots" ON public.note_snapshots FOR SELECT USING (public.is_super_admin());


--

--
-- Name: ministry_announcements super admin authors ministry announcements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "super admin authors ministry announcements" ON public.ministry_announcements TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));


--

--
-- Name: tenant_feature_flags super admin manages flags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "super admin manages flags" ON public.tenant_feature_flags TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));


--

--
-- Name: morning_briefings super admin reads all briefings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "super admin reads all briefings" ON public.morning_briefings FOR SELECT USING (public.is_super_admin_user(auth.uid()));


--

--
-- Name: recall_schedule super admin reads all recall; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "super admin reads all recall" ON public.recall_schedule FOR SELECT USING (public.is_super_admin_user(auth.uid()));


--

--
-- Name: cognitive_mirror_snapshots super admin reads all snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "super admin reads all snapshots" ON public.cognitive_mirror_snapshots FOR SELECT USING (public.is_super_admin_user(auth.uid()));


--

--
-- Name: cognitive_mirror_stats super admin reads all stats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "super admin reads all stats" ON public.cognitive_mirror_stats FOR SELECT USING (public.is_super_admin_user(auth.uid()));


--

--
-- Name: anchor_recalibrations super admin reads anchor recalibrations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "super admin reads anchor recalibrations" ON public.anchor_recalibrations FOR SELECT TO authenticated USING (public.is_super_admin_user(auth.uid()));


--

--
-- Name: adaptive_quality_scores super admin views all quality scores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "super admin views all quality scores" ON public.adaptive_quality_scores FOR SELECT USING (public.is_super_admin_user(auth.uid()));


--

--
-- Name: ai_output_signals super admin views all signals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "super admin views all signals" ON public.ai_output_signals FOR SELECT USING (public.is_super_admin_user(auth.uid()));


--

--
-- Name: symbolic_alignment_matrices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.symbolic_alignment_matrices ENABLE ROW LEVEL SECURITY;

--

--
-- Name: teacher_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.teacher_categories ENABLE ROW LEVEL SECURITY;

--

--
-- Name: teacher_overrides; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.teacher_overrides ENABLE ROW LEVEL SECURITY;

--

--
-- Name: teacher_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.teacher_requests ENABLE ROW LEVEL SECURITY;

--

--
-- Name: teacher_subjects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.teacher_subjects ENABLE ROW LEVEL SECURITY;

--

--
-- Name: teacher_overrides teachers manage own school overrides; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "teachers manage own school overrides" ON public.teacher_overrides TO authenticated USING ((public.is_school_admin_of(auth.uid(), school_id) OR (public.has_role(auth.uid(), 'teacher'::public.app_role) AND (school_id = public.get_user_school_id(auth.uid()))))) WITH CHECK ((public.is_school_admin_of(auth.uid(), school_id) OR (public.has_role(auth.uid(), 'teacher'::public.app_role) AND (school_id = public.get_user_school_id(auth.uid())) AND (teacher_id = auth.uid()))));


--

--
-- Name: assessment_scores teachers/admins record scores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "teachers/admins record scores" ON public.assessment_scores FOR INSERT TO authenticated WITH CHECK ((((school_id IS NOT NULL) AND public.is_school_admin_of(auth.uid(), school_id)) OR (public.has_role(auth.uid(), 'teacher'::public.app_role) AND (school_id = public.get_user_school_id(auth.uid())))));


--

--
-- Name: tenant_feature_flags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant_feature_flags ENABLE ROW LEVEL SECURITY;

--

--
-- Name: tenant_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant_roles ENABLE ROW LEVEL SECURITY;

--

--
-- Name: tenants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

--

--
-- Name: topic_locks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.topic_locks ENABLE ROW LEVEL SECURITY;

--

--
-- Name: trip_reads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trip_reads ENABLE ROW LEVEL SECURITY;

--

--
-- Name: trips; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

--

--
-- Name: unified_objective_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.unified_objective_runs ENABLE ROW LEVEL SECURITY;

--

--
-- Name: unified_policy_decisions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.unified_policy_decisions ENABLE ROW LEVEL SECURITY;

--

--
-- Name: unified_policy_weights; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.unified_policy_weights ENABLE ROW LEVEL SECURITY;

--

--
-- Name: unified_student_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.unified_student_state ENABLE ROW LEVEL SECURITY;

--

--
-- Name: user_activity_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_activity_log ENABLE ROW LEVEL SECURITY;

--

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--

--
-- Name: user_strikes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_strikes ENABLE ROW LEVEL SECURITY;

--

--
-- Name: adaptive_quality_scores users insert own quality scores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users insert own quality scores" ON public.adaptive_quality_scores FOR INSERT WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: ai_output_signals users insert own signals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users insert own signals" ON public.ai_output_signals FOR INSERT WITH CHECK ((auth.uid() = user_id));


--

--
-- Name: adaptive_quality_scores users view own quality scores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users view own quality scores" ON public.adaptive_quality_scores FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: ai_output_signals users view own signals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users view own signals" ON public.ai_output_signals FOR SELECT USING ((auth.uid() = user_id));


--

--
-- Name: weekly_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.weekly_plans ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

-- Canonical Lumina schema source: private storage and explicit realtime publication

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('course-materials', 'course-materials', false, 52428800, ARRAY[
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg', 'image/png', 'image/gif'
  ]),
  ('report-cards', 'report-cards', false, 10485760, ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]),
  ('generated-diagrams', 'generated-diagrams', false, 10485760, ARRAY['image/png', 'image/jpeg', 'image/webp']),
  ('chat-attachments', 'chat-attachments', false, 10485760, NULL)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Course materials school read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'course-materials'
  AND (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.school_id::text = (storage.foldername(name))[1]
        AND p.status = 'approved' AND p.is_active
    )
  )
);

CREATE POLICY "Course materials scoped upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'course-materials'
  AND auth.uid()::text = (storage.foldername(name))[2]
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.school_id::text = (storage.foldername(name))[1]
      AND p.status = 'approved' AND p.is_active
      AND (p.user_type = 'teacher' OR public.is_school_admin_of(auth.uid(), p.school_id))
  )
);

CREATE POLICY "Course materials scoped mutation"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'course-materials'
  AND (
    auth.uid()::text = (storage.foldername(name))[2]
    OR ((storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
      AND public.is_school_admin_of(auth.uid(), ((storage.foldername(name))[1])::uuid))
    OR public.is_super_admin()
  )
)
WITH CHECK (
  bucket_id = 'course-materials'
  AND auth.uid()::text = (storage.foldername(name))[2]
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.school_id::text = (storage.foldername(name))[1]
      AND p.status = 'approved' AND p.is_active
      AND (p.user_type = 'teacher' OR public.is_school_admin_of(auth.uid(), p.school_id))
  )
);

CREATE POLICY "Course materials scoped delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'course-materials'
  AND (
    auth.uid()::text = (storage.foldername(name))[2]
    OR ((storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
      AND public.is_school_admin_of(auth.uid(), ((storage.foldername(name))[1])::uuid))
    OR public.is_super_admin()
  )
);

CREATE POLICY "Report cards school upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'report-cards'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  AND public.is_school_admin_of(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Report cards school mutation"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'report-cards'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  AND (public.is_school_admin_of(auth.uid(), ((storage.foldername(name))[1])::uuid) OR public.is_super_admin())
)
WITH CHECK (
  bucket_id = 'report-cards'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  AND (public.is_school_admin_of(auth.uid(), ((storage.foldername(name))[1])::uuid) OR public.is_super_admin())
);

CREATE POLICY "Report cards school delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'report-cards'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  AND (public.is_school_admin_of(auth.uid(), ((storage.foldername(name))[1])::uuid) OR public.is_super_admin())
);

CREATE POLICY "Report cards scoped read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'report-cards'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
  AND (
    public.is_school_admin_of(auth.uid(), ((storage.foldername(name))[1])::uuid)
    OR public.is_super_admin()
    OR auth.uid()::text = (storage.foldername(name))[2]
    OR ((storage.foldername(name))[2] ~* '^[0-9a-f-]{36}$'
      AND public.is_parent_of(auth.uid(), ((storage.foldername(name))[2])::uuid))
  )
);

CREATE POLICY "Chat attachments owner upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'chat-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Chat attachments owner read"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'chat-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Chat attachments owner delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'chat-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

-- generated-diagrams intentionally has no browser policy. The authenticated,
-- bounded generation endpoint returns short-lived signed URLs.

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'announcements', 'submissions', 'invite_requests', 'chat_messages',
    'ministry_access_requests', 'teacher_categories', 'live_meetings'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = table_name
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    END IF;
  END LOOP;
END;
$$;

-- Canonical Lumina schema source: closed-by-default grants and explicit RPC allowlist

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON TYPE public.app_role, public.platform_role TO authenticated, service_role;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- Browser table operations remain subject to RLS. Platform authority, bootstrap,
-- and the append-only audit ledger are deliberately excluded.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
REVOKE ALL ON public.platform_bootstrap_state FROM authenticated;
REVOKE ALL ON public.platform_role_assignments FROM authenticated;
REVOKE ALL ON public.platform_audit_log FROM authenticated;
REVOKE SELECT, INSERT, UPDATE ON public.schools FROM authenticated;
GRANT SELECT (
  id, name, code, address, created_at, updated_at, is_test_data, status,
  code_used, code_used_by, code_used_at, subjects_sync_enabled, tenant_id,
  governance_status
) ON public.schools TO authenticated;
GRANT UPDATE (
  name, code, address, updated_at, status, subjects_sync_enabled, governance_status
) ON public.schools TO authenticated;

DO $$
DECLARE
  function_name text;
  function_oid oid;
  authenticated_allowlist constant text[] := ARRAY[
    'activate_school', 'activate_tenant', 'approve_invite_request', 'approve_school_profile',
    'assign_ministry_role', 'attach_bandit_reward', 'attach_ensemble_outcome',
    'can_view_student_mastery', 'check_and_increment_cost', 'check_lct_lock',
    'check_ministry_ip_ban', 'check_ministry_session', 'create_school_with_code',
    'delete_school_cascade', 'deny_invite_request', 'ext_append_message',
    'ext_approve_request', 'ext_create_conversation', 'ext_list_active_for_me',
    'ext_list_conversations', 'ext_list_pending_requests', 'ext_load_audit_chat',
    'ext_load_conversation', 'ext_push_forward', 'ext_reject_request', 'ext_save_blueprint',
    'ext_tenant_from_session', 'generate_ministry_invite_code',
    'generate_moderator_invite_code', 'get_active_tenants', 'get_authority_context',
    'get_cross_tenant_observatory', 'get_due_reviews', 'get_fsrs_due_cards',
    'get_ministry_dashboard_data', 'get_tenant_config', 'get_weakest_topics',
    'grant_platform_role', 'has_role', 'is_parent_of', 'is_school_admin',
    'is_school_admin_of', 'is_super_admin', 'is_super_admin_caller',
    'is_super_admin_user', 'is_teacher', 'link_moderator_after_signup',
    'link_profile_after_signup', 'list_change_requests', 'list_feature_flags',
    'list_mc_curriculum_subjects', 'list_mc_curriculum_versions',
    'list_mc_feature_flags', 'list_mc_lumina_config', 'list_mc_notices',
    'list_mc_policies', 'list_mc_regions', 'list_mc_schools', 'list_ministry_audit',
    'list_ministry_role_assignments', 'list_ministry_sessions', 'mc_can_govern_tenant',
    'mi_list_insights', 'mi_national_overview', 'mi_regional_breakdown',
    'mi_run_daily_aggregation', 'mi_school_snapshot', 'provision_tenant',
    'publish_change_request', 'record_review_delivered', 'reject_school_profile',
    'resolve_ministry_request', 'review_change_request', 'revoke_ministry_role',
    'revoke_platform_role', 'rotate_teacher_category_code', 'set_feature_flag',
    'signup_as_moderator', 'signup_as_parent', 'signup_with_invite_code',
    'submit_change_request', 'suspend_tenant', 'update_concept_mastery',
    'update_tenant_defaults', 'withdraw_change_request'
  ];
BEGIN
  FOREACH function_name IN ARRAY authenticated_allowlist LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = function_name
    ) THEN
      RAISE EXCEPTION 'Authenticated RPC allowlist references missing function: %', function_name;
    END IF;
    FOR function_oid IN
      SELECT p.oid FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = function_name
    LOOP
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', function_oid::regprocedure);
    END LOOP;
  END LOOP;
END;
$$;

-- Only these pre-authentication discovery/onboarding contracts are callable by anon.
DO $$
DECLARE
  function_name text;
  function_oid oid;
BEGIN
  FOREACH function_name IN ARRAY ARRAY[
    'get_active_tenants', 'get_tenant_config', 'check_ministry_ip_ban',
    'signup_as_moderator', 'signup_as_parent', 'signup_with_invite_code'
  ] LOOP
    FOR function_oid IN
      SELECT p.oid FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = function_name
    LOOP
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', function_oid::regprocedure);
    END LOOP;
  END LOOP;
END;
$$;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

SET check_function_bodies = true;

COMMIT;
