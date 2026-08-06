const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createAppServer } = require('./server.js');
const { createSyncService } = require('./server/sync-service.js');
const { createAiService } = require('./server/ai-service.js');

const TOKEN = 'route-test-token-long-enough-000';
const AUTH = { Authorization: 'Bearer ' + TOKEN };

function request(server, method, target, body, headers = {}) {
  const port = server.address().port;
  const data = body === undefined ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const outgoing = http.request({
      host: '127.0.0.1', port, method, path: target,
      headers: { ...(data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}), ...headers }
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    outgoing.on('error', reject);
    if (data) outgoing.write(data);
    outgoing.end();
  });
}

async function withSyncServer(run, options = {}) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ipmax-routes-'));
  const env = { IPMAX_SYNC_TOKEN: TOKEN, IPMAX_SYNC_DIR: dir, ...(options.env || {}) };
  const server = createAppServer({
    aiService: createAiService({ IPMAX_AI_PROVIDER: 'mock' }),
    syncService: createSyncService(env),
    ...options.serverOptions
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await run(server, dir); }
  finally {
    await new Promise(resolve => server.close(resolve));
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

function snapshot(state, updatedAt, deviceId) {
  return { snapshotVersion: 1, updatedAt, deviceId: deviceId || 'device-a', state };
}

test('sync status is public and reports the enabled backend', async () => {
  await withSyncServer(async server => {
    const result = await request(server, 'GET', '/api/sync/status');
    assert.equal(result.status, 200);
    const body = JSON.parse(result.body);
    assert.equal(body.enabled, true);
    assert.equal(body.hasSnapshot, false);
    assert.equal(result.headers['cache-control'], 'no-store');
    // Токен не должен утечь ни в каком виде.
    assert.ok(!result.body.includes(TOKEN));
    assert.equal(body.token, undefined);
  });
});

test('sync requires a bearer token', async () => {
  await withSyncServer(async server => {
    for (const headers of [{}, { Authorization: 'Bearer wrong-token-value-here-000000' }, { Authorization: 'Basic ' + TOKEN }]) {
      const pull = await request(server, 'GET', '/api/sync', undefined, headers);
      assert.equal(pull.status, 401, JSON.stringify(headers));
      const push = await request(server, 'POST', '/api/sync', snapshot({ theme: 'dark' }, 10), headers);
      assert.equal(push.status, 401);
    }
  });
});

test('push then pull round-trips progress over HTTP', async () => {
  await withSyncServer(async server => {
    const push = await request(server, 'POST', '/api/sync', snapshot({ qprog: { 1: { correct: 1, wrong: 0, lastSeen: 10 } } }, 1000), AUTH);
    assert.equal(push.status, 200);
    assert.deepEqual(JSON.parse(push.body).conflicts, []);

    const pull = await request(server, 'GET', '/api/sync', undefined, AUTH);
    assert.equal(pull.status, 200);
    const body = JSON.parse(pull.body);
    assert.deepEqual(Object.keys(body.snapshot.state.qprog), ['1']);
    assert.equal(body.snapshot.revision, 1);
  });
});

test('two devices exchange progress through the server', async () => {
  await withSyncServer(async server => {
    await request(server, 'POST', '/api/sync', snapshot({ qprog: { 1: { correct: 1, wrong: 0, lastSeen: 10 } }, study_progress: { w1d1: 'done' } }, 1000, 'phone'), AUTH);
    await request(server, 'POST', '/api/sync', snapshot({ qprog: { 2: { correct: 1, wrong: 0, lastSeen: 20 } }, study_progress: { w1d2: 'done' } }, 2000, 'laptop'), AUTH);
    const pull = await request(server, 'GET', '/api/sync', undefined, AUTH);
    const state = JSON.parse(pull.body).snapshot.state;
    assert.deepEqual(Object.keys(state.qprog).sort(), ['1', '2']);
    assert.deepEqual(state.study_progress, { w1d1: 'done', w1d2: 'done' });
  });
});

test('a snapshot larger than the AI limit is still accepted', async () => {
  // Общий лимит тела 16 КБ отклонял бы любой реальный синк.
  await withSyncServer(async server => {
    const history = Array.from({ length: 400 }, (_, i) => ({ date: '2026-08-' + String((i % 28) + 1).padStart(2, '0'), topic: 'Linux', correct: i % 2 === 0 }));
    const payload = snapshot({ history }, 1000);
    assert.ok(Buffer.byteLength(JSON.stringify(payload), 'utf8') > 16 * 1024, 'полезная нагрузка должна превышать лимит AI-роута');
    const push = await request(server, 'POST', '/api/sync', payload, AUTH);
    assert.equal(push.status, 200);
    assert.equal(JSON.parse(push.body).snapshot.state.history.length, 400);
  });
});

test('an oversized snapshot is rejected with 413', async () => {
  await withSyncServer(async server => {
    const history = Array.from({ length: 900 }, (_, i) => ({ date: 'd' + i, topic: 'Linux'.repeat(30), correct: true }));
    const push = await request(server, 'POST', '/api/sync', snapshot({ history }, 1000), AUTH);
    assert.equal(push.status, 413);
  }, { env: { IPMAX_SYNC_MAX_BYTES: '65536' } });
});

test('unknown keys and malformed bodies are rejected', async () => {
  await withSyncServer(async server => {
    const unknown = await request(server, 'POST', '/api/sync', snapshot({ evil: 1 }, 10), AUTH);
    assert.equal(unknown.status, 400);
    assert.equal(JSON.parse(unknown.body).code, 'INVALID_SNAPSHOT');

    const broken = await request(server, 'POST', '/api/sync', '{"state":', AUTH);
    assert.equal(broken.status, 400);

    const wrongType = await request(server, 'POST', '/api/sync', 'plain text', { ...AUTH, 'Content-Type': 'text/plain' });
    assert.equal(wrongType.status, 415);
  });
});

test('sync rejects methods other than GET and POST', async () => {
  await withSyncServer(async server => {
    for (const method of ['DELETE', 'PUT', 'PATCH']) {
      const result = await request(server, method, '/api/sync', undefined, AUTH);
      assert.equal(result.status, 405, method);
    }
    const status = await request(server, 'POST', '/api/sync/status', {}, AUTH);
    assert.equal(status.status, 405);
  });
});

test('sync is disabled without a token and reports it', async () => {
  await withSyncServer(async server => {
    const status = await request(server, 'GET', '/api/sync/status');
    assert.equal(JSON.parse(status.body).enabled, false);
    const pull = await request(server, 'GET', '/api/sync', undefined, AUTH);
    assert.equal(pull.status, 503);
    assert.equal(JSON.parse(pull.body).code, 'SYNC_NOT_CONFIGURED');
  }, { env: { IPMAX_SYNC_TOKEN: '' } });
});

test('the snapshot file and server module are never served as static assets', async () => {
  await withSyncServer(async server => {
    await request(server, 'POST', '/api/sync', snapshot({ theme: 'dark' }, 10), AUTH);
    for (const target of ['/data/snapshot.json', '/data/snapshot.backup.json', '/server/sync-service.js', '/.env']) {
      const result = await request(server, 'GET', target);
      assert.notEqual(result.status, 200, target + ' не должен отдаваться клиенту напрямую');
    }
  });
});

test('browser sync modules are served so the service worker can install', async () => {
  // sync-merge.js и sync-client.js входят в SHELL_ASSETS, который кешируется
  // атомарным addAll: один недоступный файл роняет установку sw целиком.
  await withSyncServer(async server => {
    for (const target of ['/sync-merge.js', '/sync-client.js']) {
      const result = await request(server, 'GET', target);
      assert.equal(result.status, 200, target + ' обязан отдаваться браузеру');
      assert.match(result.headers['content-type'], /javascript/);
    }
  });
});

test('rate limiting kicks in and does not block a different client', async () => {
  await withSyncServer(async server => {
    let limited = 0;
    for (let i = 0; i < 6; i++) {
      const result = await request(server, 'GET', '/api/sync', undefined, AUTH);
      if (result.status === 429) limited++;
    }
    assert.ok(limited > 0, 'лимит должен срабатывать');
    // Другой клиент за прокси не должен наследовать исчерпанную квоту.
    const other = await request(server, 'GET', '/api/sync', undefined, { ...AUTH, 'X-Forwarded-For': '203.0.113.9' });
    assert.equal(other.status, 200);
  }, { serverOptions: { syncRateLimit: 3, trustProxy: true } });
});

test('a forged X-Forwarded-For is ignored when no proxy is trusted', async () => {
  await withSyncServer(async server => {
    let limited = 0;
    for (let i = 0; i < 6; i++) {
      // Клиент меняет заголовок на каждом запросе, пытаясь обнулить счётчик.
      const result = await request(server, 'GET', '/api/sync', undefined, { ...AUTH, 'X-Forwarded-For': '198.51.100.' + i });
      if (result.status === 429) limited++;
    }
    assert.ok(limited > 0, 'без trustProxy подделанный заголовок не должен обходить лимит');
  }, { serverOptions: { syncRateLimit: 3, trustProxy: false } });
});

test('AI review still works alongside sync', async () => {
  await withSyncServer(async server => {
    const review = await request(server, 'POST', '/api/ai/review', {
      profile: { role: 'DevOps', level: 'Junior', daysUntilInterview: 10 },
      control: { attempted: 2, total: 3, accuracy: 50, averageSeconds: 20, topics: [{ topic: 'Linux', attempted: 2, accuracy: 50, averageSeconds: 20 }] }
    }, AUTH);
    assert.equal(review.status, 200);
    assert.match(JSON.parse(review.body).review.summary, /AI-разбор/);
  });
});
