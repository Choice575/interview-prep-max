(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IPMaxPolygonUI = api;
})(typeof self !== 'undefined' ? self : globalThis, function() {
  'use strict';

  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function tasksOf(value) {
    return Array.isArray(value) ? value.filter(task => task && typeof task.id === 'string') : [];
  }

  function progressEntry(progress, taskId) {
    const source = progress && typeof progress === 'object' && !Array.isArray(progress) ? progress : {};
    return source[taskId] && typeof source[taskId] === 'object' ? source[taskId] : null;
  }

  function renderCatalog(tasks, progress) {
    const items = tasksOf(tasks);
    if (!items.length) return '<div class="empty-state"><p>Живые лаборатории временно недоступны.</p></div>';
    return '<div class="polygon-catalog">' + items.map(task => {
      const saved = progressEntry(progress, task.id);
      const done = saved && saved.status === 'done';
      return '<article class="polygon-card' + (done ? ' polygon-card-done' : '') + '" data-polygon-task="' + escapeHtml(task.id) + '">' +
        '<div class="polygon-card-head"><div><span class="practice-kicker">' + escapeHtml(task.technology) +
        ' · ' + escapeHtml(task.difficulty) + '</span><h2>' + escapeHtml(task.title) + '</h2></div>' +
        '<span class="task-badge ' + (done ? 'task-done' : 'task-pending') + '">' + (done ? '✓ Выполнено' : 'Живая лаборатория') + '</span></div>' +
        '<p>' + escapeHtml(task.description) + '</p>' +
        '<div class="polygon-limits"><span>⏱ ' + escapeHtml(task.durationMinutes) + ' мин</span><span>🧠 256 MiB</span><span>⚙ 0.5 CPU</span><span>+' + escapeHtml(task.xp) + ' XP</span></div>' +
        '<ol class="polygon-criteria-preview">' + (Array.isArray(task.criteria) ? task.criteria : []).map(item =>
          '<li>' + escapeHtml(item.title) + '</li>').join('') + '</ol>' +
        '<button type="button" class="btn btn-primary" data-polygon-action="start" data-task-id="' + escapeHtml(task.id) + '">' +
        (done ? 'Запустить заново' : 'Начать лабораторию') + '</button></article>';
    }).join('') + '</div>';
  }

  function renderChecks(checks) {
    const items = Array.isArray(checks) ? checks : [];
    return '<div class="polygon-checks">' + items.map(check =>
      '<div class="polygon-check ' + (check.passed ? 'polygon-check-pass' : 'polygon-check-pending') + '">' +
      '<span aria-hidden="true">' + (check.passed ? '✓' : '○') + '</span><span>' + escapeHtml(check.title || check.id) + '</span></div>'
    ).join('') + '</div>';
  }

  function renderSession(task, session, checks) {
    const expires = Number(session && session.expiresAt);
    return '<section class="polygon-session" data-session-id="' + escapeHtml(session && session.id) + '">' +
      '<header class="polygon-session-head"><div><span class="practice-kicker">Сессия запущена</span><h2>' + escapeHtml(task.title) + '</h2></div>' +
      '<div class="polygon-expiry" data-polygon-expires="' + escapeHtml(expires) + '">До 20 минут</div></header>' +
      '<div class="polygon-warning">Окружение временное. Команды выполняются только внутри изолированного контейнера; после остановки его состояние удаляется.</div>' +
      renderChecks(checks && checks.length ? checks : task.criteria.map(item => ({ ...item, passed: false }))) +
      '<div class="polygon-terminal" role="region" aria-label="Терминал лаборатории">' +
      '<pre id="polygon-terminal-output" tabindex="0" aria-live="polite">Подключение к терминалу…\n</pre>' +
      '<form id="polygon-terminal-form"><label class="sr-only" for="polygon-terminal-input">Команда</label>' +
      '<div class="polygon-terminal-line"><span aria-hidden="true">root@lab:#</span><input id="polygon-terminal-input" autocomplete="off" spellcheck="false" maxlength="2000">' +
      '<button type="submit" class="btn btn-primary btn-sm" data-polygon-action="send">Выполнить</button></div></form></div>' +
      '<div class="polygon-session-actions"><button type="button" class="btn btn-primary" data-polygon-action="check">Проверить решение</button>' +
      '<button type="button" class="btn btn-outline" data-polygon-action="stop">Остановить и удалить</button></div>' +
      '<div id="polygon-session-status" class="polygon-status" aria-live="polite"></div></section>';
  }

  function createClient(options = {}) {
    const getToken = typeof options.token === 'function' ? options.token : () => '';
    const fetchImpl = options.fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);

    function auth() {
      const token = String(getToken() || '').trim();
      if (!token) {
        const error = new Error('Для запуска полигона укажите токен синхронизации.');
        error.code = 'POLYGON_AUTH_REQUIRED';
        error.status = 401;
        throw error;
      }
      return token;
    }

    async function request(path, init) {
      if (!fetchImpl) throw new Error('Polygon API недоступен.');
      const token = auth();
      const response = await fetchImpl(path, {
        ...(init || {}),
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, ...((init && init.headers) || {}) }
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(typeof body.error === 'string' ? body.error.slice(0, 300) : 'Polygon API недоступен.');
        error.code = body.code || 'POLYGON_REQUEST_FAILED';
        error.status = response.status;
        throw error;
      }
      return body;
    }

    return {
      listTasks: async () => {
        if (!fetchImpl) return [];
        const response = await fetchImpl('./api/polygon/tasks', { method: 'GET' });
        if (!response.ok) return [];
        const body = await response.json();
        return tasksOf(body.tasks);
      },
      createSession: async taskId => (await request('./api/polygon/sessions', {
        method: 'POST', body: JSON.stringify({ taskId: String(taskId || '').slice(0, 80) })
      })).session,
      getSession: async id => (await request('./api/polygon/sessions/' + encodeURIComponent(id), { method: 'GET' })).session,
      checkSession: async id => request('./api/polygon/sessions/' + encodeURIComponent(id) + '/check', { method: 'POST', body: '{}' }),
      deleteSession: async id => request('./api/polygon/sessions/' + encodeURIComponent(id), { method: 'DELETE' })
    };
  }

  function terminalTarget(session, locationLike) {
    const source = session && typeof session === 'object' ? session : {};
    const loc = locationLike || (typeof location !== 'undefined' ? location : { protocol: 'https:', host: '' });
    const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    const path = String(source.terminalPath || '');
    if (!/^\/api\/polygon\/sessions\/[A-Za-z0-9_.%~-]+\/terminal$/.test(path)) throw new Error('Invalid terminal path');
    const token = String(source.terminalProtocol || '');
    if (!token || token.length > 200) throw new Error('Invalid terminal protocol');
    return { url: protocol + '//' + loc.host + path, protocols: ['ipmax-polygon', token] };
  }

  return { escapeHtml, tasksOf, renderCatalog, renderChecks, renderSession, createClient, terminalTarget };
});
