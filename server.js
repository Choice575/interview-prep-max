const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { createAiService } = require('./server/ai-service.js');
const { createSyncService } = require('./server/sync-service.js');
const { createAiSettingsStore } = require('./server/ai-settings.js');
const { requireBearer } = require('./server/auth.js');

const MAX_BODY_BYTES = 16 * 1024;
// Снимок прогресса на порядки больше AI-агрегатов: history допускает 1000
// записей, qprog — по записи на каждый вопрос. Общий лимит 16 КБ отклонял бы
// любой реальный синк, поэтому у него свой предел.
const MAX_SYNC_BODY_BYTES = 2 * 1024 * 1024;
const contentTypes = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png'
};
const publicFiles = new Set([
  'index.html', 'styles.css', 'version.js', 'date.js', 'storage.js', 'progress.js', 'coach.js', 'ai-coach.js', 'progress-io.js',
  // Модули синхронизации нужны браузеру, поэтому они публичные. Серверная
  // часть (server/sync-service.js) сюда НЕ попадает и остаётся закрытой.
  'sync-merge.js', 'sync-client.js', 'sync-ui.js', 'ai-settings-client.js', 'ai-settings-ui.js',
  'offline-ui.js', 'sources-ui.js', 'best-practices-ui.js', 'catalog-ui.js', 'chapter-ui.js', 'router.js',
  // Новый модуль, не добавленный сюда, отдаётся как 403: страница молча теряет
  // скрипт, а sw.js не устанавливается вовсе — SHELL_ASSETS кешируется
  // атомарным addAll, и один недоступный файл роняет всю установку.
  'gamification.js', 'gamification-ui.js', 'daily.js', 'daily-ui.js', 'trainers-ui.js',
  'question-bank-ui.js', 'external-tasks-ui.js', 'interview-practice-ui.js', 'analytics-ui.js', 'home-ui.js', 'exam-ui.js', 'study-ui.js', 'sw.js',
  'coach-ui.js', 'app.js', 'interview-prep-max.webmanifest', 'assets/icon-192.png', 'assets/icon-512.png',
  'tasks/base_questions.json', 'tasks/subnet.json', 'tasks/ts.json', 'tasks/cmd.json', 'tasks/code.json',
  'tasks/git.json', 'tasks/regex.json', 'tasks/ansible_pb.json', 'tasks/dockerfile.json', 'tasks/k8s.json',
  'tasks/ports.json', 'tasks/labs.json', 'tasks/tips.json', 'tasks/incidents.json', 'tasks/study_map.json',
  'tasks/study_tests.json', 'tasks/mlops_map.json', 'tasks/mlops_tests.json', 'tasks/senior_cases.json', 'tasks/best_practices.json', 'tasks/question_sources.json', 'tasks/interview_practice.json', 'tasks/external_tasks.json', 'tasks/courses.json', 'tasks/question_bank.json'
]);

function sendJson(response, status, body) {
  const data = Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': data.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  });
  response.end(data);
}

function readJson(request, limitBytes) {
  const limit = Number.isFinite(limitBytes) && limitBytes > 0 ? limitBytes : MAX_BODY_BYTES;
  return new Promise((resolve, reject) => {
    if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
      const error = new Error('Content-Type must be application/json');
      error.status = 415;
      reject(error);
      return;
    }
    const declared = Number(request.headers['content-length']);
    if (Number.isFinite(declared) && declared > limit) {
      const error = new Error('Request body is too large');
      error.status = 413;
      reject(error);
      request.resume();
      return;
    }
    const chunks = [];
    let size = 0;
    request.on('data', chunk => {
      size += chunk.length;
      if (size <= limit) chunks.push(chunk);
    });
    request.on('end', () => {
      if (size > limit) {
        const error = new Error('Request body is too large');
        error.status = 413;
        reject(error);
        return;
      }
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (_) {
        const error = new Error('Request body contains invalid JSON');
        error.status = 400;
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function createRateLimiter(limit = 20, windowMs = 60000) {
  const clients = new Map();
  return address => {
    const now = Date.now();
    // Без вычистки истёкших окон Map растёт неограниченно: каждый новый IP
    // добавляет запись, которая никогда не удаляется.
    if (clients.size > 1000) {
      for (const [key, value] of clients) if (value.resetAt <= now) clients.delete(key);
    }
    const current = clients.get(address);
    if (!current || current.resetAt <= now) {
      clients.set(address, { count: 1, resetAt: now + windowMs });
      return true;
    }
    current.count++;
    return current.count <= limit;
  };
}

/**
 * Определяет адрес клиента. За реверс-прокси socket.remoteAddress — это адрес
 * прокси, и все устройства делят один счётчик лимита: одно исчерпывает квоту
 * для остальных. Но доверять X-Forwarded-For можно ТОЛЬКО когда мы знаем, что
 * перед нами прокси, иначе клиент подделает заголовок и обойдёт лимит.
 */
function clientAddress(request, trustProxy) {
  const socketAddress = request.socket.remoteAddress || 'unknown';
  if (!trustProxy) return socketAddress;
  const forwarded = String(request.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || socketAddress;
}

function safeStaticPath(root, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch (_) { return null; }
  if (decoded === '/') decoded = '/index.html';
  const publicName = decoded.replace(/^\/+/, '').replace(/\\/g, '/');
  if (!publicFiles.has(publicName)) return null;
  const target = path.resolve(root, '.' + decoded);
  const relative = path.relative(root, target);
  return !relative.startsWith('..') && !path.isAbsolute(relative) ? target : null;
}

function createAppServer(options = {}) {
  const root = path.resolve(options.root || __dirname);
  const env = options.env || process.env;
  const aiService = options.aiService || createAiService(env, options.dependencies);
  const aiSettings = options.aiSettings || createAiSettingsStore(env, options.dependencies);
  const syncService = options.syncService || createSyncService(env, options.dependencies);
  // Отдельный токен для правки настроек: общий с синком означал бы, что одна
  // утечка отдаёт и прогресс, и API-ключ провайдера.
  const adminToken = String(env.IPMAX_ADMIN_TOKEN || '').trim();
  const allowRequest = createRateLimiter(options.rateLimit || 20, options.rateWindowMs || 60000);
  // Синк вызывается чаще AI-разбора (пуш после каждой сессии), поэтому у него
  // свой, более щедрый счётчик — иначе один активный день упирается в лимит.
  const allowSync = createRateLimiter(options.syncRateLimit || 120, options.rateWindowMs || 60000);
  // За прокси X-Forwarded-For нужен, но доверять ему можно только когда прокси
  // действительно есть: иначе клиент подделает заголовок и обойдёт лимит.
  const trustProxy = options.trustProxy !== undefined
    ? !!options.trustProxy
    : String(env.IPMAX_TRUST_PROXY || '').toLowerCase() === 'true';

  return http.createServer(async (request, response) => {
    // request.url приходит от клиента и может быть невалидным ('//', '/\\').
    // Без перехвата исключение вылетает из async-обработчика: ответ не
    // отправляется, запрос висит, и процесс сервера падает целиком.
    let url;
    try {
      url = new URL(request.url, 'http://localhost');
    } catch {
      return sendJson(response, 400, { error: 'Bad request' });
    }
    if (url.pathname === '/api/ai/status') {
      if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });
      return sendJson(response, 200, aiService.status());
    }
    if (url.pathname === '/api/ai/review') {
      if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed' });
      if (!allowRequest(clientAddress(request, trustProxy))) return sendJson(response, 429, { error: 'Too many AI review requests' });
      try {
        const payload = await readJson(request);
        const review = await aiService.review(payload);
        return sendJson(response, 200, { review });
      } catch (error) {
        const status = Number.isInteger(error && error.status) ? error.status : 500;
        return sendJson(response, status, { error: status >= 500 ? 'AI review is temporarily unavailable' : error.message, code: error && error.code || undefined });
      }
    }
    if (url.pathname === '/api/ai/settings') {
      if (!['GET', 'POST', 'DELETE'].includes(request.method)) return sendJson(response, 405, { error: 'Method not allowed' });
      if (!allowRequest(clientAddress(request, trustProxy))) return sendJson(response, 429, { error: 'Too many settings requests' });
      try {
        // Читать настройки тоже только по токену: baseUrl и модель — это
        // сведения о внутренней конфигурации сервера, наружу они не нужны.
        requireBearer(request.headers.authorization, adminToken, 'ADMIN_NOT_CONFIGURED');
        if (request.method === 'GET') return sendJson(response, 200, { settings: await aiSettings.read() });
        if (request.method === 'DELETE') return sendJson(response, 200, { settings: await aiSettings.clear() });
        const payload = await readJson(request);
        const settings = await aiSettings.write(payload);
        return sendJson(response, 200, { settings });
      } catch (error) {
        const status = Number.isInteger(error && error.status) ? error.status : 500;
        return sendJson(response, status, {
          error: status >= 500 ? 'Settings are temporarily unavailable' : error.message,
          code: error && error.code || undefined
        });
      }
    }
    if (url.pathname === '/api/admin/status') {
      if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });
      // Публично: UI должен знать, можно ли вообще открывать настройки, до
      // того как получит токен. Ничего секретного здесь не раскрывается.
      return sendJson(response, 200, { enabled: !!adminToken });
    }
    if (url.pathname === '/api/sync/status') {
      if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });
      // Статус не требует токена: клиенту надо знать, включён ли синк, до
      // того как он получит от пользователя токен. Состояние здесь не течёт.
      const status = syncService.status();
      return sendJson(response, 200, { enabled: status.enabled, hasSnapshot: status.hasSnapshot, revision: status.revision, maxBytes: status.maxBytes });
    }
    if (url.pathname === '/api/sync') {
      if (request.method !== 'GET' && request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed' });
      if (!allowSync(clientAddress(request, trustProxy))) return sendJson(response, 429, { error: 'Too many sync requests' });
      try {
        syncService.authorise(request.headers.authorization);
        if (request.method === 'GET') {
          const result = await syncService.pull();
          return sendJson(response, 200, { snapshot: result.snapshot });
        }
        const payload = await readJson(request, MAX_SYNC_BODY_BYTES);
        const result = await syncService.push(payload);
        return sendJson(response, 200, { snapshot: result.snapshot, conflicts: result.conflicts });
      } catch (error) {
        const status = Number.isInteger(error && error.status) ? error.status : 500;
        return sendJson(response, status, {
          error: status >= 500 ? 'Sync is temporarily unavailable' : error.message,
          code: error && error.code || undefined
        });
      }
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return sendJson(response, 405, { error: 'Method not allowed' });

    const file = safeStaticPath(root, url.pathname);
    if (!file) { response.writeHead(403); return response.end(); }
    fs.readFile(file, (error, body) => {
      if (error) { response.writeHead(error.code === 'ENOENT' ? 404 : 500); return response.end(); }
      response.writeHead(200, {
        'Content-Type': contentTypes[path.extname(file)] || 'application/octet-stream',
        'Content-Length': body.length,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff'
      });
      if (request.method === 'HEAD') response.end();
      else response.end(body);
    });
  });
}

if (require.main === module) {
  const host = process.env.IPMAX_HOST || '127.0.0.1';
  const port = Math.max(1, Math.min(65535, Number(process.env.IPMAX_PORT) || 4173));
  const server = createAppServer();
  server.listen(port, host, () => console.log(`Interview Prep Max listening on http://${host}:${port}`));
  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

module.exports = { createAppServer, safeStaticPath, MAX_BODY_BYTES };
