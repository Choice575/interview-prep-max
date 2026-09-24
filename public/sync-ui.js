(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IPMaxSyncUI = api;
})(typeof self !== 'undefined' ? self : globalThis, function() {
  'use strict';

  let services = null;
  let bound = false;
  let syncing = false;

  // Ключи, по которым слияние невозможно по содержимому: побеждает устройство
  // со свежей записью. Пользователю важно знать, что именно перезаписалось.
  const CONFLICT_LABELS = {
    study_position: 'позиция в программе DevOps',
    mlops_position: 'позиция в программе MLOps',
    study_program: 'выбранная программа',
    chapter_position: 'позиция в справочнике',
    qbank_category: 'категория банка вопросов',
    onboarding: 'цель подготовки',
    onboarding_complete: 'состояние онбординга',
    diagnostic_result: 'результат диагностики',
    mistakes: 'список ошибок',
    theme: 'тема оформления'
  };

  function escapeHtml(value) {
    if (services && typeof services.escape === 'function') return services.escape(value);
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function now() {
    return services && typeof services.now === 'function' ? services.now() : Date.now();
  }

  function formatMoment(stamp) {
    if (!Number.isFinite(stamp) || stamp <= 0) return 'ещё не выполнялась';
    const delta = Math.max(0, now() - stamp);
    const minutes = Math.floor(delta / 60000);
    if (minutes < 1) return 'только что';
    if (minutes < 60) return minutes + ' мин назад';
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + ' ч назад';
    return Math.floor(hours / 24) + ' дн назад';
  }

  function conflictLabel(key) {
    return CONFLICT_LABELS[key] || key;
  }

  function describeConflicts(conflicts) {
    if (!Array.isArray(conflicts) || !conflicts.length) return '';
    const list = conflicts.map(key => '<li>' + escapeHtml(conflictLabel(key)) + '</li>').join('');
    return '<div class="sync-conflicts"><strong>Перезаписано значением с этого устройства:</strong><ul>' + list + '</ul>' +
      '<small>Эти настройки нельзя объединить автоматически — побеждает запись, сделанная позже. Прогресс и ответы при этом не терялись.</small></div>';
  }

  function statusLine(status) {
    if (!status) return '';
    if (!status.reachable) return '<div class="sync-state sync-state-off">Сервер синхронизации недоступен. Прогресс остаётся в браузере.</div>';
    if (!status.enabled) return '<div class="sync-state sync-state-off">На сервере синхронизация не настроена.</div>';
    const snapshot = status.hasSnapshot
      ? 'На сервере есть снимок (ревизия ' + escapeHtml(String(status.revision || 0)) + ').'
      : 'На сервере пока нет данных — первый синк отправит ваш прогресс.';
    return '<div class="sync-state sync-state-on">Синхронизация доступна. ' + snapshot + '</div>';
  }

  function contentElement() {
    return typeof document !== 'undefined' ? document.getElementById('sync-content') : null;
  }

  function tokenInput() {
    return typeof document !== 'undefined' ? document.getElementById('sync-token-input') : null;
  }

  /**
   * Отрисовывает панель. Значение токена НЕ подставляется в innerHTML: секрет
   * не должен попадать в разметку, поэтому поле заполняется через свойство
   * value уже после вставки шаблона.
   */
  function render(state) {
    const target = contentElement();
    if (!target || !services) return;
    const client = services.client;
    const configured = !!(client && client.configured());
    const view = state || {};
    const lastSync = client && typeof client.lastSyncAt === 'function' ? client.lastSyncAt() : null;

    target.innerHTML =
      statusLine(view.status) +
      '<label class="sync-field" for="sync-token-input">Токен синхронизации' +
      '<input type="password" id="sync-token-input" class="form-input" autocomplete="off" spellcheck="false"' +
      ' placeholder="Вставьте токен с сервера" aria-describedby="sync-token-hint">' +
      '</label>' +
      '<p id="sync-token-hint" class="sync-hint">Тот же токен, что задан на сервере в <code>IPMAX_SYNC_TOKEN</code>. Хранится только в этом браузере и не уходит в составе прогресса.</p>' +
      '<div class="sync-actions">' +
      '<button type="button" class="btn btn-primary btn-sm" data-sync-action="run"' + (configured && !syncing ? '' : ' disabled') + '>' +
      (syncing ? 'Синхронизация…' : 'Синхронизировать') + '</button>' +
      '<button type="button" class="btn btn-outline btn-sm" data-sync-action="save-token">Сохранить токен</button>' +
      (configured ? '<button type="button" class="btn btn-quiet btn-sm" data-sync-action="forget-token">Забыть токен</button>' : '') +
      '</div>' +
      '<div class="sync-last">Последняя синхронизация: ' + escapeHtml(formatMoment(lastSync)) + '</div>' +
      (view.message ? '<div class="sync-message ' + (view.error ? 'sync-message-error' : 'sync-message-ok') + '">' + escapeHtml(view.message) + '</div>' : '') +
      describeConflicts(view.conflicts);

    const input = tokenInput();
    if (input && configured && client) input.value = client.token();
  }

  async function refreshStatus(state) {
    const client = services && services.client;
    if (!client) return;
    const status = await client.status();
    render({ ...(state || {}), status });
  }

  function open() {
    if (!services) return;
    render({});
    services.openModal('sync-modal', '#sync-token-input');
    // Статус запрашивается после открытия: сеть может отвечать долго, а панель
    // должна появиться сразу.
    refreshStatus({});
  }

  function saveToken() {
    const client = services && services.client;
    const input = tokenInput();
    if (!client || !input) return;
    const value = String(input.value || '').trim();
    if (!value) {
      render({ message: 'Введите токен синхронизации.', error: true });
      return;
    }
    if (value.length < 24) {
      // Сервер откажет коротким токенам, поэтому сообщаем до запроса.
      render({ message: 'Токен слишком короткий: нужно минимум 24 символа.', error: true });
      return;
    }
    client.setToken(value);
    refreshStatus({ message: 'Токен сохранён.' });
  }

  function forgetToken() {
    const client = services && services.client;
    if (!client) return;
    if (services.confirm && !services.confirm('Удалить токен синхронизации с этого устройства? Прогресс останется на месте.')) return;
    client.setToken('');
    refreshStatus({ message: 'Токен удалён с этого устройства.' });
  }

  async function run() {
    const client = services && services.client;
    if (!client || syncing) return;
    if (!client.configured()) {
      render({ message: 'Сначала сохраните токен.', error: true });
      return;
    }
    syncing = true;
    render({ message: 'Отправляю прогресс…' });
    try {
      const result = await client.sync();
      const applied = result.applied || 0;
      const message = applied
        ? 'Готово. Обновлено разделов: ' + applied + '.'
        : 'Готово. Расхождений не найдено.';
      syncing = false;
      await refreshStatus({ message, conflicts: result.conflicts });
      // Состояние изменилось под приложением, поэтому перерисовываем страницу:
      // иначе на экране остаются прежние счётчики и прогресс.
      if (typeof services.refresh === 'function') services.refresh();
    } catch (error) {
      syncing = false;
      const message = error && error.message ? error.message : 'Не удалось синхронизировать.';
      await refreshStatus({ message, error: true });
    }
  }

  function handleAction(event) {
    if (!services || !event.target || typeof event.target.closest !== 'function') return;
    const trigger = event.target.closest('[data-sync-action]');
    if (!trigger || trigger.disabled) return;
    const action = trigger.dataset.syncAction;
    if (action === 'open') open();
    else if (action === 'save-token') saveToken();
    else if (action === 'forget-token') forgetToken();
    else if (action === 'run') run();
    else if (action === 'close') services.closeModal('sync-modal');
  }

  function configure(next) {
    services = next || null;
    if (!services || !services.client) return false;
    if (!bound && typeof document !== 'undefined') {
      document.addEventListener('click', handleAction);
      bound = true;
    }
    return true;
  }

  return { configure, open, render, formatMoment, conflictLabel, describeConflicts, CONFLICT_LABELS };
});
