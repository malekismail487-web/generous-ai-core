import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  eligibleLessonEvidence, nextLessonAIMessages, nextLessonAITool, parseAINextLessonDraft,
  type LessonPlanRow,
} from '../supabase/functions/_shared/nextLessonAIDraft';
import { classLessonNeeds, nextLessonDraft, validNextLessonDraft } from '../src/lib/nextLesson';
import type { SupportPlan } from '../src/lib/learningSupport';

const learners = [
  { id: 'student-1', grade_level: 'Grade 8' },
  { id: 'student-2', grade_level: 'Grade 8' },
  { id: 'student-3', grade_level: 'Grade 8' },
  { id: 'student-4', grade_level: 'Grade 9' },
];
const plan = (student_id: string, overrides: Partial<LessonPlanRow> = {}): LessonPlanRow => ({
  student_id, school_id: 'school-a', teacher_id: 'teacher-a', status: 'active',
  subject: 'Mathematics', topic: 'Fraction equivalence', source_kind: 'ALE_MASTERY', ...overrides,
});

test('backend cohort proof matches existing workbench and excludes identities from AI context', () => {
  const plans = [
    plan('student-1'), plan('student-1'), plan('student-2'),
    plan('student-3', { source_kind: 'TEACHER_OBSERVATION' }),
    plan('student-4'), plan('student-2', { teacher_id: 'teacher-b' }),
    plan('student-3', { school_id: 'school-b' }), plan('student-3', { status: 'closed' }),
  ];
  const evidence = eligibleLessonEvidence('school-a', 'teacher-a', 'Grade 8', 'Mathematics', 'Fraction equivalence', learners, plans);
  assert.ok(evidence);
  assert.equal(evidence.distinctLearners, 3);
  assert.equal(evidence.alePlans, 3);
  assert.equal(evidence.teacherObservations, 1);
  const workbench = classLessonNeeds('school-a', 'teacher-a', 'Grade 8', 'Mathematics', learners,
    plans.map((row, index) => ({ ...row, id: `plan-${index}`, created_at: '2026-09-26T00:00:00Z' })) as SupportPlan[]);
  assert.equal(workbench[0].learnerCount, evidence.distinctLearners);
  const outbound = JSON.stringify(nextLessonAIMessages(evidence, 'en'));
  assert.doesNotMatch(outbound, /student-[1-4]|school-a|teacher-a/);
  assert.match(outbound, /NOT intervention effectiveness/);
});

test('two learners, duplicate plans, cross-tenant records and closed plans cannot trigger AI', () => {
  assert.equal(eligibleLessonEvidence('school-a', 'teacher-a', 'Grade 8', 'Mathematics', 'Fraction equivalence', learners,
    [plan('student-1'), plan('student-1'), plan('student-2')]), null);
  assert.equal(eligibleLessonEvidence('school-a', 'teacher-a', 'Grade 8', 'Mathematics', 'Fraction equivalence', learners,
    [plan('student-1'), plan('student-2'), plan('student-3', { school_id: 'school-b' })]), null);
  assert.equal(eligibleLessonEvidence('school-a', 'teacher-a', 'Grade 8', 'Mathematics', 'Fraction equivalence', learners,
    [plan('student-1'), plan('student-2'), plan('student-3', { status: 'closed' })]), null);
  assert.equal(eligibleLessonEvidence('school-a', 'teacher-a', 'Grade 8', 'Mathematics', 'Fraction equivalence', learners,
    [plan('student-1'), plan('student-2'), plan('student-4')]), null);
});

test('AI lesson schema is bounded, editable and aligned with the publication validator', () => {
  const evidence = eligibleLessonEvidence('school-a', 'teacher-a', 'Grade 8', 'Mathematics', 'Fraction equivalence', learners,
    [plan('student-1'), plan('student-2'), plan('student-3')]);
  assert.ok(evidence);
  const workbenchNeed = {
    subject: evidence.subject, topic: evidence.topic, learnerCount: evidence.distinctLearners,
    alePlanCount: evidence.alePlans, observationPlanCount: evidence.teacherObservations, latestPlanAt: '',
  };
  const example = nextLessonDraft(workbenchNeed, 'Grade 8');
  const parsed = parseAINextLessonDraft(example);
  assert.deepEqual(parsed, example);
  assert.equal(validNextLessonDraft(parsed!), true);
  assert.equal(parseAINextLessonDraft({ ...example, exitTicket: 'short' }), null);
  assert.equal(parseAINextLessonDraft({ ...example, title: 'T'.repeat(1201) }), null);
  assert.equal(parseAINextLessonDraft({ ...example, publish: true }), null);
  assert.equal(parseAINextLessonDraft({ ...example, objective: 'A valid goal\u0000 with control' }), null);
  assert.deepEqual(nextLessonAITool().parameters.required, Object.keys(example));
});
