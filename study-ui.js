(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IPMaxStudyUI = api;
})(typeof self !== 'undefined' ? self : globalThis, function() {
  const STATUS_GROUPS = [
    { key: 'preferred', label: 'Предпочтительно' },
    { key: 'current', label: 'Актуально' },
    { key: 'legacy', label: 'Legacy' },
    { key: 'eol', label: 'EOL' },
    { key: 'overviewOnly', label: 'Только обзор' },
    { key: 'optional', label: 'Опционально' },
  ];

  function defaultEscape(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatReviewDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    return match ? `${match[3]}.${match[2]}.${match[1]}` : '';
  }

  function renderExpectedResult(value, escapeHtml) {
    const result = String(value || '').trim();
    if (!result) return '';
    const esc = typeof escapeHtml === 'function' ? escapeHtml : defaultEscape;
    return '<div class="study-expected-result">' +
      '<div class="study-outcome-label">Проверяемый результат</div>' +
      '<p>' + esc(result) + '</p></div>';
  }

  function renderWeekNavigator(weeks, activeWeek, escapeHtml, weekStates) {
    if (!Array.isArray(weeks) || !weeks.length) return '';
    const esc = typeof escapeHtml === 'function' ? escapeHtml : defaultEscape;
    const currentIndex = Math.max(0, weeks.findIndex(week => week && week.week === activeWeek));
    const current = weeks[currentIndex];
    if (!current) return '';
    const previous = weeks[currentIndex - 1];
    const next = weeks[currentIndex + 1];
    const options = weeks.map(week =>
      '<option value="' + week.week + '"' + (week.week === current.week ? ' selected' : '') + '>' +
        'Неделя ' + week.week + ' · ' + esc(week.title || '') + '</option>'
    ).join('');
    const states = weekStates && typeof weekStates === 'object' && !Array.isArray(weekStates) ? weekStates : {};
    const stateLabels = { complete: 'завершена', available: 'доступна', locked: 'закрыта' };
    const map = weeks.map(week => {
      const state = states[week.week] || '';
      const stateClass = stateLabels[state] ? ' is-' + state : '';
      const stateLabel = stateLabels[state] ? ', ' + stateLabels[state] : '';
      return '<button type="button" class="study-week-map-item' + stateClass + (week.week === current.week ? ' is-current' : '') + '" ' +
        'data-study-week="' + week.week + '"' + (week.week === current.week ? ' aria-current="step"' : '') +
        ' aria-label="Неделя ' + week.week + stateLabel + '">' +
        '<span>' + String(week.week).padStart(2, '0') + '</span><strong>' + esc(week.title || '') + '</strong>' +
      '</button>';
    }).join('');

    return '<section class="study-roadmap-nav" aria-label="Навигация по учебному плану">' +
      '<div class="study-roadmap-controls">' +
        '<button type="button" class="btn btn-outline btn-sm" data-study-week-shift="-1"' + (!previous ? ' disabled' : '') +
          ' aria-label="Предыдущая неделя">← <span>' + (previous ? 'Неделя ' + previous.week : 'Начало') + '</span></button>' +
        '<label class="study-week-select"><span>Текущая неделя</span><select data-study-week-select>' + options + '</select></label>' +
        '<button type="button" class="btn btn-outline btn-sm" data-study-week-shift="1"' + (!next ? ' disabled' : '') +
          ' aria-label="Следующая неделя"><span>' + (next ? 'Неделя ' + next.week : 'Финиш') + '</span> →</button>' +
      '</div>' +
      '<details class="study-week-map"><summary>Карта курса · ' + weeks.length + ' недели</summary>' +
        '<div class="study-week-map-grid">' + map + '</div></details>' +
    '</section>';
  }

  function renderWeekContext(week, escapeHtml) {
    if (!week || typeof week !== 'object' || Array.isArray(week)) return '';
    const esc = typeof escapeHtml === 'function' ? escapeHtml : defaultEscape;
    const productionLayer = String(week.productionLayer || '').trim();
    const prerequisites = Array.isArray(week.prerequisites)
      ? week.prerequisites.filter(value => String(value || '').trim())
      : [];
    if (!productionLayer && !prerequisites.length) return '';

    const productionMarkup = productionLayer
      ? '<div class="study-context-block study-context-production">' +
          '<div class="study-context-label">Production-слой</div>' +
          '<p>' + esc(productionLayer) + '</p>' +
        '</div>'
      : '';
    const prerequisitesMarkup = prerequisites.length
      ? '<div class="study-context-block study-context-prerequisites">' +
          '<div class="study-context-label">Входные условия</div>' +
          '<ul>' + prerequisites.map(value => '<li>' + esc(value) + '</li>').join('') + '</ul>' +
        '</div>'
      : '';

    return '<div class="study-week-context' + (productionMarkup && prerequisitesMarkup ? ' has-prerequisites' : '') + '">' +
      productionMarkup + prerequisitesMarkup + '</div>';
  }

  function renderWeekOutcome(week, completedCriteria, escapeHtml) {
    if (!week || typeof week !== 'object' || Array.isArray(week)) return '';
    const esc = typeof escapeHtml === 'function' ? escapeHtml : defaultEscape;
    const artifact = String(week.artifact || '').trim();
    const criteria = Array.isArray(week.completionCriteria)
      ? week.completionCriteria.filter(value => String(value || '').trim())
      : [];
    if (!artifact && !criteria.length) return '';

    const completed = Array.isArray(completedCriteria) ? completedCriteria : [];
    const completedCount = criteria.reduce((total, value, index) => total + (completed[index] === true ? 1 : 0), 0);
    const artifactMarkup = artifact
      ? '<div class="study-artifact"><div class="study-outcome-label">Артефакт недели</div><p>' + esc(artifact) + '</p></div>'
      : '';
    const criteriaMarkup = criteria.length
      ? '<div class="study-criteria"><div class="study-criteria-head"><h4>Критерии завершения</h4>' +
          '<span aria-live="polite">' + completedCount + ' / ' + criteria.length + '</span></div>' +
          '<div class="study-criteria-list">' + criteria.map((value, index) =>
            '<label class="study-criterion' + (completed[index] === true ? ' is-complete' : '') + '">' +
              '<input type="checkbox" data-study-criterion="' + index + '"' + (completed[index] === true ? ' checked' : '') + '>' +
              '<span class="study-criterion-box" aria-hidden="true"></span>' +
              '<span class="study-criterion-text">' + esc(value) + '</span>' +
            '</label>'
          ).join('') + '</div></div>'
      : '';

    return '<section class="study-card study-outcome">' +
      '<div class="study-outcome-kicker">Результат недели</div><h3>Что должно остаться после практики</h3>' +
      artifactMarkup + criteriaMarkup + '</section>';
  }

  function renderAITrack(track, escapeHtml) {
    if (!track || typeof track !== 'object' || Array.isArray(track)) return '';
    const esc = typeof escapeHtml === 'function' ? escapeHtml : defaultEscape;
    const title = String(track.title || '').trim();
    const result = String(track.result || '').trim();
    if (!title && !result) return '';
    const optional = track.optional === true;
    const visibleTitle = title || 'AI-дополнение недели';
    const resultMarkup = result && result !== title
      ? '<p class="study-ai-result"><span>Результат</span>' + esc(result) + '</p>'
      : '';

    return '<section class="study-card study-ai-track">' +
      '<div class="study-ai-mark" aria-hidden="true"><span>AI</span></div>' +
      '<div class="study-ai-content"><div class="study-ai-head"><span>AI-трек</span>' +
        (optional ? '<strong>Опционально</strong>' : '') + '</div>' +
        '<h3>' + esc(visibleTitle) + '</h3>' + resultMarkup +
        (optional ? '<p class="study-ai-policy">Не влияет на завершение DevOps-недели</p>' : '') +
      '</div></section>';
  }

  function renderTechnologyStatus(status, escapeHtml) {
    if (!status || typeof status !== 'object' || Array.isArray(status)) return '';
    const esc = typeof escapeHtml === 'function' ? escapeHtml : defaultEscape;
    const groups = STATUS_GROUPS.map(group => ({
      ...group,
      values: Array.isArray(status[group.key]) ? status[group.key].filter(value => String(value || '').trim()) : [],
    })).filter(group => group.values.length);
    if (!groups.length) return '';

    const reviewed = formatReviewDate(status.lastReviewed);
    const source = String(status.source || '').trim();
    const note = String(status.note || '').trim();
    const groupsMarkup = groups.map(group =>
      '<div class="study-tech-group study-tech-' + group.key + '">' +
        '<div class="study-tech-label"><span aria-hidden="true"></span>' + esc(group.label) + '</div>' +
        '<div class="study-tech-items">' + group.values.map(value => '<span>' + esc(value) + '</span>').join('') + '</div>' +
      '</div>'
    ).join('');

    return '<section class="study-tech-panel" aria-label="Статус технологий">' +
      '<div class="study-tech-head"><div><div class="study-tech-eyebrow">Технологический радар</div>' +
      (reviewed ? '<div class="study-tech-reviewed">Проверено ' + esc(reviewed) + '</div>' : '') + '</div>' +
      (source ? '<div class="study-tech-source" title="Контрольный источник">' + esc(source) + '</div>' : '') + '</div>' +
      '<div class="study-tech-groups">' + groupsMarkup + '</div>' +
      (note ? '<p class="study-tech-note">' + esc(note) + '</p>' : '') +
      '</section>';
  }

  // Переключатель учебных программ. Программ теперь две (devops, mlops), и у
  // каждой свой прогресс: подпись и счётчик недель берутся из самих карт, иначе
  // после правки датасета в интерфейсе останется «32 недели» при 24 реальных.
  function renderProgramSwitch(programs, activeId, escapeHtml) {
    const list = Array.isArray(programs) ? programs.filter(item => item && item.id) : [];
    if (list.length < 2) return '';
    const esc = typeof escapeHtml === 'function' ? escapeHtml : defaultEscape;
    const active = list.some(item => item.id === activeId) ? activeId : list[0].id;

    const buttons = list.map(item => {
      const weeks = Number(item.totalWeeks) || 0;
      const detailed = Number(item.detailedWeeks);
      const partial = Number.isFinite(detailed) && detailed > 0 && detailed < weeks;
      return '<button type="button" class="study-program' + (item.id === active ? ' is-active' : '') + '" ' +
        'data-study-program="' + esc(item.id) + '"' + (item.id === active ? ' aria-current="true"' : '') + '>' +
        '<strong>' + esc(item.title || item.id) + '</strong>' +
        '<small>' + weeks + ' недель' +
          (partial ? ' · детализировано ' + detailed : '') +
        '</small>' +
      '</button>';
    }).join('');

    return '<section class="study-program-switch" aria-label="Учебная программа">' +
      '<div class="study-program-label">Учебная программа</div>' +
      '<div class="study-program-list">' + buttons + '</div>' +
    '</section>';
  }

  // Неделя может быть описана на уровне карты (цель, артефакт, критерии), но ещё
  // не разбита по дням: во второй учебной программе так живут 18 недель из 24.
  // Без этой ветки renderStudy() берёт week.days[0] у пустого массива и падает,
  // унося за собой всю страницу учебного плана.
  function isPlannedWeek(week) {
    if (!week || typeof week !== 'object' || Array.isArray(week)) return false;
    return !Array.isArray(week.days) || week.days.length === 0;
  }

  function renderPlannedWeekNotice(week, escapeHtml) {
    if (!isPlannedWeek(week)) return '';
    const esc = typeof escapeHtml === 'function' ? escapeHtml : defaultEscape;
    const stage = String(week.roadmapStage || '').trim();
    const topics = Array.isArray(week.mainTopics)
      ? week.mainTopics.filter(value => String(value || '').trim())
      : [];
    const goal = String(week.goal || '').trim();

    return '<section class="study-card study-planned-week">' +
      '<div class="study-planned-kicker">Неделя описана, дни ещё не детализированы</div>' +
      '<h3>' + esc(week.title || ('Неделя ' + (week.week || ''))) + '</h3>' +
      (goal ? '<p class="study-planned-goal">' + esc(goal) + '</p>' : '') +
      (stage ? '<p class="study-planned-stage"><span>Этап роадмапа</span>' + esc(stage) + '</p>' : '') +
      (topics.length
        ? '<div class="study-planned-topics">' + topics.map(value => '<span>' + esc(value) + '</span>').join('') + '</div>'
        : '') +
      '<p class="study-planned-hint">Цель, production-слой, артефакт и критерии завершения ниже уже актуальны. ' +
        'Разбивка на пять учебных дней и мини-тесты для этой недели пока не готовы.</p>' +
    '</section>';
  }

  function clampWeeklyScore(value, maximum) {
    const max = Number.isFinite(Number(maximum)) ? Math.max(0, Math.round(Number(maximum))) : 0;
    const score = Number(value);
    if (!Number.isFinite(score)) return 0;
    return Math.min(max, Math.max(0, Math.round(score)));
  }

  function evaluateWeeklyAttempt(test, submittedScores, requirements) {
    const parts = test && typeof test === 'object' && !Array.isArray(test) ? (test.parts || {}) : {};
    const scores = submittedScores && typeof submittedScores === 'object' && !Array.isArray(submittedScores) ? submittedScores : {};
    const gates = requirements && typeof requirements === 'object' && !Array.isArray(requirements) ? requirements : {};
    const maxima = {
      practice: Number(parts.practice?.score) || 0,
      theory: Number(parts.theory?.score) || 0,
      debug: Number(parts.debug?.score) || 0,
      seniorChallenge: Number(parts.seniorChallenge?.score) || 0,
    };
    const normalisedScores = Object.fromEntries(
      Object.entries(maxima).map(([key, maximum]) => [key, clampWeeklyScore(scores[key], maximum)])
    );
    const total = Object.values(normalisedScores).reduce((sum, score) => sum + score, 0);
    const configuredMaximum = Number(test?.maxScore);
    const maxScore = Number.isFinite(configuredMaximum) && configuredMaximum > 0
      ? Math.round(configuredMaximum)
      : Object.values(maxima).reduce((sum, score) => sum + score, 0);
    const configuredPassScore = Number(gates.passScore);
    const passScore = Number.isFinite(configuredPassScore) && configuredPassScore > 0
      ? Math.min(maxScore, Math.round(configuredPassScore))
      : Math.min(maxScore, 70);
    const completionGates = {
      score: total >= passScore,
      artifact: gates.artifactReady === true,
      criteria: gates.criteriaComplete === true,
      criticalErrors: gates.criticalReviewed === true,
    };

    return {
      scores: normalisedScores,
      total,
      maxScore,
      passScore,
      gates: completionGates,
      passed: Object.values(completionGates).every(Boolean),
    };
  }

  function buildStudyOverview(weeks, miniTests, weeklyTests, state) {
    const roadmapWeeks = Array.isArray(weeks) ? weeks.filter(Boolean) : [];
    const mini = Array.isArray(miniTests) ? miniTests : [];
    const weekly = Array.isArray(weeklyTests) ? weeklyTests : [];
    const stored = state && typeof state === 'object' && !Array.isArray(state) ? state : {};
    const progress = stored.progress && typeof stored.progress === 'object' ? stored.progress : {};
    const miniAnswers = stored.miniAnswers && typeof stored.miniAnswers === 'object' ? stored.miniAnswers : {};
    const weeklyResults = stored.weeklyResults && typeof stored.weeklyResults === 'object' ? stored.weeklyResults : {};
    const activePosition = stored.activePosition && typeof stored.activePosition === 'object' ? stored.activePosition : {};
    const weeklyByWeek = new Map(weekly.map(test => [test.week, test]));
    const passedWeek = weekNumber => {
      const test = weeklyByWeek.get(weekNumber);
      return Boolean(test && weeklyResults[test.id]?.passed === true);
    };
    const dayStatus = (weekNumber, dayNumber) => {
      const explicit = progress[`w${weekNumber}d${dayNumber}`];
      if (explicit) return explicit;
      return dayNumber === 1 && (weekNumber === 1 || passedWeek(weekNumber - 1)) ? 'todo' : 'locked';
    };
    const days = roadmapWeeks.flatMap(week => (Array.isArray(week.days) ? week.days : []).map(day => ({
      week: week.week,
      day: day.day,
      title: day.title || '',
      status: dayStatus(week.week, day.day),
    })));
    const doneDays = days.filter(day => day.status === 'done').length;
    const attemptedMiniTests = mini.filter(test => {
      const answer = miniAnswers[test.id];
      return answer && (Array.isArray(answer.qScores) || answer.completedAt);
    }).length;
    const passedMiniTests = mini.filter(test => Number(miniAnswers[test.id]?.score) >= 4).length;
    const passedWeeks = roadmapWeeks.filter(week => passedWeek(week.week)).length;
    const weekStates = {};
    roadmapWeeks.forEach(week => {
      const hasStarted = (week.days || []).some(day => {
        const key = `w${week.week}d${day.day}`;
        return Object.prototype.hasOwnProperty.call(progress, key) && progress[key] !== 'locked';
      });
      weekStates[week.week] = passedWeek(week.week)
        ? 'complete'
        : (week.week === 1 || passedWeek(week.week - 1) || hasStarted ? 'available' : 'locked');
    });

    const priority = { review: 0, in_progress: 1, todo: 2 };
    const nextDay = days
      .filter(day => Object.prototype.hasOwnProperty.call(priority, day.status))
      .sort((left, right) => priority[left.status] - priority[right.status] || left.week - right.week || left.day - right.day)[0] || null;
    const recommendations = [];
    const seen = new Set();
    const addRecommendation = item => {
      const key = `${item.week || 0}:${item.day || 0}:${item.kind}`;
      if (recommendations.length >= 3 || seen.has(key)) return;
      seen.add(key);
      recommendations.push(item);
    };

    weekly.forEach(test => {
      const result = weeklyResults[test.id];
      if (!result || result.passed === true || !result.lastAttempt) return;
      addRecommendation({
        kind: 'weekly', week: test.week, day: 5,
        title: `Повторить недельный тест ${test.week}`,
        detail: `Последняя попытка: ${Number(result.lastAttempt.total) || 0} / ${Number(result.lastAttempt.maxScore) || Number(test.maxScore) || 100}.`,
      });
    });
    mini.forEach(test => {
      const answer = miniAnswers[test.id];
      if (!answer || !Array.isArray(answer.qScores) || Number(answer.score) >= 4) return;
      addRecommendation({
        kind: 'mini', week: test.week, day: test.day,
        title: `Разобрать мини-тест W${test.week}D${test.day}`,
        detail: `${Number(answer.score) || 0} / 5: сверить объяснения и повторить проверку.`,
      });
    });
    days.filter(day => day.status === 'review').forEach(day => addRecommendation({
      kind: 'review', week: day.week, day: day.day,
      title: `Вернуться к W${day.week}D${day.day}`,
      detail: day.title || 'Материал отмечен для повторения.',
    }));
    if (!recommendations.length && nextDay) addRecommendation({
      kind: 'next', week: nextDay.week, day: nextDay.day,
      title: `Продолжить с W${nextDay.week}D${nextDay.day}`,
      detail: nextDay.title || 'Следующий доступный день учебного плана.',
    });
    if (!recommendations.length && days.length && doneDays === days.length) addRecommendation({
      kind: 'complete', title: 'Курс пройден', detail: 'Все учебные дни завершены. Поддерживайте форму повторными тестами.',
    });

    return {
      // Подпись программы приходит из загруженной карты, а не из константы:
      // это единственный способ не соврать про число недель после правки данных.
      programId: typeof stored.programId === 'string' ? stored.programId : 'devops',
      programTitle: typeof stored.programTitle === 'string' ? stored.programTitle : '',
      totalDays: days.length,
      doneDays,
      percent: days.length ? Math.round(doneDays / days.length * 100) : 0,
      totalWeeks: roadmapWeeks.length,
      passedWeeks,
      totalMiniTests: mini.length,
      attemptedMiniTests,
      passedMiniTests,
      nextDay,
      activePosition: { week: Number(activePosition.week) || 1, day: Number(activePosition.day) || 1 },
      recommendations,
      weekStates,
    };
  }

  function renderStudyOverview(overview, escapeHtml) {
    if (!overview || typeof overview !== 'object' || Array.isArray(overview)) return '';
    const esc = typeof escapeHtml === 'function' ? escapeHtml : defaultEscape;
    const percent = Math.min(100, Math.max(0, Number(overview.percent) || 0));
    const next = overview.nextDay;
    const nextMarkup = next
      ? '<button type="button" class="btn btn-primary study-overview-continue" data-study-jump-week="' + next.week + '" data-study-jump-day="' + next.day + '">Продолжить · W' + next.week + 'D' + next.day + '</button>'
      : '<span class="study-overview-complete">Маршрут завершён</span>';
    const recommendations = Array.isArray(overview.recommendations) ? overview.recommendations : [];
    const recommendationsMarkup = recommendations.map(item => {
      const canJump = Number.isInteger(item.week) && Number.isInteger(item.day);
      const tag = canJump ? 'button' : 'div';
      const attributes = canJump
        ? ' type="button" data-study-jump-week="' + item.week + '" data-study-jump-day="' + item.day + '"'
        : '';
      return '<' + tag + ' class="study-recommendation is-' + esc(item.kind || 'next') + '"' + attributes + '>' +
        '<span aria-hidden="true"></span><div><strong>' + esc(item.title || '') + '</strong><small>' + esc(item.detail || '') + '</small></div>' +
      '</' + tag + '>';
    }).join('');

    return '<section class="study-overview" aria-labelledby="study-overview-title">' +
      // Подпись выводится из данных: хардкод «Roadmap 5.1 · 32 недели» соврал бы
      // на любой другой программе и после правки самого датасета.
      '<div class="study-overview-head"><div><div class="study-overview-kicker">' +
        esc(overview.programTitle || 'Учебный план') + ' · ' + (Number(overview.totalWeeks) || 0) + ' недель</div>' +
        '<h2 id="study-overview-title">Общий прогресс курса</h2></div>' + nextMarkup + '</div>' +
      '<div class="study-overview-progress"><div class="study-overview-progress-copy"><strong>' + percent + '%</strong><span>' +
        overview.doneDays + ' из ' + overview.totalDays + ' учебных дней</span></div>' +
        '<div class="study-overview-track" role="progressbar" aria-label="Прогресс учебного курса" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + percent + '">' +
          '<span style="width:' + percent + '%"></span></div></div>' +
      '<div class="study-overview-metrics">' +
        '<div><strong>' + overview.passedWeeks + ' / ' + overview.totalWeeks + '</strong><span>недель зачтено</span></div>' +
        '<div><strong>' + overview.passedMiniTests + ' / ' + overview.totalMiniTests + '</strong><span>мини-тестов ≥ 4/5</span></div>' +
        '<div><strong>' + overview.attemptedMiniTests + '</strong><span>мини-тестов начато</span></div>' +
      '</div>' +
      '<div class="study-overview-recommendations"><h3>Что делать дальше</h3><div>' + recommendationsMarkup + '</div></div>' +
    '</section>';
  }

  function renderTutorButton(source) {
    const safeSource = source === 'course' ? 'course' : 'study';
    return '<button type="button" class="btn btn-outline tutor-open-btn" data-tutor-open="' + safeSource +
      '" aria-label="Спросить AI-учителя по текущей теме">Спросить AI-учителя</button>';
  }

  return { STATUS_GROUPS, formatReviewDate, renderExpectedResult, renderWeekNavigator, renderWeekContext, renderWeekOutcome, renderAITrack, renderTechnologyStatus, renderProgramSwitch, isPlannedWeek, renderPlannedWeekNotice, clampWeeklyScore, evaluateWeeklyAttempt, buildStudyOverview, renderStudyOverview, renderTutorButton };
});
