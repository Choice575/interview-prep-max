const test = require('node:test');
const assert = require('node:assert/strict');
const Scope = require('./public/profile-scope.js');
const ExamUI = require('./public/exam-ui.js');

test('a Junior profile hides Senior questions and every profile hides MLOps by default', () => {
  const junior = Scope.scopeFor({ level: 'Junior' }, {});
  assert.deepEqual(junior.levels, ['Junior', 'Middle']);
  assert.equal(junior.hidesSenior, true);
  assert.equal(junior.showMlops, false);
  const middle = Scope.scopeFor({ level: 'Middle' }, null);
  assert.deepEqual(middle.levels, ['Junior', 'Middle', 'Senior']);
  const none = Scope.scopeFor(null, {});
  assert.deepEqual(none.levels, ['Junior', 'Middle', 'Senior']);
});

test('explicit choices override the profile', () => {
  assert.deepEqual(Scope.scopeFor({ level: 'Junior' }, { showSenior: true }).levels, ['Junior', 'Middle', 'Senior']);
  assert.deepEqual(Scope.scopeFor({ level: 'Senior' }, { showSenior: false }).levels, ['Junior', 'Middle']);
  const cards = [{ id: 1, collection: 'MLOps' }, { id: 2, collection: 'Linux и Bash' }];
  assert.deepEqual(Scope.filterCards(cards, Scope.scopeFor({ level: 'Middle' }, {})).map(card => card.id), [2]);
  assert.deepEqual(Scope.filterCards(cards, Scope.scopeFor({ level: 'Middle' }, { showMlops: true })).map(card => card.id), [1, 2]);
  assert.deepEqual(Scope.normalizePrefs({ showMlops: 'yes', showSenior: 1 }), { showMlops: false, showSenior: null });
});

test('the exam filter applies the profile levels only in the profile mode', () => {
  const questions = ['Junior', 'Middle', 'Senior'].map((level, index) => ({ id: index + 1, level, topic: 'Linux' }));
  const levels = Scope.scopeFor({ level: 'Junior' }, {}).levels;
  assert.deepEqual(ExamUI.filterQuestions(questions, { level: 'profile', levels }).map(q => q.level), ['Junior', 'Middle']);
  assert.equal(ExamUI.filterQuestions(questions, { level: 'all', levels }).length, 3);
  assert.deepEqual(ExamUI.filterQuestions(questions, { level: 'Senior', levels }).map(q => q.level), ['Senior']);
  assert.equal(ExamUI.filterQuestions(questions, { level: 'profile' }).length, 3, 'без списка уровней ничего не скрывается');
});
