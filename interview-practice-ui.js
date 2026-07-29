(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IPMaxInterviewPracticeUI = api;
})(typeof self !== 'undefined' ? self : globalThis, function() {
  function escapeText(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function items(data, kind) {
    if (!data) return [];
    return list(kind === 'star' ? data.star : data.systemDesign);
  }

  function findItem(data, kind, id) {
    const wanted = String(id === undefined || id === null ? '' : id);
    return items(data, kind).find(entry => entry && String(entry.id) === wanted) || null;
  }

  // Self-assessment: the learner ticks the rubric points they actually covered.
  function score(item, checked) {
    const rubric = list(item && item.rubric);
    const marks = list(checked).map(Number).filter(n => Number.isInteger(n) && n >= 0 && n < rubric.length);
    const unique = [...new Set(marks)];
    const total = rubric.length;
    const percent = total ? Math.round(unique.length / total * 100) : 0;
    let verdict;
    if (!total) verdict = 'Рубрика не задана';
    else if (percent === 100) verdict = 'Ответ закрывает все пункты рубрики';
    else if (percent >= 75) verdict = 'Ответ сильный, добейте оставшиеся пункты';
    else if (percent >= 50) verdict = 'Основа есть, половина рубрики не раскрыта';
    else verdict = 'Ответ пока не структурирован — пройдите по рубрике заново';
    return { covered: unique.length, total, percent, verdict, missing: rubric.filter((_, i) => !unique.includes(i)) };
  }

  function renderBullets(title, values, className) {
    const rows = list(values);
    if (!rows.length) return '';
    return '<div class="ip-block ' + className + '"><div class="ip-block-title">' + escapeText(title) +
      '</div><ul>' + rows.map(v => '<li>' + escapeText(v) + '</li>').join('') + '</ul></div>';
  }

  function renderStar(item) {
    if (!item) return '<div class="empty-state"><div class="icon">🎤</div><p>Задание не найдено</p></div>';
    return '<div class="ip-card">' +
      '<div class="ip-kicker">Поведенческий вопрос · ' + escapeText(item.topic) + '</div>' +
      '<h4 class="ip-prompt">' + escapeText(item.prompt) + '</h4>' +
      '<p class="ip-why">' + escapeText(item.why) + '</p>' +
      renderBullets('Как строить ответ', item.hints, 'ip-hints') +
      renderBullets('Типичные ошибки', item.pitfalls, 'ip-pitfalls') +
      '</div>';
  }

  function renderSystemDesign(item) {
    if (!item) return '<div class="empty-state"><div class="icon">🧩</div><p>Задание не найдено</p></div>';
    return '<div class="ip-card">' +
      '<div class="ip-kicker">Проектирование · ' + escapeText(item.topic) + ' · ' + escapeText(item.level) + '</div>' +
      '<h4 class="ip-prompt">' + escapeText(item.title) + '</h4>' +
      '<p class="ip-context">' + escapeText(item.context) + '</p>' +
      renderBullets('Ограничения', item.constraints, 'ip-constraints') +
      '<div class="ip-block ip-task"><div class="ip-block-title">Задача</div><p>' + escapeText(item.task) + '</p></div>' +
      '</div>';
  }

  // The reference answer stays hidden until the learner asks for it.
  function renderReference(item, kind) {
    if (!item) return '';
    if (kind === 'star') {
      return renderBullets('Рубрика самопроверки', item.rubric, 'ip-rubric');
    }
    return renderBullets('Что ждут в ответе', item.expectedPoints, 'ip-expected') +
      renderBullets('Компромиссы', item.tradeoffs, 'ip-tradeoffs') +
      renderBullets('Рубрика самопроверки', item.rubric, 'ip-rubric');
  }

  function renderRubricForm(item, idPrefix) {
    const rubric = list(item && item.rubric);
    if (!rubric.length) return '';
    const prefix = String(idPrefix || 'ip-rb');
    const rows = rubric.map((point, index) => {
      const id = prefix + '-' + index;
      return '<div class="ip-check"><input type="checkbox" id="' + escapeText(id) + '" value="' + index +
        '"><label for="' + escapeText(id) + '">' + escapeText(point) + '</label></div>';
    }).join('');
    return '<div class="ip-rubric-form"><div class="ip-block-title">Отметьте, что вы раскрыли</div>' + rows + '</div>';
  }

  function renderScore(result) {
    if (!result) return '';
    const cls = result.percent >= 75 ? 'ip-score-good' : (result.percent >= 50 ? 'ip-score-mid' : 'ip-score-low');
    const missing = list(result.missing).length
      ? renderBullets('Не раскрыто', result.missing, 'ip-missing')
      : '';
    return '<div class="ip-score ' + cls + '" role="status" aria-live="polite">' +
      '<div class="ip-score-num">' + result.percent + '%</div>' +
      '<div class="ip-score-text"><strong>' + escapeText(result.verdict) + '</strong>' +
      '<span>' + result.covered + ' из ' + result.total + ' пунктов рубрики</span></div></div>' + missing;
  }

  function summary(data) {
    return {
      star: items(data, 'star').length,
      systemDesign: items(data, 'systemDesign').length,
      topics: [...new Set(items(data, 'systemDesign').map(i => i.topic))].sort()
    };
  }

  return {
    items, findItem, score, summary,
    renderStar, renderSystemDesign, renderReference, renderRubricForm, renderScore
  };
});
