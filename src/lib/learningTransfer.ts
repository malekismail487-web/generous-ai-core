import type { Database } from '@/integrations/supabase/types';

export type TransferCheck = Database['public']['Tables']['learning_support_transfer_checks']['Row'];
export type TransferBrief = Pick<TransferCheck, 'id' | 'plan_id' | 'created_at' | 'status' | 'verdict'>;
export type TransferVerdict = 'DEMONSTRATED' | 'NOT_YET' | 'INCONCLUSIVE';
export type TransferCaseState =
  | 'NOT_REQUESTED' | 'AWAITING_LEARNER' | 'AWAITING_TEACHER'
  | 'DEMONSTRATED_ON_ONE_CHECK' | 'NOT_YET_DEMONSTRATED' | 'INCONCLUSIVE';

export function transferCaseState(checks: readonly TransferBrief[]): TransferCaseState {
  if (checks.length === 0) return 'NOT_REQUESTED';
  const newest = [...checks].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))[0];
  if (newest.status === 'OPEN') return 'AWAITING_LEARNER';
  if (newest.status === 'SUBMITTED') return 'AWAITING_TEACHER';
  if (newest.status === 'REVIEWED' && newest.verdict === 'DEMONSTRATED') return 'DEMONSTRATED_ON_ONE_CHECK';
  if (newest.status === 'REVIEWED' && newest.verdict === 'NOT_YET') return 'NOT_YET_DEMONSTRATED';
  return 'INCONCLUSIVE';
}

export function validTransferPrompt(prompt: string, criteria: string): boolean {
  return prompt.trim().length >= 20 && prompt.trim().length <= 2000
    && criteria.trim().length >= 10 && criteria.trim().length <= 1000;
}

export function validTransferResponse(response: string): boolean {
  return response.trim().length >= 10 && response.trim().length <= 5000;
}

export function validTransferReview(verdict: string, feedback: string): verdict is TransferVerdict {
  return ['DEMONSTRATED', 'NOT_YET', 'INCONCLUSIVE'].includes(verdict)
    && feedback.trim().length >= 10 && feedback.trim().length <= 2000;
}

export function transferSchoolSummary(checks: readonly TransferBrief[]) {
  const byPlan = new Map<string, TransferBrief[]>();
  for (const check of checks) byPlan.set(check.plan_id, [...(byPlan.get(check.plan_id) ?? []), check]);
  const states = [...byPlan.values()].map(transferCaseState);
  return {
    plansWithChecks: byPlan.size,
    awaitingLearner: states.filter(state => state === 'AWAITING_LEARNER').length,
    awaitingTeacher: states.filter(state => state === 'AWAITING_TEACHER').length,
    demonstratedOnOneCheck: states.filter(state => state === 'DEMONSTRATED_ON_ONE_CHECK').length,
    notYetDemonstrated: states.filter(state => state === 'NOT_YET_DEMONSTRATED').length,
    inconclusive: states.filter(state => state === 'INCONCLUSIVE').length,
  };
}
