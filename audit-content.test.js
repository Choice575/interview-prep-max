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

test('study flashcards copied from exam questions start with the keyed answer, not a distractor', () => {
  const cards = require('./tasks/flashcards.json').cards;
  const byQuestion = new Map();
  questions.forEach(question => {
    const key = question.q.trim();
    if (!byQuestion.has(key)) byQuestion.set(key, []);
    byQuestion.get(key).push(question);
  });
  const normalize = text => String(text).trim().replace(/\s+/g, ' ').replace(/\.$/, '').toLowerCase();
  const mismatches = [];
  cards.forEach(card => {
    (byQuestion.get(card.question.trim()) || []).forEach(question => {
      // С 15.11.18 верный вариант лежит в shortAnswer, а answer — только объяснение (аудит C5).
      const answer = normalize(card.shortAnswer || card.answer);
      if (answer.startsWith(normalize(question.options[question.answer]))) return;
      const distractor = question.options.findIndex((option, index) => index !== question.answer && answer.startsWith(normalize(option)));
      if (distractor !== -1) mismatches.push(`${card.id} ← #${question.id}`);
    });
  });
  assert.deepEqual(mismatches, []);
  const doubled = cards.filter(card => card.shortAnswer && card.answer.trim().startsWith(card.shortAnswer.trim()));
  assert.deepEqual(doubled.map(card => card.id), [], 'объяснение не должно повторять краткий ответ');
  assert.ok(cards.filter(card => card.shortAnswer).length >= 800);
});

test('explanation-vs-key gate flags a shuffled Terraform key and only reviewed IDs pass today', () => {
  const { findExplanationMismatches } = require('./question-quality.js');
  const baseline = require('./question-quality-baseline.json');
  const reviewed = new Set(baseline.reviewedExplanationMismatch);
  assert.deepEqual(findExplanationMismatches(questions).filter(item => !reviewed.has(item.id)), []);

  const tfstate = questions.find(question => question.id === 9);
  const wrong = tfstate.options.findIndex(option => /Описание требуемых providers/.test(option));
  assert.notEqual(wrong, -1);
  const shuffled = findExplanationMismatches([{ ...tfstate, answer: wrong }]);
  assert.deepEqual(shuffled.map(item => item.id), [9]);
});

test('audited regex and command trainers stay consistent with their study flashcards', () => {
  const cards = new Map(require('./tasks/flashcards.json').cards.map(card => [card.id, card]));
  const trainers = {
    regex: new Map(require('./tasks/regex.json').map(task => [task.id, task])),
    cmd: new Map(require('./tasks/cmd.json').map(task => [task.id, task]))
  };
  const linked = [
    [1001089, 'regex', 3], [1001103, 'regex', 6], [1001226, 'regex', 8], [1001105, 'regex', 9],
    [1001227, 'regex', 16], [1001101, 'regex', 17], [1001087, 'cmd', 24], [1001096, 'cmd', 32]
  ];
  for (const [cardId, trainer, taskId] of linked) {
    const task = trainers[trainer].get(taskId);
    const card = cards.get(cardId);
    assert.equal(card.question, task.task, `${cardId}: вопрос`);
    assert.equal(card.answer, `${task.opts[task.answer]}. ${task.exp}`, `${cardId}: ответ`);
  }
  assert.match(cards.get(1001105).answer, /sed 's\/\\\.\.\*\$\/\/'/);
  assert.doesNotMatch(trainers.regex.get(17).exp, /корректно обрабатывает/);
  assert.doesNotMatch(trainers.cmd.get(32).exp, /как Job/);
});

test('Ansible trainers describe lineinfile and when braces as verified on ansible-core', () => {
  const lineinfile = require('./tasks/ansible_pb.json').find(task => task.id === 6);
  assert.doesNotMatch(lineinfile.bug, /при КАЖДОМ запуске/);
  assert.match(lineinfile.opts[lineinfile.answer], /другим IP не заменится/);
  const braces = require('./tasks/code.json').find(task => task.id === 12);
  assert.doesNotMatch(braces.bug + braces.opts[braces.answer], /deprecated/);
  assert.match(braces.bug, /Template delimiters are not supported in expressions/);
});

test('trainer-derived study cards keep source punctuation and never point at invisible options', () => {
  const cards = require('./tasks/flashcards.json').cards;
  const byQuestion = new Map(cards.map(card => [card.question.trim(), card]));
  let linked = 0;
  for (const file of ['regex', 'cmd', 'git']) {
    for (const task of require(`./tasks/${file}.json`)) {
      const card = byQuestion.get(task.task.trim());
      if (!card) continue;
      linked++;
      const option = task.opts[task.answer];
      // Вариант, оканчивающийся точкой (build context «.»), не получает вторую точку.
      const expected = option.endsWith(' .') ? `${option} ${task.exp}` : `${option}. ${task.exp}`;
      assert.equal(card.answer, expected, `${file}#${task.id} → ${card.id}`);
      assert.doesNotMatch(task.exp, /(Перв|Втор|Трет|Четв[её]рт|Последн)[а-яё]* вариант|\((перв|втор|трет|четв[её]рт)ый\)/i, `${file}#${task.id}`);
    }
  }
  assert.ok(linked >= 78, `связанных карточек ${linked}`);

  const restored = new Map([
    [1000639, 'git cherry-pick A..B'], [1000676, 'HEAD..origin/main'], [1000666, '../hotfix'],
    [1001118, '-e trace=...'], [1001128, 'ip link set ... netns'], [1001130, '2>&1 | ...'],
    [1001060, 'EXPLAIN ANALYZE ...'], [1001058, "since...'"], [1001333, 'trace=...'], [1001575, '"5.."']
  ]);
  const byId = new Map(cards.map(card => [card.id, card]));
  for (const [id, literal] of restored) {
    const card = byId.get(id);
    assert.ok(`${card.question} ${card.answer}`.includes(literal), `${id}: ${literal}`);
  }
});

test('template and rubric flashcards and empty senior cases are flagged as generated', () => {
  const cards = require('./tasks/flashcards.json').cards;
  const templates = [
    /^К какому production-сбою приведёт ошибка/, /^Как в задаче «.*» применить навык/,
    /^Какими диагностическими данными \(evidence\) и повторными проверками доказать/, /^К какому сбою приведёт ошибка/,
    /^Дан вывод для «/, /^Какое безопасное действие выполнить первым/, /^Какими наблюдаемыми критериями подтвердить завершение практики/,
    /^\[(DevOps|MLOps)[^\]]*недел/
  ];
  for (const card of cards) {
    if (templates.some(pattern => pattern.test(card.question))) assert.equal(card.generated, true, `${card.id}`);
  }
  assert.equal(cards.filter(card => card.generated).length, 776);
  const visibleStudy = cards.filter(card => !card.practice && !card.generated);
  assert.equal(visibleStudy.length, 2329);
  assert.equal(cards.filter(card => card.practice).length, 90, 'колода практических сценариев не меняется');

  const cases = require('./tasks/senior_cases.json').cases;
  const empty = cases.filter(item => item.evidence.some(line => /^Topic:/.test(line)));
  assert.equal(empty.length, 17);
  assert.ok(empty.every(item => item.generated === true));
  assert.equal(cases.filter(item => item.generated).length, 17);
});

test('practice cards keep trainer and lab code as a multi-line block in sync with their sources', () => {
  const cards = require('./tasks/flashcards.json').cards.filter(card => card.question.startsWith('[Практика] '));
  const trainers = ['ansible_pb', 'code', 'k8s', 'dockerfile'].flatMap(file => require(`./tasks/${file}.json`));
  const labs = require('./tasks/labs.json');
  for (const card of cards) {
    assert.ok(card.code, `${card.id}: нет code`);
    const task = trainers.find(item => item.code === card.code) || labs.find(item => item.code === card.code);
    assert.ok(task, `${card.id}: код не совпадает ни с одним заданием`);
    const question = task.scenario ? `[Практика] ${task.scenario} — ${task.question}` : `[Практика] ${task.task || task.title}`;
    assert.equal(card.question, question, `${card.id}`);
    assert.equal(card.answer, `${task.opts[task.answer]}. ${task.fix}`, `${card.id}`);
  }
  assert.equal(cards.length, 60);
});

test('incident cards separate the scenario from the step and carry the command output', () => {
  const cards = require('./tasks/flashcards.json').cards.filter(card => card.question.startsWith('[Инцидент: '));
  const incidents = require('./tasks/incidents.json');
  assert.equal(cards.length, 44);
  for (const card of cards) assert.match(card.question, / Сейчас: .+\. — /, `${card.id}`);
  const withEvidence = incidents.flatMap(item => item.phases).filter(phase => phase.evidence).length;
  assert.equal(cards.filter(card => card.code && card.code.startsWith('$ ')).length, withEvidence);
});
