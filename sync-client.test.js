const test = require('node:test');
const assert = require('node:assert/strict');
const SyncClient = require('./sync-client.js');
const Storage = require('./storage.js');

function memoryStorage(seed) {
  const map = new Map(Object.entries(seed || {}));
  const adapter = {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, value); },
    removeItem: key => { map.delete(key); }
  };
  return { storage: Storage.create(adapter, null, {}), map };
}

function fakeFetch(handler) {
  const calls = [];
  const impl = async (url, options) => {
    calls.push({ url, options: options || {} });
    return handler(url, options || {}, calls.length);
  };
  return { impl, calls };
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test('the sync token never leaves the device in a snapshot', () => {
  const { storage } = memoryStorage();
  storage.set('sync_token', 'super-secret-token-value-1234');
  storage.set('qprog', { 1: { correct: 1, wrong: 0, lastSeen: 5 } });
  const snapshot = SyncClient.buildSnapshot(storage, { now: () => 1000 });
  assert.equal('sync_token' in snapshot.state, false);
  assert.equal('sync_meta' in snapshot.state, false);
  assert.ok(!JSON.stringify(snapshot).includes('super-secret-token-value-1234'));
  assert.ok('qprog' in snapshot.state);
});

test('local-only keys are excluded from the snapshot', () => {
  const { storage } = memoryStorage();
  SyncClient.LOCAL_ONLY_KEYS.forEach(key => storage.set(key, 'x'));
  storage.set('daily', { '2026-08-01': 2 });
  const snapshot = SyncClient.buildSnapshot(storage, { now: () => 1 });
  assert.deepEqual(Object.keys(snapshot.state), ['daily']);
});

test('absent keys are omitted rather than sent as empty objects', () => {
  // Пустышка с нового устройства при слиянии затирала бы данные с рабочего.
  const { storage } = memoryStorage();
  storage.set('qprog', { 1: { correct: 1 } });
  const snapshot = SyncClient.buildSnapshot(storage, { now: () => 1 });
  assert.deepEqual(Object.keys(snapshot.state), ['qprog']);
  assert.equal('history' in snapshot.state, false);
});

test('a device id is generated once and then reused', () => {
  const { storage } = memoryStorage();
  const first = SyncClient.buildSnapshot(storage, { now: () => 1 }).deviceId;
  const second = SyncClient.buildSnapshot(storage, { now: () => 2 }).deviceId;
  assert.equal(first, second);
  assert.match(first, /^[a-z0-9]{10}$/);
});

test('applyState writes only known keys and ignores foreign ones', () => {
  const { storage } = memoryStorage();
  const result = SyncClient.applyState(storage, { qprog: { 2: { correct: 1 } }, evil: 'x', sync_token: 'leak' });
  assert.equal(result.ok, true);
  assert.equal(result.applied, 1);
  assert.deepEqual(storage.get('qprog', null), { 2: { correct: 1 } });
  assert.equal(storage.get('sync_token', null), null, 'токен из сети не должен перезаписывать локальный');
});

test('applyState flushes pending debounced writes first', () => {
  // Иначе отложенная запись «догонит» и перезатрёт применённый снимок.
  const timers = [];
  const map = new Map();
  const adapter = { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) };
  const storage = Storage.create(adapter, null, { setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout: () => {} });
  storage.setDebounced('study_answers', { draft: 'старый черновик' });
  assert.equal(storage.hasPending('study_answers'), true);
  SyncClient.applyState(storage, { qprog: { 1: { correct: 1 } } });
  assert.equal(storage.hasPending(), false, 'отложенные записи должны быть сброшены до применения снимка');
});

test('sync pushes local state and applies the merged result', async () => {
  const { storage } = memoryStorage();
  storage.set('sync_token', 'token-value-long-enough-for-test');
  storage.set('qprog', { 1: { correct: 1, wrong: 0, lastSeen: 10 } });
  const { impl, calls } = fakeFetch(() => jsonResponse(200, {
    snapshot: { snapshotVersion: 1, updatedAt: 2000, revision: 7, state: { qprog: { 1: { correct: 1, wrong: 0, lastSeen: 10 }, 2: { correct: 1, wrong: 0, lastSeen: 20 } } } },
    conflicts: []
  }));
  const client = SyncClient.create({ storage, fetchImpl: impl, now: () => 1500 });
  const result = await client.sync();

  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer token-value-long-enough-for-test');
  const sent = JSON.parse(calls[0].options.body);
  assert.equal(sent.updatedAt, 1500);
  assert.ok('qprog' in sent.state);

  assert.deepEqual(Object.keys(storage.get('qprog', {})).sort(), ['1', '2'], 'прогресс с другого устройства должен появиться локально');
  assert.equal(result.revision, 7);
  assert.equal(storage.get('sync_meta', {}).revision, 7);
  assert.equal(storage.get('sync_meta', {}).lastSyncAt, 1500);
});

test('sync surfaces reported conflicts', async () => {
  const { storage } = memoryStorage();
  storage.set('sync_token', 'token-value-long-enough-for-test');
  const { impl } = fakeFetch(() => jsonResponse(200, {
    snapshot: { snapshotVersion: 1, updatedAt: 10, revision: 2, state: { study_position: { week: 4, day: 1 } } },
    conflicts: ['study_position']
  }));
  const client = SyncClient.create({ storage, fetchImpl: impl, now: () => 10 });
  const result = await client.sync();
  assert.deepEqual(result.conflicts, ['study_position']);
  assert.deepEqual(storage.get('study_position', null), { week: 4, day: 1 });
});

test('sync refuses to run without a token', async () => {
  const { storage } = memoryStorage();
  const { impl, calls } = fakeFetch(() => jsonResponse(200, {}));
  const client = SyncClient.create({ storage, fetchImpl: impl });
  await assert.rejects(() => client.sync(), /укажите токен/i);
  assert.equal(calls.length, 0, 'без токена запрос вообще не должен уходить');
});

test('server errors are translated into readable messages', async () => {
  const cases = [
    [401, undefined, /неверный токен/i],
    [413, undefined, /слишком большой/i],
    [429, undefined, /слишком много запросов/i],
    [503, 'SYNC_NOT_CONFIGURED', /не настроена/i],
    [400, 'INVALID_SNAPSHOT', /отклонил данные/i]
  ];
  for (const [status, code, pattern] of cases) {
    const { storage } = memoryStorage();
    storage.set('sync_token', 'token-value-long-enough-for-test');
    const { impl } = fakeFetch(() => jsonResponse(status, { code }));
    const client = SyncClient.create({ storage, fetchImpl: impl });
    await assert.rejects(() => client.sync(), pattern, String(status));
  }
});

test('a malformed server snapshot does not corrupt local state', async () => {
  const { storage } = memoryStorage();
  storage.set('sync_token', 'token-value-long-enough-for-test');
  storage.set('qprog', { 1: { correct: 5, wrong: 0, lastSeen: 10 } });
  const { impl } = fakeFetch(() => jsonResponse(200, { snapshot: { state: 'nonsense' } }));
  const client = SyncClient.create({ storage, fetchImpl: impl });
  await assert.rejects(() => client.sync(), /некорректный снимок/i);
  assert.deepEqual(storage.get('qprog', null), { 1: { correct: 5, wrong: 0, lastSeen: 10 } }, 'локальный прогресс должен остаться нетронутым');
});

test('status reports an unreachable backend without throwing', async () => {
  const { storage } = memoryStorage();
  const impl = async () => { throw new Error('network down'); };
  const client = SyncClient.create({ storage, fetchImpl: impl });
  const status = await client.status();
  assert.equal(status.enabled, false);
  assert.equal(status.reachable, false);
});

test('status passes through the server response', async () => {
  const { storage } = memoryStorage();
  storage.set('sync_token', 'token-value-long-enough-for-test');
  const { impl, calls } = fakeFetch(() => jsonResponse(200, { enabled: true, hasSnapshot: true, revision: 3 }));
  const client = SyncClient.create({ storage, fetchImpl: impl });
  const status = await client.status();
  assert.equal(status.enabled, true);
  assert.equal(status.revision, 3);
  assert.equal(status.configured, true);
  assert.match(calls[0].url, /\/status$/);
  assert.equal(calls[0].options.headers, undefined, 'статус запрашивается без токена');
});

test('setToken stores and clears the token', () => {
  const { storage } = memoryStorage();
  const client = SyncClient.create({ storage, fetchImpl: async () => jsonResponse(200, {}) });
  assert.equal(client.configured(), false);
  client.setToken('  my-token-value-long-enough-00  ');
  assert.equal(client.token(), 'my-token-value-long-enough-00', 'токен должен сохраняться без пробелов');
  assert.equal(client.configured(), true);
  client.setToken('');
  assert.equal(client.configured(), false);
});

test('a timeout produces a clear message', async () => {
  const { storage } = memoryStorage();
  storage.set('sync_token', 'token-value-long-enough-for-test');
  const impl = async () => {
    const error = new Error('aborted');
    error.name = 'AbortError';
    throw error;
  };
  const client = SyncClient.create({ storage, fetchImpl: impl, timeoutMs: 5 });
  await assert.rejects(() => client.sync(), /не ответил вовремя/i);
});

test('a full round trip between two devices converges', async () => {
  // Общий «сервер» в памяти: проверяем, что после обмена оба устройства
  // видят одинаковый прогресс.
  const Merge = require('./sync-merge.js');
  let stored = { snapshotVersion: 1, updatedAt: 0, revision: 0, state: {} };
  const server = async (_url, options) => {
    if (options.method !== 'POST') return jsonResponse(200, { snapshot: stored });
    const incoming = JSON.parse(options.body);
    const merged = Merge.mergeSnapshots(incoming, stored);
    stored = { snapshotVersion: 1, updatedAt: merged.updatedAt, revision: stored.revision + 1, state: merged.state };
    return jsonResponse(200, { snapshot: stored, conflicts: merged.conflicts });
  };

  const phone = memoryStorage();
  phone.storage.set('sync_token', 'token-value-long-enough-for-test');
  phone.storage.set('qprog', { 1: { correct: 1, wrong: 0, lastSeen: 100 } });
  phone.storage.set('study_progress', { w1d1: 'done' });

  const laptop = memoryStorage();
  laptop.storage.set('sync_token', 'token-value-long-enough-for-test');
  laptop.storage.set('qprog', { 2: { correct: 1, wrong: 0, lastSeen: 200 } });
  laptop.storage.set('study_progress', { w1d2: 'done' });

  const phoneClient = SyncClient.create({ storage: phone.storage, fetchImpl: server, now: () => 1000 });
  const laptopClient = SyncClient.create({ storage: laptop.storage, fetchImpl: server, now: () => 2000 });

  await phoneClient.sync();
  await laptopClient.sync();
  await phoneClient.sync();

  assert.deepEqual(Object.keys(phone.storage.get('qprog', {})).sort(), ['1', '2']);
  assert.deepEqual(phone.storage.get('study_progress', {}), { w1d1: 'done', w1d2: 'done' });
  assert.deepEqual(laptop.storage.get('study_progress', {}), { w1d1: 'done', w1d2: 'done' });
  assert.deepEqual(phone.storage.get('qprog', {}), laptop.storage.get('qprog', {}), 'устройства должны сойтись к одному состоянию');
});
