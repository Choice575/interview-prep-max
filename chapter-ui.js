(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IPMaxChapterUI = api;
})(typeof self !== 'undefined' ? self : globalThis, function() {
  'use strict';

  // Куда ведёт кнопка «Открыть» для каждого типа главы: страницы главы
  // самодостаточной пока нет, прохождение живёт в существующих разделах.
  const TARGET_PAGES = {
    lesson: 'study',
    test: 'study',
    simulator: 'ts',
    'lab/incident': 'study',
    'lab/fix-bug': 'labs',
    'lab/external': 'external'
  };

  const TYPE_LABELS = {
    lesson: 'Урок',
    test: 'Тест',
    lab: 'Лаб. работа',
    simulator: 'Симулятор'
  };

  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function kindKey(chapter) {
    if (!chapter) return '';
    return chapter.kind ? chapter.type + '/' + chapter.kind : chapter.type;
  }

  function targetPage(chapter) {
    return TARGET_PAGES[kindKey(chapter)] || TARGET_PAGES[chapter && chapter.type] || 'study';
  }

  function findCourse(dataset, slug) {
    const courses = dataset && Array.isArray(dataset.courses) ? dataset.courses : [];
    return courses.find(function(course) { return course.slug === slug; }) || null;
  }

  function findChapter(course, chapterId) {
    if (!course || !Array.isArray(course.chapters)) return null;
    return course.chapters.find(function(chapter) { return chapter.id === chapterId; }) || null;
  }

  // Соседние главы для навигации «назад/вперёд» внутри курса.
  function neighbours(course, chapterId) {
    const chapters = course && Array.isArray(course.chapters) ? course.chapters : [];
    const index = chapters.findIndex(function(chapter) { return chapter.id === chapterId; });
    if (index === -1) return { previous: null, next: null, index: -1, total: chapters.length };
    return {
      previous: index > 0 ? chapters[index - 1] : null,
      next: index < chapters.length - 1 ? chapters[index + 1] : null,
      index: index,
      total: chapters.length
    };
  }

  /**
   * Достаёт содержимое главы из исходного датасета по ссылке source.
   * В courses.json текста нет — только структура, поэтому без резолва
   * страница главы окажется пустой.
   *
   * Возвращает { ok, body, missing }. Поля «решения» (expected, answer, fix,
   * expectedActions) НЕ включаются: они не должны попадать в разметку раньше,
   * чем пользователь ответит.
   */
  function resolveChapter(chapter, datasets) {
    const data = datasets || {};
    const source = (chapter && chapter.source) || {};
    const empty = { ok: false, body: null, missing: source.dataset || 'unknown' };

    if (source.dataset === 'study_map.json') {
      const map = data.studyMap;
      const week = map && Array.isArray(map.weeks)
        ? map.weeks.find(function(item) { return item.week === source.week; })
        : null;
      const day = week && Array.isArray(week.days)
        ? week.days.find(function(item) { return item.day === source.day; })
        : null;
      if (!day) return empty;
      return {
        ok: true,
        missing: null,
        body: {
          kind: 'lesson',
          level: day.level || week.targetLevel || '',
          objective: day.objective || '',
          expectedResult: day.expectedResult || '',
          practice: Array.isArray(day.practice) ? day.practice : [],
          pitfalls: Array.isArray(day.pitfalls) ? day.pitfalls : [],
          weekTitle: week.title || '',
          weekGoal: week.goal || '',
          productionLayer: week.productionLayer || '',
          artifact: week.artifact || ''
        }
      };
    }

    if (source.dataset === 'study_tests.json') {
      const tests = data.studyTests;
      if (!tests) return empty;
      if (source.collection === 'weeklyTests') {
        const test = (tests.weeklyTests || []).find(function(item) { return item.id === source.id; });
        if (!test) return empty;
        const parts = test.parts || {};
        return {
          ok: true,
          missing: null,
          body: {
            kind: 'weekly',
            maxScore: test.maxScore || 0,
            parts: Object.keys(parts).map(function(name) {
              return { name: name, score: parts[name] && parts[name].score || 0 };
            })
          }
        };
      }
      const test = (tests.miniTests || []).find(function(item) { return item.id === source.id; });
      if (!test) return empty;
      const questions = Array.isArray(test.questions) ? test.questions : [];
      return {
        ok: true,
        missing: null,
        body: {
          kind: 'mini',
          // Только тексты вопросов: expected остаётся в датасете.
          questions: questions.map(function(item) { return item.q || ''; }),
          maxScore: questions.reduce(function(sum, item) { return sum + (item.score || 0); }, 0),
          commonMistakes: Array.isArray(test.commonMistakes) ? test.commonMistakes : []
        }
      };
    }

    if (source.dataset === 'senior_cases.json') {
      const cases = data.seniorCases;
      const item = cases && Array.isArray(cases.cases)
        ? cases.cases.find(function(entry) { return entry.id === source.id; })
        : null;
      if (!item) return empty;
      return {
        ok: true,
        missing: null,
        body: {
          kind: 'incident',
          level: item.level || '',
          topic: item.topic || '',
          context: item.context || '',
          evidence: Array.isArray(item.evidence) ? item.evidence : [],
          task: item.task || ''
          // expectedActions и scoring намеренно не отдаём: это эталон.
        }
      };
    }

    if (source.dataset === 'labs.json') {
      const labs = Array.isArray(data.labs) ? data.labs : [];
      const item = labs.find(function(entry) { return entry.id === source.id; });
      if (!item) return empty;
      return {
        ok: true,
        missing: null,
        body: {
          kind: 'fix-bug',
          topic: item.topic || '',
          scenario: item.scenario || '',
          code: item.code || '',
          question: item.question || ''
          // bug, fix и answer — эталон, в разметку не попадают.
        }
      };
    }

    if (source.dataset === 'external_tasks.json') {
      const external = data.externalTasks;
      const item = external && Array.isArray(external.tasks)
        ? external.tasks.find(function(entry) { return entry.id === source.id; })
        : null;
      if (!item) return empty;
      return {
        ok: true,
        missing: null,
        body: {
          kind: 'external',
          topic: item.topic || '',
          difficulty: item.difficulty || '',
          description: item.description || '',
          evidenceType: Array.isArray(item.evidenceType) ? item.evidenceType : [],
          points: item.points || 0
        }
      };
    }

    if (source.dataset === 'ts.json') {
      const simulators = Array.isArray(data.simulators) ? data.simulators : [];
      const item = simulators.find(function(entry) { return entry.id === source.id; });
      if (!item) return empty;
      return {
        ok: true,
        missing: null,
        body: {
          kind: 'simulator',
          topic: item.topic || '',
          context: item.context || '',
          steps: item.nodes ? Object.keys(item.nodes).length : 0
        }
      };
    }

    return empty;
  }

  function list(items, className) {
    if (!items || !items.length) return '';
    return '<ul class="' + className + '">' + items.map(function(item) {
      return '<li>' + escapeHtml(item) + '</li>';
    }).join('') + '</ul>';
  }

  function block(title, inner) {
    if (!inner) return '';
    return '<section class="chapter-block"><h3>' + escapeHtml(title) + '</h3>' + inner + '</section>';
  }

  function paragraph(text) {
    return text ? '<p>' + escapeHtml(text) + '</p>' : '';
  }

  function renderBody(body) {
    if (!body) return '';

    if (body.kind === 'lesson') {
      return block('Цель', paragraph(body.objective))
        + block('Практика', body.practice.length
          ? '<div class="chapter-commands">' + body.practice.map(function(command) {
            return '<code class="chapter-command">' + escapeHtml(command) + '</code>';
          }).join('') + '</div>'
          : '')
        + block('Ожидаемый результат', paragraph(body.expectedResult))
        + block('Типовые ошибки', list(body.pitfalls, 'chapter-list'))
        + block('Production-слой недели', paragraph(body.productionLayer))
        + block('Артефакт недели', paragraph(body.artifact));
    }

    if (body.kind === 'mini') {
      return block('Вопросы (' + body.questions.length + ')', list(body.questions, 'chapter-list chapter-questions'))
        + block('Частые ошибки', list(body.commonMistakes, 'chapter-list'))
        + '<p class="chapter-note">Эталонные ответы открываются после того, как вы ответите'
        + ' — в разделе «Учёба».</p>';
    }

    if (body.kind === 'weekly') {
      return block('Части теста', '<ul class="chapter-list">' + body.parts.map(function(part) {
        return '<li>' + escapeHtml(part.name) + ' — ' + part.score + ' баллов</li>';
      }).join('') + '</ul>')
        + '<p class="chapter-note">Максимум ' + body.maxScore + ' баллов. Проходной балл и проверка — в разделе «Учёба».</p>';
    }

    if (body.kind === 'incident') {
      return block('Контекст', paragraph(body.context))
        + block('Что видно', body.evidence.length
          ? '<pre class="chapter-evidence">' + escapeHtml(body.evidence.join('\n')) + '</pre>'
          : '')
        + block('Задача', paragraph(body.task))
        + '<p class="chapter-note">Разбор и ожидаемые действия — после вашего ответа.</p>';
    }

    if (body.kind === 'fix-bug') {
      return block('Сценарий', paragraph(body.scenario))
        + block('Код', body.code ? '<pre class="chapter-evidence">' + escapeHtml(body.code) + '</pre>' : '')
        + block('Вопрос', paragraph(body.question))
        + '<p class="chapter-note">Варианты ответа — в тренажёре «Debugging».</p>';
    }

    if (body.kind === 'external') {
      return block('Задание', paragraph(body.description))
        + block('Доказательство результата', list(body.evidenceType, 'chapter-list'))
        + '<p class="chapter-note">Уровень: ' + escapeHtml(body.difficulty) + ' · ' + body.points + ' баллов.</p>';
    }

    if (body.kind === 'simulator') {
      return block('Ситуация', paragraph(body.context))
        + '<p class="chapter-note">Ветвящийся сценарий, ' + body.steps + ' состояний. Проходится в разделе «Диагностика».</p>';
    }

    return '';
  }

  function renderHeader(course, chapter, position, complete) {
    const label = TYPE_LABELS[chapter.type] || chapter.type;
    const weekPart = chapter.week ? ' · неделя ' + chapter.week + (chapter.day ? ', день ' + chapter.day : '') : '';
    return '<section class="chapter-hero">'
      + '<div class="chapter-kicker">'
      + '<button type="button" class="catalog-link" data-chapter-course="' + escapeHtml(course.slug) + '">'
      + escapeHtml(course.title) + '</button>'
      + ' · глава ' + (position.index + 1) + ' из ' + position.total + '</div>'
      + '<h2>' + escapeHtml(chapter.title) + '</h2>'
      + '<div class="chapter-meta">'
      + '<span class="tag tag-sc">' + escapeHtml(label) + '</span>'
      + '<span class="chapter-meta-text">' + escapeHtml(String(chapter.minutes || 0)) + ' мин' + escapeHtml(weekPart) + '</span>'
      + (complete ? '<span class="chapter-done">Пройдено</span>' : '')
      + '</div></section>';
  }

  function renderNav(position) {
    const previous = position.previous
      ? '<button type="button" class="btn btn-outline btn-sm" data-chapter-open="' + escapeHtml(position.previous.id) + '">← ' + escapeHtml(position.previous.title) + '</button>'
      : '<span></span>';
    const next = position.next
      ? '<button type="button" class="btn btn-outline btn-sm" data-chapter-open="' + escapeHtml(position.next.id) + '">' + escapeHtml(position.next.title) + ' →</button>'
      : '<span></span>';
    return '<nav class="chapter-nav" aria-label="Навигация по главам">' + previous + next + '</nav>';
  }

  /**
   * Полная разметка страницы главы.
   * complete — пройдена ли глава (считается снаружи, из localStorage).
   */
  function renderChapter(course, chapter, resolved, position, complete) {
    if (!course || !chapter) {
      return '<div class="empty-state"><p>Глава не найдена.</p></div>';
    }
    if (!resolved || !resolved.ok) {
      return renderHeader(course, chapter, position, complete)
        + '<div class="empty-state"><p>Не удалось загрузить содержимое главы'
        + (resolved && resolved.missing ? ' (' + escapeHtml(resolved.missing) + ')' : '')
        + '.</p></div>'
        + renderNav(position);
    }
    return renderHeader(course, chapter, position, complete)
      + '<div class="chapter-body">' + renderBody(resolved.body) + '</div>'
      + '<div class="chapter-actions">'
      + '<button type="button" class="btn btn-primary" data-chapter-start="' + escapeHtml(chapter.id) + '">'
      + (complete ? 'Повторить' : 'Перейти к прохождению') + '</button>'
      + '<button type="button" class="btn btn-outline tutor-open-btn" data-tutor-open="course">Спросить AI-учителя</button>'
      + '</div>'
      + renderNav(position);
  }

  return {
    TARGET_PAGES: TARGET_PAGES,
    TYPE_LABELS: TYPE_LABELS,
    escapeHtml: escapeHtml,
    kindKey: kindKey,
    targetPage: targetPage,
    findCourse: findCourse,
    findChapter: findChapter,
    neighbours: neighbours,
    resolveChapter: resolveChapter,
    renderBody: renderBody,
    renderChapter: renderChapter
  };
});
