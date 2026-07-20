
-- 1. Rollup + insight tables ---------------------------------------------

CREATE TABLE public.mi_daily_rollups (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  school_id        uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  region_id        uuid REFERENCES public.mc_regions(id) ON DELETE SET NULL,
  subject_id       uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  grade_level      text,
  event_type       public.mi_event_type NOT NULL,
  day              date NOT NULL,
  event_count      integer NOT NULL DEFAULT 0,
  distinct_actors  integer NOT NULL DEFAULT 0,
  avg_score        numeric,
  sum_signal       numeric NOT NULL DEFAULT 0,
  computed_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX mi_rollups_unique_slice
  ON public.mi_daily_rollups (
    tenant_id, day, event_type,
    COALESCE(school_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(region_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(subject_id,'00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(grade_level, '')
  );

CREATE INDEX mi_rollups_tenant_day_idx  ON public.mi_daily_rollups (tenant_id, day DESC);
CREATE INDEX mi_rollups_school_day_idx  ON public.mi_daily_rollups (school_id, day DESC);
CREATE INDEX mi_rollups_region_day_idx  ON public.mi_daily_rollups (region_id, day DESC);
CREATE INDEX mi_rollups_subject_day_idx ON public.mi_daily_rollups (subject_id, day DESC);

GRANT SELECT ON public.mi_daily_rollups TO authenticated;
GRANT ALL    ON public.mi_daily_rollups TO service_role;
ALTER TABLE public.mi_daily_rollups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin reads rollups"
ON public.mi_daily_rollups FOR SELECT TO authenticated
USING (public.is_super_admin_caller());

CREATE POLICY "School admins read own-school rollups"
ON public.mi_daily_rollups FOR SELECT TO authenticated
USING (
  school_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.school_admins sa
    WHERE sa.school_id = mi_daily_rollups.school_id
      AND sa.user_id   = auth.uid()
  )
);

CREATE TYPE public.mi_insight_severity AS ENUM ('info','watch','concern','urgent');
CREATE TYPE public.mi_insight_scope    AS ENUM ('national','regional','school');

CREATE TABLE public.mi_insights (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  scope          public.mi_insight_scope NOT NULL,
  school_id      uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  region_id      uuid REFERENCES public.mc_regions(id) ON DELETE SET NULL,
  subject_id     uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  severity       public.mi_insight_severity NOT NULL,
  title          text NOT NULL,
  summary        text NOT NULL,
  evidence       jsonb NOT NULL DEFAULT '{}'::jsonb,
  window_start   date,
  window_end     date,
  created_at     timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz
);

CREATE INDEX mi_insights_tenant_idx ON public.mi_insights (tenant_id, created_at DESC);
CREATE INDEX mi_insights_scope_idx  ON public.mi_insights (scope);

GRANT SELECT ON public.mi_insights TO authenticated;
GRANT ALL    ON public.mi_insights TO service_role;
ALTER TABLE public.mi_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin reads insights"
ON public.mi_insights FOR SELECT TO authenticated
USING (public.is_super_admin_caller());

CREATE POLICY "School admins read own-school insights"
ON public.mi_insights FOR SELECT TO authenticated
USING (
  scope = 'school' AND school_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.school_admins sa
    WHERE sa.school_id = mi_insights.school_id
      AND sa.user_id   = auth.uid()
  )
);

-- 2. Aggregation engine --------------------------------------------------

CREATE OR REPLACE FUNCTION public.mi_run_daily_aggregation(_target_day date DEFAULT (now() - interval '1 day')::date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
REVOKE ALL ON FUNCTION public.mi_run_daily_aggregation(date) FROM PUBLIC, anon, authenticated;

-- 3. Ministry-facing RPCs (session-token authenticated) ------------------

CREATE OR REPLACE FUNCTION public.mi_national_overview(p_session_token text, p_days integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
GRANT EXECUTE ON FUNCTION public.mi_national_overview(text, integer) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.mi_regional_breakdown(p_session_token text, p_days integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
GRANT EXECUTE ON FUNCTION public.mi_regional_breakdown(text, integer) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.mi_school_snapshot(p_session_token text, p_school_id uuid, p_days integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
GRANT EXECUTE ON FUNCTION public.mi_school_snapshot(text, uuid, integer) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.mi_list_insights(p_session_token text, p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
GRANT EXECUTE ON FUNCTION public.mi_list_insights(text, integer) TO anon, authenticated;
