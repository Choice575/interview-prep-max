const test = require('node:test');
const assert = require('node:assert/strict');
const ET = require('./external-tasks-ui.js');

const dataset = {
  updated: '2026-07-30',
  tasks: [
    { id: 1, title: 'Nginx deploy', description: 'Install and configure Nginx with a custom page visible in browser.', 
      difficulty: 'junior', topic: 'Linux', evidenceType: ['screenshot', 'text'], points: 10 },
    { id: 2, title: 'Dockerfile', description: 'Multi-stage Dockerfile for Node.js app without npm in final image.', 
      difficulty: 'middle', topic: 'Docker', evidenceType: ['link', 'text'], points: 15 }
  ]
};

test('tasksOf returns tasks array or empty', () => {
  assert.equal(ET.tasksOf(dataset).length, 2);
  assert.equal(ET.tasksOf(null).length, 0);
  assert.equal(ET.tasksOf({}).length, 0);
  assert.equal(ET.tasksOf({ tasks: 'nope' }).length, 0);
});

test('renderTaskList shows cards with done badges and meta', () => {
  const completed = { 1: { completedAt: Date.now(), evidenceType: 'screenshot' } };
  const html = ET.renderTaskList(dataset, completed);
  assert.match(html, /external-tasks-grid/);
  assert.match(html, /data-task-id="1"/);
  assert.match(html, /data-task-id="2"/);
  assert.match(html, /task-done.*Выполнено/);
  assert.match(html, /task-pending.*К выполнению/);
  assert.match(html, /Junior/);
  assert.match(html, /Middle/);
  assert.match(html, /10 очков/);
  assert.match(html, /15 очков/);
  assert.match(html, /Доказательство: Скриншот, Текст/);
  assert.match(html, /Доказательство: Ссылка, Текст/);
});

test('renderTaskList renders empty state when no tasks', () => {
  assert.match(ET.renderTaskList({ tasks: [] }, {}), /Задания пока недоступны/);
});

test('renderEvidenceModal builds form inputs matching evidenceType', () => {
  const html1 = ET.renderEvidenceModal(dataset.tasks[0]);
  assert.match(html1, /evidence-text/);
  assert.match(html1, /evidence-file/);
  assert.doesNotMatch(html1, /evidence-link/);
  
  const html2 = ET.renderEvidenceModal(dataset.tasks[1]);
  assert.match(html2, /evidence-link/);
  assert.match(html2, /evidence-text/);
  assert.doesNotMatch(html2, /evidence-file/);
});

test('renderEvidenceModal falls back when task is null', () => {
  assert.match(ET.renderEvidenceModal(null), /Задание не найдено/);
});

test('validateEvidence requires at least one field', () => {
  assert.equal(ET.validateEvidence({ text: 'foo', link: null, file: null }), true);
  assert.equal(ET.validateEvidence({ text: null, link: 'http://x', file: null }), true);
  assert.equal(ET.validateEvidence({ text: null, link: null, file: {} }), true);
  assert.equal(ET.validateEvidence({ text: null, link: null, file: null }), false);
  assert.equal(ET.validateEvidence({ text: '', link: '', file: null }), false);
});

test('markup escapes hostile values', () => {
  const hostile = {
    tasks: [{
      id: 99, title: '<img src=x onerror=alert(1)>', description: 'x'.repeat(60),
      difficulty: 'junior', topic: '</span><script>alert(2)</script>', evidenceType: ['text'], points: 5
    }]
  };
  const list = ET.renderTaskList(hostile, {});
  const modal = ET.renderEvidenceModal(hostile.tasks[0]);
  assert.doesNotMatch(list, /<script>/);
  assert.doesNotMatch(list, /<img src=x/);
  assert.doesNotMatch(modal, /<script>/);
  assert.match(modal, /&lt;img src=x/);
});
