const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const file = path.join(__dirname, 'tasks', 'flashcards.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const normalized = value => String(value || '').trim().toLowerCase().replace(/[^a-zа-яё0-9]+/g, ' ').trim();

test('ships the complete themed flashcard corpus with stable ids', () => {
  assert.equal(data.version, '1.0.0');
  assert.equal(data.source, 'Interview Prep Max study corpus');
  assert.equal(data.sourceCsvSha256, '113241009bb68c8df5d16a3f944a747dd40243e3111bbae20581eb00f0e1fcc9');
  assert.equal(data.cards.length, 3045);
  assert.equal(new Set(data.cards.map(card => card.collection)).size, 27);
  assert.deepEqual(data.cards.map(card => card.id), Array.from({ length: 3045 }, (_, index) => 1000001 + index));
});

test('keeps every flashcard answerable and free of exact duplicates', () => {
  data.cards.forEach(card => {
    assert.ok(String(card.collection || '').trim(), `card ${card.id}: collection`);
    assert.ok(String(card.question || '').trim(), `card ${card.id}: question`);
    assert.ok(String(card.answer || '').trim(), `card ${card.id}: answer`);
  });
  const questions = data.cards.map(card => normalized(card.question));
  const pairs = data.cards.map(card => normalized(card.question) + '\n' + normalized(card.answer));
  assert.equal(new Set(questions).size, questions.length, 'duplicate question');
  assert.equal(new Set(pairs).size, pairs.length, 'duplicate question-answer pair');
});

test('keeps all declared collection counts in sync with the cards', () => {
  const actual = Object.fromEntries([...new Set(data.cards.map(card => card.collection))].sort().map(collection => [
    collection, data.cards.filter(card => card.collection === collection).length
  ]));
  assert.deepEqual(data.collections, actual);
  assert.equal(Object.values(data.collections).reduce((sum, count) => sum + count, 0), data.cards.length);
});
