(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IPMaxExamUI = api;
})(typeof self !== 'undefined' ? self : globalThis, function() {
  const TOPIC_CLASSES = {
    Terraform: 'tf', Linux: 'lx', 'Сети': 'net', Ansible: 'ans', Docker: 'docker',
    Kubernetes: 'k8s', 'CI/CD': 'cicd', Git: 'git', Regex: 'rx', Monitoring: 'mon', Cloud: 'cloud', Security: 'sec'
  };
  const LEVEL_CLASSES = { Junior: 'jr', Middle: 'md', Senior: 'sr' };
  const CATEGORY_CLASSES = { scenario: 'sc', tradeoff: 'tr', output: 'out' };
  const CATEGORY_LABELS = { scenario: 'Сценарий', tradeoff: 'Trade-off', output: 'Анализ вывода' };

  const hasOwn = (object, key) => !!object && Object.prototype.hasOwnProperty.call(object, key);
  const valueFor = (object, key) => hasOwn(object, key) ? object[key] : null;
  const finiteCount = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;

  function escapeText(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escapeAttribute(value) {
    return escapeText(value).replace(/'/g, '&#39;');
  }

  function topicTag(topic) {
    const name = String(topic === undefined || topic === null ? '' : topic);
    return '<span class="tag tag-' + (TOPIC_CLASSES[name] || 'tf') + '">' + escapeText(name) + '</span>';
  }

  function levelTag(level) {
    const name = String(level === undefined || level === null ? '' : level);
    return '<span class="tag tag-' + (LEVEL_CLASSES[name] || 'jr') + '">' + escapeText(name) + '</span>';
  }

  function categoryTag(category) {
    const name = String(category || 'definition');
    if (name === 'definition') return '';
    return '<span class="tag tag-' + (CATEGORY_CLASSES[name] || 'sc') + '">' + escapeText(CATEGORY_LABELS[name] || name) + '</span>';
  }

  function randomized(items, randomize) {
    const original = items.slice();
    if (typeof randomize !== 'function') return original;
    const result = randomize(original);
    return Array.isArray(result) && result.length === original.length ? result.slice() : original;
  }

  function filterQuestions(questions, options) {
    const settings = options || {};
    let result = Array.isArray(questions) ? questions.slice() : [];
    const selectedIds = Array.isArray(settings.coachQuestionIds) ? settings.coachQuestionIds : [];
    if (selectedIds.length) {
      const ids = new Set(selectedIds.map(String));
      result = result.filter(question => ids.has(String(question && question.id)));
    }

    if (settings.topic && settings.topic !== 'all') result = result.filter(question => question && question.topic === settings.topic);
    if (settings.level && settings.level !== 'all') result = result.filter(question => question && question.level === settings.level);
    if (settings.category && settings.category !== 'all') {
      result = result.filter(question => String(question && question.category || 'definition') === settings.category);
    }

    const search = String(settings.search || '').toLowerCase();
    if (search) {
      result = result.filter(question => {
        const prompt = String(question && question.q || '').toLowerCase();
        const answers = Array.isArray(question && question.options) ? question.options : [];
        return prompt.includes(search) || answers.some(answer => String(answer || '').toLowerCase().includes(search));
      });
    }

    const mode = String(settings.mode || 'all');
    const mistakes = settings.mistakes || {};
    const progress = settings.progress || {};
    const now = Number.isFinite(Number(settings.now)) ? Number(settings.now) : Date.now();

    if (mode === 'mistakes') result = result.filter(question => !!valueFor(mistakes, question && question.id));
    if (mode === 'srs') {
      result = result.filter(question => {
        const item = valueFor(progress, question && question.id);
        return !!item && Number(item.nextReviewAt) > 0 && Number(item.nextReviewAt) <= now;
      });
    }
    if (mode === 'smart') {
      result = result.filter(question => {
        const item = valueFor(progress, question && question.id);
        if (!item) return true;
        const correct = finiteCount(item.correct);
        const wrong = finiteCount(item.wrong);
        const attempts = correct + wrong;
        const rate = attempts ? correct / attempts : 0;
        const ageHours = (now - finiteCount(item.lastSeen)) / 3600000;
        return rate < 0.7 || ageHours > 24;
      });
    }

    const randomize = settings.randomize;
    const sessionLimit = Math.max(0, Math.floor(Number(settings.coachSessionLimit) || 0));
    if (sessionLimit && (mode === 'smart' || mode === 'srs')) result = randomized(result, randomize).slice(0, sessionLimit);
    if (mode === 'mix10' || mode === 'mix20' || mode === 'mix30') {
      const limit = { mix10: 10, mix20: 20, mix30: 30 }[mode];
      result = randomized(result, randomize).slice(0, limit);
    }
    return result;
  }

  function summarizeProgress(questions, progress) {
    const list = Array.isArray(questions) ? questions : [];
    let correct = 0;
    let wrong = 0;
    list.forEach(question => {
      const item = valueFor(progress, question && question.id);
      if (!item) return;
      if (finiteCount(item.correct) > finiteCount(item.wrong)) correct++;
      else if (finiteCount(item.wrong) > 0) wrong++;
    });
    return { total: list.length, correct, wrong, unanswered: list.length - correct - wrong };
  }

  function buildWhyWrong(question, answers) {
    if (!question || !question.explanation || !Array.isArray(answers)) return '';
    const correctIndex = Number(question.answer);
    const wrongAnswers = answers.filter((_, index) => index !== correctIndex);
    if (!wrongAnswers.length) return '';
    return '<div class="q-why-wrong"><div style="font-size:11px;font-weight:700;color:var(--text3);margin-top:8px;margin-bottom:4px">❓ Почему остальные варианты неверны:</div>' +
      wrongAnswers.map(answer => {
        const text = String(answer === undefined || answer === null ? '' : answer);
        return '<div style="font-size:12px;color:var(--text2);margin-bottom:2px">• ' + escapeText(text.slice(0, 80)) + (text.length > 80 ? '…' : '') + '</div>';
      }).join('') + '</div>';
  }

  function renderQuestionCard(question, context) {
    const q = question || {};
    const state = context || {};
    const id = String(q.id === undefined || q.id === null ? '' : q.id);
    const safeId = escapeAttribute(id);
    const answers = Array.isArray(q.options) ? q.options : [];
    const answer = Number(q.answer);
    const progress = valueFor(state.progress || {}, q.id) || {};
    const mistake = !!valueFor(state.mistakes || {}, q.id);
    const initialOrder = answers.map((_, index) => index);
    const order = randomized(initialOrder, state.randomize);
    const timerSeconds = Math.max(0, Math.floor(Number(state.timerSeconds) || 0));
    if (typeof state.onStart === 'function') state.onStart(q.id, Number.isFinite(Number(state.now)) ? Number(state.now) : Date.now());

    return '<div class="q-card" id="qcard-' + safeId + '">' +
      '<div class="q-meta">' + topicTag(q.topic) + levelTag(q.level) + categoryTag(q.category) +
      '<span class="q-num">#' + escapeText(id) + (mistake ? ' ❌' : '') +
      ' <span style="color:var(--text3)">✅' + finiteCount(progress.correct) + ' ❌' + finiteCount(progress.wrong) + '</span></span>' +
      (state.single && timerSeconds ? '<span class="q-timer" id="timer-' + safeId + '">' + timerSeconds + 'с</span>' : '') +
      '</div>' +
      '<div class="q-text">' + escapeText(q.q) + '</div>' +
      '<div class="q-options">' + order.map((originalIndex, visibleIndex) =>
        '<button type="button" class="q-opt" id="opt-' + safeId + '-' + visibleIndex + '" data-exam-action="answer" data-question-id="' + safeId + '" data-orig-idx="' + originalIndex + '" data-answer="' + answer + '">' +
        '<span class="opt-letter">' + String.fromCharCode(65 + visibleIndex) + '</span><span>' + escapeText(answers[originalIndex]) + '</span></button>'
      ).join('') + '</div>' +
      (q.explanation && state.studyMode ? '<div class="q-explanation">💡 ' + escapeText(q.explanation) + buildWhyWrong(q, answers) + '</div>' : '') +
      '<div id="qexpl-' + safeId + '" style="display:none" class="q-explanation"></div>' +
      (state.interviewMode ? '<div class="q-interview-note">🎤 Режим собеседования — отвечайте развёрнуто, без подсказок</div>' : '') +
      '</div>';
  }

  function renderFlashcardMarkup(questions) {
    return (Array.isArray(questions) ? questions : []).map(question => {
      const q = question || {};
      const id = String(q.id === undefined || q.id === null ? '' : q.id);
      const safeId = escapeAttribute(id);
      const answers = Array.isArray(q.options) ? q.options : [];
      return '<div class="flashcard" id="fc-' + safeId + '" role="button" tabindex="0" data-exam-action="flip" data-question-id="' + safeId + '">' +
        '<div class="flashcard-inner"><div class="fc-front"><div class="q-meta" style="justify-content:center;margin-bottom:10px">' + topicTag(q.topic) + levelTag(q.level) + '</div>' +
        '<p>' + escapeText(q.q) + '</p><div style="margin-top:10px;font-size:11px;color:var(--text3)">Нажмите для ответа</div></div>' +
        '<div class="fc-back"><div style="font-weight:700;color:var(--primary-h);margin-bottom:8px">✅ ' + escapeText(answers[Number(q.answer)] || '') + '</div>' +
        (q.explanation ? '<p style="font-size:13px;color:var(--text2)">' + escapeText(q.explanation) + '</p>' : '') + '</div></div></div>';
    }).join('');
  }

  function create(services, environment) {
    const source = services || {};
    const env = environment || {};
    const doc = env.document || (typeof document !== 'undefined' ? document : null);
    const batchSize = Number.isInteger(env.batchSize) && env.batchSize > 0 ? env.batchSize : 60;
    const boundActions = new WeakSet();
    let renderLimit = batchSize;
    const run = (name, ...args) => typeof source[name] === 'function' ? source[name](...args) : undefined;
    const byId = id => doc && doc.getElementById(id);

    function resetRenderLimit() { renderLimit = batchSize; }

    function filterCurrentQuestions() {
      const filters = run('getFilters') || {};
      return filterQuestions(run('getQuestions') || [], Object.assign({}, filters, {
        mistakes: run('getMistakes') || {},
        progress: run('getQuestionProgress') || {},
        randomize: items => run('randomize', items) || items,
        now: run('now')
      }));
    }

    function questionContext(single) {
      const studyMode = !!run('getStudyMode');
      return {
        progress: run('getQuestionProgress') || {}, mistakes: run('getMistakes') || {},
        randomize: items => run('randomize', items) || items,
        studyMode, interviewMode: !studyMode && !!run('getInterviewMode'),
        timerSeconds: run('getTimerSeconds'), single: !!single, now: run('now'),
        onStart: (id, at) => run('markQuestionStarted', id, at)
      };
    }

    function renderCard(question, single) {
      return renderQuestionCard(question, questionContext(single));
    }

    function renderLoadMore(total) {
      if (renderLimit >= total) return '';
      const count = Math.min(batchSize, total - renderLimit);
      return '<div id="questions-load-more" style="text-align:center;padding:18px"><button type="button" class="btn btn-outline" data-exam-action="load-more">Показать ещё ' + count + ' · ' + renderLimit + '/' + total + '</button></div>';
    }

    function flipCard(id) {
      byId('fc-' + id)?.classList.toggle('flipped');
    }

    function invokeAction(element) {
      const action = element.getAttribute('data-exam-action');
      if (action === 'answer') {
        return run('answer', element.getAttribute('data-question-id'), Number(element.getAttribute('data-orig-idx')), Number(element.getAttribute('data-answer')));
      }
      if (action === 'flip') return flipCard(element.getAttribute('data-question-id'));
      if (action === 'load-more') return loadMoreQuestions();
      if (action === 'show-all') return run('resetMistakesMode');
      return undefined;
    }

    function bindInteractions(container) {
      if (!container) return;
      container.querySelectorAll('[data-exam-action]').forEach(element => {
        if (boundActions.has(element)) return;
        boundActions.add(element);
        element.addEventListener('click', () => invokeAction(element));
        if (element.getAttribute('data-exam-action') === 'flip') {
          element.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            invokeAction(element);
          });
        }
      });
    }

    function renderProgress(questions) {
      const info = byId('progress-info');
      const bar = byId('seg-bar');
      const summary = summarizeProgress(questions, run('getQuestionProgress') || {});
      if (!summary.total) {
        if (bar) bar.style.display = 'none';
        if (info) info.innerHTML = '';
        return summary;
      }
      if (bar) {
        bar.style.display = 'flex';
        bar.innerHTML = '<div class="seg-ok" style="width:' + (summary.correct / summary.total * 100) + '%"></div>' +
          '<div class="seg-err" style="width:' + (summary.wrong / summary.total * 100) + '%"></div>' +
          '<div class="seg-none" style="width:' + (summary.unanswered / summary.total * 100) + '%"></div>';
      }
      if (info) info.innerHTML = '<span style="font-size:12px;color:var(--text2)">Показано: <b>' + summary.total + '</b> | ✅ ' + summary.correct + ' | ❌ ' + summary.wrong + ' | ⭕ ' + summary.unanswered + '</span>';
      return summary;
    }

    function renderSingle() {
      const questions = run('getActiveQuestions') || [];
      const index = Math.max(0, Number(run('getSingleIndex')) || 0);
      const question = questions[index];
      const container = byId('questions-container');
      if (!question || !container) return;
      container.innerHTML = renderCard(question, true);
      bindInteractions(container);
      const counter = byId('single-counter');
      if (counter) counter.textContent = (index + 1) + ' / ' + questions.length;
      const seconds = Math.max(0, Number(run('getTimerSeconds')) || 0);
      if (seconds) run('startTimer', question.id, seconds);
    }

    function renderFlashcards(questions) {
      const visible = questions.slice(0, renderLimit);
      renderLimit = visible.length;
      const container = byId('questions-container');
      if (!container) return;
      container.innerHTML = renderFlashcardMarkup(visible) + renderLoadMore(questions.length);
      bindInteractions(container);
    }

    function renderQuestions() {
      run('clearTimer');
      const questions = filterCurrentQuestions();
      run('setActiveQuestions', questions);
      const container = byId('questions-container');
      const singleControls = byId('single-controls');
      if (!container) return questions;

      if (!questions.length) {
        const mistakesMode = String((run('getFilters') || {}).mode) === 'mistakes';
        container.innerHTML = mistakesMode
          ? '<div class="empty-state"><div class="icon">✅</div><p>Ошибок нет — отличная работа!</p><button type="button" class="btn btn-primary btn-sm" data-exam-action="show-all">Показать все вопросы</button></div>'
          : '<div class="empty-state"><div class="icon">🔍</div><p>Нет вопросов для выбранных фильтров</p></div>';
        if (singleControls) singleControls.style.display = 'none';
        renderProgress([]);
        bindInteractions(container);
        return questions;
      }

      renderProgress(questions);
      const view = String(run('getView') || 'standard');
      if (view === 'flashcard') {
        renderFlashcards(questions);
        if (singleControls) singleControls.style.display = 'none';
        return questions;
      }
      if (view === 'freeform') {
        run('renderFreeform');
        if (singleControls) singleControls.style.display = 'none';
        return questions;
      }
      if (view === 'single') {
        run('resetSingleIndex');
        renderSingle();
        if (singleControls) singleControls.style.display = 'block';
        return questions;
      }

      if (singleControls) singleControls.style.display = 'none';
      const visible = questions.slice(0, renderLimit);
      renderLimit = visible.length;
      container.innerHTML = visible.map(question => renderCard(question, false)).join('') + renderLoadMore(questions.length);
      bindInteractions(container);
      return questions;
    }

    function loadMoreQuestions() {
      const container = byId('questions-container');
      if (!container) return;
      byId('questions-load-more')?.remove();
      const questions = run('getActiveQuestions') || [];
      const start = renderLimit;
      const end = Math.min(start + batchSize, questions.length);
      const batch = questions.slice(start, end);
      renderLimit = end;
      const markup = String(run('getView') || 'standard') === 'flashcard'
        ? renderFlashcardMarkup(batch)
        : batch.map(question => renderCard(question, false)).join('');
      container.insertAdjacentHTML('beforeend', markup + renderLoadMore(questions.length));
      bindInteractions(container);
    }

    function updateProgressSummary() {
      const bar = byId('seg-bar');
      const questions = run('getActiveQuestions') || [];
      if (!bar || !questions.length || bar.style.display === 'none') return null;
      return renderProgress(questions);
    }

    return {
      resetRenderLimit, filterCurrentQuestions, renderQuestions, renderSingle, loadMoreQuestions,
      updateProgressSummary, bindInteractions, renderQuestionCard: renderCard, renderFlashcardMarkup
    };
  }

  return {
    TOPIC_CLASSES, LEVEL_CLASSES, CATEGORY_CLASSES, CATEGORY_LABELS,
    topicTag, levelTag, categoryTag, filterQuestions, summarizeProgress,
    buildWhyWrong, renderQuestionCard, renderFlashcardMarkup, create
  };
});
