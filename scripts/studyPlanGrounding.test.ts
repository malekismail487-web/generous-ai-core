import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allocateStudyMinutes, buildGroundedStudyTargets, studyPlanEvidenceBlock } from '../src/lib/studyPlanGrounding';
import type { SupportPlan } from '../src/lib/learningSupport';

const activePlan = {
  id: 'plan-1', status: 'active', subject: 'Math', topic: 'Fractions', goal: 'Compare fractions',
  learner_step: 'Explain one comparison', source_kind: 'ALE_MASTERY',
  baseline_mastery: 0.4, ale_observed_at: '2026-09-24T12:00:00Z',
} as SupportPlan;

test('active teacher goal takes precedence over a duplicate due-review target', () => {
  const targets = buildGroundedStudyTargets([activePlan, { ...activePlan, id: 'closed', status: 'closed' }], [
    { subject: 'Math', topic: 'Fractions', mastery_score: 0.3, next_review_at: '2026-09-25T12:00:00Z', overdue_hours: 1 },
    { subject: 'Science', topic: 'Motion', mastery_score: 0.6, next_review_at: '2026-09-25T12:00:00Z', overdue_hours: 1 },
  ]);
  assert.deepEqual(targets.map(target => target.source), ['TEACHER_PLAN', 'ALE_DUE_REVIEW']);
  assert.match(studyPlanEvidenceBlock(targets[0]), /Preserve the teacher goal/);
  assert.match(studyPlanEvidenceBlock(targets[1]), /prior estimate/);
});

test('manual topics cannot masquerade as school approved', () => {
  assert.match(studyPlanEvidenceBlock(null), /Do not imply school approval/);
  assert.doesNotMatch(studyPlanEvidenceBlock(null), /Teacher-set/);
});

test('study blocks exactly exhaust the selected duration at every offered length', () => {
  for (const duration of [15, 30, 45, 60, 90, 120]) {
    const blocks = allocateStudyMinutes(duration);
    assert.equal(Object.values(blocks).reduce((sum, minutes) => sum + minutes, 0), duration);
    assert.ok(Object.values(blocks).every(minutes => minutes > 0));
  }
  assert.throws(() => allocateStudyMinutes(0), /unsupported_study_duration/);
});
