const test = require('node:test');
const assert = require('node:assert/strict');
const ExamUI = require('./exam-ui.js');

const questions = [
  { id: 1, topic: 'Linux', level: 'Junior', category: 'definition', q: 'Что делает pwd?', options: ['Печатает каталог', 'Меняет каталог'], answer: 0 },
  { id: 2, topic: 'Сети', level: 'Middle', category: 'scenario', q: 'DNS не отвечает', options: ['Проверить resolver', 'Удалить сервер'], answer: 0 },
  { id: 3, topic: 'Linux', level: 'Senior', category: 'tradeoff', q: 'Выберите компромисс', options: ['A', 42], answer: 1 }
];

test('combines coach selection, facets and resilient text search without mutating input', () => {
  const original = questions.slice();
  const result = ExamUI.filterQuestions(questions, {
    coachQuestionIds: ['2', '3'], topic: 'Linux', level: 'Senior', category: 'tradeoff', search: '42'
  });

  assert.deepEqual(result.map(question => question.id), [3]);
  assert.deepEqual(questions, original);
  assert.deepEqual(ExamUI.filterQuestions([{ id: 4, q: null, options: [null] }], { search: 'missing' }), []);
});

test('handles reserved mistake and progress keys as ordinary question ids', () => {
  const special = [
    { id: '__proto__', q: 'A' },
    { id: 'constructor', q: 'B' },
    { id: 'due', q: 'C' }
  ];
  const mistakes = Object.create(null);
  mistakes.constructor = true;
  const progress = Object.create(null);
  progress.__proto__ = { correct: 2, wrong: 0 };
  progress.constructor = { correct: 0, wrong: 2 };
  progress.due = { correct: 0, wrong: 1, nextReviewAt: 99 };

  assert.deepEqual(ExamUI.filterQuestions(special, { mode: 'mistakes', mistakes }).map(question => question.id), ['constructor']);
  assert.deepEqual(ExamUI.filterQuestions(special, { mode: 'srs', progress, now: 100 }).map(question => question.id), ['due']);
  assert.deepEqual(ExamUI.summarizeProgress(special, progress), { total: 3, correct: 1, wrong: 2, unanswered: 0 });
});

test('selects adaptive and mixed sessions through the injected randomizer', () => {
  const now = 10 * 86400000;
  const progress = {
    1: { correct: 9, wrong: 1, lastSeen: now },
    2: { correct: 1, wrong: 2, lastSeen: now },
    3: { correct: 0, wrong: 0, lastSeen: now }
  };
  const reverse = items => items.slice().reverse();

  assert.deepEqual(ExamUI.filterQuestions(questions, { mode: 'smart', progress, now }).map(question => question.id), [2, 3]);
  assert.deepEqual(ExamUI.filterQuestions(questions, { mode: 'smart', progress, now, coachSessionLimit: 1, randomize: reverse }).map(question => question.id), [3]);
  assert.deepEqual(ExamUI.filterQuestions(questions, { mode: 'mix10', randomize: reverse }).map(question => question.id), [3, 2, 1]);
});

test('renders safe answer controls without inline JavaScript', () => {
  const started = [];
  const markup = ExamUI.renderQuestionCard({
    id: '7" onmouseover="bad', topic: '<img src=x>', level: 'Middle', category: 'scenario',
    q: '<script>alert(1)</script>', options: ['safe', '<b>unsafe</b>'], answer: 1,
    explanation: '<svg onload=bad>'
  }, {
    progress: {}, mistakes: {}, studyMode: true, single: true, timerSeconds: 30,
    randomize: items => items.slice().reverse(), now: 123, onStart: (id, at) => started.push([id, at])
  });

  assert.doesNotMatch(markup, /onclick=/);
  assert.match(markup, /data-exam-action="answer"/);
  assert.match(markup, /data-orig-idx="1"/);
  assert.match(markup, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(markup, /&lt;b&gt;unsafe&lt;\/b&gt;/);
  assert.doesNotMatch(markup, /<script>|onmouseover="bad|<svg/);
  assert.deepEqual(started, [['7" onmouseover="bad', 123]]);
});

test('renders keyboard-ready flashcards with escaped content', () => {
  const markup = ExamUI.renderFlashcardMarkup([{
    id: 9, topic: 'Linux', level: 'Junior', q: '<em>question</em>',
    options: ['<strong>answer</strong>'], answer: 0, explanation: 'Use <code>pwd</code>'
  }]);

  assert.match(markup, /role="button" tabindex="0" data-exam-action="flip"/);
  assert.doesNotMatch(markup, /onclick=/);
  assert.match(markup, /&lt;em&gt;question&lt;\/em&gt;/);
  assert.match(markup, /&lt;strong&gt;answer&lt;\/strong&gt;/);
  assert.match(markup, /Use &lt;code&gt;pwd&lt;\/code&gt;/);
});
