-- Lumina API keys table
CREATE TABLE public.lumina_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  partner_name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  monthly_request_quota INTEGER NOT NULL DEFAULT 100000,
  rate_limit_per_minute INTEGER NOT NULL DEFAULT 60,
  requests_this_month INTEGER NOT NULL DEFAULT 0,
  quota_reset_at TIMESTAMPTZ NOT NULL DEFAULT (date_trunc('month', now()) + interval '1 month'),
  last_used_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  revoked_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lumina_api_keys_hash ON public.lumina_api_keys(key_hash) WHERE is_active = true;

-- Usage log
CREATE TABLE public.lumina_api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID NOT NULL REFERENCES public.lumina_api_keys(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  tokens_used INTEGER DEFAULT 0,
  latency_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lumina_api_usage_key ON public.lumina_api_usage(api_key_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.lumina_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lumina_api_usage ENABLE ROW LEVEL SECURITY;

-- Helper: super admin check
CREATE OR REPLACE FUNCTION public.is_super_admin_user(uid UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = uid AND email = 'malekismail487@gmail.com')
$$;

-- RLS: only super admin can manage
CREATE POLICY "Super admin manages keys" ON public.lumina_api_keys
  FOR ALL USING (public.is_super_admin_user(auth.uid()))
  WITH CHECK (public.is_super_admin_user(auth.uid()));

CREATE POLICY "Super admin views usage" ON public.lumina_api_usage
  FOR SELECT USING (public.is_super_admin_user(auth.uid()));

CREATE TRIGGER update_lumina_api_keys_updated_at
  BEFORE UPDATE ON public.lumina_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();