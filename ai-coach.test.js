const test = require('node:test');
const assert = require('node:assert/strict');
const AICoach = require('./ai-coach.js');

test('builds a privacy-safe aggregate from a control session', () => {
  const payload = AICoach.buildReviewPayload({
    profile: { role: 'SRE', level: 'Middle' },
    plan: { roleLabel: 'SRE', level: 'Middle', daysUntil: 9, focus: { topic: 'Linux' } },
    session: {
      id: 'control-1', questionIds: [1, 2, 3], topics: ['Linux', 'Terraform'], startedAt: 1,
      attempts: [
        { questionId: 1, topic: 'Linux', score: 0, responseSeconds: 40, at: 2, answer: 'secret text' },
        { questionId: 2, topic: 'Terraform', score: 1, responseSeconds: 20, at: 3 }
      ]
    }
  });

  assert.deepEqual(payload.profile, { role: 'SRE', level: 'Middle', daysUntilInterview: 9 });
  assert.equal(payload.control.attempted, 2);
  assert.equal(payload.control.total, 3);
  assert.equal(payload.control.accuracy, 50);
  assert.equal(payload.control.topics[0].topic, 'Linux');
  assert.doesNotMatch(JSON.stringify(payload), /secret text/);
  assert.doesNotMatch(JSON.stringify(payload), /questionId/);
});

test('builds bounded question evidence for wrong and slow control answers', () => {
  const questions = [
    {
      id: 1, topic: 'Kubernetes', level: 'Middle', category: 'scenario',
      q: 'Почему Running Pod не получает трафик от Service?',
      options: ['Проверить livenessProbe', 'Проверить readinessProbe и endpoints'],
      answer: 1,
      explanation: 'Readiness определяет включение Pod в endpoints Service.'
    },
    {
      id: 2, topic: 'Linux', level: 'Middle', category: 'output',
      q: 'Что показывает load average?', options: ['Очередь задач', 'Свободную память'], answer: 0,
      explanation: 'Load average отражает runnable и uninterruptible задачи.'
    }
  ];
  const payload = AICoach.buildReviewPayload({
    questions,
    profile: { role: 'DevOps', level: 'Middle' },
    session: {
      questionIds: [1, 2],
      attempts: [
        { questionId: 1, topic: 'Kubernetes', score: 0, selectedAnswerIndex: 0, responseSeconds: 74, at: 10 },
        { questionId: 2, topic: 'Linux', score: 1, selectedAnswerIndex: 0, responseSeconds: 95, at: 20 }
      ]
    }
  });

  assert.equal(payload.schemaVersion, 2);
  assert.equal(payload.control.questionDetails.length, 2);
  assert.deepEqual(payload.control.questionDetails[0], {
    questionId: '1', topic: 'Kubernetes', level: 'Middle', category: 'scenario',
    question: 'Почему Running Pod не получает трафик от Service?',
    result: 'incorrect', selectedAnswer: 'Проверить livenessProbe',
    correctAnswer: 'Проверить readinessProbe и endpoints',
    explanation: 'Readiness определяет включение Pod в endpoints Service.', responseSeconds: 74
  });
  assert.equal(payload.control.questionDetails[1].result, 'slow-correct');
  assert.ok(JSON.stringify(payload).length < 65536);
});

test('normalises a strict diagnostic v2 review and strips unsafe routing values', () => {
  const review = AICoach.normaliseReview({
    schemaVersion: 2,
    verdict: { levelEstimate: 'Middle-', readiness: 58, summary: 'Путаете readiness и liveness.' },
    diagnostics: [{
      concept: 'Kubernetes probes', severity: 'high', problemType: 'concept_confusion',
      evidence: ['Выбран liveness вместо readiness', 'Ответ занял 74 секунды'],
      explanation: 'Readiness управляет включением в endpoints.', confidence: 0.88,
      html: '<img onerror=bad>'
    }],
    actionPlan: [{
      priority: 1, task: 'Сравнить три probe', practice: 'Решить 5 сценариев',
      successCriterion: '4/5 и среднее время до 45 секунд', page: 'evil-page', topic: 'Kubernetes'
    }],
    studyPlan: [{ day: 1, title: 'Probes', actions: ['Таблица различий'], successCriterion: 'Объяснить без подсказки' }],
    retest: { topics: ['Kubernetes'], categories: ['scenario'], levels: ['Middle'], size: 5, successCriterion: 'Не менее 80%' },
    caution: 'Выборка небольшая', extra: 'drop me'
  });

  assert.equal(review.schemaVersion, 2);
  assert.equal(review.verdict.readiness, 58);
  assert.equal(review.diagnostics[0].problemType, 'concept_confusion');
  assert.equal(review.diagnostics[0].html, undefined);
  assert.equal(review.actionPlan[0].page, 'exam');
  assert.equal(review.extra, undefined);
  assert.deepEqual(review.retest.topics, ['Kubernetes']);
});

test('aggregates reserved topic names without touching object prototypes', () => {
  const payload = AICoach.buildReviewPayload({
    session: {
      questionIds: ['1'],
      attempts: [{ questionId: '1', topic: '__proto__', score: 1, responseSeconds: 10 }]
    }
  });

  assert.equal(payload.control.topics[0].topic, '__proto__');
  assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, 'attempted'), false);
});

test('uses a deterministic local review when the backend is unavailable', async () => {
  const payload = AICoach.normaliseReviewPayload({
    profile: { role: 'DevOps', level: 'Senior' },
    control: { attempted: 3, total: 5, accuracy: 67, topics: [{ topic: 'Kubernetes', attempted: 2, accuracy: 50, averageSeconds: 30 }] }
  });
  const result = await AICoach.review(payload, { token: 'test-sync-token', fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(result.source, 'local');
  assert.match(result.gaps[0], /Kubernetes/);
  assert.equal(result.nextSteps.length, 3);
  assert.equal(result.fallbackReason, 'offline');
});

test('builds a diagnostic v2 fallback with evidence and measurable actions', async () => {
  const payload = AICoach.normaliseReviewPayload({
    schemaVersion: 2,
    profile: { role: 'DevOps', level: 'Middle' },
    control: {
      attempted: 2, total: 2, accuracy: 50,
      topics: [{ topic: 'Kubernetes', attempted: 2, accuracy: 50, averageSeconds: 55 }],
      questionDetails: [{
        questionId: '1', topic: 'Kubernetes', level: 'Middle', category: 'scenario',
        question: 'Почему Service не видит Pod?', result: 'incorrect',
        selectedAnswer: 'Проверить livenessProbe', correctAnswer: 'Проверить readiness и endpoints',
        explanation: 'Readiness управляет endpoints.', responseSeconds: 70
      }]
    }
  });
  const result = await AICoach.review(payload, { token: 'test-sync-token', fetchImpl: async () => { throw new Error('offline'); } });

  assert.equal(result.schemaVersion, 2);
  assert.equal(result.source, 'local');
  assert.match(result.verdict.summary, /Kubernetes/);
  assert.match(result.diagnostics[0].evidence.join(' '), /livenessProbe/);
  assert.match(result.actionPlan[0].successCriterion, /5/);
  assert.equal(result.retest.topics[0], 'Kubernetes');
});

test('explains why the review fell back instead of just saying "unavailable"', async () => {
  // Раньше наружу отдавался только текст ошибки, и пользователь не мог
  // отличить незаданный провайдер от таймаута или неверного ключа.
  const payload = AICoach.normaliseReviewPayload({
    control: { attempted: 2, total: 2, accuracy: 50, topics: [{ topic: 'Linux', attempted: 2, accuracy: 50, averageSeconds: 20 }] }
  });
  const cases = [
    ['AI_NOT_CONFIGURED', 503, /Настройки AI/],
    ['AI_TIMEOUT', 504, /таймаут/i],
    ['AI_PROVIDER_ERROR', 502, /ключ/i],
    ['AI_BAD_RESPONSE', 502, /формат/i],
    ['AI_UNAVAILABLE', 502, /адрес API/i]
  ];
  for (const [code, status, pattern] of cases) {
    const result = await AICoach.review(payload, {
      token: 'test-sync-token',
      fetchImpl: async () => ({ ok: false, status, json: async () => ({ error: 'backend says no', code }) })
    });
    assert.equal(result.source, 'local', code);
    assert.equal(result.fallbackCode, code);
    assert.equal(result.fallbackStatus, status);
    assert.match(result.fallbackHint, pattern, code);
    // Техническая причина сохраняется отдельно для диагностики.
    assert.equal(result.fallbackReason, 'backend says no');
  }
});

test('a rate limit and a static deployment get distinct explanations', async () => {
  const payload = AICoach.normaliseReviewPayload({ control: { attempted: 1, total: 1, accuracy: 100, topics: [] } });
  const limited = await AICoach.review(payload, {
    token: 'test-sync-token',
    fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({ error: 'Too many AI review requests' }) })
  });
  assert.match(limited.fallbackHint, /Подождите минуту/);

  // GitHub Pages: backend отсутствует по определению.
  const missing = await AICoach.review(payload, {
    token: 'test-sync-token',
    fetchImpl: async () => ({ ok: false, status: 404, json: async () => { throw new Error('no body'); } })
  });
  assert.match(missing.fallbackHint, /статический сайт/);
});

test('an invalid review body is reported as a bad response, not a silent local review', async () => {
  const payload = AICoach.normaliseReviewPayload({ control: { attempted: 1, total: 1, accuracy: 100, topics: [] } });
  const result = await AICoach.review(payload, {
    token: 'test-sync-token',
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ review: { summary: '' } }) })
  });
  assert.equal(result.fallbackCode, 'AI_BAD_RESPONSE');
  assert.match(result.fallbackHint, /формат/i);
});

test('an unknown failure does not invent an explanation', () => {
  // Пустая подпись честнее догадки: UI покажет нейтральный текст.
  assert.equal(AICoach.describeFallback('SOMETHING_NEW', 200, 'weird'), '');
});

test('normalises a successful backend review', async () => {
  const result = await AICoach.requestReview({ control: { attempted: 1, total: 1, accuracy: 100 } }, {
    fetchImpl: async (_url, request) => {
      assert.equal(request.method, 'POST');
      assert.equal(request.headers.Authorization, 'Bearer device-sync-token');
      return {
        ok: true,
        json: async () => ({ review: { summary: 'Готово', strengths: ['Linux'], gaps: [], nextSteps: ['Повторить'] } })
      };
    },
    token: 'device-sync-token'
  });
  assert.equal(result.source, 'ai');
  assert.deepEqual(result.nextSteps, ['Повторить']);
});

test('stores a bounded diagnostic history and derives the latest trend', () => {
  let history = [];
  for (let index = 0; index < 35; index++) {
    history = AICoach.appendReviewHistory(history, {
      schemaVersion: 2, source: 'ai',
      verdict: { levelEstimate: 'Middle', readiness: 40 + index, summary: 'Итог ' + index },
      diagnostics: [{ concept: 'Linux', severity: 'medium', problemType: 'knowledge_gap', evidence: ['Факт'], explanation: 'Разбор', confidence: 0.7 }],
      actionPlan: [{ priority: 1, task: 'Повторить', practice: '5 вопросов', successCriterion: '4/5', page: 'exam', topic: 'Linux' }],
      studyPlan: [], retest: { topics: ['Linux'], categories: [], levels: ['Middle'], size: 5, successCriterion: '4/5' }, caution: ''
    }, { accuracy: 50 + index, attempted: 10, total: 10 }, 1000 + index);
  }

  assert.equal(history.length, 30);
  assert.equal(history[0].at, 1005);
  assert.equal(history.at(-1).review.verdict.readiness, 74);
  assert.equal(JSON.stringify(history).includes('questionDetails'), false);
  const trend = AICoach.buildReviewTrend(history);
  assert.equal(trend.accuracyDelta, 1);
  assert.equal(trend.readinessDelta, 1);
});

test('compares average accuracy and readiness across two seven-day windows', () => {
  const day = 86400000;
  const now = Date.UTC(2026, 7, 6, 12);
  const makeEntry = (id, at, accuracy, readiness) => ({
    id, at, source: 'ai', metrics: { accuracy, attempted: 10, total: 10 },
    review: {
      schemaVersion: 2,
      verdict: { levelEstimate: 'Middle', readiness, summary: id },
      diagnostics: [{ concept: 'Linux', severity: 'medium', problemType: 'knowledge_gap', evidence: ['Факт'], explanation: 'Разбор', confidence: 0.7 }],
      actionPlan: [{ priority: 1, task: 'Повторить', practice: '5 вопросов', successCriterion: '4/5', page: 'exam', topic: 'Linux' }],
      studyPlan: [], retest: { topics: ['Linux'], categories: [], levels: ['Middle'], size: 5, successCriterion: '4/5' }, caution: ''
    }
  });
  const history = [
    makeEntry('previous-1', now - 8 * day, 50, 40),
    makeEntry('previous-2', now - 10 * day, 30, 20),
    makeEntry('current-1', now - day, 80, 70),
    makeEntry('current-2', now - 2 * day, 60, 50),
    makeEntry('too-old', now - 15 * day, 100, 100)
  ];

  const trend = AICoach.buildWeeklyReviewTrend(history, now);
  assert.deepEqual(trend.current, { count: 2, accuracy: 70, readiness: 60 });
  assert.deepEqual(trend.previous, { count: 2, accuracy: 40, readiness: 30 });
  assert.equal(trend.accuracyDelta, 30);
  assert.equal(trend.readinessDelta, 30);
  assert.deepEqual(AICoach.buildReviewTrend(history, now).recent.map(entry => entry.id), ['current-1', 'current-2', 'previous-1', 'previous-2', 'too-old']);
});

test('does not label a strong preliminary topic as a gap', () => {
  const result = AICoach.buildLocalReview({
    control: { attempted: 1, total: 10, accuracy: 100, topics: [{ topic: 'Сети', attempted: 1, accuracy: 100, averageSeconds: 20 }] }
  });
  assert.match(result.strengths[0], /Сети/);
  assert.match(result.gaps[0], /предварительный/);
  assert.doesNotMatch(result.gaps[0], /Наибольшего внимания/);
  assert.match(result.nextSteps[0], /оставшиеся 9/);
});
