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
