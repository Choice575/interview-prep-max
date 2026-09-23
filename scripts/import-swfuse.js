// Curated, independently written additions. No upstream code is executed.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const manifest = require('./imports/swfuse.json');

const normalize = text => String(text).toLowerCase().replace(/[^a-zа-яё0-9]+/g, ' ').trim();

function upsert(list, item, textField) {
  const index = list.findIndex(existing => existing.id === item.id);
  if (index >= 0 && list[index].sourceQuestionId !== item.sourceQuestionId) {
    throw new Error(`ID collision: ${item.id}`);
  }
  if (list.some(existing => existing.id !== item.id && normalize(existing[textField]) === normalize(item[textField]))) {
    throw new Error(`Duplicate question: ${item.id}`);
  }
  if (index < 0) list.push(item);
  else list[index] = item;
}

function buildImport(input) {
  const data = structuredClone(input);
  for (const record of manifest.questions) {
    const source = {
      sourceRepository: manifest.repository,
      sourceCommit: manifest.commit,
      sourceQuestionId: record.key,
      sourceTitle: manifest.repository,
      sourceUrl: `https://github.com/${manifest.repository}/blob/${manifest.commit}/${record.sourcePath}`
    };
    const category = data.bank.categories.find(item => item.slug === record.bankCategory);
    assert.ok(category, `Missing category: ${record.bankCategory}`);
    assert.ok(Object.hasOwn(data.flashcards.collections, record.collection), `Unexpected category: ${record.collection}`);
    assert.equal(record.options.length, 4);
    assert.ok(record.answer.length >= 200);
    const options = record.options.slice();
    const answer = record.answerPosition;
    assert.ok(Number.isInteger(answer) && answer >= 0 && answer < 4);
    [options[answer], options[record.answerIndex]] = [options[record.answerIndex], options[answer]];
    const bankQuestion = {
      id: record.bankId, level: record.level, q: record.q, answer: record.answer,
      keyPoints: record.keyPoints, commands: record.commands, pitfall: record.pitfall, ...source
    };
    const existingBank = data.bank.categories.flatMap(item => item.questions);
    // Check the whole bank, including other categories, before updating this category.
    upsert(existingBank, bankQuestion, 'q');
    upsert(category.questions, bankQuestion, 'q');
    upsert(data.exam, {
      id: record.examId, topic: record.topic, level: record.level, category: record.category,
      q: record.q, options, answer, explanation: record.cardAnswer || record.answer, ...source
    }, 'q');
    upsert(data.flashcards.cards, {
      id: record.cardId, collection: record.collection, question: record.q, answer: record.cardAnswer || record.answer, ...source
    }, 'question');
  }
  data.bank.updated = manifest.reviewed;
  for (const name of Object.keys(data.flashcards.collections)) {
    data.flashcards.collections[name] = data.flashcards.cards.filter(card => card.collection === name).length;
  }
  return data;
}

function main() {
  const root = path.resolve(__dirname, '..');
  const files = { bank: 'question_bank.json', exam: 'base_questions.json', flashcards: 'flashcards.json' };
  const originals = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(path.join(root, 'tasks', file), 'utf8')]));
  const input = Object.fromEntries(Object.entries(originals).map(([key, value]) => [key, JSON.parse(value)]));
  const result = buildImport(input);
  for (const [key, file] of Object.entries(files)) {
    if (process.argv.includes('--check')) assert.deepEqual(input[key], result[key], `${file}: import is out of sync`);
    else if (JSON.stringify(input[key]) !== JSON.stringify(result[key])) {
      const old = originals[key];
      const newline = old.includes('\r\n') ? '\r\n' : '\n';
      const pretty = old.trim().split('\n').length > 1;
      const suffix = old.endsWith('\n') ? newline : '';
      const text = JSON.stringify(result[key], null, pretty ? 2 : undefined).replace(/\n/g, newline) + suffix;
      fs.writeFileSync(path.join(root, 'tasks', file), text);
    }
  }
  console.log(`Swfuse: ${manifest.questions.length} questions synchronized across bank, exam and flashcards.`);
}

if (require.main === module) main();
module.exports = { buildImport };
