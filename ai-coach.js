(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IPMaxAICoach = api;
})(typeof self !== 'undefined' ? self : globalThis, function() {
  const MAX_TOPICS = 5;
  const MAX_ITEMS = 3;

  function text(value, limit) {
    return typeof value === 'string' ? value.trim().slice(0, limit) : '';
  }

  function number(value, minimum, maximum, fallback) {
    return Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
  }

  function normaliseAttempt(value) {
    if (!value || typeof value !== 'object') return null;
    const questionId = typeof value.questionId === 'string' || Number.isFinite(value.questionId) ? String(value.questionId).slice(0, 80) : '';
    const topic = text(value.topic, 80);
    if (!questionId || !topic) return null;
    return {
      questionId,
      topic,
      score: number(value.score, 0, 1, 0),
      responseSeconds: Math.round(number(value.responseSeconds, 0, 3600, 0)),
      at: Math.round(number(value.at, 0, Number.MAX_SAFE_INTEGER, Date.now()))
    };
  }

  function normaliseControlSession(value) {
    if (!value || typeof value !== 'object') return null;
    const questionIds = Array.isArray(value.questionIds)
      ? [...new Set(value.questionIds.filter(id => typeof id === 'string' || Number.isFinite(id)).map(id => String(id).slice(0, 80)))].slice(0, 30)
      : [];
    const seen = new Set();
    const attempts = Array.isArray(value.attempts) ? value.attempts.map(normaliseAttempt).filter(attempt => {
      if (!attempt || seen.has(attempt.questionId)) return false;
      seen.add(attempt.questionId);
      return !questionIds.length || questionIds.includes(attempt.questionId);
    }).slice(0, 30) : [];
    if (!questionIds.length && !attempts.length) return null;
    return {
      id: text(value.id, 80) || 'control-session',
      startedAt: Math.round(number(value.startedAt, 0, Number.MAX_SAFE_INTEGER, Date.now())),
      completedAt: Number.isFinite(value.completedAt) ? Math.round(number(value.completedAt, 0, Number.MAX_SAFE_INTEGER, 0)) : null,
      questionIds: questionIds.length ? questionIds : attempts.map(attempt => attempt.questionId),
      topics: Array.isArray(value.topics) ? [...new Set(value.topics.map(topic => text(topic, 80)).filter(Boolean))].slice(0, MAX_TOPICS) : [],
      attempts
    };
  }

  function summariseTopics(attempts) {
    const topics = new Map();
    attempts.forEach(attempt => {
      if (!topics.has(attempt.topic)) topics.set(attempt.topic, { topic: attempt.topic, attempted: 0, score: 0, seconds: 0 });
      const topic = topics.get(attempt.topic);
      topic.attempted++;
      topic.score += attempt.score;
      topic.seconds += attempt.responseSeconds;
    });
    return [...topics.values()].map(item => ({
      topic: item.topic,
      attempted: item.attempted,
      accuracy: Math.round(item.score / item.attempted * 100),
      averageSeconds: Math.round(item.seconds / item.attempted)
    })).sort((left, right) => left.accuracy - right.accuracy || right.attempted - left.attempted).slice(0, MAX_TOPICS);
  }

  function normaliseReviewPayload(value) {
    const source = value && typeof value === 'object' ? value : {};
    const profile = source.profile && typeof source.profile === 'object' ? source.profile : {};
    const control = source.control && typeof source.control === 'object' ? source.control : {};
    const topics = Array.isArray(control.topics) ? control.topics.map(item => ({
      topic: text(item && item.topic, 80),
      attempted: Math.round(number(item && item.attempted, 0, 30, 0)),
      accuracy: Math.round(number(item && item.accuracy, 0, 100, 0)),
      averageSeconds: Math.round(number(item && item.averageSeconds, 0, 3600, 0))
    })).filter(item => item.topic && item.attempted > 0).slice(0, MAX_TOPICS) : [];
    return {
      schemaVersion: 1,
      profile: {
        role: text(profile.role, 40) || 'DevOps',
        level: text(profile.level, 40) || 'Middle',
        daysUntilInterview: Number.isFinite(profile.daysUntilInterview) ? Math.round(number(profile.daysUntilInterview, -3650, 3650, 0)) : null
      },
      control: {
        attempted: Math.round(number(control.attempted, 0, 30, 0)),
        total: Math.round(number(control.total, 0, 30, 0)),
        accuracy: Number.isFinite(control.accuracy) ? Math.round(number(control.accuracy, 0, 100, 0)) : null,
        averageSeconds: Math.round(number(control.averageSeconds, 0, 3600, 0)),
        topics
      },
      focus: text(source.focus, 80)
    };
  }

  function buildReviewPayload(input) {
    const source = input && typeof input === 'object' ? input : {};
    const plan = source.plan && typeof source.plan === 'object' ? source.plan : {};
    const profile = source.profile && typeof source.profile === 'object' ? source.profile : {};
    const session = normaliseControlSession(source.session);
    const attempts = session ? session.attempts : [];
    const score = attempts.reduce((sum, attempt) => sum + attempt.score, 0);
    const seconds = attempts.reduce((sum, attempt) => sum + attempt.responseSeconds, 0);
    return normaliseReviewPayload({
      profile: {
        role: plan.roleLabel || profile.role,
        level: plan.level || profile.level,
        daysUntilInterview: plan.daysUntil
      },
      control: {
        attempted: attempts.length,
        total: session ? session.questionIds.length : 0,
        accuracy: attempts.length ? Math.round(score / attempts.length * 100) : null,
        averageSeconds: attempts.length ? Math.round(seconds / attempts.length) : 0,
        topics: summariseTopics(attempts)
      },
      focus: plan.focus && plan.focus.topic
    });
  }

  function stringList(value) {
    return Array.isArray(value) ? value.map(item => text(item, 300)).filter(Boolean).slice(0, MAX_ITEMS) : [];
  }

  function normaliseReview(value) {
    if (!value || typeof value !== 'object') return null;
    const summary = text(value.summary, 1200);
    const strengths = stringList(value.strengths);
    const gaps = stringList(value.gaps);
    const nextSteps = stringList(value.nextSteps);
    if (!summary || !nextSteps.length) return null;
    return { summary, strengths, gaps, nextSteps, caution: text(value.caution, 500) };
  }

  function buildLocalReview(rawPayload) {
    const payload = normaliseReviewPayload(rawPayload);
    const control = payload.control;
    const weakest = control.topics[0] || null;
    const strongest = control.topics.slice().sort((left, right) => right.accuracy - left.accuracy)[0] || null;
    const accuracy = control.accuracy === null ? 0 : control.accuracy;
    const summary = control.attempted
      ? `Разобрано ${control.attempted} из ${control.total || control.attempted} ответов. Текущая точность — ${accuracy}%.`
      : 'В контрольной пока нет ответов для разбора.';
    const strengths = strongest && strongest.accuracy >= 60 ? [`Лучший результат сейчас у темы «${strongest.topic}» — ${strongest.accuracy}%.`] : [];
    const hasWeakTopic = weakest && weakest.accuracy < 80;
    const gaps = hasWeakTopic
      ? [`Наибольшего внимания требует «${weakest.topic}» — ${weakest.accuracy}% на ${weakest.attempted} ответах.`]
      : control.attempted < control.total ? ['Результат пока предварительный: завершите контрольную, чтобы надёжно определить пробелы.'] : [];
    const nextSteps = hasWeakTopic ? [
      `Повторите ключевые решения по теме «${weakest.topic}» и проговорите причины выбора вслух.`,
      `Пройдите ещё 5 вопросов по теме «${weakest.topic}», затем сравните точность.`,
      'Зафиксируйте один практический вывод в журнале навыков.'
    ] : control.attempted < control.total ? [
      `Ответьте на оставшиеся ${control.total - control.attempted} вопросов контрольной.`,
      strongest ? `Закрепите результат по теме «${strongest.topic}» вопросом более высокого уровня.` : 'Добавьте ещё несколько ответов для устойчивой оценки.',
      'Повторите разбор после завершения сессии.'
    ] : ['Закрепите результат вопросами более высокого уровня и повторите контрольную через несколько дней.'];
    return { summary, strengths, gaps, nextSteps, caution: '', source: 'local' };
  }

  async function requestReview(rawPayload, options) {
    const config = options || {};
    const fetchImpl = config.fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    if (!fetchImpl) throw new Error('AI backend is unavailable');
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = setTimeout(() => { if (controller) controller.abort(); }, number(config.timeoutMs, 1000, 60000, 15000));
    try {
      const response = await fetchImpl(config.url || './api/ai/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normaliseReviewPayload(rawPayload)),
        signal: controller ? controller.signal : undefined
      });
      let data = null;
      try { data = await response.json(); } catch (_) {}
      if (!response.ok) throw new Error(data && data.error ? data.error : `AI backend returned ${response.status}`);
      const review = normaliseReview(data && data.review ? data.review : data);
      if (!review) throw new Error('AI backend returned an invalid review');
      return { ...review, source: 'ai' };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function review(payload, options) {
    try {
      return await requestReview(payload, options);
    } catch (error) {
      return { ...buildLocalReview(payload), fallbackReason: text(error && error.message, 300) };
    }
  }

  return {
    normaliseAttempt, normaliseControlSession, normaliseReviewPayload, normaliseReview,
    buildReviewPayload, buildLocalReview, requestReview, review
  };
});
