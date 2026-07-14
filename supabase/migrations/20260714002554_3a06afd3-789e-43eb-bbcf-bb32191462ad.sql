
CREATE TABLE IF NOT EXISTS public.tenant_feature_flags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  flag_key    text NOT NULL,
  enabled     boolean NOT NULL DEFAULT false,
  config      jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, flag_key)
);
GRANT SELECT ON public.tenant_feature_flags TO authenticated;
GRANT ALL    ON public.tenant_feature_flags TO service_role;
ALTER TABLE public.tenant_feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own tenant flags" ON public.tenant_feature_flags
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "super admin manages flags" ON public.tenant_feature_flags
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_tenant_feature_flags_updated
  BEFORE UPDATE ON public.tenant_feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_tenant_feature_flags_tenant
  ON public.tenant_feature_flags(tenant_id);

CREATE OR REPLACE FUNCTION public.is_feature_enabled(p_tenant_id uuid, p_flag_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT enabled FROM public.tenant_feature_flags
      WHERE tenant_id = p_tenant_id AND flag_key = p_flag_key LIMIT 1),
    false);
$$;
GRANT EXECUTE ON FUNCTION public.is_feature_enabled(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_feature_flags(p_tenant_id uuid DEFAULT NULL)
RETURNS SETOF public.tenant_feature_flags
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
GRANT EXECUTE ON FUNCTION public.list_feature_flags(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_feature_flag(
  p_tenant_id uuid, p_flag_key text, p_enabled boolean,
  p_config jsonb DEFAULT '{}'::jsonb, p_description text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
GRANT EXECUTE ON FUNCTION public.set_feature_flag(uuid, text, boolean, jsonb, text) TO authenticated;

INSERT INTO public.tenant_feature_flags (tenant_id, flag_key, enabled, description)
SELECT t.id, k.flag_key, true, k.description FROM public.tenants t
  CROSS JOIN (VALUES
    ('lct_exams','National LCT standardised exam suite.'),
    ('ai_podcasts','AI-generated podcast lectures.'),
    ('mind_maps','Interactive mind-map generation.'),
    ('parent_portal','Parent accounts and child monitoring.'),
    ('moderation_console','Global moderator queue and actions.'),
    ('lumina_live','Live Lumina classroom sessions.'),
    ('study_buddy','Study buddy AI chat.'),
    ('cognitive_mirror','Cognitive Mirror reflection surface.')
  ) AS k(flag_key, description)
 WHERE t.slug = 'sa'
ON CONFLICT (tenant_id, flag_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.ministry_announcements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title        text NOT NULL,
  body         text NOT NULL,
  severity     text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  published    boolean NOT NULL DEFAULT true,
  published_at timestamptz NOT NULL DEFAULT now(),
  author_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ministry_announcements TO authenticated;
GRANT ALL ON public.ministry_announcements TO service_role;
ALTER TABLE public.ministry_announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own tenant ministry announcements" ON public.ministry_announcements
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR (published = true AND tenant_id = public.get_user_tenant_id(auth.uid())));

CREATE POLICY "super admin authors ministry announcements" ON public.ministry_announcements
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_ministry_announcements_updated
  BEFORE UPDATE ON public.ministry_announcements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_ministry_announcements_tenant_pub
  ON public.ministry_announcements(tenant_id, published, published_at DESC);

CREATE OR REPLACE VIEW public.tenant_analytics_view AS
SELECT
  t.id AS tenant_id, t.slug AS tenant_slug, t.country_name, t.status,
  COALESCE(s.school_count, 0)    AS school_count,
  COALESCE(p.user_count, 0)      AS user_count,
  COALESCE(r.student_count, 0)   AS student_count,
  COALESCE(r.teacher_count, 0)   AS teacher_count,
  COALESCE(al.active_users_7d,0) AS active_users_7d,
  COALESCE(a.assignments_30d,0)  AS assignments_30d,
  COALESCE(sub.submissions_30d,0) AS submissions_30d,
  COALESCE(ROUND(sub.avg_grade_30d::numeric, 2), 0) AS avg_grade_30d,
  now() AS computed_at
FROM public.tenants t
LEFT JOIN (SELECT tenant_id, COUNT(*) AS school_count FROM public.schools GROUP BY tenant_id) s
  ON s.tenant_id = t.id
LEFT JOIN (
  SELECT sc.tenant_id, COUNT(*) AS user_count
    FROM public.profiles pr JOIN public.schools sc ON sc.id = pr.school_id
   GROUP BY sc.tenant_id
) p ON p.tenant_id = t.id
LEFT JOIN (
  SELECT sc.tenant_id,
         COUNT(*) FILTER (WHERE ur.role::text = 'student') AS student_count,
         COUNT(*) FILTER (WHERE ur.role::text = 'teacher') AS teacher_count
    FROM public.user_roles ur
    JOIN public.profiles pr ON pr.id = ur.user_id
    JOIN public.schools sc  ON sc.id = pr.school_id
   GROUP BY sc.tenant_id
) r ON r.tenant_id = t.id
LEFT JOIN (
  SELECT sc.tenant_id, COUNT(DISTINCT pr.id) AS active_users_7d
    FROM public.activity_logs alg
    JOIN public.profiles pr ON pr.id = alg.user_id
    JOIN public.schools sc  ON sc.id = pr.school_id
   WHERE alg.created_at >= now() - INTERVAL '7 days'
   GROUP BY sc.tenant_id
) al ON al.tenant_id = t.id
LEFT JOIN (
  SELECT sc.tenant_id, COUNT(*) AS assignments_30d
    FROM public.assignments a2 JOIN public.schools sc ON sc.id = a2.school_id
   WHERE a2.created_at >= now() - INTERVAL '30 days'
   GROUP BY sc.tenant_id
) a ON a.tenant_id = t.id
LEFT JOIN (
  SELECT sc.tenant_id, COUNT(*) AS submissions_30d, AVG(su.grade) AS avg_grade_30d
    FROM public.submissions su
    JOIN public.profiles pr ON pr.id = su.student_id
    JOIN public.schools sc  ON sc.id = pr.school_id
   WHERE su.submitted_at >= now() - INTERVAL '30 days' AND su.grade IS NOT NULL
   GROUP BY sc.tenant_id
) sub ON sub.tenant_id = t.id;

REVOKE ALL ON public.tenant_analytics_view FROM PUBLIC;
GRANT  SELECT ON public.tenant_analytics_view TO service_role;

CREATE OR REPLACE FUNCTION public.get_tenant_analytics(p_tenant_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
GRANT EXECUTE ON FUNCTION public.get_tenant_analytics(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_cross_tenant_observatory()
RETURNS SETOF public.tenant_analytics_view
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM public.tenant_analytics_view ORDER BY country_name;
END;$$;
GRANT EXECUTE ON FUNCTION public.get_cross_tenant_observatory() TO authenticated;
