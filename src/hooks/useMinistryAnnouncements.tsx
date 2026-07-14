/**
 * useMinistryAnnouncements — list Ministry (country-wide) announcements
 * visible to the caller, ordered newest-first.
 *
 * RLS enforces tenant isolation: users only see `published = true` rows for
 * their own tenant; Super Admins see everything. This hook is safe to render
 * anywhere in an authenticated route.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface MinistryAnnouncement {
  id: string;
  tenant_id: string;
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'critical';
  published: boolean;
  published_at: string;
  author_id: string | null;
  created_at: string;
  updated_at: string;
}

export function useMinistryAnnouncements() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['ministry-announcements', user?.id ?? 'anon'],
    enabled: !!user,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<MinistryAnnouncement[]> => {
      const { data, error } = await supabase
        .from('ministry_announcements')
        .select('*')
        .order('published_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as MinistryAnnouncement[];
    },
  });

  return {
    announcements: query.data ?? [],
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
