const test = require('node:test');
const assert = require('node:assert/strict');
const Daily = require('./daily.js');

function buildQuestions(count) {
  const topics = ['Linux', 'Docker', 'Kubernetes', 'Сети', 'Terraform', 'Ansible', 'CI/CD'];
  const levels = ['Junior', 'Middle', 'Senior'];
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    topic: topics[index % topics.length],
    level: levels[index % levels.length],
    q: 'Вопрос ' + (index + 1),
    options: ['A', 'B', 'C', 'D'],
    answer: index % 4
  }));
}

const AUG_04 = new Date(2026, 7, 4, 10, 0, 0).getTime();
const AUG_05 = new Date(2026, 7, 5, 10, 0, 0).getTime();

test('selectQuestions returns the same set for the same date', () => {
  const questions = buildQuestions(60);
  const first = Daily.selectQuestions({ questions, dateKey: '2026-08-04' });
  const second = Daily.selectQuestions({ questions, dateKey: '2026-08-04' });
  assert.deepEqual(first.questions.map(item => item.id), second.questions.map(item => item.id));
});

test('selectQuestions returns a different set on the next date', () => {
  const questions = buildQuestions(60);
  const today = Daily.selectQuestions({ questions, dateKey: '2026-08-04' });
  const tomorrow = Daily.selectQuestions({ questions, dateKey: '2026-08-05' });
  assert.notDeepEqual(today.questions.map(item => item.id), tomorrow.questions.map(item => item.id));
});

test('selectQuestions honours the 1 Junior / 2 Middle / 2 Senior composition', () => {
  const result = Daily.selectQuestions({ questions: buildQuestions(90), dateKey: '2026-08-04' });
  assert.equal(result.questions.length, 5);
  assert.deepEqual(result.questions.map(item => item.level), ['Junior', 'Middle', 'Middle', 'Senior', 'Senior']);
});

test('selectQuestions spreads the blitz across distinct topics', () => {
  const result = Daily.selectQuestions({ questions: buildQuestions(90), dateKey: '2026-08-04' });
  const topics = new Set(result.questions.map(item => item.topic));
  assert.equal(topics.size, 5);
});

test('selectQuestions never repeats a question inside one day', () => {
  const result = Daily.selectQuestions({ questions: buildQuestions(12), dateKey: '2026-08-04' });
  const ids = result.questions.map(item => String(item.id));
  assert.equal(new Set(ids).size, ids.length);
});

test('selectQuestions skips entries without usable options', () => {
  const questions = [
    { id: 1, topic: 'Linux', level: 'Junior', options: ['A', 'B'], answer: 0 },
    { id: 2, topic: 'Linux', level: 'Middle', options: [], answer: 0 },
    { id: 3, topic: 'Docker', level: 'Middle', options: ['A', 'B'], answer: 5 },
    { id: 4, topic: 'Docker', level: 'Senior', options: ['A', 'B'], answer: 1 }
  ];
  const result = Daily.selectQuestions({ questions, dateKey: '2026-08-04' });
  assert.deepEqual(result.questions.map(item => item.id).sort(), [1, 4]);
});

test('selectQuestions returns a short set instead of failing on a thin pool', () => {
  const result = Daily.selectQuestions({ questions: buildQuestions(3), dateKey: '2026-08-04' });
  assert.equal(result.questions.length, 3);
});

test('selectQuestions tolerates an empty pool', () => {
  const result = Daily.selectQuestions({ questions: [], dateKey: '2026-08-04' });
  assert.deepEqual(result.questions, []);
  assert.deepEqual(result.topics, []);
});

test('topicsForDay deduplicates topics before rotating', () => {
  const topics = Daily.topicsForDay(['Linux', 'Linux', 'Linux', 'Docker'], '2026-08-04');
  assert.deepEqual([...new Set(topics)], topics);
  assert.ok(topics.length <= 2);
});

test('topicsForDay rotates the order from one day to the next', () => {
  const list = ['Linux', 'Docker', 'Kubernetes', 'Сети', 'Terraform', 'Ansible'];
  const today = Daily.topicsForDay(list, '2026-08-04');
  const tomorrow = Daily.topicsForDay(list, '2026-08-05');
  assert.notDeepEqual(today, tomorrow);
  assert.equal(today.length, Daily.TOPIC_ROTATION_SIZE);
});

test('normaliseState rejects malformed values and clamps counters', () => {
  const state = Daily.normaliseState({
    dateKey: 'not-a-date', answered: 99, correct: -3, streak: 2.6,
    completed: 'yes', lastCompletedKey: '2026-13-40'
  });
  assert.equal(state.dateKey, null);
  assert.equal(state.answered, Daily.BLITZ_SIZE);
  assert.equal(state.correct, 0);
  assert.equal(state.streak, 3);
  assert.equal(state.completed, false);
  assert.equal(state.lastCompletedKey, null);
});

test('stateForDay resets daily counters when the date changes', () => {
  const next = Daily.stateForDay({
    dateKey: '2026-08-03', answered: 5, correct: 4, completed: true,
    streak: 4, bestStreak: 4, completedCount: 4, lastCompletedKey: '2026-08-03'
  }, AUG_04);
  assert.equal(next.dateKey, '2026-08-04');
  assert.equal(next.answered, 0);
  assert.equal(next.correct, 0);
  assert.equal(next.completed, false);
  assert.equal(next.completedCount, 4);
});

test('stateForDay keeps the streak when the previous day was completed', () => {
  const next = Daily.stateForDay({ dateKey: '2026-08-03', streak: 4, bestStreak: 4, lastCompletedKey: '2026-08-03' }, AUG_04);
  assert.equal(next.streak, 4);
});

test('stateForDay breaks the streak after a skipped day but keeps the record', () => {
  const next = Daily.stateForDay({ dateKey: '2026-08-01', streak: 9, bestStreak: 9, lastCompletedKey: '2026-08-01' }, AUG_04);
  assert.equal(next.streak, 0);
  assert.equal(next.bestStreak, 9);
});

test('stateForDay leaves today untouched', () => {
  const state = { dateKey: '2026-08-04', answered: 3, correct: 2, streak: 1, bestStreak: 1, completedCount: 1, lastCompletedKey: '2026-08-03' };
  const next = Daily.stateForDay(state, AUG_04);
  assert.equal(next.answered, 3);
  assert.equal(next.correct, 2);
});

test('recordAnswer counts answers and correct hits', () => {
  let state = Daily.stateForDay(null, AUG_04);
  state = Daily.recordAnswer(state, { correct: true }, AUG_04);
  state = Daily.recordAnswer(state, { correct: false }, AUG_04);
  assert.equal(state.answered, 2);
  assert.equal(state.correct, 1);
});

test('recordAnswer stops counting once the day is complete', () => {
  const completed = Daily.completeDay(Daily.stateForDay(null, AUG_04), AUG_04);
  const next = Daily.recordAnswer(completed, { correct: true }, AUG_04);
  assert.equal(next.answered, completed.answered);
});

test('completeDay starts the streak at one and counts the run', () => {
  const state = Daily.completeDay(Daily.stateForDay(null, AUG_04), AUG_04);
  assert.equal(state.completed, true);
  assert.equal(state.streak, 1);
  assert.equal(state.bestStreak, 1);
  assert.equal(state.completedCount, 1);
  assert.equal(state.lastCompletedKey, '2026-08-04');
});

test('completeDay increments the streak on consecutive days', () => {
  const first = Daily.completeDay(Daily.stateForDay(null, AUG_04), AUG_04);
  const second = Daily.completeDay(first, AUG_05);
  assert.equal(second.streak, 2);
  assert.equal(second.bestStreak, 2);
  assert.equal(second.completedCount, 2);
});

test('completeDay is idempotent within one day', () => {
  const once = Daily.completeDay(Daily.stateForDay(null, AUG_04), AUG_04);
  const twice = Daily.completeDay(once, AUG_04);
  assert.equal(twice.streak, once.streak);
  assert.equal(twice.completedCount, once.completedCount);
});

test('completeDay restarts the streak after a gap', () => {
  const stale = { dateKey: '2026-08-01', streak: 6, bestStreak: 6, completedCount: 6, lastCompletedKey: '2026-08-01' };
  const next = Daily.completeDay(stale, AUG_04);
  assert.equal(next.streak, 1);
  assert.equal(next.bestStreak, 6);
  assert.equal(next.completedCount, 7);
});

test('secondsUntilReset counts down to local midnight', () => {
  const seconds = Daily.secondsUntilReset(new Date(2026, 7, 4, 23, 59, 30).getTime());
  assert.equal(seconds, 30);
});

test('formatCountdown renders hh:mm:ss', () => {
  assert.equal(Daily.formatCountdown(0), '00:00:00');
  assert.equal(Daily.formatCountdown(3661), '01:01:01');
  assert.equal(Daily.formatCountdown(-5), '00:00:00');
});

test('skillOfTheDay is stable per date and rotates the next day', () => {
  const bestPractices = {
    topics: [
      { topic: 'Docker', slug: 'docker', icon: '🐳', practices: [{ title: 'A', why: 'w', action: 'a' }, { title: 'B', why: 'w', action: 'a' }] },
      { topic: 'Linux', slug: 'linux', icon: '🐧', practices: [{ title: 'C', why: 'w', action: 'a' }] }
    ]
  };
  const today = Daily.skillOfTheDay({ bestPractices, dateKey: '2026-08-04' });
  const again = Daily.skillOfTheDay({ bestPractices, dateKey: '2026-08-04' });
  const tomorrow = Daily.skillOfTheDay({ bestPractices, dateKey: '2026-08-05' });
  assert.equal(today.title, again.title);
  assert.notEqual(today.title, tomorrow.title);
  assert.equal(today.total, 3);
  assert.ok(today.topic);
});

test('skillOfTheDay returns null when there are no practices', () => {
  assert.equal(Daily.skillOfTheDay({ bestPractices: { topics: [] } }), null);
  assert.equal(Daily.skillOfTheDay({}), null);
});

test('skillOfTheDay skips entries without a title', () => {
  const result = Daily.skillOfTheDay({
    bestPractices: { topics: [{ topic: 'Docker', practices: [{ why: 'no title' }, { title: 'Ok' }] }] },
    dateKey: '2026-08-04'
  });
  assert.equal(result.title, 'Ok');
  assert.equal(result.total, 1);
});

test('grade bands the blitz result', () => {
  assert.equal(Daily.grade(5, 5).band, 'high');
  assert.equal(Daily.grade(3, 5).band, 'medium');
  assert.equal(Daily.grade(1, 5).band, 'low');
  assert.equal(Daily.grade(0, 5).band, 'low');
});
