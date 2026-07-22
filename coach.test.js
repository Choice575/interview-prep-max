const test = require('node:test');
const assert = require('node:assert/strict');
const coach = require('./coach.js');

const questions = [
  { id: 1, topic: 'Linux', level: 'Middle' },
  { id: 2, topic: 'Linux', level: 'Middle' },
  { id: 3, topic: 'Terraform', level: 'Middle' },
  { id: 4, topic: 'Cloud', level: 'Middle' }
];

test('prioritizes a weak role-relevant topic', () => {
  const plan = coach.buildPlan({
    questions,
    progress: { 1: { correct: 0, wrong: 2 }, 2: { correct: 1, wrong: 1 }, 3: { correct: 3, wrong: 0 } },
    profile: { role: 'SRE', level: 'Middle' }, now: Date.UTC(2026, 6, 21)
  });
  assert.equal(plan.focus.topic, 'Linux');
  assert.equal(plan.roleLabel, 'SRE');
  assert.equal(plan.sessionSize, 10);
});

test('increases session volume before the interview and counts repetitions', () => {
  const localNoon = new Date(2026, 6, 21, 12).getTime();
  const plan = coach.buildPlan({
    questions,
    progress: { 1: { correct: 0, wrong: 1, nextReviewAt: Date.UTC(2026, 6, 20) } },
    profile: { role: 'Cloud', level: 'Senior', date: '2026-07-25' }, now: localNoon
  });
  assert.equal(plan.daysUntil, 4);
  assert.equal(plan.sessionSize, 20);
  assert.equal(plan.dueCount, 1);
  assert.equal(plan.targetAccuracy, 80);
});

test('ignores malformed dates', () => {
  assert.equal(coach.getDaysUntil('not-a-date', Date.UTC(2026, 6, 21)), null);
  assert.equal(coach.getDaysUntil('2026-02-30', Date.UTC(2026, 6, 21)), null);
});

test('keeps coverage within a percentage range', () => {
  const plan = coach.buildPlan({
    questions: Array.from({ length: 13 }, (_, index) => ({ id: index + 1, topic: 'Linux', level: 'Middle' })),
    progress: Object.fromEntries(Array.from({ length: 13 }, (_, index) => [index + 1, { correct: 1, wrong: 0 }])),
    profile: { role: 'SRE', level: 'Middle' }, now: Date.UTC(2026, 6, 21)
  });
  assert.equal(plan.topicStats.find(stat => stat.topic === 'Linux').coverage, 100);
});

test('includes practical trainer signals and can recommend a trainer-only skill', () => {
  const plan = coach.buildPlan({
    questions: [{ id: 1, topic: 'Linux', level: 'Middle' }],
    progress: { 1: { correct: 1, wrong: 0 } },
    skillEvents: [{ source: 'git', topic: 'Git', score: 1, possible: 1 }],
    profile: { role: 'Platform', level: 'Middle' }, now: Date.UTC(2026, 6, 21)
  });
  const git = plan.topicStats.find(stat => stat.topic === 'Git');
  assert.equal(git.practiceScore, 100);
  assert.deepEqual(git.action, { type: 'trainer', page: 'git' });
});
