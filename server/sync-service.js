const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const Merge = require('../sync-merge.js');
const ProgressIO = require('../progress-io.js');
const Storage = require('../storage.js');
// Разбор и сравнение токена — в общем модуле: две копии этой логики
// неизбежно разъехались бы.
const { safeEqual, extractBearer } = require('./auth.js');

// Служебные ключи хранилища не синхронизируются: схема и версия учебной
// программы принадлежат конкретной установке, а progress_backup — это копия
// всего состояния, которая удвоила бы размер снимка.
const LOCAL_ONLY_KEYS = new Set([
  'storage_schema', 'curriculum_version', 'progress_backup',
  // Токен синка и метаданные ревизии принадлежат устройству. Приняв их из
  // сети, сервер разложил бы секрет по всем остальным устройствам.
  'sync_token', 'sync_meta', 'admin_token'
]);
const ALLOWED_KEYS = new Set(Object.keys(Storage.DEFAULT_KEYS).filter(key => !LOCAL_ONLY_KEYS.has(key)));

const DEFAULT_MAX_BYTES = 1024 * 1024;

function serviceError(message, code, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function isRecord(value) {
  return ProgressIO.isRecord(value);
}

function validateSnapshot(raw, maxBytes) {
  if (!isRecord(raw)) throw serviceError('Snapshot must be a JSON object', 'INVALID_SNAPSHOT', 400);
  const state = raw.state;
  if (!isRecord(state)) throw serviceError('Snapshot state must be an object', 'INVALID_SNAPSHOT', 400);

  const serialised = JSON.stringify(raw);
  if (Buffer.byteLength(serialised, 'utf8') > maxBytes) {
    throw serviceError('Snapshot is too large', 'SNAPSHOT_TOO_LARGE', 413);
  }

  const unknown = Object.keys(state).filter(key => !ALLOWED_KEYS.has(key));
  if (unknown.length) {
    throw serviceError('Unknown state keys: ' + unknown.slice(0, 5).join(', '), 'INVALID_SNAPSHOT', 400);
  }

  // Границы глубины/размера и защита от __proto__ уже реализованы в
  // progress-io и покрыты тестами — переписывать их здесь значило бы
  // держать два расходящихся валидатора.
  try {
    ProgressIO.validateBoundedImportValue(state, 'state', 0, { nodes: 0 });
  } catch (error) {
    throw serviceError(error.message, 'INVALID_SNAPSHOT', 400);
  }

  const updatedAt = Number(raw.updatedAt);
  if (!Number.isFinite(updatedAt) || updatedAt < 0) {
    throw serviceError('Snapshot updatedAt must be a non-negative number', 'INVALID_SNAPSHOT', 400);
  }
  return Merge.normaliseSnapshot({ ...raw, updatedAt });
}

function emptySnapshot() {
  return { snapshotVersion: Merge.SNAPSHOT_VERSION, updatedAt: 0, deviceId: '', state: {} };
}

function createSyncService(env = process.env, dependencies = {}) {
  const token = (env.IPMAX_SYNC_TOKEN || '').trim();
  const enabled = !!token;
  const dataDir = env.IPMAX_SYNC_DIR || path.join(__dirname, '..', 'data');
  const file = path.join(dataDir, 'snapshot.json');
  const backup = path.join(dataDir, 'snapshot.backup.json');
  const maxBytes = Math.max(64 * 1024, Math.min(8 * 1024 * 1024, Number(env.IPMAX_SYNC_MAX_BYTES) || DEFAULT_MAX_BYTES));
  const now = dependencies.now || (() => Date.now());

  if (enabled && token.length < 24) {
    // Короткий токен здесь — это единственный барьер перед чужим прогрессом,
    // поэтому падаем громко при старте, а не молча пускаем слабую защиту.
    throw new Error('IPMAX_SYNC_TOKEN must be at least 24 characters');
  }

  function status() {
    let hasSnapshot = false;
    let updatedAt = null;
    let revision = 0;
    let storedAt = null;
    try {
      const stat = fs.statSync(file);
      hasSnapshot = stat.isFile();
      const parsed = hasSnapshot ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
      if (parsed) {
        updatedAt = Number.isFinite(parsed.updatedAt) ? parsed.updatedAt : null;
        revision = Number.isFinite(parsed.revision) ? parsed.revision : 0;
        storedAt = Number.isFinite(parsed.storedAt) ? parsed.storedAt : null;
      }
    } catch (_) { hasSnapshot = false; }
    return { enabled, hasSnapshot, updatedAt, revision, storedAt, maxBytes };
  }

  function authorise(header) {
    if (!enabled) throw serviceError('Sync backend is not configured', 'SYNC_NOT_CONFIGURED', 503);
    const provided = extractBearer(header);
    if (!provided || !safeEqual(provided, token)) {
      throw serviceError('Unauthorized', 'SYNC_UNAUTHORIZED', 401);
    }
    return true;
  }

  // revision — серверный счётчик версий, он же признак «на сервере что-то
  // изменилось». Полагаться на updatedAt для этого нельзя: это логические
  // часы клиента, они идут вразнобой на разных устройствах.
  function withServerFields(parsed) {
    const snapshot = Merge.normaliseSnapshot(parsed);
    const source = isRecord(parsed) ? parsed : {};
    snapshot.revision = Number.isFinite(source.revision) && source.revision >= 0 ? Math.floor(source.revision) : 0;
    snapshot.storedAt = Number.isFinite(source.storedAt) && source.storedAt >= 0 ? source.storedAt : 0;
    return snapshot;
  }

  async function readSnapshot() {
    try {
      const raw = await fsp.readFile(file, 'utf8');
      return withServerFields(JSON.parse(raw));
    } catch (error) {
      if (error && error.code === 'ENOENT') return withServerFields(emptySnapshot());
      // Битый файл не должен обнулять историю: пробуем резервную копию.
      try {
        const raw = await fsp.readFile(backup, 'utf8');
        return withServerFields(JSON.parse(raw));
      } catch (_) {
        return withServerFields(emptySnapshot());
      }
    }
  }

  /**
   * Атомарная запись: временный файл в том же каталоге, fsync, затем rename.
   * Прямая запись в целевой файл оставляет обрезанный JSON, если процесс
   * умрёт посередине, — и весь прогресс превращается в мусор.
   */
  async function writeSnapshot(snapshot) {
    await fsp.mkdir(dataDir, { recursive: true });
    const temporary = path.join(dataDir, '.snapshot.' + process.pid + '.' + Date.now() + '.tmp');
    const body = JSON.stringify(snapshot);
    let handle;
    try {
      // mode 0600: снимок — это личный прогресс целиком (ответы, журнал,
      // заметки). Секретов в нём нет, но и читать его другим пользователям ОС
      // незачем. По умолчанию файл получал 0644.
      handle = await fsp.open(temporary, 'w', 0o600);
      await handle.writeFile(body, 'utf8');
      await handle.sync();
    } finally {
      if (handle) await handle.close();
    }
    // Предыдущий снимок сохраняем до подмены: если rename упадёт, останется
    // из чего восстановиться.
    try { await fsp.copyFile(file, backup); } catch (_) { /* первого снимка ещё нет */ }
    await fsp.rename(temporary, file);
    return snapshot;
  }

  // Два устройства, отправившие push одновременно, без очереди прочитали бы
  // один и тот же снимок и второй перезаписал бы результат первого.
  let queue = Promise.resolve();
  function serialise(task) {
    const run = queue.then(task, task);
    queue = run.then(() => undefined, () => undefined);
    return run;
  }

  async function pull() {
    const snapshot = await readSnapshot();
    return { snapshot, conflicts: [] };
  }

  async function push(rawSnapshot) {
    const incoming = validateSnapshot(rawSnapshot, maxBytes);
    return serialise(async () => {
      const current = await readSnapshot();
      const merged = Merge.mergeSnapshots(incoming, current);
      const snapshot = {
        snapshotVersion: Merge.SNAPSHOT_VERSION,
        // updatedAt остаётся логическими часами клиентов и НЕ подменяется
        // серверным временем: иначе снимок навсегда выглядел бы свежее любого
        // устройства и правки курсора/настроек никогда не побеждали бы.
        updatedAt: merged.updatedAt,
        deviceId: incoming.deviceId,
        revision: current.revision + 1,
        storedAt: now(),
        state: merged.state
      };
      await writeSnapshot(snapshot);
      return { snapshot, conflicts: merged.conflicts };
    });
  }

  return { status, authorise, pull, push, ALLOWED_KEYS, file, maxBytes };
}

module.exports = { createSyncService, validateSnapshot, safeEqual, ALLOWED_KEYS, LOCAL_ONLY_KEYS };
