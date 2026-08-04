const test = require('node:test');
const assert = require('node:assert/strict');
const Gamification = require('./gamification.js');

test('buildMetrics counts answered and mastered questions separately', () => {
  const metrics = Gamification.buildMetrics({
    questionProgress: {
      a: { correct: 3, wrong: 0 },
      b: { correct: 1, wrong: 2 },
      c: { correct: 0, wrong: 0 },
      d: { correct: 2, wrong: 1 }
    }
  });
  assert.equal(metrics.answeredQuestions, 3);
  assert.equal(metrics.masteredQuestions, 2);
  assert.equal(metrics.correctPoints, 6);
});

test('buildMetrics ignores malformed progress records', () => {
  const metrics = Gamification.buildMetrics({
    questionProgress: { a: null, b: 'broken', c: [], d: { correct: 1, wrong: 0 } }
  });
  assert.equal(metrics.answeredQuestions, 1);
  assert.equal(metrics.masteredQuestions, 1);
});

test('buildMetrics counts quiz sources as answers, not as trainer passes', () => {
  const metrics = Gamification.buildMetrics({
    skillEvents: [
      { source: 'exam', score: 1, possible: 1 },
      { source: 'blitz', score: 1, possible: 1 },
      { source: 'daily-blitz', score: 1, possible: 1 },
      { source: 'subnet', score: 1, possible: 1 },
      { source: 'labs', score: 1, possible: 1 },
      { source: 'ts', score: 0, possible: 1 }
    ]
  });
  assert.equal(metrics.trainerPasses, 2);
});

test('buildMetrics reads completion state from trainer and study stores', () => {
  const metrics = Gamification.buildMetrics({
    subnetProgress: { 0: 1, 1: 1 },
    labsProgress: { 0: 1 },
    tsScores: { dns: 80, disk: 60 },
    seniorCaseProgress: { c1: { status: 'done' }, c2: { status: 'todo' } },
    externalTasks: { t1: { status: 'done' }, t2: { status: 'submitted' }, t3: { status: 'todo' } },
    studyProgress: { w1d1: 'done', w1d2: 'in_progress', w1d3: 'done' },
    weeklyResults: { w1: { passed: true }, w2: { passed: false } },
    journal: [{ id: 'n1' }, { id: 'n2' }],
    qbankRevealed: { q1: 1, q2: 1, q3: 1 }
  });
  assert.equal(metrics.subnetSolved, 2);
  assert.equal(metrics.labsSolved, 1);
  assert.equal(metrics.incidentsDone, 2);
  assert.equal(metrics.seniorCases, 1);
  assert.equal(metrics.externalTasks, 2);
  assert.equal(metrics.studyDays, 2);
  assert.equal(metrics.weeklyTests, 1);
  assert.equal(metrics.journalNotes, 2);
  assert.equal(metrics.qbankRevealed, 3);
});

test('buildMetrics keeps the best daily streak when the current one is higher', () => {
  const metrics = Gamification.buildMetrics({ dailyBlitz: { streak: 9, bestStreak: 4 } });
  assert.equal(metrics.bestDailyStreak, 9);
});

test('buildMetrics tolerates a completely empty state', () => {
  const metrics = Gamification.buildMetrics();
  assert.equal(metrics.answeredQuestions, 0);
  assert.equal(metrics.bestDailyStreak, 0);
  assert.equal(metrics.trainerPasses, 0);
});

test('computeXp sums every source and exposes the breakdown', () => {
  const xp = Gamification.computeXp({
    correctPoints: 10, masteredQuestions: 2, trainerPasses: 3, seniorCases: 1,
    studyDays: 2, weeklyTests: 1, externalTasks: 1, blitzDays: 2, journalNotes: 1,
    achievementXp: 100
  });
  assert.equal(xp.breakdown.answers, 30);
  assert.equal(xp.breakdown.mastery, 20);
  assert.equal(xp.breakdown.trainers, 15);
  assert.equal(xp.breakdown.cases, 40);
  assert.equal(xp.breakdown.study, 30);
  assert.equal(xp.breakdown.tests, 50);
  assert.equal(xp.breakdown.tasks, 30);
  assert.equal(xp.breakdown.blitz, 100);
  assert.equal(xp.breakdown.journal, 5);
  assert.equal(xp.breakdown.achievements, 100);
  assert.equal(xp.total, 420);
});

test('computeXp never returns a negative total for corrupted metrics', () => {
  const xp = Gamification.computeXp({ correctPoints: -50, masteredQuestions: -3, blitzDays: NaN });
  assert.equal(xp.total, 0);
});

test('levelFor maps XP to the highest reached threshold', () => {
  assert.equal(Gamification.levelFor(0).level, 1);
  assert.equal(Gamification.levelFor(299).level, 1);
  assert.equal(Gamification.levelFor(300).level, 2);
  assert.equal(Gamification.levelFor(2500).level, 5);
  assert.equal(Gamification.levelFor(15999).level, 9);
  assert.equal(Gamification.levelFor(16000).level, 10);
  assert.equal(Gamification.levelFor(999999).level, 10);
});

test('levelFor reports progress towards the next level', () => {
  const level = Gamification.levelFor(450);
  assert.equal(level.level, 2);
  assert.equal(level.nextXp, 800);
  assert.equal(level.xpToNext, 350);
  assert.equal(level.xpForNext, 500);
  assert.equal(level.progress, 30);
});

test('levelFor caps the last level at full progress with no next level', () => {
  const level = Gamification.levelFor(20000);
  assert.equal(level.next, null);
  assert.equal(level.xpToNext, 0);
  assert.equal(level.progress, 100);
});

test('level thresholds are strictly increasing', () => {
  const levels = Gamification.LEVELS;
  for (let index = 1; index < levels.length; index++) {
    assert.ok(levels[index].minXp > levels[index - 1].minXp, `level ${index + 1} threshold must grow`);
  }
});

test('every achievement references a metric that buildMetrics produces', () => {
  const metrics = Gamification.buildMetrics({});
  Gamification.ACHIEVEMENTS.forEach(achievement => {
    assert.ok(Object.prototype.hasOwnProperty.call(metrics, achievement.metric),
      `unknown metric ${achievement.metric} in ${achievement.id}`);
    assert.ok(achievement.goal > 0, `${achievement.id} must have a positive goal`);
    assert.ok(achievement.xp > 0, `${achievement.id} must award XP`);
    assert.ok(Gamification.ACHIEVEMENT_CATEGORIES.includes(achievement.category),
      `${achievement.id} has an unknown category`);
  });
});

test('achievement ids are unique', () => {
  const ids = Gamification.ACHIEVEMENTS.map(item => item.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('evaluateAchievements clamps the displayed value to the goal', () => {
  const result = Gamification.evaluateAchievements({ answeredQuestions: 500 });
  const first = result.find(item => item.id === 'first_answer');
  assert.equal(first.unlocked, true);
  assert.equal(first.value, 1);
  assert.equal(first.rawValue, 500);
  assert.equal(first.progress, 100);
});

test('evaluateAchievements reports partial progress for locked entries', () => {
  const result = Gamification.evaluateAchievements({ masteredQuestions: 5 });
  const entry = result.find(item => item.id === 'mastered_10');
  assert.equal(entry.unlocked, false);
  assert.equal(entry.progress, 50);
});

test('buildProfile awards achievement XP on top of activity XP', () => {
  const state = { questionProgress: { a: { correct: 1, wrong: 0 } } };
  const profile = Gamification.buildProfile(state);
  const firstAnswer = Gamification.ACHIEVEMENTS.find(item => item.id === 'first_answer');
  const mastered = Gamification.ACHIEVEMENTS.find(item => item.id === 'mastered_10');
  assert.equal(profile.unlockedCount, 1);
  assert.equal(profile.xpBreakdown.achievements, firstAnswer.xp);
  assert.equal(profile.xp, 3 + 10 + firstAnswer.xp);
  assert.ok(mastered.goal > 1);
});

test('buildProfile is a pure projection: same state gives the same XP', () => {
  const state = {
    questionProgress: { a: { correct: 4, wrong: 1 }, b: { correct: 2, wrong: 0 } },
    skillEvents: [{ source: 'git', score: 1, possible: 1 }],
    dailyBlitz: { completedCount: 3, streak: 3, bestStreak: 3 }
  };
  const first = Gamification.buildProfile(state);
  const second = Gamification.buildProfile(JSON.parse(JSON.stringify(state)));
  assert.equal(first.xp, second.xp);
  assert.equal(first.unlockedCount, second.unlockedCount);
  assert.equal(first.level.level, second.level.level);
});

test('buildProfile picks the closest unfinished quest', () => {
  const profile = Gamification.buildProfile({
    questionProgress: Object.fromEntries(
      Array.from({ length: 9 }, (_, index) => ['q' + index, { correct: 1, wrong: 0 }])
    )
  });
  assert.equal(profile.quest.id, 'mastered_10');
  assert.equal(profile.quest.progress, 90);
});

test('buildProfile falls back to the cheapest locked achievement with no progress', () => {
  const profile = Gamification.buildProfile({});
  assert.ok(profile.quest);
  assert.equal(profile.quest.unlocked, false);
  assert.equal(profile.quest.progress, 0);
});

test('buildProfile counts unseen unlocks for the notification dot', () => {
  const state = { questionProgress: { a: { correct: 1, wrong: 0 } } };
  assert.equal(Gamification.buildProfile(state).freshCount, 1);
  const seen = Gamification.buildProfile({ ...state, seenAchievements: ['first_answer'] });
  assert.equal(seen.freshCount, 0);
  assert.equal(seen.unlockedCount, 1);
});

test('markAchievementsSeen stores unlocked ids without duplicating them', () => {
  const achievements = [
    { id: 'first_answer', unlocked: true },
    { id: 'answers_50', unlocked: false }
  ];
  const once = Gamification.markAchievementsSeen({ seenAchievements: ['first_answer'] }, achievements);
  assert.deepEqual(once.seenAchievements, ['first_answer']);
  const fresh = Gamification.markAchievementsSeen(null, achievements);
  assert.deepEqual(fresh.seenAchievements, ['first_answer']);
});

test('markAchievementsSeen preserves unrelated fields of the state', () => {
  const next = Gamification.markAchievementsSeen({ streak: 4, seenAchievements: [] }, [{ id: 'streak_3', unlocked: true }]);
  assert.equal(next.streak, 4);
  assert.deepEqual(next.seenAchievements, ['streak_3']);
});
