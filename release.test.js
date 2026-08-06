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

function loadServiceWorker(cacheKeys = [], options = {}) {
  const handlers = new Map();
  const deleted = [];
  let claimed = false;
  let precached = [];
  const added = [];
  const stored = [];
  let context;

  const unavailable = new Set(options.unavailable || []);
  const cache = {
    addAll: async assets => {
      const broken = [...assets].filter(asset => unavailable.has(asset));
      if (broken.length) throw new TypeError('failed to fetch ' + broken[0]);
      precached = [...assets];
    },
    add: async asset => {
      if (unavailable.has(asset)) throw new TypeError('failed to fetch ' + asset);
      added.push(asset);
    },
    put: async request => { stored.push(request); }
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
    fetch: async () => options.response || { ok: true, type: 'basic', clone: () => ({}) },
    URL,
    Response
  });
  vm.runInContext(read('sw.js'), context, { filename: 'sw.js' });

  return {
    context,
    handlers,
    deleted,
    wasClaimed: () => claimed,
    precached: () => precached,
    added: () => added,
    stored: () => stored
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

// Версию читаем из единственного источника правды, а не дублируем строкой:
// иначе каждый релиз роняет тесты, которые к самому релизу отношения не имеют.
const RELEASE_VERSION = (() => {
  const source = fs.readFileSync(path.join(__dirname, 'version.js'), 'utf8');
  const match = source.match(/self\.IPMAX_VERSION\s*=\s*'(\d+\.\d+\.\d+)'/);
  assert.ok(match, 'version.js должен содержать semver IPMAX_VERSION');
  return match[1];
})();

test('publishes the current version with a complete offline shell', async () => {
  const worker = loadServiceWorker();

  assert.equal(worker.context.self.IPMAX_VERSION, RELEASE_VERSION);
  assert.equal(worker.context.self.IPMAX_CACHE_NAME, 'ipmax-v' + RELEASE_VERSION);
  await dispatchExtendable(worker.handlers.get('install'));
  assert.ok(worker.precached().includes('./study-ui.js'));
  assert.ok(worker.added().includes('./tasks/study_map.json'));
  assert.ok(worker.added().includes('./tasks/study_tests.json'));
  assert.ok(worker.added().includes('./tasks/senior_cases.json'));
});

test('installs the offline shell even when one dataset is unavailable', async () => {
  const worker = loadServiceWorker([], { unavailable: ['./tasks/labs.json'] });

  await dispatchExtendable(worker.handlers.get('install'));

  assert.ok(worker.precached().includes('./index.html'), 'shell must stay atomic');
  assert.ok(worker.precached().includes('./app.js'));
  assert.ok(!worker.precached().some(asset => asset.startsWith('./tasks/')), 'datasets cache separately');
  assert.ok(worker.added().includes('./tasks/study_map.json'), 'healthy datasets still cached');
  assert.ok(!worker.added().includes('./tasks/labs.json'), 'broken dataset is skipped');
});

test('fails the install when the offline shell itself is unavailable', async () => {
  const worker = loadServiceWorker([], { unavailable: ['./app.js'] });

  await assert.rejects(() => dispatchExtendable(worker.handlers.get('install')));
});

test('never caches unsuccessful responses', async () => {
  const worker = loadServiceWorker([], { response: { ok: false, status: 404, type: 'basic', clone: () => ({}) } });
  const handler = worker.handlers.get('fetch');
  let answered;
  handler({
    request: { method: 'GET', url: 'http://127.0.0.1/tasks/labs.json' },
    respondWith: promise => { answered = promise; }
  });

  const response = await answered;
  assert.equal(response.status, 404);
  assert.deepEqual(worker.stored(), [], 'a 404 must not poison the offline cache');
});

test('deletes only stale Interview Prep Max caches on activation', async () => {
  // Текущий кеш строится из версии, иначе тест начинает удалять актуальный
  // кеш и «проходит» по неверной причине после каждого релиза.
  const worker = loadServiceWorker(['ipmax-v13.1.0', 'ipmax-v' + RELEASE_VERSION, 'another-app-v4']);

  await dispatchExtendable(worker.handlers.get('activate'));
  assert.deepEqual(worker.deleted, ['ipmax-v13.1.0']);
  assert.equal(worker.wasClaimed(), true);
});

test('serves every release bootstrap file without HTTP caching', async () => {
  const server = createAppServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    // Каждый файл из offline-shell обязан реально отдаваться сервером.
    // publicFiles в server.js — allowlist: забытый там модуль отвечает 403,
    // страница молча теряет скрипт, а атомарный addAll роняет установку SW.
    const shell = fs.readFileSync(path.join(root, 'sw.js'), 'utf8')
      .match(/const SHELL_ASSETS = \[([\s\S]*?)\];/)[1];
    const localScripts = [...shell.matchAll(/'\.\/([\w-]+\.js)'/g)].map(match => '/' + match[1]);
    assert.ok(localScripts.length > 20, 'ожидался полный список shell-скриптов');
    for (const file of ['/version.js', '/sw.js', ...localScripts]) {
      const response = await request(server, file);
      assert.equal(response.status, 200, file + ' должен отдаваться, а не 403');
      assert.equal(response.headers['cache-control'], 'no-cache', file);
    }
    assert.match((await request(server, '/version.js')).body,
      new RegExp("IPMAX_VERSION = '" + RELEASE_VERSION.replace(/\./g, '\\.') + "'"));
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('npm start reads .env without requiring the file to exist', () => {
  // Строгий --env-file роняет запуск, если файла нет: на чистом клоне и в
  // контейнере (где переменные приходят из окружения) .env отсутствует.
  const start = JSON.parse(read('package.json')).scripts.start;
  assert.match(start, /--env-file-if-exists=\.env/, 'ожидался мягкий флаг --env-file-if-exists');
  assert.doesNotMatch(start, /--env-file=/, 'строгий --env-file сломал бы запуск без файла');

  // Оба сценария проверяем реальным запуском, а не только чтением скрипта.
  const missing = spawnSync(process.execPath, ['--env-file-if-exists=.env.missing-probe', '-e', 'process.exit(0)'], { cwd: root, encoding: 'utf8' });
  assert.equal(missing.status, 0, 'отсутствующий .env не должен ронять запуск: ' + missing.stderr);

  const probe = path.join(root, '.env.release-probe');
  fs.writeFileSync(probe, 'IPMAX_ENV_PROBE=loaded-from-file\n', 'utf8');
  try {
    const loaded = spawnSync(process.execPath, ['--env-file-if-exists=.env.release-probe', '-e', 'process.stdout.write(String(process.env.IPMAX_ENV_PROBE))'], { cwd: root, encoding: 'utf8' });
    assert.equal(loaded.stdout, 'loaded-from-file', 'переменные из .env должны попадать в process.env');
  } finally {
    fs.rmSync(probe, { force: true });
  }
});

test('secrets are kept out of git and the image', () => {
  // .env содержит IPMAX_ADMIN_TOKEN и ключ провайдера: он не должен попасть
  // ни в коммит, ни в слои образа. .env.example, наоборот, нужен.
  assert.match(read('.gitignore'), /^\.env$/m);
  const dockerignore = read('.dockerignore');
  assert.match(dockerignore, /^\.env$/m);
  assert.match(dockerignore, /^!\.env\.example$/m, 'шаблон должен оставаться доступным');
});

test('passes the release integrity verifier', () => {
  const result = spawnSync(process.execPath, ['verify-release.js'], { cwd: root, encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.ok(result.stdout.includes('Release ' + RELEASE_VERSION + ' integrity check passed'),
    'верификатор должен подтвердить текущую версию, got: ' + result.stdout);
});
