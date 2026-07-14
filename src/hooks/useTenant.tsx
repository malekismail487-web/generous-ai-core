/**
 * useTenant — read-only access to the caller's current tenant plus the list
 * of tenants that are `status='active' AND is_visible=true` (safe to render
 * in a country picker). Never surfaces provisioned-but-hidden countries.
 *
 * Backed by two RPCs from the T1 migration:
 *   - get_active_tenants() → all visible countries
 * The caller's own tenant is derived from useRoleGuard().tenantId.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRoleGuard } from '@/hooks/useRoleGuard';

export interface ActiveTenant {
  id: string;
  slug: string;
  country_name: string;
  country_code: string;
  ministry_name: string;
  default_language: string;
  supported_languages: string[];
}

export function useTenant() {
  const { tenantId } = useRoleGuard();
  const [activeTenants, setActiveTenants] = useState<ActiveTenant[]>([]);
  const [currentTenant, setCurrentTenant] = useState<ActiveTenant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc('get_active_tenants');
      if (cancelled) return;
      if (!error && data) {
        const rows = data as ActiveTenant[];
        setActiveTenants(rows);
        setCurrentTenant(rows.find((t) => t.id === tenantId) ?? null);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [tenantId]);

  return { tenantId, currentTenant, activeTenants, loading };
}
