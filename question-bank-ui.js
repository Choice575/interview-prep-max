(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IPMaxQuestionBankUI = api;
})(typeof self !== 'undefined' ? self : globalThis, function() {
  'use strict';

  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Категории или пустой массив — на некорректных данных не бросаем.
  function categoriesOf(dataset) {
    return dataset && Array.isArray(dataset.categories) ? dataset.categories : [];
  }

  function questionsOf(category) {
    return category && Array.isArray(category.questions) ? category.questions : [];
  }

  function totalQuestions(dataset) {
    return categoriesOf(dataset).reduce(function(sum, category) {
      return sum + questionsOf(category).length;
    }, 0);
  }

  // Категория для показа: запрошенная, иначе запомненная, иначе первая.
  function selectCategory(dataset, requested, remembered) {
    const categories = categoriesOf(dataset);
    if (!categories.length) return null;
    return categories.find(function(c) { return c && c.slug === requested; })
      || categories.find(function(c) { return c && c.slug === remembered; })
      || categories[0];
  }

  function findQuestion(dataset, questionId) {
    if (!questionId) return null;
    const categories = categoriesOf(dataset);
    for (let i = 0; i < categories.length; i += 1) {
      const found = questionsOf(categories[i]).find(function(q) { return q && q.id === questionId; });
      if (found) return { category: categories[i], question: found };
    }
    return null;
  }

  /**
   * Поиск по вопросу, ответу и ключевым пунктам. Пустой запрос возвращает всё.
   * Уровень 'all' не фильтрует.
   */
  function filterQuestions(category, query, level) {
    const needle = String(query || '').trim().toLowerCase();
    const wantLevel = level && level !== 'all' ? level : null;
    return questionsOf(category).filter(function(q) {
      if (wantLevel && q.level !== wantLevel) return false;
      if (!needle) return true;
      const haystack = [q.q, q.answer, (q.keyPoints || []).join(' ')].join(' ').toLowerCase();
      return haystack.indexOf(needle) !== -1;
    });
  }

  function levelCounts(category) {
    return questionsOf(category).reduce(function(acc, q) {
      acc[q.level] = (acc[q.level] || 0) + 1;
      return acc;
    }, {});
  }

  function renderTabs(dataset, activeSlug) {
    return categoriesOf(dataset).map(function(category) {
      const active = category.slug === activeSlug;
      const count = questionsOf(category).length;
      return '<button type="button" class="qbank-tab" role="tab"'
        + ' id="qbank-tab-' + escapeHtml(category.slug) + '"'
        + ' aria-controls="qbank-panel"'
        + ' aria-selected="' + (active ? 'true' : 'false') + '"'
        + ' tabindex="' + (active ? '0' : '-1') + '"'
        + ' data-qbank-category="' + escapeHtml(category.slug) + '">'
        + '<span aria-hidden="true">' + escapeHtml(category.icon) + '</span>'
        + '<span>' + escapeHtml(category.title) + '</span>'
        + '<span class="qbank-tab-count">' + count + '</span></button>';
    }).join('');
  }

  function renderList(questions, expandedId) {
    if (!questions.length) {
      return '<div class="empty-state"><p>Ничего не найдено. Измените запрос или уровень.</p></div>';
    }
    return questions.map(function(q) {
      const open = q.id === expandedId;
      return '<article class="qbank-item' + (open ? ' is-open' : '') + '" id="qbank-item-' + escapeHtml(q.id) + '">'
        + '<button type="button" class="qbank-question" data-qbank-toggle="' + escapeHtml(q.id) + '"'
        + ' aria-expanded="' + (open ? 'true' : 'false') + '"'
        + ' aria-controls="qbank-answer-' + escapeHtml(q.id) + '">'
        + '<span class="qbank-level qbank-level-' + escapeHtml(String(q.level).toLowerCase()) + '">'
        + escapeHtml(q.level) + '</span>'
        + '<span class="qbank-question-text">' + escapeHtml(q.q) + '</span>'
        + '<span class="qbank-chevron" aria-hidden="true">' + (open ? '−' : '+') + '</span>'
        + '</button>'
        + '<div class="qbank-answer" id="qbank-answer-' + escapeHtml(q.id) + '"'
        + (open ? '' : ' hidden') + '>' + renderAnswer(q) + '</div>'
        + '</article>';
    }).join('');
  }

  // Ответ раскрывается только по действию пользователя: подсматривать
  // готовый текст до попытки ответить самому — плохая практика подготовки.
  function renderAnswer(q) {
    if (!q) return '';
    const keyPoints = Array.isArray(q.keyPoints) ? q.keyPoints : [];
    const commands = Array.isArray(q.commands) ? q.commands : [];
    return '<div class="qbank-answer-text">' + escapeHtml(q.answer) + '</div>'
      + (keyPoints.length
        ? '<div class="qbank-block"><h4>Ключевые тезисы</h4><ul class="qbank-points">'
          + keyPoints.map(function(point) { return '<li>' + escapeHtml(point) + '</li>'; }).join('')
          + '</ul></div>'
        : '')
      + (commands.length
        ? '<div class="qbank-block"><h4>Команды</h4><div class="qbank-commands">'
          + commands.map(function(cmd) { return '<code>' + escapeHtml(cmd) + '</code>'; }).join('')
          + '</div></div>'
        : '')
      + (q.pitfall
        ? '<div class="qbank-pitfall"><strong>Подводный камень</strong><p>'
          + escapeHtml(q.pitfall) + '</p></div>'
        : '');
  }

  function renderPanel(category, questions, expandedId) {
    if (!category) return '<div class="empty-state"><p>Банк вопросов недоступен.</p></div>';
    const counts = levelCounts(category);
    const shown = questions.length;
    const total = questionsOf(category).length;
    return '<div class="qbank-panel-head">'
      + '<div class="qbank-panel-icon" aria-hidden="true">' + escapeHtml(category.icon) + '</div>'
      + '<div><h2>' + escapeHtml(category.title) + '</h2>'
      + '<p>' + escapeHtml(category.summary) + '</p>'
      + '<div class="qbank-panel-meta">'
      + '<span>' + shown + ' из ' + total + '</span>'
      + (counts.Junior ? '<span>Junior: ' + counts.Junior + '</span>' : '')
      + (counts.Middle ? '<span>Middle: ' + counts.Middle + '</span>' : '')
      + (counts.Senior ? '<span>Senior: ' + counts.Senior + '</span>' : '')
      + '</div></div></div>'
      + '<div class="qbank-list">' + renderList(questions, expandedId) + '</div>';
  }

  // Циклический сосед для навигации по вкладкам стрелками.
  function nextTabIndex(key, current, count) {
    if (!count) return 0;
    if (key === 'Home') return 0;
    if (key === 'End') return count - 1;
    const delta = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0;
    return ((current + delta) % count + count) % count;
  }

  return {
    escapeHtml: escapeHtml,
    categoriesOf: categoriesOf,
    questionsOf: questionsOf,
    totalQuestions: totalQuestions,
    selectCategory: selectCategory,
    findQuestion: findQuestion,
    filterQuestions: filterQuestions,
    levelCounts: levelCounts,
    renderTabs: renderTabs,
    renderList: renderList,
    renderAnswer: renderAnswer,
    renderPanel: renderPanel,
    nextTabIndex: nextTabIndex
  };
});
