const test = require('node:test');
const assert = require('node:assert/strict');
const progress = require('./progress.js');

test('uses one SRS schedule for pass, partial, and fail', () => {
  const now = Date.UTC(2026, 6, 21);
  let state = progress.recordQuestionAttempt({}, 1, { outcome: 'pass', now, source: 'exam', responseSeconds: 12 });
  assert.equal(state.record.interval, 1);
  assert.equal(state.record.nextReviewAt, now + 86400000);

  state = progress.recordQuestionAttempt(state.progress, 1, { outcome: 'pass', now: now + 86400000, source: 'blitz' });
  assert.equal(state.record.interval, 3);
  assert.equal(state.record.repetitions, 2);

  state = progress.recordQuestionAttempt(state.progress, 1, { outcome: 'partial', now: now + 2 * 86400000, source: 'freeform' });
  assert.equal(state.score, 0.5);
  assert.equal(state.record.repetitions, 0);
  assert.equal(state.record.interval, 1);
  assert.equal(state.record.correct, 2.5);
  assert.equal(state.record.wrong, 0.5);
});

test('keeps bounded, validated skill events', () => {
  const events = progress.appendSkillEvent([], { source: 'mock', topic: 'Linux', score: 4, possible: 5, durationSeconds: 61, at: 1 }, 2);
  const next = progress.appendSkillEvent(events, { source: 'code', topic: 'Terraform', score: 1, possible: 1, at: 2 }, 2);
  const bounded = progress.appendSkillEvent(next, { source: 'git', topic: 'Git', score: 0, possible: 1, at: 3 }, 2);
  assert.equal(bounded.length, 2);
  assert.equal(bounded[0].topic, 'Terraform');
  assert.equal(bounded[1].source, 'git');
  assert.equal(progress.isSkillEvent({ source: '', score: 1 }), false);
});
