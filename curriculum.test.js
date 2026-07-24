const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readTask(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'tasks', name), 'utf8'));
}

test('uses roadmap v5.1 as the shared curriculum contract', () => {
  const studyMap = readTask('study_map.json');
  const studyTests = readTask('study_tests.json');
  const seniorCases = readTask('senior_cases.json');

  assert.equal(studyMap.version, '5.1.0');
  assert.equal(studyTests.version, studyMap.version);
  assert.equal(seniorCases.version, studyMap.version);
  assert.equal(studyMap.sourceDocument, 'devops_learning_plan_v5.1.md');
  assert.equal(studyMap.status, 'active');
  assert.equal(studyMap.durationWeeks, 32);
  assert.equal(studyMap.weeks.length, 32);
  assert.match(studyMap.targetOutcome, /Junior\+\/начального Middle/);
});

test('keeps the roadmap v5.1 assessment rules explicit', () => {
  const studyTests = readTask('study_tests.json');

  assert.deepEqual(studyTests.grading.miniTest.questionCount, { min: 3, max: 5, recommended: 5 });
  assert.equal(studyTests.grading.miniTest.maxScore, 5);
  assert.equal(studyTests.grading.miniTest.passScore, 4);
  assert.equal(studyTests.grading.weeklyTest.maxScore, 100);
  assert.equal(studyTests.grading.weeklyTest.passScore, 70);
});
