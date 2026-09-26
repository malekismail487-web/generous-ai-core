import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFamilyPulse, familyConversationQuestions } from '../src/lib/familyEvidence';
import type { SupportCheckin, SupportPlan } from '../src/lib/learningSupport';

const now = new Date('2026-09-26T12:00:00.000Z');
const plan = {
  id: 'visible', school_id: 'school-a', student_id: 'student-a', subject: 'Biology', topic: 'Cell division',
  goal: 'Explain stages with evidence', family_step: 'Discuss a diagram.', family_visible: true,
  source_kind: 'ALE_MASTERY', baseline_mastery: 0.4, ale_observed_at: '2026-09-10T12:00:00.000Z', status: 'active',
} as SupportPlan;
const checkin = (id: string, planId: string, kind: string, created_at: string) => ({ id, plan_id: planId, kind, created_at }) as SupportCheckin;
const observation = (overrides: Record<string, unknown> = {}) => ({
  user_id: 'student-a', school_id: 'school-a', subject: 'Biology', topic: 'Cell division',
  mastery_score: 0.55, updated_at: '2026-09-25T12:00:00.000Z', is_test_data: false, ...overrides,
});

test('family pulse confines evidence to the linked student, school, visible plans and seven-day window', () => {
  const pulse = buildFamilyPulse('school-a', 'student-a', [
    plan,
    { ...plan, id: 'hidden', family_visible: false },
    { ...plan, id: 'other-school', school_id: 'school-b' },
    { ...plan, id: 'other-child', student_id: 'student-b' },
  ], [
    checkin('recent', 'visible', 'PRACTICED', '2026-09-25T12:00:00Z'),
    checkin('help', 'visible', 'NEEDS_HELP', '2026-09-24T12:00:00Z'),
    checkin('old', 'visible', 'PRACTICED', '2026-09-18T12:00:00Z'),
    checkin('private', 'hidden', 'PRACTICED', '2026-09-25T12:00:00Z'),
    checkin('future', 'visible', 'PRACTICED', '2026-09-27T12:00:00Z'),
  ], [observation()], now);
  assert.deepEqual(pulse.plans.map(item => item.planId), ['visible']);
  assert.equal(pulse.practiceCount, 1);
  assert.equal(pulse.helpCount, 1);
  assert.equal(pulse.estimateIncreases, 1);
  assert.ok(Math.abs((pulse.plans[0].estimateDelta ?? 0) - 0.15) < 1e-9);
  const questions = familyConversationQuestions(pulse);
  assert.equal(questions.length, 1);
  assert.equal(questions[0].planId, 'visible');
  assert.match(questions[0].text, /asked for help/);
});

test('test data, wrong learner and stale observations cannot imply progress', () => {
  const pulse = buildFamilyPulse('school-a', 'student-a', [plan], [], [
    observation({ is_test_data: true, mastery_score: 0.95 }),
    observation({ user_id: 'student-b', mastery_score: 0.9 }),
    observation({ updated_at: '2026-09-09T12:00:00Z', mastery_score: 0.8 }),
    observation({ updated_at: '2026-09-12T12:00:00Z', mastery_score: 0.75 }),
    observation({ school_id: 'school-b', mastery_score: 0.8 }),
  ], now);
  assert.equal(pulse.plans[0].estimateDelta, null);
  assert.equal(pulse.unknownComparisons, 1);
  assert.match(familyConversationQuestions(pulse)[0].text, /without assuming mastery/);
});

test('closed teacher plans remain historical evidence but do not generate new meeting questions', () => {
  const pulse = buildFamilyPulse('school-a', 'student-a', [{ ...plan, status: 'closed' }], [], [], now);
  assert.equal(pulse.plans.length, 1);
  assert.deepEqual(familyConversationQuestions(pulse), []);
});

test('newer lower estimate is a reported observation, not erased by favorable old evidence', () => {
  const pulse = buildFamilyPulse('school-a', 'student-a', [plan], [], [
    observation({ updated_at: '2026-09-24T12:00:00Z', mastery_score: 0.7 }),
    observation({ updated_at: '2026-09-25T12:00:00Z', mastery_score: 0.3 }),
  ], now);
  assert.equal(pulse.estimateDecreases, 1);
  assert.ok(Math.abs((pulse.plans[0].estimateDelta ?? 0) + 0.1) < 1e-9);
});
