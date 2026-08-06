(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IPMaxInterviewPracticeUI = api;
})(typeof self !== 'undefined' ? self : globalThis, function() {
  const INTERVIEW_HISTORY_LIMIT = 30;

  function escapeText(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function items(data, kind) {
    if (!data) return [];
    return list(kind === 'star' ? data.star : data.systemDesign);
  }

  function findItem(data, kind, id) {
    const wanted = String(id === undefined || id === null ? '' : id);
    return items(data, kind).find(entry => entry && String(entry.id) === wanted) || null;
  }

  function boundedText(value, limit) {
    return typeof value === 'string' ? value.trim().slice(0, limit) : '';
  }

  function boundedList(value, count, limit) {
    return list(value).map(item => boundedText(item, limit)).filter(Boolean).slice(0, count);
  }

  function buildInterviewPayload(input) {
    const source = input && typeof input === 'object' ? input : {};
    const kind = source.kind === 'systemDesign' ? 'systemDesign' : 'star';
    const item = source.item && typeof source.item === 'object' ? source.item : {};
    const common = {
      id: boundedText(String(item.id === undefined ? '' : item.id), 100),
      topic: boundedText(item.topic, 100),
      level: boundedText(item.level, 40),
      rubric: boundedList(item.rubric, 8, 500)
    };
    const safeItem = kind === 'star' ? {
      ...common,
      prompt: boundedText(item.prompt, 2000),
      why: boundedText(item.why, 1500),
      hints: boundedList(item.hints, 8, 800),
      pitfalls: boundedList(item.pitfalls, 8, 800)
    } : {
      ...common,
      title: boundedText(item.title, 500),
      context: boundedText(item.context, 2500),
      task: boundedText(item.task, 2000),
      constraints: boundedList(item.constraints, 8, 800),
      expectedPoints: boundedList(item.expectedPoints, 8, 1000),
      tradeoffs: boundedList(item.tradeoffs, 8, 800)
    };
    const followUpTurn = Math.max(0, Math.min(3, Math.round(Number(source.followUpTurn) || 0)));
    const followUpSource = source.followUp && typeof source.followUp === 'object' ? source.followUp : {};
    const followUp = followUpTurn ? {
      question: boundedText(followUpSource.question, 1000),
      answer: boundedText(followUpSource.answer, 3000)
    } : null;
    return {
      schemaVersion: 1,
      kind,
      item: safeItem,
      answer: boundedText(source.answer, 6000),
      followUpTurn,
      ...(followUp && followUp.question && followUp.answer ? { followUp } : {})
    };
  }

  function boundedScore(value, allowNull) {
    if (allowNull && (value === null || value === undefined)) return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, Math.min(100, Math.round(numeric))) : (allowNull ? null : 0);
  }

  function normaliseDimension(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      score: boundedScore(source.score, true),
      feedback: boundedText(source.feedback, 1000)
    };
  }

  function normaliseInterviewEvaluation(raw, payload) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const dimensions = source.dimensions && typeof source.dimensions === 'object' ? source.dimensions : null;
    const dimensionKeys = ['correctness', 'completeness', 'structure', 'tradeoffs'];
    const complete = boundedText(source.summary, 1500) && Number.isFinite(source.overallScore) && dimensions &&
      dimensionKeys.every(key => dimensions[key] && Number.isFinite(dimensions[key].score));
    if (!complete) return null;
    const trusted = payload && payload.item && typeof payload.item === 'object' ? payload.item : {};
    const rubricSource = list(source.rubric);
    const rubric = boundedList(trusted.rubric, 8, 500).map((criterion, index) => {
      const item = rubricSource[index] && typeof rubricSource[index] === 'object' ? rubricSource[index] : {};
      return {
        criterion,
        met: item.met === true ? true : item.met === false ? false : null,
        evidence: boundedText(item.evidence, 1000),
        feedback: boundedText(item.feedback, 1000)
      };
    });
    return {
      schemaVersion: 1,
      source: source.source === 'local' ? 'local' : source.source === 'mock' ? 'mock' : 'ai',
      overallScore: boundedScore(source.overallScore, false),
      summary: boundedText(source.summary, 1500),
      dimensions: {
        correctness: normaliseDimension(dimensions.correctness),
        completeness: normaliseDimension(dimensions.completeness),
        structure: normaliseDimension(dimensions.structure),
        tradeoffs: normaliseDimension(dimensions.tradeoffs)
      },
      rubric,
      gaps: boundedList(source.gaps, 6, 1000),
      improvedAnswer: boundedText(source.improvedAnswer, 5000),
      followUps: list(source.followUps).map(item => item && typeof item === 'object' ? {
        question: boundedText(item.question, 1000),
        reason: boundedText(item.reason, 800)
      } : null).filter(item => item && item.question).slice(0, 3),
      caution: boundedText(source.caution, 1200)
    };
  }

  function buildLocalInterviewEvaluation(payload) {
    const safe = buildInterviewPayload(payload);
    const answer = safe.answer;
    const lower = answer.toLowerCase();
    const hasStructure = safe.kind === 'star'
      ? ['ситуац', 'действ', 'результ'].filter(marker => lower.includes(marker)).length
      : ['требован', 'компонент', 'компромисс'].filter(marker => lower.includes(marker)).length;
    const completeness = Math.min(100, Math.round(answer.length / 8));
    const structure = Math.min(100, Math.round(hasStructure / 3 * 100));
    const tradeoffs = /компромисс|trade.?off|плюс|минус|риск/i.test(answer) ? 70 : 20;
    const overallScore = Math.round((completeness + structure + tradeoffs) / 3);
    const rubric = boundedList(safe.item.rubric, 8, 500).map(criterion => ({
      criterion, met: null, evidence: '', feedback: 'Проверьте этот пункт вручную по тексту ответа.'
    }));
    const followUps = safe.kind === 'star' ? [
      { question: 'Какой измеримый результат получился?', reason: 'Конкретный результат усиливает STAR-ответ.' },
      { question: 'Что вы изменили, чтобы ситуация не повторилась?', reason: 'Так виден вывод и инженерная зрелость.' }
    ] : [
      { question: 'Какое ограничение определило ваш главный архитектурный выбор?', reason: 'Связывает решение с требованиями.' },
      { question: 'Какой компромисс или новый риск создаёт это решение?', reason: 'Показывает зрелость проектирования.' }
    ];
    return {
      schemaVersion: 1,
      source: 'local',
      overallScore,
      summary: 'Локальная структурная проверка: ответ оценён по объёму, структуре и наличию измеримых аргументов.',
      dimensions: {
        correctness: { score: null, feedback: 'Без внешнего AI техническая корректность не оценивается.' },
        completeness: { score: completeness, feedback: answer.length >= 400 ? 'Ответ достаточно развёрнут.' : 'Добавьте конкретные факты и результат.' },
        structure: { score: structure, feedback: hasStructure >= 2 ? 'Основные части ответа различимы.' : 'Разделите ответ на понятные этапы.' },
        tradeoffs: { score: tradeoffs, feedback: tradeoffs >= 70 ? 'Риски или компромиссы названы.' : 'Назовите ограничение, риск или компромисс.' }
      },
      rubric,
      gaps: rubric.map(item => item.criterion).slice(0, 6),
      improvedAnswer: '',
      followUps,
      caution: 'Локальная проверка не проверяет техническую корректность ответа; сверьтесь с рубрикой вручную.'
    };
  }

  // Self-assessment: the learner ticks the rubric points they actually covered.
  function score(item, checked) {
    const rubric = list(item && item.rubric);
    const marks = list(checked).map(Number).filter(n => Number.isInteger(n) && n >= 0 && n < rubric.length);
    const unique = [...new Set(marks)];
    const total = rubric.length;
    const percent = total ? Math.round(unique.length / total * 100) : 0;
    let verdict;
    if (!total) verdict = 'Рубрика не задана';
    else if (percent === 100) verdict = 'Ответ закрывает все пункты рубрики';
    else if (percent >= 75) verdict = 'Ответ сильный, добейте оставшиеся пункты';
    else if (percent >= 50) verdict = 'Основа есть, половина рубрики не раскрыта';
    else verdict = 'Ответ пока не структурирован — пройдите по рубрике заново';
    return { covered: unique.length, total, percent, verdict, missing: rubric.filter((_, i) => !unique.includes(i)) };
  }

  function renderBullets(title, values, className) {
    const rows = list(values);
    if (!rows.length) return '';
    return '<div class="ip-block ' + className + '"><div class="ip-block-title">' + escapeText(title) +
      '</div><ul>' + rows.map(v => '<li>' + escapeText(v) + '</li>').join('') + '</ul></div>';
  }

  function renderStar(item) {
    if (!item) return '<div class="empty-state"><div class="icon">🎤</div><p>Задание не найдено</p></div>';
    return '<div class="ip-card">' +
      '<div class="ip-kicker">Поведенческий вопрос · ' + escapeText(item.topic) + '</div>' +
      '<h4 class="ip-prompt">' + escapeText(item.prompt) + '</h4>' +
      '<p class="ip-why">' + escapeText(item.why) + '</p>' +
      renderBullets('Как строить ответ', item.hints, 'ip-hints') +
      renderBullets('Типичные ошибки', item.pitfalls, 'ip-pitfalls') +
      '</div>';
  }

  function renderSystemDesign(item) {
    if (!item) return '<div class="empty-state"><div class="icon">🧩</div><p>Задание не найдено</p></div>';
    return '<div class="ip-card">' +
      '<div class="ip-kicker">Проектирование · ' + escapeText(item.topic) + ' · ' + escapeText(item.level) + '</div>' +
      '<h4 class="ip-prompt">' + escapeText(item.title) + '</h4>' +
      '<p class="ip-context">' + escapeText(item.context) + '</p>' +
      renderBullets('Ограничения', item.constraints, 'ip-constraints') +
      '<div class="ip-block ip-task"><div class="ip-block-title">Задача</div><p>' + escapeText(item.task) + '</p></div>' +
      '</div>';
  }

  // The reference answer stays hidden until the learner asks for it.
  function renderReference(item, kind) {
    if (!item) return '';
    if (kind === 'star') {
      return renderBullets('Рубрика самопроверки', item.rubric, 'ip-rubric');
    }
    return renderBullets('Что ждут в ответе', item.expectedPoints, 'ip-expected') +
      renderBullets('Компромиссы', item.tradeoffs, 'ip-tradeoffs') +
      renderBullets('Рубрика самопроверки', item.rubric, 'ip-rubric');
  }

  function renderRubricForm(item, idPrefix) {
    const rubric = list(item && item.rubric);
    if (!rubric.length) return '';
    const prefix = String(idPrefix || 'ip-rb');
    const rows = rubric.map((point, index) => {
      const id = prefix + '-' + index;
      return '<div class="ip-check"><input type="checkbox" id="' + escapeText(id) + '" value="' + index +
        '"><label for="' + escapeText(id) + '">' + escapeText(point) + '</label></div>';
    }).join('');
    return '<div class="ip-rubric-form"><div class="ip-block-title">Отметьте, что вы раскрыли</div>' + rows + '</div>';
  }

  function normaliseInterviewHistoryEntry(value) {
    if (!value || typeof value !== 'object') return null;
    const id = boundedText(value.id, 120);
    const at = Math.round(Number(value.at));
    const kind = value.kind === 'systemDesign' ? 'systemDesign' : value.kind === 'star' ? 'star' : '';
    const itemId = boundedText(value.itemId, 100);
    const summary = boundedText(value.summary, 800);
    if (!id || !Number.isFinite(at) || at < 0 || !kind || !itemId || !summary || !Number.isFinite(Number(value.overallScore))) return null;
    const dimensions = value.dimensions && typeof value.dimensions === 'object' ? value.dimensions : {};
    return {
      id, at, kind, itemId,
      topic: boundedText(value.topic, 100),
      source: value.source === 'local' ? 'local' : value.source === 'mock' ? 'mock' : 'ai',
      overallScore: boundedScore(value.overallScore, false),
      dimensions: {
        correctness: boundedScore(dimensions.correctness, true),
        completeness: boundedScore(dimensions.completeness, true),
        structure: boundedScore(dimensions.structure, true),
        tradeoffs: boundedScore(dimensions.tradeoffs, true)
      },
      summary,
      gaps: boundedList(value.gaps, 6, 500)
    };
  }

  function appendInterviewHistory(history, evaluation, payload, now) {
    const safePayload = buildInterviewPayload(payload);
    const source = evaluation && typeof evaluation === 'object' ? evaluation : {};
    const stamp = Number.isFinite(now) ? Math.round(now) : Date.now();
    const entry = normaliseInterviewHistoryEntry({
      id: safePayload.kind + '-' + safePayload.item.id + '-' + stamp,
      at: stamp,
      kind: safePayload.kind,
      itemId: safePayload.item.id,
      topic: safePayload.item.topic,
      source: source.source,
      overallScore: source.overallScore,
      dimensions: {
        correctness: source.dimensions && source.dimensions.correctness && source.dimensions.correctness.score,
        completeness: source.dimensions && source.dimensions.completeness && source.dimensions.completeness.score,
        structure: source.dimensions && source.dimensions.structure && source.dimensions.structure.score,
        tradeoffs: source.dimensions && source.dimensions.tradeoffs && source.dimensions.tradeoffs.score
      },
      summary: source.summary,
      gaps: source.gaps
    });
    if (!entry) return (Array.isArray(history) ? history : []).map(normaliseInterviewHistoryEntry).filter(Boolean).slice(-INTERVIEW_HISTORY_LIMIT);
    const current = (Array.isArray(history) ? history : []).map(normaliseInterviewHistoryEntry).filter(Boolean).filter(item => item.id !== entry.id);
    return [...current, entry].sort((left, right) => left.at - right.at || left.id.localeCompare(right.id)).slice(-INTERVIEW_HISTORY_LIMIT);
  }

  async function requestInterviewEvaluation(input, options) {
    const config = options || {};
    const payload = buildInterviewPayload(input);
    const fetchImpl = config.fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    if (!fetchImpl) throw new Error('AI backend is unavailable');
    const token = boundedText(config.token, 500);
    if (!token) {
      const missing = new Error('Sync token is required for external AI interview');
      missing.code = 'AI_AUTH_REQUIRED';
      missing.status = 401;
      throw missing;
    }
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutMs = Math.max(1000, Math.min(60000, Number(config.timeoutMs) || 60000));
    const timeout = setTimeout(() => { if (controller) controller.abort(); }, timeoutMs);
    try {
      const response = await fetchImpl(config.url || './api/ai/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify(payload),
        signal: controller ? controller.signal : undefined
      });
      let data = null;
      try { data = await response.json(); } catch (_) {}
      if (!response.ok) {
        const failure = new Error(data && data.error ? data.error : `AI backend returned ${response.status}`);
        failure.status = response.status;
        failure.code = data && data.code ? data.code : '';
        throw failure;
      }
      const evaluation = normaliseInterviewEvaluation(data && data.evaluation, payload);
      if (!evaluation) {
        const invalid = new Error('AI backend returned an invalid interview evaluation');
        invalid.status = response.status;
        invalid.code = 'AI_BAD_RESPONSE';
        throw invalid;
      }
      return { ...evaluation, source: evaluation.source === 'mock' ? 'mock' : 'ai' };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function evaluateInterview(input, options) {
    const payload = buildInterviewPayload(input);
    try {
      return await requestInterviewEvaluation(payload, options);
    } catch (error) {
      return {
        ...buildLocalInterviewEvaluation(payload),
        fallbackReason: boundedText(error && error.message, 300),
        fallbackCode: boundedText(error && error.code, 40),
        fallbackStatus: Number.isFinite(error && error.status) ? error.status : null
      };
    }
  }

  function renderInterviewEvaluation(result) {
    if (!result) return '';
    const labels = {
      correctness: 'Техническая корректность', completeness: 'Полнота',
      structure: 'Структура', tradeoffs: 'Компромиссы'
    };
    const dimensions = Object.keys(labels).map(key => {
      const value = result.dimensions && result.dimensions[key] || {};
      const score = Number.isFinite(value.score) ? value.score + '%' : '—';
      return '<article class="ip-ai-dimension"><span>' + labels[key] + '</span><strong>' + score +
        '</strong><p>' + escapeText(value.feedback) + '</p></article>';
    }).join('');
    const rubric = list(result.rubric).map(item => {
      const mark = item.met === true ? '✓' : item.met === false ? '✗' : '•';
      return '<article class="ip-ai-rubric-item"><div><span aria-hidden="true">' + mark + '</span><strong>' +
        escapeText(item.criterion) + '</strong></div>' +
        (item.evidence ? '<p><b>Evidence:</b> ' + escapeText(item.evidence) + '</p>' : '') +
        (item.feedback ? '<p>' + escapeText(item.feedback) + '</p>' : '') + '</article>';
    }).join('');
    const followUps = list(result.followUps).map((item, index) =>
      '<article class="ip-ai-follow-up"><strong>' + escapeText(item.question) + '</strong><p>' + escapeText(item.reason) +
      '</p><button type="button" class="btn btn-outline btn-sm" data-ip-follow-up-index="' + index + '">Ответить на уточнение</button></article>'
    ).join('');
    return '<section class="ip-ai-evaluation" aria-live="polite">' +
      '<header><span class="ip-ai-source">' + (result.source === 'local' ? 'Локальная проверка' : result.source === 'mock' ? 'Тестовый AI' : 'AI-интервьюер') +
      '</span><strong class="ip-ai-score">' + escapeText(result.overallScore) + '%</strong></header>' +
      '<p class="ip-ai-summary">' + escapeText(result.summary) + '</p>' +
      '<div class="ip-ai-dimensions">' + dimensions + '</div>' +
      (rubric ? '<div class="ip-ai-rubric"><div class="ip-block-title">Проверка по рубрике</div>' + rubric + '</div>' : '') +
      renderBullets('Что добавить', result.gaps, 'ip-ai-gaps') +
      (result.improvedAnswer ? '<div class="ip-block ip-ai-improved"><div class="ip-block-title">Улучшенная версия</div><p>' + escapeText(result.improvedAnswer) + '</p></div>' : '') +
      (followUps ? '<div class="ip-ai-follow-ups"><div class="ip-block-title">Уточняющие вопросы</div>' + followUps + '</div>' : '') +
      (result.caution ? '<p class="ip-ai-caution">' + escapeText(result.caution) + '</p>' : '') + '</section>';
  }

  function renderScore(result) {
    if (!result) return '';
    const cls = result.percent >= 75 ? 'ip-score-good' : (result.percent >= 50 ? 'ip-score-mid' : 'ip-score-low');
    const missing = list(result.missing).length
      ? renderBullets('Не раскрыто', result.missing, 'ip-missing')
      : '';
    return '<div class="ip-score ' + cls + '" role="status" aria-live="polite">' +
      '<div class="ip-score-num">' + result.percent + '%</div>' +
      '<div class="ip-score-text"><strong>' + escapeText(result.verdict) + '</strong>' +
      '<span>' + result.covered + ' из ' + result.total + ' пунктов рубрики</span></div></div>' + missing;
  }

  function summary(data) {
    return {
      star: items(data, 'star').length,
      systemDesign: items(data, 'systemDesign').length,
      topics: [...new Set(items(data, 'systemDesign').map(i => i.topic))].sort()
    };
  }

  return {
    items, findItem, buildInterviewPayload, normaliseInterviewEvaluation, buildLocalInterviewEvaluation,
    normaliseInterviewHistoryEntry, appendInterviewHistory, requestInterviewEvaluation, evaluateInterview, score, summary,
    renderStar, renderSystemDesign, renderReference, renderRubricForm, renderInterviewEvaluation, renderScore,
    INTERVIEW_HISTORY_LIMIT
  };
});
