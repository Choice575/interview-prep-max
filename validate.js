#!/usr/bin/env node
/**
 * Interview Prep Max — Data Validator
 * Запуск: node validate.js
 * Проверяет все JSON-файлы данных на целостность
 */

const fs = require('fs');
const path = require('path');

const TASKS_DIR = path.join(__dirname, 'tasks');
const KNOWN_TOPICS = ['Terraform', 'Linux', 'Сети', 'Ansible', 'Docker', 'Kubernetes', 'CI/CD', 'Git', 'Regex', 'Monitoring', 'Cloud', 'Security'];
const KNOWN_LEVELS = ['Junior', 'Middle', 'Senior', 'Junior+', 'Middle+', 'Senior-track'];
const KNOWN_CATEGORIES = ['definition', 'scenario', 'tradeoff', 'output'];
const KNOWN_STUDY_TYPES = ['incident', 'diagnostic', 'tradeoff', 'rollback', 'postmortem'];
const KNOWN_TRAINERS = ['exam', 'analytics', 'subnet', 'ts', 'cmd', 'labs', 'code', 'ansible', 'dockerfile', 'k8s', 'ports', 'git', 'regex', 'tips'];
const APP_VERSION = '12.0.0';
const CURRICULUM_VERSION = '5.1.0';
const STUDY_PREREQUISITE_WEEKS = new Set([6, 11, 15, 17, 25]);
const STUDY_TECHNOLOGY_STATUS_WEEKS = new Set([11, 18, 19, 20, 21, 22]);

let errors = 0, warnings = 0;

function err(msg) { console.error('  ❌ ' + msg); errors++; }
function warn(msg) { console.warn('  ⚠️  ' + msg); warnings++; }
function ok(msg) { console.log('  ✅ ' + msg); }

function normalizeOptionText(opt) {
  return String(opt || '')
    .trim()
    .replace(/^[a-eа-е][).]\s*/i, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function looksLikeOptionPrefixArtifact(opt) {
  return /^[a-eа-е][).]\s*[a-eа-е][).]/i.test(String(opt || '').trim());
}

// ═══ 1. Вопросы ═══
console.log('\n📋 Проверка вопросов (base_questions.json)...');
const qfile = path.join(TASKS_DIR, 'base_questions.json');
if (!fs.existsSync(qfile)) { err('base_questions.json не найден'); }
else {
  const questions = JSON.parse(fs.readFileSync(qfile, 'utf8'));
  ok(`Загружено ${questions.length} вопросов`);

  const ids = new Set();
  const dupIds = [];

  questions.forEach((q, i) => {
    const prefix = `Q#${q.id || '?'}[${i}]`;

    // Обязательные поля
    if (!q.id) err(`${prefix}: нет id`);
    if (!q.topic) err(`${prefix}: нет topic`);
    if (!q.level) err(`${prefix}: нет level`);
    if (!q.q) err(`${prefix}: нет вопроса`);
    if (!q.options || q.options.length < 2) err(`${prefix}: нужно минимум 2 варианта`);
    if (q.answer === undefined || q.answer === null) err(`${prefix}: нет правильного ответа`);

    // Валидация значений
    if (q.topic && !KNOWN_TOPICS.includes(q.topic))
      warn(`${prefix}: неизвестная тема "${q.topic}"`);
    if (q.level && !KNOWN_LEVELS.includes(q.level))
      warn(`${prefix}: неизвестный уровень "${q.level}"`);
    if (q.category && !KNOWN_CATEGORIES.includes(q.category))
      warn(`${prefix}: неизвестная категория "${q.category}"`);

    // Валидация ответа
    if (q.answer !== undefined && typeof q.answer !== 'number')
      err(`${prefix}: answer должен быть числом, сейчас ${typeof q.answer}`);
    if (q.answer !== undefined && q.options && (q.answer < 0 || q.answer >= q.options.length))
      err(`${prefix}: answer=${q.answer} вне диапазона 0..${q.options.length - 1}`);

    // Пустые опции и артефакты вариантов
    if (q.options) {
      q.options.forEach((opt, oi) => {
        if (!opt || opt.trim() === '') err(`${prefix}: вариант ${oi} пустой`);
        if (looksLikeOptionPrefixArtifact(opt)) warn(`${prefix}: вариант ${oi} похож на артефакт префикса "${opt}"`);
      });
      // Проверка на дубликаты опций
      const unique = new Set(q.options);
      if (unique.size !== q.options.length) warn(`${prefix}: есть дубликаты вариантов`);
      const normalized = q.options.map(normalizeOptionText);
      const normalizedUnique = new Set(normalized);
      if (normalizedUnique.size !== normalized.length) warn(`${prefix}: есть дубликаты вариантов после нормализации`);
      const correctText = q.options[q.answer];
      if (correctText && normalizeOptionText(correctText).length < 2 && !/^\d+$/.test(normalizeOptionText(correctText))) warn(`${prefix}: правильный вариант слишком короткий`);
    }

    // Дубли ID
    if (q.id) {
      if (ids.has(q.id)) dupIds.push(q.id);
      ids.add(q.id);
    }

    // Объяснение
    if (!q.explanation) warn(`${prefix}: нет объяснения`);
    else if (String(q.explanation).trim().length < 20) warn(`${prefix}: объяснение слишком короткое`);
  });

  if (dupIds.length) err(`Найдены дубликаты ID: ${dupIds.join(', ')}`);

  // Статистика по темам
  console.log('\n  📊 Распределение по темам:');
  const byTopic = {};
  questions.forEach(q => {
    byTopic[q.topic] = (byTopic[q.topic] || 0) + 1;
  });
  Object.entries(byTopic).sort((a,b) => b[1]-a[1]).forEach(([t,c]) => {
    console.log(`    ${t}: ${c}`);
  });
}

// ═══ 2. Best Practices ═══
console.log('\n✦ Проверка Best Practices (best_practices.json)...');
const bpfile = path.join(TASKS_DIR, 'best_practices.json');
if (!fs.existsSync(bpfile)) { err('best_practices.json не найден'); }
else {
  const bestPractices = JSON.parse(fs.readFileSync(bpfile, 'utf8'));
  if (bestPractices.schemaVersion !== 1) err('Best Practices: неподдерживаемая schemaVersion');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bestPractices.updated || '')) err('Best Practices: updated должен быть датой YYYY-MM-DD');
  if (!Array.isArray(bestPractices.topics)) err('Best Practices: topics должен быть массивом');
  else {
    const seenTopics = new Set();
    const seenSlugs = new Set();
    bestPractices.topics.forEach((topic, index) => {
      const prefix = `BestPractices[${index}]`;
      if (!KNOWN_TOPICS.includes(topic.topic)) err(`${prefix}: неизвестная тема "${topic.topic}"`);
      if (seenTopics.has(topic.topic)) err(`${prefix}: дубликат темы "${topic.topic}"`);
      if (!topic.slug || seenSlugs.has(topic.slug)) err(`${prefix}: slug отсутствует или дублируется`);
      seenTopics.add(topic.topic);
      seenSlugs.add(topic.slug);
      if (!topic.summary || topic.summary.length < 40) err(`${prefix}: слишком короткое summary`);
      if (!Array.isArray(topic.practices) || topic.practices.length < 5) err(`${prefix}: нужно минимум 5 практик`);
      else topic.practices.forEach((practice, practiceIndex) => {
        const practicePrefix = `${prefix}.practices[${practiceIndex}]`;
        if (!practice.title) err(`${practicePrefix}: нет title`);
        if (!practice.why || practice.why.length < 70) err(`${practicePrefix}: слишком короткое why`);
        if (!practice.action || practice.action.length < 70) err(`${practicePrefix}: слишком короткое action`);
      });
    });
    KNOWN_TOPICS.forEach(topic => {
      if (!seenTopics.has(topic)) err(`Best Practices: отсутствует тема "${topic}"`);
    });
    ok(`Best Practices: ${bestPractices.topics.length} тем`);
  }
}

// ═══ 3. Подсети ═══
console.log('\n🌐 Проверка подсетей (subnet.json)...');
const sfile = path.join(TASKS_DIR, 'subnet.json');
if (fs.existsSync(sfile)) {
  const subnets = JSON.parse(fs.readFileSync(sfile, 'utf8'));
  ok(`Загружено ${subnets.length} задач`);
  subnets.forEach((s, i) => {
    if (!s.ip || !s.prefix) err(`Subnet#${i}: нет ip или prefix`);
    if (s.prefix && (s.prefix < 0 || s.prefix > 32)) err(`Subnet#${i}: prefix=${s.prefix} вне диапазона 0-32`);
  });
}

// ═══ 3. Troubleshooting ═══
console.log('\n🔧 Проверка TS-сценариев (ts.json)...');
const tsfile = path.join(TASKS_DIR, 'ts.json');
if (fs.existsSync(tsfile)) {
  const scenarios = JSON.parse(fs.readFileSync(tsfile, 'utf8'));
  ok(`Загружено ${scenarios.length} сценариев`);

  const tsIds = new Set();
  scenarios.forEach(s => {
    if (!s.id) err(`TS: нет id`);
    else if (tsIds.has(s.id)) err(`TS: дубликат id=${s.id}`);
    else tsIds.add(s.id);
    if (!s.topic) err(`TS#${s.id || '?'}: нет topic`);
    else if (!KNOWN_TOPICS.includes(s.topic)) err(`TS#${s.id || '?'}: неизвестная тема "${s.topic}"`);

    if (!s.nodes || !s.nodes.start) err(`TS#${s.id}: нет nodes.start`);
    else {
      // Проверяем что все next ссылаются на существующие ноды
      const nodeNames = new Set(Object.keys(s.nodes));
      Object.entries(s.nodes).forEach(([name, node]) => {
        if (node.choices) {
          node.choices.forEach((c, ci) => {
            if (c.next && !nodeNames.has(c.next))
              err(`TS#${s.id}/${name}: выбор ${ci} ссылается на несуществующий узел "${c.next}"`);
            if (c.pts === undefined) warn(`TS#${s.id}/${name}: выбор ${ci} без очков`);
          });
        }
      });
    }
  });
}

// ═══ 4. Тренажёры команд/кода ═══
const trainers = [
  { file: 'cmd.json', name: 'Command Builder', idField: 'id', answerField: 'answer' },
  { file: 'code.json', name: 'Code Reviewer', idField: 'id', answerField: 'answer' },
  { file: 'git.json', name: 'Git', idField: 'id', answerField: 'answer' },
  { file: 'regex.json', name: 'Regex', idField: 'id', answerField: 'answer' },
  { file: 'ansible_pb.json', name: 'Ansible Playbook', idField: 'id', answerField: 'answer' },
  { file: 'dockerfile.json', name: 'Dockerfile', idField: 'id', answerField: 'answer' },
  { file: 'k8s.json', name: 'K8s YAML', idField: 'id', answerField: 'answer' },
  { file: 'ports.json', name: 'Порты', idField: 'id', answerField: null },
  { file: 'labs.json', name: 'Labs/Debugging', idField: 'id', answerField: 'answer' },
];

trainers.forEach(t => {
  console.log(`\n📦 Проверка ${t.name} (${t.file})...`);
  const tfile = path.join(TASKS_DIR, t.file);
  if (!fs.existsSync(tfile)) { warn(`${t.file} не найден`); return; }
  const tasks = JSON.parse(fs.readFileSync(tfile, 'utf8'));
  ok(`Загружено ${tasks.length} заданий`);

  const tids = new Set();
  tasks.forEach((task, i) => {
    const id = task[t.idField];
    if (!id) { err(`${t.name}#${i}: нет ${t.idField}`); return; }
    if (tids.has(id)) err(`${t.name}: дубликат ${t.idField}=${id}`);
    tids.add(id);

    if (t.answerField && task[t.answerField] !== undefined && task.opts) {
      if (task[t.answerField] < 0 || task[t.answerField] >= task.opts.length)
        err(`${t.name}#${id}: answer=${task[t.answerField]} вне диапазона 0..${task.opts.length - 1}`);
    }
    if (t.file === 'labs.json') {
      if (!task.topic) err(`${t.name}#${id}: нет topic`);
      else if (!KNOWN_TOPICS.includes(task.topic)) err(`${t.name}#${id}: неизвестная тема "${task.topic}"`);
    }
  });
});

function readJsonTask(file, label) {
  const f = path.join(TASKS_DIR, file);
  if (!fs.existsSync(f)) {
    err(`${label}: ${file} не найден`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (e) {
    err(`${label}: ${file} невалидный JSON: ${e.message}`);
    return null;
  }
}

// ═══ 5. Incident Simulator ═══
console.log('\n🚨 Проверка Incident Simulator (incidents.json)...');
const incidents = readJsonTask('incidents.json', 'Incident simulator');
if (incidents) {
  if (!Array.isArray(incidents)) {
    err('incidents.json: должен быть массивом сценариев');
  } else {
    ok(`Загружено ${incidents.length} incident-сценариев`);
    const incidentIds = new Set();
    const phases = new Set(['triage', 'diagnosis', 'remediation', 'postmortem']);
    incidents.forEach((incident, i) => {
      const prefix = `Incident#${incident.id || '?'}[${i}]`;
      ['id', 'title', 'topic', 'level', 'context'].forEach(key => {
        if (incident[key] === undefined || incident[key] === null || incident[key] === '') err(`${prefix}: нет ${key}`);
      });
      if (incident.id) {
        if (incidentIds.has(incident.id)) err(`${prefix}: дубликат id=${incident.id}`);
        incidentIds.add(incident.id);
      }
      if (incident.topic && !KNOWN_TOPICS.includes(incident.topic)) warn(`${prefix}: неизвестная тема "${incident.topic}"`);
      if (incident.level && !KNOWN_LEVELS.includes(incident.level)) warn(`${prefix}: неизвестный уровень "${incident.level}"`);
      if (!Array.isArray(incident.phases) || incident.phases.length === 0) {
        err(`${prefix}: phases должен быть непустым массивом`);
        return;
      }
      if (incident.phases.length !== 4) warn(`${prefix}: обычно ожидается 4 фазы, найдено ${incident.phases.length}`);
      const phaseNames = new Set();
      incident.phases.forEach((phase, pi) => {
        const phasePrefix = `${prefix}/Phase#${pi + 1}`;
        ['phase', 'title', 'question', 'explanation'].forEach(key => {
          if (phase[key] === undefined || phase[key] === null || phase[key] === '') err(`${phasePrefix}: нет ${key}`);
        });
        if (phase.phase) {
          if (!phases.has(phase.phase)) err(`${phasePrefix}: неизвестная фаза "${phase.phase}"`);
          if (phaseNames.has(phase.phase)) err(`${phasePrefix}: дубликат фазы "${phase.phase}"`);
          phaseNames.add(phase.phase);
        }
        if (!Array.isArray(phase.options) || phase.options.length < 2) err(`${phasePrefix}: нужно минимум 2 варианта`);
        if (!Number.isInteger(phase.answer)) err(`${phasePrefix}: answer должен быть целым числом`);
        else if (Array.isArray(phase.options) && (phase.answer < 0 || phase.answer >= phase.options.length)) err(`${phasePrefix}: answer=${phase.answer} вне диапазона вариантов`);
      });
    });
  }
}

// ═══ 6. Учебная вкладка ═══
console.log('\n🎓 Проверка учебной вкладки (study_*.json)...');
const studyMap = readJsonTask('study_map.json', 'Study map');
const studyTests = readJsonTask('study_tests.json', 'Study tests');
const seniorCases = readJsonTask('senior_cases.json', 'Senior cases');

const seniorCaseIds = new Set();
if (seniorCases) {
  const cases = Array.isArray(seniorCases.cases) ? seniorCases.cases : [];
  if (!Array.isArray(seniorCases.cases)) err('senior_cases.json: нет массива cases');
  ok(`Загружено ${cases.length} senior-кейсов`);
  cases.forEach((c, i) => {
    const prefix = `SeniorCase#${c.id || '?'}[${i}]`;
    ['id', 'week', 'level', 'topic', 'type', 'title', 'context', 'task'].forEach(k => {
      if (c[k] === undefined || c[k] === null || c[k] === '') err(`${prefix}: нет ${k}`);
    });
    if (c.id) {
      if (seniorCaseIds.has(c.id)) err(`${prefix}: дубликат id=${c.id}`);
      seniorCaseIds.add(c.id);
    }
    if (c.topic && !KNOWN_TOPICS.includes(c.topic)) warn(`${prefix}: неизвестная тема "${c.topic}"`);
    if (c.level && !KNOWN_LEVELS.includes(c.level)) warn(`${prefix}: неизвестный уровень "${c.level}"`);
    if (c.type && !KNOWN_STUDY_TYPES.includes(c.type)) err(`${prefix}: неизвестный type "${c.type}"`);
    if (!Array.isArray(c.evidence) || c.evidence.length === 0) err(`${prefix}: evidence должен быть непустым массивом`);
    if (!Array.isArray(c.expectedActions) || c.expectedActions.length === 0) err(`${prefix}: expectedActions должен быть непустым массивом`);
    if (!Array.isArray(c.commonMistakes)) err(`${prefix}: commonMistakes должен быть массивом`);
    if (!c.scoring || typeof c.scoring !== 'object' || Array.isArray(c.scoring)) err(`${prefix}: scoring должен быть объектом`);
    else Object.entries(c.scoring).forEach(([k, v]) => {
      if (typeof v !== 'number') err(`${prefix}: scoring.${k} должен быть числом`);
    });
  });
}

if (studyMap) {
  const weeks = Array.isArray(studyMap.weeks) ? studyMap.weeks : [];
  if (studyMap.version !== CURRICULUM_VERSION) err(`study_map.json: expected curriculum ${CURRICULUM_VERSION}`);
  if (weeks.length !== 32) err(`study_map.json: expected 32 weeks, found ${weeks.length}`);
  if (!Array.isArray(studyMap.weeks)) err('study_map.json: нет массива weeks');
  ok(`Загружено ${weeks.length} учебных недель`);
  const weekNumbers = new Set();
  weeks.forEach(w => {
    const prefix = `StudyWeek#${w.week || '?'}`;
    if (Number.isInteger(w.week)) {
      if (weekNumbers.has(w.week)) err(`${prefix}: duplicate week number`);
      weekNumbers.add(w.week);
    }
    if (w.curriculumVersion !== studyMap.version) err(`${prefix}: curriculumVersion must match study_map version`);
    if (typeof w.artifact !== 'string' || !w.artifact.trim()) err(`${prefix}: artifact must be a non-empty string`);
    if (!Array.isArray(w.completionCriteria) || w.completionCriteria.length !== 4 ||
      w.completionCriteria.some(item => typeof item !== 'string' || !item.trim())) {
      err(`${prefix}: completionCriteria must contain exactly four non-empty items`);
    }
    if (!w.aiTrack || typeof w.aiTrack !== 'object' || Array.isArray(w.aiTrack) || w.aiTrack.optional !== true ||
      typeof w.aiTrack.title !== 'string' || !w.aiTrack.title.trim() ||
      typeof w.aiTrack.result !== 'string' || !w.aiTrack.result.trim()) {
      err(`${prefix}: aiTrack must define optional=true, title and result`);
    }
    if (STUDY_PREREQUISITE_WEEKS.has(w.week) && (!Array.isArray(w.prerequisites) || w.prerequisites.length === 0)) {
      err(`${prefix}: prerequisites are required before this curriculum block`);
    }
    if (w.prerequisites && (!Array.isArray(w.prerequisites) || w.prerequisites.some(item => typeof item !== 'string' || !item.trim()))) {
      err(`${prefix}: prerequisites must be an array of non-empty strings`);
    }
    if (STUDY_TECHNOLOGY_STATUS_WEEKS.has(w.week) && !w.technologyStatus) {
      err(`${prefix}: technologyStatus is required for fast-changing tools`);
    }
    if (w.technologyStatus && (
      !Array.isArray(w.technologyStatus.preferred) || w.technologyStatus.preferred.length === 0 ||
      !Array.isArray(w.technologyStatus.legacy) || typeof w.technologyStatus.note !== 'string' || !w.technologyStatus.note.trim()
    )) err(`${prefix}: technologyStatus must define preferred, legacy and note`);
    if (!w.week) err(`${prefix}: нет week`);
    if (!w.title) err(`${prefix}: нет title`);
    if (!Array.isArray(w.days)) err(`${prefix}: days должен быть массивом`);
    else {
      if (w.days.length !== 5) warn(`${prefix}: ожидается 5 дней, найдено ${w.days.length}`);
      w.days.forEach(d => {
        const dp = `${prefix}/Day#${d.day || '?'}`;
        if (!d.day) err(`${dp}: нет day`);
        if (!d.title) err(`${dp}: нет title`);
        if (!d.objective) err(`${dp}: нет objective`);
        if (!Array.isArray(d.practice)) warn(`${dp}: practice должен быть массивом`);
      });
    }
    const trainersList = w.interviewPrepMax && w.interviewPrepMax.trainers;
    if (trainersList) {
      trainersList.forEach(t => { if (!KNOWN_TRAINERS.includes(t)) err(`${prefix}: неизвестный trainer "${t}"`); });
    }
    const filters = w.interviewPrepMax && w.interviewPrepMax.questionFilters;
    if (filters && filters.topic) {
      filters.topic.forEach(t => { if (!KNOWN_TOPICS.includes(t)) warn(`${prefix}: questionFilters.topic неизвестная тема "${t}"`); });
    }
  });
  for (let week = 1; week <= 32; week++) {
    if (!weekNumbers.has(week)) err(`study_map.json: missing week ${week}`);
  }
}

if (studyTests) {
  const miniTests = Array.isArray(studyTests.miniTests) ? studyTests.miniTests : [];
  const weeklyTests = Array.isArray(studyTests.weeklyTests) ? studyTests.weeklyTests : [];
  if (!Array.isArray(studyTests.miniTests)) err('study_tests.json: нет массива miniTests');
  if (!Array.isArray(studyTests.weeklyTests)) err('study_tests.json: нет массива weeklyTests');
  ok(`Загружено ${miniTests.length} мини-тестов и ${weeklyTests.length} недельных тестов`);

  const miniByWeek = {};
  miniTests.forEach(t => {
    const prefix = `MiniTest#${t.id || '?'}`;
    if (!t.id) err(`${prefix}: нет id`);
    if (!t.week) err(`${prefix}: нет week`);
    if (!t.day) err(`${prefix}: нет day`);
    if (!Array.isArray(t.questions)) err(`${prefix}: questions должен быть массивом`);
    else {
      if (t.questions.length !== 5) warn(`${prefix}: ожидается 5 вопросов, найдено ${t.questions.length}`);
      t.questions.forEach((q, i) => {
        if (!q.q) err(`${prefix}/Q${i + 1}: нет q`);
        if (!q.expected) err(`${prefix}/Q${i + 1}: нет expected`);
        if (typeof q.score !== 'number') err(`${prefix}/Q${i + 1}: score должен быть числом`);
      });
    }
    if (t.week) miniByWeek[t.week] = (miniByWeek[t.week] || 0) + 1;
    (t.relatedSeniorCases || []).forEach(id => {
      if (!seniorCaseIds.has(id)) err(`${prefix}: relatedSeniorCases ссылается на неизвестный кейс ${id}`);
    });
  });
  Object.entries(miniByWeek).forEach(([week, count]) => {
    if (count !== 5) warn(`Неделя ${week}: ожидается 5 miniTests, найдено ${count}`);
  });

  weeklyTests.forEach(t => {
    const prefix = `WeeklyTest#${t.id || '?'}`;
    if (!t.id) err(`${prefix}: нет id`);
    if (!t.week) err(`${prefix}: нет week`);
    if (!t.parts || typeof t.parts !== 'object') err(`${prefix}: нет parts`);
    else {
      const score = Object.values(t.parts).reduce((sum, part) => sum + (typeof part.score === 'number' ? part.score : 0), 0);
      if (score !== 100) err(`${prefix}: сумма score должна быть 100, сейчас ${score}`);
      const caseId = t.parts.seniorChallenge && t.parts.seniorChallenge.caseId;
      if (caseId && !seniorCaseIds.has(caseId)) err(`${prefix}: seniorChallenge ссылается на неизвестный кейс ${caseId}`);
    }
  });
}

// ═══ Итог ═══
console.log(`\n${'═'.repeat(50)}`);
console.log(`Проверка завершена: ${errors} ошибок, ${warnings} предупреждений`);
if (errors === 0 && warnings === 0) console.log('🎉 Все данные в порядке!');
else if (errors === 0) console.log('⚠️  Есть предупреждения, но ошибок нет');
else { console.log('❌ Нужно исправить ошибки перед деплоем'); process.exit(1); }
