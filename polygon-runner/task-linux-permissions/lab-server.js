const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');

const NAME_PATTERN = /^ipmax-polygon-[a-zA-Z0-9][a-zA-Z0-9_.-]{0,39}$/;
const APP_SHA256 = 'e0403fdd8ef7770dcf60fc143e51dc328998e85fa78b0f0989ce0a625236b236';
const CHECKS = Object.freeze([
  ['directory', 'test "$(stat -c %U:%a /etc/anketa)" = "anketa:750"'],
  ['config', 'test "$(stat -c %U:%a /etc/anketa/config.ini)" = "anketa:640"'],
  ['secret', 'test "$(stat -c %U:%a /etc/anketa/api.key)" = "anketa:600" && su -s /bin/sh -c "test -r /etc/anketa/api.key" anketa'],
  ['service', 'test "$(curl -fsS http://127.0.0.1:8080/health)" = "ok" && ! grep -q "Permission denied" /var/log/anketa/anketa.log']
]);

function validControlBody(body) {
  return body && typeof body === 'object' && !Array.isArray(body) &&
    Object.keys(body).length === 1 && NAME_PATTERN.test(body.name);
}

function send(response, status, value) {
  const data = Buffer.from(JSON.stringify(value));
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': data.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(data);
}

function readControlBody(request) {
  return new Promise((resolve, reject) => {
    if (!String(request.headers['content-type'] || '').startsWith('application/json')) return reject(new Error('Expected JSON'));
    let text = '';
    request.on('data', chunk => {
      text += chunk;
      if (text.length > 1024) request.destroy();
    });
    request.on('end', () => {
      try { resolve(JSON.parse(text)); } catch (_) { reject(new Error('Invalid JSON')); }
    });
    request.on('error', reject);
  });
}

function createLabServer(options = {}) {
  const configDir = options.configDir || '/etc/anketa';
  const logDir = options.logDir || '/var/log/anketa';
  const wrapperPath = options.wrapperPath || '/opt/anketa/wrapper.sh';
  const appPath = options.appPath || '/opt/anketa/app.py';
  const children = new Set();
  let activeName = null;
  let wrapper = null;

  function stopProcess(child) {
    if (!child) return;
    try { process.kill(-child.pid, 'SIGTERM'); } catch (_) { try { child.kill('SIGTERM'); } catch (_) {} }
  }

  function stopChildren() {
    for (const child of children) stopProcess(child);
    children.clear();
    stopProcess(wrapper);
    wrapper = null;
  }

  function resetFiles() {
    fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
    fs.chmodSync(configDir, 0o700);
    for (const entry of fs.readdirSync(configDir)) fs.rmSync(require('node:path').join(configDir, entry), { recursive: true, force: true });
    fs.chownSync(configDir, 0, 0);
    fs.writeFileSync(require('node:path').join(configDir, 'config.ini'), 'PORT=8080\n', { mode: 0o600 });
    fs.writeFileSync(require('node:path').join(configDir, 'api.key'), 'polygon-demo-api-key\n', { mode: 0o600 });
    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(require('node:path').join(logDir, 'anketa.log'), '');
  }

  function start(name) {
    stopChildren();
    resetFiles();
    activeName = name;
    wrapper = spawn(wrapperPath, [], { detached: true, stdio: 'ignore' });
    wrapper.on('error', error => console.error('Lab wrapper failed:', error.message));
    return { name, active: true };
  }

  function stop(name) {
    if (activeName && activeName !== name) return { active: true, name: activeName };
    stopChildren();
    activeName = null;
    resetFiles();
    return { active: false };
  }

  function check(name) {
    if (name !== activeName) return null;
    const checks = CHECKS.map(([id, command]) => ({
      id, passed: spawnSync('/bin/sh', ['-lc', command], { timeout: 5000, stdio: 'ignore' }).status === 0
    }));
    if (checks[3].passed) {
      try { checks[3].passed = crypto.createHash('sha256').update(fs.readFileSync(appPath)).digest('hex') === APP_SHA256; }
      catch (_) { checks[3].passed = false; }
    }
    return { checks };
  }

  const control = http.createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/health') return send(response, 200, { ok: true });
    if (request.method === 'GET' && request.url === '/v1/status') return send(response, 200, { active: !!activeName, name: activeName });
    if (request.method !== 'POST' || !['/v1/start', '/v1/check', '/v1/stop'].includes(request.url)) {
      return send(response, 404, { error: 'Not found' });
    }
    try {
      const body = await readControlBody(request);
      if (!validControlBody(body)) return send(response, 400, { error: 'Invalid lab request' });
      if (request.url === '/v1/start') return send(response, 200, start(body.name));
      if (request.url === '/v1/stop') return send(response, 200, stop(body.name));
      const result = check(body.name);
      return result ? send(response, 200, result) : send(response, 404, { error: 'Lab not found' });
    } catch (_) { return send(response, 400, { error: 'Invalid lab request' }); }
  });

  const terminal = net.createServer(socket => {
    if (!activeName) { socket.destroy(); return; }
    const child = spawn('/bin/sh', [], { cwd: '/root', detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
    children.add(child);
    socket.pipe(child.stdin);
    child.stdout.pipe(socket, { end: false });
    child.stderr.pipe(socket, { end: false });
    child.once('close', () => { children.delete(child); socket.end(); });
    socket.once('close', () => stopProcess(child));
    socket.once('error', () => socket.destroy());
  });

  function shutdown() {
    stopChildren();
    control.close();
    terminal.close();
  }

  return { control, terminal, shutdown };
}

if (require.main === module) {
  const lab = createLabServer();
  const host = '0.0.0.0';
  lab.control.listen(4181, host);
  lab.terminal.listen(4182, host);
  process.on('SIGTERM', () => { lab.shutdown(); process.exit(0); });
  process.on('SIGINT', () => { lab.shutdown(); process.exit(0); });
}

module.exports = { createLabServer, validControlBody, NAME_PATTERN };
