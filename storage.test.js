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
