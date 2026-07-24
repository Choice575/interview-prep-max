const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createAppServer, MAX_BODY_BYTES } = require('./server.js');
const { createAiService } = require('./server/ai-service.js');

function request(server, method, path, body, headers = {}) {
  const port = server.address().port;
  const data = body === undefined ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const outgoing = http.request({ host: '127.0.0.1', port, method, path, headers: { ...(data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}), ...headers } }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    outgoing.on('error', reject);
    if (data) outgoing.write(data);
    outgoing.end();
  });
}

async function withServer(aiService, run) {
  const server = createAppServer({ aiService });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await run(server); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

const reviewPayload = {
  schemaVersion: 1,
  profile: { role: 'SRE', level: 'Middle', daysUntilInterview: 5 },
  control: { attempted: 2, total: 3, accuracy: 50, averageSeconds: 20, topics: [{ topic: 'Linux', attempted: 2, accuracy: 50, averageSeconds: 20 }] },
  focus: 'Linux'
};

test('serves AI status and a mock review without exposing configuration', async () => {
  await withServer(createAiService({ IPMAX_AI_PROVIDER: 'mock' }), async server => {
    const status = await request(server, 'GET', '/api/ai/status');
    assert.equal(status.status, 200);
    assert.deepEqual(JSON.parse(status.body), { enabled: true, provider: 'mock', model: null });
    assert.equal(status.headers['cache-control'], 'no-store');

    const result = await request(server, 'POST', '/api/ai/review', reviewPayload);
    assert.equal(result.status, 200);
    assert.match(JSON.parse(result.body).review.summary, /AI-разбор готов/);
  });
});

test('rejects missing answers, disabled providers and oversized bodies', async () => {
  await withServer(createAiService({}), async server => {
    const missing = await request(server, 'POST', '/api/ai/review', { control: { attempted: 0 } });
    assert.equal(missing.status, 400);

    const disabled = await request(server, 'POST', '/api/ai/review', reviewPayload);
    assert.equal(disabled.status, 503);
    assert.equal(JSON.parse(disabled.body).error, 'AI review is temporarily unavailable');

    const oversized = 'x'.repeat(MAX_BODY_BYTES + 1);
    const tooLarge = await request(server, 'POST', '/api/ai/review', oversized);
    assert.equal(tooLarge.status, 413);
  });
});

test('serves only browser assets and blocks server-side files', async () => {
  await withServer(createAiService({}), async server => {
    const appShell = await request(server, 'GET', '/index.html');
    assert.equal(appShell.status, 200);
    const serviceWorker = await request(server, 'GET', '/sw.js');
    assert.equal(serviceWorker.status, 200);

    for (const privatePath of ['/server.js', '/server/ai-service.js', '/.env', '/.git/config', '/package-lock.json']) {
      const result = await request(server, 'GET', privatePath);
      assert.equal(result.status, 403, privatePath);
    }
  });
});

test('adapts an OpenAI-compatible response without leaking the API key', async () => {
  let captured;
  const service = createAiService({
    IPMAX_AI_PROVIDER: 'openai-compatible',
    IPMAX_AI_ENDPOINT: 'https://provider.example/v1/chat/completions',
    IPMAX_AI_API_KEY: 'server-secret',
    IPMAX_AI_MODEL: 'test-model'
  }, {
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return { ok: true, json: async () => ({ choices: [{ message: { content: '{"summary":"Разбор","strengths":["Linux"],"gaps":["Terraform"],"nextSteps":["Повторить state"]}' } }] }) };
    }
  });
  const review = await service.review(reviewPayload);
  assert.equal(review.summary, 'Разбор');
  assert.equal(captured.options.headers.Authorization, 'Bearer server-secret');
  assert.doesNotMatch(captured.options.body, /server-secret/);
});
