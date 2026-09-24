(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IPMaxHomeUI = api;
})(typeof self !== 'undefined' ? self : globalThis, function() {
  const ICONS = ['⚡', '🐧', '🌐', '📦', '🐳', '☸️', '🔄', '🔀', '🔍'];
  const COLORS = ['var(--primary)', 'var(--green)', 'var(--blue)', 'var(--orange)', '#38bdf8', '#60a5fa', '#fb923c', '#f59e0b', '#c084fc'];
  const QUICK_ACTIONS = [
    { id: 'blitz-btn', action: 'startBlitz', label: '⚡ Блиц (5 мин)', aria: 'Блиц-опрос на 5 минут', style: 'background:var(--primary-dim);color:var(--primary-h);border-color:var(--primary)' },
    { id: 'mock-btn', action: 'startMockInterview', label: '🎤 Mock Interview (30 мин)', aria: 'Mock интервью на 30 минут', style: 'background:var(--primary-dim);color:var(--primary-h);border-color:var(--primary)' },
    { id: 'diag-btn', action: 'startDiagnostic', label: '🔬 Диагностика', aria: 'Диагностический тест на 15 вопросов', style: 'background:var(--yellow-dim);color:var(--yellow);border-color:var(--yellow)' },
    { id: 'inc-btn', action: 'startIncident', label: '🚨 Инцидент', aria: 'Симуляция инцидента', style: 'background:var(--red-dim);color:var(--red);border-color:var(--red)' }
  ];

  function progressFor(question, progress) {
    if (!question || !progress) return null;
    return Object.prototype.hasOwnProperty.call(progress, question.id) ? progress[question.id] : null;
  }

  function calculateMastery(questions, progress, topics, limit) {
    const maximum = Number.isInteger(limit) && limit > 0 ? limit : 9;
    const grouped = new Map();
    (Array.isArray(questions) ? questions : []).forEach(question => {
      const topic = String(question && question.topic || 'Без темы');
      if (!grouped.has(topic)) grouped.set(topic, []);
      grouped.get(topic).push(question);
    });

    return (Array.isArray(topics) ? topics : []).slice(0, maximum).map((topic, index) => {
      const name = String(topic);
      const topicQuestions = grouped.get(name) || [];
      const mastered = topicQuestions.filter(question => {
        const item = progressFor(question, progress);
        return !!item && Number(item.correct || 0) > Number(item.wrong || 0);
      }).length;
      return {
        topic: name,
        total: topicQuestions.length,
        mastered,
        score: topicQuestions.length ? Math.round(mastered / topicQuestions.length * 100) : 0,
        icon: ICONS[index] || '📋',
        color: COLORS[index] || 'var(--primary)'
      };
    });
  }

  function recentHistory(history, limit) {
    const maximum = Number.isInteger(limit) && limit > 0 ? limit : 5;
    return (Array.isArray(history) ? history : []).slice(0, maximum);
  }

  function create(services, environment) {
    const source = services || {};
    const env = environment || {};
    const doc = env.document || (typeof document !== 'undefined' ? document : null);
    const boundActions = new WeakSet();
    const byId = id => doc && doc.getElementById(id);
    const run = (name, ...args) => {
      if (typeof source[name] === 'function') return source[name](...args);
      return undefined;
    };
    const make = (tag, className, text) => {
      const element = doc.createElement(tag);
      if (className) element.className = className;
      if (text !== undefined) element.textContent = String(text);
      return element;
    };
    const clear = element => {
      if (typeof element.replaceChildren === 'function') element.replaceChildren();
      else element.innerHTML = '';
    };

    function renderMasteryCards() {
      const target = byId('mastery-cards');
      if (!target || !doc) return;
      const cards = calculateMastery(
        run('getQuestions') || [],
        run('getQuestionProgress') || {},
        run('getTopics') || []
      );
      clear(target);
      cards.forEach(item => {
        const button = make('button', 'mastery-card');
        button.type = 'button';
        button.setAttribute('data-home-topic', item.topic);
        button.setAttribute('aria-label', item.topic + ': освоено ' + item.score + '%');

        const icon = make('div', '', item.icon);
        icon.style.fontSize = '20px';
        const score = make('div', 'mastery-pct', item.score + '%');
        score.style.color = item.color;
        const name = make('div', 'mastery-name', item.topic);
        const count = make('div', '', item.mastered + '/' + item.total);
        count.style.fontSize = '11px';
        count.style.color = 'var(--text3)';
        count.style.marginTop = '2px';
        const bar = make('div', 'mastery-bar');
        const fill = make('div', 'mastery-fill');
        fill.style.width = item.score + '%';
        fill.style.background = item.color;
        bar.appendChild(fill);

        button.appendChild(icon);
        button.appendChild(score);
        button.appendChild(name);
        button.appendChild(count);
        button.appendChild(bar);
        button.addEventListener('click', () => run('openTopic', item.topic));
        target.appendChild(button);
      });
    }

    function renderStreak() {
      const streak = Math.max(0, Number(run('getStreak') || 0));
      const best = Math.max(0, Number(run('get', 'streak_best', 0) || 0));
      const banner = byId('home-streak-banner');
      const current = byId('home-streak-num');
      const record = byId('home-best-streak');
      if (banner) banner.style.display = streak > 0 || best > 0 ? 'flex' : 'none';
      if (current) current.textContent = String(streak);
      if (record) record.textContent = 'Лучшая серия: ' + best;
    }

    function renderHistory() {
      const target = byId('home-history');
      if (!target || !doc) return;
      const history = recentHistory(run('get', 'history', []) || []);
      clear(target);
      if (!history.length) {
        const empty = make('p', '', 'История пуста. Начните экзамен!');
        empty.style.color = 'var(--text3)';
        empty.style.fontSize = '13px';
        target.appendChild(empty);
        return;
      }
      history.forEach(item => {
        const row = make('div', 'history-item');
        const date = make('span', '', item && item.date || '');
        date.style.color = 'var(--text3)';
        date.style.fontSize = '11px';
        const topic = make('span', '', item && item.topic || '');
        const correct = !!(item && item.correct);
        const status = make('span', '', correct ? '✅ Верно' : '❌ Неверно');
        status.style.color = correct ? 'var(--green)' : 'var(--red)';
        row.appendChild(date);
        row.appendChild(topic);
        row.appendChild(status);
        target.appendChild(row);
      });
    }

    function invokeAction(button) {
      const action = button.getAttribute('data-home-action');
      if (action === 'startMode') return run('startMode', button.getAttribute('data-home-value'));
      if (action === 'navigate') return run('navigate', button.getAttribute('data-home-value'));
      return run(action);
    }

    function bindQuickActions(container) {
      container.querySelectorAll('[data-home-action]').forEach(button => {
        if (boundActions.has(button)) return;
        boundActions.add(button);
        button.addEventListener('click', () => invokeAction(button));
      });
    }

    function ensureQuickActions() {
      if (!doc) return;
      const container = doc.querySelector('.quick-actions');
      if (!container) return;
      QUICK_ACTIONS.forEach(action => {
        if (byId(action.id)) return;
        const button = make('button', 'btn btn-outline', action.label);
        button.id = action.id;
        button.style.cssText = action.style;
        button.setAttribute('aria-label', action.aria);
        button.setAttribute('data-home-action', action.action);
        container.appendChild(button);
      });
      bindQuickActions(container);
    }

    function renderHome() {
      run('renderCoach');
      run('renderReadiness');
      renderMasteryCards();
      renderStreak();
      renderHistory();
      ensureQuickActions();
    }

    function toggleMasteryGrid() {
      const grid = byId('mastery-cards');
      const button = byId('toggle-mastery-btn');
      if (!grid || !button) return;
      const show = grid.style.display === 'none';
      grid.style.display = show ? '' : 'none';
      button.textContent = show ? '📋 Скрыть все темы ▲' : '📋 Все темы ▼';
    }

    return { renderHome, renderMasteryCards, renderStreak, renderHistory, ensureQuickActions, toggleMasteryGrid };
  }

  return { ICONS, COLORS, QUICK_ACTIONS, calculateMastery, recentHistory, create };
});
