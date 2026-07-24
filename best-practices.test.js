const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const data = JSON.parse(fs.readFileSync(path.join(root, 'tasks', 'best_practices.json'), 'utf8'));
const questions = JSON.parse(fs.readFileSync(path.join(root, 'tasks', 'base_questions.json'), 'utf8'));

test('covers every exam topic plus Git and Regex', () => {
  const expected = new Set([...questions.map(question => question.topic), 'Git', 'Regex']);
  const actual = new Set(data.topics.map(topic => topic.topic));
  assert.deepEqual([...actual].sort(), [...expected].sort());
});

test('provides complete and unique practice cards for every topic', () => {
  assert.equal(data.schemaVersion, 1);
  assert.match(data.updated, /^\d{4}-\d{2}-\d{2}$/);
  const slugs = new Set();
  data.topics.forEach(topic => {
    assert.ok(!slugs.has(topic.slug), `duplicate slug: ${topic.slug}`);
    slugs.add(topic.slug);
    assert.ok(topic.summary.length >= 40, `${topic.topic}: short summary`);
    assert.ok(topic.practices.length >= 5, `${topic.topic}: too few practices`);
    const titles = new Set();
    topic.practices.forEach(practice => {
      assert.ok(!titles.has(practice.title), `${topic.topic}: duplicate title`);
      titles.add(practice.title);
      assert.ok(practice.why.length >= 70, `${topic.topic}/${practice.title}: short rationale`);
      assert.ok(practice.action.length >= 70, `${topic.topic}/${practice.title}: short action`);
    });
  });
});

test('app exposes an accessible topic tablist and loads the dataset offline', () => {
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const worker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert.match(app, /best_practices:\s*'tasks\/best_practices\.json'/);
  assert.match(html, /id="practice-tabs"[^>]*role="tablist"/);
  assert.match(html, /id="practice-panel"[^>]*role="tabpanel"/);
  assert.match(worker, /\.\/tasks\/best_practices\.json/);
});
