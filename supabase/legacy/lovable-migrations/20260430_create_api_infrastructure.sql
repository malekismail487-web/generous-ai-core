-- Create api_keys table for API key management
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE,
  rate_limit_rpm INTEGER DEFAULT 60,
  rate_limit_rpd INTEGER DEFAULT 1000,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_rpm CHECK (rate_limit_rpm > 0 AND rate_limit_rpm <= 1000),
  CONSTRAINT valid_rpd CHECK (rate_limit_rpd > 0 AND rate_limit_rpd <= 100000)
);

-- Create api_call_logs table for tracking usage
CREATE TABLE IF NOT EXISTS api_call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash TEXT NOT NULL,
  status INTEGER NOT NULL,
  tokens_used INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_status CHECK (status >= 100 AND status < 600)
);

-- Create indexes for performance
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_active ON api_keys(active) WHERE active = TRUE;
CREATE INDEX idx_api_call_logs_key_hash ON api_call_logs(key_hash);
CREATE INDEX idx_api_call_logs_created_at ON api_call_logs(created_at);

-- Enable RLS on both tables
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_call_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only view their own API keys
CREATE POLICY "Users can view own API keys"
  ON api_keys
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Users can only insert their own API keys
CREATE POLICY "Users can create own API keys"
  ON api_keys
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can only update their own API keys
CREATE POLICY "Users can update own API keys"
  ON api_keys
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Only the backend service can view call logs (no direct user access for now)
CREATE POLICY "Backend can access call logs"
  ON api_call_logs
  FOR ALL
  USING (auth.jwt() ->> 'iss' = 'supabase');

-- Grant necessary permissions to service role
GRANT ALL ON api_keys TO postgres, authenticated, service_role;
GRANT ALL ON api_call_logs TO postgres, authenticated, service_role;
