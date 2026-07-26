const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { createAppServer } = require('./server.js');

const root = __dirname;
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function loadServiceWorker(cacheKeys = []) {
  const handlers = new Map();
  const deleted = [];
  let claimed = false;
  let precached = [];
  let context;

  const cache = {
    addAll: async assets => { precached = [...assets]; },
    put: async () => {}
  };
  context = vm.createContext({
    self: {
      location: { origin: 'http://127.0.0.1' },
      clients: { claim: async () => { claimed = true; } },
      addEventListener: (name, handler) => handlers.set(name, handler),
      skipWaiting: async () => {}
    },
    importScripts: file => {
      assert.equal(file, './version.js');
      vm.runInContext(read('version.js'), context, { filename: 'version.js' });
    },
    caches: {
      keys: async () => cacheKeys,
      delete: async key => { deleted.push(key); return true; },
      open: async () => cache,
      match: async () => undefined
    },
    fetch: async () => ({ ok: true, clone: () => ({}) }),
    URL,
    Response
  });
  vm.runInContext(read('sw.js'), context, { filename: 'sw.js' });

  return {
    context,
    handlers,
    deleted,
    wasClaimed: () => claimed,
    precached: () => precached
  };
}

function dispatchExtendable(handler, event = {}) {
  let pending;
  handler({ ...event, waitUntil: promise => { pending = promise; } });
  return pending;
}

function request(server, pathname) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: server.address().port, path: pathname }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    }).on('error', reject);
  });
}

test('publishes version 13.1.0 with a complete offline shell', async () => {
  const worker = loadServiceWorker();

  assert.equal(worker.context.self.IPMAX_VERSION, '13.1.0');
  assert.equal(worker.context.self.IPMAX_CACHE_NAME, 'ipmax-v13.1.0');
  await dispatchExtendable(worker.handlers.get('install'));
  assert.ok(worker.precached().includes('./study-ui.js'));
  assert.ok(worker.precached().includes('./tasks/study_map.json'));
  assert.ok(worker.precached().includes('./tasks/study_tests.json'));
  assert.ok(worker.precached().includes('./tasks/senior_cases.json'));
});

test('deletes only stale Interview Prep Max caches on activation', async () => {
  const worker = loadServiceWorker(['ipmax-v13.0.0', 'ipmax-v13.1.0', 'another-app-v4']);

  await dispatchExtendable(worker.handlers.get('activate'));
  assert.deepEqual(worker.deleted, ['ipmax-v13.0.0']);
  assert.equal(worker.wasClaimed(), true);
});

test('serves every release bootstrap file without HTTP caching', async () => {
  const server = createAppServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    for (const file of ['/version.js', '/sw.js', '/study-ui.js']) {
      const response = await request(server, file);
      assert.equal(response.status, 200, file);
      assert.equal(response.headers['cache-control'], 'no-cache', file);
    }
    assert.match((await request(server, '/version.js')).body, /IPMAX_VERSION = '13\.1\.0'/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('passes the release integrity verifier', () => {
  const result = spawnSync(process.execPath, ['verify-release.js'], { cwd: root, encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Release 13\.1\.0 integrity check passed/);
});
