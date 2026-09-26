import assert from 'node:assert/strict';
import { test } from 'node:test';
import { teacherSupportQueue } from '../src/lib/teacherSupportTriage';

const now = new Date('2026-09-26T12:00:00Z');
const plan = (id: string, status = 'active', due_at: string | null = null) => ({
  id, status, due_at, student_id: `student-${id}`, subject: 'Math', topic: `Topic ${id}`,
});
const check = (id: string, plan_id: string, status: string, verdict: string | null, created_at: string) => ({
  id, plan_id, status, verdict, created_at,
});
const question = (id: string, support_plan_id: string, teacher_reply: string | null) => ({
  id, support_plan_id, teacher_reply, created_at: '2026-09-25T00:00:00Z',
});

test('queue prioritizes recorded teacher obligations without inferring mastery', () => {
  const items = teacherSupportQueue(
    [plan('overdue', 'active', '2026-09-20T00:00:00Z'), plan('question'), plan('transfer'), plan('closed', 'closed')],
    [{ id: 'help', plan_id: 'overdue', kind: 'NEEDS_HELP', created_at: '2026-09-25T00:00:00Z' }],
    [check('submitted', 'transfer', 'SUBMITTED', null, '2026-09-25T00:00:00Z'),
      check('closed-check', 'closed', 'SUBMITTED', null, '2026-09-25T00:00:00Z')],
    [question('q1', 'question', null)], now,
  );
  assert.deepEqual(items.map(item => item.planId), ['transfer', 'question', 'overdue']);
  assert.deepEqual(items[0].reasons, ['TRANSFER_AWAITING_REVIEW']);
  assert.deepEqual(items[1].reasons, ['QUESTION_AWAITING_REPLY']);
  assert.deepEqual(items[2].reasons, ['RECENT_HELP_SIGNAL', 'OVERDUE_PLAN']);
});

test('latest transfer outcome supersedes an old submitted check', () => {
  const items = teacherSupportQueue([plan('p')], [], [
    check('older', 'p', 'SUBMITTED', null, '2026-09-20T00:00:00Z'),
    check('newer', 'p', 'REVIEWED', 'NOT_YET', '2026-09-25T00:00:00Z'),
  ], [], now);
  assert.deepEqual(items[0].reasons, ['TRANSFER_NOT_YET']);
});

test('answered questions, expired help signals and closed plans do not create pending obligations', () => {
  const items = teacherSupportQueue([plan('active'), plan('closed', 'closed')], [
    { id: 'old-help', plan_id: 'active', kind: 'NEEDS_HELP', created_at: '2026-09-01T00:00:00Z' },
    { id: 'future-help', plan_id: 'active', kind: 'NEEDS_HELP', created_at: '2026-09-27T00:00:00Z' },
  ], [check('closed-check', 'closed', 'SUBMITTED', null, '2026-09-25T00:00:00Z')], [
    question('answered', 'active', 'The teacher has responded.'),
  ], now);
  assert.deepEqual(items, []);
});
