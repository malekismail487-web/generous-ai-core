import assert from 'node:assert/strict';
import { assignmentScanText, auditAssignmentQuestions, parseGeneratedQuestions, type AuditableQuestion } from '../src/lib/assignmentQuality.ts';

const base: AuditableQuestion = {
  questionTitle: 'Which force pulls objects toward Earth?',
  optionA: 'Gravity',
  optionB: 'Magnetism',
  optionC: 'Friction',
  optionD: 'Buoyancy',
  correctAnswer: 'A',
};

const issueCodes = (questions: AuditableQuestion[]) => auditAssignmentQuestions(questions).issues.map((issue) => issue.code);
assert.equal(auditAssignmentQuestions([base]).publishable, true);
assert.deepEqual(issueCodes([]), ['NO_QUESTIONS']);
assert.ok(issueCodes([{ ...base, optionB: '  GRAVITY  ' }]).includes('DUPLICATE_OPTION'));
assert.ok(issueCodes([{ ...base, optionD: '' }]).includes('MISSING_OPTION'));
assert.ok(issueCodes([{ ...base, correctAnswer: 'E' }]).includes('INVALID_ANSWER'));
assert.ok(issueCodes([{ ...base, questionTitle: '' }]).includes('MISSING_STEM'));
assert.ok(issueCodes([base, { ...base, questionTitle: ' Which   force pulls objects toward Earth? ' }]).includes('DUPLICATE_STEM'));
assert.ok(issueCodes([{ ...base, questionTitle: 'Which force? Correct answer: A' }]).includes('EXPLICIT_ANSWER_LEAK'));
assert.ok(issueCodes(Array.from({ length: 8 }, (_, i) => ({ ...base, questionTitle: `Distinct question ${i}?` }))).includes('ANSWER_POSITION_SKEW'));
assert.equal(auditAssignmentQuestions(Array.from({ length: 8 }, (_, i) => ({ ...base, questionTitle: `Distinct question ${i}?` }))).publishable, true);
assert.ok(assignmentScanText([base]).includes('Which force pulls objects toward Earth? Gravity Magnetism Friction Buoyancy'));
assert.ok(!assignmentScanText([base]).includes('undefined'));
assert.deepEqual(parseGeneratedQuestions([base])[0], base);
assert.throws(() => parseGeneratedQuestions([{ ...base, optionD: undefined }]), /omitted required/);
assert.throws(() => parseGeneratedQuestions([{ ...base, correctAnswer: 'Z' }]), /invalid answer key/);
assert.throws(() => parseGeneratedQuestions([]), /invalid question list/);
console.log('Assignment quality: 16 adversarial checks passed.');
