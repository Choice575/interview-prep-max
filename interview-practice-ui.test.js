const test = require('node:test');
const assert = require('node:assert/strict');
const IP = require('./interview-practice-ui.js');

const data = {
  star: [
    {
      id: 'star-1',
      topic: 'Инцидент',
      prompt: 'Расскажите про свою ошибку',
      why: 'Проверяется зрелость',
      hints: ['Ситуация', 'Действия', 'Результат'],
      rubric: ['Ответственность признана', 'Ущерб остановлен первым', 'Есть результат'],
      pitfalls: ['Чужая ошибка']
    }
  ],
  systemDesign: [
    {
      id: 'sd-1',
      topic: 'CI/CD',
      level: 'Middle',
      title: 'Конвейер выпуска',
      context: 'Сервис в контейнере',
      constraints: ['Откат за 15 минут', 'Секреты вне репозитория'],
      task: 'Опишите конвейер',
      expectedPoints: ['Неизменяемые образы', 'Откат по метке'],
      tradeoffs: ['Ручное подтверждение замедляет выпуск'],
      rubric: ['Назван способ отката', 'Секреты защищены']
    }
  ]
};

test('lists and finds items by kind and id', () => {
  assert.equal(IP.items(data, 'star').length, 1);
  assert.equal(IP.items(data, 'systemDesign').length, 1);
  assert.equal(IP.findItem(data, 'star', 'star-1').topic, 'Инцидент');
  assert.equal(IP.findItem(data, 'systemDesign', 'sd-1').level, 'Middle');
  assert.equal(IP.findItem(data, 'star', 'нет-такого'), null);
  assert.deepEqual(IP.items(null, 'star'), []);
});

test('scores self-assessment against the rubric', () => {
  const item = IP.findItem(data, 'star', 'star-1');

  const full = IP.score(item, [0, 1, 2]);
  assert.equal(full.percent, 100);
  assert.equal(full.covered, 3);
  assert.deepEqual(full.missing, []);
  assert.match(full.verdict, /все пункты/);

  const partial = IP.score(item, [0]);
  assert.equal(partial.percent, 33);
  assert.equal(partial.missing.length, 2);
  assert.match(partial.verdict, /не структурирован/);

  const twoOfThree = IP.score(item, [0, 2]);
  assert.equal(twoOfThree.percent, 67);
  assert.match(twoOfThree.verdict, /половина|Основа/);
});

test('ignores duplicate and out-of-range rubric marks', () => {
  const item = IP.findItem(data, 'star', 'star-1');

  assert.equal(IP.score(item, [0, 0, 0]).covered, 1, 'duplicates must not inflate the score');
  assert.equal(IP.score(item, [0, 99, -3, 'x']).covered, 1, 'invalid indexes must be dropped');
  assert.equal(IP.score(item, []).percent, 0);
  assert.equal(IP.score({ rubric: [] }, [0]).percent, 0);
});

test('renders a STAR card without leaking the rubric', () => {
  const markup = IP.renderStar(IP.findItem(data, 'star', 'star-1'));

  assert.match(markup, /Расскажите про свою ошибку/);
  assert.match(markup, /Проверяется зрелость/);
  assert.match(markup, /Ситуация/);
  assert.match(markup, /Чужая ошибка/);
  assert.doesNotMatch(markup, /Ответственность признана/, 'rubric must stay hidden until requested');
});

test('renders a system design card with constraints but no reference answer', () => {
  const markup = IP.renderSystemDesign(IP.findItem(data, 'systemDesign', 'sd-1'));

  assert.match(markup, /Конвейер выпуска/);
  assert.match(markup, /Откат за 15 минут/);
  assert.match(markup, /Опишите конвейер/);
  assert.doesNotMatch(markup, /Неизменяемые образы/, 'expected points must stay hidden');
});

test('reveals the reference answer only on request', () => {
  const star = IP.renderReference(IP.findItem(data, 'star', 'star-1'), 'star');
  assert.match(star, /Ответственность признана/);

  const sd = IP.renderReference(IP.findItem(data, 'systemDesign', 'sd-1'), 'systemDesign');
  assert.match(sd, /Неизменяемые образы/);
  assert.match(sd, /Ручное подтверждение замедляет выпуск/);
  assert.match(sd, /Назван способ отката/);
});

test('builds an accessible rubric form with bound labels', () => {
  const form = IP.renderRubricForm(IP.findItem(data, 'systemDesign', 'sd-1'), 'sd-check');

  assert.match(form, /id="sd-check-0"/);
  assert.match(form, /for="sd-check-0"/);
  assert.match(form, /id="sd-check-1"/);
  assert.match(form, /for="sd-check-1"/);
});

test('announces the score via aria-live', () => {
  const item = IP.findItem(data, 'star', 'star-1');
  const markup = IP.renderScore(IP.score(item, [0, 1]));

  assert.match(markup, /aria-live="polite"/);
  assert.match(markup, /67%/);
  assert.match(markup, /2 из 3/);
  assert.match(markup, /Есть результат/, 'the missing rubric point must be listed');
});

test('escapes hostile content in prompts and rubrics', () => {
  const hostile = {
    star: [{
      id: 'x',
      topic: '<img src=x onerror=bad>',
      prompt: '<script>alert(1)</script>',
      why: 'why',
      hints: ['<b>hint</b>'],
      rubric: ['<i>point</i>'],
      pitfalls: []
    }]
  };
  const markup = IP.renderStar(IP.findItem(hostile, 'star', 'x'));

  assert.match(markup, /&lt;script&gt;/);
  assert.doesNotMatch(markup, /<script>/);
  assert.doesNotMatch(markup, /<img src=x/);
  assert.match(IP.renderReference(IP.findItem(hostile, 'star', 'x'), 'star'), /&lt;i&gt;point/);
});

test('summarises the practice set', () => {
  const info = IP.summary(data);

  assert.equal(info.star, 1);
  assert.equal(info.systemDesign, 1);
  assert.deepEqual(info.topics, ['CI/CD']);
});

test('renders an empty state for a missing item', () => {
  assert.match(IP.renderStar(null), /Задание не найдено/);
  assert.match(IP.renderSystemDesign(null), /Задание не найдено/);
});
