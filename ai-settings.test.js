const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createAiSettingsStore, publicView, normaliseInput, validateBaseUrl } = require('./server/ai-settings.js');
const { safeEqual, extractBearer, requireBearer } = require('./server/auth.js');

const SECRET = 'sk-super-secret-provider-key-0001';

async function withStore(run, env) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ipmax-aiset-'));
  try {
    await run(createAiSettingsStore({ IPMAX_AI_SETTINGS_DIR: dir, ...(env || {}) }), dir);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

function validSettings(overrides) {
  return {
    provider: 'openai-compatible',
    baseUrl: 'https://anymodel.org/v1',
    model: 'cc/claude-opus-5',
    apiKey: SECRET,
    temperature: 0.2,
    maxTokens: 700,
    timeoutMs: 45000,
    ...(overrides || {})
  };
}

test('the API key is never returned to the client', async () => {
  await withStore(async store => {
    const saved = await store.write(validSettings());
    assert.equal(saved.hasKey, true);
    assert.ok(!JSON.stringify(saved).includes(SECRET), 'ключ не должен уходить наружу');
    const read = await store.read();
    assert.ok(!JSON.stringify(read).includes(SECRET));
    assert.equal(read.apiKey, undefined);
  });
});

test('the resolved config keeps the key for server-side use only', async () => {
  await withStore(async store => {
    await store.write(validSettings());
    const resolved = await store.resolve();
    assert.equal(resolved.apiKey, SECRET, 'сервису ключ нужен, иначе запрос к провайдеру не уйдёт');
  });
});

test('the settings file is written with owner-only permissions', async () => {
  if (process.platform === 'win32') return; // на Windows POSIX-режимы не применяются
  await withStore(async (store, dir) => {
    await store.write(validSettings());
    const mode = fs.statSync(path.join(dir, 'ai-settings.json')).mode & 0o777;
    assert.equal(mode, 0o600, 'файл с API-ключом не должен быть читаем другими пользователями');
  });
});

test('http is rejected for remote providers but allowed for localhost', () => {
  assert.throws(() => validateBaseUrl('http://provider.example/v1'), /https/);
  assert.equal(validateBaseUrl('http://localhost:11434/v1'), 'http://localhost:11434/v1');
  assert.equal(validateBaseUrl('http://127.0.0.1:8080/v1'), 'http://127.0.0.1:8080/v1');
  assert.equal(validateBaseUrl('https://anymodel.org/v1/'), 'https://anymodel.org/v1', 'хвостовой слеш нормализуется');
});

test('a malformed url is rejected', () => {
  assert.throws(() => validateBaseUrl('not a url'), /не похож на URL/);
});

test('openai-compatible requires url, model and key', () => {
  assert.throws(() => normaliseInput({ provider: 'openai-compatible' }, null), /адрес провайдера/i);
  assert.throws(() => normaliseInput({ provider: 'openai-compatible', baseUrl: 'https://x/v1' }, null), /модель/i);
  assert.throws(() => normaliseInput({ provider: 'openai-compatible', baseUrl: 'https://x/v1', model: 'm' }, null), /ключ/i);
});

test('mock provider needs no credentials', () => {
  const result = normaliseInput({ provider: 'mock' }, null);
  assert.equal(result.provider, 'mock');
  assert.equal(result.apiKey, '');
});

test('an unknown provider is rejected', () => {
  assert.throws(() => normaliseInput({ provider: 'anthropic-native' }, null), /провайдер/i);
});

test('saving without a key keeps the stored one', async () => {
  // UI не получает ключ обратно, поэтому смена модели не должна его стирать.
  await withStore(async store => {
    await store.write(validSettings());
    const updated = await store.write(validSettings({ apiKey: '', model: 'cx/gpt-5.6-sol' }));
    assert.equal(updated.hasKey, true);
    assert.equal(updated.model, 'cx/gpt-5.6-sol');
    const resolved = await store.resolve();
    assert.equal(resolved.apiKey, SECRET);
  });
});

test('clearKey removes the stored key explicitly', async () => {
  await withStore(async store => {
    await store.write(validSettings());
    // Без ключа openai-compatible невалиден, поэтому сбрасываем и провайдера.
    const cleared = await store.write({ provider: 'mock', clearKey: true });
    assert.equal(cleared.hasKey, false);
  });
});

test('numeric fields are clamped to safe ranges', async () => {
  await withStore(async store => {
    const saved = await store.write(validSettings({ temperature: 99, maxTokens: 999999, timeoutMs: 10 }));
    assert.equal(saved.temperature, 2);
    assert.equal(saved.maxTokens, 8000);
    assert.equal(saved.timeoutMs, 1000);
    const low = await store.write(validSettings({ temperature: -5, maxTokens: 1, timeoutMs: 10 ** 9 }));
    assert.equal(low.temperature, 0);
    assert.equal(low.maxTokens, 200);
    assert.equal(low.timeoutMs, 60000);
  });
});

test('non-numeric and empty values fall back to defaults instead of NaN or zero', async () => {
  // Number(null) === 0 проходит проверку на конечность и зажимается до
  // минимума: пустое поле формы молча давало бы maxTokens=200 и обрезанные
  // ответы модели вместо дефолтных 700.
  await withStore(async store => {
    const saved = await store.write(validSettings({ temperature: 'hot', maxTokens: null, timeoutMs: 'soon' }));
    assert.equal(saved.temperature, 0.2);
    assert.equal(saved.maxTokens, 700);
    assert.equal(saved.timeoutMs, 15000);

    const empty = await store.write(validSettings({ temperature: '', maxTokens: '', timeoutMs: '' }));
    assert.equal(empty.temperature, 0.2);
    assert.equal(empty.maxTokens, 700);
    assert.equal(empty.timeoutMs, 15000);
  });
});

test('an explicit zero temperature is preserved, not treated as unset', async () => {
  // temperature: 0 — законное значение (детерминированный вывод), и подменять
  // его дефолтом нельзя.
  await withStore(async store => {
    const saved = await store.write(validSettings({ temperature: 0 }));
    assert.equal(saved.temperature, 0);
  });
});

test('environment variables act as defaults before anything is saved', async () => {
  await withStore(async store => {
    const view = await store.read();
    assert.equal(view.provider, 'openai-compatible');
    assert.equal(view.model, 'env-model');
    assert.equal(view.hasKey, true, 'ключ из окружения должен учитываться');
    assert.ok(!JSON.stringify(view).includes('env-secret-key'));
  }, { IPMAX_AI_PROVIDER: 'openai-compatible', IPMAX_AI_BASE_URL: 'https://env.example/v1', IPMAX_AI_MODEL: 'env-model', IPMAX_AI_API_KEY: 'env-secret-key' });
});

test('saved settings win over the environment', async () => {
  await withStore(async store => {
    await store.write(validSettings({ model: 'ui-model' }));
    const resolved = await store.resolve();
    assert.equal(resolved.model, 'ui-model');
    assert.equal(resolved.apiKey, SECRET, 'ключ из UI, а не из окружения');
  }, { IPMAX_AI_PROVIDER: 'openai-compatible', IPMAX_AI_BASE_URL: 'https://env.example/v1', IPMAX_AI_MODEL: 'env-model', IPMAX_AI_API_KEY: 'env-secret-key' });
});

test('clear falls back to the environment rather than leaving nothing', async () => {
  await withStore(async store => {
    await store.write(validSettings({ model: 'ui-model' }));
    const cleared = await store.clear();
    assert.equal(cleared.model, 'env-model');
  }, { IPMAX_AI_PROVIDER: 'openai-compatible', IPMAX_AI_BASE_URL: 'https://env.example/v1', IPMAX_AI_MODEL: 'env-model', IPMAX_AI_API_KEY: 'env-secret-key' });
});

test('a corrupt settings file falls back to the environment instead of throwing', async () => {
  await withStore(async (store, dir) => {
    await fsp.writeFile(path.join(dir, 'ai-settings.json'), '{"provider":', 'utf8');
    const view = await store.read();
    assert.equal(view.provider, 'mock');
    assert.equal(store.readSync().provider, 'mock');
  }, { IPMAX_AI_PROVIDER: 'mock' });
});

test('no temporary files are left behind', async () => {
  await withStore(async (store, dir) => {
    await store.write(validSettings());
    await store.write(validSettings({ model: 'second' }));
    assert.deepEqual((await fsp.readdir(dir)).filter(name => name.includes('.tmp')), []);
  });
});

test('a non-object payload is rejected', () => {
  for (const bad of [null, 'text', [], 42]) {
    assert.throws(() => normaliseInput(bad, null), /JSON-объектом/);
  }
});

test('overlong fields are truncated rather than stored whole', () => {
  const result = normaliseInput({ provider: 'mock', model: 'x'.repeat(5000) }, null);
  assert.ok(result.model.length <= 400);
});

test('publicView tolerates missing input', () => {
  const view = publicView(null);
  assert.equal(view.provider, '');
  assert.equal(view.hasKey, false);
  assert.equal(view.temperature, 0.2);
});

test('bearer parsing accepts the RFC-7235 case variants only', () => {
  assert.equal(extractBearer('Bearer abc'), 'abc');
  assert.equal(extractBearer('bearer abc'), 'abc');
  assert.equal(extractBearer('BEARER abc'), 'abc');
  assert.equal(extractBearer('Basic abc'), '');
  assert.equal(extractBearer(''), '');
  assert.equal(extractBearer(undefined), '');
});

test('token comparison is length-safe', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('short', 'a-much-longer-token-value'), false);
});

test('requireBearer separates "not configured" from "unauthorized"', () => {
  assert.throws(() => requireBearer('Bearer x', '', 'ADMIN_NOT_CONFIGURED'), error => error.status === 503 && error.code === 'ADMIN_NOT_CONFIGURED');
  assert.throws(() => requireBearer('Bearer wrong', 'right'), error => error.status === 401 && error.code === 'UNAUTHORIZED');
  assert.throws(() => requireBearer('', 'right'), error => error.status === 401);
  assert.equal(requireBearer('Bearer right', 'right'), true);
});
