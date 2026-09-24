(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IPMaxCatalogUI = api;
})(typeof self !== 'undefined' ? self : globalThis, function() {
  'use strict';

  const ALL_CATEGORY = 'Все';

  // Метки типов глав. Совпадают с type в tasks/courses.json.
  const CHAPTER_LABELS = {
    lesson: 'Урок',
    test: 'Тест',
    lab: 'Лаб. работа',
    simulator: 'Симулятор'
  };

  const LEVEL_CLASSES = {
    'Старт': 'level-start',
    'Практика': 'level-practice',
    'Вызов': 'level-challenge'
  };

  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Возвращает список курсов или пустой массив — не бросает на плохом входе.
  function coursesOf(dataset) {
    return dataset && Array.isArray(dataset.courses) ? dataset.courses : [];
  }

  // Категории для фильтра: «Все» плюс уникальные в порядке появления курсов.
  function categoriesOf(dataset) {
    const seen = [];
    coursesOf(dataset).forEach(function(course) {
      if (course && course.category && seen.indexOf(course.category) === -1) seen.push(course.category);
    });
    return [ALL_CATEGORY].concat(seen);
  }

  function filterByCategory(dataset, category) {
    const courses = coursesOf(dataset);
    if (!category || category === ALL_CATEGORY) return courses;
    return courses.filter(function(course) { return course.category === category; });
  }

  /**
   * Прогресс курса по завершённым главам.
   * completedIds — множество или объект с id глав; курс считается пройденным,
   * когда пройдены все его главы.
   */
  function courseProgress(course, completedIds) {
    const chapters = course && Array.isArray(course.chapters) ? course.chapters : [];
    const has = completedIds instanceof Set
      ? function(id) { return completedIds.has(id); }
      : function(id) { return !!(completedIds && completedIds[id]); };
    let done = 0;
    chapters.forEach(function(chapter) { if (has(chapter.id)) done += 1; });
    const total = chapters.length;
    return {
      done: done,
      total: total,
      percent: total ? Math.round(done / total * 100) : 0,
      complete: total > 0 && done === total
    };
  }

  // Сводка для шапки каталога: сколько курсов пройдено из общего числа.
  function catalogSummary(dataset, completedIds) {
    const courses = coursesOf(dataset);
    let completed = 0;
    let started = 0;
    let chapters = 0;
    let chaptersDone = 0;
    let minutes = 0;
    courses.forEach(function(course) {
      const progress = courseProgress(course, completedIds);
      if (progress.complete) completed += 1;
      else if (progress.done > 0) started += 1;
      chapters += progress.total;
      chaptersDone += progress.done;
      minutes += course.estimatedMinutes || 0;
    });
    return {
      total: courses.length,
      completed: completed,
      started: started,
      chapters: chapters,
      chaptersDone: chaptersDone,
      hours: Math.round(minutes / 60)
    };
  }

  // Первая непройденная глава — цель кнопки «Продолжить».
  function nextChapter(course, completedIds) {
    const chapters = course && Array.isArray(course.chapters) ? course.chapters : [];
    const has = completedIds instanceof Set
      ? function(id) { return completedIds.has(id); }
      : function(id) { return !!(completedIds && completedIds[id]); };
    for (let index = 0; index < chapters.length; index += 1) {
      if (!has(chapters[index].id)) return chapters[index];
    }
    return null;
  }

  function chapterBreakdown(course) {
    const stats = course && course.stats ? course.stats : {};
    return Object.keys(CHAPTER_LABELS)
      .filter(function(type) { return stats[type]; })
      .map(function(type) { return { type: type, label: CHAPTER_LABELS[type], count: stats[type] }; });
  }

  function renderFilters(dataset, activeCategory) {
    const active = activeCategory || ALL_CATEGORY;
    return categoriesOf(dataset).map(function(category) {
      const isActive = category === active;
      return '<button type="button" class="chip' + (isActive ? ' active' : '') + '"'
        + ' data-catalog-category="' + escapeHtml(category) + '"'
        + ' aria-pressed="' + (isActive ? 'true' : 'false') + '">'
        + escapeHtml(category) + '</button>';
    }).join('');
  }

  function renderSummary(summary) {
    return '<div class="catalog-stats" aria-label="Прогресс по курсам">'
      + '<div><strong>' + summary.completed + '</strong><span>пройдено</span></div>'
      + '<div><strong>' + summary.total + '</strong><span>всего курсов</span></div>'
      + '<div><strong>' + summary.chaptersDone + ' / ' + summary.chapters + '</strong><span>глав</span></div>'
      + '<div><strong>' + summary.hours + ' ч</strong><span>оценка времени</span></div>'
      + '</div>';
  }

  function renderCard(course, completedIds) {
    const progress = courseProgress(course, completedIds);
    const levelClass = LEVEL_CLASSES[course.level] || 'level-practice';
    const requires = Array.isArray(course.requiresCourses) ? course.requiresCourses : [];
    const breakdown = chapterBreakdown(course).map(function(item) {
      return '<span class="catalog-chapter-stat">' + item.count + ' ' + escapeHtml(item.label.toLowerCase()) + '</span>';
    }).join('');
    const requiresHtml = requires.length
      ? '<div class="catalog-requires">Требуется: ' + requires.map(function(link) {
        return '<button type="button" class="catalog-link" data-catalog-course="' + escapeHtml(link.slug) + '">'
          + escapeHtml(link.title) + '</button>';
      }).join(', ') + '</div>'
      : '';

    return '<article class="catalog-card' + (progress.complete ? ' done' : '') + '">'
      + '<div class="catalog-card-head">'
      + '<span class="tag ' + levelClass + '">' + escapeHtml(course.level) + '</span>'
      + '<span class="catalog-category">' + escapeHtml(course.category) + '</span>'
      + '</div>'
      + '<h3>' + escapeHtml(course.title) + '</h3>'
      + '<p class="catalog-summary">' + escapeHtml(course.summary) + '</p>'
      + '<div class="catalog-chapter-stats">' + breakdown + '</div>'
      + requiresHtml
      + '<div class="catalog-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100"'
      + ' aria-valuenow="' + progress.percent + '"'
      + ' aria-label="Прогресс курса ' + escapeHtml(course.title) + '">'
      + '<div class="catalog-progress-bar" style="width:' + progress.percent + '%"></div>'
      + '</div>'
      + '<div class="catalog-card-foot">'
      + '<span class="catalog-progress-text">' + progress.done + ' / ' + progress.total + ' · ' + progress.percent + '%</span>'
      + '<button type="button" class="btn btn-primary btn-sm" data-catalog-open="' + escapeHtml(course.slug) + '">'
      + (progress.done ? 'Продолжить' : 'Начать') + '</button>'
      + '</div>'
      + '</article>';
  }

  function renderGrid(dataset, activeCategory, completedIds) {
    const courses = filterByCategory(dataset, activeCategory);
    if (!courses.length) {
      return '<div class="empty-state"><p>В этой категории пока нет курсов.</p></div>';
    }
    return '<div class="catalog-grid">' + courses.map(function(course) {
      return renderCard(course, completedIds);
    }).join('') + '</div>';
  }

  return {
    ALL_CATEGORY: ALL_CATEGORY,
    CHAPTER_LABELS: CHAPTER_LABELS,
    escapeHtml: escapeHtml,
    coursesOf: coursesOf,
    categoriesOf: categoriesOf,
    filterByCategory: filterByCategory,
    courseProgress: courseProgress,
    catalogSummary: catalogSummary,
    nextChapter: nextChapter,
    chapterBreakdown: chapterBreakdown,
    renderFilters: renderFilters,
    renderSummary: renderSummary,
    renderCard: renderCard,
    renderGrid: renderGrid
  };
});
