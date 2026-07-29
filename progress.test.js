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

test('prunes daily counters outside the retention window', () => {
  // Analytics only reads the last 14 days, so anything older is dead weight
  // that grows by one key every day the app is used.
  const now = Date.parse('2026-07-29T12:00:00Z');
  const daily = {
    '2026-07-29': 12,
    '2026-07-16': 4,
    '2026-07-15': 7,
    '2025-11-02': 3,
    '2024-01-01': 99
  };

  const pruned = progress.pruneDailyCounters(daily, now, 30);

  assert.deepEqual(Object.keys(pruned).sort(), ['2026-07-15', '2026-07-16', '2026-07-29']);
  assert.equal(pruned['2026-07-29'], 12);
  assert.equal(pruned['2025-11-02'], undefined);
  assert.equal(pruned['2024-01-01'], undefined);
});

test('keeps the retention boundary day and drops the one before it', () => {
  const now = Date.parse('2026-07-29T00:00:00Z');
  const daily = { '2026-07-01': 1, '2026-06-30': 1, '2026-06-29': 1 };

  // 30-day window from 2026-07-29 reaches back to 2026-06-30 inclusive.
  const pruned = progress.pruneDailyCounters(daily, now, 30);

  assert.equal(pruned['2026-07-01'], 1);
  assert.equal(pruned['2026-06-30'], 1);
  assert.equal(pruned['2026-06-29'], undefined);
});

test('daily pruning survives malformed input without throwing', () => {
  const now = Date.parse('2026-07-29T00:00:00Z');

  assert.deepEqual(progress.pruneDailyCounters(null, now), {});
  assert.deepEqual(progress.pruneDailyCounters(undefined, now), {});
  assert.deepEqual(progress.pruneDailyCounters('nope', now), {});
  assert.deepEqual(progress.pruneDailyCounters([], now), {});

  const messy = { 'not-a-date': 5, '2026-07-29': 'many', '2026-07-28': -3, '': 1, '2026-07-27': 2 };
  const pruned = progress.pruneDailyCounters(messy, now, 30);

  assert.equal(pruned['not-a-date'], undefined, 'invalid keys must be dropped');
  assert.equal(pruned[''], undefined);
  assert.equal(pruned['2026-07-29'], undefined, 'non-numeric counts must be dropped');
  assert.equal(pruned['2026-07-28'], undefined, 'negative counts must be dropped');
  assert.equal(pruned['2026-07-27'], 2);
});

test('daily pruning reports whether anything changed', () => {
  const now = Date.parse('2026-07-29T00:00:00Z');
  const clean = { '2026-07-29': 1, '2026-07-28': 2 };

  assert.equal(progress.dailyNeedsPruning(clean, now, 30), false);
  assert.equal(progress.dailyNeedsPruning({ ...clean, '2020-01-01': 1 }, now, 30), true);
  assert.equal(progress.dailyNeedsPruning(null, now, 30), false);
});
