const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const studyMap = require('./tasks/study_map.json');
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
