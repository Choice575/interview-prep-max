const test = require('node:test');
const assert = require('node:assert/strict');
const dates = require('./date.js');

test('validates calendar date keys', () => {
  assert.equal(dates.isValidDateKey('2026-07-22'), true);
  assert.equal(dates.isValidDateKey('2026-02-29'), false);
  assert.equal(dates.isValidDateKey('2026-13-01'), false);
  assert.equal(dates.isValidDateKey('not-a-date'), false);
});

test('formats the local calendar date instead of the UTC date', () => {
  const localMidnight = new Date(2026, 6, 22, 0, 30).getTime();
  assert.equal(dates.localDateKey(localMidnight), '2026-07-22');
});

test('counts calendar days without daylight-saving drift', () => {
  const beforeFallback = new Date(2026, 9, 31, 12).getTime();
  assert.equal(dates.daysUntil('2026-11-02', beforeFallback), 2);
  assert.equal(dates.daysUntil('2026-10-30', beforeFallback), -1);
});
