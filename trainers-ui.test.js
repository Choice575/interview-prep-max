const test = require('node:test');
const assert = require('node:assert/strict');
const ui = require('./trainers-ui.js');

const TOTALS = {
  ts: 12, labs: 15, code: 15, subnet: 10, ports: 50,
  cmd: 40, git: 20, regex: 20, dockerfile: 10, k8s: 10, ansible_pb: 10
};

test('every trainer has a unique page and a declared dataset', () => {
  const pages = ui.TRAINERS.map(item => item.page);
  assert.equal(new Set(pages).size, pages.length);
  ui.TRAINERS.forEach(trainer => {
    assert.ok(trainer.title, 'missing title');
    assert.ok(trainer.skill, trainer.id + ' must say which skill it trains');
    assert.ok(trainer.task, trainer.id + ' must describe the task shape');
    assert.ok(trainer.progressKey, trainer.id + ' must name its progress key');
    assert.ok(trainer.datasetKey, trainer.id + ' must name its dataset');
    assert.ok(ui.GROUPS.includes(trainer.group), trainer.id + ' has an unknown group');
  });
});

test('buildStatus derives totals from the loaded datasets', () => {
  const statuses = ui.buildStatus({ progress: { subnet_prog: { 0: 1, 1: 1 } }, totals: TOTALS });
  const subnet = statuses.find(item => item.id === 'subnet');
  assert.equal(subnet.done, 2);
  assert.equal(subnet.total, 10);
  assert.equal(subnet.percent, 20);
  assert.equal(subnet.started, true);
  assert.equal(subnet.finished, false);
});

test('buildStatus marks a trainer as unavailable when its dataset is missing', () => {
  const statuses = ui.buildStatus({ progress: {}, totals: {} });
  statuses.forEach(item => {
    assert.equal(item.available, false);
    assert.equal(item.percent, 0);
  });
});

test('buildStatus never reports more solved than the dataset holds', () => {
  const progress = { subnet_prog: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [i, 1])) };
  const subnet = ui.buildStatus({ progress, totals: TOTALS }).find(item => item.id === 'subnet');
  assert.equal(subnet.done, 10);
  assert.equal(subnet.percent, 100);
  assert.equal(subnet.finished, true);
});

test('buildStatus tolerates malformed progress', () => {
  const statuses = ui.buildStatus({ progress: { subnet_prog: 'broken', cmd_prog: null }, totals: TOTALS });
  const subnet = statuses.find(item => item.id === 'subnet');
  assert.equal(subnet.done, 0);
  assert.equal(statuses.length, ui.TRAINERS.length);
});

test('buildStatus works with no input at all', () => {
  const statuses = ui.buildStatus();
  assert.equal(statuses.length, ui.TRAINERS.length);
  statuses.forEach(item => assert.equal(item.done, 0));
});

test('summarise counts only trainers that have data', () => {
  const statuses = ui.buildStatus({ progress: { subnet_prog: { 0: 1 } }, totals: { subnet: 10, cmd: 40 } });
  const summary = ui.summarise(statuses);
  assert.equal(summary.trainers, 2);
  assert.equal(summary.total, 50);
  assert.equal(summary.done, 1);
  assert.equal(summary.percent, 2);
});

test('summarise reports 100 percent only when everything is solved', () => {
  const progress = {};
  ui.TRAINERS.forEach(trainer => {
    const total = TOTALS[trainer.datasetKey];
    progress[trainer.progressKey] = Object.fromEntries(Array.from({ length: total }, (_, i) => [i, 1]));
  });
  const summary = ui.summarise(ui.buildStatus({ progress, totals: TOTALS }));
  assert.equal(summary.percent, 100);
  assert.equal(summary.finished, ui.TRAINERS.length);
});

test('suggest prefers the started trainer closest to completion', () => {
  const statuses = ui.buildStatus({
    progress: { subnet_prog: { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1 }, git_prog: { 0: 1 } },
    totals: TOTALS
  });
  assert.equal(ui.suggest(statuses).id, 'subnet');
});

test('suggest falls back to the first untouched trainer', () => {
  const statuses = ui.buildStatus({ progress: {}, totals: TOTALS });
  const next = ui.suggest(statuses);
  assert.ok(next);
  assert.equal(next.started, false);
});

test('suggest skips finished trainers and returns null when all are done', () => {
  const progress = {};
  ui.TRAINERS.forEach(trainer => {
    const total = TOTALS[trainer.datasetKey];
    progress[trainer.progressKey] = Object.fromEntries(Array.from({ length: total }, (_, i) => [i, 1]));
  });
  assert.equal(ui.suggest(ui.buildStatus({ progress, totals: TOTALS })), null);
});

test('card states differ for new, started and finished trainers', () => {
  const fresh = ui.renderCard({ id: 'a', page: 'subnet', title: 'T', skill: 's', task: 't', icon: '🌐', available: true, done: 0, total: 10, percent: 0 });
  const started = ui.renderCard({ id: 'a', page: 'subnet', title: 'T', skill: 's', task: 't', icon: '🌐', available: true, done: 3, total: 10, percent: 30, started: true });
  const finished = ui.renderCard({ id: 'a', page: 'subnet', title: 'T', skill: 's', task: 't', icon: '🌐', available: true, done: 10, total: 10, percent: 100, started: true, finished: true });
  assert.match(fresh, /tr-new/);
  assert.match(fresh, /не начат/);
  assert.match(started, /tr-active/);
  assert.match(started, /3 из 10/);
  assert.match(finished, /tr-done/);
  assert.match(finished, /пройден/);
});

test('card is disabled when the dataset is unavailable', () => {
  const html = ui.renderCard({ id: 'a', page: 'subnet', title: 'T', skill: 's', task: 't', available: false, done: 0, total: 0, percent: 0 });
  assert.match(html, /disabled/);
  assert.match(html, /aria-disabled="true"/);
  assert.match(html, /нет данных/);
});

test('card shows the skill and the task shape, not just a bare name', () => {
  const html = ui.renderCard(ui.buildStatus({ progress: {}, totals: TOTALS }).find(item => item.id === 'subnet'));
  assert.match(html, /CIDR/);
  assert.match(html, /посчитать сеть/);
});

test('card escapes hostile content', () => {
  const html = ui.renderCard({ title: '<script>alert(1)</script>', skill: '<img src=x>', task: '"onload="x', icon: '<b>', page: 'subnet', available: true, total: 1, done: 0, percent: 0 });
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;script&gt;/);
});

test('hub renders every group and every trainer card', () => {
  const html = ui.renderHub(ui.buildStatus({ progress: {}, totals: TOTALS }));
  ui.GROUPS.forEach(group => assert.ok(html.includes(group), 'missing group ' + group));
  const cards = html.match(/data-trainer-page="/g) || [];
  // One extra link comes from the "continue here" shortcut.
  assert.equal(cards.length, ui.TRAINERS.length + 1);
});

test('hub shows the overall score and the continue shortcut', () => {
  const html = ui.renderHub(ui.buildStatus({ progress: { subnet_prog: { 0: 1 } }, totals: TOTALS }));
  assert.match(html, /tr-summary-score/);
  assert.match(html, /Продолжить здесь/);
  assert.match(html, /из 212 заданий/);
});

test('hub congratulates instead of suggesting when everything is done', () => {
  const progress = {};
  ui.TRAINERS.forEach(trainer => {
    const total = TOTALS[trainer.datasetKey];
    progress[trainer.progressKey] = Object.fromEntries(Array.from({ length: total }, (_, i) => [i, 1]));
  });
  const html = ui.renderHub(ui.buildStatus({ progress, totals: TOTALS }));
  assert.match(html, /Все тренажёры пройдены/);
  assert.doesNotMatch(html, /Продолжить здесь/);
});

test('hub renders without crashing on empty input', () => {
  const html = ui.renderHub([]);
  assert.match(html, /Практика на тренажёрах/);
  assert.doesNotMatch(html, /undefined/);
  assert.doesNotMatch(html, /NaN/);
});

test('create renders into the host and routes clicks to navigate', () => {
  const calls = [];
  const host = {
    innerHTML: '',
    handlers: [],
    querySelectorAll() {
      const matches = [...String(this.innerHTML).matchAll(/data-trainer-page="([a-z0-9]+)"/g)];
      return matches.map(match => ({
        getAttribute: () => match[1],
        addEventListener: (event, handler) => this.handlers.push({ page: match[1], handler })
      }));
    }
  };
  const instance = ui.create({
    getProgress: () => ({ subnet_prog: { 0: 1 } }),
    getTotals: () => TOTALS,
    navigate: page => calls.push(page)
  }, { document: { getElementById: id => (id === 'trainers-host' ? host : null) } });

  const statuses = instance.render();
  assert.equal(statuses.length, ui.TRAINERS.length);
  assert.match(host.innerHTML, /Практика на тренажёрах/);
  host.handlers.find(entry => entry.page === 'subnet').handler();
  assert.deepEqual(calls, ['subnet']);
});

test('create tolerates a missing host element', () => {
  const instance = ui.create({ getProgress: () => ({}), getTotals: () => TOTALS },
    { document: { getElementById: () => null } });
  assert.equal(instance.render(), null);
  assert.equal(instance.statuses().length, ui.TRAINERS.length);
});
