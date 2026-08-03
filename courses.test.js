const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { buildCourses, checkResolvable, COURSE_PLAN, SIMULATOR_OVERRIDES } = require('./scripts/generate-courses.js');

const root = __dirname;
const readTask = (name) => JSON.parse(fs.readFileSync(path.join(root, 'tasks', name), 'utf8'));
const doc = readTask('courses.json');

const CHAPTER_TYPES = ['lesson', 'test', 'lab', 'simulator'];

test('courses.json: метаданные документа', () => {
  assert.equal(doc.language, 'ru');
  assert.equal(doc.generatedBy, 'scripts/generate-courses.js');
  assert.equal(doc.curriculumVersion, readTask('study_map.json').version);
  assert.equal(doc.courseCount, doc.courses.length);
  assert.equal(
    doc.chapterCount,
    doc.courses.reduce((sum, course) => sum + course.chapters.length, 0)
  );
});

test('courses.json: файл соответствует генератору (не отредактирован руками)', () => {
  const generated = buildCourses().doc;
  const strip = (value) => JSON.parse(JSON.stringify(value, (key, item) => (key === 'generatedAt' ? undefined : item)));
  assert.deepEqual(strip(doc.courses), strip(generated.courses));
});

test('каждый курс: обязательные поля и корректные типы', () => {
  const slugs = new Set();
  const ids = new Set();
  doc.courses.forEach((course) => {
    assert.ok(!ids.has(course.id), `дубликат id курса: ${course.id}`);
    assert.ok(!slugs.has(course.slug), `дубликат slug: ${course.slug}`);
    ids.add(course.id);
    slugs.add(course.slug);

    assert.match(course.slug, /^[a-z0-9-]+$/, `${course.id}: slug должен быть kebab-case`);
    assert.ok(course.title.length >= 5, `${course.id}: слишком короткий заголовок`);
    assert.ok(course.summary.length >= 40, `${course.id}: слишком короткое описание`);
    assert.ok(Array.isArray(course.weeks) && course.weeks.length > 0, `${course.id}: нет недель`);
    assert.ok(course.chapters.length > 0, `${course.id}: нет глав`);
    assert.equal(course.chapterCount, course.chapters.length, `${course.id}: chapterCount не сходится`);
    assert.ok(course.estimatedMinutes > 0, `${course.id}: нулевая оценка времени`);
    assert.equal(course.unlock, 'sequential');

    const sorted = course.weeks.slice().sort((a, b) => a - b);
    assert.deepEqual(course.weeks, sorted, `${course.id}: недели не по возрастанию`);
  });
});

test('главы: порядок, типы и уникальность id по всему каталогу', () => {
  const seen = new Set();
  doc.courses.forEach((course) => {
    course.chapters.forEach((chapter, index) => {
      assert.equal(chapter.order, index + 1, `${chapter.id}: order не совпадает с позицией`);
      assert.ok(CHAPTER_TYPES.includes(chapter.type), `${chapter.id}: неизвестный тип ${chapter.type}`);
      assert.ok(chapter.title && chapter.title.length > 3, `${chapter.id}: пустой заголовок`);
      assert.ok(chapter.minutes > 0, `${chapter.id}: нет оценки времени`);
      assert.ok(chapter.source && chapter.source.dataset, `${chapter.id}: нет ссылки source`);
      assert.ok(!seen.has(chapter.id), `дубликат id главы: ${chapter.id}`);
      seen.add(chapter.id);
    });
  });
  assert.equal(seen.size, doc.chapterCount);
});

test('тонкий режим: главы-уроки не дублируют текст из study_map', () => {
  const copied = [];
  doc.courses.forEach((course) => {
    course.chapters.forEach((chapter) => {
      if (chapter.type !== 'lesson') return;
      ['objective', 'expectedResult', 'practice', 'pitfalls', 'article', 'level'].forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(chapter, field)) copied.push(`${chapter.id}.${field}`);
      });
    });
  });
  assert.deepEqual(copied, [], 'в тонком режиме текст берётся из study_map.json по ссылке source');
});

test('все ссылки source резолвятся в исходных датасетах', () => {
  const result = checkResolvable(doc);
  assert.equal(result.broken.length, 0, `битые ссылки: ${result.broken.slice(0, 5).join('; ')}`);
  assert.equal(result.checked, doc.chapterCount);
});

test('покрытие: все недели, дни, мини-тесты, недельные тесты и senior-кейсы разложены', () => {
  const studyMap = readTask('study_map.json');
  const studyTests = readTask('study_tests.json');
  const seniorCases = readTask('senior_cases.json');

  const lessons = [];
  const miniIds = new Set();
  const weeklyIds = new Set();
  const caseIds = new Set();
  const weeks = new Set();

  doc.courses.forEach((course) => {
    course.weeks.forEach((week) => {
      assert.ok(!weeks.has(week), `неделя ${week} назначена дважды`);
      weeks.add(week);
    });
    course.chapters.forEach((chapter) => {
      const source = chapter.source;
      if (chapter.type === 'lesson') lessons.push(`${source.week}:${source.day}`);
      if (source.dataset === 'study_tests.json') {
        (source.collection === 'weeklyTests' ? weeklyIds : miniIds).add(source.id);
      }
      if (source.dataset === 'senior_cases.json') caseIds.add(source.id);
    });
  });

  const totalDays = studyMap.weeks.reduce((sum, week) => sum + week.days.length, 0);
  assert.equal(weeks.size, studyMap.weeks.length, 'разложены не все недели');
  assert.equal(lessons.length, totalDays, 'число глав-уроков не равно числу учебных дней');
  assert.equal(new Set(lessons).size, totalDays, 'учебный день попал в каталог дважды');
  assert.equal(miniIds.size, studyTests.miniTests.length, 'привязаны не все мини-тесты');
  assert.equal(weeklyIds.size, studyTests.weeklyTests.length, 'привязаны не все недельные тесты');
  assert.equal(caseIds.size, seniorCases.cases.length, 'привязаны не все senior-кейсы');
});

test('покрытие: тренажёрные датасеты разложены без остатка', () => {
  const collect = (dataset) => {
    const ids = new Set();
    doc.courses.forEach((course) => course.chapters.forEach((chapter) => {
      if (chapter.source.dataset === dataset) ids.add(chapter.source.id);
    }));
    return ids;
  };
  assert.equal(collect('ts.json').size, readTask('ts.json').length, 'не все симуляторы привязаны');
  assert.equal(collect('labs.json').size, readTask('labs.json').length, 'не все лабы привязаны');
  assert.equal(collect('external_tasks.json').size, readTask('external_tasks.json').tasks.length, 'не все внешние задания привязаны');
});

test('requiresCourses: ссылки ведут на существующие курсы без самозависимостей', () => {
  const byId = new Map(doc.courses.map((course) => [course.id, course]));
  let withRequires = 0;

  doc.courses.forEach((course) => {
    assert.ok(Array.isArray(course.requiresCourses), `${course.id}: нет requiresCourses`);
    if (course.requiresCourses.length) withRequires += 1;

    const seen = new Set();
    course.requiresCourses.forEach((link) => {
      assert.ok(byId.has(link.courseId), `${course.id}: ссылка на несуществующий курс ${link.courseId}`);
      assert.notEqual(link.courseId, course.id, `${course.id}: самозависимость`);
      assert.ok(!seen.has(link.courseId), `${course.id}: дубликат зависимости ${link.courseId}`);
      seen.add(link.courseId);
      assert.ok(['text', 'week-order'].includes(link.derivedFrom), `${course.id}: неизвестный derivedFrom ${link.derivedFrom}`);
      assert.equal(link.slug, byId.get(link.courseId).slug);
      assert.equal(link.title, byId.get(link.courseId).title);

      const target = byId.get(link.courseId);
      assert.ok(
        Math.min.apply(null, target.weeks) < Math.min.apply(null, course.weeks),
        `${course.id}: зависимость ${link.courseId} начинается позже — цикл в порядке прохождения`
      );
    });
  });

  assert.equal(withRequires, doc.courses.length - 1, 'зависимостей нет только у первого курса');
  const first = doc.courses.find((course) => !course.requiresCourses.length);
  assert.equal(Math.min.apply(null, first.weeks), 1, 'без зависимостей должен быть только курс с недели 1');
});

test('requiresCourses: связь из текста prerequisites действительно выводится', () => {
  const fromText = doc.courses.filter((course) => course.requiresCourses.some((link) => link.derivedFrom === 'text'));
  // Регрессия: в JS \w не покрывает кириллицу, из-за чего шаблон «недел\w*» не
  // находил «из недели 8» и все связи молча уходили в фолбэк week-order.
  assert.ok(fromText.length >= 10, `связей из текста слишком мало: ${fromText.length}`);
});

test('SIMULATOR_OVERRIDES: применены и не искажают ts.json', () => {
  const simulators = readTask('ts.json');
  const byId = new Map(simulators.map((item) => [item.id, item]));
  const courseIds = new Set(doc.courses.map((course) => course.id));

  Object.keys(SIMULATOR_OVERRIDES).forEach((key) => {
    const id = Number(key);
    const targetCourseId = SIMULATOR_OVERRIDES[key];
    assert.ok(byId.has(id), `override ссылается на несуществующий сценарий ${id}`);
    assert.ok(courseIds.has(targetCourseId), `override ссылается на несуществующий курс ${targetCourseId}`);

    const host = doc.courses.find((course) => course.chapters.some(
      (chapter) => chapter.source.dataset === 'ts.json' && chapter.source.id === id
    ));
    assert.equal(host.id, targetCourseId, `сценарий ${id} попал не в тот курс`);

    const chapter = host.chapters.find((item) => item.source.dataset === 'ts.json' && item.source.id === id);
    // topic остаётся исходным: его читают validate.js (KNOWN_TOPICS) и
    // recordSkillEvent в app.js — накопленная аналитика не должна поехать.
    assert.equal(chapter.topic, byId.get(id).topic, `сценарий ${id}: topic не должен переопределяться`);
    assert.equal(chapter.catalogCourseId, targetCourseId);
  });
});

test('COURSE_PLAN покрывает учебный план целиком и без пересечений', () => {
  const planned = COURSE_PLAN.flatMap((course) => course.weeks);
  const studyMap = readTask('study_map.json');
  assert.equal(new Set(planned).size, planned.length, 'неделя указана в COURSE_PLAN дважды');
  assert.deepEqual(
    planned.slice().sort((a, b) => a - b),
    studyMap.weeks.map((week) => week.week),
    'COURSE_PLAN и study_map расходятся по составу недель'
  );
});
