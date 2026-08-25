const test = require('node:test');
const assert = require('node:assert/strict');
const PolygonUI = require('./polygon-ui.js');

const task = {
  id: 'linux-permissions-lockout', title: 'Права после выкатки', technology: 'Linux',
  difficulty: 'Легко', durationMinutes: 20, xp: 100,
  description: 'Исправьте права <img src=x onerror=alert(1)>',
  criteria: [
    { id: 'directory', title: 'Каталог' }, { id: 'config', title: 'Конфиг' },
    { id: 'secret', title: 'Секрет' }, { id: 'service', title: 'Сервис' }
  ]
};

test('renders an escaped live lab card with explicit resource and TTL limits', () => {
  const markup = PolygonUI.renderCatalog([task], {});
  assert.match(markup, /Права после выкатки/);
  assert.match(markup, /20 мин/);
  assert.match(markup, /256 MiB/);
  assert.match(markup, /0\.5 CPU/);
  assert.match(markup, /data-polygon-action="start"/);
  assert.match(markup, /linux-permissions-lockout/);
  assert.doesNotMatch(markup, /<img\s/i);
  assert.match(markup, /&lt;img/);
});

test('renders a terminal session without placing its token in markup', () => {
  const session = {
    id: 'session-1', taskId: task.id, expiresAt: Date.now() + 60000,
    terminalPath: '/api/polygon/sessions/session-1/terminal', terminalProtocol: 'secret-terminal-token'
  };
  const markup = PolygonUI.renderSession(task, session, []);
  assert.match(markup, /id="polygon-terminal-output"/);
  assert.match(markup, /id="polygon-terminal-input"/);
  assert.match(markup, /data-polygon-action="send"/);
  assert.match(markup, /data-polygon-action="check"/);
  assert.match(markup, /data-polygon-action="stop"/);
  assert.doesNotMatch(markup, /secret-terminal-token|terminalProtocol/);
});

test('renders four escaped automatic check results', () => {
  const checks = task.criteria.map((item, index) => ({ ...item, passed: index < 2 }));
  const markup = PolygonUI.renderChecks(checks);
  assert.equal((markup.match(/class="polygon-check [^"]+"/g) || []).length, 4);
  assert.equal((markup.match(/class="polygon-check polygon-check-pass"/g) || []).length, 2);
  assert.match(markup, /Каталог/);
  assert.match(markup, /Сервис/);
});

test('API client sends bearer auth only in headers and bounds JSON requests', async () => {
  const calls = [];
  const client = PolygonUI.createClient({
    token: () => 'device-sync-token-at-least-24-characters',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 201, json: async () => ({ session: { id: 's1' } }) };
    }
  });
  const result = await client.createSession(task.id);
  assert.equal(result.id, 's1');
  assert.equal(calls[0].url, './api/polygon/sessions');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer device-sync-token-at-least-24-characters');
  assert.doesNotMatch(calls[0].options.body, /device-sync-token|localStorage/);
  assert.deepEqual(JSON.parse(calls[0].options.body), { taskId: task.id });
});

test('API client maps missing token and bounded server errors', async () => {
  const missing = PolygonUI.createClient({ token: () => '' });
  await assert.rejects(() => missing.createSession(task.id), error => error.code === 'POLYGON_AUTH_REQUIRED');

  const failed = PolygonUI.createClient({
    token: () => 'device-sync-token-at-least-24-characters',
    fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({ code: 'POLYGON_BUSY', error: '<busy>' }) })
  });
  await assert.rejects(() => failed.createSession(task.id), error => error.code === 'POLYGON_BUSY' && error.status === 429 && error.message === '<busy>');
});

test('builds a same-origin WebSocket URL without putting terminal token in it', () => {
  const target = PolygonUI.terminalTarget({
    terminalPath: '/api/polygon/sessions/s1/terminal', terminalProtocol: 'secret-token'
  }, { protocol: 'https:', host: 'prepmax.duckdns.org' });
  assert.deepEqual(target, {
    url: 'wss://prepmax.duckdns.org/api/polygon/sessions/s1/terminal',
    protocols: ['ipmax-polygon', 'secret-token']
  });
  assert.doesNotMatch(target.url, /secret-token|token=/);
});
