(function(root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IPMaxSyncClient = api;
})(typeof self !== 'undefined' ? self : globalThis, function(root) {
  'use strict';

  const Merge = root.IPMaxSyncMerge || (typeof require === 'function' ? require('./sync-merge.js') : null);

  // Ключи, которые принадлежат устройству и не уезжают на сервер. Токен в
  // снимке разложил бы секрет по всем устройствам, а schema/backup — это
  // локальная служебная информация конкретной установки.
  const LOCAL_ONLY_KEYS = ['storage_schema', 'curriculum_version', 'progress_backup', 'sync_token', 'sync_meta', 'admin_token', 'theme'];

  const DEFAULT_TIMEOUT_MS = 20000;

  function isRecord(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function syncableKeys(storage) {
    const names = storage && storage.keys ? Object.keys(storage.keys) : [];
    return names.filter(key => !LOCAL_ONLY_KEYS.includes(key));
  }

  /**
   * Читает состояние устройства. Ключи, которых нет в хранилище, в снимок не
   * попадают: пустой объект и «ключ отсутствует» — разные вещи для слияния,
   * иначе пустышка с одного устройства затирала бы данные с другого.
   */
  function collectState(storage) {
    const state = {};
    if (!storage) return state;
    const missing = Symbol('missing');
    syncableKeys(storage).forEach(key => {
      const value = storage.get(key, missing);
      if (value !== missing && value !== undefined && value !== null) state[key] = value;
    });
    return state;
  }

  function createDeviceId(random) {
    const source = random || (() => Math.random());
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < 10; i++) id += alphabet[Math.floor(source() * alphabet.length)];
    return id;
  }

  function readMeta(storage) {
    const meta = storage ? storage.get('sync_meta', null) : null;
    return isRecord(meta) ? meta : {};
  }

  function deviceIdOf(storage, random) {
    const meta = readMeta(storage);
    if (typeof meta.deviceId === 'string' && meta.deviceId) return meta.deviceId;
    const deviceId = createDeviceId(random);
    if (storage) storage.set('sync_meta', { ...meta, deviceId });
    return deviceId;
  }

  function buildSnapshot(storage, options) {
    const config = options || {};
    const now = typeof config.now === 'function' ? config.now() : Date.now();
    return {
      snapshotVersion: Merge ? Merge.SNAPSHOT_VERSION : 1,
      updatedAt: now,
      deviceId: deviceIdOf(storage, config.random),
      state: collectState(storage)
    };
  }

  /**
   * Записывает состояние одним батчем. Постепенная запись по ключу оставила бы
   * приложение в полусмешанном состоянии, если бы место в localStorage
   * закончилось на середине; setMany откатывается целиком.
   */
  function applyState(storage, state) {
    if (!storage || !isRecord(state)) return { ok: false, error: new Error('Nothing to apply') };
    const entries = {};
    const allowed = syncableKeys(storage);
    Object.keys(state).forEach(key => {
      if (allowed.includes(key)) entries[key] = state[key];
    });
    if (!Object.keys(entries).length) return { ok: true, applied: 0 };
    // Незавершённые debounce-записи иначе перезапишут только что применённый
    // снимок своим устаревшим значением.
    if (typeof storage.flushAll === 'function') storage.flushAll();
    const result = storage.setMany(entries);
    return result.ok ? { ok: true, applied: Object.keys(entries).length } : result;
  }

  function describeError(status, code) {
    if (status === 401) return 'Неверный токен синхронизации.';
    if (status === 403) return 'Доступ к синхронизации запрещён.';
    if (status === 413) return 'Прогресс слишком большой для отправки.';
    if (status === 429) return 'Слишком много запросов, попробуйте позже.';
    if (code === 'SYNC_NOT_CONFIGURED' || status === 503) return 'Синхронизация не настроена на сервере.';
    if (code === 'INVALID_SNAPSHOT') return 'Сервер отклонил данные прогресса.';
    return 'Сервер синхронизации недоступен.';
  }

  function create(services) {
    const source = services || {};
    const storage = source.storage;
    const fetchImpl = source.fetchImpl || (typeof fetch === 'function' ? fetch.bind(root) : null);
    const baseUrl = source.baseUrl || './api/sync';
    const timeoutMs = Number.isFinite(source.timeoutMs) ? source.timeoutMs : DEFAULT_TIMEOUT_MS;
    const now = typeof source.now === 'function' ? source.now : () => Date.now();

    function token() {
      const value = storage ? storage.get('sync_token', '') : '';
      return typeof value === 'string' ? value.trim() : '';
    }

    function setToken(value) {
      if (!storage) return false;
      const trimmed = typeof value === 'string' ? value.trim() : '';
      return trimmed ? storage.set('sync_token', trimmed) : storage.remove('sync_token');
    }

    function configured() {
      return !!token();
    }

    async function send(method, body) {
      if (!fetchImpl) throw new Error('Синхронизация недоступна в этом браузере.');
      const secret = token();
      if (!secret) throw new Error('Сначала укажите токен синхронизации.');
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
          const error = new Error(describeError(response.status, data && data.code));
          error.status = response.status;
          error.code = data && data.code;
          throw error;
        }
        return data || {};
      } catch (error) {
        if (error && error.name === 'AbortError') throw new Error('Сервер синхронизации не ответил вовремя.');
        throw error;
      } finally {
        clearTimeout(timer);
      }
    }

    async function status() {
      if (!fetchImpl) return { enabled: false, reachable: false };
      try {
        const response = await fetchImpl(baseUrl + '/status', { method: 'GET' });
        if (!response.ok) return { enabled: false, reachable: true };
        const data = await response.json();
        return { ...data, reachable: true, configured: configured() };
      } catch (_) {
        return { enabled: false, reachable: false, configured: configured() };
      }
    }

    /**
     * Двусторонний синк: отправляем своё состояние, сервер сливает его с
     * общим и возвращает результат, который применяем локально. Одного
     * направления недостаточно — pull затирал бы несохранённый локальный
     * прогресс, а push терял бы правки с других устройств.
     */
    async function sync() {
      const localSnapshot = buildSnapshot(storage, { now });
      const response = await send('POST', localSnapshot);
      const remote = response.snapshot;
      if (!isRecord(remote) || !isRecord(remote.state)) throw new Error('Сервер вернул некорректный снимок.');
      const applied = applyState(storage, remote.state);
      if (!applied.ok) {
        throw new Error(applied.rollbackFailed && applied.rollbackFailed.length
          ? 'Не удалось применить синхронизацию и восстановить прежний прогресс. Экспортируйте данные.'
          : 'Не удалось сохранить полученный прогресс. Проверьте место в браузере.');
      }
      const meta = readMeta(storage);
      if (storage) {
        storage.set('sync_meta', {
          ...meta,
          deviceId: localSnapshot.deviceId,
          revision: Number.isFinite(remote.revision) ? remote.revision : meta.revision || 0,
          lastSyncAt: now()
        });
      }
      return {
        applied: applied.applied || 0,
        revision: Number.isFinite(remote.revision) ? remote.revision : null,
        conflicts: Array.isArray(response.conflicts) ? response.conflicts : []
      };
    }

    async function pull() {
      const response = await send('GET');
      const remote = response.snapshot;
      if (!isRecord(remote) || !isRecord(remote.state)) throw new Error('Сервер вернул некорректный снимок.');
      return remote;
    }

    function lastSyncAt() {
      const meta = readMeta(storage);
      return Number.isFinite(meta.lastSyncAt) ? meta.lastSyncAt : null;
    }

    return { status, sync, pull, token, setToken, configured, lastSyncAt, buildSnapshot: () => buildSnapshot(storage, { now }) };
  }

  return { create, collectState, applyState, buildSnapshot, createDeviceId, syncableKeys, describeError, LOCAL_ONLY_KEYS };
});
