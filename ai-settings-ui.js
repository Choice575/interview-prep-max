(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IPMaxAiSettingsUI = api;
})(typeof self !== 'undefined' ? self : globalThis, function() {
  'use strict';

  let services = null;
  let bound = false;
  let busy = false;

  const PROVIDER_OPTIONS = [
    { value: '', label: 'Выключено — локальный разбор' },
    { value: 'mock', label: 'Заглушка (без сети)' },
    { value: 'openai-compatible', label: 'OpenAI-compatible провайдер' }
  ];

  const FIELDS = {
    provider: 'ai-settings-provider',
    baseUrl: 'ai-settings-base-url',
    model: 'ai-settings-model',
    apiKey: 'ai-settings-api-key',
    temperature: 'ai-settings-temperature',
    maxTokens: 'ai-settings-max-tokens',
    timeoutMs: 'ai-settings-timeout'
  };

  function escapeHtml(value) {
    if (services && typeof services.escape === 'function') return services.escape(value);
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function element(id) {
    return typeof document !== 'undefined' ? document.getElementById(id) : null;
  }

  function content() {
    return element('ai-settings-content');
  }

  function fieldValue(name) {
    const node = element(FIELDS[name]);
    return node ? String(node.value || '').trim() : '';
  }

  function providerOptions(selected) {
    return PROVIDER_OPTIONS.map(option =>
      '<option value="' + escapeHtml(option.value) + '"' + (option.value === selected ? ' selected' : '') + '>' +
      escapeHtml(option.label) + '</option>'
    ).join('');
  }

  function statusLine(state) {
    if (!state.adminEnabled) {
      return '<div class="sync-state sync-state-off">Правка настроек с устройства отключена: на сервере не задан <code>IPMAX_ADMIN_TOKEN</code>.</div>';
    }
    if (!state.authorised) {
      return '<div class="sync-state sync-state-off">Введите токен администратора, чтобы увидеть и изменить настройки.</div>';
    }
    const settings = state.settings || {};
    if (!settings.provider) {
      return '<div class="sync-state sync-state-off">Внешний AI выключен — используется локальный детерминированный разбор.</div>';
    }
    const model = settings.provider === 'mock' ? 'заглушка' : (settings.model || 'модель не указана');
    return '<div class="sync-state sync-state-on">Активен: ' + escapeHtml(settings.provider) + ' · ' + escapeHtml(model) + '</div>';
  }

  /**
   * Форма настроек. Ключ никогда не подставляется в разметку: сервер его не
   * отдаёт, поэтому поле всегда пустое, а рядом показывается, задан ли ключ.
   * Пустое поле при сохранении означает «не менять».
   */
  function renderForm(state) {
    const settings = state.settings || {};
    const openai = (state.provider !== undefined ? state.provider : settings.provider) === 'openai-compatible';
    const rowStyle = openai ? '' : ' style="display:none"';
    return '<label class="sync-field" for="' + FIELDS.provider + '">Провайдер' +
      '<select id="' + FIELDS.provider + '" class="form-input" data-ai-settings-action="provider-change">' +
      providerOptions(state.provider !== undefined ? state.provider : (settings.provider || '')) +
      '</select></label>' +
      '<div id="ai-settings-provider-fields"' + rowStyle + '>' +
      '<label class="sync-field" for="' + FIELDS.baseUrl + '">Адрес API' +
      '<input type="url" id="' + FIELDS.baseUrl + '" class="form-input" placeholder="https://provider.example/v1" value="' + escapeHtml(settings.baseUrl || '') + '">' +
      '</label>' +
      '<p class="sync-hint">Базовый URL до <code>/chat/completions</code>. Только https, кроме localhost.</p>' +
      '<label class="sync-field" for="' + FIELDS.model + '">Модель' +
      '<input type="text" id="' + FIELDS.model + '" class="form-input" placeholder="cc/claude-opus-5" value="' + escapeHtml(settings.model || '') + '">' +
      '</label>' +
      '<label class="sync-field" for="' + FIELDS.apiKey + '">API-ключ' +
      '<input type="password" id="' + FIELDS.apiKey + '" class="form-input" autocomplete="off" spellcheck="false" placeholder="' +
      (settings.hasKey ? 'Ключ сохранён — оставьте пустым, чтобы не менять' : 'Вставьте ключ провайдера') + '">' +
      '</label>' +
      '<p class="sync-hint">Ключ хранится только на сервере и никогда не возвращается в браузер.' +
      (settings.hasKey ? ' <button type="button" class="btn btn-quiet btn-sm" data-ai-settings-action="clear-key">Удалить ключ</button>' : '') +
      '</p>' +
      '</div>' +
      '<div class="ai-settings-grid">' +
      '<label class="sync-field" for="' + FIELDS.temperature + '">Temperature' +
      '<input type="number" id="' + FIELDS.temperature + '" class="form-input" min="0" max="2" step="0.1" value="' + escapeHtml(settings.temperature) + '">' +
      '</label>' +
      '<label class="sync-field" for="' + FIELDS.maxTokens + '">Max tokens' +
      '<input type="number" id="' + FIELDS.maxTokens + '" class="form-input" min="200" max="8000" step="50" value="' + escapeHtml(settings.maxTokens) + '">' +
      '</label>' +
      '<label class="sync-field" for="' + FIELDS.timeoutMs + '">Таймаут, мс' +
      '<input type="number" id="' + FIELDS.timeoutMs + '" class="form-input" min="1000" max="60000" step="1000" value="' + escapeHtml(settings.timeoutMs) + '">' +
      '</label>' +
      '</div>' +
      '<p class="sync-hint">Для тяжёлых моделей 15 000 мс мало — ставьте 30 000–45 000.</p>';
  }

  function render(state) {
    const target = content();
    if (!target || !services) return;
    const view = state || {};
    const client = services.client;
    const authorised = view.authorised !== undefined ? view.authorised : !!(client && client.configured());
    const full = { ...view, authorised, adminEnabled: view.adminEnabled !== false };

    target.innerHTML =
      statusLine(full) +
      '<label class="sync-field" for="ai-settings-token">Токен администратора' +
      '<input type="password" id="ai-settings-token" class="form-input" autocomplete="off" spellcheck="false" placeholder="IPMAX_ADMIN_TOKEN с сервера">' +
      '</label>' +
      '<div class="sync-actions">' +
      '<button type="button" class="btn btn-outline btn-sm" data-ai-settings-action="load">Войти и загрузить</button>' +
      (authorised ? '<button type="button" class="btn btn-quiet btn-sm" data-ai-settings-action="forget-token">Забыть токен</button>' : '') +
      '</div>' +
      (authorised && full.settings ? '<hr class="ai-settings-sep">' + renderForm(full) +
        '<div class="sync-actions">' +
        '<button type="button" class="btn btn-primary btn-sm" data-ai-settings-action="save"' + (busy ? ' disabled' : '') + '>' +
        (busy ? 'Сохранение…' : 'Сохранить настройки') + '</button>' +
        '<button type="button" class="btn btn-outline btn-sm" data-ai-settings-action="reset">Сбросить к окружению</button>' +
        '</div>' : '') +
      (view.message ? '<div class="sync-message ' + (view.error ? 'sync-message-error' : 'sync-message-ok') + '">' + escapeHtml(view.message) + '</div>' : '');

    const tokenNode = element('ai-settings-token');
    if (tokenNode && client && client.configured()) tokenNode.value = client.token();
  }

  async function load(message) {
    const client = services && services.client;
    if (!client) return;
    const admin = await client.adminStatus();
    if (!admin.enabled) {
      render({ adminEnabled: false, authorised: false });
      return;
    }
    if (!client.configured()) {
      render({ adminEnabled: true, authorised: false, message });
      return;
    }
    try {
      const settings = await client.read();
      render({ adminEnabled: true, authorised: true, settings, message });
    } catch (error) {
      // 401 означает, что сохранённый токен больше не подходит: сбрасываем
      // состояние в «не авторизован», иначе форма показывала бы пустые поля
      // как настоящие настройки.
      const unauthorised = error && error.status === 401;
      if (unauthorised) client.setToken('');
      render({ adminEnabled: true, authorised: false, message: error && error.message, error: true });
    }
  }

  function open() {
    if (!services) return;
    render({ adminEnabled: true });
    services.openModal('ai-settings-modal', '#ai-settings-token');
    load();
  }

  function saveToken() {
    const client = services && services.client;
    const node = element('ai-settings-token');
    if (!client || !node) return;
    const value = String(node.value || '').trim();
    if (!value) {
      render({ adminEnabled: true, authorised: false, message: 'Введите токен администратора.', error: true });
      return;
    }
    client.setToken(value);
    load('Токен сохранён.');
  }

  function forgetToken() {
    const client = services && services.client;
    if (!client) return;
    if (services.confirm && !services.confirm('Удалить токен администратора с этого устройства?')) return;
    client.setToken('');
    render({ adminEnabled: true, authorised: false, message: 'Токен удалён с этого устройства.' });
  }

  function collect() {
    const provider = fieldValue('provider');
    return {
      provider,
      baseUrl: fieldValue('baseUrl'),
      model: fieldValue('model'),
      // Пустая строка — «не менять»: сервер сохранит уже записанный ключ.
      apiKey: fieldValue('apiKey'),
      temperature: fieldValue('temperature'),
      maxTokens: fieldValue('maxTokens'),
      timeoutMs: fieldValue('timeoutMs')
    };
  }

  async function save() {
    const client = services && services.client;
    if (!client || busy) return;
    busy = true;
    try {
      const settings = await client.write(collect());
      busy = false;
      render({ adminEnabled: true, authorised: true, settings, message: 'Настройки сохранены и применены.' });
      // Статус AI изменился — карточка тренера должна перечитать его.
      if (typeof services.refresh === 'function') services.refresh();
    } catch (error) {
      busy = false;
      const settings = error && error.settings;
      render({ adminEnabled: true, authorised: true, settings, message: error && error.message, error: true });
    }
  }

  async function reset() {
    const client = services && services.client;
    if (!client) return;
    if (services.confirm && !services.confirm('Сбросить настройки AI к значениям из окружения сервера?')) return;
    try {
      const settings = await client.reset();
      render({ adminEnabled: true, authorised: true, settings, message: 'Настройки сброшены.' });
      if (typeof services.refresh === 'function') services.refresh();
    } catch (error) {
      render({ adminEnabled: true, authorised: true, message: error && error.message, error: true });
    }
  }

  async function clearKey() {
    const client = services && services.client;
    if (!client) return;
    if (services.confirm && !services.confirm('Удалить сохранённый API-ключ с сервера?')) return;
    try {
      const settings = await client.write({ ...collect(), provider: '', clearKey: true });
      render({ adminEnabled: true, authorised: true, settings, message: 'Ключ удалён. Внешний AI выключен.' });
      if (typeof services.refresh === 'function') services.refresh();
    } catch (error) {
      render({ adminEnabled: true, authorised: true, message: error && error.message, error: true });
    }
  }

  function toggleProviderFields() {
    const node = element('ai-settings-provider-fields');
    if (node) node.style.display = fieldValue('provider') === 'openai-compatible' ? '' : 'none';
  }

  function handleAction(event) {
    if (!services || !event.target || typeof event.target.closest !== 'function') return;
    const trigger = event.target.closest('[data-ai-settings-action]');
    if (!trigger || trigger.disabled) return;
    const action = trigger.dataset.aiSettingsAction;
    if (action === 'open') open();
    else if (action === 'load') saveToken();
    else if (action === 'forget-token') forgetToken();
    else if (action === 'save') save();
    else if (action === 'reset') reset();
    else if (action === 'clear-key') clearKey();
    else if (action === 'close') services.closeModal('ai-settings-modal');
  }

  function handleChange(event) {
    if (!services || !event.target || typeof event.target.closest !== 'function') return;
    const trigger = event.target.closest('[data-ai-settings-action="provider-change"]');
    if (trigger) toggleProviderFields();
  }

  function configure(next) {
    services = next || null;
    if (!services || !services.client) return false;
    if (!bound && typeof document !== 'undefined') {
      document.addEventListener('click', handleAction);
      document.addEventListener('change', handleChange);
      bound = true;
    }
    return true;
  }

  return { configure, open, render, collect, toggleProviderFields, PROVIDER_OPTIONS, FIELDS };
});
