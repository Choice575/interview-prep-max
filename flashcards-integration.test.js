const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Router = require('./router.js');

const root = __dirname;
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('registers flashcards across data loading, navigation and the browser shell', () => {
  const app = read('app.js');
  const html = read('index.html');
  const sw = read('sw.js');
  const server = read('server.js');
  const docker = read('Dockerfile');
  const eslint = read('eslint.config.mjs');

  assert.ok(Router.PAGES.includes('flashcards'));
  assert.match(html, /data-page="flashcards"/);
  assert.match(html, /id="page-flashcards"/);
  assert.match(html, /<script src="\.\/flashcards-ui\.js"><\/script>/);
  assert.match(app, /FLASHCARDS_DATA/);
  assert.match(app, /flashcards:\s*'tasks\/flashcards\.json'/);
  assert.match(app, /flashcards:\s*'FLASHCARDS_DATA'/);
  assert.match(app, /video_flashcards:\s*'tasks\/video_flashcards\.json'/);
  assert.match(app, /video_flashcards:\s*'VIDEO_FLASHCARDS_DATA'/);
  assert.match(app, /if\(page==='flashcards'\)\s*renderFlashcards\(\)/);
  assert.match(app, /recordQuestionResult\(\{id:card\.id,topic:card\.collection\},\{outcome,source:deck\?\.id==='video'\?'video_flashcards':'flashcards'/);
  assert.match(sw, /'\.\/flashcards-ui\.js'/);
  assert.match(sw, /'\.\/tasks\/flashcards\.json'/);
  assert.match(sw, /'\.\/tasks\/video_flashcards\.json'/);
  assert.match(server, /'flashcards-ui\.js'/);
  assert.match(server, /'tasks\/flashcards\.json'/);
  assert.match(server, /'tasks\/video_flashcards\.json'/);
  assert.match(docker, /flashcards-ui\.js/);
  assert.match(eslint, /IPMaxFlashcardsUI:\s*'readonly'/);
  assert.match(eslint, /'flashcards-ui\.js'/);
});

test('labels the flashcard page as two distinguishable sources', () => {
  const html = read('index.html');
  assert.match(html, />Карточки<span class="sb-count" id="sb-flashcards-count">/);
  assert.match(html, /<h2>Карточки<\/h2>/);
  assert.match(html, /Учебная программа/);
  assert.match(html, /Собеседования из видео/);
});

test('runs flashcard tests through the declared project command', () => {
  const command = JSON.parse(read('package.json')).scripts.test;
  assert.match(command, /flashcards-ui\.test\.js/);
  assert.match(command, /flashcards-data\.test\.js/);
  assert.match(command, /flashcards-integration\.test\.js/);
});
