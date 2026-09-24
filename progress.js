(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ProgressTracker = api;
})(typeof self !== 'undefined' ? self : globalThis, function() {
  const EVENT_LIMIT = 500;

  function finite(value, fallback) { return Number.isFinite(value) ? value : fallback; }
  function outcomeFrom(value) { return ['pass', 'partial', 'fail'].includes(value) ? value : 'fail'; }
  function scoreFor(outcome) { return outcome === 'pass' ? 1 : outcome === 'partial' ? 0.5 : 0; }
  function cloneProgress(progress) { return progress && typeof progress === 'object' && !Array.isArray(progress) ? { ...progress } : {}; }

  function recordQuestionAttempt(progress, questionId, input) {
    const now = finite(input && input.now, Date.now());
    const outcome = outcomeFrom(input && input.outcome);
    const score = scoreFor(outcome);
    const current = progress && progress[questionId] && typeof progress[questionId] === 'object' ? progress[questionId] : {};
    const next = cloneProgress(progress);
    const record = { ...current, times: Array.isArray(current.times) ? [...current.times] : [] };

    record.correct = Math.max(0, finite(record.correct, 0)) + score;
    record.wrong = Math.max(0, finite(record.wrong, 0)) + (1 - score);
    record.lastSeen = now;
    if (typeof input?.source === 'string' && input.source) record.lastSource = input.source.slice(0, 40);

    const responseSeconds = finite(input && input.responseSeconds, null);
    if (responseSeconds !== null && responseSeconds >= 0) record.times.push(Math.round(responseSeconds));
    if (record.times.length > 20) record.times = record.times.slice(-20);

    record.ease = Math.max(1.3, finite(record.ease, 2.5));
    record.interval = Math.max(0, Math.round(finite(record.interval, 0)));
    record.repetitions = Math.max(0, Math.round(finite(record.repetitions, 0)));
    if (outcome === 'pass') {
      record.repetitions++;
      record.interval = record.interval === 0 ? 1 : record.interval === 1 ? 3 : Math.round(record.interval * record.ease);
      record.ease = Math.min(3, record.ease + 0.1);
    } else {
      record.repetitions = 0;
      record.interval = 1;
      record.ease = Math.max(1.3, record.ease - (outcome === 'partial' ? 0.1 : 0.2));
    }
    record.nextReviewAt = now + record.interval * 86400000;
    next[questionId] = record;
    return { progress: next, record, score, outcome };
  }

  // Daily activity counters grow by one key per active day and are never
  // read beyond the analytics window, so keep a bounded retention window.
  const DAILY_RETENTION_DAYS = 30;

  function dailyCutoffKey(now, retentionDays) {
    const days = Number.isFinite(retentionDays) && retentionDays > 0
      ? Math.floor(retentionDays)
      : DAILY_RETENTION_DAYS;
    const date = new Date(Number.isFinite(now) ? now : Date.now());
    date.setDate(date.getDate() - (days - 1));
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return date.getFullYear() + '-' + month + '-' + day;
  }

  function validDailyEntry(key, value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
    const count = Number(value);
    return Number.isFinite(count) && count > 0;
  }

  function pruneDailyCounters(daily, now, retentionDays) {
    if (!daily || typeof daily !== 'object' || Array.isArray(daily)) return {};
    // ISO date keys sort lexicographically, so a string compare is enough.
    const cutoff = dailyCutoffKey(now, retentionDays);
    const next = {};
    for (const key of Object.keys(daily)) {
      if (!validDailyEntry(key, daily[key])) continue;
      if (key < cutoff) continue;
      next[key] = Number(daily[key]);
    }
    return next;
  }

  function dailyNeedsPruning(daily, now, retentionDays) {
    if (!daily || typeof daily !== 'object' || Array.isArray(daily)) return false;
    const cutoff = dailyCutoffKey(now, retentionDays);
    return Object.keys(daily).some(key => key < cutoff || !validDailyEntry(key, daily[key]));
  }
  function normaliseEvent(input, now) {
    if (!input || typeof input !== 'object' || typeof input.source !== 'string' || !input.source.trim()) return null;
    const possible = Math.max(1, finite(input.possible, 1));
    const score = Math.max(0, Math.min(possible, finite(input.score, 0)));
    const event = {
      at: finite(input.at, now),
      source: input.source.trim().slice(0, 40),
      score,
      possible
    };
    if (typeof input.topic === 'string' && input.topic.trim()) event.topic = input.topic.trim().slice(0, 80);
    if (typeof input.skill === 'string' && input.skill.trim()) event.skill = input.skill.trim().slice(0, 80);
    if (Number.isFinite(input.durationSeconds) && input.durationSeconds >= 0) event.durationSeconds = Math.round(input.durationSeconds);
    return event;
  }

  function appendSkillEvent(events, input, limit) {
    const now = Date.now();
    const event = normaliseEvent(input, now);
    const current = Array.isArray(events) ? events.filter(item => normaliseEvent(item, now)) : [];
    if (!event) return current.slice(-(limit || EVENT_LIMIT));
    return [...current, event].slice(-(limit || EVENT_LIMIT));
  }

  function isSkillEvent(value) { return !!normaliseEvent(value, Date.now()); }

  // Один вопрос живёт в тесте, банке и карточках под разными id (аудит B3). Общий
  // conceptId связывает копии, а расписание SM-2 у них одно: ответ в любом режиме
  // переносит интервал на все копии. Счётчики correct/wrong остаются у каждой копии.
  const SCHEDULE_FIELDS = ['ease', 'interval', 'repetitions', 'nextReviewAt', 'lastSeen'];

  function buildConceptIndex(lists) {
    const members = new Map();
    const conceptOf = new Map();
    (Array.isArray(lists) ? lists : []).forEach(list => (Array.isArray(list) ? list : []).forEach(item => {
      if (!item || typeof item.conceptId !== 'string' || !item.conceptId || item.id === undefined || item.id === null) return;
      const id = String(item.id);
      if (!/^\d+$/.test(id)) return;
      conceptOf.set(id, item.conceptId);
      if (!members.has(item.conceptId)) members.set(item.conceptId, []);
      if (!members.get(item.conceptId).includes(id)) members.get(item.conceptId).push(id);
    }));
    return {
      size: members.size,
      siblings(id) {
        const concept = conceptOf.get(String(id));
        return concept ? members.get(concept).filter(member => member !== String(id)) : [];
      },
      groups() { return [...members.values()].filter(group => group.length > 1); }
    };
  }

  function scheduleOf(record) {
    const out = {};
    SCHEDULE_FIELDS.forEach(key => { if (Number.isFinite(record[key])) out[key] = record[key]; });
    return out;
  }

  function shareConceptSchedule(progress, questionId, siblingIds) {
    const source = progress && progress[questionId];
    if (!source || typeof source !== 'object' || !Array.isArray(siblingIds) || !siblingIds.length) return progress;
    const next = cloneProgress(progress);
    const schedule = scheduleOf(source);
    siblingIds.forEach(id => {
      const current = next[id] && typeof next[id] === 'object' ? next[id] : {};
      next[id] = { ...current, ...schedule };
    });
    return next;
  }

  // Разовое выравнивание накопленного прогресса: у копий понятия берём расписание
  // самой свежей записи. Повторный вызов ничего не меняет.
  function alignConceptProgress(progress, index) {
    let next = progress;
    let changed = 0;
    if (!progress || typeof progress !== 'object' || !index || typeof index.groups !== 'function') return { progress, changed };
    index.groups().forEach(group => {
      const seen = group.filter(id => progress[id] && Number.isFinite(progress[id].lastSeen) && progress[id].lastSeen > 0);
      if (!seen.length) return;
      const latest = seen.reduce((best, id) => progress[id].lastSeen > progress[best].lastSeen ? id : best, seen[0]);
      const schedule = scheduleOf(progress[latest]);
      const stale = group.filter(id => id !== latest && Object.keys(schedule).some(key => (progress[id] || {})[key] !== schedule[key]));
      if (!stale.length) return;
      if (next === progress) next = cloneProgress(progress);
      stale.forEach(id => { next[id] = { ...(next[id] || {}), ...schedule }; });
      changed += stale.length;
    });
    return { progress: next, changed };
  }

  return { recordQuestionAttempt, appendSkillEvent, isSkillEvent, scoreFor, EVENT_LIMIT,
    pruneDailyCounters, dailyNeedsPruning, DAILY_RETENTION_DAYS,
    buildConceptIndex, shareConceptSchedule, alignConceptProgress };
});
