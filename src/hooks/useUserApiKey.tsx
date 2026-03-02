import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

let cachedPrimaryKey: string | null = null;
let cachedFallbackKey: string | null = null;
let cacheUserId: string | null = null;

export function useUserApiKey() {
  const { user } = useAuth();
  const [apiKey, setApiKey] = useState<string | null>(cachedPrimaryKey);
  const [fallbackApiKey, setFallbackApiKey] = useState<string | null>(cachedFallbackKey);
  const [loading, setLoading] = useState(!cachedPrimaryKey);

  const fetchKey = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    if (cacheUserId === user.id && cachedPrimaryKey !== undefined) {
      setApiKey(cachedPrimaryKey);
      setFallbackApiKey(cachedFallbackKey);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('user_api_keys')
      .select('groq_api_key, groq_fallback_api_key')
      .eq('user_id', user.id)
      .maybeSingle();
    const key = data?.groq_api_key || null;
    const fallback = (data as any)?.groq_fallback_api_key || null;
    cachedPrimaryKey = key;
    cachedFallbackKey = fallback;
    cacheUserId = user.id;
    setApiKey(key);
    setFallbackApiKey(fallback);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchKey(); }, [fetchKey]);

  return { apiKey, fallbackApiKey, loading, refetch: fetchKey };
}
