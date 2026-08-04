(function(root, factory) {
  const dates = typeof module !== 'undefined' && module.exports ? require('./date.js') : root.IPMaxDate;
  const api = factory(dates);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IPMaxDaily = api;
})(typeof self !== 'undefined' ? self : globalThis, function(dates) {
  'use strict';

  const BLITZ_SIZE = 5;
  // Mirrors a real screening round: one warm-up, two core, two deep questions.
  const BLITZ_COMPOSITION = ['Junior', 'Middle', 'Middle', 'Senior', 'Senior'];
  const TOPIC_ROTATION_SIZE = 5;
  const DAY_MS = 86400000;

  function asArray(value) { return Array.isArray(value) ? value : []; }
  function asObject(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  function count(value) { return Number.isFinite(value) && value > 0 ? value : 0; }

  function dateKey(now) {
    if (dates && typeof dates.localDateKey === 'function') return dates.localDateKey(now);
    return new Date(Number.isFinite(now) ? now : Date.now()).toISOString().slice(0, 10);
  }

  // A shape check is not enough: '2026-13-40' matches the pattern but is not a
  // date, and storing it would freeze the blitz on a day that never arrives.
  function isValidKey(value) {
    if (typeof value !== 'string') return false;
    if (dates && typeof dates.isValidDateKey === 'function') return dates.isValidDateKey(value);
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  /**
   * Deterministic 32-bit hash. The daily set must be stable for a given date:
   * a random pick would hand out a different blitz on every reload, so a user
   * could reroll until the questions look easy — and the "same 5 for today"
   * promise on the card would be a lie.
   */
  function hash(seed) {
    let value = 2166136261;
    const text = String(seed);
    for (let index = 0; index < text.length; index++) {
      value ^= text.charCodeAt(index);
      value = Math.imul(value, 16777619);
    }
    return value >>> 0;
  }

  function seededOrder(items, seed) {
    return items
      .map((item, index) => ({ item, key: hash(seed + '|' + String(item && item.id !== undefined ? item.id : index)) }))
      .sort((left, right) => left.key - right.key || String(left.item && left.item.id).localeCompare(String(right.item && right.item.id), 'en', { numeric: true }))
      .map(entry => entry.item);
  }

  function dayNumber(key) {
    const parts = String(key).split('-').map(Number);
    if (parts.length !== 3 || parts.some(part => !Number.isFinite(part))) return 0;
    return Math.floor(Date.UTC(parts[0], parts[1] - 1, parts[2]) / DAY_MS);
  }

  /** Rotates topics by date so consecutive days do not repeat the same stack. */
  function topicsForDay(topics, key) {
    // Deduplicate first: the caller may pass one topic per question, and
    // without this every rotation slot collapses onto the same topic.
    const list = [...new Set(asArray(topics).filter(topic => typeof topic === 'string' && topic))];
    if (!list.length) return [];
    const ordered = seededOrder(list.map(topic => ({ id: topic })), 'topics').map(entry => entry.id);
    const offset = ((dayNumber(key) % ordered.length) + ordered.length) % ordered.length;
    const rotated = ordered.slice(offset).concat(ordered.slice(0, offset));
    return rotated.slice(0, Math.min(TOPIC_ROTATION_SIZE, rotated.length));
  }

  function hasOptions(question) {
    return !!question && typeof question === 'object' && Array.isArray(question.options) && question.options.length >= 2
      && Number.isInteger(question.answer) && question.answer >= 0 && question.answer < question.options.length;
  }

  /**
   * Picks today's five questions: level composition first, preferring the
   * rotated topics of the day, then any level as a fallback so a thin dataset
   * still yields a full set.
   */
  function selectQuestions(input) {
    const state = asObject(input);
    const key = typeof state.dateKey === 'string' && state.dateKey ? state.dateKey : dateKey(state.now);
    const pool = asArray(state.questions).filter(hasOptions);
    const size = Number.isInteger(state.size) && state.size > 0 ? state.size : BLITZ_SIZE;
    const composition = asArray(state.composition).length ? asArray(state.composition) : BLITZ_COMPOSITION;
    const topics = topicsForDay(state.topics && state.topics.length ? state.topics : pool.map(question => question.topic), key);
    const topicSet = new Set(topics);
    const ordered = seededOrder(pool, key);
    const used = new Set();
    const selected = [];

    const take = predicate => {
      const found = ordered.find(question => !used.has(String(question.id)) && predicate(question));
      if (!found) return false;
      used.add(String(found.id));
      selected.push(found);
      return true;
    };

    // Each slot claims its own topic first. Without this, every slot scans the
    // same seeded order and the whole blitz collapses into one topic, which
    // contradicts the five topics advertised on the card.
    composition.slice(0, size).forEach((level, slot) => {
      const preferred = topics.length ? topics[slot % topics.length] : null;
      if (preferred && take(question => question.level === level && question.topic === preferred)) return;
      if (take(question => question.level === level && topicSet.has(question.topic))) return;
      if (take(question => question.level === level)) return;
      if (preferred && take(question => question.topic === preferred)) return;
      take(() => true);
    });
    while (selected.length < size && take(() => true)) { /* fill from whatever is left */ }
    return { dateKey: key, topics, questions: selected.slice(0, size), composition: composition.slice(0, size) };
  }

  function normaliseState(value) {
    const state = asObject(value);
    const key = isValidKey(state.dateKey) ? state.dateKey : null;
    return {
      dateKey: key,
      answered: Math.max(0, Math.min(BLITZ_SIZE, Math.round(count(state.answered)))),
      correct: Math.max(0, Math.min(BLITZ_SIZE, Math.round(count(state.correct)))),
      completed: state.completed === true,
      streak: Math.round(count(state.streak)),
      bestStreak: Math.round(count(state.bestStreak)),
      completedCount: Math.round(count(state.completedCount)),
      lastCompletedKey: isValidKey(state.lastCompletedKey) ? state.lastCompletedKey : null,
      seenAchievements: asArray(state.seenAchievements).map(String)
    };
  }

  /**
   * Rolls the stored state onto `now`. The per-day counters reset, but the
   * streak only survives when the last completion was yesterday — the streak
   * must break on a skipped day, not merely on a new date.
   */
  function stateForDay(value, now) {
    const state = normaliseState(value);
    const key = dateKey(now);
    if (state.dateKey === key) return { ...state, dateKey: key };
    const yesterday = dateKey((Number.isFinite(now) ? now : Date.now()) - DAY_MS);
    const keepsStreak = state.lastCompletedKey === key || state.lastCompletedKey === yesterday;
    return {
      ...state,
      dateKey: key,
      answered: 0,
      correct: 0,
      completed: state.lastCompletedKey === key,
      streak: keepsStreak ? state.streak : 0
    };
  }

  function recordAnswer(value, input, now) {
    const state = stateForDay(value, now);
    const result = asObject(input);
    const size = Number.isInteger(result.size) && result.size > 0 ? result.size : BLITZ_SIZE;
    if (state.completed) return state;
    const answered = Math.min(size, state.answered + 1);
    const correct = Math.min(size, state.correct + (result.correct === true ? 1 : 0));
    return { ...state, answered, correct };
  }

  /**
   * Closing the blitz is idempotent: a double click on the last question must
   * not award the streak twice.
   */
  function completeDay(value, now) {
    const state = stateForDay(value, now);
    if (state.completed && state.lastCompletedKey === state.dateKey) return state;
    const yesterday = dateKey((Number.isFinite(now) ? now : Date.now()) - DAY_MS);
    const streak = state.lastCompletedKey === yesterday ? state.streak + 1 : 1;
    return {
      ...state,
      completed: true,
      streak,
      bestStreak: Math.max(state.bestStreak, streak),
      completedCount: state.completedCount + 1,
      lastCompletedKey: state.dateKey
    };
  }

  function secondsUntilReset(now) {
    const stamp = Number.isFinite(now) ? now : Date.now();
    const date = new Date(stamp);
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0);
    return Math.max(0, Math.round((next.getTime() - stamp) / 1000));
  }

  function formatCountdown(seconds) {
    const total = Math.max(0, Math.round(count(seconds)));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const rest = total % 60;
    return [hours, minutes, rest].map(part => String(part).padStart(2, '0')).join(':');
  }

  /**
   * Picks the skill of the day out of Best Practices. The same date always
   * yields the same skill, and the pointer walks the whole list before
   * repeating, so a user does not see one topic two days in a row.
   */
  function skillOfTheDay(input) {
    const state = asObject(input);
    const key = typeof state.dateKey === 'string' && state.dateKey ? state.dateKey : dateKey(state.now);
    const topics = asArray(asObject(state.bestPractices).topics);
    const flat = [];
    topics.forEach(topic => {
      const entry = asObject(topic);
      asArray(entry.practices).forEach((practice, index) => {
        const item = asObject(practice);
        if (!item.title) return;
        flat.push({
          id: (entry.slug || entry.topic || 'topic') + '-' + index,
          topic: entry.topic || '',
          slug: entry.slug || '',
          icon: entry.icon || '✦',
          trainer: entry.trainer || null,
          title: item.title,
          why: item.why || '',
          action: item.action || ''
        });
      });
    });
    if (!flat.length) return null;
    const ordered = seededOrder(flat, 'skill-of-the-day');
    const index = ((dayNumber(key) % ordered.length) + ordered.length) % ordered.length;
    return { ...ordered[index], dateKey: key, position: index + 1, total: ordered.length };
  }

  function grade(correct, size) {
    const total = Number.isInteger(size) && size > 0 ? size : BLITZ_SIZE;
    const value = Math.max(0, Math.min(total, Math.round(count(correct))));
    const share = total ? value / total : 0;
    if (share >= 1) return { icon: '🏆', label: 'Идеально', band: 'high' };
    if (share >= 0.6) return { icon: '🎯', label: 'Хорошо', band: 'medium' };
    if (share > 0) return { icon: '📚', label: 'Есть над чем поработать', band: 'low' };
    return { icon: '💪', label: 'Разберите ошибки и возвращайтесь', band: 'low' };
  }

  return {
    BLITZ_SIZE, BLITZ_COMPOSITION, TOPIC_ROTATION_SIZE,
    dateKey, hash, topicsForDay, selectQuestions,
    normaliseState, stateForDay, recordAnswer, completeDay,
    secondsUntilReset, formatCountdown, skillOfTheDay, grade
  };
});
