'use strict';

/**
 * Генератор tasks/courses.json — раскладывает существующий учебный план
 * (32 недели x 5 дней) в формат «курс -> главы», как на обучающих платформах.
 *
 * Ничего в приложении не меняет: только читает tasks/*.json и пишет tasks/courses.json.
 * Запуск:  node scripts/generate-courses.js
 * Проверка без записи:  node scripts/generate-courses.js --dry-run
 *
 * Источники данных:
 *   study_map.json     -> недели, дни (уроки), prerequisites, уровни
 *   study_tests.json   -> miniTests (тест после дня), weeklyTests (тест недели)
 *   senior_cases.json  -> лаб. работы типа «инцидент», привязаны к week/day
 *   ts.json            -> симуляторы troubleshooting, привязка по теме
 *   labs.json          -> лаб. работы «найди баг», привязка по теме
 *   external_tasks.json-> лаб. работы с внешним доказательством, привязка по теме
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TASKS_DIR = path.join(ROOT, 'tasks');
const OUTPUT = path.join(TASKS_DIR, 'courses.json');
const SCHEMA_VERSION = '0.1.0-draft';

// Оценка времени на главу, минуты. Черновые числа для расчёта «сколько курс займёт».
const MINUTES = { lesson: 25, test: 10, weekly: 20, lab: 30, simulator: 25 };

/**
 * Ручная привязка симуляторов из ts.json к курсам.
 *
 * Поле topic в ts.json НЕ трогаем: validate.js требует его из KNOWN_TOPICS,
 * а app.js передаёт его в recordSkillEvent — то есть тема уже записана
 * в накопленную аналитику по навыкам. Смена topic исказила бы историю
 * прохождений. Поэтому расхождения «тема аналитики != тема каталога»
 * разрешаются здесь, в генераторе.
 *
 * Ключ — id сценария, значение — id курса.
 */
const SIMULATOR_OVERRIDES = {
  1: 'crs_docker',  // «Nginx отдаёт 502 Bad Gateway»: в ts.json topic=Monitoring, по смыслу — контейнеры и upstream
  9: 'crs_docker'   // «Redis неожиданно удаляет ключи»: в ts.json topic=Monitoring, по смыслу — конфигурация сервиса
};

/**
 * Поля главы-урока, которые берутся из study_map.json по ссылке source.
 * В «тонком» режиме (по умолчанию) в courses.json не копируются:
 * study_map.json приложение и так загружает, дублировать прозу второй раз
 * незачем — это +49% к размеру файла и второй источник истины.
 * Флаг --fat включает копирование, если понадобится автономный файл.
 */
const LESSON_TEXT_FIELDS = ['level', 'objective', 'expectedResult', 'practice', 'pitfalls', 'article'];

/**
 * План курсов: как 32 недели группируются.
 * weeks — номера недель study_map в порядке прохождения.
 * topics — темы из mainTopics/topic, по которым к курсу привязываются
 *          симуляторы, лабы «найди баг» и внешние задания.
 */
const COURSE_PLAN = [
  {
    id: 'crs_linux_base', slug: 'linux-base', category: 'Linux', level: 'Старт',
    title: 'Linux: файлы, права, процессы, bash',
    summary: 'Навигация и файловая система, права и владельцы, процессы, systemd, journalctl, SSH и первые bash-скрипты для рутинных задач.',
    weeks: [1, 3, 5], topics: ['Linux']
  },
  {
    id: 'crs_net_base', slug: 'networking-base', category: 'Сети', level: 'Старт',
    title: 'Сети для DevOps: TCP/IP, DNS, HTTP',
    summary: 'Как пакет доходит до сервиса: адресация и CIDR, DNS, HTTP и разбор запросов через curl.',
    weeks: [2], topics: ['Сети']
  },
  {
    id: 'crs_git', slug: 'git', category: 'Git', level: 'Старт',
    title: 'Git и командный workflow',
    summary: 'Коммиты, ветки, конфликты, review и принятые в командах модели работы с GitHub и GitLab.',
    weeks: [4], topics: ['Git']
  },
  {
    id: 'crs_docker', slug: 'docker', category: 'Docker', level: 'Практика',
    title: 'Docker: контейнеры, образы, Compose',
    summary: 'Запуск и жизненный цикл контейнеров, Dockerfile и слои, многосервисные окружения через Compose, reverse proxy и TLS.',
    weeks: [6, 7, 8], topics: ['Docker']
  },
  {
    id: 'crs_cicd', slug: 'cicd', category: 'CI/CD', level: 'Практика',
    title: 'CI/CD: pipeline, деплой, откат',
    summary: 'Сборка и публикация артефактов, registry, стадии пайплайна, деплой и стратегия откатов.',
    weeks: [9, 10], topics: ['CI/CD']
  },
  {
    id: 'crs_terraform', slug: 'terraform', category: 'IaC', level: 'Практика',
    title: 'Terraform/OpenTofu: инфраструктура как код',
    summary: 'Ресурсы и state, plan до apply, модули, remote state и работа с облаком на примере Yandex Cloud.',
    weeks: [11, 12], topics: ['Terraform']
  },
  {
    id: 'crs_ansible', slug: 'ansible', category: 'IaC', level: 'Практика',
    title: 'Ansible: конфигурация серверов и роли',
    summary: 'Inventory и playbooks, идемпотентность, роли и шаблоны, vault для секретов, обновление без простоя.',
    weeks: [13, 14], topics: ['Ansible']
  },
  {
    id: 'crs_postgres', slug: 'postgresql', category: 'Database', level: 'Практика',
    title: 'PostgreSQL для DevOps',
    summary: 'Что нужно знать о базе эксплуатирующему её инженеру: подключения, запросы, WAL, PITR и основы репликации.',
    weeks: [15, 16], topics: ['PostgreSQL', 'Database']
  },
  {
    id: 'crs_k8s', slug: 'kubernetes', category: 'Kubernetes', level: 'Практика',
    title: 'Kubernetes: основы, сеть, надёжность',
    summary: 'Pods, Deployments, Services и ConfigMaps, сетевая модель, Ingress и Gateway API, probes, rollout и Helm.',
    weeks: [17, 18, 19], topics: ['Kubernetes']
  },
  {
    id: 'crs_observability', slug: 'observability', category: 'Monitoring', level: 'Практика',
    title: 'Мониторинг, логи и GitOps',
    summary: 'Prometheus и VictoriaMetrics, Argo CD, логи через Loki и Alloy, OpenTelemetry, алерты и реакция на инциденты.',
    weeks: [20, 21, 22], topics: ['Monitoring']
  },
  {
    id: 'crs_security', slug: 'security', category: 'Security', level: 'Практика',
    title: 'Security и supply chain',
    summary: 'Секреты, доступы, уязвимости образов и зависимостей, подписи артефактов и защита цепочки поставки.',
    weeks: [23], topics: ['Security']
  },
  {
    id: 'crs_capstone_service', slug: 'capstone-service', category: 'DevOps', level: 'Вызов',
    title: 'Capstone: production-like сервис',
    summary: 'Сквозной проект: собрать сервис с контейнерами, пайплайном, мониторингом и документацией.',
    weeks: [24], topics: []
  },
  {
    id: 'crs_net_prod', slug: 'networking-production', category: 'Сети', level: 'Вызов',
    title: 'Production networking и HA edge',
    summary: 'VPN и маршрутизация, firewall, балансировка нагрузки, HAProxy, Keepalived и VRRP на границе инфраструктуры.',
    weeks: [25, 26], topics: []
  },
  {
    id: 'crs_postgres_prod', slug: 'postgresql-production', category: 'Database', level: 'Вызов',
    title: 'PostgreSQL в production',
    summary: 'Репликация и переключение, миграции без простоя, производительность и разбор медленных запросов.',
    weeks: [27, 28], topics: []
  },
  {
    id: 'crs_k8s_prod', slug: 'kubernetes-production', category: 'Kubernetes', level: 'Вызов',
    title: 'Self-managed Kubernetes',
    summary: 'Архитектура кластера и etcd, хранилище через CSI, Longhorn и Ceph, отказоустойчивые нагрузки.',
    weeks: [29, 30], topics: []
  },
  {
    id: 'crs_incidents', slug: 'incident-management', category: 'Monitoring', level: 'Вызов',
    title: 'Observability и управление инцидентами',
    summary: 'Внешний мониторинг, дежурства, разбор инцидентов и постмортемы без поиска виноватых.',
    weeks: [31], topics: []
  },
  {
    id: 'crs_capstone_prod', slug: 'capstone-production', category: 'DevOps', level: 'Вызов',
    title: 'Production capstone',
    summary: 'Финальный проект уровня production: отказоустойчивость, наблюдаемость, безопасность и защита решения.',
    weeks: [32], topics: []
  }
];

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(TASKS_DIR, name), 'utf8'));
}

function slugChapterId(courseSlug, suffix) {
  return 'ch_' + courseSlug.replace(/-/g, '_') + '_' + suffix;
}

/**
 * Заполняет requiresCourses — связь «этот курс опирается на тот».
 *
 * Два способа, в порядке приоритета:
 *   text       — в prerequisites первой недели упомянут номер недели
 *                («Стенд из недели 8 ...»), и эта неделя принадлежит другому курсу;
 *   week-order — ссылок в тексте нет, берём курс, которому принадлежит
 *                предыдущая неделя (первая неделя курса минус один).
 *
 * Текст prerequisites при этом не переписывается: он остаётся как есть,
 * а UI показывает рядом явную связь с курсом.
 */
function linkCourses(courses) {
  const weekToCourse = new Map();
  courses.forEach((course) => {
    course.weeks.forEach((week) => weekToCourse.set(week, course));
  });

  courses.forEach((course) => {
    const firstWeek = Math.min.apply(null, course.weeks);
    const own = new Set(course.weeks);
    const found = new Map();

    course.prerequisites.forEach((text) => {
      // «из недели 8», «недели 25-31», «нед. 3»
      // ВНИМАНИЕ: \w в JS — это [A-Za-z0-9_], кириллицу он НЕ покрывает
      // (в отличие от Python 3, где \w по умолчанию unicode-aware).
      // С «недел\w*» окончание «-и» не съедалось и все ссылки терялись молча.
      const pattern = /недел[а-яё]*\s*(\d+)(?:\s*[-–—]\s*(\d+))?|нед\.\s*(\d+)/gi;
      let match = pattern.exec(text);
      while (match) {
        const from = Number(match[1] || match[3]);
        const to = Number(match[2] || match[1] || match[3]);
        for (let week = from; week <= to; week += 1) {
          const source = weekToCourse.get(week);
          if (source && source.id !== course.id && !own.has(week)) {
            found.set(source.id, { courseId: source.id, slug: source.slug, title: source.title, derivedFrom: 'text' });
          }
        }
        match = pattern.exec(text);
      }
    });

    if (!found.size) {
      const previous = weekToCourse.get(firstWeek - 1);
      if (previous && previous.id !== course.id) {
        found.set(previous.id, {
          courseId: previous.id, slug: previous.slug, title: previous.title, derivedFrom: 'week-order'
        });
      }
    }

    course.requiresCourses = Array.from(found.values());
  });
}

function buildCourses(options) {
  const fat = !!(options && options.fat);
  const studyMap = readJson('study_map.json');
  const studyTests = readJson('study_tests.json');
  const seniorCases = readJson('senior_cases.json');
  const simulators = readJson('ts.json');
  const fixBugLabs = readJson('labs.json');
  const externalTasks = readJson('external_tasks.json');

  const weekById = new Map(studyMap.weeks.map((w) => [w.week, w]));
  const miniById = new Map(studyTests.miniTests.map((t) => [t.id, t]));
  const weeklyByWeek = new Map(studyTests.weeklyTests.map((t) => [t.week, t]));

  const casesByWeekDay = new Map();
  seniorCases.cases.forEach((c) => {
    const key = c.week + ':' + c.day;
    if (!casesByWeekDay.has(key)) casesByWeekDay.set(key, []);
    casesByWeekDay.get(key).push(c);
  });

  const courseByTopic = new Map();
  COURSE_PLAN.forEach((course) => {
    (course.topics || []).forEach((topic) => {
      if (!courseByTopic.has(topic)) courseByTopic.set(topic, course.id);
    });
  });

  const courseIds = new Set(COURSE_PLAN.map((c) => c.id));
  Object.keys(SIMULATOR_OVERRIDES).forEach((key) => {
    const target = SIMULATOR_OVERRIDES[key];
    if (!courseIds.has(target)) {
      throw new Error('SIMULATOR_OVERRIDES: неизвестный курс "' + target + '" для сценария ' + key);
    }
  });

  const extrasByCourse = new Map(COURSE_PLAN.map((c) => [c.id, []]));
  function pushExtra(topic, chapter, forcedCourseId) {
    const courseId = forcedCourseId || courseByTopic.get(topic);
    if (!courseId) {
      chapter.unassignedTopic = topic;
      return false;
    }
    extrasByCourse.get(courseId).push(chapter);
    return true;
  }

  const unassigned = { simulators: [], fixBugLabs: [], externalTasks: [] };
  const overridesApplied = [];

  simulators.forEach((sim) => {
    const forced = SIMULATOR_OVERRIDES[sim.id];
    const chapter = {
      type: 'simulator', title: 'Симулятор: ' + sim.title,
      source: { dataset: 'ts.json', id: sim.id }, topic: sim.topic,
      minutes: MINUTES.simulator
    };
    // Тема аналитики (topic) и тема каталога могут расходиться — см. SIMULATOR_OVERRIDES.
    if (forced) {
      chapter.catalogCourseId = forced;
      overridesApplied.push(sim.id + ' «' + sim.title + '» ' + sim.topic + ' -> ' + forced);
    }
    if (!pushExtra(sim.topic, chapter, forced)) unassigned.simulators.push(sim.title + ' [' + sim.topic + ']');
  });

  fixBugLabs.forEach((lab) => {
    const chapter = {
      type: 'lab', kind: 'fix-bug', title: 'Лаб. работа: ' + lab.title,
      source: { dataset: 'labs.json', id: lab.id }, topic: lab.topic,
      minutes: MINUTES.lab
    };
    if (!pushExtra(lab.topic, chapter)) unassigned.fixBugLabs.push(lab.title + ' [' + lab.topic + ']');
  });

  externalTasks.tasks.forEach((task) => {
    const chapter = {
      type: 'lab', kind: 'external', title: 'Задание с доказательством: ' + task.title,
      source: { dataset: 'external_tasks.json', id: task.id }, topic: task.topic,
      difficulty: task.difficulty, minutes: MINUTES.lab
    };
    if (!pushExtra(task.topic, chapter)) unassigned.externalTasks.push(task.title + ' [' + task.topic + ']');
  });

  const usedMiniIds = new Set();
  const usedWeeklyWeeks = new Set();
  const usedCaseIds = new Set();
  const seenWeeks = new Set();

  const courses = COURSE_PLAN.map((plan, courseIndex) => {
    const chapters = [];
    const weeks = plan.weeks.slice().sort((a, b) => a - b);

    weeks.forEach((weekNumber) => {
      const week = weekById.get(weekNumber);
      if (!week) throw new Error('Неделя ' + weekNumber + ' отсутствует в study_map.json');
      if (seenWeeks.has(weekNumber)) throw new Error('Неделя ' + weekNumber + ' назначена дважды');
      seenWeeks.add(weekNumber);

      (week.days || []).forEach((day) => {
        const lesson = {
          id: slugChapterId(plan.slug, 'w' + weekNumber + 'd' + day.day),
          type: 'lesson',
          title: day.title,
          week: weekNumber,
          day: day.day,
          minutes: MINUTES.lesson,
          source: { dataset: 'study_map.json', week: weekNumber, day: day.day },
          legacyProgressKey: 'w' + weekNumber + 'd' + day.day
        };
        if (fat) {
          // --fat: копия текста для автономного файла. По умолчанию выключено,
          // UI читает те же поля из study_map.json по ссылке source.
          lesson.level = day.level || week.targetLevel || '';
          lesson.objective = day.objective || '';
          lesson.expectedResult = day.expectedResult || '';
          lesson.practice = day.practice || [];
          lesson.pitfalls = day.pitfalls || [];
          lesson.article = null; // прозы уроков пока нет, UI показывает конспект
        }
        chapters.push(lesson);

        if (day.miniTestId) {
          if (!miniById.has(day.miniTestId)) {
            throw new Error('Битая ссылка miniTestId: ' + day.miniTestId);
          }
          usedMiniIds.add(day.miniTestId);
          chapters.push({
            id: slugChapterId(plan.slug, 'w' + weekNumber + 'd' + day.day + '_test'),
            type: 'test',
            kind: 'mini',
            title: 'Проверка: ' + (miniById.get(day.miniTestId).title || day.title),
            week: weekNumber,
            day: day.day,
            minutes: MINUTES.test,
            source: { dataset: 'study_tests.json', collection: 'miniTests', id: day.miniTestId }
          });
        }

        (casesByWeekDay.get(weekNumber + ':' + day.day) || []).forEach((c) => {
          usedCaseIds.add(c.id);
          chapters.push({
            id: slugChapterId(plan.slug, 'case_' + String(c.id).replace(/[^a-z0-9]+/gi, '_')),
            type: 'lab',
            kind: 'incident',
            title: 'Инцидент: ' + c.title,
            week: weekNumber,
            day: day.day,
            level: c.level || '',
            topic: c.topic || '',
            minutes: MINUTES.lab,
            source: { dataset: 'senior_cases.json', id: c.id }
          });
        });
      });

      const weekly = weeklyByWeek.get(weekNumber);
      if (weekly) {
        usedWeeklyWeeks.add(weekNumber);
        chapters.push({
          id: slugChapterId(plan.slug, 'w' + weekNumber + '_weekly'),
          type: 'test',
          kind: 'weekly',
          title: weekly.title,
          week: weekNumber,
          maxScore: weekly.maxScore,
          minutes: MINUTES.weekly,
          source: { dataset: 'study_tests.json', collection: 'weeklyTests', id: weekly.id }
        });
      }
    });

    (extrasByCourse.get(plan.id) || []).forEach((extra, i) => {
      chapters.push(Object.assign({
        id: slugChapterId(plan.slug, 'extra_' + (i + 1))
      }, extra));
    });

    chapters.forEach((chapter, i) => { chapter.order = i + 1; });

    const stats = { lesson: 0, test: 0, lab: 0, simulator: 0 };
    let minutes = 0;
    chapters.forEach((c) => {
      stats[c.type] = (stats[c.type] || 0) + 1;
      minutes += c.minutes || 0;
    });

    const firstWeek = weekById.get(weeks[0]);
    return {
      id: plan.id,
      slug: plan.slug,
      order: courseIndex + 1,
      title: plan.title,
      category: plan.category,
      level: plan.level,
      summary: plan.summary,
      weeks: weeks,
      targetLevel: firstWeek.targetLevel || '',
      // Текст условий входа взят из study_map как есть и может ссылаться
      // на номера недель. Связь курс->курс считается отдельно в linkCourses().
      prerequisites: firstWeek.prerequisites || [],
      requiresCourses: [],
      goals: weeks.map((n) => weekById.get(n).goal).filter(Boolean),
      artifacts: weeks.map((n) => weekById.get(n).artifact).filter(Boolean),
      chapterCount: chapters.length,
      stats: stats,
      estimatedMinutes: minutes,
      unlock: 'sequential',
      chapters: chapters
    };
  });

  linkCourses(courses);

  const report = {
    simulatorOverrides: overridesApplied,
    requiresFromText: courses.filter((c) => c.requiresCourses.some((r) => r.derivedFrom === 'text')).length,
    requiresFromOrder: courses.filter((c) => c.requiresCourses.some((r) => r.derivedFrom === 'week-order')).length,
    coursesWithoutRequires: courses.filter((c) => !c.requiresCourses.length).map((c) => c.title),
    weeksAssigned: seenWeeks.size,
    weeksTotal: studyMap.weeks.length,
    miniTestsUsed: usedMiniIds.size,
    miniTestsTotal: studyTests.miniTests.length,
    weeklyTestsUsed: usedWeeklyWeeks.size,
    weeklyTestsTotal: studyTests.weeklyTests.length,
    seniorCasesUsed: usedCaseIds.size,
    seniorCasesTotal: seniorCases.cases.length,
    unassigned: unassigned
  };

  return {
    doc: {
      schemaVersion: SCHEMA_VERSION,
      title: 'Каталог курсов Interview Prep Max',
      language: 'ru',
      status: 'draft',
      generatedBy: 'scripts/generate-courses.js',
      curriculumVersion: studyMap.version,
      note: 'Черновик. Файл сгенерирован из существующих данных и не подключён к приложению.',
      courseCount: courses.length,
      chapterCount: courses.reduce((sum, c) => sum + c.chapterCount, 0),
      courses: courses
    },
    report: report
  };
}

/**
 * Проверяет, что каждая ссылка source действительно находит запись
 * в исходном датасете. В тонком режиме это единственная гарантия,
 * что глава не окажется пустой в интерфейсе.
 */
function checkResolvable(doc) {
  const studyMap = readJson('study_map.json');
  const studyTests = readJson('study_tests.json');
  const seniorCases = readJson('senior_cases.json');
  const simulators = readJson('ts.json');
  const fixBugLabs = readJson('labs.json');
  const externalTasks = readJson('external_tasks.json');

  const days = new Set();
  studyMap.weeks.forEach((w) => (w.days || []).forEach((d) => days.add(w.week + ':' + d.day)));
  const mini = new Set(studyTests.miniTests.map((t) => t.id));
  const weekly = new Set(studyTests.weeklyTests.map((t) => t.id));
  const cases = new Set(seniorCases.cases.map((c) => c.id));
  const sims = new Set(simulators.map((s) => s.id));
  const labs = new Set(fixBugLabs.map((l) => l.id));
  const external = new Set(externalTasks.tasks.map((t) => t.id));

  const broken = [];
  let checked = 0;

  doc.courses.forEach((course) => {
    course.chapters.forEach((chapter) => {
      const source = chapter.source;
      checked += 1;
      let ok = false;
      if (source.dataset === 'study_map.json') {
        ok = days.has(source.week + ':' + source.day);
      } else if (source.dataset === 'study_tests.json') {
        ok = source.collection === 'weeklyTests' ? weekly.has(source.id) : mini.has(source.id);
      } else if (source.dataset === 'senior_cases.json') {
        ok = cases.has(source.id);
      } else if (source.dataset === 'ts.json') {
        ok = sims.has(source.id);
      } else if (source.dataset === 'labs.json') {
        ok = labs.has(source.id);
      } else if (source.dataset === 'external_tasks.json') {
        ok = external.has(source.id);
      }
      if (!ok) broken.push(chapter.id + ' -> ' + source.dataset + ' ' + JSON.stringify(source));
    });
  });

  return { checked: checked, broken: broken };
}

function pad(value, width) {
  const text = String(value);
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

function padLeft(value, width) {
  const text = String(value);
  return text.length >= width ? text : ' '.repeat(width - text.length) + text;
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const fat = process.argv.includes('--fat');
  const built = buildCourses({ fat: fat });
  const doc = built.doc;
  const report = built.report;

  console.log('КУРС                                            НЕДЕЛИ        ГЛАВ  УРОК  ТЕСТ   ЛАБ   СИМ   ЧАСЫ');
  console.log('-'.repeat(103));
  doc.courses.forEach((c) => {
    console.log(
      pad(c.title, 47) + ' ' +
      pad(c.weeks.join(','), 13) + ' ' +
      padLeft(c.chapterCount, 4) + '  ' +
      padLeft(c.stats.lesson || 0, 4) + '  ' +
      padLeft(c.stats.test || 0, 4) + '  ' +
      padLeft(c.stats.lab || 0, 4) + '  ' +
      padLeft(c.stats.simulator || 0, 4) + '  ' +
      padLeft((c.estimatedMinutes / 60).toFixed(1), 5)
    );
  });
  console.log('-'.repeat(103));
  console.log('ИТОГО: ' + doc.courseCount + ' курсов, ' + doc.chapterCount + ' глав, ' +
    (doc.courses.reduce((s, c) => s + c.estimatedMinutes, 0) / 60).toFixed(0) + ' часов');

  console.log('');
  console.log('ПОКРЫТИЕ ДАННЫХ');
  const checks = [
    ['недели study_map', report.weeksAssigned, report.weeksTotal],
    ['мини-тесты', report.miniTestsUsed, report.miniTestsTotal],
    ['недельные тесты', report.weeklyTestsUsed, report.weeklyTestsTotal],
    ['senior-кейсы', report.seniorCasesUsed, report.seniorCasesTotal]
  ];
  let failed = 0;
  checks.forEach(([name, used, total]) => {
    const ok = used === total;
    if (!ok) failed += 1;
    console.log('  ' + (ok ? 'OK  ' : 'FAIL') + ' ' + pad(name, 20) + used + ' / ' + total);
  });

  Object.keys(report.unassigned).forEach((key) => {
    const items = report.unassigned[key];
    if (items.length) {
      failed += 1;
      console.log('  FAIL не привязано (' + key + '): ' + items.join('; '));
    }
  });

  const ids = new Set();
  let duplicates = 0;
  doc.courses.forEach((c) => c.chapters.forEach((ch) => {
    if (ids.has(ch.id)) duplicates += 1;
    ids.add(ch.id);
  }));
  console.log('  ' + (duplicates ? 'FAIL' : 'OK  ') + ' уникальность id глав: ' + ids.size + ' id, дублей ' + duplicates);
  if (duplicates) failed += 1;

  // Тонкий режим: текста в файле нет, поэтому каждая ссылка source обязана
  // резолвиться в исходных датасетах — иначе UI покажет пустую главу.
  const resolve = checkResolvable(doc);
  console.log('  ' + (resolve.broken.length ? 'FAIL' : 'OK  ') +
    ' резолв ссылок source: ' + resolve.checked + ' проверено, битых ' + resolve.broken.length);
  resolve.broken.slice(0, 10).forEach((b) => console.log('        -> ' + b));
  if (resolve.broken.length) failed += 1;

  const fatLessons = doc.courses.reduce((sum, c) =>
    sum + c.chapters.filter((ch) => ch.type === 'lesson' && ch.objective !== undefined).length, 0);
  console.log('  OK   режим: ' + (fat ? 'толстый (--fat), копий текста: ' + fatLessons : 'тонкий, копий текста: 0'));

  console.log('');
  console.log('СВЯЗИ КУРСОВ');
  console.log('  из текста prerequisites: ' + report.requiresFromText +
    ' | по порядку недель: ' + report.requiresFromOrder +
    ' | без зависимостей: ' + report.coursesWithoutRequires.length +
    (report.coursesWithoutRequires.length ? ' (' + report.coursesWithoutRequires.join(', ') + ')' : ''));
  doc.courses.forEach((c) => {
    if (!c.requiresCourses.length) return;
    console.log('  ' + pad(c.title, 44) + ' <- ' +
      c.requiresCourses.map((r) => r.title + ' [' + r.derivedFrom + ']').join(', '));
  });

  if (report.simulatorOverrides.length) {
    console.log('');
    console.log('ПРИВЯЗКА СИМУЛЯТОРОВ ВРУЧНУЮ (ts.json не изменён)');
    report.simulatorOverrides.forEach((line) => console.log('  ' + line));
  }

  if (dryRun) {
    console.log('');
    console.log('--dry-run: файл не записан');
  } else {
    fs.writeFileSync(OUTPUT, JSON.stringify(doc, null, 2) + '\n', 'utf8');
    console.log('');
    console.log('Записано: tasks/courses.json (' + fs.statSync(OUTPUT).size + ' байт)');
  }

  if (failed) {
    console.error('');
    console.error('Проверки не пройдены: ' + failed);
    process.exit(1);
  }
}

// Запуск только как CLI. При require из теста main() не должен срабатывать,
// иначе тест перезапишет tasks/courses.json и напечатает отчёт в вывод тестов.
if (require.main === module) {
  main();
}

module.exports = { buildCourses, checkResolvable, linkCourses, COURSE_PLAN, SIMULATOR_OVERRIDES, LESSON_TEXT_FIELDS };
