import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LearningTransferPanel } from '../src/components/learning/LearningTransferPanel';
import type { SupportPlan } from '../src/lib/learningSupport';
import {
  transferCaseState, transferSchoolSummary, validTransferPrompt, validTransferResponse, validTransferReview,
  type TransferBrief, type TransferCheck,
} from '../src/lib/learningTransfer';

const check = (id: string, plan_id: string, status: string, verdict: string | null, created_at: string): TransferBrief => ({
  id, plan_id, status, verdict, created_at,
});

test('one reviewed transfer response is not conflated with mastery or causality', () => {
  const early = check('early', 'plan-1', 'REVIEWED', 'NOT_YET', '2026-09-20T00:00:00Z');
  const later = check('later', 'plan-1', 'REVIEWED', 'DEMONSTRATED', '2026-09-26T00:00:00Z');
  assert.equal(transferCaseState([]), 'NOT_REQUESTED');
  assert.equal(transferCaseState([check('open', 'plan-1', 'OPEN', null, '2026-09-26T00:00:00Z')]), 'AWAITING_LEARNER');
  assert.equal(transferCaseState([check('sent', 'plan-1', 'SUBMITTED', null, '2026-09-26T00:00:00Z')]), 'AWAITING_TEACHER');
  assert.equal(transferCaseState([early, later]), 'DEMONSTRATED_ON_ONE_CHECK');
  assert.equal(transferCaseState([early]), 'NOT_YET_DEMONSTRATED');
  assert.equal(transferCaseState([check('unclear', 'plan-1', 'REVIEWED', 'INCONCLUSIVE', '2026-09-26T00:00:00Z')]), 'INCONCLUSIVE');
  const summary = transferSchoolSummary([early, later, check('open', 'plan-2', 'OPEN', null, '2026-09-26T00:00:00Z')]);
  assert.equal(summary.plansWithChecks, 2);
  assert.equal(summary.demonstratedOnOneCheck, 1);
  assert.equal(summary.awaitingLearner, 1);
});

test('transfer question, response and review require substance and bounded size', () => {
  assert.equal(validTransferPrompt('Apply fractions to a new real-world example.', 'A reasoned explanation'), true);
  assert.equal(validTransferPrompt('Short?', 'A reasoned explanation'), false);
  assert.equal(validTransferResponse('I compared two equal groups before simplifying.'), true);
  assert.equal(validTransferResponse('yes'), false);
  assert.equal(validTransferReview('DEMONSTRATED', 'The learner justified the new example independently.'), true);
  assert.equal(validTransferReview('MASTERED', 'The learner justified the new example independently.'), false);
  assert.equal(validTransferReview('NOT_YET', 'Too short'), false);
});

test('database transfer contract binds identities and permits only one-way role-scoped transitions', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20260926000000_learning_support_transfer_checks.sql', import.meta.url), 'utf8');
  for (const invariant of [
    'ENABLE ROW LEVEL SECURITY',
    'NEW.school_id := source_plan.school_id',
    'NEW.student_id := source_plan.student_id',
    'NEW.teacher_id := source_plan.teacher_id',
    "WHERE status <> 'REVIEWED'",
    "OLD.status = 'OPEN' AND NEW.status = 'SUBMITTED'",
    "OLD.status = 'SUBMITTED' AND NEW.status = 'REVIEWED'",
    'transfer_check_identity_immutable',
    'transfer_check_transition_forbidden',
    'student_id = auth.uid()',
    'teacher_id = auth.uid()',
  ]) assert.ok(sql.includes(invariant), `Missing SQL invariant: ${invariant}`);
  assert.ok(!/FOR DELETE TO authenticated/.test(sql));
});

test('transfer interface shows action only to the appropriate role', () => {
  const plan = { id: 'plan-1', status: 'active' } as SupportPlan;
  const open = {
    id: 'check-1', plan_id: 'plan-1', status: 'OPEN', verdict: null,
    created_at: '2026-09-26T00:00:00Z', prompt: 'Apply fractions to a new real-world example.',
    success_criteria: 'Explain why two ratios are equivalent.', student_response: null,
    teacher_feedback: null,
  } as TransferCheck;
  const handlers = {
    onCreate: async () => true,
    onSubmit: async () => true,
    onReview: async () => true,
  };
  const view = (role: 'student' | 'teacher', checks: TransferCheck[]) => renderToStaticMarkup(createElement(LearningTransferPanel, {
    plan, checks, role, arabic: false, saving: false, ...handlers,
  }));
  const studentOpen = view('student', [open]);
  const teacherOpen = view('teacher', [open]);
  assert.match(studentOpen, /Submit to teacher/);
  assert.doesNotMatch(studentOpen, /Create a transfer check/);
  assert.doesNotMatch(teacherOpen, /Submit to teacher/);
  assert.match(teacherOpen, /Waiting for the learner/);
  const submitted = { ...open, status: 'SUBMITTED', student_response: 'I can compare two equal groups by scaling both sides.' };
  assert.match(view('teacher', [submitted]), /Record review/);
  assert.doesNotMatch(view('student', [submitted]), /Record review/);
});
