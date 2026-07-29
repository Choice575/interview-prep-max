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
  // Every week states its entry conditions, so a learner can tell whether the
  // previous week actually landed before starting the next one.
  assert.deepEqual(prerequisiteWeeks, Array.from({ length: 32 }, (_, index) => index + 1));
  prerequisiteWeeks.forEach(number => {
    const week = studyMap.weeks.find(entry => entry.week === number);
    assert.ok(week.prerequisites.length >= 3, `week ${number}: too few prerequisites`);
    week.prerequisites.forEach(item => assert.ok(String(item).trim(), `week ${number}: empty prerequisite`));
  });
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

test('defines a distinct verifiable result for every study day', () => {
  const studyMap = readTask('study_map.json');
  const expectedResults = studyMap.weeks.flatMap(week => week.days.map(day => day.expectedResult));

  assert.equal(expectedResults.length, 160);
  expectedResults.forEach(result => {
    assert.equal(typeof result, 'string');
    assert.ok(result.length >= 80);
    assert.match(result, /вывод|evidence|не ниже 70\/100/);
  });
  assert.equal(new Set(expectedResults).size, expectedResults.length);
});

test('keeps every post-foundation study day concrete instead of template-generated', () => {
  const studyMap = readTask('study_map.json');
  const detailedWeeks = new Set(Array.from({ length: 28 }, (_, index) => index + 5));
  const days = studyMap.weeks
    .filter(week => detailedWeeks.has(week.week))
    .flatMap(week => week.days);

  assert.equal(days.length, 140);
  for (const field of ['title', 'objective', 'expectedResult']) {
    assert.equal(new Set(days.map(day => day[field])).size, days.length, `${field} must be unique for all detailed days`);
  }
  for (const field of ['practice', 'pitfalls']) {
    assert.equal(new Set(days.map(day => JSON.stringify(day[field]))).size, days.length, `${field} must be specific to every detailed day`);
  }
  days.forEach(day => {
    assert.doesNotMatch(day.objective, /по теме:/i);
    assert.doesNotMatch(day.practice.join(' '), /прочитать цель недели|выполнить базовую команду\/конфиг/i);
  });
});

test('covers roadmap v5.1 technologies in assessments and senior cases', () => {
  const studyTests = readTask('study_tests.json');
  const seniorCases = readTask('senior_cases.json');
  const requiredTermsByWeek = new Map([
    [9, ['Harbor', 'Nexus']],
    [10, ['Jenkins']],
    [11, ['OpenTofu']],
    [12, ['Yandex Cloud']],
    [18, ['Gateway API', 'HTTPRoute']],
    [19, ['Helm']],
    [20, ['VictoriaMetrics', 'Argo CD']],
    [21, ['Grafana Alloy', 'OpenTelemetry', 'Promtail']],
    [22, ['OpenTelemetry']],
    [23, ['Trivy', 'SBOM', 'Cosign']],
    [30, ['Longhorn', 'Ceph']]
  ]);

  requiredTermsByWeek.forEach((terms, week) => {
    const assessmentText = JSON.stringify({
      miniTests: studyTests.miniTests.filter(item => item.week === week),
      weeklyTests: studyTests.weeklyTests.filter(item => item.week === week)
    });
    const seniorText = JSON.stringify(seniorCases.cases.filter(item => item.week === week));

    terms.forEach(term => {
      assert.ok(assessmentText.includes(term), `week ${week} assessments must cover ${term}`);
      assert.ok(seniorText.includes(term), `week ${week} senior cases must cover ${term}`);
    });
  });
});

test('keeps roadmap v5.1 mini-tests specific to each study day', () => {
  const studyTests = readTask('study_tests.json');
  const detailedWeeks = Array.from({ length: 28 }, (_, index) => index + 5);
  const detailedTests = studyTests.miniTests.filter(item => detailedWeeks.includes(item.week));
  const questions = detailedTests.flatMap(item => item.questions);

  detailedWeeks.forEach(week => {
    const miniTests = studyTests.miniTests.filter(item => item.week === week);

    assert.equal(miniTests.length, 5, `week ${week} must have five mini-tests`);
    miniTests.forEach(item => {
      assert.equal(item.questions.length, 5, `${item.id} must have five questions`);
      assert.equal(item.questions.reduce((sum, question) => sum + question.score, 0), 5, `${item.id} must total five points`);
      assert.ok(item.questions.some(question => question.q.startsWith('Дан вывод')), `${item.id} must test output interpretation`);
      assert.ok(item.questions.some(question => question.q.startsWith('Какое безопасное действие')), `${item.id} must test a safe first action`);
    });
  });

  assert.equal(detailedTests.length, 140);
  assert.equal(questions.length, 700);
  assert.equal(new Set(questions.map(question => question.q)).size, questions.length);
  assert.equal(new Set(questions.map(question => question.expected)).size, questions.length);
  questions.forEach(question => assert.ok(question.expected.length >= 80));

  const week30Tests = studyTests.miniTests.filter(item => item.week === 30);
  assert.equal(new Set(week30Tests.map(item => item.questions[0].q)).size, 5);
});
