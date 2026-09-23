const test = require('node:test');
const assert = require('node:assert/strict');
const questions = require('./tasks/base_questions.json');

const correctedTerraformAnswers = new Map([
  [9, /Снимок соответствия адресов Terraform реальным объектам/],
  [11, /Backend, который хранит state вне локальной рабочей директории/],
  [14, /Расхождение фактических параметров объектов с ожидаемым состоянием/],
  [18, /Для переиспользования и стандартизации связанных ресурсов/],
  [26, /Синхронизировать VCS, проверить нужное окружение и выполнить свежий plan/]
]);

test('five corrected Terraform keys point to the intended answers with stable IDs', () => {
  for (const [id, expected] of correctedTerraformAnswers) {
    const matches = questions.filter(question => question.id === id);
    assert.equal(matches.length, 1, `ID ${id} должен остаться единственным`);
    const question = matches[0];
    assert.equal(question.topic, 'Terraform');
    assert.match(question.options[question.answer], expected);
    assert.ok(question.explanation, `ID ${id}: пояснение не должно исчезнуть`);
  }
});
