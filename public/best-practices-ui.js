(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IPMaxBestPracticesUI = api;
})(typeof self !== 'undefined' ? self : globalThis, function() {
  'use strict';

  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Returns the list of topics or an empty array — never throws on bad input.
  function topicsOf(dataset) {
    return dataset && Array.isArray(dataset.topics) ? dataset.topics : [];
  }

  // Picks the topic to display: the requested one, else the remembered one,
  // else the first. Returns null when there are no topics.
  function selectTopic(dataset, requested, remembered) {
    const topics = topicsOf(dataset);
    if (!topics.length) return null;
    return topics.find(topic => topic && topic.topic === requested)
      || topics.find(topic => topic && topic.topic === remembered)
      || topics[0];
  }

  function totalPracticeCount(dataset) {
    return topicsOf(dataset).reduce((sum, topic) =>
      sum + (topic && Array.isArray(topic.practices) ? topic.practices.length : 0), 0);
  }

  // Builds the tab strip markup. The active tab is focusable (tabindex 0) and
  // marked aria-selected, the rest are removed from the tab order.
  function renderTabs(dataset, activeTopic) {
    return topicsOf(dataset).map(topic => {
      const active = topic.topic === activeTopic;
      return '<button type="button" class="practice-tab" role="tab"'
        + ' id="practice-tab-' + escapeHtml(topic.slug) + '"'
        + ' aria-controls="practice-panel"'
        + ' aria-selected="' + (active ? 'true' : 'false') + '"'
        + ' tabindex="' + (active ? '0' : '-1') + '"'
        + ' data-practice-topic="' + escapeHtml(topic.topic) + '">'
        + '<span aria-hidden="true">' + escapeHtml(topic.icon) + '</span>'
        + '<span>' + escapeHtml(topic.topic) + '</span></button>';
    }).join('');
  }

  // Builds the panel body for one topic: header, numbered practice cards, footer.
  function renderPanel(topic, updated) {
    if (!topic) return '<div class="empty-state"><p>Раздел пока недоступен.</p></div>';
    const practices = Array.isArray(topic.practices) ? topic.practices : [];
    const reviewed = escapeHtml(updated || '—');
    return '<div class="practice-panel-head"><div class="practice-topic-icon" aria-hidden="true">'
      + escapeHtml(topic.icon) + '</div><div><div class="practice-kicker">Проверенный рабочий подход</div>'
      + '<h2>' + escapeHtml(topic.topic) + '</h2><p>' + escapeHtml(topic.summary) + '</p></div></div>'
      + '<div class="practice-grid">' + practices.map((practice, index) =>
        '<article class="practice-card"><div class="practice-card-number">'
        + String(index + 1).padStart(2, '0') + '</div><h3>' + escapeHtml(practice.title) + '</h3>'
        + '<p class="practice-why">' + escapeHtml(practice.why) + '</p>'
        + '<div class="practice-action"><span>Применить</span><p>' + escapeHtml(practice.action) + '</p></div></article>'
      ).join('') + '</div>'
      + '<div class="practice-footer"><div><strong>' + practices.length + ' практик</strong>'
      + '<span> · ревизия ' + reviewed + '</span></div>'
      + '<button type="button" class="btn btn-primary" id="practice-trainer" data-topic="'
      + escapeHtml(topic.topic) + '" data-page="' + escapeHtml(topic.trainer || 'exam')
      + '">Перейти к практике →</button></div>';
  }

  // Cyclic neighbour index for ArrowLeft/ArrowRight/Home/End tab navigation.
  function nextTabIndex(key, current, count) {
    if (!count) return 0;
    if (key === 'Home') return 0;
    if (key === 'End') return count - 1;
    const delta = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0;
    return ((current + delta) % count + count) % count;
  }

  return { escapeHtml, topicsOf, selectTopic, totalPracticeCount, renderTabs, renderPanel, nextTabIndex };
});
