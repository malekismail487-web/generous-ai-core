import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SchoolSubject {
  id: string;
  school_id: string;
  name: string;
  slug: string | null;
  emoji: string | null;
  color: string | null;
  is_default: boolean;
}

const FALLBACK_EMOJI = '📘';
const FALLBACK_COLOR = 'from-slate-500 to-zinc-600';

/**
 * Reads the subjects for a school. Used by the student Subjects tab and any
 * surface that needs to render the per-school tile list.
 */
export function useSchoolSubjects(schoolId: string | null | undefined) {
  const [subjects, setSubjects] = useState<SchoolSubject[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!schoolId) { setSubjects([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('subjects')
      .select('id,school_id,name,slug,emoji,color,is_default')
      .eq('school_id', schoolId)
      .order('is_default', { ascending: false })
      .order('name', { ascending: true });
    if (error) console.warn('[useSchoolSubjects]', error.message);
    setSubjects(
      ((data || []) as SchoolSubject[]).map((s) => ({
        ...s,
        emoji: s.emoji || FALLBACK_EMOJI,
        color: s.color || FALLBACK_COLOR,
      })),
    );
    setLoading(false);
  }, [schoolId]);

  useEffect(() => { fetch(); }, [fetch]);

  // Realtime so admin add/delete shows up everywhere immediately.
  useEffect(() => {
    if (!schoolId) return;
    const channel = supabase
      .channel(`subjects-${schoolId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'subjects', filter: `school_id=eq.${schoolId}` },
        () => fetch(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [schoolId, fetch]);

  return { subjects, loading, refresh: fetch };
}
