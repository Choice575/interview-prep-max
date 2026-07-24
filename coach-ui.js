(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.InterviewCoachUI = api;
})(typeof self !== 'undefined' ? self : globalThis, function() {
  let services = null;
  let bound = false;

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

  function configure(input) {
    services = input || null;
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
    const focusAction = focus ? ' data-topic="' + escapeAttr(focus.topic) + '" data-page="' + escapeAttr(focus.action && focus.action.page || '') + '"' : ' disabled';
    const adjustment = review.extraQuestions ? '<div class="coach-adjustment">План скорректирован: +' + review.extraQuestions + ' вопросов в сессию, пока недельный темп ниже цели.</div>' : '';
    const controlTopics = control.topics && control.topics.length ? ' · ' + control.topics.map(escapeHtml).join(', ') : '';
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
    else if (action === 'open-journal') openJournal();
    else if (action === 'close-journal') services.closeModal('coach-journal-modal');
    else if (action === 'save-journal') saveJournal();
    else if (action === 'delete-note') deleteJournal(trigger.dataset.noteId);
  }

  const api = { configure, render, editGoal, formatInterviewTiming, formatDelta };
  return api;
});
