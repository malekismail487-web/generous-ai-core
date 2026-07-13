/**
 * useLessonBackfill — one-shot hydration for mid-lecture joiners.
 *
 * On mount, fetches the last N lesson_events for `lessonId` in seq order,
 * folds them through the pure Stage A3 reducer, and returns:
 *   - `hydratedState`: the folded LessonState (seed for useLuminaLiveSession)
 *   - `startSeq`: `max(seq)` fetched; pass `startSeq` as `initialLastSeq`
 *     to the hook so its intake gate accepts the very next real event.
 *
 * If no events exist yet, returns the initial state and startSeq=0.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { reduce, initialState, type LessonState } from '@/lib/lse/lessonReducer';
import type { LessonEvent } from '@/lib/lse/eventNormalizer';

const BACKFILL_LIMIT = 200;

export interface LessonBackfillResult {
  hydratedState: LessonState | null;
  startSeq: number;
  ready: boolean;
  error: string | null;
}

export function useLessonBackfill(lessonId: string | null | undefined): LessonBackfillResult {
  const [result, setResult] = useState<LessonBackfillResult>({
    hydratedState: null, startSeq: 0, ready: false, error: null,
  });

  useEffect(() => {
    let cancelled = false;
    if (!lessonId) {
      setResult({ hydratedState: null, startSeq: 0, ready: false, error: null });
      return;
    }
    (async () => {
      // Fetch the LAST N events (by seq desc), then reverse so the reducer
      // folds them in ascending seq order. Mid-lecture joiners must see the
      // most recent state, not the beginning of the lesson.
      const { data, error } = await supabase
        .from('lesson_events')
        .select('id,lesson_id,ts,kind,text,concept_ref,priority,teacher_visible,seq')
        .eq('lesson_id', lessonId)
        .order('seq', { ascending: false })
        .limit(BACKFILL_LIMIT);

      if (cancelled) return;
      if (error) {
        setResult({ hydratedState: initialState(lessonId), startSeq: 0, ready: true, error: error.message });
        return;
      }
      const rows = (data ?? []).slice().reverse();
      let state = initialState(lessonId);
      let maxSeq = 0;
      for (const row of rows) {
        const event: LessonEvent = {
          id: `${lessonId}#${row.seq}`,
          lessonId,
          ts: Date.parse(row.ts),
          kind: row.kind as LessonEvent['kind'],
          text: row.text ?? '',
          conceptRef: row.concept_ref ?? undefined,
          priority: row.priority as LessonEvent['priority'],
          teacherVisible: row.teacher_visible,
        };
        state = reduce(state, event);
        if (row.seq > maxSeq) maxSeq = row.seq;
      }
      setResult({ hydratedState: state, startSeq: maxSeq, ready: true, error: null });
    })();
    return () => { cancelled = true; };
  }, [lessonId]);

  return result;
}
