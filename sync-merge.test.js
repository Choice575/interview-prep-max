const test = require('node:test');
const assert = require('node:assert/strict');
const Merge = require('./sync-merge.js');
const Storage = require('./storage.js');
const ProgressIO = require('./progress-io.js');

// Ключи, которые принадлежат устройству и не уезжают в снимок.
const SERVICE_KEYS = ['storage_schema', 'curriculum_version', 'progress_backup', 'sync_token', 'sync_meta', 'admin_token'];

function snapshot(state, updatedAt, deviceId) {
  return { snapshotVersion: 1, updatedAt, deviceId: deviceId || 'dev', state };
}

test('every storage key has an explicit merge rule', () => {
  const missing = Object.keys(Storage.DEFAULT_KEYS)
    .filter(key => !Merge.MERGE_RULES[key] && !SERVICE_KEYS.includes(key));
  assert.deepEqual(missing, [], 'ключ без правила молча уйдёт в last-write-wins');
  const transported = [...ProgressIO.IMPORT_RECORD_KEYS, ...ProgressIO.IMPORT_ARRAY_KEYS];
  assert.deepEqual(transported.filter(key => !Merge.MERGE_RULES[key]), []);
});

test('answers from two devices both survive the merge', () => {
  // Телефон ответил на вопрос 1, ноутбук на вопрос 2. Наивная перезапись
  // снимка потеряла бы одну из сессий целиком.
  const phone = snapshot({ qprog: { 1: { correct: 1, wrong: 0, lastSeen: 100 } } }, 100, 'phone');
  const laptop = snapshot({ qprog: { 2: { correct: 1, wrong: 0, lastSeen: 200 } } }, 200, 'laptop');
  const merged = Merge.mergeSnapshots(phone, laptop);
  assert.deepEqual(Object.keys(merged.state.qprog).sort(), ['1', '2']);
  assert.equal(merged.updatedAt, 200);
});

test('question counters take the maximum and keep the fresher SRS schedule', () => {
  const older = { qprog: { 7: { correct: 5, wrong: 2, repetitions: 3, lastSeen: 100, ease: 2.5, interval: 6, nextReviewAt: 500 } } };
  const newer = { qprog: { 7: { correct: 4, wrong: 3, repetitions: 4, lastSeen: 300, ease: 2.2, interval: 10, nextReviewAt: 900 } } };
  const merged = Merge.mergeSnapshots(snapshot(older, 100), snapshot(newer, 300)).state.qprog[7];
  assert.equal(merged.correct, 5);
  assert.equal(merged.wrong, 3);
  assert.equal(merged.repetitions, 4);
  assert.equal(merged.lastSeen, 300);
  // ease/interval/nextReviewAt — связанная тройка, берётся у свежей записи целиком
  assert.equal(merged.ease, 2.2);
  assert.equal(merged.interval, 10);
  assert.equal(merged.nextReviewAt, 900);
});

test('question response times come from one device, never concatenated', () => {
  // Конкатенация росла бы при каждом синке и вытеснила бы реальную историю
  // из лимита в 100 значений, испортив среднее время ответа.
  const left = { qprog: { 1: { times: Array.from({ length: 80 }, (_, i) => i), lastSeen: 10 } } };
  const right = { qprog: { 1: { times: Array.from({ length: 80 }, (_, i) => 100 + i), lastSeen: 20 } } };
  const merged = Merge.mergeSnapshots(snapshot(left, 10), snapshot(right, 20)).state.qprog[1];
  assert.equal(merged.times.length, 80);
  assert.equal(merged.times[0], 100, 'хвост берётся у записи со свежим lastSeen');
});

test('repeated syncs never grow the response time tail', () => {
  const state = { qprog: { 1: { correct: 2, wrong: 1, lastSeen: 10, times: [12, 12, 9] } } };
  let acc = Merge.mergeSnapshots(snapshot(state, 100), snapshot(state, 100));
  for (let i = 0; i < 5; i++) acc = Merge.mergeSnapshots(acc, snapshot(state, 100));
  assert.deepEqual(acc.state.qprog[1].times, [12, 12, 9], 'одинаковые длительности законны и не должны дедуплицироваться');
});

test('question merge does not depend on argument order', () => {
  const left = { qprog: { 1: { correct: 3, wrong: 1, lastSeen: 50, ease: 2.5, interval: 6, times: [10, 20] } } };
  const right = { qprog: { 1: { correct: 1, wrong: 4, lastSeen: 50, ease: 2.1, interval: 9, times: [30, 40] } } };
  const one = Merge.mergeSnapshots(snapshot(left, 1), snapshot(right, 2)).state.qprog[1];
  const two = Merge.mergeSnapshots(snapshot(right, 2), snapshot(left, 1)).state.qprog[1];
  assert.deepEqual(one, two, 'при равном lastSeen нужен детерминированный тай-брейк');
});

test('merging does not invent fields that neither device had', () => {
  // Безусловная запись repetitions:0 меняла форму записи от числа синков,
  // и устройства с разным количеством обменов не сходились к одному состоянию.
  const left = { qprog: { 1: { correct: 1, wrong: 0, lastSeen: 100 } } };
  const right = { qprog: { 2: { correct: 1, wrong: 0, lastSeen: 200 } } };
  const once = Merge.mergeSnapshots(snapshot(left, 100), snapshot(right, 200));
  assert.equal('repetitions' in once.state.qprog[1], false);
  // Повторный обмен не должен менять форму записи.
  const twice = Merge.mergeSnapshots(once, snapshot(left, 100));
  assert.deepEqual(twice.state.qprog, once.state.qprog);
});

test('existing SRS counters are still merged by maximum', () => {
  const left = { qprog: { 1: { correct: 2, wrong: 1, repetitions: 3, lastSeen: 10 } } };
  const right = { qprog: { 1: { correct: 1, wrong: 2, lastSeen: 20 } } };
  const merged = Merge.mergeSnapshots(snapshot(left, 10), snapshot(right, 20)).state.qprog[1];
  assert.equal(merged.repetitions, 3, 'поле есть у одной стороны — его нужно сохранить');
  assert.equal(merged.correct, 2);
  assert.equal(merged.wrong, 2);
});

test('trainer answers are immutable once written', () => {
  // Тренажёры не дают перерешать задание (if(done[id]!==undefined) return),
  // поэтому первая запись — истина, а не конфликт.
  const left = { cmd_prog: { 1: 0, 2: 3 } };
  const right = { cmd_prog: { 1: 2, 5: 1 } };
  const merged = Merge.mergeSnapshots(snapshot(left, 200), snapshot(right, 100)).state.cmd_prog;
  assert.deepEqual(merged, { 1: 0, 2: 3, 5: 1 });
});

test('study day marked done on either device stays done', () => {
  const left = { study_progress: { w1d1: 'done', w1d2: 'active' } };
  const right = { study_progress: { w1d2: 'done', w1d3: 'done' } };
  const merged = Merge.mergeSnapshots(snapshot(left, 100), snapshot(right, 200)).state.study_progress;
  assert.deepEqual(merged, { w1d1: 'done', w1d2: 'done', w1d3: 'done' });
});

test('mlops progress merges independently of devops progress', () => {
  const left = { study_progress: { w1d1: 'done' }, mlops_progress: { w2d1: 'done' } };
  const right = { study_progress: { w1d2: 'done' }, mlops_progress: { w2d2: 'done' } };
  const merged = Merge.mergeSnapshots(snapshot(left, 1), snapshot(right, 2)).state;
  assert.deepEqual(Object.keys(merged.study_progress).sort(), ['w1d1', 'w1d2']);
  assert.deepEqual(Object.keys(merged.mlops_progress).sort(), ['w2d1', 'w2d2']);
});

test('daily counters take the per-day maximum', () => {
  const left = { daily: { '2026-08-01': 12, '2026-08-02': 3 } };
  const right = { daily: { '2026-08-02': 9, '2026-08-03': 4 } };
  const merged = Merge.mergeSnapshots(snapshot(left, 1), snapshot(right, 2)).state.daily;
  assert.deepEqual(merged, { '2026-08-01': 12, '2026-08-02': 9, '2026-08-03': 4 });
});

test('troubleshooting scores keep the best result', () => {
  const merged = Merge.mergeSnapshots(
    snapshot({ ts_scores: { s1: 80, s2: 40 } }, 1),
    snapshot({ ts_scores: { s1: 55, s3: 70 } }, 2)
  ).state.ts_scores;
  assert.deepEqual(merged, { s1: 80, s2: 40, s3: 70 });
});

test('incident progress keeps the higher score object', () => {
  const left = { inc_prog: { i1: { score: 8, total: 10, at: 100 } } };
  const right = { inc_prog: { i1: { score: 5, total: 10, at: 900 } } };
  const merged = Merge.mergeSnapshots(snapshot(left, 100), snapshot(right, 900)).state.inc_prog;
  assert.equal(merged.i1.score, 8, 'более свежая, но худшая попытка не должна затирать рекорд');
});

test('senior cases stay done and keep the earliest completion', () => {
  const left = { senior_case_prog: { c1: { status: 'done', completedAt: '2026-08-01T10:00:00.000Z' } } };
  const right = { senior_case_prog: { c1: { status: 'open' }, c2: { status: 'done', completedAt: '2026-08-02T10:00:00.000Z' } } };
  const merged = Merge.mergeSnapshots(snapshot(left, 1), snapshot(right, 2)).state.senior_case_prog;
  assert.equal(merged.c1.status, 'done');
  assert.equal(merged.c1.completedAt, '2026-08-01T10:00:00.000Z');
  assert.equal(merged.c2.status, 'done');
});

test('weekly test results stay passed once passed anywhere', () => {
  const left = { study_weekly_results: { w1: { passed: true, passedAt: '2026-08-01T00:00:00.000Z', score: 4, updatedAt: '2026-08-01T00:00:00.000Z' } } };
  const right = { study_weekly_results: { w1: { passed: false, passedAt: '', score: 2, updatedAt: '2026-08-05T00:00:00.000Z' } } };
  const merged = Merge.mergeSnapshots(snapshot(left, 1), snapshot(right, 2)).state.study_weekly_results.w1;
  assert.equal(merged.passed, true, 'повторная неудачная попытка не отменяет сдачу');
  assert.equal(merged.passedAt, '2026-08-01T00:00:00.000Z');
  assert.equal(merged.score, 2, 'остальные поля берутся у свежей записи');
});

test('stats never report more correct answers than total', () => {
  const merged = Merge.mergeSnapshots(
    snapshot({ stats: { total: 100, correct: 90 } }, 1),
    snapshot({ stats: { total: 50, correct: 95 } }, 2)
  ).state.stats;
  assert.equal(merged.total, 100);
  assert.ok(merged.correct <= merged.total);
});

test('history and skill events append without duplicating', () => {
  const shared = { at: 100, source: 'exam', score: 1, possible: 1 };
  const left = { history: [{ date: 'd1', topic: 'Linux', correct: true }], skill_events: [shared, { at: 200, source: 'exam', score: 1, possible: 1 }] };
  const right = { history: [{ date: 'd1', topic: 'Linux', correct: true }, { date: 'd2', topic: 'Git', correct: false }], skill_events: [shared, { at: 300, source: 'lab', score: 1, possible: 1 }] };
  const merged = Merge.mergeSnapshots(snapshot(left, 1), snapshot(right, 2)).state;
  assert.equal(merged.history.length, 2, 'одинаковая запись истории не должна удваиваться');
  assert.equal(merged.skill_events.length, 3);
  assert.deepEqual(merged.skill_events.map(item => item.at), [100, 200, 300], 'события отсортированы по времени');
});

test('journal note edited on another device wins by timestamp', () => {
  const left = { coach_journal: [{ id: 'n1', topic: 'Linux', note: 'старый текст', at: 100 }] };
  const right = { coach_journal: [{ id: 'n1', topic: 'Linux', note: 'исправленный текст', at: 500 }, { id: 'n2', topic: 'Git', note: 'вторая', at: 200 }] };
  const merged = Merge.mergeSnapshots(snapshot(left, 100), snapshot(right, 500)).state.coach_journal;
  assert.equal(merged.length, 2);
  assert.equal(merged.find(item => item.id === 'n1').note, 'исправленный текст');
});

test('custom questions merge by id without collision', () => {
  const left = { custom: [{ id: 9001, topic: 'Linux', level: 'Junior', q: 'a', options: ['x', 'y'], answer: 0 }] };
  const right = { custom: [{ id: 9002, topic: 'Git', level: 'Junior', q: 'b', options: ['x', 'y'], answer: 1 }] };
  const merged = Merge.mergeSnapshots(snapshot(left, 1), snapshot(right, 2)).state.custom;
  assert.deepEqual(merged.map(item => item.id).sort(), [9001, 9002]);
});

test('seen achievements union so no badge dot re-fires', () => {
  const merged = Merge.mergeSnapshots(
    snapshot({ gamification: { seenAchievements: ['a', 'b'] } }, 1),
    snapshot({ gamification: { seenAchievements: ['b', 'c'] } }, 2)
  ).state.gamification;
  assert.deepEqual(merged.seenAchievements.sort(), ['a', 'b', 'c']);
});

test('blitz keeps the best streak and the fresher day counters', () => {
  const older = { daily_blitz: { dateKey: '2026-08-04', answered: 5, correct: 4, completed: true, streak: 3, bestStreak: 9, completedCount: 20, lastCompletedKey: '2026-08-04' } };
  const newer = { daily_blitz: { dateKey: '2026-08-05', answered: 2, correct: 1, completed: false, streak: 4, bestStreak: 4, completedCount: 21, lastCompletedKey: '2026-08-04' } };
  const merged = Merge.mergeSnapshots(snapshot(older, 100), snapshot(newer, 200)).state.daily_blitz;
  assert.equal(merged.dateKey, '2026-08-05', 'счётчики дня берутся у свежей даты');
  assert.equal(merged.answered, 2);
  assert.equal(merged.bestStreak, 9, 'рекорд стрика монотонен');
  assert.equal(merged.completedCount, 21);
});

test('same control session continued on two devices merges attempts', () => {
  const base = { id: 'ctl-1', startedAt: 1000, questionIds: ['1', '2', '3'], topics: ['Linux'] };
  const left = { coach_control: { ...base, attempts: [{ questionId: '1', topic: 'Linux', score: 1, responseSeconds: 10, at: 1100 }] } };
  const right = { coach_control: { ...base, attempts: [{ questionId: '2', topic: 'Linux', score: 0, responseSeconds: 20, at: 1200 }] } };
  const merged = Merge.mergeSnapshots(snapshot(left, 1100), snapshot(right, 1200)).state.coach_control;
  assert.equal(merged.attempts.length, 2);
  assert.equal(merged.completedAt, null, 'сессия не закрыта, пока отвечены не все вопросы');
});

test('AI review history merges by id, stays bounded and is commutative', () => {
  const leftItems = Array.from({ length: 20 }, (_, index) => ({ id: 'left-' + index, at: index, review: { verdict: { readiness: index } } }));
  const rightItems = Array.from({ length: 20 }, (_, index) => ({ id: 'right-' + index, at: 100 + index, review: { verdict: { readiness: index } } }));
  rightItems.push({ id: 'left-19', at: 999, review: { verdict: { readiness: 99 } } });
  const left = snapshot({ ai_review_history: leftItems }, 100);
  const right = snapshot({ ai_review_history: rightItems }, 200);
  const one = Merge.mergeSnapshots(left, right).state.ai_review_history;
  const two = Merge.mergeSnapshots(right, left).state.ai_review_history;

  assert.equal(one.length, 30);
  assert.deepEqual(one, two);
  assert.equal(one.find(item => item.id === 'left-19').review.verdict.readiness, 99);
});

test('interview AI history merges by id, stays bounded and is commutative', () => {
  const leftItems = Array.from({ length: 20 }, (_, index) => ({ id: 'ip-left-' + index, at: index, overallScore: index }));
  const rightItems = Array.from({ length: 20 }, (_, index) => ({ id: 'ip-right-' + index, at: 100 + index, overallScore: index }));
  rightItems.push({ id: 'ip-left-19', at: 999, overallScore: 99 });
  const left = snapshot({ interview_ai_history: leftItems }, 100);
  const right = snapshot({ interview_ai_history: rightItems }, 200);
  const one = Merge.mergeSnapshots(left, right).state.interview_ai_history;
  const two = Merge.mergeSnapshots(right, left).state.interview_ai_history;

  assert.equal(Merge.MERGE_RULES.interview_ai_history, 'reviewHistory');
  assert.equal(one.length, 30);
  assert.deepEqual(one, two);
  assert.equal(one.find(item => item.id === 'ip-left-19').overallScore, 99);
});

test('a newer control session replaces an older different one', () => {
  const left = { coach_control: { id: 'ctl-1', startedAt: 1000, questionIds: ['1'], attempts: [] } };
  const right = { coach_control: { id: 'ctl-2', startedAt: 5000, questionIds: ['2'], attempts: [] } };
  const merged = Merge.mergeSnapshots(snapshot(left, 1), snapshot(right, 2)).state.coach_control;
  assert.equal(merged.id, 'ctl-2');
});

test('cursor and settings follow the newer snapshot and are reported as conflicts', () => {
  const left = { study_position: { week: 3, day: 2 }, theme: 'dark', study_program: 'devops' };
  const right = { study_position: { week: 5, day: 1 }, theme: 'light', study_program: 'mlops' };
  const merged = Merge.mergeSnapshots(snapshot(left, 100), snapshot(right, 900));
  assert.deepEqual(merged.state.study_position, { week: 5, day: 1 });
  assert.equal(merged.state.theme, 'light');
  assert.equal(merged.state.study_program, 'mlops');
  assert.ok(merged.conflicts.includes('study_position'));
  assert.ok(merged.conflicts.includes('theme'));
});

test('identical last-write-wins values are not reported as conflicts', () => {
  const state = { study_position: { week: 3, day: 2 }, theme: 'dark' };
  const merged = Merge.mergeSnapshots(snapshot(state, 100), snapshot({ ...state }, 900));
  assert.deepEqual(merged.conflicts, []);
});

test('mistakes are not unioned so fixed ones stay fixed', () => {
  // mistakes очищается при верном ответе; объединение воскресило бы ошибку,
  // которую пользователь уже исправил на другом устройстве.
  const left = { mistakes: { 1: 1, 2: 1 } };
  const right = { mistakes: { 3: 1 } };
  const merged = Merge.mergeSnapshots(snapshot(left, 100), snapshot(right, 900)).state.mistakes;
  assert.deepEqual(merged, { 3: 1 });
});

test('merging is commutative for monotonic keys', () => {
  const left = { qprog: { 1: { correct: 3, wrong: 1, lastSeen: 50 } }, daily: { d1: 5 }, study_progress: { w1d1: 'done' } };
  const right = { qprog: { 1: { correct: 1, wrong: 4, lastSeen: 90 } }, daily: { d1: 8 }, study_progress: { w1d2: 'done' } };
  const one = Merge.mergeSnapshots(snapshot(left, 50), snapshot(right, 90)).state;
  const two = Merge.mergeSnapshots(snapshot(right, 90), snapshot(left, 50)).state;
  assert.deepEqual(one.qprog, two.qprog);
  assert.deepEqual(one.daily, two.daily);
  assert.deepEqual(one.study_progress, two.study_progress);
});

test('merging is idempotent', () => {
  const state = {
    qprog: { 1: { correct: 2, wrong: 1, lastSeen: 10, times: [3, 4] } },
    history: [{ date: 'd1', topic: 'Linux', correct: true }],
    skill_events: [{ at: 10, source: 'exam', score: 1, possible: 1 }],
    coach_journal: [{ id: 'n1', topic: 'Linux', note: 'x', at: 10 }],
    daily: { d1: 3 }, study_progress: { w1d1: 'done' }, stats: { total: 5, correct: 3 }
  };
  const once = Merge.mergeSnapshots(snapshot(state, 100), snapshot(state, 100));
  const twice = Merge.mergeSnapshots(once, snapshot(state, 100));
  assert.deepEqual(twice.state, once.state, 'повторный синк не должен менять состояние');
});

test('an empty remote snapshot keeps local state intact', () => {
  const local = { qprog: { 1: { correct: 1, wrong: 0, lastSeen: 5 } }, theme: 'dark' };
  const merged = Merge.mergeSnapshots(snapshot(local, 100), snapshot({}, 0));
  assert.deepEqual(merged.state, local);
});

test('malformed snapshots do not throw', () => {
  assert.doesNotThrow(() => Merge.mergeSnapshots(null, undefined));
  assert.doesNotThrow(() => Merge.mergeSnapshots({ state: 'nonsense' }, { state: [] }));
  const merged = Merge.mergeSnapshots({ state: { qprog: 'broken' } }, { state: { qprog: { 1: { correct: 1 } } } });
  assert.equal(typeof merged.state.qprog, 'object');
});

test('merged snapshot survives progress-io validation', () => {
  // Слитый снимок уходит на другое устройство как файл прогресса, поэтому он
  // обязан проходить тот же валидатор, что и обычный импорт.
  const left = {
    qprog: { 1: { correct: 2, wrong: 1, lastSeen: 100 } },
    stats: { total: 10, correct: 6 }, history: [{ date: '2026-08-01', topic: 'Linux', correct: true }],
    study_position: { week: 2, day: 3 }, study_program: 'devops', daily: { '2026-08-01': 4 }
  };
  const right = {
    qprog: { 2: { correct: 1, wrong: 0, lastSeen: 200 } },
    stats: { total: 12, correct: 7 }, history: [{ date: '2026-08-02', topic: 'Git', correct: false }],
    study_position: { week: 3, day: 1 }, study_program: 'devops', daily: { '2026-08-02': 6 }
  };
  const merged = Merge.mergeSnapshots(snapshot(left, 100), snapshot(right, 200));
  const payload = { version: '14.3.0', ...merged.state };
  assert.doesNotThrow(() => ProgressIO.validateProgressImport(payload, { baseQuestions: [] }));
});
