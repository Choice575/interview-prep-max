(function(root, factory) {
  const core = typeof module !== 'undefined' && module.exports ? require('./daily.js') : root.IPMaxDaily;
  const api = factory(core);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IPMaxDailyUI = api;
})(typeof self !== 'undefined' ? self : globalThis, function(core) {
  'use strict';

  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function asArray(value) { return Array.isArray(value) ? value : []; }
  function asObject(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  function num(value) { return Number.isFinite(Number(value)) ? Number(value) : 0; }

  const LEVEL_LABELS = { Junior: 'Junior', Middle: 'Middle', Senior: 'Senior' };

  function compositionLabel(composition) {
    const counts = asArray(composition).reduce((acc, level) => {
      const key = LEVEL_LABELS[level] || 'Middle';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.keys(LEVEL_LABELS)
      .filter(level => counts[level])
      .map(level => counts[level] + ' ' + level)
      .join(' · ');
  }

  /**
   * The daily blitz card. Three states share one renderer so the card never
   * jumps in height: not started, in progress, done for today.
   */
  function renderBlitzCard(input) {
    const state = asObject(input);
    const blitz = asObject(state.state);
    const set = asObject(state.set);
    const questions = asArray(set.questions);
    const size = questions.length || core.BLITZ_SIZE;
    const answered = Math.min(size, num(blitz.answered));
    const correct = Math.min(size, num(blitz.correct));
    const streak = num(blitz.streak);
    const done = blitz.completed === true;
    const countdown = core.formatCountdown(num(state.secondsUntilReset));
    const topics = asArray(set.topics).slice(0, 5);
    const topicChips = topics.length
      ? '<div class="daily-topics">' + topics.map((topic, index) =>
        '<span class="daily-topic"><b>#' + (index + 1) + '</b>' + escapeHtml(topic) + '</span>').join('') + '</div>'
      : '';
    const progressPct = size ? Math.round(answered / size * 100) : 0;

    let action;
    if (!questions.length) {
      action = '<div class="daily-empty">Данные вопросов не загружены — блиц будет доступен после загрузки.</div>';
    } else if (done) {
      const grade = core.grade(correct, size);
      action = '<div class="daily-done">'
        + '<div class="daily-done-icon" aria-hidden="true">' + escapeHtml(grade.icon) + '</div>'
        + '<div><div class="daily-done-title">Блиц пройден: ' + correct + ' из ' + size + '</div>'
        + '<div class="daily-done-sub">' + escapeHtml(grade.label) + ' · новый блиц через ' + countdown + '</div></div>'
        + '<button type="button" class="btn btn-outline btn-sm" data-daily-action="review">Разобрать ошибки</button>'
        + '</div>';
    } else {
      action = '<button type="button" class="btn btn-primary daily-start" data-daily-action="start">'
        + (answered > 0 ? '▶ Продолжить блиц (' + answered + '/' + size + ')' : '⚡ Начать ежедневный блиц')
        + '</button>';
    }

    return '<div class="daily-card">'
      + '<div class="daily-head">'
      + '<div><div class="daily-kicker">Ежедневный блиц</div>'
      + '<h3 class="daily-title">' + size + ' вопросов, ' + (done ? 'на сегодня готово' : 'около 5 минут') + '</h3>'
      + '<p class="daily-sub">' + escapeHtml(compositionLabel(set.composition)) + '</p></div>'
      + '<div class="daily-streak" role="img" aria-label="Серия дней подряд: ' + streak + '">'
      + '<span class="daily-streak-num">🔥 ' + streak + '</span>'
      + '<span class="daily-streak-lbl">' + (streak === 1 ? 'день' : 'дней') + ' подряд</span>'
      + '</div>'
      + '</div>'
      + '<div class="daily-bar"><div class="daily-bar-fill" style="width:' + progressPct + '%"></div></div>'
      + '<div class="daily-meta"><span>Прогресс: ' + answered + '/' + size + '</span>'
      + '<span>Сброс через ' + countdown + '</span></div>'
      + topicChips
      + action
      + '</div>';
  }

  /** Skill of the day: one Best Practices rule with the reason and the action. */
  function renderSkillCard(skill) {
    if (!skill) return '';
    const item = asObject(skill);
    return '<div class="skill-card">'
      + '<div class="skill-head">'
      + '<span class="skill-icon" aria-hidden="true">' + escapeHtml(item.icon || '✦') + '</span>'
      + '<div><div class="skill-kicker">Навык дня · ' + escapeHtml(item.topic || '') + '</div>'
      + '<h3 class="skill-title">' + escapeHtml(item.title) + '</h3></div>'
      + '</div>'
      + (item.why ? '<p class="skill-why">' + escapeHtml(item.why) + '</p>' : '')
      + (item.action ? '<div class="skill-action"><b>Что делать:</b> ' + escapeHtml(item.action) + '</div>' : '')
      + '<div class="skill-foot">'
      + '<span class="skill-counter">' + num(item.position) + ' из ' + num(item.total) + '</span>'
      + '<button type="button" class="btn btn-outline btn-sm" data-daily-action="practices"'
      + ' data-daily-slug="' + escapeHtml(item.slug || '') + '">Открыть тему</button>'
      + '</div>'
      + '</div>';
  }

  function create(services, environment) {
    const source = asObject(services);
    const env = asObject(environment);
    const doc = env.document || (typeof document !== 'undefined' ? document : null);
    const run = (name, ...args) => (typeof source[name] === 'function' ? source[name](...args) : undefined);
    const byId = id => (doc ? doc.getElementById(id) : null);

    function bind(container) {
      if (!container || typeof container.querySelectorAll !== 'function') return;
      container.querySelectorAll('[data-daily-action]').forEach(button => {
        const action = button.getAttribute('data-daily-action');
        button.addEventListener('click', () => {
          if (action === 'start') return run('startBlitz');
          if (action === 'review') return run('reviewMistakes');
          if (action === 'practices') return run('openPractices', button.getAttribute('data-daily-slug'));
          return undefined;
        });
      });
    }

    function renderBlitz() {
      const target = byId('daily-blitz-card');
      if (!target) return null;
      const now = run('now') || Date.now();
      const state = core.stateForDay(run('getState'), now);
      const set = core.selectQuestions({ questions: run('getQuestions') || [], topics: run('getTopics') || [], now });
      target.innerHTML = renderBlitzCard({ state, set, secondsUntilReset: core.secondsUntilReset(now) });
      bind(target);
      return { state, set };
    }

    function renderSkill() {
      const target = byId('daily-skill-card');
      if (!target) return null;
      const skill = core.skillOfTheDay({ bestPractices: run('getBestPractices'), now: run('now') || Date.now() });
      target.innerHTML = renderSkillCard(skill);
      bind(target);
      return skill;
    }

    function render() {
      renderBlitz();
      renderSkill();
    }

    return { render, renderBlitz, renderSkill };
  }

  return { escapeHtml, compositionLabel, renderBlitzCard, renderSkillCard, create };
});
