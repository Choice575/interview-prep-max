const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const router = require('./router.js');

const readTask = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, 'tasks', name), 'utf8'));
const doc = readTask('courses.json');

const HOME = { page: 'home', courseSlug: null, chapterId: null };

test('parseHash: пустой и корневой хеш дают главную', () => {
  ['', '#', '#/', '#//', '   '].forEach((hash) => {
    assert.deepEqual(router.parseHash(hash), HOME, `хеш ${JSON.stringify(hash)}`);
  });
  assert.deepEqual(router.parseHash(null), HOME);
  assert.deepEqual(router.parseHash(undefined), HOME);
});

test('parseHash: страница из закрытого списка', () => {
  router.PAGES.forEach((page) => {
    const route = router.parseHash('#/' + page);
    assert.equal(route.page, page, `страница ${page} не разобралась`);
    assert.equal(route.courseSlug, null);
    assert.equal(route.chapterId, null);
  });
});

test('parseHash: неизвестная страница уводит на главную, а не в пустоту', () => {
  ['#/нет-такой', '#/admin', '#/page-catalog', '#/COURSE'].forEach((hash) => {
    assert.deepEqual(router.parseHash(hash), HOME, `хеш ${hash}`);
  });
});

test('parseHash: курс и глава', () => {
  assert.deepEqual(router.parseHash('#/course/git'),
    { page: 'chapter', courseSlug: 'git', chapterId: null });
  assert.deepEqual(router.parseHash('#/course/git/chapter/ch_git_w4d1'),
    { page: 'chapter', courseSlug: 'git', chapterId: 'ch_git_w4d1' });
  // хвост без id — курс без конкретной главы, а не главная
  assert.deepEqual(router.parseHash('#/course/git/chapter/'),
    { page: 'chapter', courseSlug: 'git', chapterId: null });
});

test('parseHash: курс без slug — главная', () => {
  ['#/course', '#/course/', '#/course//chapter/x'].forEach((hash) => {
    assert.deepEqual(router.parseHash(hash), HOME, `хеш ${hash}`);
  });
});

test('parseHash: битая escape-последовательность не бросает', () => {
  // decodeURIComponent('%zz') бросает URIError — разбор обязан это проглотить
  assert.doesNotThrow(() => router.parseHash('#/%zz'));
  assert.deepEqual(router.parseHash('#/%zz'), HOME);
  assert.doesNotThrow(() => router.parseHash('#/course/%zz'));
  assert.deepEqual(router.parseHash('#/course/%zz'), HOME);
  assert.doesNotThrow(() => router.parseHash('#/course/git/chapter/%zz'));
  assert.deepEqual(router.parseHash('#/course/git/chapter/%zz'),
    { page: 'chapter', courseSlug: 'git', chapterId: null });
});

test('parseHash: лишние сегменты игнорируются', () => {
  assert.equal(router.parseHash('#/exam/extra/more').page, 'exam');
  assert.deepEqual(router.parseHash('#/course/git/chapter/ch_x/tail'),
    { page: 'chapter', courseSlug: 'git', chapterId: 'ch_x' });
});

test('buildHash: главная даёт #/, а не пустую строку', () => {
  assert.equal(router.buildHash({ page: 'home' }), '#/');
  assert.equal(router.buildHash(null), '#/');
  assert.equal(router.buildHash({}), '#/');
  assert.equal(router.buildHash({ page: 'нет-такой' }), '#/');
});

test('buildHash: страница, курс, глава', () => {
  assert.equal(router.buildHash({ page: 'study' }), '#/study');
  assert.equal(router.buildHash({ page: 'chapter', courseSlug: 'git' }), '#/course/git');
  assert.equal(router.buildHash({ page: 'chapter', courseSlug: 'git', chapterId: 'ch_git_w4d1' }),
    '#/course/git/chapter/ch_git_w4d1');
  // chapter без курса — некуда вести, остаётся страницей
  assert.equal(router.buildHash({ page: 'chapter' }), '#/chapter');
});

test('buildHash: значения экранируются', () => {
  const hash = router.buildHash({ page: 'chapter', courseSlug: 'a/b', chapterId: 'c d' });
  assert.ok(!hash.includes('a/b'), 'слеш в slug должен быть закодирован');
  assert.match(hash, /a%2Fb/);
  assert.match(hash, /c%20d/);
  // и обратно разбирается в исходные значения
  assert.deepEqual(router.parseHash(hash), { page: 'chapter', courseSlug: 'a/b', chapterId: 'c d' });
});

test('parseHash ∘ buildHash: обратимость для всех страниц', () => {
  router.PAGES.forEach((page) => {
    const route = { page: page, courseSlug: null, chapterId: null };
    const back = router.parseHash(router.buildHash(route));
    assert.ok(router.sameRoute(route, back), `${page}: ${router.buildHash(route)} -> ${JSON.stringify(back)}`);
  });
});

test('parseHash ∘ buildHash: обратимость на реальных курсах и главах', () => {
  doc.courses.forEach((course) => {
    const courseRoute = { page: 'chapter', courseSlug: course.slug, chapterId: null };
    assert.ok(router.sameRoute(courseRoute, router.parseHash(router.buildHash(courseRoute))),
      `курс ${course.slug} не обратим`);

    // по одной главе каждого курса достаточно: id генерируются по одному шаблону
    const chapter = course.chapters[0];
    const chapterRoute = { page: 'chapter', courseSlug: course.slug, chapterId: chapter.id };
    assert.ok(router.sameRoute(chapterRoute, router.parseHash(router.buildHash(chapterRoute))),
      `глава ${chapter.id} не обратима`);
  });
});

test('sameRoute: сравнивает все три поля и терпит null против undefined', () => {
  assert.ok(router.sameRoute({ page: 'home' }, { page: 'home', courseSlug: null, chapterId: null }));
  assert.ok(!router.sameRoute({ page: 'home' }, { page: 'study' }));
  assert.ok(!router.sameRoute({ page: 'chapter', courseSlug: 'git' },
    { page: 'chapter', courseSlug: 'docker' }));
  assert.ok(!router.sameRoute({ page: 'chapter', courseSlug: 'git', chapterId: 'a' },
    { page: 'chapter', courseSlug: 'git', chapterId: 'b' }));
  assert.ok(!router.sameRoute(null, { page: 'home' }));
  assert.ok(!router.sameRoute({ page: 'home' }, null));
});

test('PAGES: покрывает все data-page из index.html плюс catalog и chapter', () => {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const declared = new Set();
  const pattern = /data-page="([a-z-]+)"/g;
  let match = pattern.exec(html);
  while (match) {
    declared.add(match[1]);
    match = pattern.exec(html);
  }
  declared.forEach((page) => {
    assert.ok(router.isValidPage(page), `страница ${page} из index.html отсутствует в PAGES`);
  });
  // и наоборот: в PAGES нет страниц, которых нет в приложении
  router.PAGES.forEach((page) => {
    assert.ok(html.includes('id="page-' + page + '"'), `в index.html нет блока page-${page}`);
  });
});
