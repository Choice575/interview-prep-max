const test = require('node:test');
const assert = require('node:assert/strict');
const UI = require('./ai-tutor-ui.js');

const hostile = '<img src=x onerror="alert(1)">';

function assertEscaped(markup) {
  assert.doesNotMatch(markup, /<img\s/i);
  assert.match(markup, /&lt;img/);
}

test('renders an escaped explanation with source, sections and safe copy-only code', () => {
  const markup = UI.renderTutorResponse({
    source: 'ai', mode: 'explain', title: 'Тема ' + hostile, summary: 'Итог ' + hostile,
    sections: [{ title: 'Раздел ' + hostile, text: 'Текст ' + hostile }],
    example: { description: 'Пример ' + hostile, code: 'echo "' + hostile + '"' },
    checkQuestion: { question: 'Вопрос ' + hostile },
    nextActions: [{ action: 'Шаг ' + hostile, successCriterion: 'Критерий ' + hostile }],
    caution: 'Ограничение ' + hostile
  });

  assertEscaped(markup);
  assert.match(markup, /AI-учитель/);
  assert.match(markup, /tutor-sections/);
  assert.match(markup, /tutor-check-question/);
  assert.match(markup, /data-tutor-copy-index="0"/);
  assert.doesNotMatch(markup, /javascript:|data-tutor-execute|onclick=/i);
});

test('renders one Socratic question and a completion state without executable controls', () => {
  const active = UI.renderTutorResponse({
    source: 'local', mode: 'socratic', turn: 2, title: 'Опрос', feedback: 'Разбор ' + hostile,
    hint: 'Подсказка', nextQuestion: 'Следующий вопрос?', complete: false, summary: '', caution: 'Локально'
  });
  assertEscaped(active);
  assert.match(active, /Локальный учитель/);
  assert.match(active, /Ход 3 из 5/);
  assert.match(active, /data-tutor-socratic-answer/);
  assert.match(active, /data-tutor-action="submit-socratic"/);
  assert.match(active, />Ответить</);
  assert.match(active, /Следующий вопрос\?/);

  const complete = UI.renderTutorResponse({
    source: 'ai', mode: 'socratic', turn: 5, title: 'Итог', feedback: 'Готово',
    hint: '', nextQuestion: '', complete: true, summary: 'Опрос завершён', caution: ''
  });
  assert.match(complete, /Опрос завершён/);
  assert.doesNotMatch(complete, /data-tutor-socratic-answer/);
});

test('renders practice checks and commands as inert escaped text', () => {
  const markup = UI.renderTutorResponse({
    source: 'ai', mode: 'practice', title: 'Диагностика', meaning: 'Смысл ' + hostile,
    causes: ['Причина ' + hostile],
    checks: [{ description: 'Проверка', command: 'kubectl get pod ' + hostile, expectedResult: 'Результат' }],
    nextStep: { description: 'Следующий шаг', command: 'kubectl logs pod', expectedResult: 'Получить ошибку' },
    stopConditions: ['Остановиться ' + hostile], caution: 'Команды не выполняются автоматически.'
  });

  assertEscaped(markup);
  assert.match(markup, /Вероятные причины/);
  assert.match(markup, /Безопасные проверки/);
  assert.match(markup, /Условия остановки/);
  assert.match(markup, /data-tutor-copy-index="0"/);
  assert.match(markup, /data-tutor-copy-index="1"/);
  assert.doesNotMatch(markup, /data-tutor-execute|onclick=/i);
});

test('renders an accessible modal shell for all three modes', () => {
  const markup = UI.renderTutorModal();
  assert.match(markup, /id="ai-tutor-modal"/);
  assert.match(markup, /role="dialog"/);
  assert.match(markup, /aria-modal="true"/);
  assert.match(markup, /aria-labelledby="ai-tutor-title"/);
  assert.match(markup, /data-tutor-mode="explain"/);
  assert.match(markup, /data-tutor-mode="socratic"/);
  assert.match(markup, /data-tutor-mode="practice"/);
  assert.match(markup, /id="ai-tutor-status"[^>]*aria-live="polite"/);
  assert.match(markup, /maxlength="2000"/);
  assert.match(markup, /maxlength="8000"/);
  assert.match(markup, /Перед отправкой внешнему AI-провайдеру секреты маскируются/);
});
