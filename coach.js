(function(root, factory) {
  const dates = typeof module !== 'undefined' && module.exports ? require('./date.js') : root.IPMaxDate;
  const api = factory(dates);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.InterviewCoach = api;
})(typeof self !== 'undefined' ? self : globalThis, function(dates) {
  const ROLE_TOPICS = {
    SRE: ['Linux', 'Сети', 'Kubernetes', 'Monitoring', 'Security', 'CI/CD'],
    Platform: ['Kubernetes', 'Terraform', 'Ansible', 'CI/CD', 'Docker', 'Git'],
    Cloud: ['Cloud', 'Terraform', 'Security', 'Сети', 'Kubernetes']
  };
  const ROLE_LABELS = {
    DevOps: 'DevOps Engineer', SRE: 'SRE', Platform: 'Platform Engineer', Cloud: 'Cloud Engineer'
  };
  const LEVELS = {
    Junior: ['Junior', 'Junior+'],
    Middle: ['Junior', 'Junior+', 'Middle', 'Middle+'],
    Senior: ['Junior', 'Junior+', 'Middle', 'Middle+', 'Senior', 'Senior-track']
  };
  const TRAINER_PAGES = { Git: 'git', Regex: 'regex' };
  const QUIZ_SOURCES = new Set(['exam', 'freeform', 'blitz', 'diagnostic']);
  const DAY_MS = 86400000;
  const JOURNAL_LIMIT = 200;

  function safeNumber(value) { return Number.isFinite(value) && value > 0 ? value : 0; }
  function eventScore(event) {
    if (!event || typeof event !== 'object' || !Number.isFinite(event.score) || !Number.isFinite(event.possible) || event.possible <= 0) return null;
    return Math.max(0, Math.min(100, Math.round(event.score / event.possible * 100)));
  }
  function getDaysUntil(date, now) {
    return dates && typeof dates.daysUntil === 'function' ? dates.daysUntil(date, now) : null;
  }
  function getSessionSize(daysUntil) {
    if (daysUntil !== null && daysUntil >= 0 && daysUntil <= 7) return 20;
    if (daysUntil !== null && daysUntil >= 0 && daysUntil <= 21) return 15;
    return 10;
  }
  function dateKey(value) {
    if (dates && typeof dates.localDateKey === 'function') return dates.localDateKey(value);
    return new Date(value).toISOString().slice(0, 10);
  }
  function summariseEvents(events, start, end) {
    const selected = events.filter(event => event && Number.isFinite(event.at) && event.at >= start && event.at < end && eventScore(event) !== null);
    const days = new Set();
    const topics = {};
    let score = 0, possible = 0, durationSeconds = 0;
    selected.forEach(event => {
      score += event.score;
      possible += event.possible;
      durationSeconds += safeNumber(event.durationSeconds);
      days.add(dateKey(event.at));
      const topic = event.topic || event.skill;
      if (typeof topic === 'string' && topic) {
        if (!topics[topic]) topics[topic] = { score: 0, possible: 0, attempts: 0 };
        topics[topic].score += event.score;
        topics[topic].possible += event.possible;
        topics[topic].attempts++;
      }
    });
    Object.values(topics).forEach(item => { item.accuracy = item.possible ? Math.round(item.score / item.possible * 100) : 0; });
    return {
      attempts: selected.length,
      accuracy: possible ? Math.round(score / possible * 100) : null,
      activeDays: days.size,
      durationMinutes: Math.round(durationSeconds / 60),
      topics
    };
  }
  function buildWeeklyReview(input) {
    input = input || {};
    const now = Number.isFinite(input.now) ? input.now : Date.now();
    const events = Array.isArray(input.skillEvents) ? input.skillEvents : [];
    const plan = input.plan && typeof input.plan === 'object' ? input.plan : {};
    const recent = summariseEvents(events, now - 7 * DAY_MS, now + 1);
    const previous = summariseEvents(events, now - 14 * DAY_MS, now - 7 * DAY_MS);
    const daysUntil = Number.isFinite(plan.daysUntil) ? plan.daysUntil : null;
    const targetActiveDays = daysUntil !== null && daysUntil >= 0 && daysUntil <= 7 ? 5 : daysUntil !== null && daysUntil >= 0 && daysUntil <= 21 ? 4 : 3;
    const baseSessionSize = Number.isFinite(plan.sessionSize) ? plan.sessionSize : getSessionSize(daysUntil);
    const targetAttempts = Math.max(baseSessionSize, targetActiveDays * 5);
    const onTrack = recent.activeDays >= targetActiveDays && recent.attempts >= targetAttempts;
    const urgent = daysUntil !== null && daysUntil >= 0 && daysUntil <= 21;
    const status = onTrack ? 'on-track' : urgent ? 'behind' : recent.attempts ? 'building' : 'starting';
    const adjustedSessionSize = status === 'behind' ? Math.min(25, baseSessionSize + 5) : baseSessionSize;
    const topicNames = [...new Set([...Object.keys(recent.topics), ...Object.keys(previous.topics)])];
    const topicChanges = topicNames.map(topic => {
      const current = recent.topics[topic] || null;
      const before = previous.topics[topic] || null;
      return {
        topic,
        accuracy: current ? current.accuracy : null,
        attempts: current ? current.attempts : 0,
        delta: current && before ? current.accuracy - before.accuracy : null
      };
    });
    const improving = topicChanges.filter(item => item.delta !== null).sort((left, right) => right.delta - left.delta)[0] || null;
    const needsAttention = topicChanges.filter(item => item.accuracy !== null).sort((left, right) => left.accuracy - right.accuracy || right.attempts - left.attempts)[0] || null;
    return {
      recent,
      previous,
      accuracyDelta: recent.accuracy !== null && previous.accuracy !== null ? recent.accuracy - previous.accuracy : null,
      attemptsDelta: recent.attempts - previous.attempts,
      targetActiveDays,
      targetAttempts,
      status,
      adjustedSessionSize,
      extraQuestions: adjustedSessionSize - baseSessionSize,
      improving,
      needsAttention
    };
  }
  function questionPriority(question, progress, now) {
    const item = progress && progress[question.id] && typeof progress[question.id] === 'object' ? progress[question.id] : null;
    if (!item) return 40;
    const correct = safeNumber(item.correct);
    const wrong = safeNumber(item.wrong);
    const attempts = correct + wrong;
    let score = attempts ? Math.round((1 - correct / attempts) * 50) : 35;
    if (Number.isFinite(item.nextReviewAt) && item.nextReviewAt <= now) score += 60;
    if (wrong >= correct && wrong > 0) score += 30;
    if (Number.isFinite(item.lastSeen)) score += Math.min(20, Math.floor((now - item.lastSeen) / (7 * DAY_MS)));
    return score;
  }
  function buildControlSession(input) {
    input = input || {};
    const questions = Array.isArray(input.questions) ? input.questions : [];
    const progress = input.progress && typeof input.progress === 'object' ? input.progress : {};
    const plan = input.plan && typeof input.plan === 'object' ? input.plan : {};
    const now = Number.isFinite(input.now) ? input.now : Date.now();
    const requestedSize = Number.isFinite(input.size) ? Math.max(1, Math.round(input.size)) : 10;
    const levels = new Set(Array.isArray(plan.targetLevels) ? plan.targetLevels : []);
    const levelQuestions = levels.size ? questions.filter(question => levels.has(question.level)) : questions;
    const pool = levelQuestions.length ? levelQuestions : questions;
    const rankedTopics = Array.isArray(plan.topicStats) ? plan.topicStats.filter(item => item && item.action && item.action.type === 'questions').map(item => item.topic) : [];
    pool.forEach(question => { if (!rankedTopics.includes(question.topic)) rankedTopics.push(question.topic); });
    const topics = rankedTopics.slice(0, 3);
    const buckets = topics.map(topic => pool.filter(question => question.topic === topic).sort((left, right) => questionPriority(right, progress, now) - questionPriority(left, progress, now) || String(left.id).localeCompare(String(right.id), 'en', { numeric: true })));
    const selected = [];
    const used = new Set();
    let cursor = 0;
    while (selected.length < requestedSize && buckets.some(bucket => bucket.length)) {
      const bucket = buckets[cursor % buckets.length];
      const question = bucket.shift();
      if (question && !used.has(String(question.id))) {
        used.add(String(question.id));
        selected.push(question);
      }
      cursor++;
    }
    if (selected.length < requestedSize) {
      pool.slice().sort((left, right) => questionPriority(right, progress, now) - questionPriority(left, progress, now)).forEach(question => {
        if (selected.length >= requestedSize || used.has(String(question.id))) return;
        used.add(String(question.id));
        selected.push(question);
      });
    }
    return { questionIds: selected.map(question => question.id), topics: [...new Set(selected.map(question => question.topic))], size: selected.length };
  }
  function normaliseJournalEntry(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const id = typeof value.id === 'string' ? value.id.slice(0, 80) : '';
    const topic = typeof value.topic === 'string' ? value.topic.trim().slice(0, 80) : '';
    const note = typeof value.note === 'string' ? value.note.trim().slice(0, 2000) : '';
    const at = Number.isFinite(value.at) && value.at >= 0 ? value.at : null;
    return id && topic && note && at !== null ? { id, topic, note, at } : null;
  }
  function appendJournalEntry(entries, input, now) {
    const current = Array.isArray(entries) ? entries.map(normaliseJournalEntry).filter(Boolean) : [];
    const at = Number.isFinite(now) ? now : Date.now();
    const entry = normaliseJournalEntry({
      id: input && typeof input.id === 'string' ? input.id : `note-${at}-${current.length + 1}`,
      topic: input && input.topic,
      note: input && input.note,
      at
    });
    return entry ? [...current, entry].slice(-JOURNAL_LIMIT) : current.slice(-JOURNAL_LIMIT);
  }
  function isJournalEntry(value) { return !!normaliseJournalEntry(value); }
  function buildPlan(input) {
    input = input || {};
    const questions = Array.isArray(input.questions) ? input.questions : [];
    const progress = input.progress && typeof input.progress === 'object' ? input.progress : {};
    const skillEvents = Array.isArray(input.skillEvents) ? input.skillEvents : [];
    const profile = input.profile && typeof input.profile === 'object' ? input.profile : {};
    const role = ROLE_LABELS[profile.role] ? profile.role : 'DevOps';
    const level = LEVELS[profile.level] ? profile.level : 'Middle';
    const now = Number.isFinite(input.now) ? input.now : Date.now();
    const daysUntil = getDaysUntil(profile.date, now);
    const roleTopics = ROLE_TOPICS[role] || [];
    const targetLevels = LEVELS[level];
    const topicNames = [...new Set([
      ...questions.map(question => question.topic), ...roleTopics,
      ...skillEvents.map(event => event && (event.topic || event.skill))
    ].filter(topic => typeof topic === 'string' && topic))];
    const stats = topicNames.map(topic => {
      const inRole = roleTopics.length === 0 || roleTopics.includes(topic);
      const relevantQuestions = questions.filter(question => question.topic === topic && targetLevels.includes(question.level));
      const source = relevantQuestions.length ? relevantQuestions : questions.filter(question => question.topic === topic);
      const practice = skillEvents.filter(event => event && (event.topic === topic || event.skill === topic) && !QUIZ_SOURCES.has(event.source)).map(eventScore).filter(score => score !== null);
      let correct = 0, wrong = 0, due = 0, seen = 0;
      source.forEach(question => {
        const item = progress[question.id] || {};
        const itemCorrect = safeNumber(item.correct);
        const itemWrong = safeNumber(item.wrong);
        correct += itemCorrect;
        wrong += itemWrong;
        if (itemCorrect + itemWrong > 0) seen++;
        if (Number.isFinite(item.nextReviewAt) && item.nextReviewAt <= now) due++;
      });
      const attempts = correct + wrong;
      const accuracy = attempts ? Math.round(correct / attempts * 100) : 0;
      const coverage = source.length ? Math.min(100, Math.round(seen / source.length * 100)) : 0;
      const practiceScore = practice.length ? Math.round(practice.reduce((sum, score) => sum + score, 0) / practice.length) : null;
      const questionReadiness = Math.round(accuracy * 0.7 + coverage * 0.3);
      const readiness = source.length ? Math.round(questionReadiness * 0.8 + (practiceScore === null ? questionReadiness : practiceScore) * 0.2) : (practiceScore === null ? 0 : practiceScore);
      const priority = (inRole ? 50 : 0) + (100 - readiness) + Math.min(due, 10) * 3 + (inRole && practiceScore === null ? 10 : 0);
      const action = source.length ? { type: 'questions', topic } : TRAINER_PAGES[topic] ? { type: 'trainer', page: TRAINER_PAGES[topic] } : null;
      return { topic, inRole, correct, wrong, due, accuracy, coverage, readiness, priority, practiceScore, practiceCount: practice.length, action };
    }).sort((left, right) => right.priority - left.priority || left.topic.localeCompare(right.topic, 'ru'));
    const questionIds = new Set(questions.map(question => String(question.id)));
    const dueCount = Object.entries(progress).filter(([id, item]) => questionIds.has(String(id)) && item && Number.isFinite(item.nextReviewAt) && item.nextReviewAt <= now).length;
    const focus = stats.find(stat => stat.action) || stats[0] || null;
    const basePlan = {
      role, roleLabel: ROLE_LABELS[role], level, targetLevels, daysUntil,
      sessionSize: getSessionSize(daysUntil), targetAccuracy: level === 'Senior' ? 80 : 70,
      dueCount, focus, topicStats: stats
    };
    const weeklyReview = buildWeeklyReview({ skillEvents, plan: basePlan, now });
    const controlSize = daysUntil !== null && daysUntil >= 0 && daysUntil <= 7 ? 15 : daysUntil !== null && daysUntil >= 0 && daysUntil <= 21 ? 12 : 10;
    const plan = { ...basePlan, baseSessionSize: basePlan.sessionSize, sessionSize: weeklyReview.adjustedSessionSize, weeklyReview, controlSize };
    plan.controlSession = buildControlSession({ questions, progress, plan, size: controlSize, now });
    return plan;
  }

  return {
    buildPlan, buildWeeklyReview, buildControlSession, appendJournalEntry, isJournalEntry,
    getDaysUntil, getSessionSize, ROLE_LABELS, LEVELS, TRAINER_PAGES, JOURNAL_LIMIT
  };
});
