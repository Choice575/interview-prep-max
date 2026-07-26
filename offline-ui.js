(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IPMaxOfflineUI = api;
})(typeof self !== 'undefined' ? self : globalThis, function() {
  // Which user-facing section stops working when a dataset is missing offline.
  const DATASET_SECTIONS = {
    'base_questions': 'Экзамен',
    'study_map': 'Учёба',
    'study_tests': 'Учёба',
    'senior_cases': 'Учёба',
    'best_practices': 'Best Practices',
    'incidents': 'Инциденты',
    'tips': 'Советы',
    'labs': 'Debugging',
    'subnet': 'Подсети',
    'ts': 'Диагностика',
    'cmd': 'Команды',
    'code': 'Код',
    'git': 'Git',
    'regex': 'Regex',
    'ansible_pb': 'Ansible',
    'dockerfile': 'Dockerfile',
    'k8s': 'K8s YAML',
    'ports': 'Порты'
  };

  function escapeText(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function isDataset(asset) {
    return String(asset || '').startsWith('./tasks/');
  }

  function sectionFor(asset) {
    const match = String(asset || '').match(/^\.\/tasks\/(.+)\.json$/);
    return match ? DATASET_SECTIONS[match[1]] || null : null;
  }

  function buildReport(results) {
    const list = Array.isArray(results) ? results : [];
    const missing = list.filter(entry => entry && !entry.cached).map(entry => entry.asset);
    const cached = list.length - missing.length;
    const affected = [...new Set(missing.map(sectionFor).filter(Boolean))];
    return {
      total: list.length,
      cached,
      percent: list.length ? Math.round(cached / list.length * 100) : 0,
      ready: list.length > 0 && missing.length === 0,
      shellReady: missing.every(isDataset),
      missing,
      affected
    };
  }

  function renderReport(report) {
    const summary = report.ready
      ? 'Приложение полностью работает офлайн.'
      : report.shellReady
        ? 'Основной интерфейс доступен офлайн, но часть разделов не загрузится.'
        : 'Основные файлы приложения не закешированы — офлайн-запуск не гарантирован.';

    const missingList = report.missing.length
      ? '<div class="offline-missing"><div class="offline-subtitle">Не закешировано (' + report.missing.length + ')</div><ul>' +
        report.missing.map(asset => '<li><code>' + escapeText(asset) + '</code></li>').join('') +
        '</ul></div>'
      : '';

    const affectedList = report.affected.length
      ? '<div class="offline-affected"><div class="offline-subtitle">Разделы под риском</div><p>' +
        report.affected.map(escapeText).join(', ') + '</p></div>'
      : '';

    const hint = report.ready
      ? ''
      : '<p class="offline-hint">Откройте эти разделы при активном интернете или нажмите «Обновить кеш», чтобы догрузить файлы.</p>';

    return '<div class="offline-report" role="status" aria-live="polite">' +
      '<div class="offline-headline">' + report.percent + '% · ' + report.cached + ' из ' + report.total + '</div>' +
      '<p class="offline-summary">' + escapeText(summary) + '</p>' +
      affectedList + missingList + hint +
      '</div>';
  }

  return { DATASET_SECTIONS, buildReport, renderReport, sectionFor, isDataset };
});
