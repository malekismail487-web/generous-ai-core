
-- ============================================================
-- MC1 + MC2: Ministry Control Center — Permissions, Draft & Publish, Audit
-- ============================================================

-- Ministry role enum
DO $$ BEGIN
  CREATE TYPE public.ministry_role AS ENUM (
    'minister', 'deputy_minister', 'curriculum_officer',
    'regional_supervisor', 'ministry_admin', 'viewer'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Change request status enum
DO $$ BEGIN
  CREATE TYPE public.ministry_change_status AS ENUM (
    'draft', 'in_review', 'approved', 'published', 'rejected', 'withdrawn'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------
-- 1. Role assignments (per tenant)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ministry_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.ministry_role NOT NULL,
  assigned_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, role)
);
CREATE INDEX IF NOT EXISTS idx_mra_user ON public.ministry_role_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_mra_tenant ON public.ministry_role_assignments(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ministry_role_assignments TO authenticated;
GRANT ALL ON public.ministry_role_assignments TO service_role;
ALTER TABLE public.ministry_role_assignments ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 2. Capability matrix (role -> capability key)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ministry_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role public.ministry_role NOT NULL,
  capability text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, capability)
);
GRANT SELECT ON public.ministry_capabilities TO authenticated, anon;
GRANT ALL ON public.ministry_capabilities TO service_role;
ALTER TABLE public.ministry_capabilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Capabilities readable by all" ON public.ministry_capabilities FOR SELECT USING (true);

-- Seed capability matrix
INSERT INTO public.ministry_capabilities (role, capability) VALUES
  -- Minister: everything
  ('minister', 'curriculum.draft'),
  ('minister', 'curriculum.review'),
  ('minister', 'curriculum.publish'),
  ('minister', 'policy.draft'),
  ('minister', 'policy.review'),
  ('minister', 'policy.publish'),
  ('minister', 'school.manage'),
  ('minister', 'school.suspend'),
  ('minister', 'user.govern'),
  ('minister', 'region.manage'),
  ('minister', 'lumina.configure'),
  ('minister', 'feature.manage'),
  ('minister', 'communication.publish'),
  ('minister', 'permissions.assign'),
  ('minister', 'audit.read'),
  ('minister', 'change_request.publish'),
  ('minister', 'change_request.review'),
  ('minister', 'change_request.draft'),
  -- Deputy Minister: everything except assigning permissions
  ('deputy_minister', 'curriculum.draft'),
  ('deputy_minister', 'curriculum.review'),
  ('deputy_minister', 'curriculum.publish'),
  ('deputy_minister', 'policy.draft'),
  ('deputy_minister', 'policy.review'),
  ('deputy_minister', 'policy.publish'),
  ('deputy_minister', 'school.manage'),
  ('deputy_minister', 'school.suspend'),
  ('deputy_minister', 'user.govern'),
  ('deputy_minister', 'region.manage'),
  ('deputy_minister', 'lumina.configure'),
  ('deputy_minister', 'feature.manage'),
  ('deputy_minister', 'communication.publish'),
  ('deputy_minister', 'audit.read'),
  ('deputy_minister', 'change_request.publish'),
  ('deputy_minister', 'change_request.review'),
  ('deputy_minister', 'change_request.draft'),
  -- Curriculum Officer: curriculum domain, draft/review only
  ('curriculum_officer', 'curriculum.draft'),
  ('curriculum_officer', 'curriculum.review'),
  ('curriculum_officer', 'change_request.draft'),
  ('curriculum_officer', 'change_request.review'),
  ('curriculum_officer', 'audit.read'),
  -- Regional Supervisor: school + region, draft only
  ('regional_supervisor', 'school.manage'),
  ('regional_supervisor', 'region.manage'),
  ('regional_supervisor', 'change_request.draft'),
  ('regional_supervisor', 'audit.read'),
  -- Ministry Admin: user governance + communication drafts + audit
  ('ministry_admin', 'user.govern'),
  ('ministry_admin', 'communication.publish'),
  ('ministry_admin', 'change_request.draft'),
  ('ministry_admin', 'audit.read'),
  -- Viewer: audit read only
  ('viewer', 'audit.read')
ON CONFLICT (role, capability) DO NOTHING;

-- ------------------------------------------------------------
-- 3. Change request pipeline (Draft & Publish)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ministry_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid,
  title text NOT NULL,
  summary text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  previous_snapshot jsonb,
  status public.ministry_change_status NOT NULL DEFAULT 'draft',
  author_id uuid,
  author_label text,
  reviewer_id uuid,
  reviewer_label text,
  publisher_id uuid,
  publisher_label text,
  review_notes text,
  reject_reason text,
  submitted_at timestamptz,
  approved_at timestamptz,
  published_at timestamptz,
  rejected_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mcr_tenant_status ON public.ministry_change_requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_mcr_entity ON public.ministry_change_requests(entity_type, entity_id);

GRANT SELECT, INSERT, UPDATE ON public.ministry_change_requests TO authenticated;
GRANT ALL ON public.ministry_change_requests TO service_role;
ALTER TABLE public.ministry_change_requests ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 4. Appliers registry
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ministry_change_appliers (
  entity_type text PRIMARY KEY,
  applier_function text NOT NULL,
  description text,
  registered_by_phase text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ministry_change_appliers TO authenticated;
GRANT ALL ON public.ministry_change_appliers TO service_role;
ALTER TABLE public.ministry_change_appliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Appliers readable by authenticated" ON public.ministry_change_appliers FOR SELECT USING (true);

INSERT INTO public.ministry_change_appliers (entity_type, applier_function, description, registered_by_phase)
VALUES ('mc.test', 'apply_test_change', 'No-op applier used to verify the Draft & Publish pipeline end-to-end before real entity types are registered.', 'MC2')
ON CONFLICT (entity_type) DO NOTHING;

-- ------------------------------------------------------------
-- 5. Audit log (append-only)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ministry_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  actor_id uuid,
  actor_label text NOT NULL,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_tenant_time ON public.ministry_audit_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON public.ministry_audit_log(entity_type, entity_id);

GRANT SELECT, INSERT ON public.ministry_audit_log TO authenticated;
GRANT ALL ON public.ministry_audit_log TO service_role;
ALTER TABLE public.ministry_audit_log ENABLE ROW LEVEL SECURITY;

-- Deletion / update are forbidden — enforced by lack of policies + revoke
REVOKE UPDATE, DELETE ON public.ministry_audit_log FROM authenticated, anon, public;

-- ------------------------------------------------------------
-- 6. Helper: is caller a super admin (auth-based)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_super_admin_caller()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(EXISTS(
    SELECT 1 FROM public.hardcoded_admins
    WHERE email = COALESCE((auth.jwt() ->> 'email')::text, '')
  ), false)
$$;

-- ------------------------------------------------------------
-- 7. Helper: does a ministry session grant tenant access
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ministry_session_tenant(p_session_token text)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
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

-- ------------------------------------------------------------
-- 8. Capability check
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_ministry_capability(
  p_user_id uuid,
  p_tenant_id uuid,
  p_capability text,
  p_session_token text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
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

GRANT EXECUTE ON FUNCTION public.has_ministry_capability(uuid, uuid, text, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.ministry_session_tenant(text) TO authenticated, anon;

-- ------------------------------------------------------------
-- 9. RLS policies
-- ------------------------------------------------------------

-- Role assignments: users see their own; super admin sees all
CREATE POLICY "MRA self read" ON public.ministry_role_assignments
  FOR SELECT USING (user_id = auth.uid() OR public.is_super_admin_caller());
CREATE POLICY "MRA super admin write" ON public.ministry_role_assignments
  FOR ALL USING (public.is_super_admin_caller()) WITH CHECK (public.is_super_admin_caller());

-- Change requests: super admin or user with role in same tenant
CREATE POLICY "MCR super admin all" ON public.ministry_change_requests
  FOR ALL USING (public.is_super_admin_caller()) WITH CHECK (public.is_super_admin_caller());
CREATE POLICY "MCR tenant members read" ON public.ministry_change_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.ministry_role_assignments mra
      WHERE mra.user_id = auth.uid() AND mra.tenant_id = ministry_change_requests.tenant_id
    )
  );

-- Audit log: super admin sees everything; role holders see their tenant
CREATE POLICY "Audit super admin read" ON public.ministry_audit_log
  FOR SELECT USING (public.is_super_admin_caller());
CREATE POLICY "Audit tenant read" ON public.ministry_audit_log
  FOR SELECT USING (
    tenant_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.ministry_role_assignments mra
      WHERE mra.user_id = auth.uid() AND mra.tenant_id = ministry_audit_log.tenant_id
    )
  );
CREATE POLICY "Audit insert self" ON public.ministry_audit_log
  FOR INSERT WITH CHECK (true);

-- ------------------------------------------------------------
-- 10. updated_at triggers
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mc_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_mra_touch ON public.ministry_role_assignments;
CREATE TRIGGER trg_mra_touch BEFORE UPDATE ON public.ministry_role_assignments
FOR EACH ROW EXECUTE FUNCTION public.mc_touch_updated_at();

DROP TRIGGER IF EXISTS trg_mcr_touch ON public.ministry_change_requests;
CREATE TRIGGER trg_mcr_touch BEFORE UPDATE ON public.ministry_change_requests
FOR EACH ROW EXECUTE FUNCTION public.mc_touch_updated_at();

-- ------------------------------------------------------------
-- 11. Audit helper
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ministry_audit(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_actor_label text,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_before jsonb,
  p_after jsonb,
  p_metadata jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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

-- ------------------------------------------------------------
-- 12. Change request RPCs
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submit_change_request(
  p_tenant_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_title text,
  p_summary text,
  p_payload jsonb,
  p_session_token text DEFAULT NULL,
  p_author_label text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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

CREATE OR REPLACE FUNCTION public.review_change_request(
  p_request_id uuid,
  p_decision text,           -- 'approve' | 'reject'
  p_notes text DEFAULT NULL,
  p_session_token text DEFAULT NULL,
  p_reviewer_label text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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

CREATE OR REPLACE FUNCTION public.withdraw_change_request(
  p_request_id uuid,
  p_session_token text DEFAULT NULL,
  p_actor_label text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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

-- No-op applier for MC2 verification
CREATE OR REPLACE FUNCTION public.apply_test_change(
  p_request_id uuid, p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN jsonb_build_object('applied', true, 'entity_type', 'mc.test',
    'echo', p_payload, 'at', now());
END; $$;

CREATE OR REPLACE FUNCTION public.publish_change_request(
  p_request_id uuid,
  p_session_token text DEFAULT NULL,
  p_publisher_label text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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
END; $$;

CREATE OR REPLACE FUNCTION public.list_change_requests(
  p_tenant_id uuid DEFAULT NULL,
  p_status public.ministry_change_status DEFAULT NULL,
  p_session_token text DEFAULT NULL,
  p_limit integer DEFAULT 100
) RETURNS SETOF public.ministry_change_requests
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
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

CREATE OR REPLACE FUNCTION public.list_ministry_audit(
  p_tenant_id uuid DEFAULT NULL,
  p_session_token text DEFAULT NULL,
  p_limit integer DEFAULT 200
) RETURNS SETOF public.ministry_audit_log
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
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

CREATE OR REPLACE FUNCTION public.assign_ministry_role(
  p_tenant_id uuid,
  p_user_id uuid,
  p_role public.ministry_role,
  p_session_token text DEFAULT NULL,
  p_actor_label text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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

CREATE OR REPLACE FUNCTION public.revoke_ministry_role(
  p_assignment_id uuid,
  p_session_token text DEFAULT NULL,
  p_actor_label text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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

CREATE OR REPLACE FUNCTION public.list_ministry_role_assignments(
  p_tenant_id uuid DEFAULT NULL,
  p_session_token text DEFAULT NULL
) RETURNS SETOF public.ministry_role_assignments
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
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

GRANT EXECUTE ON FUNCTION public.submit_change_request(uuid,text,uuid,text,text,jsonb,text,text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.review_change_request(uuid,text,text,text,text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.publish_change_request(uuid,text,text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_change_request(uuid,text,text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.list_change_requests(uuid,public.ministry_change_status,text,integer) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.list_ministry_audit(uuid,text,integer) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.assign_ministry_role(uuid,uuid,public.ministry_role,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_ministry_role(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_ministry_role_assignments(uuid,text) TO authenticated, anon;
