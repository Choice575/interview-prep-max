const test = require('node:test');
const assert = require('node:assert/strict');
const FlashcardsUI = require('./flashcards-ui.js');

const cards = [
  { id: 1000001, collection: 'DevOps — Linux и Bash', question: 'Что делает pwd?', answer: 'Печатает текущий каталог.' },
  { id: 1000002, collection: 'DevOps — Docker', question: 'Что делает docker build?', answer: 'Собирает образ из Dockerfile.' },
  { id: 1000003, collection: 'MLOps — Serving', question: 'Что такое online serving?', answer: 'Синхронная выдача предсказаний.' }
];

test('filters cards by collection, text and review mode without mutating input', () => {
  const original = structuredClone(cards);
  const progress = {
    1000001: { lastSeen: 10, nextReviewAt: 90, correct: 1, wrong: 0 },
    1000002: { lastSeen: 20, nextReviewAt: 110, correct: 0.5, wrong: 0.5 }
  };

  assert.deepEqual(FlashcardsUI.filterCards(cards, {
    collection: 'DevOps — Linux и Bash', search: 'текущий', mode: 'due', progress, now: 100
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
    total: 3, new: 1, learning: 1, known: 1, due: 1
  });
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
