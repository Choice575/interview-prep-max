const test = require('node:test');
const assert = require('node:assert/strict');
const ui = require('./daily-ui.js');
const core = require('./daily.js');

const NOW = new Date(2026, 7, 4, 14, 0, 0).getTime();

function buildQuestions(count) {
  const topics = ['Linux', 'Docker', 'Kubernetes', 'Сети', 'Terraform', 'Ansible'];
  const levels = ['Junior', 'Middle', 'Senior'];
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    topic: topics[index % topics.length],
    level: levels[index % levels.length],
    q: 'Вопрос ' + (index + 1),
    options: ['A', 'B', 'C', 'D'],
    answer: 0
  }));
}

const SET = core.selectQuestions({ questions: buildQuestions(60), now: NOW });

test('compositionLabel describes the level mix', () => {
  assert.equal(ui.compositionLabel(['Junior', 'Middle', 'Middle', 'Senior', 'Senior']), '1 Junior · 2 Middle · 2 Senior');
  assert.equal(ui.compositionLabel([]), '');
});

test('blitz card offers a start button before the first answer', () => {
  const state = core.stateForDay(null, NOW);
  const html = ui.renderBlitzCard({ state, set: SET, secondsUntilReset: core.secondsUntilReset(NOW) });
  assert.match(html, /data-daily-action="start"/);
  assert.match(html, /Начать ежедневный блиц/);
  assert.match(html, /1 Junior · 2 Middle · 2 Senior/);
});

test('blitz card switches to resume once answers exist', () => {
  let state = core.stateForDay(null, NOW);
  state = core.recordAnswer(state, { correct: true }, NOW);
  state = core.recordAnswer(state, { correct: false }, NOW);
  const html = ui.renderBlitzCard({ state, set: SET, secondsUntilReset: core.secondsUntilReset(NOW) });
  assert.match(html, /Продолжить блиц \(2\/5\)/);
  assert.match(html, /width:40%/);
  assert.match(html, /Прогресс: 2\/5/);
});

test('blitz card reports the result and offers a review when the day is closed', () => {
  let state = core.stateForDay(null, NOW);
  state = core.recordAnswer(state, { correct: true }, NOW);
  state = core.completeDay(state, NOW);
  const html = ui.renderBlitzCard({ state, set: SET, secondsUntilReset: core.secondsUntilReset(NOW) });
  assert.match(html, /Блиц пройден: 1 из 5/);
  assert.match(html, /data-daily-action="review"/);
  assert.doesNotMatch(html, /data-daily-action="start"/);
});

test('blitz card shows the daily streak with the right plural form', () => {
  const one = core.completeDay(core.stateForDay(null, NOW), NOW);
  assert.match(ui.renderBlitzCard({ state: one, set: SET }), /🔥 1<\/span><span class="daily-streak-lbl">день/);
  const many = { ...one, streak: 5 };
  assert.match(ui.renderBlitzCard({ state: many, set: SET }), /🔥 5<\/span><span class="daily-streak-lbl">дней/);
});

test('blitz card lists the topics of the day as numbered chips', () => {
  const html = ui.renderBlitzCard({ state: core.stateForDay(null, NOW), set: SET });
  const chips = html.match(/class="daily-topic"/g) || [];
  assert.equal(chips.length, SET.topics.length);
  assert.match(html, /#1/);
});

test('blitz card explains an empty pool instead of offering a broken start', () => {
  const html = ui.renderBlitzCard({ state: core.stateForDay(null, NOW), set: { questions: [], topics: [] } });
  assert.match(html, /daily-empty/);
  assert.doesNotMatch(html, /data-daily-action="start"/);
});

test('blitz card renders the countdown to the next reset', () => {
  const state = core.stateForDay(null, NOW);
  const html = ui.renderBlitzCard({ state, set: SET, secondsUntilReset: core.secondsUntilReset(NOW) });
  assert.match(html, /Сброс через 10:00:00/);
});

test('blitz card tolerates a completely empty input', () => {
  const html = ui.renderBlitzCard();
  assert.match(html, /Ежедневный блиц/);
  assert.doesNotMatch(html, /undefined/);
  assert.doesNotMatch(html, /NaN/);
});

test('skill card renders the rule, the reason and the action', () => {
  const html = ui.renderSkillCard({
    topic: 'Docker', icon: '🐳', slug: 'docker', title: 'Мультистадийная сборка',
    why: 'Уменьшает образ', action: 'Разделите build и runtime', position: 3, total: 66
  });
  assert.match(html, /Навык дня · Docker/);
  assert.match(html, /Мультистадийная сборка/);
  assert.match(html, /Уменьшает образ/);
  assert.match(html, /Разделите build и runtime/);
  assert.match(html, /3 из 66/);
  assert.match(html, /data-daily-slug="docker"/);
});

test('skill card renders nothing without a skill', () => {
  assert.equal(ui.renderSkillCard(null), '');
  assert.equal(ui.renderSkillCard(undefined), '');
});

test('skill card omits optional blocks it has no data for', () => {
  const html = ui.renderSkillCard({ title: 'Только заголовок', position: 1, total: 1 });
  assert.doesNotMatch(html, /skill-why/);
  assert.doesNotMatch(html, /Что делать/);
  assert.match(html, /Только заголовок/);
});

test('skill card escapes hostile content', () => {
  const html = ui.renderSkillCard({ title: '<script>alert(1)</script>', why: '<img src=x>', action: '"onload="x', topic: '<b>' });
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;script&gt;/);
});

test('create renders both cards and wires the actions', () => {
  const calls = [];
  const makeNode = () => ({
    innerHTML: '',
    handlers: [],
    querySelectorAll() {
      const actions = [...String(this.innerHTML).matchAll(/data-daily-action="([a-z]+)"/g)];
      return actions.map(match => ({
        getAttribute: name => (name === 'data-daily-action' ? match[1] : 'docker'),
        addEventListener: (event, handler) => this.handlers.push({ action: match[1], handler })
      }));
    }
  });
  const nodes = { 'daily-blitz-card': makeNode(), 'daily-skill-card': makeNode() };
  const instance = ui.create({
    now: () => NOW,
    getQuestions: () => buildQuestions(60),
    getTopics: () => ['Linux', 'Docker', 'Kubernetes'],
    getState: () => null,
    getBestPractices: () => ({ topics: [{ topic: 'Docker', slug: 'docker', practices: [{ title: 'Правило', why: 'w', action: 'a' }] }] }),
    startBlitz: () => calls.push('startBlitz'),
    reviewMistakes: () => calls.push('review'),
    openPractices: slug => calls.push('practices:' + slug)
  }, { document: { getElementById: id => nodes[id] || null } });

  instance.render();
  assert.match(nodes['daily-blitz-card'].innerHTML, /Ежедневный блиц/);
  assert.match(nodes['daily-skill-card'].innerHTML, /Навык дня/);

  nodes['daily-blitz-card'].handlers.find(entry => entry.action === 'start').handler();
  nodes['daily-skill-card'].handlers.find(entry => entry.action === 'practices').handler();
  assert.deepEqual(calls, ['startBlitz', 'practices:docker']);
});

test('create returns the selected set so the caller can start the same questions', () => {
  const node = { innerHTML: '', querySelectorAll: () => [] };
  const instance = ui.create({
    now: () => NOW,
    getQuestions: () => buildQuestions(60),
    getState: () => null
  }, { document: { getElementById: id => (id === 'daily-blitz-card' ? node : null) } });
  const result = instance.renderBlitz();
  assert.equal(result.set.questions.length, core.BLITZ_SIZE);
  assert.equal(result.state.dateKey, core.dateKey(NOW));
});

test('create tolerates missing host elements', () => {
  const instance = ui.create({ getQuestions: () => [] }, { document: { getElementById: () => null } });
  assert.equal(instance.renderBlitz(), null);
  assert.equal(instance.renderSkill(), null);
});
