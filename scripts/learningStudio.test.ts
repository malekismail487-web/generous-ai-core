import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { alignConcepts, buildReentryPlan, buildSchoolActions, learningPrompt, mappedCurriculumPrompt, teacherPlanPrompt } from '../src/lib/learningStudio';
import type { SupportPlan } from '../src/lib/learningSupport';

const now = new Date('2026-09-25T12:00:00Z');
const plan = {
  id: 'plan-1', school_id: 'school-1', student_id: 'student-1', teacher_id: 'teacher-1',
  subject: 'Math', topic: 'Fractions', goal: 'Explain equivalent fractions',
  source_kind: 'ALE_MASTERY', status: 'active', due_at: '2026-09-25T13:00:00Z',
} as SupportPlan;

test('school queue excludes submitted work and ranks published deadlines with teacher plans and ALE review', () => {
  const result = buildSchoolActions([
    { id: 'a1', teacher_id: 'teacher-1', title: 'Fractions worksheet', subject: 'Math', grade_level: 'Grade 5', due_date: '2026-09-25T11:00:00Z' },
    { id: 'a2', teacher_id: 'teacher-1', title: 'Completed quiz', subject: 'Math', grade_level: 'Grade 5', due_date: '2026-09-25T11:00:00Z' },
  ], new Set(['a2']), [plan], [
    { subject: 'Science', topic: 'States of matter', mastery_score: 0.4, next_review_at: '2026-09-25T10:00:00Z', overdue_hours: 2 },
  ], now);
  assert.deepEqual(result.map(item => item.kind), ['assignment', 'support', 'review']);
  assert.equal(result.some(item => item.id === 'assignment:a2'), false);
  assert.equal(result[1].explanation, 'Teacher plan grounded in ALE evidence');
  assert.match(result[2].explanation, /not proof of mastery/);
});

test('return-to-school plan uses real pending work, teacher plans and reviews without inventing attendance', () => {
  const result = buildReentryPlan([
    { id: 'during', teacher_id: 'teacher-1', title: 'Fractions practice', subject: 'Math', grade_level: 'Grade 5', created_at: '2026-09-23T12:00:00Z', due_date: '2026-09-30T12:00:00Z' },
    { id: 'due', teacher_id: 'teacher-1', title: 'Science quiz', subject: 'Science', grade_level: 'Grade 5', created_at: '2026-09-01T12:00:00Z', due_date: '2026-09-24T12:00:00Z' },
    { id: 'before', teacher_id: 'teacher-1', title: 'Older work', subject: 'Art', grade_level: 'Grade 5', created_at: '2026-09-01T12:00:00Z', due_date: '2026-10-10T12:00:00Z' },
    { id: 'done', teacher_id: 'teacher-1', title: 'Completed', subject: 'Math', grade_level: 'Grade 5', created_at: '2026-09-23T12:00:00Z', due_date: null },
  ], new Set(['done']), [plan], [
    { subject: 'Science', topic: 'States of matter', mastery_score: 0.4, next_review_at: '2026-09-25T10:00:00Z', overdue_hours: 2 },
  ], '2026-09-22', '2026-09-24', now);
  const ids = result.days.flatMap(day => day.tasks.map(task => task.action.id));
  assert.deepEqual(new Set(ids), new Set(['assignment:during', 'assignment:due', 'support:plan-1', 'review:Science:States of matter']));
  assert.equal(result.total, 4);
  assert.equal(result.days.every(day => day.tasks.length <= 2), true);
  assert.equal(result.remaining.length, 0);
});

test('return-to-school plan rejects invalid, future and overlong absence windows', () => {
  for (const [start, end] of [['2026-09-26', '2026-09-26'], ['2026-09-24', '2026-09-22'], ['2026-08-01', '2026-09-24'], ['2026-09-31', '2026-09-31']]) {
    assert.throws(() => buildReentryPlan([], new Set(), [], [], start, end, now));
  }
});

test('curriculum compass requires an explicit in-school or global mapping', () => {
  const weak = [
    { subject: 'Math', topic: 'Fractions', mastery_score: 0.34, next_review_at: null, last_practiced_at: null, repetitions: 1 },
    { subject: 'Science', topic: 'Motion', mastery_score: 0.3, next_review_at: null, last_practiced_at: null, repetitions: 1 },
  ];
  const result = alignConcepts(weak, [
    { subject: 'Math', concept_key: 'Fractions', standard_id: 'other', alignment_strength: 1, school_id: 'school-2' },
    { subject: 'Math', concept_key: 'Math||Fractions', standard_id: 'own', alignment_strength: 0.8, school_id: 'school-1' },
  ], [
    { id: 'other', code: 'OTHER', description: 'Wrong school', framework: 'A', school_id: 'school-2' },
    { id: 'own', code: 'M5.F1', description: 'Compare fractions', framework: 'Local', school_id: 'school-1' },
  ], 'school-1');
  assert.equal(result[0].standardCode, 'M5.F1');
  assert.equal(result[0].source, 'MAPPED');
  assert.equal(result[1].source, 'UNMAPPED');
  assert.equal(result[1].standardDescription, null);
});

test('ALE tutor prompts request checking and feedback, never automatic mastery', () => {
  assert.match(learningPrompt('Math', 'Fractions', 'review'), /Wait for my answer/);
  assert.match(learningPrompt('Math', 'Fractions', 'correct'), /Do not declare mastery/);
  assert.match(teacherPlanPrompt(plan), /Do not change the teacher goal/);
  assert.match(mappedCurriculumPrompt({ subject: 'Science', topic: 'Motion', score: 0.2, standardCode: null,
    standardDescription: null, framework: null, source: 'UNMAPPED' }), /do not invent one/);
});

test('learning record migration preserves student evidence and teacher reply boundary', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20260925000200_student_learning_records.sql', import.meta.url), 'utf8');
  for (const contract of [
    'ENABLE ROW LEVEL SECURITY',
    "student_id = auth.uid()",
    "teacher_id = auth.uid()",
    "student_learning_record_immutable",
    "student.student_teacher_id = p_teacher_id::text",
    "public.can_route_student_learning_record(student_id, school_id, teacher_id, subject)",
    "teacher_reply_append_only",
    "NEW.teacher_replied_at := CASE WHEN NEW.teacher_reply IS NULL THEN NULL ELSE now() END",
  ]) assert.ok(migration.includes(contract), `Missing contract: ${contract}`);
});
