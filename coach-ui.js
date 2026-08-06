(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.InterviewCoachUI = api;
})(typeof self !== 'undefined' ? self : globalThis, function() {
  let services = null;
  let bound = false;
  let reviewRequest = 0;
  let currentReview = null;
  let currentReviewTrend = null;
  // Статус внешнего AI кешируется на сессию: без него кнопка обещала бы
  // «AI-разбор» даже при ненастроенном провайдере, и правда выяснялась бы
  // только после клика. На сервере ответ уже отдаётся с no-store.
  let aiStatus = null;
  let aiStatusPending = false;

  function escapeHtml(value) {
    if (services && typeof services.escape === 'function') return services.escape(value);
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function escapeAttr(value) { return escapeHtml(value).replace(/'/g, '&#39;'); }
  function pluralDays(value) {
    const lastTwo = value % 100, last = value % 10;
    if (lastTwo > 10 && lastTwo < 20) return 'дней';
    if (last === 1) return 'день';
    if (last > 1 && last < 5) return 'дня';
    return 'дней';
  }
  function formatInterviewTiming(daysUntil) {
    if (daysUntil === null) return 'Дата интервью не задана';
    if (daysUntil < 0) return 'Дата интервью уже прошла';
    if (daysUntil === 0) return 'Интервью сегодня';
    return 'Интервью через ' + daysUntil + ' ' + pluralDays(daysUntil);
  }
  function formatDelta(value, suffix) {
    if (!Number.isFinite(value)) return 'нет базы';
    return (value > 0 ? '+' : '') + value + (suffix || '');
  }
  function reviewStatus(review) {
    const labels = {
      'on-track': ['В темпе', 'coach-status-good'],
      behind: ['Нужна коррекция', 'coach-status-risk'],
      building: ['Набираете ритм', 'coach-status-build'],
      starting: ['Стартовая неделя', 'coach-status-build']
    };
    return labels[review && review.status] || labels.starting;
  }
  function focusDetail(focus) {
    if (!focus) return 'Начните с базового микса вопросов';
    return focus.practiceCount ? focus.practiceScore + '% практика · ' + focus.accuracy + '% тесты' : focus.accuracy + '% точность · ' + focus.coverage + '% охват';
  }

  /**
   * Подпись и заголовок кнопки разбора по реальному состоянию backend.
   * Пока статус неизвестен, обещать внешний AI нельзя — но и блокировать
   * кнопку нельзя: локальный разбор работает всегда.
   */
  function aiButtonCopy(hasAttempts) {
    if (!hasAttempts) return { label: 'AI-разбор', title: 'Сначала ответьте на вопросы контрольной' };
    if (!aiStatus) return { label: 'AI-разбор', title: 'Проверяю, настроен ли внешний AI' };
    if (aiStatus.enabled) {
      const model = aiStatus.provider === 'mock' ? 'заглушка' : (aiStatus.model || 'модель не указана');
      return { label: 'AI-разбор', title: 'Внешний AI: ' + model };
    }
    // Честная подпись: разбор будет, но локальный.
    return { label: 'Локальный разбор', title: 'Внешний AI не настроен — разбор построит приложение' };
  }

  /**
   * Однократно запрашивает статус и перерисовывает карточку. Ошибку глушим:
   * недоступный статус означает лишь «внешнего AI нет», а не сбой страницы.
   */
  function ensureAiStatus() {
    if (aiStatus || aiStatusPending || !services || typeof services.getAiStatus !== 'function') return;
    aiStatusPending = true;
    Promise.resolve()
      .then(() => services.getAiStatus())
      .then(status => {
        aiStatus = status && typeof status === 'object' ? status : { enabled: false };
      })
      .catch(() => { aiStatus = { enabled: false }; })
      .then(() => {
        aiStatusPending = false;
        render();
      });
  }

  function configure(input) {
    services = input || null;
    // Провайдера могли только что сменить в настройках AI: закешированный
    // статус стал бы врать.
    aiStatus = null;
    aiStatusPending = false;
    if (!bound && typeof document !== 'undefined') {
      document.addEventListener('click', handleAction);
      bound = true;
    }
    return api;
  }

  function render() {
    if (!services || typeof document === 'undefined') return;
    const card = document.getElementById('daily-plan-card');
    const content = document.getElementById('daily-plan-content');
    if (!card || !content) return;
    card.style.display = 'block';
    const plan = services.getPlan();
    if (!plan) {
      content.innerHTML = '<div class="coach-empty"><span>Укажите цель подготовки, чтобы получить персональный план.</span><button type="button" class="btn btn-primary btn-sm" data-coach-action="edit-goal">Настроить цель</button></div>';
      return;
    }
    const focus = plan.focus;
    const review = plan.weeklyReview || {};
    const recent = review.recent || {};
    const status = reviewStatus(review);
    const control = plan.controlSession || { size: 0, topics: [] };
    const noteCount = services.getJournal().length;
    const controlResult = services.getControlSession ? services.getControlSession() : null;
    const controlAttempts = controlResult ? controlResult.attempts.length : 0;
    const controlTotal = controlResult ? controlResult.questionIds.length : 0;
    const focusAction = focus ? ' data-topic="' + escapeAttr(focus.topic) + '" data-page="' + escapeAttr(focus.action && focus.action.page || '') + '"' : ' disabled';
    const adjustment = review.extraQuestions ? '<div class="coach-adjustment">План скорректирован: +' + review.extraQuestions + ' вопросов в сессию, пока недельный темп ниже цели.</div>' : '';
    const controlTopics = control.topics && control.topics.length ? ' · ' + control.topics.map(escapeHtml).join(', ') : '';
    const aiCopy = aiButtonCopy(controlAttempts > 0);
    // Запрос статуса имеет смысл только когда кнопка активна.
    if (controlAttempts) ensureAiStatus();
    content.innerHTML =
      '<div class="coach-head"><div><div class="coach-role">' + escapeHtml(plan.roleLabel) + ' · ' + escapeHtml(plan.level) + '</div><div class="coach-date">' + formatInterviewTiming(plan.daysUntil) + '</div></div>' +
      '<button type="button" class="btn-icon" title="Изменить цель подготовки" aria-label="Изменить цель подготовки" data-coach-action="edit-goal">⚙</button></div>' +
      '<div class="coach-metrics"><div class="coach-metric"><b>' + plan.sessionSize + '</b><span>вопросов сегодня</span></div><div class="coach-metric"><b>' + plan.dueCount + '</b><span>SRS к повторению</span></div><div class="coach-metric"><b>' + plan.targetAccuracy + '%</b><span>целевая точность</span></div></div>' +
      '<div class="coach-focus"><span class="coach-focus-kicker">Главный фокус</span><strong>' + escapeHtml(focus ? focus.topic : 'Общий повтор') + '</strong><span>' + escapeHtml(focusDetail(focus)) + '</span></div>' +
      '<section class="coach-review" aria-label="Итоги последних семи дней"><div class="coach-review-head"><div><span class="coach-focus-kicker">Weekly review · 7 дней</span><strong>' + recent.attempts + ' действий</strong></div><span class="coach-status ' + status[1] + '">' + status[0] + '</span></div>' +
      '<div class="coach-review-grid"><div><b>' + recent.activeDays + '/' + review.targetActiveDays + '</b><span>активных дней</span></div><div><b>' + (recent.accuracy === null || recent.accuracy === undefined ? '—' : recent.accuracy + '%') + '</b><span>точность недели</span></div><div><b>' + formatDelta(review.accuracyDelta, '%') + '</b><span>к прошлой неделе</span></div></div>' + adjustment + '</section>' +
      '<div class="coach-actions"><button type="button" class="btn btn-primary btn-sm" data-coach-action="start-focus"' + focusAction + '>Начать фокус</button>' +
      '<button type="button" class="btn btn-outline btn-sm" data-coach-action="start-review"' + (plan.dueCount ? '' : ' disabled title="Нет повторений на сегодня"') + '>Повторить SRS (' + plan.dueCount + ')</button>' +
      '<button type="button" class="btn btn-outline btn-sm" data-coach-action="start-control"' + (control.size ? '' : ' disabled') + '>Контрольная · ' + control.size + controlTopics + '</button>' +
      '<button type="button" class="btn btn-ai btn-sm" data-coach-action="open-ai-review"' + (controlAttempts ? ' title="' + escapeAttr(aiCopy.title) + '"' : ' disabled title="' + escapeAttr(aiCopy.title) + '"') + '>' + escapeHtml(aiCopy.label) + (controlAttempts ? ' · ' + controlAttempts + '/' + controlTotal : '') + '</button>' +
      '<button type="button" class="btn btn-quiet btn-sm" data-coach-action="open-journal">Журнал навыков' + (noteCount ? ' · ' + noteCount : '') + '</button></div>';
  }

  function editGoal() {
    const profile = services.getProfile() || { role: 'DevOps', level: 'Middle', date: '' };
    document.getElementById('onb-role').value = profile.role;
    document.getElementById('onb-level').value = profile.level;
    document.getElementById('onb-date').value = profile.date;
    services.openModal('onboarding-modal', '#onb-role');
  }
  function saveGoal() {
    const profile = services.normaliseProfile({
      role: document.getElementById('onb-role').value,
      level: document.getElementById('onb-level').value,
      date: document.getElementById('onb-date').value,
      completedAt: new Date(services.now()).toISOString()
    });
    if (!profile) { services.alert('Проверьте дату интервью.'); return; }
    if (!services.setProfile(profile)) { services.alert('Не удалось сохранить цель подготовки в браузере.'); return; }
    services.closeModal('onboarding-modal');
    services.refresh();
  }
  function skipGoal() {
    if (!services.getProfile() && !services.setProfile({ role: 'DevOps', level: 'Middle', date: '', completedAt: new Date(services.now()).toISOString() })) {
      services.alert('Не удалось сохранить цель подготовки в браузере.');
      return;
    }
    services.closeModal('onboarding-modal');
    services.refresh();
  }
  function renderJournal() {
    const list = document.getElementById('coach-journal-list');
    const notes = services.getJournal().slice().sort((left, right) => right.at - left.at);
    if (!notes.length) {
      list.innerHTML = '<div class="coach-journal-empty">Пока нет заметок. Запишите навык, который хотите закрепить после следующей сессии.</div>';
      return;
    }
    list.innerHTML = notes.map(note => '<article class="coach-journal-item"><div><span class="tag tag-tf">' + escapeHtml(note.topic) + '</span><time>' + new Date(note.at).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' }) + '</time></div><p>' + escapeHtml(note.note) + '</p><button type="button" class="btn-icon" aria-label="Удалить заметку" data-coach-action="delete-note" data-note-id="' + escapeAttr(note.id) + '">×</button></article>').join('');
  }
  function openJournal() {
    const select = document.getElementById('coach-journal-topic');
    const current = select.value;
    select.innerHTML = services.getTopics().map(topic => '<option value="' + escapeAttr(topic) + '">' + escapeHtml(topic) + '</option>').join('');
    if ([...select.options].some(option => option.value === current)) select.value = current;
    document.getElementById('coach-journal-note').value = '';
    renderJournal();
    services.openModal('coach-journal-modal', '#coach-journal-topic');
  }
  function saveJournal() {
    const topic = document.getElementById('coach-journal-topic').value;
    const note = document.getElementById('coach-journal-note').value.trim();
    if (!note) { services.alert('Добавьте короткую заметку о навыке.'); return; }
    const current = services.getJournal();
    const next = services.coach.appendJournalEntry(current, { topic, note }, services.now());
    if (!services.setJournal(next)) { services.alert('Не удалось сохранить заметку в браузере.'); return; }
    document.getElementById('coach-journal-note').value = '';
    renderJournal();
    render();
  }
  function deleteJournal(id) {
    if (!services.confirm('Удалить эту заметку?')) return;
    const next = services.getJournal().filter(note => note.id !== id);
    if (services.setJournal(next)) { renderJournal(); render(); }
  }

  function renderWeeklyTrend(trend) {
    const weekly = trend && trend.weekly;
    if (!weekly || !weekly.current || !weekly.current.count) return '';
    const current = weekly.current;
    const hasBaseline = weekly.previous && weekly.previous.count;
    return '<section class="coach-ai-section coach-ai-weekly"><h4>Динамика за 7 дней</h4>' +
      '<div class="coach-ai-weekly-grid"><div><span>Разборов</span><strong>' + escapeHtml(current.count) + '</strong></div>' +
      '<div><span>Точность</span><strong>' + escapeHtml(current.accuracy) + '%</strong><small>' + (hasBaseline ? formatDelta(weekly.accuracyDelta, '%') + ' к прошлым 7 дням' : 'нет прошлой недели') + '</small></div>' +
      '<div><span>Готовность</span><strong>' + escapeHtml(current.readiness) + '%</strong><small>' + (hasBaseline ? formatDelta(weekly.readinessDelta, '%') + ' к прошлым 7 дням' : 'нет прошлой недели') + '</small></div></div></section>';
  }

  function renderReviewHistory(trend) {
    const recent = trend && Array.isArray(trend.recent) ? trend.recent.slice(0, 5) : [];
    if (!recent.length) return '';
    const items = recent.map(entry => {
      const verdict = entry.review && entry.review.verdict || {};
      const date = new Date(entry.at).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
      const source = entry.source === 'local' ? 'Локально' : 'AI';
      return '<article class="coach-ai-history-item"><div><time>' + escapeHtml(date) + '</time><span>' + source + '</span>' +
        '<strong>' + escapeHtml(entry.metrics && entry.metrics.accuracy) + '% / ' + escapeHtml(verdict.readiness) + '%</strong></div>' +
        '<p>' + escapeHtml(verdict.summary) + '</p></article>';
    }).join('');
    return '<section class="coach-ai-section coach-ai-history"><h4>История разборов</h4>' + items + '</section>';
  }

  function renderDiagnosticReview(result, target) {
    const badge = result.source === 'ai' ? 'Внешний AI' : 'Локальный разбор';
    const localNote = result.fallbackHint || 'Внешний AI недоступен — показан локальный диагностический разбор.';
    const verdict = result.verdict || {};
    const diagnostics = Array.isArray(result.diagnostics) ? result.diagnostics : [];
    const actions = Array.isArray(result.actionPlan) ? result.actionPlan : [];
    const days = Array.isArray(result.studyPlan) ? result.studyPlan : [];
    const retest = result.retest || {};
    const diagnosisMarkup = diagnostics.map(item =>
      '<article class="coach-ai-diagnosis coach-ai-severity-' + escapeAttr(item.severity) + '">' +
      '<div class="coach-ai-diagnosis-head"><strong>' + escapeHtml(item.concept) + '</strong><span>Уверенность ' + Math.round((item.confidence || 0) * 100) + '%</span></div>' +
      (item.evidence && item.evidence.length ? '<ul class="coach-ai-evidence">' + item.evidence.map(value => '<li>' + escapeHtml(value) + '</li>').join('') + '</ul>' : '') +
      '<p>' + escapeHtml(item.explanation) + '</p></article>'
    ).join('');
    const actionMarkup = actions.map(item =>
      '<article class="coach-ai-action"><span class="coach-ai-priority">Приоритет ' + escapeHtml(item.priority) + '</span>' +
      '<strong>' + escapeHtml(item.task) + '</strong>' +
      (item.practice ? '<p>' + escapeHtml(item.practice) + '</p>' : '') +
      '<div class="coach-ai-success">Критерий: ' + escapeHtml(item.successCriterion) + '</div></article>'
    ).join('');
    const dayMarkup = days.map(item =>
      '<article class="coach-ai-day"><span>День ' + escapeHtml(item.day) + '</span><strong>' + escapeHtml(item.title) + '</strong>' +
      (item.actions && item.actions.length ? '<ul>' + item.actions.map(value => '<li>' + escapeHtml(value) + '</li>').join('') + '</ul>' : '') +
      (item.successCriterion ? '<small>Готово, когда: ' + escapeHtml(item.successCriterion) + '</small>' : '') + '</article>'
    ).join('');
    const retestParts = [
      retest.topics && retest.topics.length ? 'Темы: ' + retest.topics.join(', ') : '',
      retest.categories && retest.categories.length ? 'Формат: ' + retest.categories.join(', ') : '',
      retest.levels && retest.levels.length ? 'Уровень: ' + retest.levels.join(', ') : '',
      retest.size ? 'Вопросов: ' + retest.size : ''
    ].filter(Boolean);
    const trend = currentReviewTrend && currentReviewTrend.count > 1 ? currentReviewTrend : null;
    const trendMarkup = trend
      ? '<section class="coach-ai-trend" aria-label="Динамика разборов"><span>История: ' + escapeHtml(trend.count) + '</span><strong>Точность: ' + escapeHtml(formatDelta(trend.accuracyDelta, '%')) + '</strong><strong>Готовность: ' + escapeHtml(formatDelta(trend.readinessDelta, '%')) + '</strong></section>'
      : '';
    const canRetest = retestParts.length && Array.isArray(retest.topics) && retest.topics.length;
    target.innerHTML = '<div class="coach-ai-result-head"><span class="coach-ai-badge">' + badge + '</span>' +
      (result.source === 'local' ? '<span>' + escapeHtml(localNote) + '</span>' : '<span>Переданы только результаты текущей контрольной.</span>') + '</div>' +
      '<section class="coach-ai-verdict"><div><span>Оценка уровня</span><strong>' + escapeHtml(verdict.levelEstimate || '—') + '</strong></div>' +
      '<div><span>Готовность</span><strong>' + escapeHtml(verdict.readiness) + '%</strong></div></section>' +
      trendMarkup +
      renderWeeklyTrend(currentReviewTrend) +
      '<p class="coach-ai-summary">' + escapeHtml(verdict.summary) + '</p>' +
      (diagnosisMarkup ? '<section class="coach-ai-section"><h4>Почему возникли ошибки</h4>' + diagnosisMarkup + '</section>' : '') +
      (actionMarkup ? '<section class="coach-ai-section coach-ai-next"><h4>Что делать дальше</h4>' + actionMarkup + '</section>' : '') +
      (dayMarkup ? '<section class="coach-ai-section"><h4>План на ' + days.length + ' ' + (days.length === 1 ? 'день' : days.length < 5 ? 'дня' : 'дней') + '</h4><div class="coach-ai-days">' + dayMarkup + '</div></section>' : '') +
      (retestParts.length ? '<section class="coach-ai-section coach-ai-retest"><h4>Повторная контрольная</h4><p>' + escapeHtml(retestParts.join(' · ')) + '</p><strong>' + escapeHtml(retest.successCriterion || '') + '</strong></section>' : '') +
      (result.caution ? '<p class="coach-ai-caution">' + escapeHtml(result.caution) + '</p>' : '') +
      renderReviewHistory(currentReviewTrend) +
      (canRetest ? '<button type="button" class="btn btn-primary btn-sm" data-coach-action="start-ai-retest">Запустить повторную контрольную</button>' : '') +
      '<button type="button" class="btn btn-outline btn-sm" data-coach-action="retry-ai-review">Обновить разбор</button>';
  }

  function renderAIReview(result) {
    const target = document.getElementById('coach-ai-content');
    if (!target) return;
    if (result && result.schemaVersion === 2) {
      renderDiagnosticReview(result, target);
      return;
    }
    const badge = result.source === 'ai' ? 'Внешний AI' : 'Локальный разбор';
    const section = (title, items, className) => items && items.length
      ? '<section class="coach-ai-section ' + className + '"><h4>' + title + '</h4><ul>' + items.map(item => '<li>' + escapeHtml(item) + '</li>').join('') + '</ul></section>'
      : '';
    // При локальном разборе показываем конкретную причину: без неё видно
    // только «Backend недоступен», и непонятно, что именно починить.
    const localNote = result.fallbackHint || 'Backend недоступен — данные не покидали браузер.';
    target.innerHTML = '<div class="coach-ai-result-head"><span class="coach-ai-badge">' + badge + '</span>' +
      (result.source === 'local' ? '<span>' + escapeHtml(localNote) + '</span>' : '<span>Переданы только агрегаты контрольной.</span>') + '</div>' +
      '<p class="coach-ai-summary">' + escapeHtml(result.summary) + '</p>' +
      '<div class="coach-ai-grid">' + section('Сильные стороны', result.strengths, 'coach-ai-strengths') + section('Пробелы', result.gaps, 'coach-ai-gaps') + '</div>' +
      section('Следующие шаги', result.nextSteps, 'coach-ai-next') +
      (result.caution ? '<p class="coach-ai-caution">' + escapeHtml(result.caution) + '</p>' : '') +
      '<button type="button" class="btn btn-outline btn-sm" data-coach-action="retry-ai-review">Обновить разбор</button>';
  }

  async function openAIReview() {
    if (!services.getControlSession || !services.getControlSession()) return;
    const requestId = ++reviewRequest;
    const target = document.getElementById('coach-ai-content');
    currentReview = null;
    currentReviewTrend = null;
    target.innerHTML = '<div class="coach-ai-loading"><span></span><strong>Анализирую контрольную…</strong><small>Отправляются результаты текущей контрольной и до 15 ошибочных или медленных вопросов.</small></div>';
    services.openModal('coach-ai-modal', '#coach-ai-close');
    const result = await services.requestAiReview();
    if (requestId !== reviewRequest) return;
    currentReview = result && result.schemaVersion === 2 ? result : null;
    currentReviewTrend = currentReview && typeof services.saveAiReview === 'function' ? services.saveAiReview(currentReview) : null;
    renderAIReview(result);
  }

  function handleAction(event) {
    if (!services || !event.target || typeof event.target.closest !== 'function') return;
    const trigger = event.target.closest('[data-coach-action]');
    if (!trigger || trigger.disabled) return;
    const action = trigger.dataset.coachAction;
    if (action === 'edit-goal') editGoal();
    else if (action === 'save-goal') saveGoal();
    else if (action === 'skip-goal') skipGoal();
    else if (action === 'start-focus') services.startFocus(trigger.dataset.topic, trigger.dataset.page, services.getPlan());
    else if (action === 'start-review') services.startReview(services.getPlan());
    else if (action === 'start-control') services.startControl(services.getPlan());
    else if (action === 'open-ai-review') openAIReview();
    else if (action === 'retry-ai-review') { openAIReview(); document.getElementById('coach-ai-close')?.focus(); }
    else if (action === 'start-ai-retest' && currentReview && typeof services.startRetest === 'function') {
      const recipe = currentReview.retest;
      reviewRequest++;
      services.closeModal('coach-ai-modal');
      services.startRetest(recipe);
    }
    else if (action === 'close-ai-review') { reviewRequest++; currentReview = null; currentReviewTrend = null; services.closeModal('coach-ai-modal'); }
    else if (action === 'open-journal') openJournal();
    else if (action === 'close-journal') services.closeModal('coach-journal-modal');
    else if (action === 'save-journal') saveJournal();
    else if (action === 'delete-note') deleteJournal(trigger.dataset.noteId);
  }

  const api = { configure, render, editGoal, formatInterviewTiming, formatDelta };
  return api;
});
