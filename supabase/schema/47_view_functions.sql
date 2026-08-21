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
