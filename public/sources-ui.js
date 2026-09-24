(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IPMaxSourcesUI = api;
})(typeof self !== 'undefined' ? self : globalThis, function() {
  const DAY_MS = 86400000;

  function escapeText(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Only http(s) links may be rendered as anchors.
  function safeUrl(value) {
    const text = String(value || '').trim();
    return /^https:\/\/[^\s"'<>]+$/i.test(text) ? text : null;
  }

  function parseDay(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const stamp = Date.parse(value + 'T00:00:00Z');
    return Number.isFinite(stamp) ? stamp : null;
  }

  function findTopic(sources, topic) {
    const list = sources && Array.isArray(sources.topics) ? sources.topics : [];
    const name = String(topic === undefined || topic === null ? '' : topic);
    return list.find(entry => entry && String(entry.topic) === name) || null;
  }

  // A topic is stale when lastReviewed + reviewCadenceDays is in the past.
  function freshness(entry, now) {
    if (!entry) return { known: false, stale: false, daysLeft: null };
    const reviewed = parseDay(entry.lastReviewed);
    const cadence = Number(entry.reviewCadenceDays);
    if (reviewed === null || !Number.isFinite(cadence) || cadence <= 0) {
      return { known: false, stale: false, daysLeft: null };
    }
    const current = Number.isFinite(now) ? now : Date.now();
    const due = reviewed + cadence * DAY_MS;
    return {
      known: true,
      stale: current > due,
      daysLeft: Math.round((due - current) / DAY_MS),
      dueDate: new Date(due).toISOString().slice(0, 10)
    };
  }

  function renderBadge(sources, topic, now) {
    const entry = findTopic(sources, topic);
    if (!entry) return '';
    const state = freshness(entry, now);
    const url = safeUrl(entry.source);
    const label = state.stale ? 'требует проверки' : 'проверено ' + escapeText(entry.lastReviewed);
    const cls = state.stale ? 'source-badge source-badge-stale' : 'source-badge';
    const title = state.known
      ? (state.stale
          ? 'Срок ревизии истёк ' + escapeText(state.dueDate) + ': сверьте с документацией'
          : 'Следующая проверка: ' + escapeText(state.dueDate))
      : 'Дата ревизии не указана';

    const text = '<span class="' + cls + '" title="' + title + '">🔎 ' + label + '</span>';
    if (!url) return text;
    return text + ' <a class="source-link" href="' + escapeText(url) +
      '" target="_blank" rel="noopener noreferrer">документация</a>';
  }

  function summarize(sources, now) {
    const list = sources && Array.isArray(sources.topics) ? sources.topics : [];
    const rows = list.map(entry => {
      const state = freshness(entry, now);
      return {
        topic: entry.topic,
        questionCount: Number(entry.questionCount) || 0,
        lastReviewed: entry.lastReviewed,
        dueDate: state.dueDate || null,
        stale: state.stale,
        daysLeft: state.daysLeft,
        source: safeUrl(entry.source),
        note: entry.note || ''
      };
    });
    return {
      total: rows.length,
      stale: rows.filter(row => row.stale).length,
      soon: rows.filter(row => !row.stale && row.daysLeft !== null && row.daysLeft <= 30).length,
      rows: rows.sort((a, b) => (a.daysLeft === null ? 1e9 : a.daysLeft) - (b.daysLeft === null ? 1e9 : b.daysLeft))
    };
  }

  function renderPanel(sources, now) {
    const summary = summarize(sources, now);
    if (!summary.total) {
      return '<div class="empty-state"><div class="icon">🔎</div><p>Источники не загружены</p></div>';
    }

    const head = summary.stale
      ? '<p class="sources-lead sources-lead-stale">Темы с истёкшим сроком ревизии: ' + summary.stale +
        '. Сверьте материал с официальной документацией.</p>'
      : '<p class="sources-lead">Все темы сверялись с документацией в срок.</p>';

    const rows = summary.rows.map(row => {
      const badge = row.stale
        ? '<span class="source-badge source-badge-stale">просрочено</span>'
        : '<span class="source-badge">' + (row.daysLeft !== null ? 'через ' + row.daysLeft + ' дн.' : '—') + '</span>';
      const link = row.source
        ? '<a class="source-link" href="' + escapeText(row.source) + '" target="_blank" rel="noopener noreferrer">документация</a>'
        : '';
      return '<tr><td>' + escapeText(row.topic) + '</td><td>' + row.questionCount +
        '</td><td>' + escapeText(row.lastReviewed) + '</td><td>' + escapeText(row.dueDate || '—') +
        '</td><td>' + badge + ' ' + link + '</td></tr>';
    }).join('');

    return '<div class="sources-report" role="status" aria-live="polite">' + head +
      '<table class="sources-table"><thead><tr><th>Тема</th><th>Вопросов</th>' +
      '<th>Проверено</th><th>Следующая проверка</th><th>Статус</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>' +
      '<p class="sources-note">Ссылки ведут на официальную документацию по теме, а не на отдельный вопрос.</p></div>';
  }

  return { findTopic, freshness, summarize, renderBadge, renderPanel, safeUrl };
});
