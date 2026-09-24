(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IPMaxGamification = api;
})(typeof self !== 'undefined' ? self : globalThis, function() {
  'use strict';

  // XP is DERIVED from stored progress, never accumulated in its own counter.
  // A counter would drift on progress import (two devices, one export file) and
  // could not be recomputed after a data fix; a pure projection always agrees
  // with what the user actually did.
  const XP_RULES = {
    correctAnswer: 3,      // per correct answer point in qprog
    masteredQuestion: 10,  // question where correct > wrong
    trainerPass: 5,        // per passed trainer/lab attempt
    seniorCase: 40,
    studyDay: 15,
    weeklyTest: 50,
    externalTask: 30,
    blitzDay: 50,          // completing the daily blitz
    journalNote: 5
  };

  const LEVELS = [
    { level: 1, minXp: 0, title: 'Новичок', subtitle: 'Первые команды и первые вопросы', icon: '🌱' },
    { level: 2, minXp: 300, title: 'Стажёр', subtitle: 'База Linux и Git уже не пугает', icon: '🔧' },
    { level: 3, minXp: 800, title: 'Junior DevOps', subtitle: 'Собираю образы и читаю логи', icon: '🐳' },
    { level: 4, minXp: 1500, title: 'Уверенный Junior', subtitle: 'Пишу пайплайн и правлю YAML без страха', icon: '⚙️' },
    { level: 5, minXp: 2500, title: 'Middle DevOps', subtitle: 'Держу инфраструктуру как код', icon: '📦' },
    { level: 6, minXp: 4000, title: 'Крепкий Middle', subtitle: 'Диагностирую прод по метрикам и трейсам', icon: '🔍' },
    { level: 7, minXp: 6000, title: 'Senior-трек', subtitle: 'Объясняю trade-off, а не только команду', icon: '🧭' },
    { level: 8, minXp: 8500, title: 'Senior DevOps', subtitle: 'Проектирую отказоустойчивость осознанно', icon: '🏗️' },
    { level: 9, minXp: 12000, title: 'Lead / Platform', subtitle: 'Строю платформу, а не набор скриптов', icon: '☸️' },
    { level: 10, minXp: 16000, title: 'Principal / SRE', subtitle: 'Отвечаю за надёжность системы целиком', icon: '🛰️' }
  ];

  // Achievements are declarative: `metric` names a field of the metrics object
  // built by buildMetrics(). Keeping them data-only (no closures) means the
  // whole catalogue is serialisable and testable without a DOM or storage.
  const ACHIEVEMENTS = [
    { id: 'first_answer', title: 'Первый шаг', description: 'Ответьте на первый вопрос.', category: 'Теория', metric: 'answeredQuestions', goal: 1, unit: 'вопрос', xp: 20, page: 'exam' },
    { id: 'answers_50', title: '50 ответов', description: 'Ответьте на 50 вопросов — набирается база для аналитики.', category: 'Теория', metric: 'answeredQuestions', goal: 50, unit: 'вопросов', xp: 50, page: 'exam' },
    { id: 'answers_200', title: '200 ответов', description: 'Ответьте на 200 вопросов.', category: 'Теория', metric: 'answeredQuestions', goal: 200, unit: 'вопросов', xp: 120, page: 'exam' },
    { id: 'answers_500', title: '500 ответов', description: 'Ответьте на 500 вопросов.', category: 'Теория', metric: 'answeredQuestions', goal: 500, unit: 'вопросов', xp: 250, page: 'exam' },
    { id: 'mastered_10', title: 'Первые 10 освоено', description: 'Освойте 10 вопросов: правильных ответов больше, чем ошибок.', category: 'Теория', metric: 'masteredQuestions', goal: 10, unit: 'вопросов', xp: 40, page: 'exam' },
    { id: 'mastered_100', title: 'Сотня в активе', description: 'Освойте 100 вопросов.', category: 'Теория', metric: 'masteredQuestions', goal: 100, unit: 'вопросов', xp: 150, page: 'exam' },
    { id: 'mastered_300', title: 'Триста освоено', description: 'Освойте 300 вопросов — это уровень уверенного Middle.', category: 'Теория', metric: 'masteredQuestions', goal: 300, unit: 'вопросов', xp: 300, page: 'exam' },
    { id: 'topic_first', title: 'Тема закрыта', description: 'Доведите готовность одной темы до 70%.', category: 'Теория', metric: 'topicsReady', goal: 1, unit: 'тема', xp: 60, page: 'analytics' },
    { id: 'topic_five', title: 'Пять тем', description: 'Доведите до 70% готовности пять тем.', category: 'Теория', metric: 'topicsReady', goal: 5, unit: 'тем', xp: 180, page: 'analytics' },
    { id: 'topic_all_core', title: 'Ядро стека', description: 'Доведите до 70% готовности восемь тем.', category: 'Теория', metric: 'topicsReady', goal: 8, unit: 'тем', xp: 320, page: 'analytics' },
    { id: 'qbank_reader', title: 'Читатель банка', description: 'Раскройте 25 развёрнутых ответов в банке вопросов.', category: 'Теория', metric: 'qbankRevealed', goal: 25, unit: 'ответов', xp: 60, page: 'qbank' },
    { id: 'trainer_first', title: 'Тренажёр открыт', description: 'Пройдите первое задание в любом тренажёре.', category: 'Практика', metric: 'trainerPasses', goal: 1, unit: 'задание', xp: 20, page: 'subnet' },
    { id: 'trainer_50', title: 'Руки помнят', description: 'Пройдите 50 заданий в тренажёрах.', category: 'Практика', metric: 'trainerPasses', goal: 50, unit: 'заданий', xp: 120, page: 'subnet' },
    { id: 'trainer_150', title: 'Мышечная память', description: 'Пройдите 150 заданий в тренажёрах.', category: 'Практика', metric: 'trainerPasses', goal: 150, unit: 'заданий', xp: 260, page: 'subnet' },
    { id: 'subnet_master', title: 'Подсети без калькулятора', description: 'Решите 10 задач на подсети.', category: 'Практика', metric: 'subnetSolved', goal: 10, unit: 'задач', xp: 80, page: 'subnet' },
    { id: 'labs_five', title: 'Диагност', description: 'Разберите 5 сценариев в Debugging.', category: 'Практика', metric: 'labsSolved', goal: 5, unit: 'сценариев', xp: 80, page: 'labs' },
    { id: 'incident_first', title: 'Первое дежурство', description: 'Пройдите один troubleshooting-сценарий до конца.', category: 'Практика', metric: 'incidentsDone', goal: 1, unit: 'сценарий', xp: 50, page: 'ts' },
    { id: 'incident_five', title: 'On-call', description: 'Пройдите 5 troubleshooting-сценариев.', category: 'Практика', metric: 'incidentsDone', goal: 5, unit: 'сценариев', xp: 160, page: 'ts' },
    { id: 'senior_case_first', title: 'Senior Challenge', description: 'Закройте первый senior-кейс.', category: 'Практика', metric: 'seniorCases', goal: 1, unit: 'кейс', xp: 60, page: 'study' },
    { id: 'senior_case_ten', title: 'Десять кейсов', description: 'Закройте 10 senior-кейсов.', category: 'Практика', metric: 'seniorCases', goal: 10, unit: 'кейсов', xp: 220, page: 'study' },
    { id: 'external_task', title: 'Доказано на практике', description: 'Сдайте одно внешнее задание с доказательством.', category: 'Практика', metric: 'externalTasks', goal: 1, unit: 'задание', xp: 60, page: 'external' },
    { id: 'study_week', title: 'Неделя плана', description: 'Закройте 5 учебных дней.', category: 'Дисциплина', metric: 'studyDays', goal: 5, unit: 'дней', xp: 80, page: 'study' },
    { id: 'study_month', title: 'Месяц плана', description: 'Закройте 20 учебных дней.', category: 'Дисциплина', metric: 'studyDays', goal: 20, unit: 'дней', xp: 200, page: 'study' },
    { id: 'weekly_test', title: 'Контрольная сдана', description: 'Сдайте недельную контрольную на проходной балл.', category: 'Дисциплина', metric: 'weeklyTests', goal: 1, unit: 'тест', xp: 70, page: 'study' },
    { id: 'streak_3', title: 'Три дня подряд', description: 'Занимайтесь три дня подряд.', category: 'Дисциплина', metric: 'bestDailyStreak', goal: 3, unit: 'дня', xp: 40, page: 'home' },
    { id: 'streak_7', title: 'Недельный стрик', description: 'Занимайтесь семь дней подряд.', category: 'Дисциплина', metric: 'bestDailyStreak', goal: 7, unit: 'дней', xp: 90, page: 'home' },
    { id: 'streak_30', title: 'Месяц без пропусков', description: 'Занимайтесь 30 дней подряд.', category: 'Дисциплина', metric: 'bestDailyStreak', goal: 30, unit: 'дней', xp: 300, page: 'home' },
    { id: 'blitz_10', title: 'Десять блицев', description: 'Пройдите ежедневный блиц 10 раз.', category: 'Дисциплина', metric: 'blitzDays', goal: 10, unit: 'раз', xp: 150, page: 'home' },
    { id: 'answer_streak_20', title: 'Серия из 20', description: 'Дайте 20 правильных ответов подряд.', category: 'Дисциплина', metric: 'bestAnswerStreak', goal: 20, unit: 'ответов', xp: 120, page: 'exam' },
    { id: 'journal_five', title: 'Рефлексия', description: 'Оставьте 5 заметок в журнале навыков.', category: 'Дисциплина', metric: 'journalNotes', goal: 5, unit: 'заметок', xp: 60, page: 'home' }
  ];

  const ACHIEVEMENT_CATEGORIES = ['Теория', 'Практика', 'Дисциплина'];
  // Trainer results share the skill-event store with quiz answers; quiz sources
  // already earn XP per question, so counting them here would pay twice.
  const QUIZ_SOURCES = new Set(['exam', 'freeform', 'blitz', 'diagnostic', 'daily-blitz', 'mock']);

  function count(value) { return Number.isFinite(value) && value > 0 ? value : 0; }
  function asObject(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  function asArray(value) { return Array.isArray(value) ? value : []; }
  function countKeys(value) { return Object.keys(asObject(value)).length; }

  function isMastered(item) {
    const record = asObject(item);
    return count(record.correct) > count(record.wrong);
  }

  function isAnswered(item) {
    const record = asObject(item);
    return count(record.correct) + count(record.wrong) > 0;
  }

  /**
   * Flattens everything the app already stores into plain numeric metrics.
   * Every achievement and the whole XP total read only from here, so adding a
   * new source means adding one metric, not touching the rules.
   */
  function buildMetrics(input) {
    const state = asObject(input);
    const progress = asObject(state.questionProgress);
    const records = Object.values(progress).filter(item => item && typeof item === 'object');
    const events = asArray(state.skillEvents).filter(event => event && typeof event === 'object');
    const trainerEvents = events.filter(event => !QUIZ_SOURCES.has(event.source) && count(event.score) > 0);
    const studyProgress = asObject(state.studyProgress);
    const seniorCases = asObject(state.seniorCaseProgress);
    const externalTasks = asObject(state.externalTasks);
    const weeklyResults = asObject(state.weeklyResults);
    const topicStats = asArray(state.topicStats);
    const daily = asObject(state.dailyBlitz);

    return {
      answeredQuestions: records.filter(isAnswered).length,
      masteredQuestions: records.filter(isMastered).length,
      correctPoints: Math.round(records.reduce((sum, item) => sum + count(item.correct), 0)),
      topicsReady: topicStats.filter(stat => stat && count(stat.readiness) >= 70).length,
      qbankRevealed: countKeys(state.qbankRevealed),
      trainerPasses: trainerEvents.length,
      subnetSolved: countKeys(state.subnetProgress),
      labsSolved: countKeys(state.labsProgress),
      incidentsDone: countKeys(state.tsScores),
      seniorCases: Object.values(seniorCases).filter(item => asObject(item).status === 'done').length,
      // External tasks are stored as { completedAt, evidence } — there is no
      // status field. Accept the status shape too so a future refactor of that
      // store does not silently zero the counter.
      externalTasks: Object.values(externalTasks).filter(item => {
        const entry = asObject(item);
        if (Number.isFinite(entry.completedAt) && entry.completedAt > 0) return true;
        return entry.status === 'done' || entry.status === 'submitted' || entry.status === 'approved';
      }).length,
      studyDays: Object.values(studyProgress).filter(status => status === 'done').length,
      weeklyTests: Object.values(weeklyResults).filter(item => asObject(item).passed === true).length,
      journalNotes: asArray(state.journal).length,
      blitzDays: count(daily.completedCount),
      dailyStreak: count(daily.streak),
      bestDailyStreak: Math.max(count(daily.bestStreak), count(daily.streak)),
      bestAnswerStreak: count(state.bestAnswerStreak)
    };
  }

  function computeXp(metrics) {
    const source = asObject(metrics);
    const breakdown = {
      answers: Math.round(count(source.correctPoints) * XP_RULES.correctAnswer),
      mastery: count(source.masteredQuestions) * XP_RULES.masteredQuestion,
      trainers: count(source.trainerPasses) * XP_RULES.trainerPass,
      cases: count(source.seniorCases) * XP_RULES.seniorCase,
      study: count(source.studyDays) * XP_RULES.studyDay,
      tests: count(source.weeklyTests) * XP_RULES.weeklyTest,
      tasks: count(source.externalTasks) * XP_RULES.externalTask,
      blitz: count(source.blitzDays) * XP_RULES.blitzDay,
      journal: count(source.journalNotes) * XP_RULES.journalNote
    };
    const achievements = count(source.achievementXp);
    const total = Object.values(breakdown).reduce((sum, value) => sum + value, 0) + achievements;
    return { total, breakdown: { ...breakdown, achievements } };
  }

  function levelFor(xp) {
    const total = Math.max(0, count(xp));
    let current = LEVELS[0];
    for (const level of LEVELS) {
      if (total >= level.minXp) current = level;
    }
    const next = LEVELS.find(level => level.minXp > current.minXp) || null;
    const span = next ? next.minXp - current.minXp : 0;
    const gained = total - current.minXp;
    return {
      ...current,
      xp: total,
      next,
      nextXp: next ? next.minXp : null,
      xpIntoLevel: gained,
      xpForNext: span,
      xpToNext: next ? Math.max(0, next.minXp - total) : 0,
      progress: span ? Math.min(100, Math.round(gained / span * 100)) : 100
    };
  }

  function evaluateAchievements(metrics) {
    const source = asObject(metrics);
    return ACHIEVEMENTS.map(achievement => {
      const value = count(source[achievement.metric]);
      const unlocked = value >= achievement.goal;
      return {
        ...achievement,
        value: Math.min(value, achievement.goal),
        rawValue: value,
        unlocked,
        progress: achievement.goal ? Math.min(100, Math.round(value / achievement.goal * 100)) : 0
      };
    });
  }

  /**
   * Single entry point for the UI: metrics -> XP -> level -> achievements,
   * plus the one quest that is closest to done. The quest is what turns a wall
   * of 30 locked badges into a concrete next action.
   */
  function buildProfile(input) {
    const metrics = buildMetrics(input);
    const seen = new Set(asArray(asObject(input).seenAchievements).map(String));
    const achievements = evaluateAchievements(metrics);
    const unlocked = achievements.filter(item => item.unlocked);
    const achievementXp = unlocked.reduce((sum, item) => sum + count(item.xp), 0);
    const xp = computeXp({ ...metrics, achievementXp });
    const pending = achievements
      .filter(item => !item.unlocked && item.progress > 0)
      .sort((left, right) => right.progress - left.progress || left.goal - right.goal);
    const fallback = achievements.filter(item => !item.unlocked)
      .sort((left, right) => left.goal - right.goal);
    return {
      metrics,
      xp: xp.total,
      xpBreakdown: xp.breakdown,
      level: levelFor(xp.total),
      levels: LEVELS,
      achievements,
      unlockedCount: unlocked.length,
      totalCount: achievements.length,
      freshCount: unlocked.filter(item => !seen.has(String(item.id))).length,
      quest: pending[0] || fallback[0] || null
    };
  }

  function markAchievementsSeen(state, achievements) {
    const current = asObject(state);
    const seen = new Set(asArray(current.seenAchievements).map(String));
    asArray(achievements).filter(item => item && item.unlocked).forEach(item => seen.add(String(item.id)));
    return { ...current, seenAchievements: [...seen] };
  }

  return {
    XP_RULES, LEVELS, ACHIEVEMENTS, ACHIEVEMENT_CATEGORIES, QUIZ_SOURCES,
    buildMetrics, computeXp, levelFor, evaluateAchievements, buildProfile, markAchievementsSeen
  };
});
