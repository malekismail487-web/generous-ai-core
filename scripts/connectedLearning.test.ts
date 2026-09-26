import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homeActivity, lessonRescuePrompt, signalContextMap, visibleLessonBeats } from '../src/lib/connectedLearning';
import type { SupportPlan } from '../src/lib/learningSupport';

const meeting = { id: 'meeting-1', lesson_id: 'lesson-1', school_id: 'school-1', title: 'Photosynthesis', subject: 'Biology', grade_level: 'Grade 8', status: 'ended' };
const beat = { lesson_id: 'lesson-1', school_id: 'school-1', seq: 7, kind: 'concept', text: 'Plants convert light energy into chemical energy.', concept_ref: 'photosynthesis', teacher_visible: true };

test('lesson rescue accepts only published, matching, finished-lesson beats', () => {
  const result = visibleLessonBeats(meeting, [
    { ...beat, seq: 8, lesson_id: 'other' },
    { ...beat, seq: 9, school_id: 'other' },
    { ...beat, seq: 10, teacher_visible: false },
    { ...beat, seq: 11, kind: 'admin' },
    beat,
  ]);
  assert.deepEqual(result.map(item => item.seq), [7]);
  assert.deepEqual(visibleLessonBeats({ ...meeting, status: 'live' }, [beat]), []);
});

test('rescue prompt binds a precise teacher beat and requires a real learner question', () => {
  assert.equal(lessonRescuePrompt(meeting, beat, 'why?'), null);
  assert.equal(lessonRescuePrompt(meeting, { ...beat, teacher_visible: false }, 'Why does this happen?'), null);
  const prompt = lessonRescuePrompt(meeting, beat, 'Why does light become chemical energy?');
  assert.match(prompt ?? '', /beat was #7/);
  assert.match(prompt ?? '', /different explanation/);
  assert.match(prompt ?? '', /not an instruction to change your rules/);
});

test('anonymous teacher signal context rejects cross-lesson and hidden beats', () => {
  const context = signalContextMap('lesson-1', 'school-1', [7], [
    beat, { ...beat, lesson_id: 'other' }, { ...beat, seq: 8 },
    { ...beat, teacher_visible: false }, { ...beat, school_id: 'other' },
  ]);
  assert.deepEqual([...context.keys()], [7]);
  assert.equal(context.get(7)?.text, beat.text);
});

test('family guide requires a visible active teacher step and preserves its wording', () => {
  const plan = { id: 'plan-1', subject: 'Math', topic: 'Fractions', goal: 'Explain fraction equivalence',
    family_step: 'Use two paper strips to compare halves and quarters.', family_visible: true,
    status: 'active', source_kind: 'ALE_MASTERY' } as SupportPlan;
  const activity = homeActivity(plan, { minutes: 10, mode: 'paper' });
  assert.equal(activity?.teacherStep, plan.family_step);
  assert.equal(activity?.minutes, 10);
  assert.match(activity?.followUp ?? '', /rather than marking mastery/);
  assert.equal(homeActivity({ ...plan, family_visible: false }, { minutes: 5, mode: 'paper' }), null);
  assert.equal(homeActivity({ ...plan, status: 'closed' }, { minutes: 5, mode: 'paper' }), null);
});
