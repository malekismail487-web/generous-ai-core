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
