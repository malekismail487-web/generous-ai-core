import type { SupportPlan } from '@/lib/learningSupport';

export type LessonLearner = { id: string; grade_level: string | null };
export type LessonNeed = {
  subject: string; topic: string; learnerCount: number;
  alePlanCount: number; observationPlanCount: number;
  latestPlanAt: string;
};

const normalized = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();

/** A class-level need is not displayed until at least three different linked learners support it. */
export function classLessonNeeds(
  schoolId: string, teacherId: string, gradeLevel: string, subject: string,
  learners: readonly LessonLearner[], plans: readonly SupportPlan[], minimumCohort = 3,
): LessonNeed[] {
  if (!schoolId || !teacherId || !gradeLevel || !subject || minimumCohort < 3) return [];
  const inGrade = new Set(learners.filter(item => item.grade_level === gradeLevel).map(item => item.id));
  const grouped = new Map<string, { topic: string; learners: Set<string>; plans: SupportPlan[] }>();
  for (const plan of plans) {
    if (plan.school_id !== schoolId || plan.teacher_id !== teacherId || plan.status !== 'active'
      || !inGrade.has(plan.student_id) || normalized(plan.subject) !== normalized(subject) || !plan.topic.trim()) continue;
    const key = normalized(plan.topic);
    const group = grouped.get(key) ?? { topic: plan.topic.trim(), learners: new Set<string>(), plans: [] };
    group.learners.add(plan.student_id);
    group.plans.push(plan);
    grouped.set(key, group);
  }
  return [...grouped.values()].filter(group => group.learners.size >= minimumCohort)
    .map(group => ({
      subject, topic: group.topic, learnerCount: group.learners.size,
      alePlanCount: group.plans.filter(plan => plan.source_kind === 'ALE_MASTERY').length,
      observationPlanCount: group.plans.filter(plan => plan.source_kind === 'TEACHER_OBSERVATION').length,
      latestPlanAt: group.plans.map(plan => plan.created_at).sort().at(-1) ?? '',
    }))
    .sort((a, b) => b.learnerCount - a.learnerCount || a.topic.localeCompare(b.topic));
}

export type NextLessonDraft = {
  title: string; objective: string; prerequisite: string;
  warmup: string; alternateExplanation: string; guidedPractice: string;
  independentCheck: string; exitTicket: string;
};

/** An editable teacher draft. It does not claim that an AI or the evidence proved this pedagogy works. */
export function nextLessonDraft(need: LessonNeed, gradeLevel: string, arabic = false): NextLessonDraft {
  const topic = need.topic;
  return arabic ? {
    title: `مراجعة ${topic} — ${gradeLevel}`,
    objective: `أن يشرح الطالب ${topic} ويطبق الفكرة في مثال جديد مع تبرير خطواته.`,
    prerequisite: `افحص المفاهيم السابقة اللازمة لفهم ${topic} قبل البدء.`,
    warmup: `اعرض سؤالاً قصيراً حول ${topic}، ثم اجمع تفسيرات مختلفة دون كشف الإجابة فوراً.`,
    alternateExplanation: `قدّم تمثيلاً أو مثالاً مختلفاً لموضوع ${topic}، واطلب مقارنة المثالين.`,
    guidedPractice: `حل مثالاً من ${topic} مع الطلاب واطلب منهم شرح سبب كل خطوة.`,
    independentCheck: `أعطِ الطلاب مسألة جديدة في ${topic} ليحلوها باستقلالية مع تبرير الإجابة.`,
    exitTicket: `اطلب تطبيق ${topic} في سياق مختلف وحدد ما يحتاج إلى إعادة شرح.`,
  } : {
    title: `Revisit ${topic} — ${gradeLevel}`,
    objective: `Explain ${topic} and apply it to a new example with a reasoned justification.`,
    prerequisite: `Check the prior ideas needed for ${topic} before continuing.`,
    warmup: `Pose one short question about ${topic}; collect different explanations before revealing a solution.`,
    alternateExplanation: `Present a different representation or example of ${topic}, then compare the two examples.`,
    guidedPractice: `Work through one ${topic} example together and ask why each step follows.`,
    independentCheck: `Give a new ${topic} problem to solve independently with a written reason.`,
    exitTicket: `Ask students to apply ${topic} in a different context and note what still needs explanation.`,
  };
}

export function validNextLessonDraft(draft: NextLessonDraft): boolean {
  return Object.values(draft).every(value => value.trim().length >= 10 && value.length <= 1200);
}

export function readSavedNextLesson(value: unknown): { gradeLevel: string; topic: string; sections: NextLessonDraft } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.kind !== 'NEXT_LESSON_EVIDENCE_DRAFT' || record.version !== 1
    || typeof record.gradeLevel !== 'string' || typeof record.topic !== 'string'
    || !record.gradeLevel.trim() || !record.topic.trim()
    || !record.sections || typeof record.sections !== 'object' || Array.isArray(record.sections)) return null;
  const sections = record.sections as Record<string, unknown>;
  const keys: (keyof NextLessonDraft)[] = ['title', 'objective', 'prerequisite', 'warmup',
    'alternateExplanation', 'guidedPractice', 'independentCheck', 'exitTicket'];
  if (!keys.every(key => typeof sections[key] === 'string')) return null;
  const draft = Object.fromEntries(keys.map(key => [key, sections[key]])) as NextLessonDraft;
  return validNextLessonDraft(draft) ? { gradeLevel: record.gradeLevel, topic: record.topic, sections: draft } : null;
}
