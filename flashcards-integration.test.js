const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Router = require('./public/router.js');

const root = __dirname;
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('registers flashcards across data loading, navigation and the browser shell', () => {
  const app = read('public/app.js');
  const html = read('public/index.html');
  const sw = read('public/asset-manifest.js');
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
  assert.match(eslint, /IPMaxFlashcardsUI:\s*'readonly'/);
});

test('labels the flashcard page as distinguishable sources', () => {
  const html = read('public/index.html');
  const app = read('public/app.js');
  assert.match(html, />Карточки<span class="sb-count" id="sb-flashcards-count">/);
  assert.match(html, /<h2>Карточки<\/h2>/);
  assert.match(html, /Учебная программа/);
  assert.match(html, /Собеседования из видео/);
  assert.doesNotMatch(app, /286 реальных вопросов из 9 видео/);
  assert.match(app, /VIDEO_FLASHCARDS_DATA\?\.cards/);
  assert.match(app, /VIDEO_FLASHCARDS_DATA\?\.sources/);
});

test('runs flashcard tests through the declared project command', () => {
  // npm test находит все *.test.js по маске, поэтому новый тест не забыть в списке.
  const command = JSON.parse(read('package.json')).scripts.test;
  assert.match(command, /\*\*\/\*\.test\.js/);
  ['flashcards-ui.test.js', 'flashcards-data.test.js', 'flashcards-integration.test.js']
    .forEach(file => assert.ok(fs.existsSync(path.join(root, file)), file));
});
