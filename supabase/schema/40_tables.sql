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
