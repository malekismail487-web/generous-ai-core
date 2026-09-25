import type { Database } from '@/integrations/supabase/types';

export type SupportPlan = Database['public']['Tables']['learning_support_plans']['Row'];
export type SupportCheckin = Database['public']['Tables']['learning_support_checkins']['Row'];
export type SupportRole = 'teacher' | 'student' | 'family' | 'admin';

export interface SupportPulse {
  active: number;
  awaitingReview: number;
  closed: number;
  needingHelp: number;
  practiced: number;
  familySupported: number;
  overdue: number;
}

/** Counts are workflow observations, never a causal claim of learning gain. */
export function summarizeSupport(
  plans: readonly SupportPlan[],
  checkins: readonly SupportCheckin[],
  now = new Date(),
): SupportPulse {
  const ids = new Set(plans.map(plan => plan.id));
  const visible = checkins.filter(checkin => ids.has(checkin.plan_id));
  return {
    active: plans.filter(plan => plan.status === 'active').length,
    awaitingReview: plans.filter(plan => plan.status === 'review').length,
    closed: plans.filter(plan => plan.status === 'closed').length,
    needingHelp: visible.filter(checkin => checkin.kind === 'NEEDS_HELP').length,
    practiced: visible.filter(checkin => checkin.kind === 'PRACTICED').length,
    familySupported: visible.filter(checkin => checkin.kind === 'FAMILY_SUPPORTED').length,
    overdue: plans.filter(plan => plan.status === 'active' && plan.due_at !== null && Date.parse(plan.due_at) < now.getTime()).length,
  };
}

export function isAllowedSupportCheckin(role: SupportRole, kind: string): boolean {
  return role === 'student'
    ? kind === 'PRACTICED' || kind === 'NEEDS_HELP'
    : role === 'family' && kind === 'FAMILY_SUPPORTED';
}

export function suggestedMasteryTarget(score: number): number {
  const bounded = Math.max(0, Math.min(1, Number.isFinite(score) ? score : 0));
  return Math.min(1, Math.max(0.7, Math.round((bounded + 0.15) * 100) / 100));
}

/** Future Νύξ seam: a purpose-bound proposal, never an authority grant. */
export interface LearningSupportProposal {
  version: 1;
  objective: 'PROPOSE_LEARNING_SUPPORT';
  schoolId: string;
  learnerId: string;
  evidence: { kind: 'ALE_MASTERY'; subject: string; topic: string; observedScore: number };
  proposedGoal: string;
  proposedLearnerStep: string;
  requestedCapabilities: readonly [];
}

export function makeLearningSupportProposal(
  schoolId: string,
  learnerId: string,
  subject: string,
  topic: string,
  score: number,
): LearningSupportProposal {
  return {
    version: 1,
    objective: 'PROPOSE_LEARNING_SUPPORT',
    schoolId,
    learnerId,
    evidence: { kind: 'ALE_MASTERY', subject, topic, observedScore: score },
    proposedGoal: `Improve understanding of ${topic} in ${subject}; review with fresh practice evidence.`,
    proposedLearnerStep: `Practice ${topic} and ask for help when an explanation is unclear.`,
    requestedCapabilities: [],
  };
}
