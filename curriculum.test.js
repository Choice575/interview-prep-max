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

test('exposes measurable V5.1 fields without changing stable week numbers', () => {
  const studyMap = readTask('study_map.json');
  const prerequisiteWeeks = studyMap.weeks.filter(week => week.prerequisites).map(week => week.week);
  const lifecycleWeeks = studyMap.weeks.filter(week => week.technologyStatus).map(week => week.week);

  assert.deepEqual(studyMap.weeks.map(week => week.week), Array.from({ length: 32 }, (_, index) => index + 1));
  studyMap.weeks.forEach(week => {
    assert.equal(week.curriculumVersion, studyMap.version);
    assert.equal(week.completionCriteria.length, 4);
    assert.equal(week.aiTrack.optional, true);
    assert.ok(week.aiTrack.title);
    assert.ok(week.aiTrack.result);
  });
  assert.deepEqual(prerequisiteWeeks, [6, 11, 15, 17, 25]);
  assert.deepEqual(lifecycleWeeks, [11, 18, 19, 20, 21, 22, 30]);
});

test('classifies fast-changing technologies with review metadata', () => {
  const studyMap = readTask('study_map.json');
  const fields = ['current', 'preferred', 'legacy', 'eol', 'overviewOnly', 'optional'];
  const statuses = new Map(studyMap.weeks.filter(week => week.technologyStatus).map(week => [week.week, week.technologyStatus]));

  statuses.forEach(status => {
    const classified = fields.flatMap(field => {
      assert.ok(Array.isArray(status[field]), `${field} must be an array`);
      return status[field];
    });
    assert.equal(new Set(classified).size, classified.length);
    assert.match(status.lastReviewed, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(status.source);
    assert.ok(status.note);
  });
  assert.deepEqual(statuses.get(18).preferred, ['Gateway API']);
  assert.deepEqual(statuses.get(18).legacy, ['Ingress']);
  assert.deepEqual(statuses.get(18).eol, ['ingress-nginx']);
  assert.deepEqual(statuses.get(21).eol, ['Promtail']);
  assert.deepEqual(statuses.get(30).overviewOnly, ['Ceph']);
});

test('uses study_tests.json as the only mini-test source', () => {
  const studyMap = readTask('study_map.json');
  const studyTests = readTask('study_tests.json');
  const testsById = new Map(studyTests.miniTests.map(miniTest => [miniTest.id, miniTest]));
  const linkedIds = [];

  assert.equal(studyTests.miniTests.length, 160);
  assert.equal(testsById.size, 160);
  studyMap.weeks.forEach(week => {
    week.days.forEach(day => {
      assert.equal(Object.hasOwn(day, 'miniTest'), false);
      assert.equal(typeof day.miniTestId, 'string');
      const miniTest = testsById.get(day.miniTestId);
      assert.ok(miniTest, `missing ${day.miniTestId}`);
      assert.equal(miniTest.week, week.week);
      assert.equal(miniTest.day, day.day);
      linkedIds.push(day.miniTestId);
    });
  });
  assert.equal(new Set(linkedIds).size, 160);
});
