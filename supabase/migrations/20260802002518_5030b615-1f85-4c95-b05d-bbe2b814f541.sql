CREATE TABLE public.ale_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  partner_name text NOT NULL DEFAULT 'internal',
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  monthly_request_quota integer NOT NULL DEFAULT 250000,
  rate_limit_per_minute integer NOT NULL DEFAULT 120,
  allow_admin_ops boolean NOT NULL DEFAULT true,
  requests_this_month integer NOT NULL DEFAULT 0,
  quota_reset_at timestamptz NOT NULL DEFAULT (date_trunc('month', now()) + interval '1 month'),
  last_used_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ale_api_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid NOT NULL REFERENCES public.ale_api_keys(id) ON DELETE CASCADE,
  external_ref text NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (api_key_id, external_ref)
);

CREATE TABLE public.ale_api_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid REFERENCES public.ale_api_keys(id) ON DELETE CASCADE,
  action text NOT NULL,
  status_code integer NOT NULL,
  latency_ms integer,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ale_api_usage_key_created_idx ON public.ale_api_usage (api_key_id, created_at DESC);

GRANT ALL ON public.ale_api_keys TO service_role;
GRANT ALL ON public.ale_api_students TO service_role;
GRANT ALL ON public.ale_api_usage TO service_role;
GRANT SELECT ON public.ale_api_keys TO authenticated;
GRANT SELECT ON public.ale_api_usage TO authenticated;

ALTER TABLE public.ale_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ale_api_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ale_api_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin can view ALE api keys" ON public.ale_api_keys
  FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));
CREATE POLICY "Super admin can view ALE api usage" ON public.ale_api_usage
  FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));

INSERT INTO public.ale_api_keys (label, partner_name, key_prefix, key_hash)
VALUES ('Adaptive Learning Engine API', 'AI Coder', 'ale_live_EFHs', 'c5dc2b6f00deb379a93dc6af2d6371e384ca3c997a5848d3e5665b6e7130d5f5');