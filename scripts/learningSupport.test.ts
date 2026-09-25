import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isAllowedSupportCheckin, makeLearningSupportProposal, suggestedMasteryTarget,
  summarizeSupport, type SupportCheckin, type SupportPlan,
} from '../src/lib/learningSupport.ts';

function plan(id: string, status: string, due_at: string | null): SupportPlan {
  return { id, status, due_at } as SupportPlan;
}
function checkin(plan_id: string, kind: string): SupportCheckin {
  return { plan_id, kind } as SupportCheckin;
}

test('support pulse counts only visible plan observations and never invents learning gains', () => {
  const pulse = summarizeSupport(
    [plan('a', 'active', '2026-09-01T00:00:00Z'), plan('b', 'review', null), plan('c', 'closed', null)],
    [checkin('a', 'PRACTICED'), checkin('a', 'NEEDS_HELP'), checkin('b', 'FAMILY_SUPPORTED'), checkin('hidden', 'NEEDS_HELP')],
    new Date('2026-09-25T00:00:00Z'),
  );
  assert.deepEqual(pulse, { active: 1, awaitingReview: 1, closed: 1, needingHelp: 1, practiced: 1, familySupported: 1, overdue: 1 });
});

test('role-specific check-ins fail closed', () => {
  assert.equal(isAllowedSupportCheckin('student', 'PRACTICED'), true);
  assert.equal(isAllowedSupportCheckin('student', 'NEEDS_HELP'), true);
  assert.equal(isAllowedSupportCheckin('family', 'FAMILY_SUPPORTED'), true);
  assert.equal(isAllowedSupportCheckin('family', 'PRACTICED'), false);
  assert.equal(isAllowedSupportCheckin('teacher', 'FAMILY_SUPPORTED'), false);
  assert.equal(isAllowedSupportCheckin('admin', 'NEEDS_HELP'), false);
});

test('ALE proposal carries provenance but no authority', () => {
  const proposal = makeLearningSupportProposal('school', 'student', 'Math', 'Fractions', 0.2);
  assert.equal(proposal.evidence.observedScore, 0.2);
  assert.deepEqual(proposal.requestedCapabilities, []);
  assert.equal(proposal.proposedGoal.includes('Fractions'), true);
  assert.equal(suggestedMasteryTarget(0.2), 0.7);
  assert.equal(suggestedMasteryTarget(0.9), 1);
});
