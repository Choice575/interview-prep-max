(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IPMaxAITutorUI = api;
})(typeof self !== 'undefined' ? self : globalThis, function() {
  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function escapeText(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function sourceLabel(source) {
    if (source === 'local') return 'Локальный учитель';
    if (source === 'mock') return 'Тестовый AI-учитель';
    return 'AI-учитель';
  }

  function bullets(title, items, className) {
    const values = list(items).filter(Boolean);
    return values.length
      ? '<section class="tutor-block ' + className + '"><h4>' + escapeText(title) + '</h4><ul>' +
        values.map(item => '<li>' + escapeText(item) + '</li>').join('') + '</ul></section>'
      : '';
  }

  function codeBlock(command, index) {
    if (!command) return '';
    return '<div class="tutor-code"><pre><code>' + escapeText(command) + '</code></pre>' +
      '<button type="button" class="btn btn-outline btn-sm" data-tutor-copy-index="' + index + '">Копировать</button></div>';
  }

  function header(result) {
    return '<header class="tutor-result-head"><span class="tutor-source">' + escapeText(sourceLabel(result.source)) +
      '</span><h3>' + escapeText(result.title) + '</h3></header>';
  }

  function renderExplanation(result) {
    let copyIndex = 0;
    const sections = list(result.sections).map(item =>
      '<article class="tutor-section"><h4>' + escapeText(item.title) + '</h4><p>' + escapeText(item.text) + '</p></article>'
    ).join('');
    const actions = list(result.nextActions).map(item =>
      '<article class="tutor-action"><strong>' + escapeText(item.action) + '</strong><span>Готово, когда: ' +
      escapeText(item.successCriterion) + '</span></article>'
    ).join('');
    const example = result.example && (result.example.description || result.example.code)
      ? '<section class="tutor-block tutor-example"><h4>Пример</h4><p>' + escapeText(result.example.description) + '</p>' +
        codeBlock(result.example.code, copyIndex++) + '</section>'
      : '';
    const check = result.checkQuestion && result.checkQuestion.question
      ? '<section class="tutor-block tutor-check-question"><h4>Проверьте понимание</h4><p>' +
        escapeText(result.checkQuestion.question) + '</p></section>' : '';
    return header(result) + '<p class="tutor-summary">' + escapeText(result.summary) + '</p>' +
      '<section class="tutor-sections">' + sections + '</section>' + example + check +
      (actions ? '<section class="tutor-block tutor-actions"><h4>Что сделать дальше</h4>' + actions + '</section>' : '') +
      (result.caution ? '<p class="tutor-caution">' + escapeText(result.caution) + '</p>' : '');
  }

  function renderSocratic(result) {
    const complete = result.complete === true;
    return header(result) + '<div class="tutor-turn">Ход ' + escapeText(Math.min(5, result.turn + 1)) + ' из 5</div>' +
      '<section class="tutor-block"><h4>Обратная связь</h4><p>' + escapeText(result.feedback) + '</p></section>' +
      (result.hint ? '<section class="tutor-block tutor-hint"><h4>Подсказка</h4><p>' + escapeText(result.hint) + '</p></section>' : '') +
      (complete
        ? '<section class="tutor-block tutor-complete"><h4>Опрос завершён</h4><p>' + escapeText(result.summary) + '</p></section>'
        : '<section class="tutor-block tutor-next-question"><h4>Следующий вопрос</h4><p>' + escapeText(result.nextQuestion) +
          '</p><label for="ai-tutor-socratic-answer">Ваш ответ</label><textarea id="ai-tutor-socratic-answer" data-tutor-socratic-answer maxlength="3000"></textarea>' +
          '<button type="button" class="btn btn-primary tutor-socratic-submit" data-tutor-action="submit-socratic">Ответить</button></section>') +
      (result.caution ? '<p class="tutor-caution">' + escapeText(result.caution) + '</p>' : '');
  }

  function renderPractice(result) {
    let copyIndex = 0;
    const checks = list(result.checks).map(item =>
      '<article class="tutor-check"><strong>' + escapeText(item.description) + '</strong>' + codeBlock(item.command, copyIndex++) +
      '<span>Ожидается: ' + escapeText(item.expectedResult) + '</span></article>'
    ).join('');
    const next = result.nextStep || {};
    return header(result) + '<p class="tutor-summary">' + escapeText(result.meaning) + '</p>' +
      bullets('Вероятные причины', result.causes, 'tutor-causes') +
      (checks ? '<section class="tutor-block tutor-checks"><h4>Безопасные проверки</h4>' + checks + '</section>' : '') +
      '<section class="tutor-block tutor-next-step"><h4>Следующий шаг</h4><p>' + escapeText(next.description) + '</p>' +
      codeBlock(next.command, copyIndex++) + '<span>Ожидается: ' + escapeText(next.expectedResult) + '</span></section>' +
      bullets('Условия остановки', result.stopConditions, 'tutor-stop') +
      (result.caution ? '<p class="tutor-caution">' + escapeText(result.caution) + '</p>' : '');
  }

  function renderTutorResponse(result) {
    if (!result || typeof result !== 'object') return '';
    if (result.mode === 'socratic') return renderSocratic(result);
    if (result.mode === 'practice') return renderPractice(result);
    return renderExplanation(result);
  }

  function renderTutorModal() {
    return '<div class="modal-overlay" id="ai-tutor-modal" aria-hidden="true">' +
      '<div class="modal tutor-modal" role="dialog" aria-modal="true" aria-labelledby="ai-tutor-title" tabindex="-1">' +
      '<header class="tutor-modal-head"><div><span class="practice-kicker">Контекстный наставник</span><h3 id="ai-tutor-title">AI-учитель</h3>' +
      '<p id="ai-tutor-context-label"></p></div><button type="button" class="btn-icon" data-tutor-action="close" aria-label="Закрыть AI-учителя">✕</button></header>' +
      '<div class="tutor-mode-tabs" role="tablist" aria-label="Режим AI-учителя">' +
      '<button type="button" class="chip active" data-tutor-mode="explain" role="tab" aria-selected="true">Объяснение</button>' +
      '<button type="button" class="chip" data-tutor-mode="socratic" role="tab" aria-selected="false">Опрос</button>' +
      '<button type="button" class="chip" data-tutor-mode="practice" role="tab" aria-selected="false">Практика</button></div>' +
      '<label for="ai-tutor-question">Ваш вопрос или цель</label><textarea id="ai-tutor-question" maxlength="2000" placeholder="Например: объясни проще или проверь, с чего начать диагностику"></textarea>' +
      '<div id="ai-tutor-practice-wrap" hidden><label for="ai-tutor-practice-input">Команда, вывод или ошибка</label>' +
      '<textarea id="ai-tutor-practice-input" maxlength="8000" placeholder="Вставьте только нужный фрагмент. Перед отправкой внешнему AI-провайдеру секреты маскируются."></textarea></div>' +
      '<div class="tutor-style-row" role="group" aria-label="Стиль объяснения">' +
      '<button type="button" class="chip active" data-tutor-style="simple" aria-pressed="true">Проще</button>' +
      '<button type="button" class="chip" data-tutor-style="technical" aria-pressed="false">Технически</button>' +
      '<button type="button" class="chip" data-tutor-style="production" aria-pressed="false">Production</button>' +
      '<button type="button" class="chip" data-tutor-style="interview" aria-pressed="false">Для интервью</button></div>' +
      '<div class="tutor-submit-row"><button type="button" class="btn btn-primary" data-tutor-action="submit">Спросить учителя</button></div>' +
      '<div id="ai-tutor-status" role="status" aria-live="polite"></div><div id="ai-tutor-result" aria-live="polite"></div>' +
      '</div></div>';
  }

  return { escapeText, renderTutorResponse, renderTutorModal };
});
