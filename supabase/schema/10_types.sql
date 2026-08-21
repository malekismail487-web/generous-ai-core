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
