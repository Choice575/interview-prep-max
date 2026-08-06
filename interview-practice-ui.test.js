const test = require('node:test');
const assert = require('node:assert/strict');
const IP = require('./interview-practice-ui.js');

const data = {
  star: [
    {
      id: 'star-1',
      topic: 'Инцидент',
      prompt: 'Расскажите про свою ошибку',
      why: 'Проверяется зрелость',
      hints: ['Ситуация', 'Действия', 'Результат'],
      rubric: ['Ответственность признана', 'Ущерб остановлен первым', 'Есть результат'],
      pitfalls: ['Чужая ошибка']
    }
  ],
  systemDesign: [
    {
      id: 'sd-1',
      topic: 'CI/CD',
      level: 'Middle',
      title: 'Конвейер выпуска',
      context: 'Сервис в контейнере',
      constraints: ['Откат за 15 минут', 'Секреты вне репозитория'],
      task: 'Опишите конвейер',
      expectedPoints: ['Неизменяемые образы', 'Откат по метке'],
      tradeoffs: ['Ручное подтверждение замедляет выпуск'],
      rubric: ['Назван способ отката', 'Секреты защищены']
    }
  ]
};

test('lists and finds items by kind and id', () => {
  assert.equal(IP.items(data, 'star').length, 1);
  assert.equal(IP.items(data, 'systemDesign').length, 1);
  assert.equal(IP.findItem(data, 'star', 'star-1').topic, 'Инцидент');
  assert.equal(IP.findItem(data, 'systemDesign', 'sd-1').level, 'Middle');
  assert.equal(IP.findItem(data, 'star', 'нет-такого'), null);
  assert.deepEqual(IP.items(null, 'star'), []);
});

test('builds a bounded privacy-safe payload for one written interview answer', () => {
  const item = {
    ...IP.findItem(data, 'systemDesign', 'sd-1'),
    secret: 'do-not-send',
    rubric: Array.from({ length: 12 }, (_, index) => 'Критерий ' + index),
    expectedPoints: Array.from({ length: 12 }, (_, index) => 'Ожидаемый пункт ' + index)
  };
  const payload = IP.buildInterviewPayload({
    kind: 'systemDesign', item,
    answer: '  ' + 'A'.repeat(7000) + '  ',
    followUpTurn: 99,
    history: [{ fullAnswer: 'не отправлять' }],
    token: 'не отправлять'
  });

  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.kind, 'systemDesign');
  assert.equal(payload.item.id, 'sd-1');
  assert.equal(payload.answer.length, 6000);
  assert.equal(payload.followUpTurn, 3);
  assert.equal(payload.item.rubric.length, 8);
  assert.equal(payload.item.expectedPoints.length, 8);
  assert.equal('secret' in payload.item, false);
  assert.equal('history' in payload, false);
  assert.equal('token' in payload, false);
});

test('normalises a strict interview evaluation against the trusted rubric', () => {
  const payload = IP.buildInterviewPayload({ kind: 'systemDesign', item: IP.findItem(data, 'systemDesign', 'sd-1'), answer: 'Мой ответ' });
  const evaluation = IP.normaliseInterviewEvaluation({
    schemaVersion: 1,
    overallScore: 180,
    summary: '<img src=x onerror=bad>',
    dimensions: {
      correctness: { score: 82, feedback: 'Корректно' },
      completeness: { score: 70, feedback: 'Не всё' },
      structure: { score: 65, feedback: 'Структурировать' },
      tradeoffs: { score: -5, feedback: 'Нет компромиссов' },
      invented: { score: 100, feedback: 'Не принимать' }
    },
    rubric: [
      { criterion: 'Подменённый критерий', met: true, evidence: 'Назван откат', feedback: 'Хорошо' },
      { criterion: 'Подмена 2', met: false, evidence: '', feedback: 'Добавьте секреты' }
    ],
    gaps: Array.from({ length: 12 }, (_, index) => 'Пробел ' + index),
    improvedAnswer: 'I'.repeat(7000),
    followUps: Array.from({ length: 8 }, (_, index) => ({ question: '<b>Вопрос ' + index + '</b>', reason: 'Причина' })),
    route: 'javascript:bad()',
    extra: 'drop'
  }, payload);

  assert.equal(evaluation.overallScore, 100);
  assert.deepEqual(Object.keys(evaluation.dimensions), ['correctness', 'completeness', 'structure', 'tradeoffs']);
  assert.equal(evaluation.dimensions.tradeoffs.score, 0);
  assert.equal(evaluation.rubric[0].criterion, 'Назван способ отката');
  assert.equal(evaluation.rubric[1].criterion, 'Секреты защищены');
  assert.equal(evaluation.gaps.length, 6);
  assert.equal(evaluation.improvedAnswer.length, 5000);
  assert.equal(evaluation.followUps.length, 3);
  assert.equal('route' in evaluation, false);
  assert.equal('extra' in evaluation, false);
});

test('rejects an incomplete interview evaluation instead of inventing zero scores', () => {
  const payload = IP.buildInterviewPayload({ kind: 'star', item: IP.findItem(data, 'star', 'star-1'), answer: 'Ответ' });
  assert.equal(IP.normaliseInterviewEvaluation({ overallScore: 50 }, payload), null);
  assert.equal(IP.normaliseInterviewEvaluation({ summary: 'Есть текст', dimensions: {} }, payload), null);
  assert.equal(IP.normaliseInterviewEvaluation({
    overallScore: 50, summary: 'Пустой балл не является нулём',
    dimensions: {
      correctness: { score: null }, completeness: { score: 50 },
      structure: { score: 50 }, tradeoffs: { score: 50 }
    }
  }, payload), null);
});

test('builds an honest structural fallback when external AI is unavailable', () => {
  const payload = IP.buildInterviewPayload({
    kind: 'star', item: IP.findItem(data, 'star', 'star-1'),
    answer: 'Ситуация: произошёл сбой. Действия: остановил ущерб. Результат: добавил проверку и сократил восстановление до 10 минут.'
  });
  const result = IP.buildLocalInterviewEvaluation(payload);

  assert.equal(result.source, 'local');
  assert.match(result.summary, /структур/i);
  assert.equal(result.dimensions.correctness.score, null);
  assert.equal(result.rubric[0].criterion, 'Ответственность признана');
  assert.equal(result.followUps.length > 0, true);
  assert.match(result.caution, /не проверяет техническую корректность/i);
});

test('requests a strict interview evaluation with the sync token and falls back locally', async () => {
  const input = { kind: 'star', item: IP.findItem(data, 'star', 'star-1'), answer: 'Ситуация, действия и измеримый результат.' };
  let sent;
  const result = await IP.requestInterviewEvaluation(input, {
    token: 'device-sync-token',
    fetchImpl: async (_url, request) => {
      sent = request;
      return { ok: true, status: 200, json: async () => ({ evaluation: {
        overallScore: 76, summary: 'Хорошая структура.',
        dimensions: {
          correctness: { score: 70, feedback: 'Проверьте детали.' }, completeness: { score: 80, feedback: 'Достаточно.' },
          structure: { score: 85, feedback: 'STAR виден.' }, tradeoffs: { score: 68, feedback: 'Добавьте риск.' }
        },
        rubric: [{ met: true, evidence: 'измеримый результат', feedback: 'Есть факт.' }],
        gaps: [], improvedAnswer: '', followUps: [], caution: ''
      } }) };
    }
  });
  assert.equal(sent.headers.Authorization, 'Bearer device-sync-token');
  assert.equal(JSON.parse(sent.body).answer, input.answer);
  assert.equal(result.source, 'ai');
  assert.equal(result.rubric[0].criterion, 'Ответственность признана');

  const fallback = await IP.evaluateInterview(input, {
    token: 'device-sync-token', fetchImpl: async () => { throw new Error('offline'); }
  });
  assert.equal(fallback.source, 'local');
  assert.match(fallback.caution, /не проверяет техническую корректность/i);
  assert.equal(fallback.fallbackReason, 'offline');
});

test('bounds one follow-up turn without sending a conversation transcript', () => {
  const payload = IP.buildInterviewPayload({
    kind: 'star', item: IP.findItem(data, 'star', 'star-1'), answer: 'Исходный ответ', followUpTurn: 9,
    followUp: { question: 'Q'.repeat(1200), answer: 'A'.repeat(4000), route: 'javascript:bad()' },
    messages: [{ role: 'assistant', content: 'не отправлять' }]
  });
  assert.equal(payload.followUpTurn, 3);
  assert.equal(payload.followUp.question.length, 1000);
  assert.equal(payload.followUp.answer.length, 3000);
  assert.equal('route' in payload.followUp, false);
  assert.equal('messages' in payload, false);
});

test('preserves mock provenance instead of presenting a test provider as real AI', async () => {
  const input = { kind: 'star', item: IP.findItem(data, 'star', 'star-1'), answer: 'Ответ' };
  const result = await IP.requestInterviewEvaluation(input, {
    token: 'device-sync-token',
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ evaluation: {
      source: 'mock', overallScore: 40, summary: 'Тестовый результат',
      dimensions: {
        correctness: { score: 40, feedback: '' }, completeness: { score: 40, feedback: '' },
        structure: { score: 40, feedback: '' }, tradeoffs: { score: 40, feedback: '' }
      }, rubric: [], gaps: [], improvedAnswer: '', followUps: [], caution: ''
    } }) })
  });
  assert.equal(result.source, 'mock');
});

test('stores only a bounded compact interview history without answer text or evidence', () => {
  let history = [];
  const payload = IP.buildInterviewPayload({ kind: 'star', item: IP.findItem(data, 'star', 'star-1'), answer: 'PRIVATE ANSWER' });
  for (let index = 0; index < 35; index++) {
    history = IP.appendInterviewHistory(history, {
      source: 'ai', overallScore: index, summary: 'Итог ' + index,
      dimensions: {
        correctness: { score: index, feedback: '' }, completeness: { score: index, feedback: '' },
        structure: { score: index, feedback: '' }, tradeoffs: { score: index, feedback: '' }
      },
      rubric: [{ criterion: 'Критерий', met: false, evidence: 'PRIVATE EVIDENCE', feedback: '' }],
      gaps: ['Пробел'], improvedAnswer: 'PRIVATE IMPROVED',
      followUps: [{ question: 'PRIVATE FOLLOWUP', reason: '' }], caution: ''
    }, payload, 1000 + index);
  }
  assert.equal(history.length, 30);
  assert.equal(history[0].at, 1005);
  assert.equal(history.at(-1).overallScore, 34);
  const serialised = JSON.stringify(history);
  assert.doesNotMatch(serialised, /PRIVATE ANSWER|PRIVATE EVIDENCE|PRIVATE IMPROVED|PRIVATE FOLLOWUP/);
  assert.equal(IP.INTERVIEW_HISTORY_LIMIT, 30);
});

test('renders a rubric evaluation and escapes every model-provided field', () => {
  const payload = IP.buildInterviewPayload({ kind: 'systemDesign', item: IP.findItem(data, 'systemDesign', 'sd-1'), answer: 'Ответ' });
  const evaluation = IP.normaliseInterviewEvaluation({
    overallScore: 72,
    summary: '<img src=x onerror=bad> Основа есть',
    dimensions: {
      correctness: { score: 80, feedback: '<b>Верно</b>' },
      completeness: { score: 70, feedback: 'Добавьте детали' },
      structure: { score: 75, feedback: 'Понятно' },
      tradeoffs: { score: 60, feedback: 'Мало компромиссов' }
    },
    rubric: [
      { met: true, evidence: '<script>bad()</script>', feedback: 'Хорошо' },
      { met: false, evidence: '', feedback: 'Добавьте защиту секретов' }
    ],
    gaps: ['<i>Метрики</i>'], improvedAnswer: '<textarea>Улучшенный ответ</textarea>',
    followUps: [{ question: '<svg onload=bad>Как проверите откат?', reason: 'Проверка процедуры' }],
    caution: '<marquee>Проверьте вручную</marquee>'
  }, payload);

  const markup = IP.renderInterviewEvaluation(evaluation);
  assert.match(markup, /72%/);
  assert.match(markup, /Техническая корректность/);
  assert.match(markup, /Назван способ отката/);
  assert.match(markup, /Как проверите откат/);
  assert.match(markup, /&lt;img/);
  assert.match(markup, /&lt;script/);
  assert.match(markup, /&lt;textarea/);
  assert.doesNotMatch(markup, /<img src=x|<script>|<textarea>|<svg onload/);
  assert.match(markup, /aria-live="polite"/);
});

test('scores self-assessment against the rubric', () => {
  const item = IP.findItem(data, 'star', 'star-1');

  const full = IP.score(item, [0, 1, 2]);
  assert.equal(full.percent, 100);
  assert.equal(full.covered, 3);
  assert.deepEqual(full.missing, []);
  assert.match(full.verdict, /все пункты/);

  const partial = IP.score(item, [0]);
  assert.equal(partial.percent, 33);
  assert.equal(partial.missing.length, 2);
  assert.match(partial.verdict, /не структурирован/);

  const twoOfThree = IP.score(item, [0, 2]);
  assert.equal(twoOfThree.percent, 67);
  assert.match(twoOfThree.verdict, /половина|Основа/);
});

test('ignores duplicate and out-of-range rubric marks', () => {
  const item = IP.findItem(data, 'star', 'star-1');

  assert.equal(IP.score(item, [0, 0, 0]).covered, 1, 'duplicates must not inflate the score');
  assert.equal(IP.score(item, [0, 99, -3, 'x']).covered, 1, 'invalid indexes must be dropped');
  assert.equal(IP.score(item, []).percent, 0);
  assert.equal(IP.score({ rubric: [] }, [0]).percent, 0);
});

test('renders a STAR card without leaking the rubric', () => {
  const markup = IP.renderStar(IP.findItem(data, 'star', 'star-1'));

  assert.match(markup, /Расскажите про свою ошибку/);
  assert.match(markup, /Проверяется зрелость/);
  assert.match(markup, /Ситуация/);
  assert.match(markup, /Чужая ошибка/);
  assert.doesNotMatch(markup, /Ответственность признана/, 'rubric must stay hidden until requested');
});

test('renders a system design card with constraints but no reference answer', () => {
  const markup = IP.renderSystemDesign(IP.findItem(data, 'systemDesign', 'sd-1'));

  assert.match(markup, /Конвейер выпуска/);
  assert.match(markup, /Откат за 15 минут/);
  assert.match(markup, /Опишите конвейер/);
  assert.doesNotMatch(markup, /Неизменяемые образы/, 'expected points must stay hidden');
});

test('reveals the reference answer only on request', () => {
  const star = IP.renderReference(IP.findItem(data, 'star', 'star-1'), 'star');
  assert.match(star, /Ответственность признана/);

  const sd = IP.renderReference(IP.findItem(data, 'systemDesign', 'sd-1'), 'systemDesign');
  assert.match(sd, /Неизменяемые образы/);
  assert.match(sd, /Ручное подтверждение замедляет выпуск/);
  assert.match(sd, /Назван способ отката/);
});

test('builds an accessible rubric form with bound labels', () => {
  const form = IP.renderRubricForm(IP.findItem(data, 'systemDesign', 'sd-1'), 'sd-check');

  assert.match(form, /id="sd-check-0"/);
  assert.match(form, /for="sd-check-0"/);
  assert.match(form, /id="sd-check-1"/);
  assert.match(form, /for="sd-check-1"/);
});

test('announces the score via aria-live', () => {
  const item = IP.findItem(data, 'star', 'star-1');
  const markup = IP.renderScore(IP.score(item, [0, 1]));

  assert.match(markup, /aria-live="polite"/);
  assert.match(markup, /67%/);
  assert.match(markup, /2 из 3/);
  assert.match(markup, /Есть результат/, 'the missing rubric point must be listed');
});

test('escapes hostile content in prompts and rubrics', () => {
  const hostile = {
    star: [{
      id: 'x',
      topic: '<img src=x onerror=bad>',
      prompt: '<script>alert(1)</script>',
      why: 'why',
      hints: ['<b>hint</b>'],
      rubric: ['<i>point</i>'],
      pitfalls: []
    }]
  };
  const markup = IP.renderStar(IP.findItem(hostile, 'star', 'x'));

  assert.match(markup, /&lt;script&gt;/);
  assert.doesNotMatch(markup, /<script>/);
  assert.doesNotMatch(markup, /<img src=x/);
  assert.match(IP.renderReference(IP.findItem(hostile, 'star', 'x'), 'star'), /&lt;i&gt;point/);
});

test('summarises the practice set', () => {
  const info = IP.summary(data);

  assert.equal(info.star, 1);
  assert.equal(info.systemDesign, 1);
  assert.deepEqual(info.topics, ['CI/CD']);
});

test('renders an empty state for a missing item', () => {
  assert.match(IP.renderStar(null), /Задание не найдено/);
  assert.match(IP.renderSystemDesign(null), /Задание не найдено/);
});
