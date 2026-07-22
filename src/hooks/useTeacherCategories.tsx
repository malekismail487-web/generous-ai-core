import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { apiLogger } from '@/lib/logger';

export interface TeacherCategory {
  id: string;
  school_id: string;
  name: string;
  emoji: string | null;
  color: string | null;
  is_default: boolean;
  subject_id: string | null;
  permanent_invite_code: string;
}

/**
 * Per-school teacher categories. Separate from `subjects` (student tiles).
 * Always realtime-subscribed so admin / teacher dashboards reflect changes.
 */
export function useTeacherCategories(schoolId: string | null | undefined) {
  const [categories, setCategories] = useState<TeacherCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!schoolId) { setCategories([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('teacher_categories')
      .select('id,school_id,name,emoji,color,is_default,subject_id,permanent_invite_code')
      .eq('school_id', schoolId)
      .order('is_default', { ascending: false })
      .order('name', { ascending: true });
    if (error) apiLogger.warn('[useTeacherCategories]', error);
    setCategories((data || []) as TeacherCategory[]);
    setLoading(false);
  }, [schoolId]);

  useEffect(() => { fetch(); }, [fetch]);

  useEffect(() => {
    if (!schoolId) return;
    const channel = supabase
      .channel(`teacher-categories-${schoolId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'teacher_categories', filter: `school_id=eq.${schoolId}` },
        () => fetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [schoolId, fetch]);

  return { categories, loading, refresh: fetch };
}
