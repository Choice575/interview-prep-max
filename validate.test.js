const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const studyMap = require('./tasks/study_map.json');
const mlopsMap = require('./tasks/mlops_map.json');
const { REQUIRED_TERMS_BY_WEEK, findMissingRequiredTerms } = require('./study-curriculum-rules');

test('accepts the complete curriculum in strict mode', () => {
  const result = spawnSync(process.execPath, ['validate.js', '--strict'], {
    cwd: __dirname,
    encoding: 'utf8',
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;

  assert.equal(result.status, 0, output);
  assert.match(output, /0 ошибок, 0 предупреждений/);
});

test('actually runs the MLOps profile block instead of skipping it', () => {
  const result = spawnSync(process.execPath, ['validate.js', '--strict'], {
    cwd: __dirname,
    encoding: 'utf8',
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;

  // Если mlops_map.json когда-нибудь перестанет читаться, блок молча исчезнет
  // из проверки, а суммарный «0 ошибок» останется зелёным. Ловим это по строке
  // отчёта, а не по коду возврата.
  assert.match(output, /Проверка учебной программы MLOps/, output);
  assert.match(output, /MLOps: 24 недель, из них детализировано \d+ \(\d+ дней\)/, output);
});

test('keeps the MLOps curriculum answerable and internally consistent', () => {
  assert.equal(mlopsMap.profile, 'mlops');
  assert.equal(mlopsMap.weeks.length, 24);
  assert.equal(mlopsMap.durationWeeks, 24);

  // detailedWeeks — производное поле: считаем из данных, а не из константы,
  // иначе добавленная неделя ломает тест как ребус вместо сообщения.
  const withDays = mlopsMap.weeks.filter(week => Array.isArray(week.days) && week.days.length);
  assert.deepEqual(mlopsMap.detailedWeeks, withDays.map(week => week.week));

  const miniTestIds = new Set();
  mlopsMap.weeks.forEach(week => {
    assert.ok(Array.isArray(week.days), `week ${week.week} must declare days`);
    const expectedStatus = week.days.length ? 'detailed' : 'planned';
    assert.equal(week.daysStatus, expectedStatus, `week ${week.week} daysStatus must be ${expectedStatus}`);
    assert.ok(week.completionCriteria.length >= 4, `week ${week.week} needs 4+ criteria`);
    assert.equal(week.curriculumVersion, mlopsMap.version);

    if (!week.days.length) return;
    assert.equal(week.days.length, 5, `week ${week.week} must have exactly 5 days`);
    week.days.forEach(day => {
      const where = `w${week.week}d${day.day}`;
      assert.ok(day.expectedResult.length >= 80, `${where}: expectedResult too short`);
      assert.match(day.expectedResult, /вывод|evidence/i, `${where}: expectedResult needs observable evidence`);
      assert.ok(day.practice.length > 0, `${where}: practice must not be empty`);
      assert.ok(day.pitfalls.length > 0, `${where}: pitfalls must not be empty`);
      assert.equal(false, 'miniTest' in day, `${where}: embedded miniTest is forbidden`);
      assert.ok(
        day.miniTestId.startsWith(`mini-mlops-${where}`),
        `${where}: miniTestId ${day.miniTestId} must carry its own coordinate`
      );
      assert.equal(miniTestIds.has(day.miniTestId), false, `${where}: duplicate miniTestId`);
      miniTestIds.add(day.miniTestId);
    });
  });
});

test('requires roadmap technology markers in their assigned weeks', () => {
  REQUIRED_TERMS_BY_WEEK.forEach((terms, weekNumber) => {
    const week = studyMap.weeks.find(item => item.week === weekNumber);
    assert.deepEqual(findMissingRequiredTerms(week), [], `week ${weekNumber} must include ${terms.join(', ')}`);
  });

  assert.deepEqual(
    findMissingRequiredTerms({ week: 23, title: 'Trivy image scan' }),
    ['SBOM', 'Cosign'],
  );
});
