const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

// Настройки AI задаются из UI, но живут ТОЛЬКО на сервере: ключ уходит одним
// направлением — внутрь. Хранить его в localStorage было бы регрессией —
// он стал бы виден в DevTools, уехал бы в снимок синхронизации и утёк бы при
// любом XSS. Наружу возвращается лишь признак `hasKey`.

const PROVIDERS = ['', 'mock', 'openai-compatible'];
const MAX_FIELD = 400;

const LIMITS = {
  temperature: { min: 0, max: 2, fallback: 0.2 },
  maxTokens: { min: 200, max: 8000, fallback: 700 },
  timeoutMs: { min: 1000, max: 60000, fallback: 15000 }
};

function settingsError(message, code, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status || 400;
  return error;
}

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function text(value) {
  return typeof value === 'string' ? value.trim().slice(0, MAX_FIELD) : '';
}

function clamp(value, limit) {
  // null, undefined и '' — это «поле не заполнено», а не «ноль». Number()
  // превращает их в 0, который проходит проверку на конечность и зажимается
  // до минимума: пустое поле молча давало бы maxTokens=200 вместо 700 и
  // обрезанные ответы модели. Явный 0 при этом остаётся валидным:
  // temperature: 0 — это детерминированный вывод, его нельзя подменять.
  if (value === null || value === undefined || value === '') return limit.fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return limit.fallback;
  return Math.min(limit.max, Math.max(limit.min, number));
}

/**
 * Проверяет базовый URL провайдера. HTTPS обязателен: по http ключ ушёл бы к
 * провайдеру открытым текстом. Исключение — localhost, где трафик не покидает
 * машину (типовой случай локальной llama.cpp / Ollama).
 */
function validateBaseUrl(value) {
  const raw = text(value);
  if (!raw) return '';
  let url;
  try { url = new URL(raw); }
  catch (_) { throw settingsError('Адрес провайдера не похож на URL.', 'INVALID_AI_SETTINGS'); }
  const host = url.hostname.toLowerCase();
  const local = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw settingsError('Нужен https:// — иначе ключ уйдёт открытым текстом.', 'INVALID_AI_SETTINGS');
  }
  return raw.replace(/\/+$/, '');
}

function normaliseInput(raw, previous) {
  if (!isRecord(raw)) throw settingsError('Настройки должны быть JSON-объектом.', 'INVALID_AI_SETTINGS');
  const provider = text(raw.provider).toLowerCase();
  if (!PROVIDERS.includes(provider)) {
    throw settingsError('Неизвестный провайдер. Допустимо: mock или openai-compatible.', 'INVALID_AI_SETTINGS');
  }
  const baseUrl = validateBaseUrl(raw.baseUrl);
  const model = text(raw.model);

  // Пустой apiKey означает «не менять»: UI не получает ключ обратно и не может
  // его переслать, поэтому сохранение модели не должно стирать существующий ключ.
  // Явное удаление — отдельный флаг clearKey.
  const incomingKey = typeof raw.apiKey === 'string' ? raw.apiKey.trim() : '';
  const apiKey = raw.clearKey === true ? '' : (incomingKey || (previous && previous.apiKey) || '');

  if (provider === 'openai-compatible') {
    if (!baseUrl) throw settingsError('Для openai-compatible нужен адрес провайдера.', 'INVALID_AI_SETTINGS');
    if (!model) throw settingsError('Укажите модель.', 'INVALID_AI_SETTINGS');
    if (!apiKey) throw settingsError('Укажите API-ключ.', 'INVALID_AI_SETTINGS');
  }

  return {
    provider,
    baseUrl,
    model,
    apiKey,
    temperature: clamp(raw.temperature, LIMITS.temperature),
    maxTokens: Math.round(clamp(raw.maxTokens, LIMITS.maxTokens)),
    timeoutMs: Math.round(clamp(raw.timeoutMs, LIMITS.timeoutMs)),
    updatedAt: Date.now()
  };
}

function publicView(settings) {
  const source = isRecord(settings) ? settings : {};
  return {
    provider: source.provider || '',
    baseUrl: source.baseUrl || '',
    model: source.model || '',
    // Сам ключ не отдаём никогда — только факт его наличия.
    hasKey: !!source.apiKey,
    temperature: Number.isFinite(source.temperature) ? source.temperature : LIMITS.temperature.fallback,
    maxTokens: Number.isFinite(source.maxTokens) ? source.maxTokens : LIMITS.maxTokens.fallback,
    timeoutMs: Number.isFinite(source.timeoutMs) ? source.timeoutMs : LIMITS.timeoutMs.fallback,
    updatedAt: Number.isFinite(source.updatedAt) ? source.updatedAt : null
  };
}

function createAiSettingsStore(env = process.env, dependencies = {}) {
  const dataDir = env.IPMAX_AI_SETTINGS_DIR || env.IPMAX_SYNC_DIR || path.join(__dirname, '..', 'data');
  const file = path.join(dataDir, 'ai-settings.json');
  const now = dependencies.now || (() => Date.now());

  // Настройки из окружения остаются источником по умолчанию: они переживают
  // удаление файла и позволяют задать конфигурацию до первого входа в UI.
  function fromEnv() {
    const provider = String(env.IPMAX_AI_PROVIDER || '').trim().toLowerCase();
    const base = String(env.IPMAX_AI_BASE_URL || '').replace(/\/+$/, '');
    const endpoint = String(env.IPMAX_AI_ENDPOINT || '').trim();
    return {
      provider: PROVIDERS.includes(provider) ? provider : '',
      baseUrl: base,
      endpoint,
      model: String(env.IPMAX_AI_MODEL || '').trim(),
      apiKey: String(env.IPMAX_AI_API_KEY || ''),
      temperature: clamp(env.IPMAX_AI_TEMPERATURE, LIMITS.temperature),
      maxTokens: Math.round(clamp(env.IPMAX_AI_MAX_TOKENS, LIMITS.maxTokens)),
      timeoutMs: Math.round(clamp(env.IPMAX_AI_TIMEOUT_MS, LIMITS.timeoutMs)),
      updatedAt: null
    };
  }

  function readFileSync() {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (_) { return null; }
  }

  async function readStored() {
    try { return JSON.parse(await fsp.readFile(file, 'utf8')); }
    catch (_) { return null; }
  }

  /**
   * Итоговая конфигурация: сохранённое из UI перекрывает окружение целиком.
   * Частичное смешивание давало бы неочевидные гибриды — модель из файла с
   * ключом из окружения, — которые невозможно диагностировать по UI.
   */
  function merge(stored) {
    const envConfig = fromEnv();
    if (!isRecord(stored) || !stored.provider) return envConfig;
    return { ...stored, endpoint: '' };
  }

  function resolveSync() {
    return merge(readFileSync());
  }

  async function resolve() {
    return merge(await readStored());
  }

  async function read() {
    return publicView(merge(await readStored()));
  }

  function readSync() {
    return publicView(resolveSync());
  }

  async function write(raw) {
    const stored = await readStored();
    const next = normaliseInput(raw, isRecord(stored) ? stored : null);
    next.updatedAt = now();
    await fsp.mkdir(dataDir, { recursive: true });
    const temporary = path.join(dataDir, '.ai-settings.' + process.pid + '.' + Date.now() + '.tmp');
    let handle;
    try {
      // mode 0600: файл содержит API-ключ, читать его должен только владелец
      // процесса. По умолчанию был бы 0644 — доступно любому пользователю ОС.
      handle = await fsp.open(temporary, 'w', 0o600);
      await handle.writeFile(JSON.stringify(next, null, 2), 'utf8');
      await handle.sync();
    } finally {
      if (handle) await handle.close();
    }
    await fsp.rename(temporary, file);
    return publicView(next);
  }

  async function clear() {
    try { await fsp.unlink(file); } catch (_) { /* уже нет */ }
    return publicView(fromEnv());
  }

  return { read, readSync, write, clear, resolve, resolveSync, file };
}

module.exports = { createAiSettingsStore, publicView, normaliseInput, validateBaseUrl, PROVIDERS, LIMITS };
