const test = require('node:test');
const assert = require('node:assert/strict');
const OfflineUI = require('./offline-ui.js');

test('summarises a fully cached installation', () => {
  const report = OfflineUI.buildReport([
    { asset: './index.html', cached: true },
    { asset: './app.js', cached: true }
  ]);

  assert.equal(report.total, 2);
  assert.equal(report.cached, 2);
  assert.equal(report.percent, 100);
  assert.equal(report.ready, true);
  assert.deepEqual(report.missing, []);
  assert.deepEqual(report.affected, []);
});

test('reports every missing asset instead of the first few', () => {
  const results = [{ asset: './index.html', cached: true }];
  for (let index = 0; index < 14; index++) {
    results.push({ asset: `./tasks/dataset-${index}.json`, cached: false });
  }

  const report = OfflineUI.buildReport(results);

  assert.equal(report.total, 15);
  assert.equal(report.cached, 1);
  assert.equal(report.percent, 7);
  assert.equal(report.ready, false);
  assert.equal(report.missing.length, 14, 'no truncation to 10 entries');
});

test('names the sections a user loses when a dataset is missing', () => {
  const report = OfflineUI.buildReport([
    { asset: './index.html', cached: true },
    { asset: './tasks/study_map.json', cached: false },
    { asset: './tasks/labs.json', cached: false }
  ]);

  assert.deepEqual(report.affected.sort(), ['Debugging', 'Учёба'].sort());
});

test('flags a broken shell as more severe than missing datasets', () => {
  const shellBroken = OfflineUI.buildReport([{ asset: './app.js', cached: false }]);
  const dataBroken = OfflineUI.buildReport([{ asset: './tasks/labs.json', cached: false }]);

  assert.equal(shellBroken.shellReady, false);
  assert.equal(dataBroken.shellReady, true);
});

test('renders an escaped, screen-reader friendly summary', () => {
  const markup = OfflineUI.renderReport(OfflineUI.buildReport([
    { asset: './tasks/<img src=x>.json', cached: false }
  ]));

  assert.match(markup, /aria-live="polite"/);
  assert.match(markup, /&lt;img src=x&gt;/);
  assert.doesNotMatch(markup, /<img src=x>/);
  assert.doesNotMatch(markup, /onclick=/);
});
