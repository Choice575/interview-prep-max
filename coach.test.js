const test = require('node:test');
const assert = require('node:assert/strict');
const coach = require('./coach.js');

const questions = [
  { id: 1, topic: 'Linux', level: 'Middle' },
  { id: 2, topic: 'Linux', level: 'Middle' },
  { id: 3, topic: 'Terraform', level: 'Middle' },
  { id: 4, topic: 'Cloud', level: 'Middle' }
];

test('prioritizes a weak role-relevant topic', () => {
  const plan = coach.buildPlan({
    questions,
    progress: { 1: { correct: 0, wrong: 2 }, 2: { correct: 1, wrong: 1 }, 3: { correct: 3, wrong: 0 } },
    profile: { role: 'SRE', level: 'Middle' }, now: Date.UTC(2026, 6, 21)
  });
  assert.equal(plan.focus.topic, 'Linux');
  assert.equal(plan.roleLabel, 'SRE');
  assert.equal(plan.sessionSize, 10);
});

test('increases session volume before the interview and counts repetitions', () => {
  const localNoon = new Date(2026, 6, 21, 12).getTime();
  const plan = coach.buildPlan({
    questions,
    progress: { 1: { correct: 0, wrong: 1, nextReviewAt: Date.UTC(2026, 6, 20) } },
    profile: { role: 'Cloud', level: 'Senior', date: '2026-07-25' }, now: localNoon
  });
  assert.equal(plan.daysUntil, 4);
  assert.equal(plan.baseSessionSize, 20);
  assert.equal(plan.sessionSize, 25);
  assert.equal(plan.weeklyReview.status, 'behind');
  assert.equal(plan.weeklyReview.extraQuestions, 5);
  assert.equal(plan.dueCount, 1);
  assert.equal(plan.targetAccuracy, 80);
});

test('ignores malformed dates', () => {
  assert.equal(coach.getDaysUntil('not-a-date', Date.UTC(2026, 6, 21)), null);
  assert.equal(coach.getDaysUntil('2026-02-30', Date.UTC(2026, 6, 21)), null);
});

test('keeps coverage within a percentage range', () => {
  const plan = coach.buildPlan({
    questions: Array.from({ length: 13 }, (_, index) => ({ id: index + 1, topic: 'Linux', level: 'Middle' })),
    progress: Object.fromEntries(Array.from({ length: 13 }, (_, index) => [index + 1, { correct: 1, wrong: 0 }])),
    profile: { role: 'SRE', level: 'Middle' }, now: Date.UTC(2026, 6, 21)
  });
  assert.equal(plan.topicStats.find(stat => stat.topic === 'Linux').coverage, 100);
});

test('includes practical trainer signals and can recommend a trainer-only skill', () => {
  const plan = coach.buildPlan({
    questions: [{ id: 1, topic: 'Linux', level: 'Middle' }],
    progress: { 1: { correct: 1, wrong: 0 } },
    skillEvents: [{ source: 'git', topic: 'Git', score: 1, possible: 1 }],
    profile: { role: 'Platform', level: 'Middle' }, now: Date.UTC(2026, 6, 21)
  });
  const git = plan.topicStats.find(stat => stat.topic === 'Git');
  assert.equal(git.practiceScore, 100);
  assert.deepEqual(git.action, { type: 'trainer', page: 'git' });
});

test('summarizes weekly activity and compares it with the previous week', () => {
  const now = Date.UTC(2026, 6, 21, 12);
  const review = coach.buildWeeklyReview({
    now,
    plan: { daysUntil: 30, sessionSize: 10 },
    skillEvents: [
      { at: now - 86400000, topic: 'Linux', score: 1, possible: 1 },
      { at: now - 3 * 86400000, topic: 'Linux', score: 0.5, possible: 1 },
      { at: now - 10 * 86400000, topic: 'Linux', score: 0, possible: 1 }
    ]
  });
  assert.equal(review.recent.attempts, 2);
  assert.equal(review.recent.activeDays, 2);
  assert.equal(review.recent.accuracy, 75);
  assert.equal(review.accuracyDelta, 75);
  assert.equal(review.status, 'building');
  assert.equal(review.adjustedSessionSize, 10);
});

test('builds a unique adaptive control session across priority topics', () => {
  const session = coach.buildControlSession({
    questions: [
      { id: 1, topic: 'Linux', level: 'Middle' },
      { id: 2, topic: 'Linux', level: 'Middle' },
      { id: 3, topic: 'Terraform', level: 'Middle' },
      { id: 4, topic: 'Terraform', level: 'Middle' },
      { id: 5, topic: 'Cloud', level: 'Middle' }
    ],
    progress: { 1: { correct: 0, wrong: 2 }, 3: { correct: 0, wrong: 1 } },
    plan: {
      targetLevels: ['Middle'],
      topicStats: [
        { topic: 'Linux', action: { type: 'questions' } },
        { topic: 'Terraform', action: { type: 'questions' } }
      ]
    },
    size: 4,
    now: Date.UTC(2026, 6, 21)
  });
  assert.equal(session.size, 4);
  assert.equal(new Set(session.questionIds.map(String)).size, 4);
  assert.ok(session.topics.includes('Linux'));
  assert.ok(session.topics.includes('Terraform'));
  assert.ok(session.questionIds.includes(1));
  assert.ok(session.questionIds.includes(3));
});

test('builds a safe retest only from existing questions and allowlisted filters', () => {
  const pool = [
    { id: 1, topic: 'Kubernetes', level: 'Middle', category: 'scenario' },
    { id: 2, topic: 'Kubernetes', level: 'Middle', category: 'scenario' },
    { id: 3, topic: 'Kubernetes', level: 'Middle', category: 'definition' },
    { id: 4, topic: 'Linux', level: 'Middle', category: 'scenario' },
    { id: 5, topic: 'Kubernetes', level: 'Senior', category: 'scenario' }
  ];
  const result = coach.buildRetestSession({
    questions: pool,
    recipe: {
      topics: ['Kubernetes', '<script>'], categories: ['scenario', 'evil'],
      levels: ['Middle', 'Root'], size: 99,
      generatedQuestions: [{ id: 999, q: 'Нельзя принимать от модели' }]
    },
    progress: { 1: { correct: 0, wrong: 2 }, 2: { correct: 1, wrong: 0 } },
    now: Date.UTC(2026, 7, 6)
  });

  assert.deepEqual(result.questionIds.sort((a, b) => a - b), [1, 2]);
  assert.equal(result.size, 2);
  assert.deepEqual(result.topics, ['Kubernetes']);
  assert.equal(new Set(result.questionIds).size, result.questionIds.length);
  assert.equal(result.questionIds.includes(999), false);
});

test('normalizes journal entries and rejects incomplete notes', () => {
  const now = Date.UTC(2026, 6, 21);
  const notes = coach.appendJournalEntry([], { topic: 'Linux', note: 'Повторить диагностику DNS' }, now);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].topic, 'Linux');
  assert.equal(coach.isJournalEntry(notes[0]), true);
  assert.deepEqual(coach.appendJournalEntry(notes, { topic: '', note: '' }, now + 1), notes);
});

test('readiness weights add up to 100', () => {
  const total = coach.READINESS_COMPONENTS.reduce((sum, item) => sum + item.weight, 0);
  assert.equal(total, 100);
});

test('readiness index is zero for an untouched profile', () => {
  const index = coach.buildReadinessIndex({});
  assert.equal(index.score, 0);
  assert.equal(index.band, 'low');
  assert.equal(index.components.length, coach.READINESS_COMPONENTS.length);
  index.components.forEach(component => assert.equal(component.score, 0));
});

test('readiness index reaches 100 only when every component is complete', () => {
  const index = coach.buildReadinessIndex({
    topicStats: [{ topic: 'Linux', inRole: true, readiness: 100 }],
    metrics: {
      trainerPasses: 100, incidentsDone: 20, seniorCases: 20,
      weeklyTests: 10, blitzDays: 30, studyDays: 100, bestDailyStreak: 40
    }
  });
  assert.equal(index.score, 100);
  assert.equal(index.band, 'high');
  assert.equal(index.nextAction, null);
  assert.equal(index.weakest, null);
});

test('readiness index never leaves the 0-100 range on absurd input', () => {
  const index = coach.buildReadinessIndex({
    topicStats: [{ topic: 'Linux', inRole: true, readiness: 5000 }],
    metrics: { trainerPasses: 1e6, studyDays: -50, bestDailyStreak: Infinity, weeklyTests: NaN }
  });
  assert.ok(index.score >= 0 && index.score <= 100);
  index.components.forEach(component => {
    assert.ok(component.score >= 0 && component.score <= 100);
    assert.ok(component.contribution <= component.weight);
  });
});

test('each component contributes at most its own weight', () => {
  const index = coach.buildReadinessIndex({
    topicStats: [{ topic: 'Linux', inRole: true, readiness: 60 }],
    metrics: { trainerPasses: 30, weeklyTests: 2, studyDays: 15, bestDailyStreak: 7 }
  });
  const sum = index.components.reduce((total, item) => total + item.contribution, 0);
  assert.equal(index.score, sum);
  index.components.forEach(component => {
    assert.equal(component.headroom, Math.round((1 - component.score / 100) * component.weight));
  });
});

test('readiness index points at the component with the largest headroom', () => {
  const index = coach.buildReadinessIndex({
    topicStats: [{ topic: 'Linux', inRole: true, readiness: 100 }],
    metrics: { trainerPasses: 0, weeklyTests: 4, studyDays: 60, bestDailyStreak: 14 }
  });
  assert.equal(index.nextAction.id, 'practice');
  assert.ok(index.nextAction.gain > 0);
});

test('theory action names the weakest topic that still has questions', () => {
  // Every other component is complete, so theory has the largest headroom and
  // must be the one the hint talks about.
  const index = coach.buildReadinessIndex({
    topicStats: [
      { topic: 'Linux', inRole: true, readiness: 80, action: { type: 'questions', topic: 'Linux' } },
      { topic: 'Terraform', inRole: true, readiness: 10, action: { type: 'questions', topic: 'Terraform' } }
    ],
    metrics: {
      trainerPasses: 100, incidentsDone: 20, seniorCases: 20,
      weeklyTests: 10, blitzDays: 30, studyDays: 100, bestDailyStreak: 40
    }
  });
  assert.equal(index.focusTopic, 'Terraform');
  assert.equal(index.nextAction.id, 'theory');
  assert.ok(index.nextAction.hint.includes('Terraform'));
});

test('focusTopic ignores topics that have no questions to answer', () => {
  const index = coach.buildReadinessIndex({
    topicStats: [
      { topic: 'Regex', inRole: true, readiness: 0, action: { type: 'trainer', page: 'regex' } },
      { topic: 'Linux', inRole: true, readiness: 40, action: { type: 'questions', topic: 'Linux' } }
    ],
    metrics: {}
  });
  assert.equal(index.focusTopic, 'Regex');
});

test('readiness index scores role topics only when the role is set', () => {
  const stats = [
    { topic: 'Linux', inRole: true, readiness: 100 },
    { topic: 'Regex', inRole: false, readiness: 0 }
  ];
  const index = coach.buildReadinessIndex({ topicStats: stats, metrics: {} });
  const theory = index.components.find(item => item.id === 'theory');
  assert.equal(theory.score, 100);
});

test('readiness bands follow the 40 and 70 thresholds', () => {
  const build = readiness => coach.buildReadinessIndex({
    topicStats: [{ topic: 'Linux', inRole: true, readiness }],
    metrics: {
      trainerPasses: 100, incidentsDone: 20, seniorCases: 20,
      weeklyTests: 10, blitzDays: 30, studyDays: 100, bestDailyStreak: 40
    }
  });
  assert.equal(build(0).score, 65);
  assert.equal(build(0).band, 'medium');
  assert.equal(build(100).band, 'high');
});

test('buildPlan exposes the readiness index', () => {
  const plan = coach.buildPlan({
    questions: [
      { id: 1, topic: 'Linux', level: 'Middle', q: 'a' },
      { id: 2, topic: 'Terraform', level: 'Middle', q: 'b' }
    ],
    progress: { 1: { correct: 2, wrong: 0 } },
    skillEvents: [],
    profile: { role: 'DevOps', level: 'Middle', date: '' },
    metrics: { trainerPasses: 10, studyDays: 5, bestDailyStreak: 3 },
    now: Date.UTC(2026, 6, 21)
  });
  assert.ok(plan.readinessIndex);
  assert.ok(plan.readinessIndex.score >= 0 && plan.readinessIndex.score <= 100);
  assert.ok(plan.readinessIndex.nextAction);
});

test('buildPlan still works without metrics', () => {
  const plan = coach.buildPlan({
    questions: [{ id: 1, topic: 'Linux', level: 'Middle', q: 'a' }],
    progress: {},
    skillEvents: [],
    profile: { role: 'DevOps', level: 'Middle', date: '' },
    now: Date.UTC(2026, 6, 21)
  });
  assert.equal(plan.readinessIndex.score, 0);
});
