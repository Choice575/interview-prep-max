(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IPMaxStudyUI = api;
})(typeof self !== 'undefined' ? self : globalThis, function() {
  const STATUS_GROUPS = [
    { key: 'preferred', label: 'Предпочтительно' },
    { key: 'current', label: 'Актуально' },
    { key: 'legacy', label: 'Legacy' },
    { key: 'eol', label: 'EOL' },
    { key: 'overviewOnly', label: 'Только обзор' },
    { key: 'optional', label: 'Опционально' },
  ];

  function defaultEscape(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatReviewDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    return match ? `${match[3]}.${match[2]}.${match[1]}` : '';
  }

  function renderExpectedResult(value, escapeHtml) {
    const result = String(value || '').trim();
    if (!result) return '';
    const esc = typeof escapeHtml === 'function' ? escapeHtml : defaultEscape;
    return '<div class="study-expected-result">' +
      '<div class="study-outcome-label">Проверяемый результат</div>' +
      '<p>' + esc(result) + '</p></div>';
  }

  function renderWeekContext(week, escapeHtml) {
    if (!week || typeof week !== 'object' || Array.isArray(week)) return '';
    const esc = typeof escapeHtml === 'function' ? escapeHtml : defaultEscape;
    const productionLayer = String(week.productionLayer || '').trim();
    const prerequisites = Array.isArray(week.prerequisites)
      ? week.prerequisites.filter(value => String(value || '').trim())
      : [];
    if (!productionLayer && !prerequisites.length) return '';

    const productionMarkup = productionLayer
      ? '<div class="study-context-block study-context-production">' +
          '<div class="study-context-label">Production-слой</div>' +
          '<p>' + esc(productionLayer) + '</p>' +
        '</div>'
      : '';
    const prerequisitesMarkup = prerequisites.length
      ? '<div class="study-context-block study-context-prerequisites">' +
          '<div class="study-context-label">Входные условия</div>' +
          '<ul>' + prerequisites.map(value => '<li>' + esc(value) + '</li>').join('') + '</ul>' +
        '</div>'
      : '';

    return '<div class="study-week-context' + (productionMarkup && prerequisitesMarkup ? ' has-prerequisites' : '') + '">' +
      productionMarkup + prerequisitesMarkup + '</div>';
  }

  function renderWeekOutcome(week, completedCriteria, escapeHtml) {
    if (!week || typeof week !== 'object' || Array.isArray(week)) return '';
    const esc = typeof escapeHtml === 'function' ? escapeHtml : defaultEscape;
    const artifact = String(week.artifact || '').trim();
    const criteria = Array.isArray(week.completionCriteria)
      ? week.completionCriteria.filter(value => String(value || '').trim())
      : [];
    if (!artifact && !criteria.length) return '';

    const completed = Array.isArray(completedCriteria) ? completedCriteria : [];
    const completedCount = criteria.reduce((total, value, index) => total + (completed[index] === true ? 1 : 0), 0);
    const artifactMarkup = artifact
      ? '<div class="study-artifact"><div class="study-outcome-label">Артефакт недели</div><p>' + esc(artifact) + '</p></div>'
      : '';
    const criteriaMarkup = criteria.length
      ? '<div class="study-criteria"><div class="study-criteria-head"><h4>Критерии завершения</h4>' +
          '<span aria-live="polite">' + completedCount + ' / ' + criteria.length + '</span></div>' +
          '<div class="study-criteria-list">' + criteria.map((value, index) =>
            '<label class="study-criterion' + (completed[index] === true ? ' is-complete' : '') + '">' +
              '<input type="checkbox" data-study-criterion="' + index + '"' + (completed[index] === true ? ' checked' : '') + '>' +
              '<span class="study-criterion-box" aria-hidden="true"></span>' +
              '<span class="study-criterion-text">' + esc(value) + '</span>' +
            '</label>'
          ).join('') + '</div></div>'
      : '';

    return '<section class="study-card study-outcome">' +
      '<div class="study-outcome-kicker">Результат недели</div><h3>Что должно остаться после практики</h3>' +
      artifactMarkup + criteriaMarkup + '</section>';
  }

  function renderAITrack(track, escapeHtml) {
    if (!track || typeof track !== 'object' || Array.isArray(track)) return '';
    const esc = typeof escapeHtml === 'function' ? escapeHtml : defaultEscape;
    const title = String(track.title || '').trim();
    const result = String(track.result || '').trim();
    if (!title && !result) return '';
    const optional = track.optional === true;
    const visibleTitle = title || 'AI-дополнение недели';
    const resultMarkup = result && result !== title
      ? '<p class="study-ai-result"><span>Результат</span>' + esc(result) + '</p>'
      : '';

    return '<section class="study-card study-ai-track">' +
      '<div class="study-ai-mark" aria-hidden="true"><span>AI</span></div>' +
      '<div class="study-ai-content"><div class="study-ai-head"><span>AI-трек</span>' +
        (optional ? '<strong>Опционально</strong>' : '') + '</div>' +
        '<h3>' + esc(visibleTitle) + '</h3>' + resultMarkup +
        (optional ? '<p class="study-ai-policy">Не влияет на завершение DevOps-недели</p>' : '') +
      '</div></section>';
  }

  function renderTechnologyStatus(status, escapeHtml) {
    if (!status || typeof status !== 'object' || Array.isArray(status)) return '';
    const esc = typeof escapeHtml === 'function' ? escapeHtml : defaultEscape;
    const groups = STATUS_GROUPS.map(group => ({
      ...group,
      values: Array.isArray(status[group.key]) ? status[group.key].filter(value => String(value || '').trim()) : [],
    })).filter(group => group.values.length);
    if (!groups.length) return '';

    const reviewed = formatReviewDate(status.lastReviewed);
    const source = String(status.source || '').trim();
    const note = String(status.note || '').trim();
    const groupsMarkup = groups.map(group =>
      '<div class="study-tech-group study-tech-' + group.key + '">' +
        '<div class="study-tech-label"><span aria-hidden="true"></span>' + esc(group.label) + '</div>' +
        '<div class="study-tech-items">' + group.values.map(value => '<span>' + esc(value) + '</span>').join('') + '</div>' +
      '</div>'
    ).join('');

    return '<section class="study-tech-panel" aria-label="Статус технологий">' +
      '<div class="study-tech-head"><div><div class="study-tech-eyebrow">Технологический радар</div>' +
      (reviewed ? '<div class="study-tech-reviewed">Проверено ' + esc(reviewed) + '</div>' : '') + '</div>' +
      (source ? '<div class="study-tech-source" title="Контрольный источник">' + esc(source) + '</div>' : '') + '</div>' +
      '<div class="study-tech-groups">' + groupsMarkup + '</div>' +
      (note ? '<p class="study-tech-note">' + esc(note) + '</p>' : '') +
      '</section>';
  }

  return { STATUS_GROUPS, formatReviewDate, renderExpectedResult, renderWeekContext, renderWeekOutcome, renderAITrack, renderTechnologyStatus };
});
