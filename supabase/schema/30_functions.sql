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
-- Name: get_cross_tenant_observatory(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_cross_tenant_observatory() RETURNS SETOF public.tenant_analytics_view
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM public.tenant_analytics_view ORDER BY country_name;
END;$$;


--

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
