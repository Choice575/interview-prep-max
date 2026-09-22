const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const file = path.join(__dirname, 'tasks', 'flashcards.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const videoFile = path.join(__dirname, 'tasks', 'video_flashcards.json');
const questionBankFile = path.join(__dirname, 'tasks', 'question_bank.json');
const examFile = path.join(__dirname, 'tasks', 'base_questions.json');
const normalized = value => String(value || '').trim().toLowerCase().replace(/[^a-zа-яё0-9]+/g, ' ').trim();

test('ships the complete themed flashcard corpus with stable ids', () => {
  assert.equal(data.version, '1.0.0');
  assert.equal(data.source, 'Interview Prep Max study corpus');
  assert.equal(data.sourceCsvSha256, '113241009bb68c8df5d16a3f944a747dd40243e3111bbae20581eb00f0e1fcc9');
  assert.equal(data.cards.length, 3105);
  assert.equal(new Set(data.cards.map(card => card.collection)).size, 13);
  assert.deepEqual(data.cards.map(card => card.id), Array.from({ length: 3105 }, (_, index) => 1000001 + index));
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

test('ships video interview cards as a separate corpus with disjoint stable ids', () => {
  const video = JSON.parse(fs.readFileSync(videoFile, 'utf8'));
  assert.equal(video.version, '1.0.0');
  assert.equal(video.source, 'DevOps interview videos');
  assert.equal(video.cards.length, 329);
  const expectedSources = [
    ['vk_-240726626_456239019', 21], ['xyuhiQRAXBU', 23], ['ycZRFijhZvs', 44],
    ['h91EUZK9E5w', 40], ['UOqh6EUDgPM', 30], ['ggJfKmA3HwI', 29],
    ['UH4VbPj-GBU', 45], ['4YLKMAbxRhw', 52], ['F-63asyRz24', 2], ['M1tXCebcOBE', 43]
  ];
  assert.deepEqual(video.sources.map(source => [source.videoId, source.cards]), expectedSources);
  video.sources.forEach(source => {
    assert.equal(video.cards.filter(card => card.videoId === source.videoId).length, source.cards, `source count ${source.videoId}`);
  });
  assert.deepEqual(video.cards.map(card => card.id), Array.from({ length: video.cards.length }, (_, index) => 2000001 + index));
  assert.ok(video.cards.every(card => card.videoId && card.sourceTitle && card.collection && card.question && card.answer));
  assert.equal(new Set(data.cards.map(card => card.id).concat(video.cards.map(card => card.id))).size, data.cards.length + video.cards.length);
  const actual = Object.fromEntries([...new Set(video.cards.map(card => card.collection))].sort().map(collection => [
    collection, video.cards.filter(card => card.collection === collection).length
  ]));
  assert.deepEqual(video.collections, actual);
});

test('imports the substantive KTS interview questions into all three learning modes', () => {
  const video = JSON.parse(fs.readFileSync(videoFile, 'utf8'));
  const bank = JSON.parse(fs.readFileSync(questionBankFile, 'utf8'));
  const exam = JSON.parse(fs.readFileSync(examFile, 'utf8'));
  const videoId = 'M1tXCebcOBE';
  const source = video.sources.find(item => item.videoId === videoId);
  assert.ok(source, 'KTS interview source is registered');
  assert.equal(source.url, `https://www.youtube.com/watch?v=${videoId}`);
  assert.equal(source.cards, 43, 'KTS source must contain the complete 43-question set');

  const cards = video.cards.filter(card => card.videoId === videoId);
  const bankQuestions = bank.categories.flatMap(category => category.questions)
    .filter(question => question.sourceVideoId === videoId);
  const examQuestions = exam.filter(question => question.sourceVideoId === videoId);
  assert.equal(cards.length, source.cards);
  assert.equal(bankQuestions.length, source.cards);
  assert.equal(examQuestions.length, source.cards);
  assert.equal(cards.length, 43);
  assert.ok(cards.every(card => /^\d{2}:\d{2}$/.test(card.sourceTime)));
  assert.ok(cards.every(card => card.sourceUrl === `https://www.youtube.com/watch?v=${videoId}&t=${card.sourceTime.split(':')[0] * 60 + Number(card.sourceTime.split(':')[1])}s`));
  assert.ok(bankQuestions.every(question => question.answer.length >= 200));
  assert.ok(examQuestions.every(question => question.options.length === 4 && Number.isInteger(question.answer)));
  const answerPositions = [0, 1, 2, 3].map(index => examQuestions.filter(question => question.answer === index).length);
  assert.ok(answerPositions.every(count => count > 0));
  assert.ok(Math.max(...answerPositions) - Math.min(...answerPositions) <= 1);

  const importedText = [...cards.map(card => card.question), ...bankQuestions.map(question => question.q), ...examQuestions.map(question => question.q)]
    .join('\n').toLowerCase();
  assert.doesNotMatch(importedText, /стоимость обучения|понравилось собеседование|расскажи про свой опыт|сколько стоит мок/);
});

test('keeps KTS command snippets executable in a shell', () => {
  const bank = JSON.parse(fs.readFileSync(questionBankFile, 'utf8'));
  const questions = bank.categories.flatMap(category => category.questions)
    .filter(question => question.sourceVideoId === 'M1tXCebcOBE');
  const byId = Object.fromEntries(questions.map(question => [question.id, question]));

  assert.match(byId.qb_kts_014.commands[1], /awk -F: '\$2 !~ \/\^\(!|\\\*\)\?\$\/ \{print \$1\}'/);
  assert.match(byId.qb_kts_018.commands[1], /awk '\{print \$1\}'/);
  assert.match(byId.qb_kts_021.commands[0], /awk '\$3 ~ \/Z\/'/);
  assert.match(byId.qb_kts_041.commands[0], /vtysh -c 'show ip ospf neighbor'/);
  assert.match(byId.qb_kts_041.commands[1], /vtysh -c 'show ip bgp summary'/);
});

// Reviewed content fingerprints after the technical review and practice grouping in 15.10.0; category names are excluded.
test('reviewed wording and source fields match the approved corpus', () => {
  const video = JSON.parse(fs.readFileSync(videoFile, 'utf8'));
  for (const [corpus, expected] of [
    [data, '0155bdebbbb2cab9aa5dc68e61cd522bab515cf0048ca83379e53d7198b479c4'],
    [video, 'e8d97ba327bf094757c6159c39bf472f8986c1ab2fb89463f2de486b330e7dde']
  ]) {
    const content = corpus.cards.filter(card => !card.sourceRepository).map(card => Object.fromEntries(Object.entries(card).filter(([key]) => key !== 'collection')));
    assert.equal(createHash('sha256').update(JSON.stringify(content)).digest('hex'), expected);
  }
});

test('both decks use the same flat categories, with MLOps only in study', () => {
  const categories = [
    'Linux и Bash', 'Сети и протоколы', 'Docker и реестры образов', 'Kubernetes',
    'Git и CI/CD', 'Ansible', 'Terraform и облака', 'Мониторинг и диагностика',
    'Базы данных и очереди', 'Безопасность', 'Архитектура и надёжность', 'Карьера и собеседования'
  ];
  const video = JSON.parse(fs.readFileSync(videoFile, 'utf8'));
  assert.deepEqual(Object.keys(video.collections), categories);
  assert.deepEqual(Object.keys(data.collections), [...categories, 'MLOps']);
});
