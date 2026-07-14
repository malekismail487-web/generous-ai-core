/**
 * useFeatureFlag — read a single per-tenant feature flag for the current user.
 *
 * Reads the current user's `tenant_id` from `useRoleGuard` and pulls the flag
 * row (or `enabled: false` when missing) from `tenant_feature_flags`. Cached
 * per (tenantId, flagKey) for 5 minutes — flags change rarely and are safe
 * to reuse across screens.
 *
 * Consumers should treat `loading === true` as "unknown yet" and render a
 * neutral fallback rather than assuming disabled. Once loaded, `enabled` is
 * authoritative — the flag exists on the server as the single source of truth
 * (RLS + `is_feature_enabled()` back it up on the write paths).
 *
 * Example:
 *   const { enabled, loading } = useFeatureFlag('lct_exams');
 *   if (loading) return <Skeleton/>;
 *   if (!enabled) return null;
 *   return <LCTPanel/>;
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useRoleGuard } from '@/hooks/useRoleGuard';

export interface FeatureFlagRecord {
  flag_key: string;
  enabled: boolean;
  config: Record<string, unknown>;
  description: string | null;
}

export function useFeatureFlag(flagKey: string) {
  const { tenantId, loading: roleLoading } = useRoleGuard();

  const query = useQuery({
    queryKey: ['tenant-feature-flag', tenantId ?? 'none', flagKey],
    enabled: !!tenantId && !!flagKey,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    queryFn: async (): Promise<FeatureFlagRecord | null> => {
      const { data, error } = await supabase
        .from('tenant_feature_flags')
        .select('flag_key, enabled, config, description')
        .eq('tenant_id', tenantId!)
        .eq('flag_key', flagKey)
        .maybeSingle();
      if (error) throw error;
      return (data as FeatureFlagRecord | null) ?? null;
    },
  });

  return {
    enabled: query.data?.enabled ?? false,
    config: (query.data?.config ?? {}) as Record<string, unknown>,
    record: query.data ?? null,
    loading: roleLoading || query.isLoading,
    error: query.error,
  };
}
