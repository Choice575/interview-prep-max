const test = require('node:test');
const assert = require('node:assert/strict');
const questions = require('./tasks/base_questions.json');

const correctedTerraformAnswers = new Map([
  [9, /Снимок соответствия адресов Terraform реальным объектам/],
  [11, /Backend, который хранит state вне локальной рабочей директории/],
  [14, /Расхождение фактических параметров объектов с ожидаемым состоянием/],
  [18, /Для переиспользования и стандартизации связанных ресурсов/],
  [26, /Синхронизировать VCS, проверить нужное окружение и выполнить свежий plan/]
]);

test('five corrected Terraform keys point to the intended answers with stable IDs', () => {
  for (const [id, expected] of correctedTerraformAnswers) {
    const matches = questions.filter(question => question.id === id);
    assert.equal(matches.length, 1, `ID ${id} должен остаться единственным`);
    const question = matches[0];
    assert.equal(question.topic, 'Terraform');
    assert.match(question.options[question.answer], expected);
    assert.ok(question.explanation, `ID ${id}: пояснение не должно исчезнуть`);
  }
});

test('study flashcards copied from exam questions start with the keyed answer, not a distractor', () => {
  const cards = require('./tasks/flashcards.json').cards;
  const byQuestion = new Map();
  questions.forEach(question => {
    const key = question.q.trim();
    if (!byQuestion.has(key)) byQuestion.set(key, []);
    byQuestion.get(key).push(question);
  });
  const normalize = text => String(text).trim().replace(/\s+/g, ' ').replace(/\.$/, '').toLowerCase();
  const mismatches = [];
  cards.forEach(card => {
    (byQuestion.get(card.question.trim()) || []).forEach(question => {
      const answer = normalize(card.answer);
      if (answer.startsWith(normalize(question.options[question.answer]))) return;
      const distractor = question.options.findIndex((option, index) => index !== question.answer && answer.startsWith(normalize(option)));
      if (distractor !== -1) mismatches.push(`${card.id} ← #${question.id}`);
    });
  });
  assert.deepEqual(mismatches, []);
});

test('explanation-vs-key gate flags a shuffled Terraform key and only reviewed IDs pass today', () => {
  const { findExplanationMismatches } = require('./question-quality.js');
  const baseline = require('./question-quality-baseline.json');
  const reviewed = new Set(baseline.reviewedExplanationMismatch);
  assert.deepEqual(findExplanationMismatches(questions).filter(item => !reviewed.has(item.id)), []);

  const tfstate = questions.find(question => question.id === 9);
  const wrong = tfstate.options.findIndex(option => /Описание требуемых providers/.test(option));
  assert.notEqual(wrong, -1);
  const shuffled = findExplanationMismatches([{ ...tfstate, answer: wrong }]);
  assert.deepEqual(shuffled.map(item => item.id), [9]);
});
