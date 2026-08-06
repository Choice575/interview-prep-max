const test = require('node:test');
const assert = require('node:assert/strict');

// Как и в coach-ui.test.js: модуль читает голый `document` в момент вызова,
// поэтому глобального стаба достаточно — jsdom в проекте нет.
class FakeElement {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.id = '';
    this.value = '';
    this.style = {};
    this.innerHTML = '';
    this.textContent = '';
    this.disabled = false;
    this.dataset = {};
    this.focused = false;
  }
  focus() { this.focused = true; }
}

class FakeDocument {
  constructor(ids) {
    this.elements = new Map();
    (ids || []).forEach(id => {
      const element = new FakeElement('div');
      element.id = id;
      this.elements.set(id, element);
    });
    this.listeners = [];
  }
  getElementById(id) { return this.elements.get(id) || null; }
  addEventListener(name, listener) { this.listeners.push([name, listener]); }
  createElement(tagName) { return new FakeElement(tagName); }
}

function loadUI() {
  delete require.cache[require.resolve('./ai-settings-ui.js')];
  return require('./ai-settings-ui.js');
}

const SETTINGS = {
  provider: 'openai-compatible',
  baseUrl: 'https://anymodel.org/v1',
  model: 'cc/claude-opus-5',
  hasKey: true,
  temperature: 0.2,
  maxTokens: 700,
  timeoutMs: 45000,
  updatedAt: 1000
};

function setup(clientOverrides, serviceOverrides) {
  const ui = loadUI();
  const document = new FakeDocument(['ai-settings-content', 'ai-settings-modal']);
  global.document = document;
  const calls = { written: [], reset: 0, refreshed: 0 };
  const state = { token: '' };
  const client = Object.assign({
    adminStatus: async () => ({ enabled: true, reachable: true }),
    read: async () => SETTINGS,
    write: async payload => { calls.written.push(payload); return { ...SETTINGS, ...payload, hasKey: true }; },
    reset: async () => { calls.reset += 1; return { ...SETTINGS, provider: '', hasKey: false }; },
    token: () => state.token,
    setToken: value => { state.token = value; return true; },
    configured: () => !!state.token
  }, clientOverrides || {});
  const services = Object.assign({
    client,
    escape: value => String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    openModal: () => {},
    closeModal: () => {},
    refresh: () => { calls.refreshed += 1; },
    confirm: () => true
  }, serviceOverrides || {});
  ui.configure(services);
  return { ui, document, client, services, calls, state, content: document.getElementById('ai-settings-content') };
}

function fire(document, action) {
  const trigger = new FakeElement('button');
  trigger.dataset.aiSettingsAction = action;
  const handler = document.listeners.find(([name]) => name === 'click')[1];
  handler({ target: { closest: () => trigger } });
}

function putField(document, id, value) {
  const node = new FakeElement('input');
  node.id = id;
  node.value = value;
  document.elements.set(id, node);
  return node;
}

test.afterEach(() => { delete global.document; });

test('the API key is never rendered into markup', () => {
  // Сервер ключ не отдаёт, но поле не должно и подставлять ничего похожего.
  const { ui, content } = setup();
  ui.render({ adminEnabled: true, authorised: true, settings: { ...SETTINGS, apiKey: 'sk-should-never-appear' } });
  assert.ok(!content.innerHTML.includes('sk-should-never-appear'));
  assert.match(content.innerHTML, /type="password"/);
});

test('a stored key is signalled without revealing it', () => {
  const { ui, content } = setup();
  ui.render({ adminEnabled: true, authorised: true, settings: SETTINGS });
  assert.match(content.innerHTML, /Ключ сохранён/);
  assert.match(content.innerHTML, /data-ai-settings-action="clear-key"/);
});

test('no key stored means the field invites one', () => {
  const { ui, content } = setup();
  ui.render({ adminEnabled: true, authorised: true, settings: { ...SETTINGS, hasKey: false } });
  assert.match(content.innerHTML, /Вставьте ключ провайдера/);
  assert.doesNotMatch(content.innerHTML, /clear-key/);
});

test('a disabled admin token is distinguished from a wrong one', async () => {
  const { ui, content } = setup({ adminStatus: async () => ({ enabled: false, reachable: true }) });
  ui.open();
  await new Promise(resolve => setImmediate(resolve));
  assert.match(content.innerHTML, /IPMAX_ADMIN_TOKEN/);
  // Форма не должна показываться: настраивать нечего.
  assert.doesNotMatch(content.innerHTML, /data-ai-settings-action="save"/);
});

test('provider fields are hidden unless openai-compatible is selected', () => {
  const { ui, content } = setup();
  ui.render({ adminEnabled: true, authorised: true, settings: { ...SETTINGS, provider: 'mock' }, provider: 'mock' });
  assert.match(content.innerHTML, /id="ai-settings-provider-fields" style="display:none"/);
  ui.render({ adminEnabled: true, authorised: true, settings: SETTINGS, provider: 'openai-compatible' });
  assert.doesNotMatch(content.innerHTML, /provider-fields" style="display:none"/);
});

test('an empty admin token is refused before any request', () => {
  const { ui, document, content, client } = setup();
  ui.render({ adminEnabled: true });
  putField(document, 'ai-settings-token', '   ');
  fire(document, 'load');
  assert.match(content.innerHTML, /Введите токен администратора/);
  assert.equal(client.configured(), false);
});

test('saving collects the form and reports success', async () => {
  const { ui, document, content, calls } = setup();
  ui.render({ adminEnabled: true, authorised: true, settings: SETTINGS });
  putField(document, 'ai-settings-provider', 'openai-compatible');
  putField(document, 'ai-settings-base-url', 'https://provider.example/v1');
  putField(document, 'ai-settings-model', 'gpt-5.6-sol');
  putField(document, 'ai-settings-api-key', '');
  putField(document, 'ai-settings-temperature', '0.4');
  putField(document, 'ai-settings-max-tokens', '1200');
  putField(document, 'ai-settings-timeout', '30000');

  fire(document, 'save');
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(calls.written.length, 1);
  assert.equal(calls.written[0].model, 'gpt-5.6-sol');
  assert.equal(calls.written[0].apiKey, '', 'пустое поле означает «не менять»');
  assert.match(content.innerHTML, /Настройки сохранены и применены/);
  assert.equal(calls.refreshed, 1, 'статус AI изменился — карточку тренера надо перерисовать');
});

test('a validation error from the server is shown as-is', async () => {
  const { ui, document, content, calls } = setup({
    write: async () => {
      const error = new Error('Нужен https:// — иначе ключ уйдёт открытым текстом.');
      error.status = 400;
      throw error;
    }
  });
  ui.render({ adminEnabled: true, authorised: true, settings: SETTINGS });
  putField(document, 'ai-settings-provider', 'openai-compatible');
  fire(document, 'save');
  await new Promise(resolve => setImmediate(resolve));

  assert.match(content.innerHTML, /Нужен https/);
  assert.match(content.innerHTML, /sync-message-error/);
  assert.equal(calls.refreshed, 0, 'при ошибке перерисовывать нечего');
});

test('an expired token drops back to the unauthorised state', async () => {
  // Иначе форма показывала бы пустые поля как настоящие настройки.
  const { ui, content, client, state } = setup({
    read: async () => {
      const error = new Error('Неверный токен администратора.');
      error.status = 401;
      throw error;
    }
  });
  state.token = 'stale-token-value-0000000000001';
  ui.open();
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(client.configured(), false, 'недействительный токен должен быть сброшен');
  assert.match(content.innerHTML, /Неверный токен администратора/);
  assert.doesNotMatch(content.innerHTML, /data-ai-settings-action="save"/);
});

test('reset asks for confirmation and refreshes on success', async () => {
  const { ui, document, calls, content } = setup();
  ui.render({ adminEnabled: true, authorised: true, settings: SETTINGS });
  fire(document, 'reset');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.reset, 1);
  assert.match(content.innerHTML, /Настройки сброшены/);
  assert.equal(calls.refreshed, 1);
});

test('declining the reset confirmation changes nothing', async () => {
  const { ui, document, calls } = setup({}, { confirm: () => false });
  ui.render({ adminEnabled: true, authorised: true, settings: SETTINGS });
  fire(document, 'reset');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.reset, 0);
});

test('clearing the key sends clearKey and disables the provider', async () => {
  const { ui, document, calls } = setup();
  ui.render({ adminEnabled: true, authorised: true, settings: SETTINGS });
  putField(document, 'ai-settings-provider', 'openai-compatible');
  fire(document, 'clear-key');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.written.length, 1);
  assert.equal(calls.written[0].clearKey, true);
  assert.equal(calls.written[0].provider, '', 'без ключа openai-compatible невалиден');
});

test('forgetting the admin token keeps it when declined', () => {
  const { ui, document, client, state } = setup({}, { confirm: () => false });
  state.token = 'admin-token-value-00000000000001';
  ui.render({ adminEnabled: true, authorised: true, settings: SETTINGS });
  fire(document, 'forget-token');
  assert.equal(client.configured(), true);
});

test('settings values are escaped before rendering', () => {
  const { ui, content } = setup();
  ui.render({ adminEnabled: true, authorised: true, settings: { ...SETTINGS, model: '"><img src=x onerror=alert(1)>' } });
  assert.doesNotMatch(content.innerHTML, /<img/);
  assert.match(content.innerHTML, /&quot;&gt;&lt;img/);
});

test('collect returns empty strings rather than undefined for missing fields', () => {
  const { ui } = setup();
  const collected = ui.collect();
  assert.equal(collected.provider, '');
  assert.equal(collected.model, '');
});

test('configure refuses to bind without a client', () => {
  const ui = loadUI();
  global.document = new FakeDocument(['ai-settings-content']);
  assert.equal(ui.configure({}), false);
  assert.equal(ui.configure(null), false);
});
