const test = require('node:test');
const assert = require('node:assert/strict');
const { createPolygonService, TASKS } = require('./service.js');

const AUTH = 'Bearer test-polygon-sync-token-at-least-24-characters';

function createFakeDocker() {
  const calls = [];
  let running = new Set();
  let checkState = 'broken';
  return {
    calls,
    setCheckState(value) { checkState = value; },
    stopAll() { running = new Set(); },
    async createLab(spec) {
      calls.push({ action: 'create', spec });
      running.add(spec.containerName);
      return { containerName: spec.containerName };
    },
    async inspect(name) {
      calls.push({ action: 'inspect', name });
      return { running: running.has(name) };
    },
    async checkLab(name, task) {
      calls.push({ action: 'check', name, taskId: task.id });
      const passed = checkState === 'fixed';
      return {
        checks: [
          { id: 'directory', passed },
          { id: 'config', passed },
          { id: 'secret', passed },
          { id: 'service', passed }
        ]
      };
    },
    async removeLab(name) {
      calls.push({ action: 'remove', name });
      running.delete(name);
    },
    openShell(name) {
      calls.push({ action: 'shell', name });
      return { stdin: { write() {}, end() {} }, stdout: { on() {} }, stderr: { on() {} }, on() {}, kill() {} };
    }
  };
}

function service(options = {}) {
  const docker = options.docker || createFakeDocker();
  let now = options.now || 1_000_000;
  const result = createPolygonService({
    syncToken: 'test-polygon-sync-token-at-least-24-characters',
    docker,
    now: () => now,
    randomId: (() => { let n = 0; return () => `id-${++n}`; })(),
    ttlMs: 20 * 60 * 1000,
    maxSessions: 1
  });
  return { ...result, docker, setNow(value) { now = value; } };
}

test('publishes one allowlisted Linux task without checker internals', () => {
  assert.deepEqual(Object.keys(TASKS), ['linux-permissions-lockout']);
  const task = TASKS['linux-permissions-lockout'];
  assert.equal(task.title, 'Права после выкатки');
  assert.equal(task.criteria.length, 4);
  assert.equal('checker' in task, false);
  assert.equal('image' in task, false);
});

test('creates one bounded isolated lab and returns a short-lived terminal token', async () => {
  const api = service();
  const session = await api.createSession(AUTH, { taskId: 'linux-permissions-lockout' });

  assert.equal(session.taskId, 'linux-permissions-lockout');
  assert.equal(session.expiresAt, 2_200_000);
  assert.equal(session.terminalPath, '/api/polygon/sessions/id-1/terminal');
  assert.equal(session.terminalProtocol, 'id-2');
  assert.doesNotMatch(session.terminalPath, /token|id-2/);
  assert.equal('containerName' in session, false);

  const create = api.docker.calls.find(call => call.action === 'create');
  assert.equal(create.spec.image, 'ipmax-polygon-linux-permissions:v1');
  assert.equal(create.spec.network, 'none');
  assert.equal(create.spec.memoryBytes, 256 * 1024 * 1024);
  assert.equal(create.spec.memorySwapBytes, 256 * 1024 * 1024);
  assert.equal(create.spec.cpus, 0.5);
  assert.equal(create.spec.pidsLimit, 64);
  assert.equal(create.spec.readOnly, false, 'chmod training needs an ephemeral writable root filesystem');
  assert.deepEqual(create.spec.capAdd.sort(), ['CHOWN', 'DAC_OVERRIDE', 'FOWNER', 'SETGID', 'SETUID']);
  assert.equal(create.spec.noNewPrivileges, true);
  assert.deepEqual(create.spec.mounts, []);
});

test('requires the exact bearer token and resumes the one active lab idempotently', async () => {
  const api = service();
  await assert.rejects(() => api.createSession('', { taskId: 'linux-permissions-lockout' }), error => error.code === 'POLYGON_UNAUTHORIZED' && error.status === 401);
  await assert.rejects(() => api.createSession('Bearer wrong-token-with-enough-padding', { taskId: 'linux-permissions-lockout' }), error => error.code === 'POLYGON_UNAUTHORIZED');
  await assert.rejects(() => api.createSession(AUTH, { taskId: 'unknown' }), error => error.code === 'POLYGON_TASK_NOT_FOUND' && error.status === 404);
  const first = await api.createSession(AUTH, { taskId: 'linux-permissions-lockout' });
  const resumed = await api.createSession(AUTH, { taskId: 'linux-permissions-lockout' });
  assert.deepEqual(resumed, first);
  assert.equal(api.docker.calls.filter(call => call.action === 'create').length, 1);
});

test('serialises concurrent creates so only one lab is started', async () => {
  const docker = createFakeDocker();
  let release;
  const originalCreate = docker.createLab;
  docker.createLab = async spec => {
    await new Promise(resolve => { release = () => resolve(originalCreate.call(docker, spec)); });
  };
  const api = createPolygonService({
    syncToken: AUTH.slice('Bearer '.length), docker,
    now: () => 1_000_000,
    randomId: (() => { let n = 0; return () => `concurrent-${++n}`; })()
  });
  const first = api.createSession(AUTH, { taskId: 'linux-permissions-lockout' });
  const second = api.createSession(AUTH, { taskId: 'linux-permissions-lockout' });
  await new Promise(resolve => setImmediate(resolve));
  release();
  const [one, two] = await Promise.all([first, second]);
  assert.deepEqual(two, one);
  assert.equal(docker.calls.filter(call => call.action === 'create').length, 1);
});

test('replaces a stale session when its container is no longer running', async () => {
  const api = service();
  const first = await api.createSession(AUTH, { taskId: 'linux-permissions-lockout' });
  api.docker.stopAll();
  const replacement = await api.createSession(AUTH, { taskId: 'linux-permissions-lockout' });
  assert.notEqual(replacement.id, first.id);
  assert.equal(replacement.id, 'id-3');
  assert.equal(api.docker.calls.filter(call => call.action === 'create').length, 2);
  assert.ok(api.docker.calls.some(call => call.action === 'remove'));
});

test('checks the container from the runner and removes a completed lab', async () => {
  const api = service();
  const created = await api.createSession(AUTH, { taskId: 'linux-permissions-lockout' });
  const broken = await api.checkSession(AUTH, created.id);
  assert.equal(broken.complete, false);
  assert.equal(broken.checks.filter(item => item.passed).length, 0);

  api.docker.setCheckState('fixed');
  const fixed = await api.checkSession(AUTH, created.id);
  assert.equal(fixed.complete, true);
  assert.equal(fixed.checks.filter(item => item.passed).length, 4);
  assert.equal(fixed.completedAt, 1_000_000);

  await api.deleteSession(AUTH, created.id);
  assert.ok(api.docker.calls.some(call => call.action === 'remove'));
  await assert.rejects(() => api.getSession(AUTH, created.id), error => error.status === 404);
});

test('expires and removes stale sessions before accepting a replacement', async () => {
  const api = service();
  await api.createSession(AUTH, { taskId: 'linux-permissions-lockout' });
  api.setNow(2_200_001);
  const removed = await api.cleanupExpired();
  assert.equal(removed, 1);
  assert.ok(api.docker.calls.some(call => call.action === 'remove'));
  const replacement = await api.createSession(AUTH, { taskId: 'linux-permissions-lockout' });
  assert.equal(replacement.id, 'id-3');
});

test('terminal tokens are session-bound, short-lived and single-purpose', async () => {
  const api = service();
  const created = await api.createSession(AUTH, { taskId: 'linux-permissions-lockout' });
  assert.equal(api.authoriseTerminal(created.id, 'wrong'), false);
  assert.equal(api.authoriseTerminal(created.id, 'id-2'), true);
  assert.equal(api.authoriseTerminal('other', 'id-2'), false);
  api.setNow(created.expiresAt + 1);
  assert.equal(api.authoriseTerminal(created.id, 'id-2'), false);
});

test('shutdown removes every active lab before the runner exits', async () => {
  const api = service();
  await api.createSession(AUTH, { taskId: 'linux-permissions-lockout' });
  const removed = await api.shutdown();
  assert.equal(removed, 1);
  assert.equal(api.activeCount(), 0);
  assert.ok(api.docker.calls.some(call => call.action === 'remove'));
});
