const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');

const name = 'ipmax-polygon-stagecheck';

function request(route, method = 'GET', body) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request({ host: '127.0.0.1', port: 4181, path: route, method,
      headers: data ? { 'content-type': 'application/json', 'content-length': data.length } : {} }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks)) }));
    });
    req.on('error', reject);
    req.end(data);
  });
}

function shell(command) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(4182, '127.0.0.1');
    let output = '';
    socket.setTimeout(5000, () => socket.destroy(new Error('Terminal timeout')));
    socket.on('connect', () => socket.write(`${command}\necho __DONE__\n`));
    socket.on('data', chunk => {
      output += chunk;
      if (output.includes('__DONE__')) { socket.destroy(); resolve(output); }
    });
    socket.on('end', () => reject(new Error('Terminal closed before response')));
    socket.on('error', reject);
  });
}

async function main() {
  assert.equal((await request('/health')).status, 200);
  if ((await request('/v1/status')).body.active) await request('/v1/stop', 'POST', { name });
  assert.equal((await request('/v1/status')).body.active, false);
  assert.equal((await request('/v1.49/containers/json')).status, 404);
  assert.equal((await request('/v1/start', 'POST', { name, image: 'alpine' })).status, 400);
  assert.equal((await request('/v1/start', 'POST', { name })).status, 200);
  assert.equal((await request('/v1/status')).body.name, name);
  const initial = (await request('/v1/check', 'POST', { name })).body.checks;
  assert.equal(initial.every(item => item.passed), false);
  assert.match(await shell('id; test ! -e /var/run/docker.sock && echo no-docker-socket'), /no-docker-socket/);
  await shell('chown anketa:anketa /etc/anketa /etc/anketa/config.ini /etc/anketa/api.key; chmod 750 /etc/anketa; chmod 640 /etc/anketa/config.ini; chmod 600 /etc/anketa/api.key');
  let result;
  for (let attempt = 0; attempt < 15; attempt++) {
    result = (await request('/v1/check', 'POST', { name })).body.checks;
    if (result.every(item => item.passed)) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.deepEqual(result.map(item => item.passed), [true, true, true, true]);
  assert.equal((await request('/v1/stop', 'POST', { name })).body.active, false);
  assert.equal((await request('/v1/start', 'POST', { name })).status, 200);
  assert.equal((await request('/v1/check', 'POST', { name })).body.checks.every(item => item.passed), false);
  await request('/v1/stop', 'POST', { name });
  console.log('Container lab lifecycle passed');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
