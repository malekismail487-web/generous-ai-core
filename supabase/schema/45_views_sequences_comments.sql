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
