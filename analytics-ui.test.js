const test = require('node:test');
const assert = require('node:assert/strict');
const AnalyticsUI = require('./analytics-ui.js');

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
