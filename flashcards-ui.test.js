const test = require('node:test');
const assert = require('node:assert/strict');
const FlashcardsUI = require('./public/flashcards-ui.js');

const cards = [
  { id: 1000001, collection: 'Linux и Bash', question: 'Что делает pwd?', answer: 'Печатает текущий каталог.' },
  { id: 1000002, collection: 'Docker и реестры образов', question: 'Что делает docker build?', answer: 'Собирает образ из Dockerfile.' },
  { id: 1000003, collection: 'MLOps', question: 'Что такое online serving?', answer: 'Синхронная выдача предсказаний.' }
];

const decks = [
  { id: 'study', label: 'Учебная программа', description: 'Карточки из учебной программы.', cards },
  { id: 'video', label: 'Собеседования из видео', description: 'Реальные вопросы из видео.', cards: [
    { id: 2000001, collection: 'Linux и Bash', question: 'Что такое inode?', answer: 'Метаданные файла.' }
  ] }
];

test('renders separate study and video deck choices with their own counts', () => {
  const markup = FlashcardsUI.renderPage({
    decks, deck: 'video', progress: {}, collection: 'all', mode: 'all', now: 100
  });

  assert.match(markup, /data-flashcards-action="deck" data-deck="study"/);
  assert.match(markup, /Учебная программа<\/span><strong>3<\/strong>/);
  assert.match(markup, /data-flashcards-action="deck" data-deck="video"/);
  assert.match(markup, /Собеседования из видео<\/span><strong>1<\/strong>/);
  assert.match(markup, /Реальные вопросы из видео/);
  assert.match(markup, /<strong>1<\/strong> всего/);
  assert.match(markup, /Что такое inode\?/);
  assert.doesNotMatch(markup, /Что делает pwd\?/);
});

test('controller switches decks without mixing cards or progress', () => {
  const host = { innerHTML: '', querySelectorAll: () => [] };
  const doc = { getElementById: id => id === 'flashcards-host' ? host : null };
  const attempts = [];
  const controller = FlashcardsUI.create({
    getDecks: () => decks,
    getProgress: () => ({ 1000001: { lastSeen: 10, repetitions: 2 } }),
    recordAttempt: (card, outcome, deck) => attempts.push([card.id, outcome, deck.id]),
    now: () => 100
  }, { document: doc });

  controller.render();
  // По умолчанию открыта очередь «Сегодня»: выученная и не просроченная карточка в неё не входит.
  assert.match(host.innerHTML, /data-mode="today">Сегодня/);
  assert.doesNotMatch(host.innerHTML, /Что делает pwd\?/);
  controller.setFilter('mode', 'all');
  assert.match(host.innerHTML, /Что делает pwd\?/);
  assert.doesNotMatch(host.innerHTML, /Что такое inode\?/);
  controller.setDeck('video');
  assert.match(host.innerHTML, /Что такое inode\?/);
  assert.match(host.innerHTML, /<strong>1<\/strong> новых/);
  controller.rate('pass');
  assert.deepEqual(attempts, [[2000001, 'pass', 'video']]);
});

test('filters cards by collection, text and review mode without mutating input', () => {
  const original = structuredClone(cards);
  const progress = {
    1000001: { lastSeen: 10, nextReviewAt: 90, correct: 1, wrong: 0 },
    1000002: { lastSeen: 20, nextReviewAt: 110, correct: 0.5, wrong: 0.5 }
  };

  assert.deepEqual(FlashcardsUI.filterCards(cards, {
    collection: 'Linux и Bash', search: 'текущий', mode: 'due', progress, now: 100
  }).map(card => card.id), [1000001]);
  assert.deepEqual(FlashcardsUI.filterCards(cards, { mode: 'new', progress, now: 100 }).map(card => card.id), [1000003]);
  assert.deepEqual(FlashcardsUI.filterCards(cards, { mode: 'learning', progress, now: 100 }).map(card => card.id), [1000001, 1000002]);
  assert.deepEqual(cards, original);
});

test('summarizes new, learning, known and due cards', () => {
  const progress = {
    1000001: { lastSeen: 10, nextReviewAt: 90, correct: 2, wrong: 0, repetitions: 2 },
    1000002: { lastSeen: 20, nextReviewAt: 110, correct: 0.5, wrong: 0.5, repetitions: 0 }
  };

  assert.deepEqual(FlashcardsUI.summarizeCards(cards, progress, 100), {
    total: 3, new: 1, learning: 1, known: 1, due: 1, today: 2
  });
});

test('today queue puts overdue cards first and limits new cards per day', () => {
  const day = new Date(2026, 8, 24, 12).getTime();
  const many = Array.from({ length: 30 }, (_, index) => ({ id: 1000100 + index, collection: 'Linux и Bash', question: 'Q' + index, answer: 'A' }));
  const progress = {
    1000100: { lastSeen: day - 5 * 86400000, nextReviewAt: day - 1000, correct: 2, wrong: 0, repetitions: 2 },
    1000101: { lastSeen: day - 5 * 86400000, nextReviewAt: day - 90000, correct: 1, wrong: 1, repetitions: 1 },
    1000102: { lastSeen: day - 3600000, nextReviewAt: day + 86400000, correct: 1, wrong: 0, repetitions: 1 },
    1000103: { lastSeen: day - 7200000, nextReviewAt: day + 86400000, correct: 0, wrong: 1, repetitions: 0 }
  };
  const queue = FlashcardsUI.todayQueue(many, progress, day);
  assert.deepEqual(queue.slice(0, 2).map(card => card.id), [1000101, 1000100], 'сначала самые просроченные');
  assert.equal(queue.length, 2 + FlashcardsUI.NEW_PER_DAY - 2, 'две новые уже начаты сегодня');
  assert.ok(queue.every(card => card.id !== 1000102 && card.id !== 1000103));
  assert.equal(FlashcardsUI.filterCards(many, { mode: 'today', search: 'Q2', progress, now: day }).length, 11, 'поиск идёт по всему набору');
});

test('renders escaped card controls and collection choices without inline JavaScript', () => {
  const markup = FlashcardsUI.renderPage({
    cards: [{ id: 1000009, collection: 'DevOps — <Docker>', question: '<img src=x>', answer: '<script>bad()</script>' }],
    progress: {}, collection: 'all', mode: 'all', search: '', revealed: true, index: 0, now: 100
  });

  assert.doesNotMatch(markup, /onclick=|onchange=|oninput=/);
  assert.doesNotMatch(markup, /<img|<script>/);
  assert.match(markup, /DevOps — &lt;Docker&gt;/);
  assert.match(markup, /&lt;img src=x&gt;/);
  assert.match(markup, /&lt;script&gt;bad\(\)&lt;\/script&gt;/);
  assert.match(markup, /data-flashcards-action="rate" data-outcome="pass"/);
  assert.match(markup, /data-flashcards-action="rate" data-outcome="partial"/);
  assert.match(markup, /data-flashcards-action="rate" data-outcome="fail"/);
});

test('controller reveals, rates and advances through injected services', () => {
  const host = { innerHTML: '', querySelectorAll: () => [] };
  const doc = { getElementById: id => id === 'flashcards-host' ? host : null };
  const attempts = [];
  const controller = FlashcardsUI.create({
    getCards: () => cards,
    getProgress: () => ({}),
    recordAttempt: (card, outcome) => attempts.push([card.id, outcome]),
    now: () => 100
  }, { document: doc });

  controller.render();
  assert.match(host.innerHTML, /Что делает pwd\?/);
  assert.doesNotMatch(host.innerHTML, /Печатает текущий каталог/);
  controller.reveal();
  assert.match(host.innerHTML, /Печатает текущий каталог/);
  controller.rate('pass');
  assert.deepEqual(attempts, [[1000001, 'pass']]);
  assert.match(host.innerHTML, /Что делает docker build\?/);
});

test('rating a card that leaves the current mode does not skip the next card', () => {
  const host = { innerHTML: '', querySelectorAll: () => [] };
  const doc = { getElementById: id => id === 'flashcards-host' ? host : null };
  const progress = {};
  const controller = FlashcardsUI.create({
    getCards: () => cards,
    getProgress: () => progress,
    recordAttempt: card => { progress[card.id] = { lastSeen: 100, nextReviewAt: 200, repetitions: 1 }; },
    now: () => 100
  }, { document: doc });

  controller.setFilter('mode', 'new');
  assert.match(host.innerHTML, /Что делает pwd\?/);
  controller.rate('pass');
  assert.match(host.innerHTML, /Что делает docker build\?/);
  assert.doesNotMatch(host.innerHTML, /Что такое online serving\?/);
});

test('category buttons show stable deck totals and selection even when search has no matches', () => {
  const markup = FlashcardsUI.renderPage({ cards, collection: 'Linux и Bash', search: 'no matching question' });
  assert.match(markup, /role="group" aria-label="Категории карточек"/);
  assert.match(markup, /aria-pressed="true" data-flashcards-action="category" data-collection="Linux и Bash"><span>Linux и Bash<\/span><strong>1<\/strong>/);
  assert.match(markup, /<span>Все категории<\/span><strong>3<\/strong>/);
  assert.match(markup, /Для выбранных фильтров карточек нет/);
  assert.doesNotMatch(markup, /<select|<option/);
});

test('changing category resets position and answer while preserving progress by ID', () => {
  const host = { innerHTML: '', querySelectorAll: () => [] };
  const progress = { 1000002: { lastSeen: 10, repetitions: 2 } };
  const controller = FlashcardsUI.create({ getCards: () => cards, getProgress: () => progress }, {
    document: { getElementById: () => host }
  });
  controller.next();
  controller.reveal();
  controller.setFilter('collection', 'Docker и реестры образов');
  controller.setFilter('mode', 'known');
  assert.equal(controller.getState().index, 0);
  assert.equal(controller.getState().revealed, false);
  assert.match(host.innerHTML, /Что делает docker build/);
  assert.doesNotMatch(host.innerHTML, /Собирает образ из Dockerfile/);
  assert.deepEqual(progress, { 1000002: { lastSeen: 10, repetitions: 2 } });
});

test('editing a search starts across categories and preserves the explicit review mode', () => {
  const host = { innerHTML: '', querySelectorAll: () => [] };
  const controller = FlashcardsUI.create({ getCards: () => cards }, { document: { getElementById: () => host } });
  controller.setFilter('collection', 'Linux и Bash');
  controller.setFilter('mode', 'new');
  controller.setFilter('search', 'docker');
  assert.equal(controller.getState().collection, 'all');
  assert.equal(controller.getState().mode, 'new');
  assert.match(host.innerHTML, /Что делает docker build/);
  assert.match(host.innerHTML, /Найдено: <strong>1<\/strong>/);
  controller.setFilter('collection', 'Linux и Bash');
  assert.match(host.innerHTML, /Найдено: <strong>0<\/strong>/);
  assert.match(host.innerHTML, /Все категории и режимы/);
  controller.setFilter('search', 'docker build');
  assert.equal(controller.getState().collection, 'all');
  assert.match(host.innerHTML, /Что делает docker build/);
});

test('resetting search restrictions keeps the query and selected deck', () => {
  const host = { innerHTML: '', querySelectorAll: () => [] };
  const controller = FlashcardsUI.create({ getDecks: () => decks }, { document: { getElementById: () => host } });
  controller.setDeck('video');
  controller.setFilter('search', 'inode');
  controller.setFilter('mode', 'known');
  controller.setFilter('collection', 'Linux и Bash');
  assert.match(host.innerHTML, /Найдено: <strong>0<\/strong>/);
  controller.resetFilters();
  assert.deepEqual(controller.getState(), { deck: 'video', collection: 'all', mode: 'today', search: 'inode', revealed: false, index: 0 });
  assert.match(host.innerHTML, /Что такое inode/);
  assert.doesNotMatch(host.innerHTML, /Все категории и режимы/);
});

test('shows card code as an escaped multi-line block and finds cards by it', () => {
  const practice = [{ id: 1000343, collection: 'Docker и реестры образов', question: '[Практика] Найдите ошибку', code: 'FROM python:3.11-slim\nCOPY . .\n<script>', answer: 'Порядок слоёв.' }];
  const markup = FlashcardsUI.renderPage({ decks: [{ id: 'study', label: 'Учебная программа', cards: practice }], deck: 'study', progress: {}, now: 100 });
  assert.match(markup, /<pre class="study-evidence study-card-code"[^>]*>FROM python:3\.11-slim\nCOPY \. \.\n&lt;script&gt;<\/pre>/);
  assert.equal(FlashcardsUI.filterCards(practice, { search: 'copy . .' }).length, 1);
  const plain = FlashcardsUI.renderPage({ decks, deck: 'study', progress: {}, now: 100 });
  assert.doesNotMatch(plain, /study-card-code/);
});

test('marks deep-dive cards with a badge', () => {
  const deep = [{ id: 1002080, collection: 'Сети и протоколы', question: 'Как работает BGP?', answer: 'Протокол.', depth: 'deep' }];
  const markup = FlashcardsUI.renderPage({ decks: [{ id: 'study', label: 'Учебная программа', cards: deep }], deck: 'study', progress: {}, now: 100 });
  assert.match(markup, /tag-deep">Глубокое погружение</);
  assert.doesNotMatch(FlashcardsUI.renderPage({ decks, deck: 'study', progress: {}, now: 100 }), /tag-deep/);
});

test('copies of one concept collapse into one card and video repeats are counted', () => {
  const cards = [
    { id: 2000001, conceptId: 'c1', videoId: 'a', collection: 'Kubernetes', question: 'Q1', answer: 'A' },
    { id: 2000002, collection: 'Kubernetes', question: 'Q2', answer: 'A' },
    { id: 2000003, conceptId: 'c1', videoId: 'b', collection: 'Kubernetes', question: 'Q1 again', answer: 'A' },
    { id: 2000004, conceptId: 'c1', videoId: 'b', collection: 'Kubernetes', question: 'Q1 once more', answer: 'A' },
    { id: 2000005, conceptId: 'c2', videoId: 'a', collection: 'Kubernetes', question: 'Q3', answer: 'A' }
  ];
  const collapsed = FlashcardsUI.collapseConcepts(cards);
  assert.deepEqual(collapsed.map(card => card.id), [2000001, 2000002, 2000005]);
  assert.equal(collapsed[0].interviewCount, 2);
  assert.equal(collapsed[2].interviewCount, undefined);
  assert.equal(cards[0].interviewCount, undefined, 'исходные карточки не меняются');
  const markup = FlashcardsUI.renderPage({ cards: collapsed, collection: 'all' });
  assert.match(markup, /Встречалось в 2 собеседованиях/);
});
