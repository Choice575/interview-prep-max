const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { EventEmitter } = require('node:events');
const { WebSocket } = require('ws');
const { createPolygonGateway } = require('./gateway.js');

const AUTH = 'Bearer test-polygon-sync-token-at-least-24-characters';

function fakeService() {
  const calls = [];
  return {
    calls,
    authorise(auth) {
      if (auth !== AUTH) {
        const error = new Error('Polygon token is invalid');
        error.code = 'POLYGON_UNAUTHORIZED';
        error.status = 401;
        throw error;
      }
      return true;
    },
    taskList: () => [{ id: 'linux-permissions-lockout', title: 'Права после выкатки', criteria: [] }],
    createSession: async (auth, body) => {
      calls.push(['create', auth, body]);
      return { id: 'session-1', taskId: body.taskId, terminalPath: '/api/polygon/sessions/session-1/terminal?token=terminal-1', expiresAt: 9999 };
    },
    getSession: async (auth, id) => {
      calls.push(['get', auth, id]);
      return { id, taskId: 'linux-permissions-lockout', expiresAt: 9999 };
    },
    checkSession: async (auth, id) => {
      calls.push(['check', auth, id]);
      return { sessionId: id, complete: false, checks: [] };
    },
    deleteSession: async (auth, id) => {
      calls.push(['delete', auth, id]);
      return { removed: true };
    },
    authoriseTerminal: (id, token) => id === 'session-1' && token === 'terminal-1',
    openTerminal: () => ({
      stdin: { write() {}, end() {} },
      stdout: { on() {} },
      stderr: { on() {} },
      on() {}, kill() {}
    })
  };
}

async function listen(gateway) {
  const server = http.createServer(gateway.handler);
  gateway.attachWebSocket(server);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server;
}

function request(server, method, path, body, headers = {}) {
  const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port: server.address().port, method, path,
      headers: { ...(data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}), ...headers }
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

test('serves task catalog publicly but protects session operations', async () => {
  const service = fakeService();
  const gateway = createPolygonGateway({ service, maxBodyBytes: 4096 });
  const server = await listen(gateway);
  try {
    const tasks = await request(server, 'GET', '/api/polygon/tasks');
    assert.equal(tasks.status, 200);
    assert.equal(tasks.body.tasks[0].id, 'linux-permissions-lockout');

    const denied = await request(server, 'POST', '/api/polygon/sessions', { taskId: 'linux-permissions-lockout' });
    assert.equal(denied.status, 401);
    assert.equal(denied.body.code, 'POLYGON_UNAUTHORIZED');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('routes create, inspect, check and delete with the bearer header', async () => {
  const service = fakeService();
  const gateway = createPolygonGateway({ service });
  const server = await listen(gateway);
  try {
    const created = await request(server, 'POST', '/api/polygon/sessions', { taskId: 'linux-permissions-lockout' }, { Authorization: AUTH });
    assert.equal(created.status, 201);
    assert.equal(created.body.session.id, 'session-1');
    const got = await request(server, 'GET', '/api/polygon/sessions/session-1', undefined, { Authorization: AUTH });
    const checked = await request(server, 'POST', '/api/polygon/sessions/session-1/check', {}, { Authorization: AUTH });
    const removed = await request(server, 'DELETE', '/api/polygon/sessions/session-1', undefined, { Authorization: AUTH });
    assert.equal(got.status, 200);
    assert.equal(checked.status, 200);
    assert.equal(removed.status, 200);
    assert.deepEqual(service.calls.map(call => call[0]), ['create', 'get', 'check', 'delete']);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('rejects oversized and malformed session requests', async () => {
  const gateway = createPolygonGateway({ service: fakeService(), maxBodyBytes: 40 });
  const server = await listen(gateway);
  try {
    const oversized = await request(server, 'POST', '/api/polygon/sessions', { taskId: 'x'.repeat(1000) }, { Authorization: AUTH });
    assert.equal(oversized.status, 413);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('bridges an authenticated WebSocket to the session terminal', async () => {
  const service = fakeService();
  const gateway = createPolygonGateway({ service });
  const server = await listen(gateway);
  try {
    const socket = new WebSocket(
      `ws://127.0.0.1:${server.address().port}/api/polygon/sessions/session-1/terminal`,
      ['ipmax-polygon', 'terminal-1']
    );
    const opened = new Promise((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
    await opened;
    assert.equal(socket.readyState, WebSocket.OPEN);
    assert.equal(socket.protocol, 'ipmax-polygon');
    assert.notEqual(socket.protocol, 'terminal-1');
    socket.close();
    await new Promise(resolve => socket.once('close', resolve));
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('rejects a WebSocket with a wrong or missing terminal token', async () => {
  const gateway = createPolygonGateway({ service: fakeService() });
  const server = await listen(gateway);
  try {
    const socket = new WebSocket(
      `ws://127.0.0.1:${server.address().port}/api/polygon/sessions/session-1/terminal`,
      ['ipmax-polygon', 'wrong']
    );
    const result = await new Promise(resolve => {
      socket.once('unexpected-response', (_request, response) => resolve(response.statusCode));
      socket.once('error', () => {});
    });
    assert.equal(result, 401);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('forwards terminal buffers as WebSocket text frames for browser terminals', async () => {
  const service = fakeService();
  let stdout;
  service.openTerminal = () => {
    stdout = new EventEmitter();
    return { stdin: { write() {}, end() {} }, stdout, stderr: new EventEmitter(), on() {}, kill() {} };
  };
  const gateway = createPolygonGateway({ service });
  const server = await listen(gateway);
  try {
    const socket = new WebSocket(
      `ws://127.0.0.1:${server.address().port}/api/polygon/sessions/session-1/terminal`,
      ['ipmax-polygon', 'terminal-1']
    );
    await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    const received = new Promise((resolve, reject) => {
      socket.once('message', (data, isBinary) => resolve({ data: data.toString(), isBinary }));
      socket.once('error', reject);
    });
    stdout.emit('data', Buffer.from('hello from shell\n', 'utf8'));
    const message = await received;
    assert.deepEqual(message, { data: 'hello from shell\n', isBinary: false });
    const closed = new Promise(resolve => socket.once('close', resolve));
    socket.close();
    await closed;
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('rejects a malformed encoded WebSocket session id without throwing', async () => {
  const gateway = createPolygonGateway({ service: fakeService() });
  const server = await listen(gateway);
  try {
    const socket = new WebSocket(
      `ws://127.0.0.1:${server.address().port}/api/polygon/sessions/%ZZ/terminal`,
      ['ipmax-polygon', 'terminal-1']
    );
    const result = await new Promise(resolve => {
      socket.once('unexpected-response', (_request, response) => resolve(response.statusCode));
      socket.once('error', () => {});
    });
    assert.equal(result, 400);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
