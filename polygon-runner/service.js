const crypto = require('node:crypto');

const PUBLIC_TASKS = {
  'linux-permissions-lockout': {
    id: 'linux-permissions-lockout',
    title: 'Права после выкатки',
    technology: 'Linux',
    difficulty: 'Легко',
    durationMinutes: 20,
    xp: 100,
    description: 'После релиза сервис anketa падает с Permission denied. Восстановите минимально необходимые права и не откройте секрет посторонним.',
    criteria: [
      { id: 'directory', title: 'Верните доступ к каталогу конфигов' },
      { id: 'config', title: 'Верните доступ к конфигу' },
      { id: 'secret', title: 'Закройте ключ от посторонних' },
      { id: 'service', title: 'Дождитесь, пока сервис оживёт' }
    ]
  }
};

const TASK_RUNTIME = {
  'linux-permissions-lockout': {
    image: 'ipmax-polygon-linux-permissions:v1'
  }
};

const TASKS = Object.freeze(Object.fromEntries(
  Object.entries(PUBLIC_TASKS).map(([id, task]) => [id, Object.freeze({
    ...task,
    criteria: Object.freeze(task.criteria.map(item => Object.freeze({ ...item })))
  })])
));

function polygonError(message, code, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function safeEqual(left, right) {
  const a = crypto.createHash('sha256').update(String(left || '')).digest();
  const b = crypto.createHash('sha256').update(String(right || '')).digest();
  return crypto.timingSafeEqual(a, b);
}

function bearerToken(header) {
  const match = String(header || '').match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function createPolygonService(options = {}) {
  const syncToken = String(options.syncToken || '').trim();
  if (syncToken.length < 24) throw new Error('Polygon sync token must be at least 24 characters');
  if (!options.docker) throw new Error('Polygon Docker adapter is required');
  const docker = options.docker;
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const randomId = typeof options.randomId === 'function'
    ? options.randomId
    : () => crypto.randomBytes(18).toString('base64url');
  const ttlMs = Math.max(60_000, Math.min(60 * 60 * 1000, Number(options.ttlMs) || 20 * 60 * 1000));
  const maxSessions = Math.max(1, Math.min(4, Number(options.maxSessions) || 1));
  const sessions = new Map();
  let createQueue = Promise.resolve();

  function authorise(header) {
    const token = bearerToken(header);
    if (!token || !safeEqual(token, syncToken)) {
      throw polygonError('Polygon token is invalid', 'POLYGON_UNAUTHORIZED', 401);
    }
    return true;
  }

  function requireSession(id) {
    const session = sessions.get(String(id || ''));
    if (!session) throw polygonError('Polygon session not found', 'POLYGON_SESSION_NOT_FOUND', 404);
    return session;
  }

  function publicSession(session) {
    return {
      id: session.id,
      taskId: session.taskId,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      completedAt: session.completedAt,
      terminalPath: `/api/polygon/sessions/${encodeURIComponent(session.id)}/terminal`,
      terminalProtocol: session.terminalToken
    };
  }

  async function cleanupExpired() {
    const expired = [...sessions.values()].filter(session => session.expiresAt < now());
    await Promise.all(expired.map(async session => {
      sessions.delete(session.id);
      try { await docker.removeLab(session.containerName); } catch (_) {}
    }));
    return expired.length;
  }

  async function createSessionUnlocked(header, input) {
    authorise(header);
    await cleanupExpired();
    const taskId = String(input && input.taskId || '');
    const task = TASKS[taskId];
    const runtime = TASK_RUNTIME[taskId];
    if (!task || !runtime) throw polygonError('Polygon task not found', 'POLYGON_TASK_NOT_FOUND', 404);
    const active = [...sessions.values()].find(session => session.taskId === taskId);
    if (active) {
      let state;
      try { state = await docker.inspect(active.containerName); }
      catch (_) { return publicSession(active); }
      if (state && state.running) return publicSession(active);
      sessions.delete(active.id);
      try { await docker.removeLab(active.containerName); } catch (_) {}
    }
    if (sessions.size >= maxSessions) throw polygonError('Polygon already has an active session', 'POLYGON_BUSY', 429);

    const id = randomId();
    const terminalToken = randomId();
    const containerName = `ipmax-polygon-${id.replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 40)}`;
    const createdAt = now();
    const session = {
      id, terminalToken, taskId, containerName, createdAt,
      expiresAt: createdAt + ttlMs,
      completedAt: null
    };
    const spec = {
      containerName,
      image: runtime.image,
      network: 'none',
      memoryBytes: 256 * 1024 * 1024,
      memorySwapBytes: 256 * 1024 * 1024,
      cpus: 0.5,
      pidsLimit: 64,
      readOnly: false,
      capDrop: ['ALL'],
      capAdd: ['CHOWN', 'DAC_OVERRIDE', 'FOWNER', 'SETGID', 'SETUID'],
      noNewPrivileges: true,
      mounts: []
    };
    try {
      await docker.createLab(spec);
      sessions.set(id, session);
      return publicSession(session);
    } catch (_) {
      try { await docker.removeLab(containerName); } catch (_) {}
      throw polygonError('Could not start polygon session', 'POLYGON_START_FAILED', 503);
    }
  }

  function createSession(header, input) {
    const next = createQueue.then(() => createSessionUnlocked(header, input));
    createQueue = next.catch(() => {});
    return next;
  }

  async function getSession(header, id) {
    authorise(header);
    await cleanupExpired();
    return publicSession(requireSession(id));
  }

  async function checkSession(header, id) {
    authorise(header);
    await cleanupExpired();
    const session = requireSession(id);
    const task = TASKS[session.taskId];
    const result = await docker.checkLab(session.containerName, task);
    const criteria = new Map(task.criteria.map(item => [item.id, item]));
    const checks = task.criteria.map(item => {
      const actual = Array.isArray(result && result.checks)
        ? result.checks.find(check => check && check.id === item.id)
        : null;
      return { id: item.id, title: criteria.get(item.id).title, passed: !!(actual && actual.passed) };
    });
    const complete = checks.every(item => item.passed);
    if (complete && !session.completedAt) session.completedAt = now();
    return { sessionId: session.id, taskId: session.taskId, checks, complete, completedAt: session.completedAt };
  }

  async function deleteSession(header, id) {
    authorise(header);
    const session = requireSession(id);
    sessions.delete(session.id);
    await docker.removeLab(session.containerName);
    return { removed: true };
  }

  function authoriseTerminal(id, token) {
    const session = sessions.get(String(id || ''));
    return !!session && session.expiresAt >= now() && safeEqual(token, session.terminalToken);
  }

  function openTerminal(id, token) {
    if (!authoriseTerminal(id, token)) throw polygonError('Terminal token is invalid', 'POLYGON_TERMINAL_UNAUTHORIZED', 401);
    const session = requireSession(id);
    return docker.openShell(session.containerName);
  }

  async function shutdown() {
    const active = [...sessions.values()];
    sessions.clear();
    await Promise.all(active.map(async session => {
      try { await docker.removeLab(session.containerName); } catch (_) {}
    }));
    return active.length;
  }

  return {
    authorise,
    createSession,
    getSession,
    checkSession,
    deleteSession,
    cleanupExpired,
    authoriseTerminal,
    openTerminal,
    shutdown,
    taskList: () => Object.values(TASKS),
    activeCount: () => sessions.size
  };
}

module.exports = { TASKS, createPolygonService, safeEqual };
