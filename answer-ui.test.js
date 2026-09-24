const test = require('node:test');
const assert = require('node:assert/strict');
const Answer = require('./public/answer-ui.js');

test('short answers remain complete and reviewed summaries keep the full explanation', () => {
  assert.deepEqual(Answer.parts('Короткий ответ.'), {short:'Короткий ответ.',full:''});
  assert.deepEqual(Answer.parts('Полный текст.', 'Суть.'), {short:'Суть.',full:'Полный текст.'});
  assert.deepEqual(Answer.parts('Тот же текст.', 'Тот же текст.'), {short:'Тот же текст.',full:''});
});

test('long answers split at sentences without clipping the original or inline code', () => {
  const first = 'Сначала нужно проверить состояние сервиса и убедиться в доступности сети.';
  const second = ' Затем сопоставьте результат с журналом приложения.';
  const full = first + second + ' Подробное объяснение результата.'.repeat(20);
  assert.deepEqual(Answer.parts(full), {short:first+second,full});
  const command = '`' + 'echo x; '.repeat(65) + '`';
  assert.deepEqual(Answer.parts(command), {short:command,full:''});
});

test('answer markup escapes summaries and full content and starts collapsed', () => {
  const html = Answer.render('<img src=x onerror=alert(1)>', '<script>bad</script>');
  assert.doesNotMatch(html, /<img|<script|<details[^>]*open/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<summary>Подробнее/);
  assert.match(html, /&lt;img/);
  assert.match(Answer.render('Ответ.', '', '<p>Пример.</p>'), /<details[^>]*>.*Пример/s);
});
