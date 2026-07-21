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

  return { recordQuestionAttempt, appendSkillEvent, isSkillEvent, scoreFor, EVENT_LIMIT };
});
