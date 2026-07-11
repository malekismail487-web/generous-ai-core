/**
 * useLiveMeetings — student-side subscription to grade-targeted live meetings.
 *
 * Returns live + scheduled meetings for the student's school+grade, plus a
 * realtime-driven `liveCount` (used by BottomNav to show the red dot when a
 * meeting is currently live). The subscription follows the Lovable Cloud
 * pattern (create + tear down inside `useEffect`) so we never leak channels.
 */
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRoleGuard } from '@/hooks/useRoleGuard';

export interface LiveMeetingRow {
  id: string;
  lesson_id: string;
  teacher_id: string;
  school_id: string;
  subject: string | null;
  title: string;
  grade_level: string;
  share_code: string;
  status: 'scheduled' | 'live' | 'ended';
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export function useLiveMeetings() {
  const { school, profile } = useRoleGuard();
  const [meetings, setMeetings] = useState<LiveMeetingRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMeetings = useCallback(async () => {
    if (!school?.id || !profile?.grade_level) {
      setMeetings([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from('live_meetings')
      .select('*')
      .eq('school_id', school.id)
      .eq('grade_level', profile.grade_level)
      .in('status', ['scheduled', 'live'])
      .order('started_at', { ascending: false, nullsFirst: false })
      .order('scheduled_at', { ascending: true, nullsFirst: false });
    setMeetings((data ?? []) as LiveMeetingRow[]);
    setLoading(false);
  }, [school?.id, profile?.grade_level]);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  useEffect(() => {
    if (!school?.id || !profile?.grade_level) return;
    const channel = supabase
      .channel(`live_meetings:${school.id}:${profile.grade_level}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_meetings',
          filter: `school_id=eq.${school.id}`,
        },
        () => { fetchMeetings(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [school?.id, profile?.grade_level, fetchMeetings]);

  const liveMeetings = meetings.filter((m) => m.status === 'live');
  const scheduledMeetings = meetings.filter((m) => m.status === 'scheduled');

  return {
    meetings,
    liveMeetings,
    scheduledMeetings,
    liveCount: liveMeetings.length,
    loading,
    refresh: fetchMeetings,
  };
}
