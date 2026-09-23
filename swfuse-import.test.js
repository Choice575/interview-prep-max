const test = require('node:test');
const assert = require('node:assert/strict');
const manifest = require('./scripts/imports/swfuse.json');
const { buildImport } = require('./scripts/import-swfuse');
const BankUI = require('./question-bank-ui');
const ExamUI = require('./exam-ui');
const CardsUI = require('./flashcards-ui');
const input = {
  bank: require('./tasks/question_bank.json'), exam: require('./tasks/base_questions.json'),
  flashcards: require('./tasks/flashcards.json')
};
const bankQuestions = input.bank.categories.flatMap(category => category.questions);

test('all 60 curated source questions agree across bank, exam and flashcards', () => {
  assert.equal(manifest.questions.length, 60);
  for (const record of manifest.questions) {
    const bank = bankQuestions.find(item => item.id === record.bankId);
    const exam = input.exam.find(item => item.id === record.examId);
    const card = input.flashcards.cards.find(item => item.id === record.cardId);
    assert.ok(bank && exam && card, record.key);
    assert.equal(bank.q, card.question);
    assert.equal(exam.q, card.question);
    assert.equal(bank.answer, record.answer);
    assert.deepEqual(bank.commands, record.commands);
    assert.equal(bank.pitfall, record.pitfall);
    assert.equal(card.answer, record.cardAnswer || record.answer);
    assert.equal(exam.explanation, record.cardAnswer || record.answer);
    assert.equal(exam.options[exam.answer], record.options[record.answerIndex]);
    assert.equal(card.collection, record.collection);
    for (const item of [bank, exam, card]) {
      assert.equal(item.sourceQuestionId, record.key);
      assert.equal(item.sourceCommit, manifest.commit);
      assert.equal(item.sourceUrl, `https://github.com/${manifest.repository}/blob/${manifest.commit}/${record.sourcePath}`);
    }
  }
  for (const list of [bankQuestions, input.exam, input.flashcards.cards]) {
    assert.equal(new Set(list.map(item => item.id)).size, list.length);
    assert.equal(list.filter(item => item.sourceRepository === manifest.repository).length, 60);
  }
});

test('import is deterministic, idempotent and does not mutate existing input', () => {
  const before = structuredClone(input);
  const once = buildImport(input);
  assert.deepEqual(once, input, 'committed data must match the curated manifest');
  assert.deepEqual(buildImport(once), once);
  assert.deepEqual(input, before);
});

test('import rejects unrelated ID collisions and duplicate prompts before overwriting data', () => {
  const collision = structuredClone(input);
  const first = collision.exam.find(item => item.id === manifest.questions[0].examId);
  delete first.sourceQuestionId;
  assert.throws(() => buildImport(collision), /ID collision/);
  assert.equal(first.sourceQuestionId, undefined);
  const duplicate = structuredClone(input);
  duplicate.exam.push({ ...duplicate.exam.find(item => item.id === manifest.questions[0].examId), id: 999999 });
  assert.throws(() => buildImport(duplicate), /Duplicate question/);
});

test('source search exposes additions without mixing video cards', () => {
  assert.equal(ExamUI.filterQuestions(input.exam, { search: 'SWFUSE' }).length, 60);
  assert.equal(CardsUI.filterCards(input.flashcards.cards, { search: 'Swfuse' }).length, 60);
  assert.equal(CardsUI.filterCards(require('./tasks/video_flashcards.json').cards, { search: 'Swfuse' }).length, 0);
  assert.equal(input.bank.categories.flatMap(category => BankUI.filterQuestions(category, 'Swfuse', 'all')).length, 60);
});

test('source links are escaped and reject executable URL schemes', () => {
  const question = { ...input.exam.find(item => item.id === 15001), sourceTitle: '<script>unsafe</script>' };
  for (const render of [q => ExamUI.renderQuestionCard(q, {}), q => BankUI.renderAnswer(q)]) {
    const markup = render(question);
    assert.match(markup, /rel="noopener noreferrer"/);
    assert.match(markup, /&lt;script&gt;unsafe&lt;\/script&gt;/);
    assert.doesNotMatch(render({ ...question, sourceUrl: 'javascript:alert(1)' }), /href="javascript:/);
  }
});
