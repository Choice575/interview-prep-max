(function(root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IPMaxAiSettingsClient = api;
})(typeof self !== 'undefined' ? self : globalThis, function(root) {
  'use strict';

  const DEFAULT_TIMEOUT_MS = 15000;

  function describeError(status, code, message) {
    if (status === 401) return 'Неверный токен администратора.';
    if (status === 429) return 'Слишком много запросов, попробуйте позже.';
    if (code === 'ADMIN_NOT_CONFIGURED' || (status === 503 && !message)) {
      return 'Правка настроек с устройства отключена на сервере.';
    }
    // 400 — это ответ валидатора настроек: его текст уже человекочитаемый и
    // объясняет, какое поле неверно, поэтому подменять его нельзя.
    if (status === 400 && message) return message;
    if (message) return message;
    return 'Сервер настроек недоступен.';
  }

  function create(services) {
    const source = services || {};
    const storage = source.storage;
    const fetchImpl = source.fetchImpl || (typeof fetch === 'function' ? fetch.bind(root) : null);
    const baseUrl = source.baseUrl || './api/ai/settings';
    const adminStatusUrl = source.adminStatusUrl || './api/admin/status';
    const timeoutMs = Number.isFinite(source.timeoutMs) ? source.timeoutMs : DEFAULT_TIMEOUT_MS;

    function token() {
      const value = storage ? storage.get('admin_token', '') : '';
      return typeof value === 'string' ? value.trim() : '';
    }

    function setToken(value) {
      if (!storage) return false;
      const trimmed = typeof value === 'string' ? value.trim() : '';
      return trimmed ? storage.set('admin_token', trimmed) : storage.remove('admin_token');
    }

    function configured() {
      return !!token();
    }

    async function send(method, body) {
      if (!fetchImpl) throw new Error('Настройки недоступны в этом браузере.');
      const secret = token();
      if (!secret) throw new Error('Сначала укажите токен администратора.');
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = setTimeout(() => { if (controller) controller.abort(); }, timeoutMs);
      try {
        const response = await fetchImpl(baseUrl, {
          method,
          headers: {
            Authorization: 'Bearer ' + secret,
            ...(body ? { 'Content-Type': 'application/json' } : {})
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller ? controller.signal : undefined
        });
        let data = null;
        try { data = await response.json(); } catch (_) { /* тело может быть пустым */ }
        if (!response.ok) {
          const error = new Error(describeError(response.status, data && data.code, data && data.error));
          error.status = response.status;
          error.code = data && data.code;
          throw error;
        }
        return data || {};
      } catch (error) {
        if (error && error.name === 'AbortError') throw new Error('Сервер настроек не ответил вовремя.');
        throw error;
      } finally {
        clearTimeout(timer);
      }
    }

    /**
     * Доступен ли вообще режим правки настроек. Отдельный публичный эндпоинт:
     * UI должен различать «на сервере не задан admin-токен» и «токен на
     * устройстве неверный» — иначе пользователь будет искать ошибку в токене
     * там, где функция просто выключена.
     */
    async function adminStatus() {
      if (!fetchImpl) return { enabled: false, reachable: false };
      try {
        const response = await fetchImpl(adminStatusUrl, { method: 'GET' });
        if (!response.ok) return { enabled: false, reachable: true };
        const data = await response.json();
        return { enabled: !!(data && data.enabled), reachable: true };
      } catch (_) {
        return { enabled: false, reachable: false };
      }
    }

    async function read() {
      const data = await send('GET');
      return data.settings || null;
    }

    function numberOrUndefined(value) {
      // Пустое поле формы не должно превращаться в 0: сервер трактует
      // отсутствие значения как «взять значение по умолчанию».
      if (value === '' || value === null || value === undefined) return undefined;
      const number = Number(value);
      return Number.isFinite(number) ? number : undefined;
    }

    async function write(input) {
      const payload = {
        provider: String((input && input.provider) || '').trim(),
        baseUrl: String((input && input.baseUrl) || '').trim(),
        model: String((input && input.model) || '').trim(),
        temperature: numberOrUndefined(input && input.temperature),
        maxTokens: numberOrUndefined(input && input.maxTokens),
        timeoutMs: numberOrUndefined(input && input.timeoutMs)
      };
      // Пустой ключ не отправляем вовсе: сервер сохранит уже записанный.
      const key = String((input && input.apiKey) || '').trim();
      if (key) payload.apiKey = key;
      if (input && input.clearKey === true) payload.clearKey = true;
      const data = await send('POST', payload);
      return data.settings || null;
    }

    async function reset() {
      const data = await send('DELETE');
      return data.settings || null;
    }

    return { adminStatus, read, write, reset, token, setToken, configured };
  }

  return { create, describeError };
});
