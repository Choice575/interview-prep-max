(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IPMaxAITutor = api;
})(typeof self !== 'undefined' ? self : globalThis, function() {
  const MODES = new Set(['explain', 'socratic', 'practice']);
  const STYLES = new Set(['simple', 'technical', 'production', 'interview']);

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function wellFormedText(value) {
    if (typeof value !== 'string') return '';
    let result = '';
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (code >= 0xD800 && code <= 0xDBFF) {
        const next = value.charCodeAt(index + 1);
        if (next >= 0xDC00 && next <= 0xDFFF) {
          result += value[index] + value[index + 1];
          index += 1;
        } else result += '\uFFFD';
      } else if (code >= 0xDC00 && code <= 0xDFFF) result += '\uFFFD';
      else result += value[index];
    }
    return result;
  }

  function boundedText(value, limit) {
    return wellFormedText(value).trim().slice(0, limit).replace(/[\uD800-\uDBFF]$/, '');
  }

  function boundedList(value, count, limit) {
    return list(value).map(item => boundedText(item, limit)).filter(Boolean).slice(0, count);
  }

  function utf8Length(value) {
    return new TextEncoder().encode(String(value)).length;
  }

  function jsonByteLength(value) {
    return utf8Length(JSON.stringify(value));
  }

  function boundedJsonText(value, maxBytes) {
    const text = wellFormedText(value);
    if (maxBytes < 2) return '';
    if (jsonByteLength(text) <= maxBytes) return text;
    const points = Array.from(text);
    let low = 0, high = points.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (jsonByteLength(points.slice(0, middle).join('')) <= maxBytes) low = middle;
      else high = middle - 1;
    }
    return points.slice(0, low).join('');
  }

  function budgetObjectStrings(value, maxBytes) {
    let remaining = maxBytes;
    const visit = item => {
      if (typeof item === 'string') {
        const result = boundedJsonText(item, Math.max(0, remaining));
        remaining = Math.max(0, remaining - jsonByteLength(result));
        return result;
      }
      if (Array.isArray(item)) return item.map(visit);
      if (item && typeof item === 'object') {
        return Object.fromEntries(Object.entries(item).map(([key, child]) => [key, visit(child)]));
      }
      return item;
    };
    return visit(value);
  }

  function hasMixedCredentialBody(value, prefix) {
    const body = value.slice(prefix.length);
    return /[A-Za-z]/.test(body) && /\d/.test(body)
      && !/(?:placeholder|example)/i.test(body) && !/^0+$/.test(body.replace(/[-_]/g, ''));
  }

  function isAwsAccessKey(value) {
    const body = value.slice(4);
    return value !== 'AKIAIOSFODNN7EXAMPLE' && /[A-Z]/.test(body) && /\d/.test(body);
  }

  function isJwt(value) {
    const parts = value.split('.');
    if (parts.length !== 3) return false;
    const decodeObject = segment => {
      try {
        const normalised = segment.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalised + '='.repeat((4 - normalised.length % 4) % 4);
        const bytes = Uint8Array.from(atob(padded), char => char.charCodeAt(0));
        const parsed = JSON.parse(new TextDecoder().decode(bytes));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed);
      } catch (_) {
        return false;
      }
    };
    return decodeObject(parts[0]) && decodeObject(parts[1]);
  }

  function redactTutorText(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)* PRIVATE KEY-----/gi, '[REDACTED PRIVATE KEY]')
      .replace(/([a-z][a-z0-9+.-]*:\/\/)([^/\s:@]+):([^/\s@]+)@/gi, '$1[REDACTED]@')
      .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, 'Bearer [REDACTED]')
      .replace(/\b([A-Z0-9_]*(?:TOKEN|PASSWORD|PASSWD|SECRET|API_KEY|PRIVATE_KEY)[A-Z0-9_]*\s*[=:]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s\r\n]+)/gi, '$1[REDACTED]')
      .replace(/(^|[^A-Za-z0-9_-])(sk-(?:proj-)?[A-Za-z0-9_-]{20,})(?![A-Za-z0-9_-])/g,
        (match, boundary, token) => boundary + (hasMixedCredentialBody(token, token.startsWith('sk-proj-') ? 'sk-proj-' : 'sk-') ? '[REDACTED]' : token))
      .replace(/(^|[^A-Za-z0-9_-])(gh[pousr]_[A-Za-z0-9_-]{20,}|github_pat_[A-Za-z0-9_-]{20,})(?![A-Za-z0-9_-])/g,
        (match, boundary, token) => {
          const prefix = token.startsWith('github_pat_') ? 'github_pat_' : token.slice(0, 4);
          return boundary + (hasMixedCredentialBody(token, prefix) ? '[REDACTED]' : token);
        })
      .replace(/(^|[^A-Z0-9])((?:AKIA|ASIA)[A-Z0-9]{16})(?![A-Z0-9])/g,
        (match, boundary, token) => boundary + (isAwsAccessKey(token) ? '[REDACTED]' : token))
      .replace(/(^|[^A-Za-z0-9_-])(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})(?![A-Za-z0-9_-])/g,
        (match, boundary, token) => boundary + (isJwt(token) ? '[REDACTED]' : token))
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED EMAIL]')
      .replace(/\b([A-Za-z]:\\Users\\)[^\\\r\n]+/g, '$1[REDACTED]')
      .replace(/\/(home|Users)\/[^/\s]+/g, '/$1/[REDACTED]');
  }

  function redactTutorPayload(value, depth) {
    const level = Number.isInteger(depth) ? depth : 0;
    if (level > 8) return null;
    if (typeof value === 'string') return redactTutorText(value);
    if (Array.isArray(value)) return value.map(item => redactTutorPayload(item, level + 1));
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactTutorPayload(item, level + 1)]));
    }
    return value;
  }

  function normaliseCourseContext(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      key: boundedText(source.key, 200),
      courseId: boundedText(source.courseId, 100),
      chapterId: boundedText(source.chapterId, 100),
      courseTitle: boundedText(source.courseTitle, 300),
      chapterTitle: boundedText(source.chapterTitle, 300),
      kind: boundedText(source.kind, 40),
      level: boundedText(source.level, 40),
      objective: boundedText(source.objective, 2500),
      expectedResult: boundedText(source.expectedResult, 2500),
      practice: boundedList(source.practice, 10, 800),
      pitfalls: boundedList(source.pitfalls, 10, 800),
      productionLayer: boundedText(source.productionLayer, 2000),
      artifact: boundedText(source.artifact, 1200),
      materials: boundedList(source.materials, 10, 1200)
    };
  }

  function buildCourseTutorContext(courseValue, chapterValue, bodyValue) {
    const course = courseValue && typeof courseValue === 'object' ? courseValue : {};
    const chapter = chapterValue && typeof chapterValue === 'object' ? chapterValue : {};
    const body = bodyValue && typeof bodyValue === 'object' ? bodyValue : {};
    let materials = [];
    if (body.kind === 'lesson') {
      materials = [body.objective, body.expectedResult, ...list(body.practice), ...list(body.pitfalls), body.productionLayer, body.artifact];
    } else if (body.kind === 'mini') {
      materials = [...list(body.questions), ...list(body.commonMistakes)];
    } else if (body.kind === 'weekly') {
      materials = list(body.parts).map(part => {
        const source = part && typeof part === 'object' ? part : {};
        return source.name ? source.name + ' — ' + (Number(source.score) || 0) + ' баллов' : '';
      });
    } else if (body.kind === 'incident') {
      materials = [body.context, ...list(body.evidence), body.task];
    } else if (body.kind === 'fix-bug') {
      materials = [body.scenario, body.code, body.question];
    } else if (body.kind === 'external') {
      materials = [body.description, ...list(body.evidenceType), body.difficulty,
        Number.isFinite(body.points) ? body.points + ' баллов' : ''];
    } else if (body.kind === 'simulator') {
      materials = [body.context, Number.isFinite(body.steps) ? body.steps + ' состояний' : ''];
    }
    return normaliseCourseContext({
      key: 'course:' + boundedText(course.slug, 100) + ':' + boundedText(chapter.id, 100),
      courseId: course.id || course.slug,
      chapterId: chapter.id,
      courseTitle: course.title,
      chapterTitle: chapter.title,
      kind: body.kind || chapter.kind || chapter.type,
      level: body.level || course.level || course.targetLevel,
      objective: body.objective || body.task || body.question || body.description || chapter.title,
      expectedResult: body.expectedResult,
      practice: body.practice,
      pitfalls: body.pitfalls || body.commonMistakes,
      productionLayer: body.productionLayer,
      artifact: body.artifact,
      materials
    });
  }

  function boundedInteger(value, minimum, maximum, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, Math.round(number))) : fallback;
  }

  function buildStudyContext(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      key: boundedText(source.key, 200),
      programId: boundedText(source.programId, 40),
      programTitle: boundedText(source.programTitle, 300),
      week: boundedInteger(source.week, 1, 100, 1),
      weekTitle: boundedText(source.weekTitle, 300),
      day: boundedInteger(source.day, 1, 7, 1),
      dayTitle: boundedText(source.dayTitle, 300),
      level: boundedText(source.level, 40),
      mainTopics: boundedList(source.mainTopics, 10, 200),
      objective: boundedText(source.objective, 2500),
      expectedResult: boundedText(source.expectedResult, 2500),
      practice: boundedList(source.practice, 10, 800),
      pitfalls: boundedList(source.pitfalls, 10, 800),
      productionLayer: boundedText(source.productionLayer, 2000),
      artifact: boundedText(source.artifact, 1200)
    };
  }

  function buildExchanges(value) {
    return list(value).slice(-5).map(item => {
      const source = item && typeof item === 'object' ? item : {};
      return {
        question: boundedText(source.question, 1000),
        answer: boundedText(source.answer, 3000),
        feedback: boundedText(source.feedback, 1000)
      };
    }).filter(item => item.question || item.answer || item.feedback);
  }

  function compactTutorPayload(payload) {
    const limit = 60 * 1024;
    if (jsonByteLength(payload) <= limit) return payload;
    const applyBudgets = budgets => {
      const compact = {
        ...payload,
        context: budgetObjectStrings(payload.context, budgets.context),
        question: boundedJsonText(payload.question, budgets.question),
        exchanges: payload.exchanges.map(item => ({
          question: boundedJsonText(item.question, budgets.exchangeQuestion),
          answer: boundedJsonText(item.answer, budgets.exchangeAnswer),
          feedback: boundedJsonText(item.feedback, budgets.exchangeFeedback)
        }))
      };
      if (payload.mode === 'practice') {
        compact.practiceInput = boundedJsonText(payload.practiceInput, budgets.practiceInput);
      }
      return compact;
    };
    let compact = applyBudgets({
      context: 24 * 1024, question: 3 * 1024,
      exchangeQuestion: 1200, exchangeAnswer: 3000, exchangeFeedback: 800,
      practiceInput: 16 * 1024
    });
    if (jsonByteLength(compact) > limit) {
      compact = applyBudgets({
        context: 12 * 1024, question: 1024,
        exchangeQuestion: 600, exchangeAnswer: 1600, exchangeFeedback: 400,
        practiceInput: 8 * 1024
      });
    }
    if (jsonByteLength(compact) > limit) throw new RangeError('Tutor payload exceeds the safe body limit');
    return compact;
  }

  function buildTutorPayload(input) {
    const source = input && typeof input === 'object' ? input : {};
    const mode = MODES.has(source.mode) ? source.mode : 'explain';
    const style = STYLES.has(source.style) ? source.style : 'simple';
    const sourceType = source.source === 'study' ? 'study' : 'course';
    const exchanges = mode === 'socratic' ? buildExchanges(source.exchanges) : [];
    const payload = {
      schemaVersion: 1,
      mode,
      style,
      source: sourceType,
      context: sourceType === 'study' ? buildStudyContext(source.context) : normaliseCourseContext(source.context),
      question: boundedText(source.question, 2000),
      turn: exchanges.length,
      exchanges
    };
    if (mode === 'practice') payload.practiceInput = boundedText(source.practiceInput, 8000);
    return compactTutorPayload(payload);
  }

  function normaliseSections(value) {
    return list(value).map(item => {
      const source = item && typeof item === 'object' ? item : {};
      const title = boundedText(source.title, 200);
      const text = boundedText(source.text, 2000);
      return title && text ? { title, text } : null;
    }).filter(Boolean).slice(0, 6);
  }

  function normaliseNextActions(value) {
    return list(value).map(item => {
      const source = item && typeof item === 'object' ? item : {};
      const action = boundedText(source.action, 800);
      const successCriterion = boundedText(source.successCriterion, 800);
      return action && successCriterion ? { action, successCriterion } : null;
    }).filter(Boolean).slice(0, 5);
  }

  function normaliseExplanation(value, payload) {
    const source = value && typeof value === 'object' ? value : {};
    const trusted = payload && typeof payload === 'object' ? payload : {};
    const title = boundedText(source.title, 200);
    const summary = boundedText(source.summary, 1600);
    const sections = normaliseSections(source.sections);
    const nextActions = normaliseNextActions(source.nextActions);
    if (!title || !summary || !sections.length || !nextActions.length) return null;
    const exampleSource = source.example && typeof source.example === 'object' ? source.example : {};
    const questionSource = source.checkQuestion && typeof source.checkQuestion === 'object' ? source.checkQuestion : {};
    return {
      schemaVersion: 1,
      mode: trusted.mode,
      title,
      summary,
      sections,
      example: {
        description: boundedText(exampleSource.description, 1200),
        code: boundedText(exampleSource.code, 5000)
      },
      checkQuestion: { question: boundedText(questionSource.question, 1000) },
      nextActions,
      caution: boundedText(source.caution, 800)
    };
  }

  function normaliseSocraticResponse(value, payload) {
    const source = value && typeof value === 'object' ? value : {};
    const trusted = payload && typeof payload === 'object' ? payload : {};
    const turn = boundedInteger(trusted.turn, 0, 5, 0);
    const title = boundedText(source.title, 200);
    const feedback = boundedText(source.feedback, 1600);
    const complete = turn >= 5 ? true : source.complete === true;
    const nextQuestion = complete ? '' : boundedText(source.nextQuestion, 1000);
    if (!title || !feedback || (!complete && !nextQuestion)) return null;
    return {
      schemaVersion: 1,
      mode: 'socratic',
      turn,
      title,
      feedback,
      hint: boundedText(source.hint, 1000),
      nextQuestion,
      complete,
      summary: boundedText(source.summary, 1200),
      caution: boundedText(source.caution, 800)
    };
  }

  function normalisePracticeStep(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      description: boundedText(source.description, 800),
      command: boundedText(source.command, 3000),
      expectedResult: boundedText(source.expectedResult, 800)
    };
  }

  function normalisePracticeResponse(value) {
    const source = value && typeof value === 'object' ? value : {};
    const title = boundedText(source.title, 200);
    const meaning = boundedText(source.meaning, 1600);
    const checks = list(source.checks).map(normalisePracticeStep)
      .filter(item => item.description && item.expectedResult).slice(0, 5);
    const nextStep = normalisePracticeStep(source.nextStep);
    if (!title || !meaning || !checks.length || !nextStep.description || !nextStep.expectedResult) return null;
    return {
      schemaVersion: 1,
      mode: 'practice',
      title,
      meaning,
      causes: boundedList(source.causes, 5, 800),
      checks,
      nextStep,
      stopConditions: boundedList(source.stopConditions, 5, 800),
      caution: boundedText(source.caution, 800)
    };
  }

  function normaliseTutorResponse(value, payload) {
    const trusted = payload && typeof payload === 'object' ? payload : {};
    if (trusted.mode === 'explain') return normaliseExplanation(value, trusted);
    if (trusted.mode === 'socratic') return normaliseSocraticResponse(value, trusted);
    if (trusted.mode === 'practice') return normalisePracticeResponse(value);
    return null;
  }

  function contextTitle(context) {
    return context.chapterTitle || context.dayTitle || context.weekTitle || context.courseTitle || context.programTitle || 'Текущая тема';
  }

  function buildLocalExplanation(payload) {
    const context = payload.context || {};
    const objective = context.objective || 'Изучите цель и материалы текущей темы.';
    const expected = context.expectedResult || 'Сформулируйте результат своими словами и проверьте его на практике.';
    const sections = [
      { title: 'Цель темы', text: objective },
      { title: 'Проверяемый результат', text: expected },
      context.materials && context.materials.length
        ? { title: 'Материалы текущей главы', text: context.materials.join('\n') }
        : null,
      context.productionLayer ? { title: 'Связь с production', text: context.productionLayer } : null,
      context.pitfalls && context.pitfalls.length ? { title: 'На что обратить внимание', text: context.pitfalls.join(' ') } : null
    ].filter(Boolean);
    const action = context.practice && context.practice[0] || 'Повторите материал текущей темы.';
    const candidate = {
      title: 'Локальный разбор: ' + contextTitle(context),
      summary: objective,
      sections,
      example: { description: context.artifact || '', code: '' },
      checkQuestion: { question: 'Как вы проверите, что достигли результата этой темы?' },
      nextActions: [{ action, successCriterion: expected }],
      caution: 'Это локальная подсказка из материалов приложения; она не заменяет внешний AI-разбор и не проверяет техническую корректность свободного ответа.'
    };
    return { ...normaliseExplanation(candidate, payload), source: 'local' };
  }

  function buildLocalSocraticResponse(payload) {
    const context = payload.context || {};
    const complete = payload.turn >= 5;
    const expected = context.expectedResult || context.objective || 'Сформулируйте основную идею текущей темы.';
    const hint = context.practice && context.practice[0] || context.pitfalls && context.pitfalls[0] || '';
    const candidate = {
      title: complete ? 'Локальный итог опроса' : 'Локальный вопрос по теме',
      feedback: 'Ответ сохранён в текущей сессии, но локальный режим не проверяет техническую корректность формулировки.',
      hint,
      nextQuestion: complete ? '' : 'Объясните своими словами: ' + expected,
      complete,
      summary: complete ? 'Локальный опрос завершён после пяти ходов. Для технической оценки нужен внешний AI.' : '',
      caution: 'Это локальный режим по материалам приложения; он направляет повторение, но не оценивает правильность ответа.'
    };
    return { ...normaliseSocraticResponse(candidate, payload), source: 'local' };
  }

  function buildLocalPracticeResponse(payload) {
    const context = payload.context || {};
    const command = context.practice && context.practice[0] || '';
    const expectedResult = context.expectedResult || 'Зафиксируйте наблюдаемый результат и сравните его с целью темы.';
    const description = command ? 'Выполните только безопасную проверку из текущего материала.' : 'Сначала соберите наблюдаемые факты без изменения состояния.';
    const candidate = {
      title: 'Локальная помощь с практикой: ' + contextTitle(context),
      meaning: 'Получен диагностический фрагмент, но локальный режим не определяет причину ошибки и не делает техническое заключение.',
      causes: [],
      checks: [{ description, command, expectedResult }],
      nextStep: { description, command, expectedResult },
      stopConditions: context.pitfalls || [],
      caution: 'Приложение не выполняет команды. Это локальная подсказка из текущего материала; перед изменениями проверьте область действия и ожидаемый результат.'
    };
    return { ...normalisePracticeResponse(candidate), source: 'local' };
  }

  function buildLocalTutorResponse(payload) {
    const trusted = buildTutorPayload(payload);
    if (trusted.mode === 'explain') return buildLocalExplanation(trusted);
    if (trusted.mode === 'socratic') return buildLocalSocraticResponse(trusted);
    if (trusted.mode === 'practice') return buildLocalPracticeResponse(trusted);
    return null;
  }

  async function requestTutor(input, options) {
    const config = options || {};
    const payload = buildTutorPayload(input);
    const fetchImpl = config.fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    if (!fetchImpl) throw new Error('AI backend is unavailable');
    const token = boundedText(config.token, 500);
    if (!token) {
      const missing = new Error('Sync token is required for external AI tutor');
      missing.code = 'AI_AUTH_REQUIRED';
      missing.status = 401;
      throw missing;
    }
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const externalSignal = config.signal;
    const forwardAbort = () => { if (controller) controller.abort(); };
    if (externalSignal && externalSignal.aborted) forwardAbort();
    else if (externalSignal && typeof externalSignal.addEventListener === 'function') {
      externalSignal.addEventListener('abort', forwardAbort, { once: true });
    }
    const timeoutMs = Math.max(1000, Math.min(60000, Number(config.timeoutMs) || 60000));
    const timeout = setTimeout(() => { if (controller) controller.abort(); }, timeoutMs);
    try {
      const response = await fetchImpl(config.url || './api/ai/tutor', {
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
      const result = normaliseTutorResponse(data && data.tutor, payload);
      if (!result) {
        const invalid = new Error('AI backend returned an invalid tutor response');
        invalid.status = response.status;
        invalid.code = 'AI_BAD_RESPONSE';
        throw invalid;
      }
      return { ...result, source: data.tutor && data.tutor.source === 'mock' ? 'mock' : 'ai' };
    } finally {
      clearTimeout(timeout);
      if (externalSignal && typeof externalSignal.removeEventListener === 'function') {
        externalSignal.removeEventListener('abort', forwardAbort);
      }
    }
  }

  async function tutor(input, options) {
    const payload = buildTutorPayload(input);
    try {
      return await requestTutor(payload, options);
    } catch (error) {
      const local = buildLocalTutorResponse(payload);
      return {
        ...local,
        fallbackReason: boundedText(error && error.message, 300),
        fallbackCode: boundedText(error && error.code, 40),
        fallbackStatus: Number.isFinite(error && error.status) ? error.status : null
      };
    }
  }

  return {
    buildTutorPayload, buildCourseTutorContext, normaliseTutorResponse, buildLocalTutorResponse,
    requestTutor, tutor, redactTutorText, redactTutorPayload, boundedText, boundedList
  };
});
