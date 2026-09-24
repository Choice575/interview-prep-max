(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IPMaxAICoach = api;
})(typeof self !== 'undefined' ? self : globalThis, function() {
  const MAX_TOPICS = 5;
  const MAX_ITEMS = 3;
  const MAX_QUESTION_DETAILS = 15;
  const REVIEW_HISTORY_LIMIT = 30;
  const SLOW_ANSWER_SECONDS = 60;
  const REVIEW_PAGES = new Set(['exam', 'trainers', 'study', 'interview', 'practices', 'tips']);
  const REVIEW_CATEGORIES = new Set(['definition', 'scenario', 'tradeoff', 'output']);
  const REVIEW_LEVELS = new Set(['Junior', 'Junior+', 'Middle', 'Middle+', 'Senior', 'Senior-track']);
  const PROBLEM_TYPES = new Set([
    'knowledge_gap', 'concept_confusion', 'diagnostic_order', 'cause_model',
    'inattention', 'slow_response', 'unstable_knowledge'
  ]);

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
    const attempt = {
      questionId,
      topic,
      score: number(value.score, 0, 1, 0),
      responseSeconds: Math.round(number(value.responseSeconds, 0, 3600, 0)),
      at: Math.round(number(value.at, 0, Number.MAX_SAFE_INTEGER, Date.now()))
    };
    if (Number.isInteger(value.selectedAnswerIndex) && value.selectedAnswerIndex >= 0 && value.selectedAnswerIndex <= 20) {
      attempt.selectedAnswerIndex = value.selectedAnswerIndex;
    }
    return attempt;
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

  function normaliseQuestionDetail(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const result = ['incorrect', 'slow-correct'].includes(value.result) ? value.result : '';
    const question = text(value.question, 600);
    const topic = text(value.topic, 80);
    if (!result || !question || !topic) return null;
    return {
      questionId: text(value.questionId, 80),
      topic,
      level: text(value.level, 40),
      category: text(value.category, 40) || 'definition',
      question,
      result,
      selectedAnswer: text(value.selectedAnswer, 400),
      correctAnswer: text(value.correctAnswer, 400),
      explanation: text(value.explanation, 800),
      responseSeconds: Math.round(number(value.responseSeconds, 0, 3600, 0))
    };
  }

  function buildQuestionDetails(questions, attempts) {
    const byId = new Map((Array.isArray(questions) ? questions : [])
      .filter(question => question && (typeof question.id === 'string' || Number.isFinite(question.id)))
      .map(question => [String(question.id), question]));
    if (!byId.size) return [];
    return attempts
      .filter(attempt => attempt.score < 1 || attempt.responseSeconds >= SLOW_ANSWER_SECONDS)
      .map(attempt => {
        const question = byId.get(attempt.questionId);
        if (!question || !Array.isArray(question.options)) return null;
        const selectedIndex = Number.isInteger(attempt.selectedAnswerIndex) ? attempt.selectedAnswerIndex : -1;
        const correctIndex = Number(question.answer);
        return normaliseQuestionDetail({
          questionId: attempt.questionId,
          topic: question.topic || attempt.topic,
          level: question.level,
          category: question.category || 'definition',
          question: question.q,
          result: attempt.score < 1 ? 'incorrect' : 'slow-correct',
          selectedAnswer: selectedIndex >= 0 ? question.options[selectedIndex] : '',
          correctAnswer: Number.isInteger(correctIndex) ? question.options[correctIndex] : '',
          explanation: question.explanation,
          responseSeconds: attempt.responseSeconds
        });
      })
      .filter(Boolean)
      .sort((left, right) => left.result === right.result
        ? right.responseSeconds - left.responseSeconds
        : left.result === 'incorrect' ? -1 : 1)
      .slice(0, MAX_QUESTION_DETAILS);
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
    const questionDetails = Array.isArray(control.questionDetails)
      ? control.questionDetails.map(normaliseQuestionDetail).filter(Boolean).slice(0, MAX_QUESTION_DETAILS)
      : [];
    return {
      schemaVersion: questionDetails.length || Number(source.schemaVersion) === 2 ? 2 : 1,
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
        topics,
        ...(questionDetails.length ? { questionDetails } : {})
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
    const questionDetails = buildQuestionDetails(source.questions, attempts);
    return normaliseReviewPayload({
      schemaVersion: questionDetails.length ? 2 : 1,
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
        topics: summariseTopics(attempts),
        questionDetails
      },
      focus: plan.focus && plan.focus.topic
    });
  }

  function stringList(value) {
    return Array.isArray(value) ? value.map(item => text(item, 300)).filter(Boolean).slice(0, MAX_ITEMS) : [];
  }

  function normaliseDiagnosticReview(value) {
    const verdictSource = value && value.verdict && typeof value.verdict === 'object' ? value.verdict : {};
    const summary = text(verdictSource.summary, 1600);
    if (!summary) return null;
    const diagnostics = Array.isArray(value.diagnostics) ? value.diagnostics.map(item => {
      if (!item || typeof item !== 'object') return null;
      const concept = text(item.concept, 120);
      const explanation = text(item.explanation, 1200);
      if (!concept || !explanation) return null;
      return {
        concept,
        severity: ['low', 'medium', 'high'].includes(item.severity) ? item.severity : 'medium',
        problemType: PROBLEM_TYPES.has(item.problemType) ? item.problemType : 'knowledge_gap',
        evidence: stringList(item.evidence),
        explanation,
        confidence: number(item.confidence, 0, 1, 0.5)
      };
    }).filter(Boolean).slice(0, 5) : [];
    const actionPlan = Array.isArray(value.actionPlan) ? value.actionPlan.map((item, index) => {
      if (!item || typeof item !== 'object') return null;
      const task = text(item.task, 500);
      const successCriterion = text(item.successCriterion, 500);
      if (!task || !successCriterion) return null;
      return {
        priority: Math.round(number(item.priority, 1, 9, index + 1)),
        task,
        practice: text(item.practice, 500),
        successCriterion,
        page: REVIEW_PAGES.has(item.page) ? item.page : 'exam',
        topic: text(item.topic, 80)
      };
    }).filter(Boolean).slice(0, 5) : [];
    if (!actionPlan.length) return null;
    const studyPlan = Array.isArray(value.studyPlan) ? value.studyPlan.map((item, index) => {
      if (!item || typeof item !== 'object') return null;
      const title = text(item.title, 160);
      if (!title) return null;
      return {
        day: Math.round(number(item.day, 1, 7, index + 1)),
        title,
        actions: stringList(item.actions),
        successCriterion: text(item.successCriterion, 500)
      };
    }).filter(Boolean).slice(0, 7) : [];
    const retestSource = value.retest && typeof value.retest === 'object' ? value.retest : {};
    return {
      schemaVersion: 2,
      verdict: {
        levelEstimate: text(verdictSource.levelEstimate, 80),
        readiness: Math.round(number(verdictSource.readiness, 0, 100, 0)),
        summary
      },
      diagnostics,
      actionPlan,
      studyPlan,
      retest: {
        topics: Array.isArray(retestSource.topics) ? retestSource.topics.map(item => text(item, 80)).filter(Boolean).slice(0, 3) : [],
        categories: Array.isArray(retestSource.categories) ? retestSource.categories.filter(item => REVIEW_CATEGORIES.has(item)).slice(0, 4) : [],
        levels: Array.isArray(retestSource.levels) ? retestSource.levels.filter(item => REVIEW_LEVELS.has(item)).slice(0, 6) : [],
        size: Math.round(number(retestSource.size, 3, 20, 10)),
        successCriterion: text(retestSource.successCriterion, 500)
      },
      caution: text(value.caution, 800)
    };
  }

  function normaliseReview(value) {
    if (!value || typeof value !== 'object') return null;
    if (Number(value.schemaVersion) === 2 || value.verdict) return normaliseDiagnosticReview(value);
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
    if (payload.schemaVersion === 2) return buildLocalDiagnosticReview(payload, weakest);
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

  function buildLocalDiagnosticReview(payload, weakestTopic) {
    const control = payload.control;
    const detail = Array.isArray(control.questionDetails) ? control.questionDetails[0] : null;
    const topic = detail && detail.topic || weakestTopic && weakestTopic.topic || payload.focus || 'приоритетная тема';
    const accuracy = control.accuracy === null ? 0 : control.accuracy;
    const evidence = [];
    if (detail && detail.selectedAnswer) {
      evidence.push(`Выбран ответ «${detail.selectedAnswer}», правильный — «${detail.correctAnswer || 'не указан'}».`);
    }
    if (detail && detail.responseSeconds >= SLOW_ANSWER_SECONDS) evidence.push(`Ответ занял ${detail.responseSeconds} секунд.`);
    if (!evidence.length && weakestTopic) evidence.push(`Точность по теме «${topic}» — ${weakestTopic.accuracy}% на ${weakestTopic.attempted} ответах.`);
    const problemType = detail && detail.result === 'slow-correct'
      ? 'slow_response'
      : detail && detail.selectedAnswer ? 'concept_confusion' : 'knowledge_gap';
    const criterion = 'Не менее 4 из 5 правильных ответов и среднее время до 45 секунд.';
    return {
      schemaVersion: 2,
      verdict: {
        levelEstimate: payload.profile.level,
        readiness: accuracy,
        summary: `Главный фокус — «${topic}». Текущая точность контрольной — ${accuracy}%; сначала устраните конкретную ошибку, затем подтвердите результат повторной серией.`
      },
      diagnostics: [{
        concept: topic,
        severity: accuracy < 60 ? 'high' : 'medium',
        problemType,
        evidence,
        explanation: detail && detail.explanation
          ? detail.explanation
          : `Результат по теме «${topic}» пока недостаточно устойчив для собеседования.`,
        confidence: detail ? 0.8 : 0.55
      }],
      actionPlan: [{
        priority: 1,
        task: `Разобрать ошибку и повторить ключевые различия по теме «${topic}».`,
        practice: `Пройти 5 сценарных вопросов по теме «${topic}» и проговорить причины выбора вслух.`,
        successCriterion: criterion,
        page: 'exam',
        topic
      }],
      studyPlan: [
        { day: 1, title: `Разбор: ${topic}`, actions: ['Выписать причину ошибки', 'Сравнить выбранный и правильный варианты'], successCriterion: 'Объяснить различие без подсказки.' },
        { day: 2, title: `Практика: ${topic}`, actions: ['Решить 5 сценарных вопросов'], successCriterion: criterion },
        { day: 3, title: 'Контроль результата', actions: ['Пройти повторную контрольную'], successCriterion: criterion }
      ],
      retest: {
        topics: [topic],
        categories: detail && detail.category ? [detail.category] : [],
        levels: detail && detail.level ? [detail.level] : [],
        size: 5,
        successCriterion: criterion
      },
      caution: control.attempted < 5 ? 'Выборка небольшая; подтвердите вывод повторной контрольной.' : '',
      source: 'local'
    };
  }

  // Коды приходят из server/ai-service.js. Без перевода в текст пользователь
  // видел только «Backend недоступен» и не мог отличить незаданный провайдер
  // от таймаута или неверного ключа — то есть не знал, что именно починить.
  const FALLBACK_HINTS = {
    AI_AUTH_REQUIRED: 'Для внешнего AI нужен токен синхронизации. Укажите его в настройках синхронизации.',
    AI_NOT_CONFIGURED: 'Внешний AI не настроен на сервере. Задайте провайдера в разделе «Настройки AI».',
    AI_TIMEOUT: 'Провайдер не ответил вовремя. Увеличьте таймаут в настройках AI (30 000–45 000 мс).',
    AI_UNAVAILABLE: 'Сервер не смог связаться с провайдером. Проверьте адрес API и доступность сети.',
    AI_BAD_RESPONSE: 'Провайдер вернул ответ в неожидаемом формате. Попробуйте другую модель.',
    AI_PROVIDER_ERROR: 'Провайдер отклонил запрос. Проверьте API-ключ и название модели.',
    INVALID_REVIEW_INPUT: 'В контрольной пока нет ответов, которые можно разобрать.'
  };

  /**
   * Человеческое объяснение, почему разбор локальный. Возвращает пустую строку,
   * когда сказать нечего конкретного: пустой подписи лучше, чем догадка.
   */
  function describeFallback(code, status, message) {
    const known = FALLBACK_HINTS[text(code, 40)];
    if (known) return known;
    if (status === 429) return 'Слишком много запросов на разбор. Подождите минуту и повторите.';
    if (status === 404) return 'Backend разбора не найден: приложение открыто как статический сайт.';
    if (Number.isFinite(status) && status >= 500) return 'Сервер разбора временно недоступен.';
    if (/abort/i.test(text(message, 300))) return 'Запрос разбора превысил ожидание и был прерван.';
    if (!status) return 'Backend недоступен — данные не покидали браузер.';
    return '';
  }

  async function requestReview(rawPayload, options) {
    const config = options || {};
    const fetchImpl = config.fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    if (!fetchImpl) throw new Error('AI backend is unavailable');
    const token = text(config.token, 500);
    if (!token) {
      const missing = new Error('Sync token is required for external AI review');
      missing.code = 'AI_AUTH_REQUIRED';
      missing.status = 401;
      throw missing;
    }
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = setTimeout(() => { if (controller) controller.abort(); }, number(config.timeoutMs, 1000, 60000, 15000));
    try {
      const response = await fetchImpl(config.url || './api/ai/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify(normaliseReviewPayload(rawPayload)),
        signal: controller ? controller.signal : undefined
      });
      let data = null;
      try { data = await response.json(); } catch (_) {}
      if (!response.ok) {
        const failure = new Error(data && data.error ? data.error : `AI backend returned ${response.status}`);
        // Код и статус нужны выше, чтобы объяснить причину пользователю.
        failure.status = response.status;
        failure.code = data && data.code ? data.code : '';
        throw failure;
      }
      const review = normaliseReview(data && data.review ? data.review : data);
      if (!review) {
        const invalid = new Error('AI backend returned an invalid review');
        invalid.status = response.status;
        invalid.code = 'AI_BAD_RESPONSE';
        throw invalid;
      }
      return { ...review, source: 'ai' };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function review(payload, options) {
    try {
      return await requestReview(payload, options);
    } catch (error) {
      const code = text(error && error.code, 40);
      const status = Number.isFinite(error && error.status) ? error.status : 0;
      const message = text(error && error.message, 300);
      return {
        ...buildLocalReview(payload),
        // fallbackReason — техническая строка для диагностики, fallbackHint —
        // то, что показывается пользователю.
        fallbackReason: message,
        fallbackCode: code,
        fallbackStatus: status || null,
        fallbackHint: describeFallback(code, status, message)
      };
    }
  }

  function normaliseReviewHistoryEntry(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const at = Math.round(number(value.at, 0, Number.MAX_SAFE_INTEGER, -1));
    const id = text(value.id, 100);
    const reviewValue = normaliseReview(value.review);
    if (!id || at < 0 || !reviewValue || reviewValue.schemaVersion !== 2) return null;
    const metrics = value.metrics && typeof value.metrics === 'object' ? value.metrics : {};
    return {
      id,
      at,
      source: value.source === 'local' ? 'local' : 'ai',
      metrics: {
        accuracy: Math.round(number(metrics.accuracy, 0, 100, 0)),
        attempted: Math.round(number(metrics.attempted, 0, 30, 0)),
        total: Math.round(number(metrics.total, 0, 30, 0))
      },
      review: reviewValue
    };
  }

  function appendReviewHistory(history, reviewValue, metrics, now) {
    const at = Math.round(number(now, 0, Number.MAX_SAFE_INTEGER, Date.now()));
    const review = normaliseReview(reviewValue);
    if (!review || review.schemaVersion !== 2) return (Array.isArray(history) ? history : []).map(normaliseReviewHistoryEntry).filter(Boolean).slice(-REVIEW_HISTORY_LIMIT);
    const entry = normaliseReviewHistoryEntry({
      id: 'ai-review-' + at,
      at,
      source: reviewValue && reviewValue.source,
      metrics,
      review
    });
    const current = (Array.isArray(history) ? history : []).map(normaliseReviewHistoryEntry).filter(Boolean);
    const withoutSame = current.filter(item => item.id !== entry.id);
    return [...withoutSame, entry].sort((left, right) => left.at - right.at || left.id.localeCompare(right.id)).slice(-REVIEW_HISTORY_LIMIT);
  }

  function buildWeeklyReviewTrend(history, now) {
    const entries = (Array.isArray(history) ? history : []).map(normaliseReviewHistoryEntry).filter(Boolean);
    const end = number(now, 0, Number.MAX_SAFE_INTEGER, Date.now());
    const day = 86400000;
    const summarise = items => {
      if (!items.length) return { count: 0, accuracy: null, readiness: null };
      return {
        count: items.length,
        accuracy: Math.round(items.reduce((sum, item) => sum + item.metrics.accuracy, 0) / items.length),
        readiness: Math.round(items.reduce((sum, item) => sum + item.review.verdict.readiness, 0) / items.length)
      };
    };
    const current = summarise(entries.filter(item => item.at > end - 7 * day && item.at <= end));
    const previous = summarise(entries.filter(item => item.at > end - 14 * day && item.at <= end - 7 * day));
    return {
      current,
      previous,
      accuracyDelta: current.count && previous.count ? current.accuracy - previous.accuracy : null,
      readinessDelta: current.count && previous.count ? current.readiness - previous.readiness : null
    };
  }

  function buildReviewTrend(history, now) {
    const entries = (Array.isArray(history) ? history : []).map(normaliseReviewHistoryEntry).filter(Boolean).sort((left, right) => left.at - right.at);
    const current = entries.at(-1) || null;
    const previous = entries.at(-2) || null;
    return {
      count: entries.length,
      current,
      previous,
      recent: entries.slice(-5).reverse(),
      weekly: buildWeeklyReviewTrend(entries, now),
      accuracyDelta: current && previous ? current.metrics.accuracy - previous.metrics.accuracy : null,
      readinessDelta: current && previous ? current.review.verdict.readiness - previous.review.verdict.readiness : null
    };
  }

  return {
    normaliseAttempt, normaliseControlSession, normaliseReviewPayload, normaliseQuestionDetail,
    normaliseReview, normaliseDiagnosticReview, buildReviewPayload, buildQuestionDetails,
    buildLocalReview, buildLocalDiagnosticReview, requestReview, review, describeFallback, FALLBACK_HINTS,
    normaliseReviewHistoryEntry, appendReviewHistory, buildReviewTrend, buildWeeklyReviewTrend,
    MAX_QUESTION_DETAILS, REVIEW_HISTORY_LIMIT, SLOW_ANSWER_SECONDS
  };
});
