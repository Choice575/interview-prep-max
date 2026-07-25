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

  return { STATUS_GROUPS, formatReviewDate, renderTechnologyStatus };
});
