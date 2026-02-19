import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

let cachedKey: string | null = null;
let cacheUserId: string | null = null;

export function useUserApiKey() {
  const { user } = useAuth();
  const [apiKey, setApiKey] = useState<string | null>(cachedKey);
  const [loading, setLoading] = useState(!cachedKey);

  const fetchKey = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    if (cacheUserId === user.id && cachedKey !== undefined) {
      setApiKey(cachedKey);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('user_api_keys')
      .select('groq_api_key')
      .eq('user_id', user.id)
      .maybeSingle();
    const key = data?.groq_api_key || null;
    cachedKey = key;
    cacheUserId = user.id;
    setApiKey(key);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchKey(); }, [fetchKey]);

  return { apiKey, loading, refetch: fetchKey };
}
