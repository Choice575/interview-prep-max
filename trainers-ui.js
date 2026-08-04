(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IPMaxTrainersUI = api;
})(typeof self !== 'undefined' ? self : globalThis, function() {
  'use strict';

  // One catalogue entry per trainer. The sidebar used to list these as eleven
  // flat items named "Код", "Порты", "Debugging" — labels that say nothing about
  // what you actually practise there. Here every card carries the skill it
  // trains and the shape of the task, so the choice is obvious without clicking.
  const TRAINERS = [
    {
      id: 'ts', page: 'ts', icon: '🚨', title: 'Разбор аварий',
      skill: 'Диагностика продакшена по шагам',
      task: 'Сценарий с логами: выбираете следующее действие и видите последствия',
      group: 'Диагностика', topic: 'Linux', progressKey: 'ts_scores', datasetKey: 'ts'
    },
    {
      id: 'labs', page: 'labs', icon: '🔬', title: 'Чтение логов и манифестов',
      skill: 'Находить причину по выводу команды',
      task: 'Лог или YAML с проблемой — определить, что сломано',
      group: 'Диагностика', topic: 'Kubernetes', progressKey: 'labs_prog', datasetKey: 'labs'
    },
    {
      id: 'code', page: 'code', icon: '🐛', title: 'Поиск ошибки в скрипте',
      skill: 'Code review глазами дежурного',
      task: 'Сниппет bash или Python — найти дефект',
      group: 'Диагностика', topic: 'Linux', progressKey: 'code_prog', datasetKey: 'code'
    },
    {
      id: 'subnet', page: 'subnet', icon: '🌐', title: 'Расчёт подсетей',
      skill: 'CIDR, маски и диапазоны хостов без калькулятора',
      task: 'Дан адрес с префиксом — посчитать сеть, broadcast и хосты',
      group: 'Сети', topic: 'Сети', progressKey: 'subnet_prog', datasetKey: 'subnet'
    },
    {
      id: 'ports', page: 'ports', icon: '🔌', title: 'Порты сервисов',
      skill: 'Помнить, что где слушает',
      task: 'Назвать TCP-порт по имени сервиса',
      group: 'Сети', topic: 'Сети', progressKey: 'pt_prog', datasetKey: 'ports'
    },
    {
      id: 'cmd', page: 'cmd', icon: '💻', title: 'Выбор команды',
      skill: 'Правильный флаг с первого раза',
      task: 'Задача одной строкой — выбрать верную команду',
      group: 'Командная строка', topic: 'Linux', progressKey: 'cmd_prog', datasetKey: 'cmd'
    },
    {
      id: 'git', page: 'git', icon: '🔀', title: 'Git на практике',
      skill: 'Ветки, откаты и разбор конфликтов',
      task: 'Ситуация в репозитории — выбрать команду',
      group: 'Командная строка', topic: 'Git', progressKey: 'git_prog', datasetKey: 'git'
    },
    {
      id: 'regex', page: 'regex', icon: '🔍', title: 'Регулярные выражения',
      skill: 'Фильтровать логи не наугад',
      task: 'Нужно поймать строку — выбрать выражение',
      group: 'Командная строка', topic: 'Linux', progressKey: 'regex_prog', datasetKey: 'regex'
    },
    {
      id: 'dockerfile', page: 'dockerfile', icon: '🐳', title: 'Разбор Dockerfile',
      skill: 'Слои, кеш и безопасность образа',
      task: 'Dockerfile с дефектом — найти и объяснить',
      group: 'Инфраструктура как код', topic: 'Docker', progressKey: 'df_prog', datasetKey: 'dockerfile'
    },
    {
      id: 'k8s', page: 'k8s', icon: '☸️', title: 'Разбор манифестов K8s',
      skill: 'Probes, лимиты и селекторы',
      task: 'Манифест с ошибкой — найти причину отказа',
      group: 'Инфраструктура как код', topic: 'Kubernetes', progressKey: 'k8s_prog', datasetKey: 'k8s'
    },
    {
      id: 'ansible', page: 'ansible', icon: '📦', title: 'Разбор плейбуков',
      skill: 'Идемпотентность и модули вместо shell',
      task: 'Плейбук с дефектом — найти и исправить',
      group: 'Инфраструктура как код', topic: 'Ansible', progressKey: 'ans_prog', datasetKey: 'ansible_pb'
    }
  ];

  const GROUPS = ['Диагностика', 'Сети', 'Командная строка', 'Инфраструктура как код'];

  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function asObject(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  function countKeys(value) { return Object.keys(asObject(value)).length; }

  /**
   * Progress per trainer. `total` comes from the loaded dataset rather than a
   * hardcoded number, so adding tasks to a JSON file cannot silently produce
   * "12 / 10 solved".
   */
  function buildStatus(input) {
    const state = asObject(input);
    const progress = asObject(state.progress);
    const totals = asObject(state.totals);
    return TRAINERS.map(trainer => {
      const done = countKeys(progress[trainer.progressKey]);
      const total = Math.max(0, Number(totals[trainer.datasetKey]) || 0);
      const capped = total ? Math.min(done, total) : done;
      return {
        ...trainer,
        done: capped,
        total,
        // No dataset yet (still loading, or the file failed): show it as
        // unavailable instead of a misleading 0 %.
        available: total > 0,
        percent: total ? Math.round(capped / total * 100) : 0,
        started: capped > 0,
        finished: total > 0 && capped >= total
      };
    });
  }

  function summarise(statuses) {
    const list = Array.isArray(statuses) ? statuses : [];
    const available = list.filter(item => item.available);
    const done = available.reduce((sum, item) => sum + item.done, 0);
    const total = available.reduce((sum, item) => sum + item.total, 0);
    return {
      trainers: available.length,
      finished: available.filter(item => item.finished).length,
      done,
      total,
      percent: total ? Math.round(done / total * 100) : 0
    };
  }

  /** Ranks what to open next: unfinished but started first, then untouched. */
  function suggest(statuses) {
    const list = (Array.isArray(statuses) ? statuses : []).filter(item => item.available && !item.finished);
    if (!list.length) return null;
    const started = list.filter(item => item.started).sort((left, right) => right.percent - left.percent);
    if (started.length) return started[0];
    return list[0];
  }

  function renderCard(status) {
    const item = asObject(status);
    const state = item.finished ? 'done' : item.started ? 'active' : 'new';
    const badge = !item.available ? 'нет данных'
      : item.finished ? '✓ пройден'
        : item.started ? item.done + ' из ' + item.total
          : 'не начат';
    return '<button type="button" class="tr-card tr-' + state + '"'
      + (item.available ? '' : ' disabled aria-disabled="true"')
      + ' data-trainer-page="' + escapeHtml(item.page) + '">'
      + '<span class="tr-icon" aria-hidden="true">' + escapeHtml(item.icon) + '</span>'
      + '<span class="tr-body">'
      + '<span class="tr-title-row"><span class="tr-title">' + escapeHtml(item.title) + '</span>'
      + '<span class="tr-badge">' + escapeHtml(badge) + '</span></span>'
      + '<span class="tr-skill">' + escapeHtml(item.skill) + '</span>'
      + '<span class="tr-task">' + escapeHtml(item.task) + '</span>'
      + '<span class="tr-bar"><span class="tr-bar-fill" style="width:' + (Number(item.percent) || 0) + '%"></span></span>'
      + '</span>'
      + '</button>';
  }

  /** The hub page: four labelled groups instead of eleven cryptic menu items. */
  function renderHub(statuses) {
    const list = Array.isArray(statuses) ? statuses : [];
    const summary = summarise(list);
    const next = suggest(list);
    const groups = GROUPS.map(group => {
      const items = list.filter(item => item.group === group);
      if (!items.length) return '';
      const finished = items.filter(item => item.finished).length;
      return '<section class="tr-group">'
        + '<h3 class="tr-group-title">' + escapeHtml(group)
        + '<span>' + finished + '/' + items.length + '</span></h3>'
        + '<div class="tr-grid">' + items.map(renderCard).join('') + '</div>'
        + '</section>';
    }).join('');
    const hint = next
      ? '<button type="button" class="tr-next" data-trainer-page="' + escapeHtml(next.page) + '">'
        + '<span class="tr-next-kicker">Продолжить здесь</span>'
        + '<span class="tr-next-title">' + escapeHtml(next.icon) + ' ' + escapeHtml(next.title) + '</span>'
        + '<span class="tr-next-meta">' + escapeHtml(next.skill) + '</span>'
        + '</button>'
      : '<div class="tr-next tr-next-done"><span class="tr-next-kicker">Все тренажёры пройдены</span>'
        + '<span class="tr-next-meta">Возвращайтесь к ним через повторения в разделе «Экзамен»</span></div>';
    return '<div class="tr-hub">'
      + '<section class="tr-summary">'
      + '<div class="tr-summary-main">'
      + '<div class="tr-summary-score">' + summary.percent + '<span>%</span></div>'
      + '<div class="tr-summary-copy"><b>Практика на тренажёрах</b>'
      + '<span>' + summary.done + ' из ' + summary.total + ' заданий · '
      + summary.finished + ' из ' + summary.trainers + ' тренажёров пройдено</span></div>'
      + '</div>'
      + hint
      + '</section>'
      + groups
      + '</div>';
  }

  function create(services, environment) {
    const source = asObject(services);
    const env = asObject(environment);
    const doc = env.document || (typeof document !== 'undefined' ? document : null);
    const run = (name, ...args) => (typeof source[name] === 'function' ? source[name](...args) : undefined);

    function statuses() {
      return buildStatus({ progress: run('getProgress'), totals: run('getTotals') });
    }

    function render() {
      const host = doc ? doc.getElementById('trainers-host') : null;
      if (!host) return null;
      const list = statuses();
      host.innerHTML = renderHub(list);
      host.querySelectorAll('[data-trainer-page]').forEach(button => {
        button.addEventListener('click', () => run('navigate', button.getAttribute('data-trainer-page')));
      });
      return list;
    }

    return { render, statuses };
  }

  return { TRAINERS, GROUPS, buildStatus, summarise, suggest, renderCard, renderHub, create };
});
