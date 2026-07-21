const test = require('node:test');
const assert = require('node:assert/strict');
const storage = require('./storage.js');

function createAdapter() {
  const values = new Map();
  return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
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
