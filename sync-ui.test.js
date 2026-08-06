const test = require('node:test');
const assert = require('node:assert/strict');
const Merge = require('./sync-merge.js');

// sync-ui.js читает голый `document` в момент вызова, поэтому глобального
// стаба достаточно — jsdom в проекте нет.
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

function loadSyncUI() {
  // Свежий модуль на каждый тест: services/bound/syncing — на уровне модуля.
  delete require.cache[require.resolve('./sync-ui.js')];
  return require('./sync-ui.js');
}

function fakeClient(overrides) {
  const state = { token: '', lastSync: null };
  return Object.assign({
    configured: () => !!state.token,
    token: () => state.token,
    setToken: value => { state.token = value; return true; },
    lastSyncAt: () => state.lastSync,
    status: async () => ({ enabled: true, reachable: true, hasSnapshot: false, revision: 0 }),
    sync: async () => ({ applied: 0, revision: 1, conflicts: [] }),
    _state: state
  }, overrides || {});
}

function setup(clientOverrides, serviceOverrides) {
  const ui = loadSyncUI();
  const document = new FakeDocument(['sync-content', 'sync-modal']);
  global.document = document;
  const opened = [];
  const closed = [];
  const refreshed = [];
  const client = fakeClient(clientOverrides);
  const services = Object.assign({
    client,
    escape: value => String(value === undefined || value === null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    openModal: (id, focus) => opened.push([id, focus]),
    closeModal: id => closed.push(id),
    refresh: () => refreshed.push(true),
    now: () => 1000000,
    alert: () => {},
    confirm: () => true
  }, serviceOverrides || {});
  ui.configure(services);
  return { ui, document, client, services, opened, closed, refreshed, content: document.getElementById('sync-content') };
}

test.afterEach(() => { delete global.document; });

test('every conflict-prone key has a human readable label', () => {
  const ui = loadSyncUI();
  const lastWriteWins = Object.entries(Merge.MERGE_RULES)
    .filter(([, rule]) => rule === 'lastWriteWins')
    .map(([key]) => key);
  const missing = lastWriteWins.filter(key => !ui.CONFLICT_LABELS[key]);
  assert.deepEqual(missing, [], 'иначе пользователь увидит сырое имя ключа');
});

test('an unknown conflict key falls back to its raw name instead of throwing', () => {
  const ui = loadSyncUI();
  assert.equal(ui.conflictLabel('some_future_key'), 'some_future_key');
});

test('the token is never written into markup', () => {
  // Секрет в innerHTML попал бы в DOM и в любой скриншот страницы.
  const { ui, content, client } = setup();
  client.setToken('super-secret-token-value-000000');
  ui.render({});
  assert.ok(!content.innerHTML.includes('super-secret-token-value-000000'));
  assert.match(content.innerHTML, /type="password"/);
});

test('the sync button is disabled until a token is stored', () => {
  const { ui, content, client } = setup();
  ui.render({});
  assert.match(content.innerHTML, /data-sync-action="run" disabled/);
  client.setToken('token-value-long-enough-for-ui00');
  ui.render({});
  assert.doesNotMatch(content.innerHTML, /data-sync-action="run" disabled/);
});

test('a short token is rejected before any request is sent', () => {
  const { ui, document, content, client } = setup();
  ui.render({});
  const input = new FakeElement('input');
  input.id = 'sync-token-input';
  input.value = 'too-short';
  document.elements.set('sync-token-input', input);

  const trigger = new FakeElement('button');
  trigger.dataset.syncAction = 'save-token';
  const handler = document.listeners.find(([name]) => name === 'click')[1];
  handler({ target: { closest: () => trigger } });

  assert.match(content.innerHTML, /минимум 24 символа/);
  assert.equal(client.configured(), false, 'короткий токен не должен сохраняться');
});

test('saving a valid token stores it', () => {
  const { ui, document, client } = setup();
  ui.render({});
  const input = new FakeElement('input');
  input.id = 'sync-token-input';
  input.value = '  token-value-long-enough-for-ui00  ';
  document.elements.set('sync-token-input', input);

  const trigger = new FakeElement('button');
  trigger.dataset.syncAction = 'save-token';
  const handler = document.listeners.find(([name]) => name === 'click')[1];
  handler({ target: { closest: () => trigger } });

  assert.equal(client.token(), 'token-value-long-enough-for-ui00', 'токен должен сохраняться без пробелов');
});

test('conflicts are described in plain language, not as key names', () => {
  const { ui, content } = setup();
  ui.render({ conflicts: ['study_position', 'theme'] });
  assert.match(content.innerHTML, /позиция в программе DevOps/);
  assert.match(content.innerHTML, /тема оформления/);
  assert.doesNotMatch(content.innerHTML, /study_position/);
  // Пользователю важно знать, что прогресс при конфликте не пострадал.
  assert.match(content.innerHTML, /Прогресс и ответы при этом не терялись/);
});

test('no conflict block is rendered when there are none', () => {
  const { ui, content } = setup();
  ui.render({ conflicts: [] });
  assert.doesNotMatch(content.innerHTML, /sync-conflicts/);
});

test('conflict labels are escaped', () => {
  const ui = loadSyncUI();
  const html = ui.describeConflicts(['<img src=x onerror=alert(1)>']);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
});

test('a successful sync reports how much changed and refreshes the page', async () => {
  const { ui, document, content, client, refreshed } = setup({
    sync: async () => ({ applied: 3, revision: 5, conflicts: [] })
  });
  client.setToken('token-value-long-enough-for-ui00');
  ui.render({});
  const trigger = new FakeElement('button');
  trigger.dataset.syncAction = 'run';
  const handler = document.listeners.find(([name]) => name === 'click')[1];
  handler({ target: { closest: () => trigger } });
  await new Promise(resolve => setImmediate(resolve));

  assert.match(content.innerHTML, /Обновлено разделов: 3/);
  assert.equal(refreshed.length, 1, 'после применения снимка страницу нужно перерисовать');
});

test('a sync error is shown without wiping the panel', async () => {
  const { ui, document, content, client, refreshed } = setup({
    sync: async () => { throw new Error('Неверный токен синхронизации.'); }
  });
  client.setToken('token-value-long-enough-for-ui00');
  ui.render({});
  const trigger = new FakeElement('button');
  trigger.dataset.syncAction = 'run';
  const handler = document.listeners.find(([name]) => name === 'click')[1];
  handler({ target: { closest: () => trigger } });
  await new Promise(resolve => setImmediate(resolve));

  assert.match(content.innerHTML, /Неверный токен синхронизации/);
  assert.match(content.innerHTML, /sync-message-error/);
  assert.equal(refreshed.length, 0, 'при ошибке перерисовывать страницу незачем');
});

test('an unreachable backend is reported as such', () => {
  const { ui, content } = setup();
  ui.render({ status: { enabled: false, reachable: false } });
  assert.match(content.innerHTML, /недоступен/);
  assert.match(content.innerHTML, /остаётся в браузере/);
});

test('a backend without sync configured is distinguished from an unreachable one', () => {
  const { ui, content } = setup();
  ui.render({ status: { enabled: false, reachable: true } });
  assert.match(content.innerHTML, /не настроена/);
});

test('opening the panel focuses the token field', () => {
  const { ui, opened } = setup();
  ui.open();
  assert.deepEqual(opened[0], ['sync-modal', '#sync-token-input']);
});

test('the close action closes the modal', () => {
  const { ui, document, closed } = setup();
  ui.render({});
  const trigger = new FakeElement('button');
  trigger.dataset.syncAction = 'close';
  const handler = document.listeners.find(([name]) => name === 'click')[1];
  handler({ target: { closest: () => trigger } });
  assert.deepEqual(closed, ['sync-modal']);
});

test('forgetting the token asks for confirmation first', () => {
  const { ui, document, client } = setup({}, { confirm: () => false });
  client.setToken('token-value-long-enough-for-ui00');
  ui.render({});
  const trigger = new FakeElement('button');
  trigger.dataset.syncAction = 'forget-token';
  const handler = document.listeners.find(([name]) => name === 'click')[1];
  handler({ target: { closest: () => trigger } });
  assert.equal(client.configured(), true, 'отказ в подтверждении должен сохранить токен');
});

test('running sync without a token shows a hint instead of failing', async () => {
  const { ui, document, content } = setup({
    sync: async () => { throw new Error('запрос не должен уйти'); }
  });
  ui.render({});
  const trigger = new FakeElement('button');
  trigger.dataset.syncAction = 'run';
  const handler = document.listeners.find(([name]) => name === 'click')[1];
  handler({ target: { closest: () => trigger } });
  await new Promise(resolve => setImmediate(resolve));
  assert.match(content.innerHTML, /Сначала сохраните токен/);
});

test('the last sync moment is formatted for humans', () => {
  const ui = loadSyncUI();
  // Опорное «сейчас» должно быть больше самого старого смещения, иначе метка
  // уходит в отрицательные значения и это уже не «давно», а битые данные.
  const nowStamp = 30 * 24 * 3600 * 1000;
  ui.configure({
    client: fakeClient(), escape: v => String(v), openModal: () => {}, closeModal: () => {},
    now: () => nowStamp
  });
  assert.equal(ui.formatMoment(0), 'ещё не выполнялась');
  assert.equal(ui.formatMoment(nowStamp - 30 * 1000), 'только что');
  assert.equal(ui.formatMoment(nowStamp - 5 * 60 * 1000), '5 мин назад');
  assert.equal(ui.formatMoment(nowStamp - 3 * 3600 * 1000), '3 ч назад');
  assert.equal(ui.formatMoment(nowStamp - 2 * 24 * 3600 * 1000), '2 дн назад');
});

test('an invalid or future timestamp does not render as a negative age', () => {
  const ui = loadSyncUI();
  ui.configure({
    client: fakeClient(), escape: v => String(v), openModal: () => {}, closeModal: () => {},
    now: () => 1000
  });
  assert.equal(ui.formatMoment(-5), 'ещё не выполнялась');
  assert.equal(ui.formatMoment(NaN), 'ещё не выполнялась');
  assert.equal(ui.formatMoment(undefined), 'ещё не выполнялась');
  // Часы устройства могут убежать вперёд — отрицательная разница недопустима.
  assert.equal(ui.formatMoment(999999), 'только что');
});

test('configure refuses to bind without a client', () => {
  const ui = loadSyncUI();
  global.document = new FakeDocument(['sync-content']);
  assert.equal(ui.configure({}), false);
  assert.equal(ui.configure(null), false);
});
