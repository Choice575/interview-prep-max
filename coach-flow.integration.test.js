const test = require('node:test');
const assert = require('node:assert/strict');
const progress = require('./progress.js');
const coach = require('./coach.js');

test('turns a failed diagnostic into an SRS item and a coach focus', () => {
  const now = Date.UTC(2026, 6, 21);
  const questions = [
    { id: 1, topic: 'Linux', level: 'Middle' },
    { id: 2, topic: 'Terraform', level: 'Middle' }
  ];
  const attempt = progress.recordQuestionAttempt({}, 1, { outcome: 'fail', source: 'diagnostic', now });
  const events = progress.appendSkillEvent([], { source: 'mock', topic: 'Linux', score: 1, possible: 5, at: now });
  const plan = coach.buildPlan({ questions, progress: attempt.progress, skillEvents: events, profile: { role: 'SRE', level: 'Middle' }, now });

  assert.equal(attempt.record.nextReviewAt, now + 86400000);
  assert.equal(plan.dueCount, 0);
  assert.equal(plan.focus.topic, 'Linux');

  const duePlan = coach.buildPlan({ questions, progress: attempt.progress, skillEvents: events, profile: { role: 'SRE', level: 'Middle' }, now: now + 86400000 });
  assert.equal(duePlan.dueCount, 1);
});
