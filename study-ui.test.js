const test = require('node:test');
const assert = require('node:assert/strict');
const StudyUI = require('./study-ui');

test('renders populated technology lifecycle groups and metadata', () => {
  const markup = StudyUI.renderTechnologyStatus({
    preferred: ['Gateway API'],
    current: [],
    legacy: ['Ingress'],
    eol: ['ingress-nginx<script>'],
    overviewOnly: [],
    optional: ['Cilium'],
    lastReviewed: '2026-07-25',
    source: 'roadmap <v5.1>',
    note: 'Gateway API > Ingress',
  });

  assert.match(markup, /Технологический радар/);
  assert.match(markup, /study-tech-preferred/);
  assert.match(markup, /Gateway API/);
  assert.match(markup, /study-tech-legacy/);
  assert.match(markup, /study-tech-eol/);
  assert.match(markup, /study-tech-optional/);
  assert.match(markup, /Проверено 25\.07\.2026/);
  assert.match(markup, /roadmap &lt;v5\.1&gt;/);
  assert.match(markup, /Gateway API &gt; Ingress/);
  assert.match(markup, /ingress-nginx&lt;script&gt;/);
  assert.doesNotMatch(markup, /study-tech-current/);
  assert.doesNotMatch(markup, /<script>/);
});

test('formats only valid roadmap review dates', () => {
  assert.equal(StudyUI.formatReviewDate('2026-07-25'), '25.07.2026');
  assert.equal(StudyUI.formatReviewDate('25.07.2026'), '');
  assert.equal(StudyUI.formatReviewDate(), '');
});

test('renders a verifiable daily result safely', () => {
  const markup = StudyUI.renderExpectedResult('Команда <check> выполнена & вывод сохранён');

  assert.match(markup, /Проверяемый результат/);
  assert.match(markup, /study-expected-result/);
  assert.match(markup, /Команда &lt;check&gt; выполнена &amp; вывод сохранён/);
  assert.equal(StudyUI.renderExpectedResult(''), '');
  assert.equal(StudyUI.renderExpectedResult(null), '');
});

test('renders accessible navigation for every roadmap week', () => {
  const weeks = [
    { week: 1, title: 'Linux <basics>' },
    { week: 2, title: 'Сети & HTTP' },
    { week: 3, title: 'Processes' },
  ];
  const markup = StudyUI.renderWeekNavigator(weeks, 2);

  assert.match(markup, /data-study-week-select/);
  assert.match(markup, /value="2" selected/);
  assert.match(markup, /data-study-week="2" aria-current="step"/);
  assert.match(markup, /data-study-week-shift="-1"/);
  assert.match(markup, /data-study-week-shift="1"/);
  assert.match(markup, /Карта курса · 3 недели/);
  assert.match(markup, /Linux &lt;basics&gt;/);
  assert.match(markup, /Сети &amp; HTTP/);
  assert.equal(StudyUI.renderWeekNavigator([], 1), '');
});

test('disables week navigation at roadmap boundaries', () => {
  const weeks = [{ week: 1, title: 'Start' }, { week: 2, title: 'Finish' }];

  assert.match(StudyUI.renderWeekNavigator(weeks, 1), /data-study-week-shift="-1" disabled/);
  assert.match(StudyUI.renderWeekNavigator(weeks, 2), /data-study-week-shift="1" disabled/);
});

test('renders the production layer and prerequisites safely', () => {
  const markup = StudyUI.renderWeekContext({
    productionLayer: 'Gateway < Service',
    prerequisites: ['Docker & Compose', 'CI создаёт image'],
  });

  assert.match(markup, /study-week-context has-prerequisites/);
  assert.match(markup, /Production-слой/);
  assert.match(markup, /Gateway &lt; Service/);
  assert.match(markup, /Входные условия/);
  assert.match(markup, /Docker &amp; Compose/);
  assert.match(markup, /CI создаёт image/);
});

test('renders a production-only context and rejects malformed input', () => {
  const markup = StudyUI.renderWeekContext({ productionLayer: 'Immutable artifact' });

  assert.match(markup, /study-context-production/);
  assert.doesNotMatch(markup, /has-prerequisites/);
  assert.doesNotMatch(markup, /study-context-prerequisites/);
  assert.equal(StudyUI.renderWeekContext(null), '');
  assert.equal(StudyUI.renderWeekContext({ prerequisites: [] }), '');
});

test('renders a weekly artifact and persisted completion criteria', () => {
  const markup = StudyUI.renderWeekOutcome({
    artifact: 'Signed image <release>',
    completionCriteria: ['Build проходит', 'Rollback & restore проверены'],
  }, [true, false]);

  assert.match(markup, /Результат недели/);
  assert.match(markup, /Signed image &lt;release&gt;/);
  assert.match(markup, /1 \/ 2/);
  assert.match(markup, /data-study-criterion="0" checked/);
  assert.match(markup, /study-criterion is-complete/);
  assert.match(markup, /Rollback &amp; restore проверены/);
  assert.doesNotMatch(markup, /data-study-criterion="1" checked/);
});

test('renders artifact-only outcomes and omits malformed outcomes', () => {
  const markup = StudyUI.renderWeekOutcome({ artifact: 'Runbook' });

  assert.match(markup, /Runbook/);
  assert.doesNotMatch(markup, /study-criteria/);
  assert.equal(StudyUI.renderWeekOutcome(null), '');
  assert.equal(StudyUI.renderWeekOutcome({ completionCriteria: [] }), '');
});

test('renders an optional AI track without making it a completion gate', () => {
  const markup = StudyUI.renderAITrack({
    optional: true,
    title: 'AI <review>',
    result: 'Безопасный gateway & audit log',
  });

  assert.match(markup, /AI-трек/);
  assert.match(markup, /Опционально/);
  assert.match(markup, /AI &lt;review&gt;/);
  assert.match(markup, /Безопасный gateway &amp; audit log/);
  assert.match(markup, /Не влияет на завершение DevOps-недели/);
});

test('omits duplicate AI results and malformed tracks', () => {
  const markup = StudyUI.renderAITrack({ optional: true, title: 'Non-blocking review', result: 'Non-blocking review' });

  assert.doesNotMatch(markup, /study-ai-result/);
  assert.equal(StudyUI.renderAITrack(null), '');
  assert.equal(StudyUI.renderAITrack({}), '');
});

test('omits an empty or malformed technology status', () => {
  assert.equal(StudyUI.renderTechnologyStatus(null), '');
  assert.equal(StudyUI.renderTechnologyStatus([]), '');
  assert.equal(StudyUI.renderTechnologyStatus({ preferred: [], legacy: [] }), '');
});

test('evaluates weekly scores and every completion gate', () => {
  const testData = {
    maxScore: 100,
    parts: {
      practice: { score: 35 }, theory: { score: 25 },
      debug: { score: 25 }, seniorChallenge: { score: 15 },
    },
  };
  const result = StudyUI.evaluateWeeklyAttempt(testData, {
    practice: 40, theory: 20.4, debug: -3, seniorChallenge: 15,
  }, {
    passScore: 70, artifactReady: true, criteriaComplete: true, criticalReviewed: true,
  });

  assert.deepEqual(result.scores, { practice: 35, theory: 20, debug: 0, seniorChallenge: 15 });
  assert.equal(result.total, 70);
  assert.equal(result.maxScore, 100);
  assert.equal(result.passScore, 70);
  assert.equal(result.passed, true);
  assert.deepEqual(result.gates, { score: true, artifact: true, criteria: true, criticalErrors: true });
});

test('does not pass a weekly test when a non-score gate is missing', () => {
  const result = StudyUI.evaluateWeeklyAttempt({
    parts: { practice: { score: 35 }, theory: { score: 25 }, debug: { score: 25 }, seniorChallenge: { score: 15 } },
  }, { practice: 35, theory: 25, debug: 25, seniorChallenge: 15 }, {
    artifactReady: true, criteriaComplete: false, criticalReviewed: true,
  });

  assert.equal(result.total, 100);
  assert.equal(result.passed, false);
  assert.equal(result.gates.criteria, false);
  assert.equal(StudyUI.clampWeeklyScore('not-a-number', 25), 0);
});

test('builds an overall curriculum snapshot with actionable priorities', () => {
  const weeks = [
    { week: 1, days: [{ day: 1, title: 'Start' }, { day: 2, title: 'Review Linux' }] },
    { week: 2, days: [{ day: 1, title: 'Networks' }, { day: 2, title: 'HTTP' }] },
  ];
  const miniTests = [
    { id: 'mini-1', week: 1, day: 1 },
    { id: 'mini-2', week: 1, day: 2 },
  ];
  const weeklyTests = [{ id: 'weekly-1', week: 1, maxScore: 100 }, { id: 'weekly-2', week: 2, maxScore: 100 }];
  const overview = StudyUI.buildStudyOverview(weeks, miniTests, weeklyTests, {
    progress: { w1d1: 'done', w1d2: 'review', w2d1: 'todo' },
    miniAnswers: {
      'mini-1': { score: 3, qScores: [1, 1, 1, 0, 0] },
      'mini-2': { score: 4, qScores: [1, 1, 1, 1, 0] },
    },
    weeklyResults: { 'weekly-1': { passed: false, lastAttempt: { total: 65, maxScore: 100 } } },
    activePosition: { week: 1, day: 2 },
  });

  assert.equal(overview.totalDays, 4);
  assert.equal(overview.doneDays, 1);
  assert.equal(overview.percent, 25);
  assert.equal(overview.attemptedMiniTests, 2);
  assert.equal(overview.passedMiniTests, 1);
  assert.equal(overview.passedWeeks, 0);
  assert.deepEqual(overview.nextDay, { week: 1, day: 2, title: 'Review Linux', status: 'review' });
  assert.deepEqual(overview.recommendations.map(item => item.kind), ['weekly', 'mini', 'review']);
  assert.equal(overview.weekStates[1], 'available');
  assert.equal(overview.weekStates[2], 'available');
});

test('renders overall progress, recommendations and week state accessibly', () => {
  const overview = {
    totalDays: 160, doneDays: 40, percent: 25,
    totalWeeks: 32, passedWeeks: 7,
    totalMiniTests: 160, attemptedMiniTests: 43, passedMiniTests: 38,
    nextDay: { week: 8, day: 2 },
    recommendations: [{ kind: 'next', week: 8, day: 2, title: 'Continue <now>', detail: 'Safe & focused' }],
  };
  const markup = StudyUI.renderStudyOverview(overview);
  const navigator = StudyUI.renderWeekNavigator(
    [{ week: 1, title: 'Done' }, { week: 2, title: 'Next' }, { week: 3, title: 'Later' }],
    2,
    undefined,
    { 1: 'complete', 2: 'available', 3: 'locked' }
  );

  assert.match(markup, /aria-valuenow="25"/);
  assert.match(markup, /40 из 160/);
  assert.match(markup, /7 \/ 32/);
  assert.match(markup, /data-study-jump-week="8" data-study-jump-day="2"/);
  assert.match(markup, /Continue &lt;now&gt;/);
  assert.match(markup, /Safe &amp; focused/);
  assert.match(navigator, /is-complete/);
  assert.match(navigator, /is-available is-current/);
  assert.match(navigator, /is-locked/);
  assert.match(navigator, /aria-label="Неделя 1, завершена"/);
  assert.equal(StudyUI.renderStudyOverview(null), '');
});
