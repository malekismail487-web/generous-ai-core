import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface LockedSubject {
  loading: boolean;
  categoryId: string | null;
  categoryName: string | null;
  subjectSlug: string | null; // the slug the teacher is allowed to post under
  locked: boolean; // true if a category is assigned and lock is active
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

export function useTeacherLockedSubject(authUserId: string | null | undefined): LockedSubject {
  const [state, setState] = useState<LockedSubject>({
    loading: true, categoryId: null, categoryName: null, subjectSlug: null, locked: false,
  });

  useEffect(() => {
    let cancelled = false;
    if (!authUserId) {
      setState({ loading: false, categoryId: null, categoryName: null, subjectSlug: null, locked: false });
      return;
    }
    (async () => {
      const { data: prof } = await supabase
        .from('profiles')
        .select('teacher_category_id,teacher_subject_id')
        .eq('id', authUserId)
        .maybeSingle();
      const p = prof as { teacher_category_id?: string | null; teacher_subject_id?: string | null } | null;

      if (p?.teacher_category_id) {
        const { data: cat } = await supabase
          .from('teacher_categories')
          .select('name,subject_id')
          .eq('id', p.teacher_category_id)
          .maybeSingle();
        const c = cat as { name?: string; subject_id?: string | null } | null;
        let slug: string | null = null;
        if (c?.subject_id) {
          const { data: subj } = await supabase
            .from('subjects')
            .select('slug')
            .eq('id', c.subject_id)
            .maybeSingle();
          slug = (subj as { slug?: string | null } | null)?.slug ?? null;
        }
        if (!slug && c?.name) slug = slugify(c.name);
        if (!cancelled) setState({
          loading: false,
          categoryId: p.teacher_category_id,
          categoryName: c?.name ?? null,
          subjectSlug: slug,
          locked: !!slug,
        });
        return;
      }

      // Legacy fallback
      if (p?.teacher_subject_id) {
        const { data: subj } = await supabase
          .from('subjects')
          .select('slug,name')
          .eq('id', p.teacher_subject_id)
          .maybeSingle();
        const s = subj as { slug?: string | null; name?: string } | null;
        if (!cancelled) setState({
          loading: false,
          categoryId: null,
          categoryName: s?.name ?? null,
          subjectSlug: s?.slug ?? null,
          locked: !!s?.slug,
        });
        return;
      }

      if (!cancelled) setState({ loading: false, categoryId: null, categoryName: null, subjectSlug: null, locked: false });
    })();
    return () => { cancelled = true; };
  }, [authUserId]);

  return state;
}
