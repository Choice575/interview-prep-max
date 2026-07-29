const test = require('node:test');
const assert = require('node:assert/strict');
const storage = require('./storage.js');

function createAdapter() {
  const values = new Map();
  let failNextKey = null;
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => {
      if (key === failNextKey) { failNextKey = null; throw new Error('quota exceeded'); }
      values.set(key, value);
    },
    removeItem: key => values.delete(key),
    failNextWrite: key => { failNextKey = key; }
  };
}

test('round-trips namespaced data and ignores unknown keys', () => {
  const store = storage.create(createAdapter());
  assert.equal(store.set('qprog', { 1: { correct: 1 } }), true);
  assert.deepEqual(store.get('qprog', {}), { 1: { correct: 1 } });
  assert.equal(store.set('study_weekly_results', { 'weekly-w01': { passed: true } }), true);
  assert.deepEqual(store.get('study_weekly_results', {}), { 'weekly-w01': { passed: true } });
  assert.equal(store.set('unknown', 1), false);
  assert.equal(store.get('unknown', 'fallback'), 'fallback');
  assert.equal(store.remove('qprog'), true);
  assert.deepEqual(store.get('qprog', {}), {});
});

test('writes a validated storage batch', () => {
  const store = storage.create(createAdapter());
  const result = store.setMany({ qprog: { 1: { correct: 2 } }, history: [{ correct: true }] });
  assert.equal(result.ok, true);
  assert.deepEqual(store.get('qprog', {}), { 1: { correct: 2 } });
  assert.deepEqual(store.get('history', []), [{ correct: true }]);
});

test('rolls back every key when a batch write fails', () => {
  const adapter = createAdapter();
  const store = storage.create(adapter);
  store.set('qprog', { 1: { correct: 1 } });
  store.set('history', [{ correct: false }]);
  adapter.failNextWrite('ipmax_history');

  const result = store.setMany({ qprog: { 1: { correct: 99 } }, history: [{ correct: true }] });

  assert.equal(result.ok, false);
  assert.deepEqual(result.rollbackFailed, []);
  assert.deepEqual(store.get('qprog', {}), { 1: { correct: 1 } });
  assert.deepEqual(store.get('history', []), [{ correct: false }]);
});

test('backs up progress before an idempotent curriculum migration', () => {
  const adapter = createAdapter();
  const store = storage.create(adapter);
  const progress = { w3d3: { completed: true, score: 82 } };
  store.set('study_progress', progress);
  store.set('study_position', { week: 3, day: 3 });
  adapter.setItem('third_party_preference', JSON.stringify({ keep: true }));

  const first = store.migrate({ curriculumVersion: '5.1.0', now: () => Date.UTC(2026, 6, 25) });
  const backup = store.get('progress_backup', null);

  assert.equal(first.ok, true);
  assert.equal(first.migrated, true);
  assert.equal(store.get('storage_schema', 0), storage.CURRENT_STORAGE_SCHEMA);
  assert.equal(store.get('curriculum_version', ''), '5.1.0');
  assert.deepEqual(store.get('study_progress', {}), progress);
  assert.deepEqual(JSON.parse(backup.entries.study_progress), progress);
  assert.equal(backup.createdAt, '2026-07-25T00:00:00.000Z');
  assert.equal(adapter.getItem('third_party_preference'), JSON.stringify({ keep: true }));

  const second = store.migrate({ curriculumVersion: '5.1.0', now: () => Date.UTC(2030, 0, 1) });
  assert.equal(second.ok, true);
  assert.equal(second.migrated, false);
  assert.deepEqual(store.get('progress_backup', null), backup);
});

test('keeps progress and schema markers unchanged when migration fails', () => {
  const adapter = createAdapter();
  const store = storage.create(adapter);
  store.set('study_progress', { w1d1: { completed: true } });
  adapter.failNextWrite('ipmax_curriculum_version');

  const result = store.migrate({ curriculumVersion: '5.1.0' });

  assert.equal(result.ok, false);
  assert.deepEqual(store.get('study_progress', {}), { w1d1: { completed: true } });
  assert.equal(store.get('storage_schema', null), null);
  assert.equal(store.get('curriculum_version', null), null);
  assert.ok(store.get('progress_backup', null));
});

// Counts real setItem calls so a debounced write can be told apart from a
// per-keystroke one, and lets tests drive time instead of waiting.
function createCountingAdapter() {
  const adapter = createAdapter();
  const inner = adapter.setItem;
  adapter.writes = 0;
  adapter.setItem = (key, value) => { adapter.writes++; inner(key, value); };
  return adapter;
}

function createClock() {
  const timers = [];
  return {
    timers,
    setTimeout: (fn, ms) => { timers.push({ fn, ms, cancelled: false, done: false }); return timers.length; },
    clearTimeout: id => { if (timers[id - 1]) timers[id - 1].cancelled = true; },
    runPending() {
      timers.filter(timer => !timer.cancelled && !timer.done)
        .forEach(timer => { timer.done = true; timer.fn(); });
    }
  };
}

test('debounced set writes once after the quiet period, not per keystroke', () => {
  const adapter = createCountingAdapter();
  const clock = createClock();
  const store = storage.create(adapter, null, { setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });

  store.setDebounced('study_answers', { a: '1' }, 400);
  store.setDebounced('study_answers', { a: '12' }, 400);
  store.setDebounced('study_answers', { a: '123' }, 400);

  assert.equal(adapter.writes, 0, 'nothing may be written while typing continues');

  clock.runPending();

  assert.equal(adapter.writes, 1, 'exactly one write after the quiet period');
  assert.deepEqual(store.get('study_answers', null), { a: '123' }, 'last value wins');
});

test('flush forces a pending debounced write immediately', () => {
  const adapter = createCountingAdapter();
  const clock = createClock();
  const store = storage.create(adapter, null, { setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });

  store.setDebounced('study_answers', { note: 'draft' }, 400);
  assert.equal(adapter.writes, 0);

  assert.equal(store.flush('study_answers'), true);
  assert.equal(adapter.writes, 1);
  assert.deepEqual(store.get('study_answers', null), { note: 'draft' });

  assert.equal(store.flush('study_answers'), false, 'nothing pending any more');
  assert.equal(adapter.writes, 1);
});

test('flushAll writes every pending key', () => {
  const adapter = createCountingAdapter();
  const clock = createClock();
  const store = storage.create(adapter, null, { setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });

  store.setDebounced('study_answers', { a: 1 }, 400);
  store.setDebounced('custom', [{ id: 1 }], 400);

  assert.equal(adapter.writes, 0);
  assert.equal(store.flushAll(), 2);
  assert.equal(adapter.writes, 2);
  assert.deepEqual(store.get('study_answers', null), { a: 1 });
  assert.deepEqual(store.get('custom', null), [{ id: 1 }]);
  assert.equal(store.flushAll(), 0);
});

test('an immediate set cancels a pending debounced write for the same key', () => {
  const adapter = createCountingAdapter();
  const clock = createClock();
  const store = storage.create(adapter, null, { setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });

  store.setDebounced('study_answers', { stale: true }, 400);
  store.set('study_answers', { fresh: true });

  // Firing the stale timer must not resurrect the old value.
  clock.runPending();

  assert.deepEqual(store.get('study_answers', null), { fresh: true });
});

test('debounced set falls back to an immediate write without a timer host', () => {
  const adapter = createCountingAdapter();
  const store = storage.create(adapter, null, { setTimeout: null, clearTimeout: null });

  assert.equal(store.setDebounced('study_answers', { a: 1 }, 400), true);
  assert.equal(adapter.writes, 1, 'without setTimeout the write must not be lost');
  assert.deepEqual(store.get('study_answers', null), { a: 1 });
});

test('debounced set rejects unknown keys like the immediate setter', () => {
  const adapter = createCountingAdapter();
  const clock = createClock();
  const store = storage.create(adapter, null, { setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });

  assert.equal(store.setDebounced('unknown', 1, 400), false);
  clock.runPending();
  assert.equal(adapter.writes, 0);
});
