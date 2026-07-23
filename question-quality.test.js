const test = require('node:test');
const assert = require('node:assert/strict');

const {
  analyzeQuestions,
  cleanOption,
  compareToBaseline,
  makeBaseline,
  rebalanceAnswers
} = require('./question-quality');

function question(overrides = {}) {
  return {
    id: 1,
    topic: 'Terraform',
    level: 'Junior',
    q: 'Как проверить конфигурацию?',
    options: ['terraform validate', 'terraform plan', 'terraform fmt', 'terraform show'],
    answer: 0,
    explanation: 'Проверка выполняется командой terraform validate.',
    ...overrides
  };
}

test('detects a strong answer-length cue', () => {
  const report = analyzeQuestions([question({
    options: ['Проверяет синтаксис и внутреннюю согласованность конфигурации без обращения к API', 'Удаляет state', 'Запускает apply', 'Форматирует HCL']
  })]);
  assert.equal(report.byRule['length-cue'], 1);
});

test('does not flag similarly detailed options as a length cue', () => {
  const report = analyzeQuestions([question({
    options: ['Проверяет синтаксис конфигурации', 'Строит план изменения ресурсов', 'Форматирует файлы конфигурации', 'Показывает значения из state']
  })]);
  assert.equal(report.byRule['length-cue'], 0);
});

test('detects absolute distractors and exact duplicate questions', () => {
  const report = analyzeQuestions([
    question({ options: ['Проверяет конфигурацию', 'Никогда не читает файлы', 'Строит план', 'Форматирует код'] }),
    question({ id: 2 })
  ]);
  assert.equal(report.byRule['absolute-distractor'], 1);
  assert.equal(report.byRule['duplicate-question'], 1);
});

test('rebalances positions, strips stored labels and stays idempotent', () => {
  const input = Array.from({ length: 8 }, (_, index) => question({
    id: index + 1,
    options: ['a) верный', 'b) второй', 'c) третий', 'd) четвёртый'],
    answer: 0
  }));
  const first = rebalanceAnswers(input);
  const second = rebalanceAnswers(first);
  assert.deepEqual(first.map(item => item.answer), [0, 1, 2, 3, 0, 1, 2, 3]);
  assert.equal(first[3].options[3], 'верный');
  assert.equal(cleanOption(first[0].options[0]), 'верный');
  assert.deepEqual(second, first);
});

test('baseline comparison rejects regressions and unbalanced positions', () => {
  const balanced = analyzeQuestions(Array.from({ length: 4 }, (_, index) => question({ id: index + 1, answer: index })));
  const baseline = makeBaseline(balanced);
  assert.deepEqual(compareToBaseline(balanced, baseline), []);
  const skewed = { ...balanced, positions: [4, 0, 0, 0] };
  assert.match(compareToBaseline(skewed, baseline).join('\n'), /несбалансированы/);
});
