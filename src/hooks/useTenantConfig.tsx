/**
 * useTenantConfig — reads the caller's tenant configuration in one round trip.
 *
 * Backed by the T3 RPC `get_tenant_config()`, which returns:
 *   { id, slug, country_name, country_code, ministry_name,
 *     default_language, supported_languages,
 *     curriculum_framework,
 *     grading_system: { type, pass_mark, scale: [{letter, min, gpa}] },
 *     academic_calendar: { year_start_month, year_end_month, week_start, weekend, terms },
 *     default_subjects: [{ slug, name, emoji, color }],
 *     ai_config, status }
 *
 * Returns `null` for callers without a tenant (super admin, unassigned users).
 * Cached for 5 minutes via React Query — tenant defaults change rarely and are
 * safe to reuse across screens.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface GradingScaleBand {
  letter: string;
  min: number;
  gpa: number;
}

export interface GradingSystem {
  type: 'percentage' | 'gpa' | 'letter' | string;
  pass_mark: number;
  scale: GradingScaleBand[];
}

export interface AcademicTerm {
  name: string;
  start_month: number;
  end_month: number;
}

export interface AcademicCalendar {
  year_start_month: number;
  year_end_month: number;
  week_start: string;
  weekend: string[];
  terms: AcademicTerm[];
}

export interface DefaultSubject {
  slug: string;
  name: string;
  emoji?: string;
  color?: string;
}

export interface TenantConfig {
  id: string;
  slug: string;
  country_name: string;
  country_code: string;
  ministry_name: string;
  default_language: string;
  supported_languages: string[];
  curriculum_framework: string | null;
  grading_system: GradingSystem;
  academic_calendar: AcademicCalendar;
  default_subjects: DefaultSubject[];
  ai_config: Record<string, unknown>;
  status: string;
}

/**
 * Convert a percentage score to a letter grade + GPA using the caller's
 * tenant grading scale. Falls back to `null` if the config is not loaded.
 */
export function gradeFor(
  score: number,
  system: GradingSystem | null | undefined,
): GradingScaleBand | null {
  if (!system || !Array.isArray(system.scale) || system.scale.length === 0) return null;
  // Bands are stored descending by convention; sort defensively.
  const sorted = [...system.scale].sort((a, b) => b.min - a.min);
  return sorted.find((band) => score >= band.min) ?? sorted[sorted.length - 1];
}

export function useTenantConfig() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['tenant-config', user?.id ?? 'anon'],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    queryFn: async (): Promise<TenantConfig | null> => {
      const { data, error } = await supabase.rpc('get_tenant_config');
      if (error) throw error;
      return (data as unknown as TenantConfig | null) ?? null;
    },
  });

  return {
    config: query.data ?? null,
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
