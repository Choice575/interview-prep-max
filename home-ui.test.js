const test = require('node:test');
const assert = require('node:assert/strict');
const HomeUI = require('./home-ui.js');

class FakeElement {
  constructor(tagName, owner) {
    this.tagName = String(tagName).toUpperCase();
    this.owner = owner;
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.style = {};
    this.id = '';
    this.className = '';
    this.textContent = '';
  }

  appendChild(child) {
    this.children.push(child);
    child.parentNode = this;
    this.owner.register(child);
    return child;
  }

  replaceChildren(...children) {
    this.children.forEach(child => this.owner.unregister(child));
    this.children = [];
    children.forEach(child => this.appendChild(child));
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  addEventListener(name, listener) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(listener);
  }
  click() { (this.listeners.get('click') || []).forEach(listener => listener({ target: this })); }

  querySelectorAll(selector) {
    const attribute = selector.match(/^\[([^\]]+)\]$/)?.[1];
    const results = [];
    const visit = element => {
      if (attribute && element.attributes.has(attribute)) results.push(element);
      element.children.forEach(visit);
    };
    this.children.forEach(visit);
    return results;
  }
}

class FakeDocument {
  constructor() {
    this.elements = new Map();
    this.roots = [];
  }

  createElement(tagName) { return new FakeElement(tagName, this); }

  mount(tagName, id, className) {
    const element = this.createElement(tagName);
    element.id = id || '';
    element.className = className || '';
    this.roots.push(element);
    this.register(element);
    return element;
  }

  register(element) {
    if (element.id) this.elements.set(element.id, element);
    element.children.forEach(child => this.register(child));
  }

  unregister(element) {
    if (element.id && this.elements.get(element.id) === element) this.elements.delete(element.id);
    element.children.forEach(child => this.unregister(child));
  }

  getElementById(id) { return this.elements.get(id) || null; }
  querySelector(selector) {
    if (!selector.startsWith('.')) return null;
    const name = selector.slice(1);
    return this.roots.find(element => element.className.split(/\s+/).includes(name)) || null;
  }
}

test('calculates mastery by topic and handles reserved progress keys', () => {
  const progress = Object.create(null);
  progress.a = { correct: 2, wrong: 1 };
  progress.b = { correct: 1, wrong: 1 };
  progress.c = { correct: 0, wrong: 3 };
  const result = HomeUI.calculateMastery([
    { id: 'a', topic: '__proto__' },
    { id: 'b', topic: '__proto__' },
    { id: 'c', topic: 'constructor' }
  ], progress, ['__proto__', 'constructor', 'Нет вопросов']);

  assert.deepEqual(result.map(item => ({ topic: item.topic, total: item.total, mastered: item.mastered, score: item.score })), [
    { topic: '__proto__', total: 2, mastered: 1, score: 50 },
    { topic: 'constructor', total: 1, mastered: 0, score: 0 },
    { topic: 'Нет вопросов', total: 0, mastered: 0, score: 0 }
  ]);
});

test('renders topic names as text and opens the exact selected topic', () => {
  const document = new FakeDocument();
  const target = document.mount('div', 'mastery-cards');
  const selected = [];
  const unsafeTopic = '<img src=x onerror=alert(1)> & "Linux"';
  const ui = HomeUI.create({
    getQuestions: () => [{ id: 1, topic: unsafeTopic }],
    getQuestionProgress: () => ({ 1: { correct: 1, wrong: 0 } }),
    getTopics: () => [unsafeTopic],
    openTopic: topic => selected.push(topic)
  }, { document });

  ui.renderMasteryCards();
  assert.equal(target.children.length, 1);
  assert.equal(target.children[0].children[2].textContent, unsafeTopic);
  assert.equal(target.children[0].getAttribute('data-home-topic'), unsafeTopic);
  target.children[0].click();
  assert.deepEqual(selected, [unsafeTopic]);
});

test('keeps home state fresh and binds quick actions only once', () => {
  const document = new FakeDocument();
  document.mount('div', 'mastery-cards');
  const banner = document.mount('div', 'home-streak-banner');
  const current = document.mount('div', 'home-streak-num');
  const record = document.mount('div', 'home-best-streak');
  const historyTarget = document.mount('div', 'home-history');
  const quickActions = document.mount('div', '', 'quick-actions');
  const mix = document.createElement('button');
  mix.setAttribute('data-home-action', 'startMode');
  mix.setAttribute('data-home-value', 'mix20');
  quickActions.appendChild(mix);

  let streak = 3;
  let best = 8;
  let history = [{ date: '24.07', topic: '<b>Linux</b>', correct: true }];
  let coachRenders = 0;
  let readinessRenders = 0;
  const modes = [];
  let blitzStarts = 0;
  const ui = HomeUI.create({
    get: (key, fallback) => key === 'streak_best' ? best : key === 'history' ? history : fallback,
    getStreak: () => streak,
    getQuestions: () => [], getQuestionProgress: () => ({}), getTopics: () => [],
    renderCoach: () => coachRenders++, renderReadiness: () => readinessRenders++,
    startMode: mode => modes.push(mode), startBlitz: () => blitzStarts++
  }, { document });

  ui.renderHome();
  ui.renderHome();
  assert.equal(banner.style.display, 'flex');
  assert.equal(current.textContent, '3');
  assert.equal(record.textContent, 'Лучшая серия: 8');
  assert.equal(historyTarget.children[0].children[1].textContent, '<b>Linux</b>');
  assert.equal(quickActions.children.length, 5);
  assert.equal(coachRenders, 2);
  assert.equal(readinessRenders, 2);

  mix.click();
  document.getElementById('blitz-btn').click();
  assert.deepEqual(modes, ['mix20']);
  assert.equal(blitzStarts, 1);

  streak = 0;
  best = 0;
  history = [];
  ui.renderHome();
  assert.equal(banner.style.display, 'none');
  assert.equal(historyTarget.children.length, 1);
  assert.equal(historyTarget.children[0].textContent, 'История пуста. Начните экзамен!');
  assert.equal(quickActions.children.length, 5);
});
