import type { Tables } from '@/integrations/supabase/types';

export type ComprehensionSignal = Pick<
  Tables<'live_comprehension_signals'>,
  'id' | 'event_seq' | 'status' | 'created_at'
>;

export interface OpenSignalGroup {
  eventSeq: number;
  count: number;
  latestAt: string;
}

/** Groups actionable feedback by teacher event without exposing student IDs. */
export function openComprehensionGroups(signals: readonly ComprehensionSignal[]): OpenSignalGroup[] {
  const groups = new Map<number, OpenSignalGroup>();
  for (const signal of signals) {
    if (signal.status !== 'open' || !Number.isSafeInteger(signal.event_seq) || signal.event_seq < 1) continue;
    const existing = groups.get(signal.event_seq);
    groups.set(signal.event_seq, {
      eventSeq: signal.event_seq,
      count: (existing?.count ?? 0) + 1,
      latestAt: !existing || signal.created_at > existing.latestAt ? signal.created_at : existing.latestAt,
    });
  }
  return [...groups.values()].sort((a, b) => b.eventSeq - a.eventSeq);
}
