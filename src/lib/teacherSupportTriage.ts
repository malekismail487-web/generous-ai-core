import type { Database } from '@/integrations/supabase/types';
import type { SupportCheckin, SupportPlan } from '@/lib/learningSupport';
import { transferCaseState, type TransferCheck } from '@/lib/learningTransfer';

type Plan = Pick<SupportPlan, 'id' | 'status' | 'student_id' | 'subject' | 'topic' | 'due_at'>;
type Checkin = Pick<SupportCheckin, 'id' | 'plan_id' | 'kind' | 'created_at'>;
type Check = Pick<TransferCheck, 'id' | 'plan_id' | 'status' | 'verdict' | 'created_at'>;
type Question = Pick<Database['public']['Tables']['student_learning_records']['Row'],
  'id' | 'support_plan_id' | 'teacher_reply' | 'created_at'>;

export type TeacherAttentionReason =
  | 'TRANSFER_AWAITING_REVIEW'
  | 'QUESTION_AWAITING_REPLY'
  | 'RECENT_HELP_SIGNAL'
  | 'PLAN_AWAITING_REVIEW'
  | 'OVERDUE_PLAN'
  | 'TRANSFER_NOT_YET';

export interface TeacherAttentionItem {
  planId: string;
  studentId: string;
  subject: string;
  topic: string;
  reasons: TeacherAttentionReason[];
  highestPriority: number;
}

const priority: Record<TeacherAttentionReason, number> = {
  TRANSFER_AWAITING_REVIEW: 6,
  QUESTION_AWAITING_REPLY: 5,
  RECENT_HELP_SIGNAL: 4,
  PLAN_AWAITING_REVIEW: 3,
  OVERDUE_PLAN: 2,
  TRANSFER_NOT_YET: 1,
};

/** This is an attributable workflow queue, not a student-risk or learning-impact score. */
export function teacherSupportQueue(
  plans: readonly Plan[], checkins: readonly Checkin[], checks: readonly Check[],
  questions: readonly Question[], now = new Date(),
): TeacherAttentionItem[] {
  const recentHelpCutoff = now.getTime() - 14 * 24 * 60 * 60 * 1000;
  const checkinsByPlan = new Map<string, Checkin[]>();
  const checksByPlan = new Map<string, Check[]>();
  const questionsByPlan = new Map<string, Question[]>();
  for (const checkin of checkins) checkinsByPlan.set(checkin.plan_id, [...(checkinsByPlan.get(checkin.plan_id) ?? []), checkin]);
  for (const check of checks) checksByPlan.set(check.plan_id, [...(checksByPlan.get(check.plan_id) ?? []), check]);
  for (const question of questions) if (question.support_plan_id) {
    questionsByPlan.set(question.support_plan_id, [...(questionsByPlan.get(question.support_plan_id) ?? []), question]);
  }

  const items: TeacherAttentionItem[] = [];
  for (const plan of plans) {
    if (plan.status === 'closed') continue;
    const reasons: TeacherAttentionReason[] = [];
    const transferState = transferCaseState(checksByPlan.get(plan.id) ?? []);
    if (transferState === 'AWAITING_TEACHER') reasons.push('TRANSFER_AWAITING_REVIEW');
    if ((questionsByPlan.get(plan.id) ?? []).some(question => question.teacher_reply === null)) reasons.push('QUESTION_AWAITING_REPLY');
    if ((checkinsByPlan.get(plan.id) ?? []).some(checkin => checkin.kind === 'NEEDS_HELP'
      && Number.isFinite(Date.parse(checkin.created_at)) && Date.parse(checkin.created_at) >= recentHelpCutoff
      && Date.parse(checkin.created_at) <= now.getTime())) reasons.push('RECENT_HELP_SIGNAL');
    if (plan.status === 'review') reasons.push('PLAN_AWAITING_REVIEW');
    if (plan.status === 'active' && plan.due_at !== null && Number.isFinite(Date.parse(plan.due_at))
      && Date.parse(plan.due_at) < now.getTime()) reasons.push('OVERDUE_PLAN');
    if (transferState === 'NOT_YET_DEMONSTRATED') reasons.push('TRANSFER_NOT_YET');
    if (!reasons.length) continue;
    reasons.sort((a, b) => priority[b] - priority[a]);
    items.push({
      planId: plan.id, studentId: plan.student_id, subject: plan.subject, topic: plan.topic,
      reasons, highestPriority: priority[reasons[0]],
    });
  }
  return items.sort((a, b) => b.highestPriority - a.highestPriority
    || a.subject.localeCompare(b.subject) || a.topic.localeCompare(b.topic) || a.planId.localeCompare(b.planId));
}
