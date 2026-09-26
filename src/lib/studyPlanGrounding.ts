import type { DueReview } from '@/lib/mastery';
import type { SupportPlan } from '@/lib/learningSupport';

export type GroundedStudyTarget = {
  id: string;
  source: 'TEACHER_PLAN' | 'ALE_DUE_REVIEW';
  subject: string;
  topic: string;
  label: string;
  teacherGoal?: string;
  learnerStep?: string;
  masteryScore?: number;
  observedAt?: string | null;
};

/** Preserve teacher intent and ALE observations as different evidence classes. */
export function buildGroundedStudyTargets(
  plans: readonly SupportPlan[], due: readonly DueReview[],
): GroundedStudyTarget[] {
  const targets: GroundedStudyTarget[] = [];
  for (const plan of plans) {
    if (plan.status !== 'active') continue;
    targets.push({
      id: `teacher:${plan.id}`, source: 'TEACHER_PLAN',
      subject: plan.subject, topic: plan.topic,
      label: `Teacher plan · ${plan.subject} / ${plan.topic}`,
      teacherGoal: plan.goal, learnerStep: plan.learner_step,
      masteryScore: plan.source_kind === 'ALE_MASTERY' ? plan.baseline_mastery ?? undefined : undefined,
      observedAt: plan.source_kind === 'ALE_MASTERY' ? plan.ale_observed_at : null,
    });
  }
  const covered = new Set(targets.map(target => `${target.subject.trim().toLowerCase()}\u0000${target.topic.trim().toLowerCase()}`));
  for (const item of due) {
    if (covered.has(`${item.subject.trim().toLowerCase()}\u0000${item.topic.trim().toLowerCase()}`)) continue;
    targets.push({
      id: `review:${item.subject}:${item.topic}`, source: 'ALE_DUE_REVIEW',
      subject: item.subject, topic: item.topic,
      label: `ALE review · ${item.subject} / ${item.topic}`,
      masteryScore: item.mastery_score, observedAt: item.next_review_at,
    });
  }
  return targets;
}

export function studyPlanEvidenceBlock(target: GroundedStudyTarget | null): string {
  if (!target) return 'This is a learner-requested plan with no verified teacher or ALE topic attached. Do not imply school approval.';
  if (target.source === 'TEACHER_PLAN') {
    return `Source: active teacher learning-support plan. Goal: ${target.teacherGoal}. Learner step: ${target.learnerStep}. `
      + (target.masteryScore !== undefined ? `ALE snapshot at plan creation: ${Math.round(target.masteryScore * 100)}%; observed ${target.observedAt ?? 'unknown time'}. ` : '')
      + 'Preserve the teacher goal; the generated schedule is AI advice, not a teacher-approved change. Do not claim mastery from this plan.';
  }
  return `Source: ALE scheduled review. Previous mastery estimate: ${target.masteryScore === undefined ? 'unknown' : `${Math.round(target.masteryScore * 100)}%`}. `
    + `Review was due ${target.observedAt ?? 'at an unknown time'}. Treat the score as a prior estimate, not a current grade or proof of learning.`;
}

export function allocateStudyMinutes(duration: number) {
  if (!Number.isInteger(duration) || duration < 15 || duration > 120) throw new Error('unsupported_study_duration');
  const weights = [0.1, 0.35, 0.3, 0.15, 0.1];
  const exact = weights.map(weight => weight * duration);
  const minutes = exact.map(value => Math.floor(value));
  let remaining = duration - minutes.reduce((sum, value) => sum + value, 0);
  const byRemainder = exact.map((value, index) => ({ index, fractional: value - Math.floor(value) }))
    .sort((a, b) => b.fractional - a.fractional || a.index - b.index);
  for (const item of byRemainder) {
    if (remaining === 0) break;
    minutes[item.index]++;
    remaining--;
  }
  return { warmup: minutes[0], core: minutes[1], practice: minutes[2], selfAssessment: minutes[3], reflection: minutes[4] };
}
