const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ui = require('./chapter-ui.js');

const readTask = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, 'tasks', name), 'utf8'));

const doc = readTask('courses.json');
const datasets = {
  studyMap: readTask('study_map.json'),
  studyTests: readTask('study_tests.json'),
  seniorCases: readTask('senior_cases.json'),
  labs: readTask('labs.json'),
  externalTasks: readTask('external_tasks.json'),
  simulators: readTask('ts.json')
};

const courseBySlug = (slug) => doc.courses.find((course) => course.slug === slug);
const firstChapterOfKind = (key) => {
  for (const course of doc.courses) {
    for (const chapter of course.chapters) {
      if (ui.kindKey(chapter) === key) return { course, chapter };
    }
  }
  throw new Error('нет главы вида ' + key);
};

test('kindKey: тип и подтип склеиваются, тип без kind остаётся как есть', () => {
  assert.equal(ui.kindKey({ type: 'lesson' }), 'lesson');
  assert.equal(ui.kindKey({ type: 'test', kind: 'mini' }), 'test/mini');
  assert.equal(ui.kindKey({ type: 'lab', kind: 'external' }), 'lab/external');
  assert.equal(ui.kindKey(null), '');
});

test('targetPage: каждый вид главы ведёт в существующий раздел приложения', () => {
  const pages = new Set(['home', 'study', 'practices', 'external', 'exam', 'analytics',
    'subnet', 'ts', 'cmd', 'labs', 'code', 'ansible', 'dockerfile', 'k8s', 'ports',
    'git', 'regex', 'tips', 'interview', 'catalog']);
  const seen = new Set();
  doc.courses.forEach((course) => course.chapters.forEach((chapter) => {
    const page = ui.targetPage(chapter);
    assert.ok(pages.has(page), `${chapter.id}: неизвестная страница ${page}`);
    seen.add(ui.kindKey(chapter));
  }));
  // все семь видов глав из courses.json покрыты картой переходов
  assert.equal(seen.size, 7, 'изменился набор видов глав — проверьте TARGET_PAGES');
});

test('targetPage: неизвестный вид не роняет, а ведёт в «Учёбу»', () => {
  assert.equal(ui.targetPage({ type: 'unknown' }), 'study');
  // Подвиды lab разведены по разным разделам (incident -> study, fix-bug -> labs,
  // external -> external), поэтому ключа 'lab' без подвида в TARGET_PAGES нет
  // и неизвестный подвид падает в общий дефолт, а не в тренажёр Debugging.
  assert.equal(ui.targetPage({ type: 'lab', kind: 'нечто' }), 'study');
  assert.equal(ui.targetPage({}), 'study');
  assert.equal(ui.targetPage(null), 'study');
});

test('findCourse / findChapter: находят по slug и id, иначе null', () => {
  const course = ui.findCourse(doc, 'git');
  assert.equal(course.slug, 'git');
  assert.equal(ui.findCourse(doc, 'нет-такого'), null);
  assert.equal(ui.findCourse(null, 'git'), null);

  const chapter = ui.findChapter(course, course.chapters[2].id);
  assert.equal(chapter.id, course.chapters[2].id);
  assert.equal(ui.findChapter(course, 'нет-такой'), null);
  assert.equal(ui.findChapter(null, 'x'), null);
});

test('neighbours: границы курса без previous и next', () => {
  const course = courseBySlug('git');
  const first = ui.neighbours(course, course.chapters[0].id);
  assert.equal(first.previous, null);
  assert.equal(first.next.id, course.chapters[1].id);
  assert.equal(first.index, 0);
  assert.equal(first.total, course.chapters.length);

  const last = ui.neighbours(course, course.chapters[course.chapters.length - 1].id);
  assert.equal(last.next, null);
  assert.ok(last.previous);

  const missing = ui.neighbours(course, 'нет-такой');
  assert.equal(missing.index, -1);
});

test('resolveChapter: все 422 главы каталога находят своё содержимое', () => {
  const broken = [];
  doc.courses.forEach((course) => course.chapters.forEach((chapter) => {
    const resolved = ui.resolveChapter(chapter, datasets);
    if (!resolved.ok) broken.push(`${chapter.id} -> ${resolved.missing}`);
  }));
  assert.deepEqual(broken, [], 'главы без содержимого отрисуются пустыми');
});

test('resolveChapter: урок берёт текст из study_map, а не из courses.json', () => {
  const { chapter } = firstChapterOfKind('lesson');
  const resolved = ui.resolveChapter(chapter, datasets);
  assert.equal(resolved.body.kind, 'lesson');
  assert.ok(resolved.body.objective.length > 10);
  assert.ok(resolved.body.practice.length > 0);
  // в самой главе текста нет — тонкий режим courses.json
  assert.equal(chapter.objective, undefined);
  assert.equal(chapter.practice, undefined);
});

test('resolveChapter: битая ссылка возвращает ok=false, а не бросает', () => {
  const broken = { type: 'lesson', source: { dataset: 'study_map.json', week: 99, day: 9 } };
  const resolved = ui.resolveChapter(broken, datasets);
  assert.equal(resolved.ok, false);
  assert.equal(resolved.body, null);
  assert.equal(resolved.missing, 'study_map.json');

  assert.equal(ui.resolveChapter({ type: 'lesson', source: { dataset: 'нет.json' } }, datasets).ok, false);
  assert.equal(ui.resolveChapter({ type: 'lesson', source: {} }, {}).ok, false);
});

test('resolveChapter: пустые датасеты не роняют резолв', () => {
  doc.courses[0].chapters.slice(0, 8).forEach((chapter) => {
    const resolved = ui.resolveChapter(chapter, {});
    assert.equal(resolved.ok, false, `${chapter.id}: без датасетов должно быть ok=false`);
  });
});

test('эталонные ответы не попадают в резолв мини-теста', () => {
  const { chapter } = firstChapterOfKind('test/mini');
  const resolved = ui.resolveChapter(chapter, datasets);
  const test1 = datasets.studyTests.miniTests.find((item) => item.id === chapter.source.id);
  const expected = test1.questions[0].expected;

  assert.ok(resolved.body.questions.length > 0);
  assert.ok(expected && expected.length > 5, 'в датасете должен быть эталон — иначе тест бессмысленен');
  const serialized = JSON.stringify(resolved.body);
  assert.ok(!serialized.includes(expected), 'эталонный ответ утёк в тело главы');
});

test('эталонные ответы не попадают в резолв инцидента и лабы', () => {
  const incident = firstChapterOfKind('lab/incident');
  const resolvedIncident = ui.resolveChapter(incident.chapter, datasets);
  const caseData = datasets.seniorCases.cases.find((item) => item.id === incident.chapter.source.id);
  assert.ok(Array.isArray(caseData.expectedActions) && caseData.expectedActions.length);
  assert.equal(resolvedIncident.body.expectedActions, undefined, 'expectedActions утекли');
  assert.equal(resolvedIncident.body.scoring, undefined, 'scoring утёк');

  const lab = firstChapterOfKind('lab/fix-bug');
  const resolvedLab = ui.resolveChapter(lab.chapter, datasets);
  const labData = datasets.labs.find((item) => item.id === lab.chapter.source.id);
  assert.ok(labData.fix && labData.fix.length > 3);
  assert.equal(resolvedLab.body.fix, undefined, 'fix утёк');
  assert.equal(resolvedLab.body.answer, undefined, 'answer утёк');
  assert.equal(resolvedLab.body.bug, undefined, 'bug утёк');
});

test('renderChapter: заголовок, позиция и ссылка на курс', () => {
  const course = courseBySlug('git');
  const chapter = course.chapters[0];
  const resolved = ui.resolveChapter(chapter, datasets);
  const position = ui.neighbours(course, chapter.id);
  const html = ui.renderChapter(course, chapter, resolved, position, false);

  assert.match(html, /глава 1 из 12/);
  assert.match(html, /data-chapter-course="git"/);
  assert.match(html, /data-chapter-start="/);
  assert.match(html, />Перейти к прохождению</);
  assert.doesNotMatch(html, />Повторить</);
});

test('renderChapter: пройденная глава помечена и предлагает повтор', () => {
  const course = courseBySlug('git');
  const chapter = course.chapters[0];
  const resolved = ui.resolveChapter(chapter, datasets);
  const position = ui.neighbours(course, chapter.id);
  const html = ui.renderChapter(course, chapter, resolved, position, true);

  assert.match(html, /chapter-done/);
  assert.match(html, />Повторить</);
});

test('renderChapter: навигация вперёд-назад по краям курса', () => {
  const course = courseBySlug('git');
  const first = course.chapters[0];
  const last = course.chapters[course.chapters.length - 1];

  const firstHtml = ui.renderChapter(course, first, ui.resolveChapter(first, datasets),
    ui.neighbours(course, first.id), false);
  assert.equal((firstHtml.match(/data-chapter-open=/g) || []).length, 1, 'у первой главы только «вперёд»');

  const lastHtml = ui.renderChapter(course, last, ui.resolveChapter(last, datasets),
    ui.neighbours(course, last.id), false);
  assert.equal((lastHtml.match(/data-chapter-open=/g) || []).length, 1, 'у последней только «назад»');
});

test('renderChapter: нет курса или главы — понятная заглушка без падения', () => {
  assert.match(ui.renderChapter(null, null, null, { index: -1, total: 0 }, false), /не найдена/i);
  const course = courseBySlug('git');
  assert.match(ui.renderChapter(course, null, null, ui.neighbours(course, 'x'), false), /не найдена/i);
});

test('renderChapter: нерезолвнутое содержимое даёт заглушку, а не пустую страницу', () => {
  const course = courseBySlug('git');
  const chapter = course.chapters[0];
  const html = ui.renderChapter(course, chapter, { ok: false, body: null, missing: 'study_map.json' },
    ui.neighbours(course, chapter.id), false);
  assert.match(html, /Не удалось загрузить содержимое/);
  assert.match(html, /study_map\.json/);
  // навигация обязана остаться: иначе из главы не выйти
  assert.match(html, /data-chapter-open=/);
});

test('renderBody: каждый вид главы даёт непустую разметку', () => {
  const kinds = ['lesson', 'test/mini', 'test/weekly', 'lab/incident', 'lab/fix-bug', 'lab/external', 'simulator'];
  kinds.forEach((key) => {
    const { chapter } = firstChapterOfKind(key);
    const resolved = ui.resolveChapter(chapter, datasets);
    const html = ui.renderBody(resolved.body);
    assert.ok(html.length > 40, `${key}: разметка подозрительно короткая (${html.length})`);
  });
  assert.equal(ui.renderBody(null), '');
});

test('экранирование: разметка из данных не исполняется', () => {
  const course = { slug: '"><img src=x>', title: '<b>курс</b>', chapters: [] };
  const chapter = { id: 'x', type: 'lesson', title: '<script>alert(1)</script>', minutes: 25, source: {} };
  const html = ui.renderChapter(course, chapter,
    { ok: true, body: { kind: 'lesson', objective: '<i>цель</i>', practice: ['<b>ls</b>'], pitfalls: [], expectedResult: '', productionLayer: '', artifact: '' } },
    { previous: null, next: null, index: 0, total: 1 }, false);

  assert.ok(!html.includes('<script>'), 'тег script из данных попал в разметку');
  assert.ok(!html.includes('<img src=x'), 'тег img из данных попал в разметку');
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;i&gt;цель/);
});
