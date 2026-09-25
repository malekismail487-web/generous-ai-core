import assert from 'node:assert/strict';
import test from 'node:test';
import {
  authorizeLiveExplanation, eventSequence,
  type DurableEvent, type LiveCaller, type LiveMeeting, type SubmittedEvent,
} from '../supabase/functions/lumina-live/authorization.ts';

const lesson = '12345678-1234-4234-8234-123456789abc';
const meeting: LiveMeeting = { lesson_id: lesson, school_id: 'school-a', grade_level: '8', status: 'live' };
const record: DurableEvent = {
  lesson_id: lesson, school_id: 'school-a', seq: 2, kind: 'concept', text: 'Balance both sides',
  priority: 2, teacher_visible: true, ts: '2026-09-25T08:00:00.000Z',
};
const event: SubmittedEvent = {
  id: `${lesson}#2`, lessonId: lesson, kind: 'concept', text: record.text,
  priority: 2, teacherVisible: true, ts: Date.parse(record.ts),
};
const studentA: LiveCaller = { schoolId: 'school-a', gradeLevel: '8', userType: 'student', active: true };
const studentB: LiveCaller = { ...studentA };

test('two participants in the same authorized grade can independently receive one durable event', () => {
  assert.equal(authorizeLiveExplanation(studentA, meeting, record, event), true);
  assert.equal(authorizeLiveExplanation(studentB, meeting, record, event), true);
});

test('cross-school, cross-grade, inactive, non-student and ended meeting fail closed', () => {
  for (const caller of [
    { ...studentA, schoolId: 'school-b' }, { ...studentA, gradeLevel: '9' },
    { ...studentA, active: false }, { ...studentA, userType: 'parent' },
  ]) assert.equal(authorizeLiveExplanation(caller, meeting, record, event), false);
  assert.equal(authorizeLiveExplanation(studentA, { ...meeting, status: 'ended' }, record, event), false);
  assert.equal(authorizeLiveExplanation(studentA, null, record, event), false);
});

test('fabricated or teacher-hidden utterances never reach inference', () => {
  assert.equal(authorizeLiveExplanation(studentA, meeting, record, { ...event, text: 'Forged teacher text' }), false);
  assert.equal(authorizeLiveExplanation(studentA, meeting, record, { ...event, id: `${lesson}#3` }), false);
  assert.equal(authorizeLiveExplanation(studentA, meeting, { ...record, teacher_visible: false }, event), false);
  assert.equal(authorizeLiveExplanation(studentA, meeting, record, { ...event, ts: event.ts + 1000 }), false);
  assert.equal(eventSequence(lesson, `${lesson}#01`), null);
  assert.equal(eventSequence(lesson, `${lesson}#9007199254740993`), null);
});
