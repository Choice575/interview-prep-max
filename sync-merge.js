(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IPMaxSyncMerge = api;
})(typeof self !== 'undefined' ? self : globalThis, function() {
  'use strict';

  const SNAPSHOT_VERSION = 1;
  const HISTORY_LIMIT = 1000;
  const EVENT_LIMIT = 500;
  const JOURNAL_LIMIT = 200;
  const REVIEW_HISTORY_LIMIT = 30;

  // Слияние без потерь возможно потому, что почти всё состояние приложения
  // монотонно: счётчики только растут, журналы только дополняются, задание
  // тренажёра нельзя перерешать. Конфликт возможен лишь у курсора и настроек —
  // там и только там применяется last-write-wins по метке снимка.
  //
  // Правила:
  //   maxNumberMap   — {id: число}, берём максимум по каждому ключу
  //   questionProg   — SRS-прогресс: счётчики максимумом, расписание — свежее
  //   firstWriteMap  — {id: ответ}, значение неизменяемо после записи
  //   truthyMap      — {id: флаг}, объединение непустых
  //   doneMap        — {id: 'done'|...}, статус done необратим
  //   newerByField   — {id: {..., <field>}}, запись со свежим полем побеждает
  //   maxNumber      — скалярный максимум
  //   appendLog      — массив-журнал, объединение с дедупликацией
  //   lastWriteWins  — курсор и настройки, побеждает свежий снимок
  const MERGE_RULES = {
    qprog: 'questionProg',
    stats: 'statsSum',
    daily: 'maxNumberMap',
    ts_scores: 'maxNumberMap',
    streak_best: 'maxNumber',
    cmd_prog: 'firstWriteMap',
    code_prog: 'firstWriteMap',
    subnet_prog: 'firstWriteMap',
    git_prog: 'firstWriteMap',
    regex_prog: 'firstWriteMap',
    ans_prog: 'firstWriteMap',
    df_prog: 'firstWriteMap',
    k8s_prog: 'firstWriteMap',
    pt_prog: 'firstWriteMap',
    labs_prog: 'firstWriteMap',
    qbank_revealed: 'truthyMap',
    study_progress: 'doneMap',
    mlops_progress: 'doneMap',
    inc_prog: 'maxScoreMap',
    senior_case_prog: 'doneStatusMap',
    study_answers: 'newerByCompletedAt',
    study_weekly_results: 'weeklyResults',
    history: 'appendLog',
    skill_events: 'appendLog',
    coach_journal: 'journalLog',
    ai_review_history: 'reviewHistory',
    interview_ai_history: 'reviewHistory',
    custom: 'customQuestions',
    daily_blitz: 'dailyBlitz',
    gamification: 'gamification',
    coach_control: 'controlSession',
    // Курсор, выбор программы и настройки: конфликт неразрешим по содержимому.
    study_position: 'lastWriteWins',
    mlops_position: 'lastWriteWins',
    study_program: 'lastWriteWins',
    chapter_position: 'lastWriteWins',
    qbank_category: 'lastWriteWins',
    onboarding: 'lastWriteWins',
    onboarding_complete: 'lastWriteWins',
    theme: 'lastWriteWins',
    diagnostic_result: 'lastWriteWins',
    // mistakes выводится из ответов и обнуляется при успехе, поэтому
    // объединение воскресило бы уже исправленные ошибки.
    mistakes: 'lastWriteWins'
  };

  function isRecord(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function num(value, fallback) {
    return Number.isFinite(value) ? value : (fallback || 0);
  }

  function keysOf(left, right) {
    return [...new Set([...Object.keys(isRecord(left) ? left : {}), ...Object.keys(isRecord(right) ? right : {})])];
  }

  function pickRecords(left, right) {
    return [isRecord(left) ? left : {}, isRecord(right) ? right : {}];
  }

  function maxNumberMap(left, right) {
    const [a, b] = pickRecords(left, right);
    const out = {};
    keysOf(a, b).forEach(key => {
      const value = Math.max(num(Number(a[key]), 0), num(Number(b[key]), 0));
      if (value > 0) out[key] = value;
    });
    return out;
  }

  function firstWriteMap(left, right) {
    const [a, b] = pickRecords(left, right);
    const out = {};
    keysOf(a, b).forEach(key => {
      const value = a[key] !== undefined ? a[key] : b[key];
      if (value !== undefined) out[key] = value;
    });
    return out;
  }

  function truthyMap(left, right) {
    const [a, b] = pickRecords(left, right);
    const out = {};
    keysOf(a, b).forEach(key => { if (a[key] || b[key]) out[key] = a[key] || b[key]; });
    return out;
  }

  function doneMap(left, right) {
    const [a, b] = pickRecords(left, right);
    const out = {};
    keysOf(a, b).forEach(key => {
      out[key] = a[key] === 'done' || b[key] === 'done' ? 'done' : (a[key] !== undefined ? a[key] : b[key]);
    });
    return out;
  }

  function doneStatusMap(left, right) {
    const [a, b] = pickRecords(left, right);
    const out = {};
    keysOf(a, b).forEach(key => {
      const one = isRecord(a[key]) ? a[key] : null;
      const two = isRecord(b[key]) ? b[key] : null;
      if (!one) { if (two) out[key] = two; return; }
      if (!two) { out[key] = one; return; }
      const done = one.status === 'done' ? one : two.status === 'done' ? two : one;
      const completedAt = [one.completedAt, two.completedAt].filter(item => typeof item === 'string' && item).sort()[0];
      out[key] = completedAt ? { ...done, completedAt } : done;
    });
    return out;
  }

  function maxScoreMap(left, right) {
    const [a, b] = pickRecords(left, right);
    const out = {};
    keysOf(a, b).forEach(key => {
      const one = isRecord(a[key]) ? a[key] : null;
      const two = isRecord(b[key]) ? b[key] : null;
      if (!one || !two) { const only = one || two; if (only) out[key] = only; return; }
      out[key] = num(one.score, 0) >= num(two.score, 0) ? one : two;
    });
    return out;
  }

  function statsSum(left, right) {
    const [a, b] = pickRecords(left, right);
    // Точность нельзя пересчитать из двух устройств, но total/correct монотонны.
    const total = Math.max(num(a.total, 0), num(b.total, 0));
    const correct = Math.max(num(a.correct, 0), num(b.correct, 0));
    return { total, correct: Math.min(correct, total) };
  }

  /**
   * Выбирает «более свежую» из двух записей детерминированно. Без устойчивого
   * тай-брейка результат слияния зависел бы от порядка аргументов, и два
   * устройства получали бы разные состояния из одних и тех же данных.
   */
  function pickFresher(one, two) {
    const bySeen = num(one.lastSeen, 0) - num(two.lastSeen, 0);
    if (bySeen !== 0) return bySeen > 0 ? one : two;
    const attempts = (num(one.correct, 0) + num(one.wrong, 0)) - (num(two.correct, 0) + num(two.wrong, 0));
    if (attempts !== 0) return attempts > 0 ? one : two;
    const times = (Array.isArray(one.times) ? one.times.length : 0) - (Array.isArray(two.times) ? two.times.length : 0);
    if (times !== 0) return times > 0 ? one : two;
    return JSON.stringify(one) <= JSON.stringify(two) ? one : two;
  }

  function questionProg(left, right) {
    const [a, b] = pickRecords(left, right);
    const out = {};
    keysOf(a, b).forEach(id => {
      const one = isRecord(a[id]) ? a[id] : null;
      const two = isRecord(b[id]) ? b[id] : null;
      if (!one || !two) { const only = one || two; if (only) out[id] = { ...only }; return; }
      // Счётчики попыток монотонны, а расписание SRS берём у свежей записи:
      // смешивать ease с чужим interval нельзя, это разъезжающаяся пара.
      const fresh = pickFresher(one, two);
      const merged = { ...fresh };
      // Максимум берём только по полям, которые реально существуют хотя бы у
      // одной стороны. Безусловная запись добавляла бы в запись поля, которых
      // там не было (repetitions: 0 у вопроса, где SRS ни разу не считался), и
      // форма записи начинала зависеть от числа синков — устройства с разным
      // количеством обменов уже не сходились к одному состоянию.
      ['correct', 'wrong', 'repetitions', 'lastSeen'].forEach(field => {
        const hasOne = Number.isFinite(one[field]);
        const hasTwo = Number.isFinite(two[field]);
        if (!hasOne && !hasTwo) { delete merged[field]; return; }
        merged[field] = Math.max(hasOne ? one[field] : 0, hasTwo ? two[field] : 0);
      });
      // times — хвост длительностей ответа, и одинаковые значения в нём
      // законны (два ответа по 12 с). Объединять их нельзя: дедуп удалил бы
      // честные повторы, а конкатенация растёт при каждом синке, пока не
      // вытеснит реальную историю из лимита в 100 значений. Поэтому берём
      // хвост целиком у той же записи, что дала расписание SRS.
      const times = Array.isArray(fresh.times) ? fresh.times.filter(value => Number.isFinite(value) && value >= 0) : [];
      if (times.length) merged.times = times.slice(-100);
      else delete merged.times;
      out[id] = merged;
    });
    return out;
  }

  function dedupeAppend(left, right, identity, limit) {
    const a = Array.isArray(left) ? left : [];
    const b = Array.isArray(right) ? right : [];
    const seen = new Map();
    [...a, ...b].forEach(item => {
      if (item === null || item === undefined) return;
      const key = identity(item);
      if (!seen.has(key)) seen.set(key, item);
    });
    const merged = [...seen.values()];
    merged.sort((one, two) => num(one && one.at, 0) - num(two && two.at, 0));
    return limit ? merged.slice(-limit) : merged;
  }

  function appendLog(left, right, options) {
    const limit = options && options.limit ? options.limit : HISTORY_LIMIT;
    return dedupeAppend(left, right, item => JSON.stringify(item), limit);
  }

  function journalLog(left, right) {
    const a = Array.isArray(left) ? left : [];
    const b = Array.isArray(right) ? right : [];
    const byId = new Map();
    [...a, ...b].forEach(item => {
      if (!isRecord(item) || typeof item.id !== 'string') return;
      const existing = byId.get(item.id);
      // Правка заметки на другом устройстве должна победить исходный текст.
      if (!existing || num(item.at, 0) > num(existing.at, 0)) byId.set(item.id, item);
    });
    return [...byId.values()].sort((one, two) => num(one.at, 0) - num(two.at, 0)).slice(-JOURNAL_LIMIT);
  }

  function reviewHistory(left, right) {
    const byId = new Map();
    [...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])].forEach(item => {
      if (!isRecord(item) || typeof item.id !== 'string' || !item.id) return;
      const existing = byId.get(item.id);
      if (!existing || num(item.at, 0) > num(existing.at, 0) ||
        (num(item.at, 0) === num(existing.at, 0) && JSON.stringify(item) < JSON.stringify(existing))) {
        byId.set(item.id, item);
      }
    });
    return [...byId.values()]
      .sort((one, two) => num(one.at, 0) - num(two.at, 0) || String(one.id).localeCompare(String(two.id)))
      .slice(-REVIEW_HISTORY_LIMIT);
  }

  function customQuestions(left, right) {
    const a = Array.isArray(left) ? left : [];
    const b = Array.isArray(right) ? right : [];
    const byId = new Map();
    [...a, ...b].forEach(item => {
      if (!isRecord(item) || !Number.isFinite(item.id)) return;
      if (!byId.has(item.id)) byId.set(item.id, item);
    });
    return [...byId.values()];
  }

  function gamification(left, right) {
    const [a, b] = pickRecords(left, right);
    // XP и уровни выводятся из прогресса, храним только отметки «увиденное».
    const seen = new Set([
      ...(Array.isArray(a.seenAchievements) ? a.seenAchievements : []).map(String),
      ...(Array.isArray(b.seenAchievements) ? b.seenAchievements : []).map(String)
    ]);
    return { ...b, ...a, seenAchievements: [...seen] };
  }

  function dailyBlitz(left, right) {
    const [a, b] = pickRecords(left, right);
    const aKey = typeof a.dateKey === 'string' ? a.dateKey : '';
    const bKey = typeof b.dateKey === 'string' ? b.dateKey : '';
    // Счётчики внутри дня принадлежат конкретной дате: берём их у свежего дня,
    // а рекорд и общее число блицев монотонны и сливаются максимумом.
    const fresh = aKey >= bKey ? a : b;
    const seen = new Set([
      ...(Array.isArray(a.seenAchievements) ? a.seenAchievements : []).map(String),
      ...(Array.isArray(b.seenAchievements) ? b.seenAchievements : []).map(String)
    ]);
    const lastCompletedKey = [a.lastCompletedKey, b.lastCompletedKey]
      .filter(item => typeof item === 'string' && item).sort().pop() || null;
    return {
      ...fresh,
      bestStreak: Math.max(num(a.bestStreak, 0), num(b.bestStreak, 0)),
      completedCount: Math.max(num(a.completedCount, 0), num(b.completedCount, 0)),
      streak: Math.max(num(a.streak, 0), num(b.streak, 0)),
      lastCompletedKey,
      seenAchievements: [...seen]
    };
  }

  function weeklyResults(left, right) {
    const [a, b] = pickRecords(left, right);
    const out = {};
    keysOf(a, b).forEach(key => {
      const one = isRecord(a[key]) ? a[key] : null;
      const two = isRecord(b[key]) ? b[key] : null;
      if (!one || !two) { const only = one || two; if (only) out[key] = only; return; }
      const fresh = String(one.updatedAt || '') >= String(two.updatedAt || '') ? one : two;
      const passed = one.passed === true || two.passed === true;
      const passedAt = [one.passedAt, two.passedAt].filter(item => typeof item === 'string' && item).sort()[0] || '';
      out[key] = { ...fresh, passed, passedAt: passed ? passedAt : '' };
    });
    return out;
  }

  function newerByCompletedAt(left, right) {
    const [a, b] = pickRecords(left, right);
    const out = {};
    keysOf(a, b).forEach(key => {
      const one = isRecord(a[key]) ? a[key] : null;
      const two = isRecord(b[key]) ? b[key] : null;
      if (!one || !two) { const only = one || two; if (only) out[key] = only; return; }
      out[key] = String(one.completedAt || '') >= String(two.completedAt || '') ? one : two;
    });
    return out;
  }

  function controlSession(left, right) {
    const one = isRecord(left) ? left : null;
    const two = isRecord(right) ? right : null;
    if (!one || !two) return one || two || undefined;
    // Разные контрольные не сливаются: побеждает начатая позже. Одну и ту же,
    // продолженную на двух устройствах, объединяем по попыткам.
    if (one.id !== two.id) return num(one.startedAt, 0) >= num(two.startedAt, 0) ? one : two;
    const attempts = dedupeAppend(one.attempts, two.attempts, item => String(item && item.questionId), 30);
    const fresh = num(one.startedAt, 0) >= num(two.startedAt, 0) ? one : two;
    const completedAt = Math.max(num(one.completedAt, 0), num(two.completedAt, 0)) || null;
    return { ...fresh, attempts, completedAt: attempts.length >= (fresh.questionIds || []).length ? completedAt : null };
  }

  const HANDLERS = {
    maxNumberMap, firstWriteMap, truthyMap, doneMap, doneStatusMap, maxScoreMap,
    statsSum, questionProg, appendLog, journalLog, reviewHistory, customQuestions, gamification,
    dailyBlitz, weeklyResults, newerByCompletedAt, controlSession,
    maxNumber: (left, right) => Math.max(num(left, 0), num(right, 0))
  };

  const LOG_LIMITS = { history: HISTORY_LIMIT, skill_events: EVENT_LIMIT };

  function normaliseSnapshot(value) {
    const source = isRecord(value) ? value : {};
    return {
      snapshotVersion: Number.isFinite(source.snapshotVersion) ? source.snapshotVersion : SNAPSHOT_VERSION,
      updatedAt: num(source.updatedAt, 0),
      deviceId: typeof source.deviceId === 'string' ? source.deviceId.slice(0, 64) : '',
      state: isRecord(source.state) ? source.state : {}
    };
  }

  /**
   * Сливает два снимка. `local` считается своим, `remote` — серверным.
   * Ключи со правилом lastWriteWins берутся из снимка со свежим updatedAt:
   * отдельных метк на ключ приложение не ведёт, и вводить их только ради
   * курсора значило бы переписать весь слой записи.
   */
  function mergeSnapshots(localSnapshot, remoteSnapshot) {
    const local = normaliseSnapshot(localSnapshot);
    const remote = normaliseSnapshot(remoteSnapshot);
    const localWins = local.updatedAt >= remote.updatedAt;
    const state = {};
    const conflicts = [];

    [...new Set([...Object.keys(local.state), ...Object.keys(remote.state)])].forEach(key => {
      const rule = MERGE_RULES[key] || 'lastWriteWins';
      const mine = local.state[key];
      const theirs = remote.state[key];
      if (mine === undefined) { state[key] = theirs; return; }
      if (theirs === undefined) { state[key] = mine; return; }

      if (rule === 'lastWriteWins') {
        const same = JSON.stringify(mine) === JSON.stringify(theirs);
        if (!same) conflicts.push(key);
        state[key] = localWins ? mine : theirs;
        return;
      }
      const handler = HANDLERS[rule];
      state[key] = handler ? handler(mine, theirs, { limit: LOG_LIMITS[key] }) : (localWins ? mine : theirs);
    });

    return {
      snapshotVersion: SNAPSHOT_VERSION,
      updatedAt: Math.max(local.updatedAt, remote.updatedAt),
      deviceId: local.deviceId || remote.deviceId,
      state,
      conflicts
    };
  }

  return {
    SNAPSHOT_VERSION, MERGE_RULES, HISTORY_LIMIT, EVENT_LIMIT, JOURNAL_LIMIT, REVIEW_HISTORY_LIMIT,
    normaliseSnapshot, mergeSnapshots,
    maxNumberMap, firstWriteMap, truthyMap, doneMap, doneStatusMap, maxScoreMap,
    statsSum, questionProg, appendLog, journalLog, reviewHistory, customQuestions, gamification,
    dailyBlitz, weeklyResults, newerByCompletedAt, controlSession
  };
});
