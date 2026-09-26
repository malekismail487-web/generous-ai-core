import assert from 'node:assert/strict';
import {
  learningContext, learningDraftMessages, learningDraftTool, parseLearningDraft,
} from '../supabase/functions/_shared/learningDraftContract';

assert.deepEqual(learningContext(' Science ', ' Fractions '), { subject: 'Science', topic: 'Fractions' });
assert.equal(learningContext('X', 'Fractions'), null);
assert.equal(learningContext('Science', 'T'.repeat(181)), null);
assert.equal(learningContext('Science\u0000', 'Fractions'), null);

const plan = parseLearningDraft('support_plan', {
  goal: 'Explain equivalent fractions with a new example',
  learnerStep: 'Model two examples with fraction strips',
  familyStep: 'Find equal portions in a recipe at home',
});
assert.deepEqual(plan, {
  goal: 'Explain equivalent fractions with a new example',
  learnerStep: 'Model two examples with fraction strips',
  familyStep: 'Find equal portions in a recipe at home',
});
assert.equal(parseLearningDraft('support_plan', { goal: 'Good', learnerStep: 'Practice', familyStep: 'Home' }), null);
assert.equal(parseLearningDraft('support_plan', { goal: 'Valid goal', learnerStep: 'Valid step', familyStep: 3 }), null);
assert.equal(parseLearningDraft('transfer_check', { prompt: 'A new problem to solve', criteria: 'Explain reasoning' })?.prompt, 'A new problem to solve');
assert.equal(parseLearningDraft('transfer_check', { prompt: 'A new problem to solve', criteria: 'x' }), null);
assert.equal(parseLearningDraft('transfer_check', { prompt: 'A new problem to solve\u0001', criteria: 'Explain reasoning' }), null);
assert.equal(parseLearningDraft('transfer_check', []), null);

const tool = learningDraftTool('transfer_check');
assert.deepEqual(tool.parameters.required, ['prompt', 'criteria']);
assert.equal(tool.parameters.additionalProperties, false);
const messages = learningDraftMessages('transfer_check', { subject: 'Math', topic: 'Ratios', goal: 'Compare ratios' });
assert.match(messages[0].content, /untrusted curriculum data/);
assert.match(messages[0].content, /teacher must review/);
assert.match(messages[1].content, /Compare ratios/);
console.log('learning support draft contract: PASS');
