const assert = require('node:assert/strict');
const fs = require('node:fs');
const WebSocket = require('ws');

const base = 'http://127.0.0.1:4180/api/polygon';
const token = process.env.POLYGON_TOKEN;

async function request(route, method = 'GET', body, accessToken = token) {
  const response = await fetch(base + route, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: response.status, body: await response.json() };
}

function terminal(session) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:4180${session.terminalPath}`,
      ['ipmax-polygon', session.terminalProtocol]);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

async function main() {
  assert.ok(token && token.length >= 24);
  assert.equal(process.getuid(), 1000);
  assert.equal(fs.existsSync('/var/run/docker.sock'), false);
  assert.equal((await request('/tasks')).status, 200);
  assert.equal((await request('/sessions', 'POST', { taskId: 'linux-permissions-lockout' }, 'sync-token-at-least-24-characters')).status, 401);
  const created = await request('/sessions', 'POST', { taskId: 'linux-permissions-lockout' });
  assert.equal(created.status, 201);
  const session = created.body.session;
  try {
    let checked = await request(`/sessions/${session.id}/check`, 'POST');
    assert.equal(checked.status, 200);
    assert.equal(checked.body.complete, false);
    const socket = await terminal(session);
    socket.send('chown anketa:anketa /etc/anketa /etc/anketa/config.ini /etc/anketa/api.key; chmod 750 /etc/anketa; chmod 640 /etc/anketa/config.ini; chmod 600 /etc/anketa/api.key\n');
    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      checked = await request(`/sessions/${session.id}/check`, 'POST');
      if (checked.body.complete) break;
    }
    assert.equal(checked.body.complete, true, JSON.stringify(checked.body));
    socket.close();
  } finally {
    assert.equal((await request(`/sessions/${session.id}`, 'DELETE')).status, 200);
  }
  console.log('Runner-to-lab API and WebSocket lifecycle passed');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
