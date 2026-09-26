import type { SupportCheckin, SupportPlan } from '@/lib/learningSupport';

export type FamilyMasteryObservation = {
  user_id: string; school_id: string | null; subject: string; topic: string;
  mastery_score: number; updated_at: string; is_test_data: boolean;
};

export type FamilyPlanEvidence = {
  planId: string; subject: string; topic: string; goal: string; status: string;
  teacherStep: string; practiceCount: number; helpCount: number; familySupportCount: number;
  latestEstimate: number | null; baselineEstimate: number | null; estimateDelta: number | null;
  observationDate: string | null;
};

export type FamilyPulse = {
  windowStart: string; windowEnd: string; plans: FamilyPlanEvidence[];
  practiceCount: number; helpCount: number; familySupportCount: number;
  estimateIncreases: number; estimateDecreases: number; unknownComparisons: number;
};

const time = (value: string | null): number | null => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const score = (value: number): boolean => Number.isFinite(value) && value >= 0 && value <= 1;

/** A family pulse is a view of dated observations, not an inference that support caused learning. */
export function buildFamilyPulse(
  schoolId: string, studentId: string, plans: readonly SupportPlan[],
  checkins: readonly SupportCheckin[], observations: readonly FamilyMasteryObservation[],
  now = new Date(),
): FamilyPulse {
  const end = now.getTime();
  const start = end - 7 * 24 * 60 * 60 * 1000;
  const visible = plans.filter(plan => plan.school_id === schoolId && plan.student_id === studentId
    && plan.family_visible && !!plan.family_step?.trim());
  const ids = new Set(visible.map(plan => plan.id));
  const recent = checkins.filter(item => ids.has(item.plan_id) && time(item.created_at) !== null
    && time(item.created_at)! >= start && time(item.created_at)! <= end);
  const byPlan = new Map<string, SupportCheckin[]>();
  for (const item of recent) byPlan.set(item.plan_id, [...(byPlan.get(item.plan_id) ?? []), item]);

  const evidence = visible.map(plan => {
    const events = byPlan.get(plan.id) ?? [];
    const baselineAt = time(plan.ale_observed_at);
    const current = observations.filter(item => item.user_id === studentId
      && (item.school_id === schoolId || item.school_id === null)
      && item.subject === plan.subject && item.topic === plan.topic
      && !item.is_test_data && score(item.mastery_score)
      && baselineAt !== null && time(item.updated_at) !== null && time(item.updated_at)! > baselineAt
      && time(item.updated_at)! >= start
      && time(item.updated_at)! <= end)
      .sort((a, b) => time(b.updated_at)! - time(a.updated_at)!)[0];
    const comparable = plan.source_kind === 'ALE_MASTERY' && plan.baseline_mastery !== null
      && score(plan.baseline_mastery) && !!current;
    return {
      planId: plan.id, subject: plan.subject, topic: plan.topic, goal: plan.goal, status: plan.status,
      teacherStep: plan.family_step!.trim(),
      practiceCount: events.filter(item => item.kind === 'PRACTICED').length,
      helpCount: events.filter(item => item.kind === 'NEEDS_HELP').length,
      familySupportCount: events.filter(item => item.kind === 'FAMILY_SUPPORTED').length,
      latestEstimate: comparable ? current!.mastery_score : null,
      baselineEstimate: comparable ? plan.baseline_mastery : null,
      estimateDelta: comparable ? current!.mastery_score - plan.baseline_mastery! : null,
      observationDate: comparable ? current!.updated_at : null,
    } satisfies FamilyPlanEvidence;
  });
  return {
    windowStart: new Date(start).toISOString(), windowEnd: new Date(end).toISOString(), plans: evidence,
    practiceCount: recent.filter(item => item.kind === 'PRACTICED').length,
    helpCount: recent.filter(item => item.kind === 'NEEDS_HELP').length,
    familySupportCount: recent.filter(item => item.kind === 'FAMILY_SUPPORTED').length,
    estimateIncreases: evidence.filter(item => item.estimateDelta !== null && item.estimateDelta > 0).length,
    estimateDecreases: evidence.filter(item => item.estimateDelta !== null && item.estimateDelta < 0).length,
    unknownComparisons: evidence.filter(item => item.estimateDelta === null).length,
  };
}

export type FamilyConversationQuestion = {
  planId: string; subject: string; topic: string; text: string; textAr: string; basis: string;
};

/** Only teacher-shared goals and admissible observations enter an optional, parent-approved draft. */
export function familyConversationQuestions(pulse: FamilyPulse): FamilyConversationQuestion[] {
  return pulse.plans.filter(item => item.goal.trim() && item.status !== 'closed').map(item => ({
    planId: item.planId, subject: item.subject, topic: item.topic,
    basis: item.helpCount > 0 ? 'learner help request' : item.estimateDelta !== null ? 'newer ALE estimate' : 'teacher-shared goal',
    text: item.helpCount > 0
      ? `For ${item.topic}, the learner asked for help. Which different explanation or example should we try next?`
      : item.estimateDelta !== null
        ? `For ${item.topic}, a newer ALE estimate differs from the support-plan baseline. What independent work would confirm understanding?`
        : `For ${item.topic}, what brief practice would help us check the teacher-shared goal without assuming mastery?`,
    textAr: item.helpCount > 0
      ? `طلب الطالب مساعدة في ${item.topic}. ما الشرح أو المثال المختلف الذي يمكن تجربته؟`
      : item.estimateDelta !== null
        ? `تغيّر تقدير المحرك التكيفي لموضوع ${item.topic} منذ بداية الخطة. ما العمل المستقل الذي يؤكد الفهم؟`
        : `ما التدريب القصير الذي يساعدنا على فحص هدف المعلم في ${item.topic} دون افتراض الإتقان؟`,
  }));
}
