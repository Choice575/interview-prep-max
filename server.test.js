const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createAppServer, MAX_BODY_BYTES, MAX_AI_BODY_BYTES } = require('./server.js');
const { createAiService } = require('./server/ai-service.js');

const SYNC_TOKEN = 'test-sync-token-at-least-24-characters';
const AI_AUTH = { Authorization: 'Bearer ' + SYNC_TOKEN };

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

async function withServer(aiService, run, options = {}) {
  const server = createAppServer({
    ...options,
    aiService,
    env: { IPMAX_SYNC_TOKEN: SYNC_TOKEN, ...(options.env || {}) }
  });
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

const interviewPayload = {
  schemaVersion: 1,
  kind: 'systemDesign',
  item: {
    id: 'sd-ci-001', topic: 'CI/CD', level: 'Middle', title: 'Конвейер',
    context: 'Сервис в контейнере', task: 'Опишите выпуск',
    constraints: ['Откат до 15 минут'], expectedPoints: ['Версионные образы'],
    tradeoffs: ['Ручное подтверждение замедляет выпуск'],
    rubric: ['Назван способ отката', 'Секреты защищены']
  },
  answer: 'Соберу версионный образ, сохраню секреты вне репозитория и откатываю по предыдущей метке.',
  followUpTurn: 0
};

test('serves AI status and a mock review without exposing configuration', async () => {
  await withServer(createAiService({ IPMAX_AI_PROVIDER: 'mock' }), async server => {
    const status = await request(server, 'GET', '/api/ai/status');
    assert.equal(status.status, 200);
    assert.deepEqual(JSON.parse(status.body), { enabled: true, provider: 'mock', model: null });
    assert.equal(status.headers['cache-control'], 'no-store');

    const result = await request(server, 'POST', '/api/ai/review', reviewPayload, AI_AUTH);
    assert.equal(result.status, 200);
    assert.match(JSON.parse(result.body).review.summary, /AI-разбор готов/);
  });
});

test('rejects missing answers, disabled providers and malformed JSON', async () => {
  await withServer(createAiService({}), async server => {
    const missing = await request(server, 'POST', '/api/ai/review', { control: { attempted: 0 } }, AI_AUTH);
    assert.equal(missing.status, 400);

    const disabled = await request(server, 'POST', '/api/ai/review', reviewPayload, AI_AUTH);
    assert.equal(disabled.status, 503);
    assert.equal(JSON.parse(disabled.body).error, 'AI review is temporarily unavailable');

    const malformed = 'x'.repeat(MAX_BODY_BYTES + 1);
    const invalid = await request(server, 'POST', '/api/ai/review', malformed, AI_AUTH);
    assert.equal(invalid.status, 400);
    assert.match(JSON.parse(invalid.body).error, /invalid JSON/i);
  });
});

test('accepts a detailed AI payload above the legacy limit but rejects more than 64 KiB', async () => {
  let received = null;
  const service = {
    status: () => ({ enabled: true, provider: 'mock', model: null }),
    review: async payload => { received = payload; return { summary: 'ok', nextSteps: ['ok'] }; }
  };
  await withServer(service, async server => {
    const detailed = { control: { attempted: 1 }, evidence: 'x'.repeat(MAX_BODY_BYTES + 1024) };
    const accepted = await request(server, 'POST', '/api/ai/review', detailed, AI_AUTH);
    assert.equal(accepted.status, 200);
    assert.equal(received.evidence.length, MAX_BODY_BYTES + 1024);

    const oversized = { control: { attempted: 1 }, evidence: 'x'.repeat(MAX_AI_BODY_BYTES + 1) };
    const rejected = await request(server, 'POST', '/api/ai/review', oversized, AI_AUTH);
    assert.equal(rejected.status, 413);
  });
});

test('protects AI review with the sync token before consuming the rate limit', async () => {
  await withServer(createAiService({ IPMAX_AI_PROVIDER: 'mock' }), async server => {
    const missing = await request(server, 'POST', '/api/ai/review', reviewPayload);
    assert.equal(missing.status, 401);
    assert.equal(JSON.parse(missing.body).code, 'SYNC_UNAUTHORIZED');

    for (let index = 0; index < 3; index++) {
      const wrong = await request(server, 'POST', '/api/ai/review', reviewPayload, {
        Authorization: 'Bearer wrong-token-' + index
      });
      assert.equal(wrong.status, 401, 'неверный токен не должен доходить до AI rate limiter');
    }

    const owner = await request(server, 'POST', '/api/ai/review', reviewPayload, AI_AUTH);
    assert.equal(owner.status, 200, 'чужие запросы не должны заблокировать владельца');

    const limited = await request(server, 'POST', '/api/ai/review', reviewPayload, AI_AUTH);
    assert.equal(limited.status, 429, 'валидные AI-запросы всё равно ограничиваются');
  }, { rateLimit: 1 });
});

test('protects interview evaluation with the sync token and returns a normalised mock result', async () => {
  await withServer(createAiService({ IPMAX_AI_PROVIDER: 'mock' }), async server => {
    const missing = await request(server, 'POST', '/api/ai/interview', interviewPayload);
    assert.equal(missing.status, 401);
    assert.equal(JSON.parse(missing.body).code, 'SYNC_UNAUTHORIZED');

    const result = await request(server, 'POST', '/api/ai/interview', interviewPayload, AI_AUTH);
    assert.equal(result.status, 200);
    const evaluation = JSON.parse(result.body).evaluation;
    assert.equal(evaluation.source, 'mock');
    assert.equal(evaluation.rubric[0].criterion, 'Назван способ отката');
    assert.equal(Number.isFinite(evaluation.dimensions.correctness.score), true);
    assert.match(evaluation.dimensions.correctness.feedback, /тестов/i);
  }, { rateLimit: 1 });
});

test('serves only browser assets and blocks server-side files', async () => {
  await withServer(createAiService({}), async server => {
    const appShell = await request(server, 'GET', '/index.html');
    assert.equal(appShell.status, 200);
    const serviceWorker = await request(server, 'GET', '/sw.js');
    assert.equal(serviceWorker.status, 200);
    const progressIo = await request(server, 'GET', '/progress-io.js');
    assert.equal(progressIo.status, 200);
    const analyticsUi = await request(server, 'GET', '/analytics-ui.js');
    assert.equal(analyticsUi.status, 200);
    const homeUi = await request(server, 'GET', '/home-ui.js');
    assert.equal(homeUi.status, 200);

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

test('asks the provider for a strict diagnostic v2 review when question evidence is present', async () => {
  let captured;
  const service = createAiService({
    IPMAX_AI_PROVIDER: 'openai-compatible',
    IPMAX_AI_ENDPOINT: 'https://provider.example/v1/chat/completions',
    IPMAX_AI_API_KEY: 'server-secret',
    IPMAX_AI_MODEL: 'test-model'
  }, {
    fetchImpl: async (_url, options) => {
      captured = JSON.parse(options.body);
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({
        schemaVersion: 2,
        verdict: { levelEstimate: 'Middle-', readiness: 58, summary: 'Путаете probes.' },
        diagnostics: [{ concept: 'Probes', severity: 'high', problemType: 'concept_confusion', evidence: ['Выбран liveness'], explanation: 'Readiness управляет endpoints.', confidence: 0.9 }],
        actionPlan: [{ priority: 1, task: 'Сравнить probes', practice: '5 сценариев', successCriterion: '4/5', page: 'exam', topic: 'Kubernetes' }],
        studyPlan: [{ day: 1, title: 'Probes', actions: ['Повторить'], successCriterion: 'Объяснить' }],
        retest: { topics: ['Kubernetes'], categories: ['scenario'], levels: ['Middle'], size: 5, successCriterion: '4/5' },
        caution: ''
      }) } }] }) };
    }
  });
  const payload = {
    ...reviewPayload, schemaVersion: 2,
    control: { ...reviewPayload.control, questionDetails: [{
      questionId: '1', topic: 'Kubernetes', level: 'Middle', category: 'scenario',
      question: 'Почему Service не видит Pod?', result: 'incorrect', selectedAnswer: 'liveness',
      correctAnswer: 'readiness', explanation: 'Readiness управляет endpoints.', responseSeconds: 70
    }] }
  };
  const review = await service.review(payload);

  assert.equal(review.schemaVersion, 2);
  assert.equal(review.actionPlan[0].successCriterion, '4/5');
  assert.equal(captured.max_tokens >= 1800, true);
  assert.match(captured.messages[0].content, /evidence/);
  assert.match(captured.messages[0].content, /successCriterion/);
});

test('asks the provider for a strict rubric-bound interview evaluation', async () => {
  let captured;
  const service = createAiService({
    IPMAX_AI_PROVIDER: 'openai-compatible',
    IPMAX_AI_ENDPOINT: 'https://provider.example/v1/chat/completions',
    IPMAX_AI_API_KEY: 'server-secret',
    IPMAX_AI_MODEL: 'test-model'
  }, {
    fetchImpl: async (_url, options) => {
      captured = JSON.parse(options.body);
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({
        schemaVersion: 1, overallScore: 72, summary: 'Основа есть.',
        dimensions: {
          correctness: { score: 80, feedback: 'Верно.' }, completeness: { score: 70, feedback: 'Добавить шаги.' },
          structure: { score: 75, feedback: 'Понятно.' }, tradeoffs: { score: 60, feedback: 'Мало компромиссов.' }
        },
        rubric: [
          { criterion: 'Подмена', met: true, evidence: 'Есть откат', feedback: 'Хорошо.' },
          { criterion: 'Подмена', met: true, evidence: 'Секреты вне repo', feedback: 'Хорошо.' }
        ],
        gaps: ['Метрики'], improvedAnswer: 'Улучшенный ответ.',
        followUps: [{ question: 'Как проверите откат?', reason: 'Проверка процедуры.' }], caution: ''
      }) } }] }) };
    }
  });

  const evaluation = await service.evaluateInterview(interviewPayload);
  assert.equal(evaluation.rubric[0].criterion, 'Назван способ отката');
  assert.equal(evaluation.overallScore, 72);
  assert.match(captured.messages[0].content, /rubric/i);
  assert.match(captured.messages[0].content, /до трёх/i);
  assert.equal(captured.max_tokens >= 1800, true);
});

// Запрос с таймаутом на сокет. Нужен именно здесь: при регрессии обработчик
// не отправляет ответ, и незакрытый сокет держит event loop — процесс
// node --test не выходит даже после провала теста (проверено: висит >45 с).
// Таймаут превращает регрессию в быстрое падение, а не в зависший CI.
function requestWithTimeout(server, method, path, ms = 4000) {
  const port = server.address().port;
  return new Promise((resolve, reject) => {
    const outgoing = http.request({ host: '127.0.0.1', port, method, path }, response => {
      response.resume();
      response.on('end', () => resolve({ status: response.statusCode }));
    });
    outgoing.setTimeout(ms, () => {
      outgoing.destroy(new Error(`${path}: ответ не получен за ${ms} мс`));
    });
    outgoing.on('error', reject);
    outgoing.end();
  });
}

test('survives malformed request targets instead of crashing', async () => {
  await withServer(createAiService({ IPMAX_AI_PROVIDER: 'mock' }), async server => {
    // Коды замерены на фактическом поведении Node, а не предположены:
    //   '//' и '/\\'  — new URL бросает ERR_INVALID_URL -> перехват -> 400
    //   '/%%', '/%zz' — URL валиден, decodeURIComponent бросает,
    //                   safeStaticPath уже это ловит -> 403
    // '//evil.example.com' сюда НЕ входит: он разбирается штатно
    // (host=evil.example.com, pathname='/') и отдаёт index.html -> 200.
    const expected = [['//', 400], ['/\\', 400], ['/%%', 403], ['/%zz', 403], ['/..%2f..%2fetc', 403]];
    for (const [target, status] of expected) {
      const response = await requestWithTimeout(server, 'GET', target);
      assert.equal(response.status, status, `${target}: ожидался ${status}, получен ${response.status}`);
    }
    // Главное: процесс жив и продолжает обслуживать запросы.
    const alive = await requestWithTimeout(server, 'GET', '/api/ai/status');
    assert.equal(alive.status, 200, 'сервер не выжил после некорректных запросов');
  });
});
