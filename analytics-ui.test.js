const test = require('node:test');
const assert = require('node:assert/strict');
const AnalyticsUI = require('./public/analytics-ui.js');

test('calculates readiness and grade scores from answered questions', () => {
  const questions = [
    { id: 1, level: 'Junior' },
    { id: 2, level: 'Junior' },
    { id: 3, level: 'Middle' },
    { id: 4, level: 'Senior' }
  ];
  const progress = {
    1: { correct: 2, wrong: 0 },
    2: { correct: 1, wrong: 1 },
    3: { correct: 0, wrong: 2 }
  };

  assert.deepEqual(AnalyticsUI.calculateReadiness(questions, progress), {
    answered: 3, mastered: 1, score: 33, band: 'low'
  });
  assert.deepEqual(AnalyticsUI.calculateGradeReadiness(questions, progress), [
    { grade: 'Junior', total: 2, mastered: 1, score: 50 },
    { grade: 'Middle', total: 1, mastered: 0, score: 0 },
    { grade: 'Senior', total: 1, mastered: 0, score: 0 }
  ]);
});

test('selects one weak question per topic and handles reserved property names', () => {
  const questions = [
    { id: 1, topic: '__proto__' },
    { id: 2, topic: 'constructor' },
    { id: 3, topic: 'Linux' },
    { id: 4, topic: 'Linux' },
    { id: 5, topic: 'Mastered' }
  ];
  const progress = { 5: { correct: 2, wrong: 0 } };
  const selected = AnalyticsUI.selectNextQuestions(questions, progress, () => 0, 10);

  assert.deepEqual(new Set(selected.map(question => question.topic)), new Set(['__proto__', 'constructor', 'Linux']));
  assert.equal(selected.some(question => question.id === 5), false);
});

test('updates and removes the home readiness row when progress changes', () => {
  const elements = new Map();
  const createElement = () => ({
    id: '', className: '', innerHTML: '',
    remove() { elements.delete(this.id); }
  });
  const content = {
    id: 'daily-plan-content',
    appendChild(child) { elements.set(child.id, child); }
  };
  elements.set('daily-plan-card', {});
  elements.set(content.id, content);
  const document = {
    getElementById(id) { return elements.get(id) || null; },
    createElement
  };
  const questions = [{ id: 1, topic: 'Linux' }];
  let progress = { 1: { correct: 0, wrong: 1 } };
  const ui = AnalyticsUI.create({
    getQuestions: () => questions,
    getQuestionProgress: () => progress
  }, { document });

  ui.renderReadinessHome();
  const row = elements.get('home-readiness');
  assert.match(row.innerHTML, /0%/);

  progress = { 1: { correct: 2, wrong: 0 } };
  ui.renderReadinessHome();
  assert.equal(elements.get('home-readiness'), row);
  assert.match(row.innerHTML, /100%/);

  progress = {};
  ui.renderReadinessHome();
  assert.equal(elements.has('home-readiness'), false);
});

test('averages only finite non-negative response times', () => {
  assert.equal(AnalyticsUI.calculateAverageSeconds({
    1: { times: [10, 20, -1, Infinity] },
    2: { times: [30] }
  }), 20);
});

test('describes a diagnostic screening without certifying a seniority level', () => {
  const strong = AnalyticsUI.describeDiagnostic(14, 15);
  const middling = AnalyticsUI.describeDiagnostic(8, 15);
  const weak = AnalyticsUI.describeDiagnostic(3, 15);

  assert.equal(strong.percent, 93);
  assert.equal(middling.percent, 53);
  assert.equal(weak.percent, 20);

  // A 15-question screening must never claim the user is Senior.
  [strong, middling, weak].forEach(result => {
    assert.doesNotMatch(result.verdict, /Senior/);
    assert.ok(result.verdict.length > 0);
    assert.ok(result.nextStep.length > 0);
  });

  assert.match(strong.verdict, /базов/i);
  assert.equal(strong.screeningOnly, true);
});

test('keeps the diagnostic verdict safe for an empty run', () => {
  const empty = AnalyticsUI.describeDiagnostic(0, 0);

  assert.equal(empty.percent, 0);
  assert.ok(empty.verdict.length > 0);
});

test('topic readiness counts profile-level topics closed at 80 percent', () => {
  const questions = [
    { id: 1, topic: 'Linux', level: 'Junior' }, { id: 2, topic: 'Linux', level: 'Junior' },
    { id: 3, topic: 'Linux', level: 'Junior' }, { id: 4, topic: 'Linux', level: 'Junior' },
    { id: 5, topic: 'Linux', level: 'Junior' }, { id: 6, topic: 'Docker', level: 'Junior' },
    { id: 7, topic: 'Docker', level: 'Junior' }, { id: 8, topic: 'Kubernetes', level: 'Senior' }
  ];
  const mastered = { correct: 1, wrong: 0 };
  const progress = { 1: mastered, 2: mastered, 3: mastered, 4: mastered, 6: mastered, 8: mastered };
  const result = AnalyticsUI.calculateTopicReadiness(questions, progress, 'Junior');
  assert.equal(result.level, 'Junior');
  assert.equal(result.total, 2);
  assert.equal(result.closed, 1);
  assert.deepEqual(result.topics.map(item => [item.topic, item.score, item.closed]), [['Linux', 80, true], ['Docker', 50, false]]);
  assert.equal(AnalyticsUI.calculateTopicReadiness(questions, progress, 'Senior').closed, 1);
  assert.equal(AnalyticsUI.calculateTopicReadiness(questions, progress, 'unknown').level, 'Junior');
});

test('day mistakes export only today\'s wrong answers as markdown', () => {
  const day = Date.UTC(2026, 8, 24, 10);
  const questions = [
    { id: 1, topic: 'Linux', level: 'Junior', q: 'Что  показывает\nuptime?', options: ['Время работы', 'Диск'], answer: 0, explanation: 'Время с загрузки и load average.' },
    { id: 2, topic: 'Linux', level: 'Junior', q: 'Старая ошибка', options: ['a'], answer: 0 },
    { id: 3, topic: 'Сети', level: 'Middle', q: 'Что такое MTU?', options: ['Размер кадра', 'Порт'], answer: 0 },
    { id: 4, topic: 'Сети', level: 'Junior', q: 'Исправлено', options: ['a'], answer: 0 }
  ];
  const progress = { 1: { lastSeen: day }, 2: { lastSeen: day - 3 * 86400000 }, 3: { lastSeen: day + 3600000 }, 4: { lastSeen: day } };
  const key = timestamp => new Date(timestamp).toISOString().slice(0, 10);
  const list = AnalyticsUI.dayMistakes(questions, progress, { 1: 1, 2: 1, 3: 1 }, '2026-09-24', key);
  assert.deepEqual(list.map(item => item.id), [1, 3]);
  const markdown = AnalyticsUI.mistakesMarkdown(list, '2026-09-24');
  assert.match(markdown, /^# Ошибки за 2026-09-24\n\nВсего: 2\./);
  assert.match(markdown, /## Linux\n\n- \*\*Что показывает uptime\?\*\* \(#1, Junior\)\n {2}- Правильно: Время работы\n {2}- Почему: Время с загрузки и load average\./);
  assert.match(markdown, /## Сети\n\n- \*\*Что такое MTU\?\*\* \(#3, Middle\)\n {2}- Правильно: Размер кадра\n\n?$/);
  assert.match(AnalyticsUI.mistakesMarkdown([], '2026-09-24'), /Ошибок за день нет\./);
});
