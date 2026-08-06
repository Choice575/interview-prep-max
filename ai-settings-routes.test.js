const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createAppServer } = require('./server.js');
const { createAiSettingsStore } = require('./server/ai-settings.js');
const { createAiService } = require('./server/ai-service.js');

const ADMIN = 'admin-token-long-enough-for-tests';
const AUTH = { Authorization: 'Bearer ' + ADMIN };
const SYNC = 'sync-token-long-enough-for-tests';
const REVIEW_AUTH = { Authorization: 'Bearer ' + SYNC };
const SECRET = '«redacted:sk-…»';

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

async function withServer(run, options = {}) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ipmax-set-routes-'));
  const env = { IPMAX_ADMIN_TOKEN: ADMIN, IPMAX_SYNC_TOKEN: SYNC, IPMAX_AI_SETTINGS_DIR: dir, ...(options.env || {}) };
  const aiSettings = createAiSettingsStore(env);
  const server = createAppServer({
    env,
    aiSettings,
    // Сервис получает тот же store, что и роуты: так проверяется, что правка
    // настроек применяется к самому разбору, а не только к файлу.
    aiService: createAiService(env, { settingsStore: aiSettings, fetchImpl: options.fetchImpl }),
    ...options.serverOptions
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await run(server, dir, aiSettings); }
  finally {
    await new Promise(resolve => server.close(resolve));
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

function validPayload(overrides) {
  return {
    provider: 'openai-compatible',
    baseUrl: 'https://anymodel.org/v1',
    model: 'cc/claude-opus-5',
    apiKey: SECRET,
    temperature: 0.3,
    maxTokens: 900,
    timeoutMs: 45000,
    ...(overrides || {})
  };
}

test('admin status is public so the UI knows whether settings can be opened', async () => {
  await withServer(async server => {
    const result = await request(server, 'GET', '/api/admin/status');
    assert.equal(result.status, 200);
    assert.deepEqual(JSON.parse(result.body), { enabled: true });
    assert.ok(!result.body.includes(ADMIN), 'токен не должен попадать в ответ');
  });
});

test('admin status reports disabled when no token is configured', async () => {
  await withServer(async server => {
    assert.deepEqual(JSON.parse((await request(server, 'GET', '/api/admin/status')).body), { enabled: false });
    const denied = await request(server, 'GET', '/api/ai/settings', undefined, AUTH);
    assert.equal(denied.status, 503);
    assert.equal(JSON.parse(denied.body).code, 'ADMIN_NOT_CONFIGURED');
  }, { env: { IPMAX_ADMIN_TOKEN: '' } });
});

test('settings require the admin token', async () => {
  await withServer(async server => {
    for (const headers of [{}, { Authorization: 'Bearer wrong-token-value-padding-000' }, { Authorization: 'Basic ' + ADMIN }]) {
      assert.equal((await request(server, 'GET', '/api/ai/settings', undefined, headers)).status, 401);
      assert.equal((await request(server, 'POST', '/api/ai/settings', validPayload(), headers)).status, 401);
      assert.equal((await request(server, 'DELETE', '/api/ai/settings', undefined, headers)).status, 401);
    }
  });
});

test('the sync token does not grant access to AI settings', async () => {
  // Иначе одна утечка отдавала бы и прогресс, и ключ провайдера.
  await withServer(async server => {
    const result = await request(server, 'GET', '/api/ai/settings', undefined, { Authorization: 'Bearer sync-token-value-long-enough-1' });
    assert.equal(result.status, 401);
  }, { env: { IPMAX_SYNC_TOKEN: 'sync-token-value-long-enough-1' } });
});

test('saving settings never echoes the API key back', async () => {
  await withServer(async server => {
    const saved = await request(server, 'POST', '/api/ai/settings', validPayload(), AUTH);
    assert.equal(saved.status, 200);
    assert.ok(!saved.body.includes(SECRET), 'ключ не должен возвращаться клиенту');
    assert.equal(JSON.parse(saved.body).settings.hasKey, true);

    const read = await request(server, 'GET', '/api/ai/settings', undefined, AUTH);
    assert.ok(!read.body.includes(SECRET));
    assert.equal(JSON.parse(read.body).settings.model, 'cc/claude-opus-5');
  });
});

test('the mock review does not claim to be a local one', async () => {
  // buildLocalReview ставит source:'local'; mock наследовал его и отдавал
  // клиенту противоречивый ответ.
  await withServer(async server => {
    await request(server, 'POST', '/api/ai/settings', { provider: 'mock' }, AUTH);
    const result = await request(server, 'POST', '/api/ai/review', {
      profile: { role: 'DevOps', level: 'Junior' },
      control: { attempted: 1, total: 1, accuracy: 100, averageSeconds: 10, topics: [{ topic: 'Linux', attempted: 1, accuracy: 100, averageSeconds: 10 }] }
    }, REVIEW_AUTH);
    assert.equal(result.status, 200);
    const review = JSON.parse(result.body).review || JSON.parse(result.body);
    assert.equal(review.source, 'mock');
  });
});

test('settings saved through the API take effect without a restart', async () => {
  // Главное свойство: createAiService раньше читал окружение один раз при
  // старте, поэтому настройки из UI требовали бы перезапуска сервера.
  await withServer(async server => {
    const before = JSON.parse((await request(server, 'GET', '/api/ai/status')).body);
    assert.equal(before.enabled, false, 'до настройки AI выключен');

    await request(server, 'POST', '/api/ai/settings', { provider: 'mock' }, AUTH);

    const after = JSON.parse((await request(server, 'GET', '/api/ai/status')).body);
    assert.equal(after.enabled, true, 'статус должен измениться без рестарта');
    assert.equal(after.provider, 'mock');

    const review = await request(server, 'POST', '/api/ai/review', {
      profile: { role: 'DevOps', level: 'Junior' },
      control: { attempted: 2, total: 3, accuracy: 50, averageSeconds: 20, topics: [{ topic: 'Linux', attempted: 2, accuracy: 50, averageSeconds: 20 }] }
    }, REVIEW_AUTH);
    assert.equal(review.status, 200, 'разбор должен заработать сразу после сохранения настроек');
  });
});

test('temperature and max_tokens from settings reach the provider request', async () => {
  const seen = [];
  await withServer(async server => {
    await request(server, 'POST', '/api/ai/settings', validPayload({ temperature: 0.7, maxTokens: 1500 }), AUTH);
    const review = await request(server, 'POST', '/api/ai/review', {
      profile: { role: 'DevOps', level: 'Junior' },
      control: { attempted: 1, total: 1, accuracy: 100, averageSeconds: 10, topics: [{ topic: 'Linux', attempted: 1, accuracy: 100, averageSeconds: 10 }] }
    }, REVIEW_AUTH);
    assert.equal(review.status, 200);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].body.temperature, 0.7, 'ранее temperature была зашита как 0.2');
    assert.equal(seen[0].body.max_tokens, 1500, 'ранее max_tokens была зашита как 700');
    assert.equal(seen[0].url, 'https://anymodel.org/v1/chat/completions');
    assert.equal(seen[0].auth, 'Bearer ' + SECRET, 'ключ уходит провайдеру, но не клиенту');
  }, {
    fetchImpl: async (url, options) => {
      seen.push({ url, body: JSON.parse(options.body), auth: options.headers.Authorization });
      return {
        ok: true, status: 200,
        json: async () => ({ choices: [{ message: { content: JSON.stringify({ summary: 'Готово.', strengths: [], gaps: [], nextSteps: ['Шаг'], caution: '' }) } }] })
      };
    }
  });
});

test('invalid settings are rejected with a readable message', async () => {
  await withServer(async server => {
    const cases = [
      [{ provider: 'openai-compatible', baseUrl: 'http://provider.example/v1', model: 'm', apiKey: 'k' }, /https/i],
      [{ provider: 'openai-compatible', baseUrl: 'https://x/v1' }, /модель/i],
      [{ provider: 'nonsense' }, /провайдер/i],
      // Валидный JSON, но не объект: доходит до валидатора настроек.
      ['42', /JSON-объектом/i],
      ['["a"]', /JSON-объектом/i]
    ];
    for (const [payload, pattern] of cases) {
      const result = await request(server, 'POST', '/api/ai/settings', payload, AUTH);
      assert.equal(result.status, 400, JSON.stringify(payload));
      assert.match(JSON.parse(result.body).error, pattern);
    }

    // Нераспарсиваемое тело — это уже уровень парсера, другое сообщение.
    const broken = await request(server, 'POST', '/api/ai/settings', 'plain string', AUTH);
    assert.equal(broken.status, 400);
    assert.match(JSON.parse(broken.body).error, /invalid JSON/i);
  });
});

test('DELETE resets settings back to the environment defaults', async () => {
  await withServer(async server => {
    await request(server, 'POST', '/api/ai/settings', validPayload({ model: 'ui-model' }), AUTH);
    assert.equal(JSON.parse((await request(server, 'GET', '/api/ai/settings', undefined, AUTH)).body).settings.model, 'ui-model');

    const cleared = await request(server, 'DELETE', '/api/ai/settings', undefined, AUTH);
    assert.equal(cleared.status, 200);
    assert.equal(JSON.parse(cleared.body).settings.provider, 'mock', 'должен вернуться провайдер из окружения');
  }, { env: { IPMAX_AI_PROVIDER: 'mock' } });
});

test('unsupported methods are rejected', async () => {
  await withServer(async server => {
    for (const method of ['PUT', 'PATCH']) {
      assert.equal((await request(server, method, '/api/ai/settings', undefined, AUTH)).status, 405, method);
    }
    assert.equal((await request(server, 'POST', '/api/admin/status', {}, AUTH)).status, 405);
  });
});

test('the settings file is never served as a static asset', async () => {
  await withServer(async server => {
    await request(server, 'POST', '/api/ai/settings', validPayload(), AUTH);
    for (const target of ['/data/ai-settings.json', '/server/ai-settings.js', '/server/auth.js']) {
      const result = await request(server, 'GET', target);
      assert.notEqual(result.status, 200, target);
    }
  });
});

test('settings responses are not cached', async () => {
  await withServer(async server => {
    const result = await request(server, 'GET', '/api/ai/settings', undefined, AUTH);
    assert.equal(result.headers['cache-control'], 'no-store', 'иначе прокси может сохранить конфигурацию');
  });
});
