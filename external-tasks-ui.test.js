const test = require('node:test');
const assert = require('node:assert/strict');
const ET = require('./external-tasks-ui.js');

const progressKey = 'external_tasks_completed';
const recoveryKey = 'external_tasks_completed_recovery';
function memoryStore(initial = {}, failKey) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { if(key === failKey) throw new Error('QuotaExceededError'); values.set(key, value); }
  };
}

test('progress reads reject malformed shapes without throwing or modifying storage', () => {
  assert.deepEqual(ET.readProgress(memoryStore()), {ok:true,data:{}});
  for(const raw of ['{broken', 'null', '[]', 'true', '{"1":null}', '{"1":3}']) {
    const store = memoryStore({[progressKey]:raw});
    assert.deepEqual(ET.readProgress(store), {ok:false,data:{},reason:'corrupt',raw});
    assert.equal(store.getItem(progressKey),raw);
  }
  assert.equal(ET.readProgress({getItem() {throw new Error('blocked');}}).reason,'unavailable');
});

test('saving a new task preserves valid existing progress and evidence', () => {
  const previous = {1:{completedAt:42,evidence:{text:'old answer'}}};
  const entry = {completedAt:99,evidence:{text:'new answer'}};
  const store = memoryStore({[progressKey]:JSON.stringify(previous)});
  assert.equal(ET.saveProgress(store,2,entry).ok,true);
  assert.deepEqual(JSON.parse(store.getItem(progressKey)),{...previous,2:entry});
  assert.equal(store.getItem(recoveryKey),null);
});

test('corrupt progress is backed up before saving, retaining earlier recovery records', () => {
  const raw = '{broken:original';
  const old = [{raw:'earlier damage',savedAt:1}];
  const store = memoryStore({[progressKey]:raw,[recoveryKey]:JSON.stringify(old)});
  assert.deepEqual(ET.saveProgress(store,2,{completedAt:99}),{ok:true,recovered:true});
  const backup = JSON.parse(store.getItem(recoveryKey));
  assert.deepEqual(backup[0],old[0]);
  assert.equal(backup[1].raw,raw);
  assert.deepEqual(ET.readProgress(store).data,{2:{completedAt:99}});
});

test('backup failure never overwrites corrupt progress and write failure preserves valid data', () => {
  for(const [raw,failKey] of [['{broken',recoveryKey],['{"1":{"completedAt":42}}',progressKey],['{broken',progressKey]]) {
    const store = memoryStore({[progressKey]:raw},failKey);
    assert.equal(ET.saveProgress(store,2,{completedAt:99}).ok,false);
    assert.equal(store.getItem(progressKey),raw);
  }
  assert.equal(ET.saveProgress({getItem() {throw new Error('blocked');}},2,{}).ok,false);
});

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
