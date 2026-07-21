(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.InterviewCoach = api;
})(typeof self !== 'undefined' ? self : globalThis, function() {
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

  function safeNumber(value) { return Number.isFinite(value) && value > 0 ? value : 0; }
  function eventScore(event) {
    if (!event || typeof event !== 'object' || !Number.isFinite(event.score) || !Number.isFinite(event.possible) || event.possible <= 0) return null;
    return Math.max(0, Math.min(100, Math.round(event.score / event.possible * 100)));
  }
  function getDaysUntil(date, now) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return null;
    const target = new Date(date + 'T00:00:00');
    const [year, month, day] = date.split('-').map(Number);
    if (!Number.isFinite(target.getTime()) || target.getFullYear() !== year || target.getMonth() !== month - 1 || target.getDate() !== day) return null;
    const today = new Date(now || Date.now());
    today.setHours(0, 0, 0, 0);
    return Math.ceil((target - today) / 86400000);
  }
  function getSessionSize(daysUntil) {
    if (daysUntil !== null && daysUntil >= 0 && daysUntil <= 7) return 20;
    if (daysUntil !== null && daysUntil >= 0 && daysUntil <= 21) return 15;
    return 10;
  }
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
    return {
      role, roleLabel: ROLE_LABELS[role], level, targetLevels, daysUntil,
      sessionSize: getSessionSize(daysUntil), targetAccuracy: level === 'Senior' ? 80 : 70,
      dueCount, focus, topicStats: stats
    };
  }

  return { buildPlan, getDaysUntil, getSessionSize, ROLE_LABELS, LEVELS, TRAINER_PAGES };
});
