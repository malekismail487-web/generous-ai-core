import type { DueReview, WeakTopic } from '@/lib/mastery';
import type { SupportPlan } from '@/lib/learningSupport';

export type StudioTool = 'priorities' | 'review' | 'curriculum' | 'rescue' | 'reentry' | 'questions' | 'mistakes' | 'portfolio';
export type SchoolAssignment = {
  id: string; teacher_id: string; title: string; subject: string;
  grade_level: string; due_date: string | null; class_id?: string | null; created_at?: string;
};
export type SchoolAction = {
  id: string; kind: 'assignment' | 'support' | 'review'; title: string;
  subject: string; topic: string | null; deadline: string | null;
  urgency: number; explanation: string;
};

/** A transparent priority rule: official deadlines first, then due ALE review. */
export function buildSchoolActions(
  assignments: readonly SchoolAssignment[], submitted: ReadonlySet<string>,
  plans: readonly SupportPlan[], due: readonly DueReview[], now = new Date(),
): SchoolAction[] {
  const time = now.getTime();
  const actions: SchoolAction[] = [];
  for (const assignment of assignments) {
    if (submitted.has(assignment.id)) continue;
    const delta = assignment.due_date ? Date.parse(assignment.due_date) - time : Infinity;
    actions.push({
      id: `assignment:${assignment.id}`, kind: 'assignment', title: assignment.title,
      subject: assignment.subject, topic: null, deadline: assignment.due_date,
      urgency: delta < 0 ? 100 : delta < 86400000 ? 90 : delta < 3 * 86400000 ? 70 : 30,
      explanation: delta < 0 ? 'Overdue school assignment' : 'Teacher-assigned work',
    });
  }
  for (const plan of plans) {
    if (plan.status !== 'active') continue;
    const delta = plan.due_at ? Date.parse(plan.due_at) - time : Infinity;
    actions.push({
      id: `support:${plan.id}`, kind: 'support', title: plan.goal,
      subject: plan.subject, topic: plan.topic, deadline: plan.due_at,
      urgency: delta < 0 ? 95 : delta < 86400000 ? 85 : 50,
      explanation: plan.source_kind === 'ALE_MASTERY' ? 'Teacher plan grounded in ALE evidence' : 'Teacher observation',
    });
  }
  for (const item of due) {
    actions.push({
      id: `review:${item.subject}:${item.topic}`, kind: 'review',
      title: `Review ${item.topic}`, subject: item.subject, topic: item.topic,
      deadline: item.next_review_at, urgency: Math.min(80, 45 + Math.max(0, item.overdue_hours) / 6),
      explanation: 'ALE scheduled recall; not proof of mastery',
    });
  }
  return actions.sort((a, b) => b.urgency - a.urgency || a.id.localeCompare(b.id));
}

export interface ReentryTask {
  action: SchoolAction;
  source: 'MISSED_WINDOW' | 'ACTIVE_TEACHER_PLAN' | 'DUE_REVIEW';
}
export interface ReentryPlan {
  days: { day: number; tasks: ReentryTask[] }[];
  remaining: ReentryTask[];
  total: number;
}

const utcDay = (value: string): number | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value ? parsed : null;
};

/** A transparent catch-up queue; it never infers attendance or undocumented lesson content. */
export function buildReentryPlan(
  assignments: readonly SchoolAssignment[], submitted: ReadonlySet<string>,
  plans: readonly SupportPlan[], due: readonly DueReview[],
  absenceStart: string, absenceEnd: string, now = new Date(),
): ReentryPlan {
  const start = utcDay(absenceStart);
  const end = utcDay(absenceEnd);
  const today = utcDay(new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10));
  if (start === null || end === null || today === null || start > end || end > today || end - start > 29 * 86400000) {
    throw new Error('Choose a valid past absence window of at most 30 days.');
  }
  const inWindow = (timestamp: string | null | undefined) => {
    if (!timestamp) return false;
    const time = Date.parse(timestamp);
    return Number.isFinite(time) && time >= start && time < end + 86400000;
  };
  const missedIds = new Set(assignments
    .filter(item => !submitted.has(item.id) && (inWindow(item.created_at) || inWindow(item.due_date)))
    .map(item => `assignment:${item.id}`));
  const candidates = buildSchoolActions(assignments, submitted, plans, due, now).flatMap<ReentryTask>(action => {
    if (action.kind === 'assignment') return missedIds.has(action.id) ? [{ action, source: 'MISSED_WINDOW' as const }] : [];
    if (action.kind === 'support') return [{ action, source: 'ACTIVE_TEACHER_PLAN' as const }];
    return [{ action, source: 'DUE_REVIEW' as const }];
  });
  const ordered = candidates.sort((a, b) => b.action.urgency - a.action.urgency || a.action.id.localeCompare(b.action.id));
  return {
    days: [0, 1, 2].map(day => ({ day: day + 1, tasks: ordered.slice(day * 2, day * 2 + 2) })),
    remaining: ordered.slice(6),
    total: ordered.length,
  };
}

export type ConceptAlignment = {
  subject: string; topic: string; score: number;
  standardCode: string | null; standardDescription: string | null;
  framework: string | null; source: 'MAPPED' | 'UNMAPPED';
};
export type ConceptMapRow = {
  subject: string; concept_key: string; standard_id: string;
  alignment_strength: number; school_id: string | null;
};
export type StandardRow = {
  id: string; code: string; description: string; framework: string; school_id: string | null;
};

const norm = (value: string) => value.trim().toLocaleLowerCase();

/** Only an explicit school/global mapping may establish curriculum alignment. */
export function alignConcepts(
  weak: readonly WeakTopic[], mappings: readonly ConceptMapRow[], standards: readonly StandardRow[], schoolId: string,
): ConceptAlignment[] {
  const standardById = new Map(standards.map(row => [row.id, row]));
  return weak.map(concept => {
    const match = mappings
      .filter(row => (row.school_id === schoolId || row.school_id === null)
        && norm(row.subject) === norm(concept.subject)
        && (norm(row.concept_key) === norm(concept.topic)
          || norm(row.concept_key) === norm(`${concept.subject}||${concept.topic}`)))
      .sort((a, b) => Number(b.school_id === schoolId) - Number(a.school_id === schoolId)
        || b.alignment_strength - a.alignment_strength)
      .find(row => standardById.has(row.standard_id));
    const standard = match ? standardById.get(match.standard_id) : undefined;
    return {
      subject: concept.subject, topic: concept.topic, score: concept.mastery_score,
      standardCode: standard?.code ?? null, standardDescription: standard?.description ?? null,
      framework: standard?.framework ?? null, source: standard ? 'MAPPED' : 'UNMAPPED',
    };
  });
}

export function learningPrompt(subject: string, topic: string, purpose: 'review' | 'explain' | 'correct') {
  const instruction = purpose === 'review'
    ? 'Quiz me with one retrieval question at a time. Wait for my answer, give feedback, and then try a transfer question.'
    : purpose === 'correct'
      ? 'Help me test my corrected explanation with a counterexample and one new problem. Do not declare mastery from my self-report.'
      : 'Explain this in two different ways, ask me which step is unclear, and verify understanding with a short question.';
  return `School subject: ${subject}. Topic: ${topic}. ${instruction}`;
}

export function teacherPlanPrompt(plan: SupportPlan): string {
  return `${learningPrompt(plan.subject, plan.topic, 'explain')} Teacher-set learning goal: ${plan.goal}. `
    + `Learner step: ${plan.learner_step}. These are school instructions, not proof that I learned the concept. `
    + 'Do not change the teacher goal; help me practice it and check my understanding.';
}

export function mappedCurriculumPrompt(alignment: ConceptAlignment): string {
  const context = alignment.source === 'MAPPED' && alignment.standardCode && alignment.standardDescription
    ? `School curriculum mapping ${alignment.framework ?? ''} ${alignment.standardCode}: ${alignment.standardDescription}. `
    : 'No verified curriculum mapping is available; do not invent one. ';
  return `${learningPrompt(alignment.subject, alignment.topic, 'explain')} ${context}`;
}
