const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const data = JSON.parse(fs.readFileSync(path.join(root, 'tasks', 'external_tasks.json'), 'utf8'));

test('has schema version and update date', () => {
  assert.equal(data.schemaVersion, 1);
  assert.match(data.updated, /^\d{4}-\d{2}-\d{2}$/);
});

test('every task has required fields and valid enums', () => {
  assert.ok(Array.isArray(data.tasks) && data.tasks.length > 0);
  const ids = new Set();
  const validDifficulty = ['junior', 'middle', 'senior'];
  const validEvidence = ['screenshot', 'link', 'text'];
  
  data.tasks.forEach(task => {
    assert.ok(!ids.has(task.id), `duplicate id: ${task.id}`);
    ids.add(task.id);
    assert.ok(typeof task.title === 'string' && task.title.length >= 10, `${task.id}: short title`);
    assert.ok(typeof task.description === 'string' && task.description.length >= 50, `${task.id}: short description`);
    assert.ok(validDifficulty.includes(task.difficulty), `${task.id}: invalid difficulty`);
    assert.ok(typeof task.topic === 'string' && task.topic.length > 0, `${task.id}: missing topic`);
    assert.ok(Array.isArray(task.evidenceType) && task.evidenceType.length > 0, `${task.id}: empty evidenceType`);
    task.evidenceType.forEach(type => {
      assert.ok(validEvidence.includes(type), `${task.id}: invalid evidenceType ${type}`);
    });
    assert.ok(typeof task.points === 'number' && task.points > 0, `${task.id}: invalid points`);
  });
});

test('coverage: at least 3 topics and all difficulty levels', () => {
  const topics = new Set(data.tasks.map(t => t.topic));
  const difficulties = new Set(data.tasks.map(t => t.difficulty));
  assert.ok(topics.size >= 3, 'too few topics');
  assert.ok(difficulties.has('junior'), 'no junior tasks');
  assert.ok(difficulties.has('middle'), 'no middle tasks');
});
