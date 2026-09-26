import assert from 'node:assert/strict';
import { buildAssignmentResponseEvidence, parseResponseQuestions } from '../src/lib/assignmentResponseEvidence.ts';

const questions = parseResponseQuestions([{
  id: 'q1', questionTitle: 'Which force pulls objects toward Earth?',
  optionA: 'Gravity', optionB: 'Magnetism', optionC: 'Friction', optionD: 'Buoyancy', correctAnswer: 'A',
}]);
const submission = (id: string, student_id: string, content: string, submitted_at = '2026-09-26T00:00:00Z') => ({
  id, student_id, content, submitted_at,
});
const evidence = buildAssignmentResponseEvidence(questions, [
  submission('old', 'student-1', JSON.stringify({ answers: { q1: 'A' } }), '2026-09-25T00:00:00Z'),
  submission('s1', 'student-1', JSON.stringify({ answers: { q1: 'B' }, results: [{ questionId: 'q1', isCorrect: true }] })),
  submission('s2', 'student-2', JSON.stringify({ answers: { q1: 'B' } })),
  submission('s3', 'student-3', JSON.stringify({ answers: { q1: 'A' } })),
  submission('bad', 'student-4', '{broken-json'),
]);
assert.equal(evidence.breakdown[0].totalAttempts, 3);
assert.equal(evidence.breakdown[0].correctCount, 1);
assert.equal(evidence.breakdown[0].successRate, 33);
assert.equal(evidence.breakdown[0].selections.B, 2);
assert.equal(evidence.includedSubmissions, 3);
assert.equal(evidence.unreadableSubmissions, 1);
assert.equal(evidence.supersededSubmissions, 1);

const legacy = buildAssignmentResponseEvidence(questions, [submission('legacy', 'student-5', '["D"]')]);
assert.equal(legacy.breakdown[0].selections.D, 1);
assert.equal(legacy.breakdown[0].correctCount, 0);
assert.equal(legacy.breakdown[0].successRate, 0);

const empty = buildAssignmentResponseEvidence(questions, []);
assert.equal(empty.breakdown[0].successRate, null);
const unattributed = buildAssignmentResponseEvidence(questions, [submission('missing', 'student-6', JSON.stringify({ answers: { other: 'A' } }))]);
assert.equal(unattributed.unreadableSubmissions, 1);
assert.equal(unattributed.breakdown[0].successRate, null);
assert.throws(() => parseResponseQuestions([{ questionTitle: 'Missing options' }]), /unreadable question/);
assert.equal(parseResponseQuestions([{ question: 'Legacy?', options: ['a', 'b', 'c', 'd'], correct_answer: 'B' }])[0].questionTitle, 'Legacy?');
assert.deepEqual(parseResponseQuestions(null), []);
console.log('Assignment response evidence: 16 assertions passed.');
