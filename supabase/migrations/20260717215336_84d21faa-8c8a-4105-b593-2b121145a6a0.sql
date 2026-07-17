
-- =============================================================================
-- Ministry Extension System — EX1 Foundation
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE public.extension_blueprint_status AS ENUM (
    'draft', 'preview', 'pushed', 'approved', 'rejected', 'deployed', 'rolled_back'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.extension_request_status AS ENUM (
    'in_review', 'approved', 'rejected', 'withdrawn'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Helper: resolve tenant from a ministry session token
CREATE OR REPLACE FUNCTION public.ext_tenant_from_session(p_session_token text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tenant_id FROM public.ministry_sessions
  WHERE session_token = p_session_token AND is_active = true AND expires_at > now()
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.ext_tenant_from_session(text) TO anon, authenticated;

-- ------------------------- Tables -----------------------------------------

CREATE TABLE IF NOT EXISTS public.extension_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Untitled workspace',
  created_by_session text,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.extension_conversations TO anon, authenticated;
GRANT ALL ON public.extension_conversations TO service_role;
ALTER TABLE public.extension_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ext_conv super admin read"
  ON public.extension_conversations FOR SELECT
  USING (public.is_super_admin_caller());

CREATE TABLE IF NOT EXISTS public.extension_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.extension_conversations(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','system')),
  parts jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ext_msgs_conv ON public.extension_messages(conversation_id, created_at);
GRANT SELECT ON public.extension_messages TO anon, authenticated;
GRANT ALL ON public.extension_messages TO service_role;
ALTER TABLE public.extension_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ext_msg super admin read"
  ON public.extension_messages FOR SELECT
  USING (public.is_super_admin_caller());

CREATE TABLE IF NOT EXISTS public.extension_blueprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.extension_conversations(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  version int NOT NULL DEFAULT 1,
  name text NOT NULL,
  summary text,
  manifest jsonb NOT NULL,
  requested_capabilities text[] NOT NULL DEFAULT '{}',
  status public.extension_blueprint_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ext_bp_conv ON public.extension_blueprints(conversation_id, version);
CREATE INDEX IF NOT EXISTS idx_ext_bp_tenant ON public.extension_blueprints(tenant_id, status);
GRANT SELECT ON public.extension_blueprints TO anon, authenticated;
GRANT ALL ON public.extension_blueprints TO service_role;
ALTER TABLE public.extension_blueprints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ext_bp super admin read"
  ON public.extension_blueprints FOR SELECT
  USING (public.is_super_admin_caller());

CREATE TABLE IF NOT EXISTS public.extension_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id uuid NOT NULL REFERENCES public.extension_blueprints(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  submitted_by_session text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  status public.extension_request_status NOT NULL DEFAULT 'in_review',
  reviewer_user_id uuid REFERENCES auth.users(id),
  decision_notes text,
  decided_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_ext_req_status ON public.extension_requests(status, submitted_at DESC);
GRANT SELECT ON public.extension_requests TO anon, authenticated;
GRANT ALL ON public.extension_requests TO service_role;
ALTER TABLE public.extension_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ext_req super admin read"
  ON public.extension_requests FOR SELECT
  USING (public.is_super_admin_caller());

CREATE TABLE IF NOT EXISTS public.extension_audit_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.extension_requests(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','system')),
  parts jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ext_audit_req ON public.extension_audit_chats(request_id, created_at);
GRANT SELECT ON public.extension_audit_chats TO authenticated;
GRANT ALL ON public.extension_audit_chats TO service_role;
ALTER TABLE public.extension_audit_chats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ext_audit super admin read"
  ON public.extension_audit_chats FOR SELECT
  USING (public.is_super_admin_caller());

CREATE TABLE IF NOT EXISTS public.extension_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id uuid NOT NULL REFERENCES public.extension_blueprints(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  version int NOT NULL,
  manifest jsonb NOT NULL,
  signature text NOT NULL,
  deployed_by_user_id uuid REFERENCES auth.users(id),
  deployed_at timestamptz NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true,
  rolled_back_at timestamptz,
  rolled_back_by uuid REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS idx_ext_ver_active ON public.extension_versions(tenant_id, active);
GRANT SELECT ON public.extension_versions TO anon, authenticated;
GRANT ALL ON public.extension_versions TO service_role;
ALTER TABLE public.extension_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ext_ver active read for tenant"
  ON public.extension_versions FOR SELECT
  USING (
    active = true AND (
      public.is_super_admin_caller()
      OR tenant_id IN (
        SELECT s.tenant_id FROM public.schools s
        JOIN public.profiles p ON p.school_id = s.id
        WHERE p.id = auth.uid()
      )
    )
  );

CREATE TABLE IF NOT EXISTS public.extension_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.extension_versions(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  table_key text NOT NULL,
  owner_user_id uuid REFERENCES auth.users(id),
  row jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ext_data_lookup ON public.extension_data(version_id, table_key);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.extension_data TO authenticated;
GRANT ALL ON public.extension_data TO service_role;
ALTER TABLE public.extension_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ext_data tenant read"
  ON public.extension_data FOR SELECT TO authenticated
  USING (
    public.is_super_admin_caller()
    OR tenant_id IN (
      SELECT s.tenant_id FROM public.schools s
      JOIN public.profiles p ON p.school_id = s.id
      WHERE p.id = auth.uid()
    )
  );
CREATE POLICY "ext_data tenant insert"
  ON public.extension_data FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT s.tenant_id FROM public.schools s
      JOIN public.profiles p ON p.school_id = s.id
      WHERE p.id = auth.uid()
    )
    AND (owner_user_id IS NULL OR owner_user_id = auth.uid())
  );
CREATE POLICY "ext_data owner update"
  ON public.extension_data FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());
CREATE POLICY "ext_data owner delete"
  ON public.extension_data FOR DELETE TO authenticated
  USING (owner_user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.extension_sandbox_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id uuid NOT NULL REFERENCES public.extension_blueprints(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  table_key text NOT NULL,
  row jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ext_sandbox ON public.extension_sandbox_data(blueprint_id, table_key);
GRANT SELECT ON public.extension_sandbox_data TO anon, authenticated;
GRANT ALL ON public.extension_sandbox_data TO service_role;
ALTER TABLE public.extension_sandbox_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ext_sandbox super admin read"
  ON public.extension_sandbox_data FOR SELECT
  USING (public.is_super_admin_caller());

-- ------------------------- Ministry RPCs -----------------------------------

CREATE OR REPLACE FUNCTION public.ext_create_conversation(
  p_session_token text, p_title text DEFAULT 'Untitled workspace'
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid; v_id uuid;
BEGIN
  v_tenant := public.ext_tenant_from_session(p_session_token);
  IF v_tenant IS NULL THEN RETURN json_build_object('success', false, 'error', 'invalid_session'); END IF;
  INSERT INTO public.extension_conversations (tenant_id, title, created_by_session)
  VALUES (v_tenant, COALESCE(NULLIF(trim(p_title),''), 'Untitled workspace'), p_session_token)
  RETURNING id INTO v_id;
  RETURN json_build_object('success', true, 'id', v_id);
END $$;
GRANT EXECUTE ON FUNCTION public.ext_create_conversation(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.ext_list_conversations(p_session_token text)
RETURNS TABLE (
  id uuid, title text, archived boolean, created_at timestamptz, updated_at timestamptz,
  message_count bigint, latest_blueprint_status public.extension_blueprint_status
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
GRANT EXECUTE ON FUNCTION public.ext_list_conversations(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.ext_load_conversation(
  p_session_token text, p_conversation_id uuid
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
GRANT EXECUTE ON FUNCTION public.ext_load_conversation(text, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.ext_append_message(
  p_session_token text, p_conversation_id uuid, p_role text, p_parts jsonb
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
GRANT EXECUTE ON FUNCTION public.ext_append_message(text, uuid, text, jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.ext_save_blueprint(
  p_session_token text, p_conversation_id uuid, p_name text,
  p_summary text, p_manifest jsonb, p_capabilities text[]
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
GRANT EXECUTE ON FUNCTION public.ext_save_blueprint(text, uuid, text, text, jsonb, text[]) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.ext_push_forward(
  p_session_token text, p_blueprint_id uuid
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
GRANT EXECUTE ON FUNCTION public.ext_push_forward(text, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.ext_withdraw_request(
  p_session_token text, p_request_id uuid
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
GRANT EXECUTE ON FUNCTION public.ext_withdraw_request(text, uuid) TO anon, authenticated;

-- ------------------------- Super Admin RPCs --------------------------------

CREATE OR REPLACE FUNCTION public.ext_list_pending_requests()
RETURNS TABLE (
  request_id uuid, submitted_at timestamptz, tenant_id uuid, tenant_name text,
  blueprint_id uuid, blueprint_name text, blueprint_summary text, blueprint_version int,
  requested_capabilities text[], manifest jsonb, status public.extension_request_status
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
GRANT EXECUTE ON FUNCTION public.ext_list_pending_requests() TO authenticated;

CREATE OR REPLACE FUNCTION public.ext_approve_request(
  p_request_id uuid, p_notes text DEFAULT NULL
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
GRANT EXECUTE ON FUNCTION public.ext_approve_request(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.ext_reject_request(p_request_id uuid, p_notes text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
GRANT EXECUTE ON FUNCTION public.ext_reject_request(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.ext_rollback_version(p_version_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_super_admin_caller() THEN RAISE EXCEPTION 'not authorized'; END IF;
  UPDATE public.extension_versions
    SET active = false, rolled_back_at = now(), rolled_back_by = auth.uid()
    WHERE id = p_version_id;
  RETURN json_build_object('success', true);
END $$;
GRANT EXECUTE ON FUNCTION public.ext_rollback_version(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.ext_append_audit_message(
  p_request_id uuid, p_role text, p_parts jsonb
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
GRANT EXECUTE ON FUNCTION public.ext_append_audit_message(uuid, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.ext_load_audit_chat(p_request_id uuid)
RETURNS TABLE (id uuid, role text, parts jsonb, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_super_admin_caller() THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY SELECT c.id, c.role, c.parts, c.created_at
    FROM public.extension_audit_chats c
    WHERE c.request_id = p_request_id ORDER BY c.created_at;
END $$;
GRANT EXECUTE ON FUNCTION public.ext_load_audit_chat(uuid) TO authenticated;

-- ------------------------- Public: active extensions for me ---------------

CREATE OR REPLACE FUNCTION public.ext_list_active_for_me()
RETURNS TABLE (version_id uuid, name text, version int, manifest jsonb, deployed_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
GRANT EXECUTE ON FUNCTION public.ext_list_active_for_me() TO authenticated;
