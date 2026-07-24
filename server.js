const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { createAiService } = require('./server/ai-service.js');

const MAX_BODY_BYTES = 16 * 1024;
const contentTypes = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png'
};
const publicFiles = new Set([
  'index.html', 'styles.css', 'version.js', 'date.js', 'storage.js', 'progress.js', 'coach.js', 'ai-coach.js', 'sw.js',
  'coach-ui.js', 'app.js', 'interview-prep-max.webmanifest', 'assets/icon-192.png', 'assets/icon-512.png',
  'tasks/base_questions.json', 'tasks/subnet.json', 'tasks/ts.json', 'tasks/cmd.json', 'tasks/code.json',
  'tasks/git.json', 'tasks/regex.json', 'tasks/ansible_pb.json', 'tasks/dockerfile.json', 'tasks/k8s.json',
  'tasks/ports.json', 'tasks/labs.json', 'tasks/tips.json', 'tasks/incidents.json', 'tasks/study_map.json',
  'tasks/study_tests.json', 'tasks/senior_cases.json', 'tasks/best_practices.json'
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

function readJson(request) {
  return new Promise((resolve, reject) => {
    if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
      const error = new Error('Content-Type must be application/json');
      error.status = 415;
      reject(error);
      return;
    }
    const declared = Number(request.headers['content-length']);
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
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
      if (size <= MAX_BODY_BYTES) chunks.push(chunk);
    });
    request.on('end', () => {
      if (size > MAX_BODY_BYTES) {
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
    const current = clients.get(address);
    if (!current || current.resetAt <= now) {
      clients.set(address, { count: 1, resetAt: now + windowMs });
      return true;
    }
    current.count++;
    return current.count <= limit;
  };
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
  const aiService = options.aiService || createAiService(options.env || process.env, options.dependencies);
  const allowRequest = createRateLimiter(options.rateLimit || 20, options.rateWindowMs || 60000);

  return http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/api/ai/status') {
      if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });
      return sendJson(response, 200, aiService.status());
    }
    if (url.pathname === '/api/ai/review') {
      if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed' });
      if (!allowRequest(request.socket.remoteAddress || 'unknown')) return sendJson(response, 429, { error: 'Too many AI review requests' });
      try {
        const payload = await readJson(request);
        const review = await aiService.review(payload);
        return sendJson(response, 200, { review });
      } catch (error) {
        const status = Number.isInteger(error && error.status) ? error.status : 500;
        return sendJson(response, status, { error: status >= 500 ? 'AI review is temporarily unavailable' : error.message, code: error && error.code || undefined });
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
