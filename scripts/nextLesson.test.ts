import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classLessonNeeds, nextLessonDraft, readSavedNextLesson, validNextLessonDraft } from '../src/lib/nextLesson';
import type { SupportPlan } from '../src/lib/learningSupport';

const plan = (id: string, student_id: string, overrides: Record<string, unknown> = {}) => ({
  id, student_id, school_id: 'school-a', teacher_id: 'teacher-a',
  subject: 'Mathematics', topic: 'Fraction equivalence', status: 'active',
  source_kind: 'ALE_MASTERY', created_at: '2026-09-25T12:00:00Z', ...overrides,
}) as SupportPlan;
const learners = [
  { id: 'student-1', grade_level: 'Grade 8' },
  { id: 'student-2', grade_level: 'Grade 8' },
  { id: 'student-3', grade_level: 'Grade 8' },
  { id: 'student-4', grade_level: 'Grade 9' },
];

test('next-lesson needs require three distinct in-grade learners and exact tenant/teacher scope', () => {
  const needs = classLessonNeeds('school-a', 'teacher-a', 'Grade 8', 'Mathematics', learners, [
    plan('a', 'student-1'), plan('duplicate', 'student-1'),
    plan('b', 'student-2'), plan('c', 'student-3', { source_kind: 'TEACHER_OBSERVATION' }),
    plan('wrong-grade', 'student-4'), plan('wrong-school', 'student-4', { school_id: 'school-b' }),
    plan('wrong-teacher', 'student-2', { teacher_id: 'teacher-b' }),
    plan('closed', 'student-3', { status: 'closed', topic: 'Algebra' }),
  ]);
  assert.equal(needs.length, 1);
  assert.equal(needs[0].learnerCount, 3);
  assert.equal(needs[0].alePlanCount, 3);
  assert.equal(needs[0].observationPlanCount, 1);
  assert.deepEqual(classLessonNeeds('school-a', 'teacher-a', 'Grade 8', 'Mathematics', learners,
    [plan('a', 'student-1'), plan('b', 'student-2')]), []);
  assert.deepEqual(classLessonNeeds('school-a', 'teacher-a', 'Grade 8', 'Mathematics', learners,
    [plan('a', 'student-1'), plan('b', 'student-2')], 1), []);
});

test('draft provides editable prerequisite, independent check and exit evidence without learner identifiers', () => {
  const need = classLessonNeeds('school-a', 'teacher-a', 'Grade 8', 'Mathematics', learners,
    [plan('a', 'student-1'), plan('b', 'student-2'), plan('c', 'student-3')])[0];
  const draft = nextLessonDraft(need, 'Grade 8');
  assert.equal(validNextLessonDraft(draft), true);
  assert.match(draft.prerequisite, /prior ideas/);
  assert.match(draft.independentCheck, /independently/);
  assert.match(draft.exitTicket, /different context/);
  assert.doesNotMatch(JSON.stringify(draft), /student-[123]/);
  assert.equal(validNextLessonDraft({ ...draft, objective: '' }), false);
  assert.equal(validNextLessonDraft({ ...draft, objective: 'x'.repeat(1201) }), false);
  assert.equal(validNextLessonDraft(nextLessonDraft(need, 'الصف الثامن', true)), true);
  const saved = { version: 1, kind: 'NEXT_LESSON_EVIDENCE_DRAFT', gradeLevel: 'Grade 8', topic: need.topic, sections: draft };
  assert.deepEqual(readSavedNextLesson(saved)?.sections, draft);
  assert.equal(readSavedNextLesson({ ...saved, sections: { ...draft, exitTicket: '' } }), null);
  assert.equal(readSavedNextLesson({ ...saved, gradeLevel: '' }), null);
  assert.equal(readSavedNextLesson({ ...saved, kind: 'UNKNOWN' }), null);
});
