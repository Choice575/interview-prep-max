const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ui = require('./catalog-ui.js');

const doc = JSON.parse(fs.readFileSync(path.join(__dirname, 'tasks', 'courses.json'), 'utf8'));

const fakeCourse = (id, chapterIds, extra) => Object.assign({
  id: id,
  slug: id,
  title: 'Курс ' + id,
  category: 'Linux',
  level: 'Старт',
  summary: 'Описание курса длиной больше сорока символов для проверки рендера.',
  weeks: [1],
  requiresCourses: [],
  stats: { lesson: chapterIds.length },
  estimatedMinutes: 60,
  chapters: chapterIds.map((chapterId, index) => ({
    id: chapterId, type: 'lesson', title: 'Глава ' + chapterId, order: index + 1, minutes: 25,
    source: { dataset: 'study_map.json', week: 1, day: index + 1 }
  }))
}, extra || {});

test('coursesOf: не бросает на некорректном входе', () => {
  assert.deepEqual(ui.coursesOf(null), []);
  assert.deepEqual(ui.coursesOf(undefined), []);
  assert.deepEqual(ui.coursesOf({}), []);
  assert.deepEqual(ui.coursesOf({ courses: 'нет' }), []);
});

test('categoriesOf: «Все» первой, далее уникальные в порядке появления', () => {
  const dataset = {
    courses: [
      fakeCourse('a', ['a1'], { category: 'Linux' }),
      fakeCourse('b', ['b1'], { category: 'Docker' }),
      fakeCourse('c', ['c1'], { category: 'Linux' })
    ]
  };
  assert.deepEqual(ui.categoriesOf(dataset), ['Все', 'Linux', 'Docker']);
  assert.deepEqual(ui.categoriesOf(null), ['Все']);
});

test('filterByCategory: «Все» и пустое значение возвращают весь список', () => {
  const dataset = {
    courses: [
      fakeCourse('a', ['a1'], { category: 'Linux' }),
      fakeCourse('b', ['b1'], { category: 'Docker' })
    ]
  };
  assert.equal(ui.filterByCategory(dataset, ui.ALL_CATEGORY).length, 2);
  assert.equal(ui.filterByCategory(dataset, null).length, 2);
  assert.equal(ui.filterByCategory(dataset, 'Docker').length, 1);
  assert.equal(ui.filterByCategory(dataset, 'Нет такой').length, 0);
});

test('courseProgress: считает по завершённым главам, принимает Set и объект', () => {
  const course = fakeCourse('x', ['c1', 'c2', 'c3', 'c4']);
  assert.deepEqual(ui.courseProgress(course, new Set()), { done: 0, total: 4, percent: 0, complete: false });
  assert.deepEqual(ui.courseProgress(course, new Set(['c1', 'c2'])), { done: 2, total: 4, percent: 50, complete: false });
  assert.deepEqual(ui.courseProgress(course, { c1: true, c2: true, c3: true, c4: true }), { done: 4, total: 4, percent: 100, complete: true });
});

test('courseProgress: пустой курс не даёт NaN и не считается пройденным', () => {
  const empty = fakeCourse('empty', []);
  const progress = ui.courseProgress(empty, new Set());
  assert.equal(progress.percent, 0);
  assert.equal(progress.complete, false);
});

test('courseProgress: чужие id в прогрессе не завышают счётчик', () => {
  const course = fakeCourse('x', ['c1', 'c2']);
  assert.equal(ui.courseProgress(course, new Set(['c1', 'посторонний'])).done, 1);
});

test('nextChapter: первая непройденная, null когда курс завершён', () => {
  const course = fakeCourse('x', ['c1', 'c2', 'c3']);
  assert.equal(ui.nextChapter(course, new Set()).id, 'c1');
  assert.equal(ui.nextChapter(course, new Set(['c1'])).id, 'c2');
  // пропуск в середине: возвращается именно пропущенная, а не следующая по порядку
  assert.equal(ui.nextChapter(course, new Set(['c1', 'c3'])).id, 'c2');
  assert.equal(ui.nextChapter(course, new Set(['c1', 'c2', 'c3'])), null);
});

test('catalogSummary: различает пройденные, начатые и нетронутые курсы', () => {
  const dataset = {
    courses: [
      fakeCourse('a', ['a1', 'a2']),
      fakeCourse('b', ['b1', 'b2']),
      fakeCourse('c', ['c1'])
    ]
  };
  const summary = ui.catalogSummary(dataset, new Set(['a1', 'a2', 'b1']));
  assert.equal(summary.total, 3);
  assert.equal(summary.completed, 1);
  assert.equal(summary.started, 1);
  assert.equal(summary.chapters, 5);
  assert.equal(summary.chaptersDone, 3);
});

test('renderFilters: активная категория помечена aria-pressed', () => {
  const dataset = { courses: [fakeCourse('a', ['a1'], { category: 'Linux' })] };
  const html = ui.renderFilters(dataset, 'Linux');
  assert.match(html, /data-catalog-category="Linux"[^>]*aria-pressed="true"/);
  assert.match(html, /data-catalog-category="Все"[^>]*aria-pressed="false"/);
});

test('renderCard: прогресс в aria-valuenow, кнопка меняет подпись', () => {
  const course = fakeCourse('x', ['c1', 'c2']);
  const fresh = ui.renderCard(course, new Set());
  assert.match(fresh, /aria-valuenow="0"/);
  assert.match(fresh, />Начать</);

  const started = ui.renderCard(course, new Set(['c1']));
  assert.match(started, /aria-valuenow="50"/);
  assert.match(started, />Продолжить</);
  assert.match(started, /data-catalog-open="x"/);
});

test('renderCard: зависимости выводятся ссылками на курсы', () => {
  const course = fakeCourse('x', ['c1'], {
    requiresCourses: [{ courseId: 'base', slug: 'linux-base', title: 'Linux: база', derivedFrom: 'text' }]
  });
  const html = ui.renderCard(course, new Set());
  assert.match(html, /Требуется:/);
  assert.match(html, /data-catalog-course="linux-base"/);
  assert.match(html, /Linux: база/);
});

test('renderGrid: пустая категория даёт понятную заглушку', () => {
  const dataset = { courses: [fakeCourse('a', ['a1'], { category: 'Linux' })] };
  assert.match(ui.renderGrid(dataset, 'Docker', new Set()), /пока нет курсов/);
  assert.match(ui.renderGrid(dataset, 'Linux', new Set()), /catalog-grid/);
});

test('экранирование: разметка из данных не попадает в HTML', () => {
  const course = fakeCourse('x', ['c1'], {
    title: '<img src=x onerror=alert(1)>',
    summary: '"кавычки" и <теги> в описании курса, длина больше сорока символов'
  });
  const html = ui.renderCard(course, new Set());
  assert.ok(!html.includes('<img src=x'), 'тег из данных не должен попадать в разметку');
  assert.match(html, /&lt;img src=x/);
  assert.match(html, /&quot;кавычки&quot;/);
});

test('работает на реальном tasks/courses.json', () => {
  const categories = ui.categoriesOf(doc);
  assert.equal(categories[0], ui.ALL_CATEGORY);
  assert.ok(categories.length > 3, 'категорий должно быть больше трёх');

  const summary = ui.catalogSummary(doc, new Set());
  assert.equal(summary.total, doc.courseCount);
  assert.equal(summary.chapters, doc.chapterCount);
  assert.equal(summary.completed, 0);
  assert.ok(summary.hours > 0);

  const grid = ui.renderGrid(doc, ui.ALL_CATEGORY, new Set());
  doc.courses.forEach((course) => {
    assert.ok(grid.includes('data-catalog-open="' + course.slug + '"'), `нет кнопки для ${course.slug}`);
  });
});

test('каждая категория из реального датасета даёт непустую выборку', () => {
  ui.categoriesOf(doc).forEach((category) => {
    assert.ok(ui.filterByCategory(doc, category).length > 0, `пустая категория: ${category}`);
  });
});
