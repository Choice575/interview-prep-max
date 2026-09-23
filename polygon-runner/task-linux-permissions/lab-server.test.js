const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createLabServer, validControlBody } = require('./lab-server.js');

function request(port, route, method = 'GET', body) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const req = http.request({ hostname: '127.0.0.1', port, path: route, method,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {} }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

test('lab API accepts only one fixed name field and exposes no Docker API', async () => {
  assert.equal(validControlBody({ name: 'ipmax-polygon-test1' }), true);
  for (const body of [
    { name: 'other' }, { name: 'ipmax-polygon-test1', image: 'ubuntu:latest' },
    { name: 'ipmax-polygon-test1', mounts: ['/var/run/docker.sock:/sock'] },
    { name: 'ipmax-polygon-test1', network: 'host' }
  ]) assert.equal(validControlBody(body), false);

  const lab = createLabServer();
  await new Promise(resolve => lab.control.listen(0, '127.0.0.1', resolve));
  try {
    const port = lab.control.address().port;
    assert.equal((await request(port, '/health')).status, 200);
    assert.equal((await request(port, '/v1/status')).body.active, false);
    assert.equal((await request(port, '/v1.49/containers/create', 'POST', { Image: 'ubuntu:latest' })).status, 404);
    assert.equal((await request(port, '/v1/start', 'POST', { name: 'ipmax-polygon-test1', network: 'host' })).status, 400);
  } finally { lab.shutdown(); }
});

test('compose keeps Docker socket out of runner and lab and uses an internal network', () => {
  const compose = fs.readFileSync(path.resolve(__dirname, '../../docker-compose.yml'), 'utf8');
  const runner = fs.readFileSync(path.resolve(__dirname, '../Dockerfile'), 'utf8');
  assert.doesNotMatch(compose, /\/var\/run\/docker\.sock/);
  assert.match(compose, /lab-only:\s*\n\s*internal: true/);
  assert.match(compose, /cap_drop:\s*\n\s*- ALL/);
  assert.match(compose, /read_only: true/);
  assert.doesNotMatch(runner, /docker-cli/);
  assert.match(runner, /USER node/);
});

test('service check pins the unchanged Linux exercise, including its script bytes', () => {
  const source = fs.readFileSync(path.join(__dirname, 'app.py'), 'utf8').replace(/\r\n/g, '\n');
  const expected = crypto.createHash('sha256').update(source).digest('hex');
  const server = fs.readFileSync(path.join(__dirname, 'lab-server.js'), 'utf8');
  assert.match(server, new RegExp(`APP_SHA256 = '${expected}'`));
});
