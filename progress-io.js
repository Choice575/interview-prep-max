(function(root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IPMaxProgressIO = api;
})(typeof self !== 'undefined' ? self : globalThis, function(root) {
  const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
  const IMPORT_MAX_DEPTH = 10;
  const IMPORT_MAX_NODES = 50000;
  const IMPORT_RECORD_KEYS = [
    'mistakes', 'stats', 'qprog', 'ts_scores', 'cmd_prog', 'code_prog', 'subnet_prog', 'git_prog',
    'regex_prog', 'ans_prog', 'df_prog', 'k8s_prog', 'pt_prog', 'labs_prog', 'daily', 'study_progress',
    'study_answers', 'senior_case_prog', 'coach_control'
  ];
  const IMPORT_ARRAY_KEYS = ['history', 'custom', 'skill_events', 'coach_journal'];

  function isRecord(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function byteLength(value) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).length;
    if (typeof Buffer !== 'undefined') return Buffer.byteLength(value, 'utf8');
    return unescape(encodeURIComponent(value)).length;
  }

  function validateBoundedImportValue(value, path, depth, state) {
    state.nodes++;
    if (state.nodes > IMPORT_MAX_NODES) throw new Error('Слишком много значений в импорте.');
    if (value === null || typeof value === 'boolean') return;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error('Некорректное число в ' + path + '.');
      return;
    }
    if (typeof value === 'string') {
      if (value.length > 20000) throw new Error('Слишком длинная строка в ' + path + '.');
      return;
    }
    if (depth >= IMPORT_MAX_DEPTH) throw new Error('Слишком глубокая структура в ' + path + '.');
    if (Array.isArray(value)) {
      if (value.length > 5000) throw new Error('Слишком большой список в ' + path + '.');
      value.forEach((item, index) => validateBoundedImportValue(item, path + '[' + index + ']', depth + 1, state));
      return;
    }
    if (!isRecord(value)) throw new Error('Недопустимое значение в ' + path + '.');
    const keys = Object.keys(value);
    if (keys.length > 5000) throw new Error('Слишком много полей в ' + path + '.');
    keys.forEach(key => {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Недопустимое поле ' + path + '.' + key + '.');
      validateBoundedImportValue(value[key], path + '.' + key, depth + 1, state);
    });
  }

  function validateCustomQuestions(questions, baseQuestions) {
    if (questions.length > 1000) return false;
    const ids = new Set((Array.isArray(baseQuestions) ? baseQuestions : []).map(question => question.id));
    return questions.every(question => {
      if (!isRecord(question) || !Number.isSafeInteger(question.id) || question.id < 1 || ids.has(question.id)) return false;
      ids.add(question.id);
      return typeof question.topic === 'string' && question.topic.trim().length > 0 && question.topic.length <= 80 &&
        ['Junior', 'Middle', 'Senior'].includes(question.level) &&
        typeof question.q === 'string' && question.q.trim().length > 0 && question.q.length <= 4000 &&
        Array.isArray(question.options) && question.options.length >= 2 && question.options.length <= 6 &&
        question.options.every(option => typeof option === 'string' && option.trim().length > 0 && option.length <= 2000) &&
        Number.isInteger(question.answer) && question.answer >= 0 && question.answer < question.options.length &&
        (!('explanation' in question) || typeof question.explanation === 'string') &&
        (!('category' in question) || ['definition', 'scenario', 'tradeoff', 'output'].includes(question.category));
    });
  }

  function validateQuestionProgress(progress) {
    const numeric = ['correct', 'wrong', 'lastSeen', 'ease', 'interval', 'repetitions', 'nextReviewAt'];
    return Object.entries(progress).every(([id, item]) => /^\d+$/.test(id) && isRecord(item) &&
      numeric.every(key => !(key in item) || (Number.isFinite(item[key]) && item[key] >= 0)) &&
      (!('times' in item) || (Array.isArray(item.times) && item.times.length <= 100 && item.times.every(value => Number.isFinite(value) && value >= 0))) &&
      (!('lastSource' in item) || (typeof item.lastSource === 'string' && item.lastSource.length <= 40)));
  }

  function validateHistory(history) {
    return history.length <= 1000 && history.every(item => isRecord(item) && typeof item.date === 'string' && item.date.length <= 100 &&
      typeof item.topic === 'string' && item.topic.length <= 80 && typeof item.correct === 'boolean');
  }

  function validationOptions(options) {
    const source = options || {};
    const baseQuestions = typeof source.getBaseQuestions === 'function' ? source.getBaseQuestions() : source.baseQuestions;
    return { ...source, baseQuestions: Array.isArray(baseQuestions) ? baseQuestions : [] };
  }

  function validateProgressImport(data, options) {
    const deps = validationOptions(options);
    if (!isRecord(data)) throw new Error('Файл прогресса должен содержать JSON-объект.');
    validateBoundedImportValue(data, 'progress', 0, { nodes: 0 });
    const invalid = [];
    IMPORT_RECORD_KEYS.forEach(key => { if (key in data && !isRecord(data[key])) invalid.push(key); });
    IMPORT_ARRAY_KEYS.forEach(key => { if (key in data && !Array.isArray(data[key])) invalid.push(key); });
    if ('version' in data && (typeof data.version !== 'string' || data.version.length > 40)) invalid.push('version');
    if ('streak_best' in data && (!Number.isFinite(data.streak_best) || data.streak_best < 0)) invalid.push('streak_best');
    if ('stats' in data && isRecord(data.stats) && (
      ('total' in data.stats && (!Number.isFinite(data.stats.total) || data.stats.total < 0)) ||
      ('correct' in data.stats && (!Number.isFinite(data.stats.correct) || data.stats.correct < 0)) ||
      (Number.isFinite(data.stats.total) && Number.isFinite(data.stats.correct) && data.stats.correct > data.stats.total)
    )) invalid.push('stats');
    if ('qprog' in data && isRecord(data.qprog) && !validateQuestionProgress(data.qprog)) invalid.push('qprog');
    if ('history' in data && Array.isArray(data.history) && !validateHistory(data.history)) invalid.push('history');
    if ('study_position' in data && (!isRecord(data.study_position) || !Number.isInteger(data.study_position.week) ||
      !Number.isInteger(data.study_position.day) || data.study_position.week < 1 || data.study_position.week > 100 ||
      data.study_position.day < 1 || data.study_position.day > 31)) invalid.push('study_position');
    if ('onboarding' in data && (typeof deps.normaliseProfile !== 'function' || !deps.normaliseProfile(data.onboarding))) invalid.push('onboarding');
    if ('onboarding_complete' in data && typeof data.onboarding_complete !== 'boolean') invalid.push('onboarding_complete');
    if (Array.isArray(data.custom) && !validateCustomQuestions(data.custom, deps.baseQuestions)) invalid.push('custom');
    if (Array.isArray(data.skill_events) && (typeof deps.isSkillEvent !== 'function' || !data.skill_events.every(deps.isSkillEvent))) invalid.push('skill_events');
    if (Array.isArray(data.coach_journal) && (typeof deps.isJournalEntry !== 'function' || !data.coach_journal.every(deps.isJournalEntry))) invalid.push('coach_journal');
    if ('coach_control' in data && (typeof deps.normaliseControlSession !== 'function' || !deps.normaliseControlSession(data.coach_control))) invalid.push('coach_control');
    if (invalid.length) throw new Error('Некорректные поля: ' + [...new Set(invalid)].join(', ') + '.');
    return data;
  }

  function prepareImport(rawData, options) {
    const deps = validationOptions(options);
    const data = validateProgressImport(rawData, deps);
    const entries = {};
    IMPORT_RECORD_KEYS.forEach(key => { if (key in data) entries[key] = data[key]; });
    if ('coach_control' in data) entries.coach_control = deps.normaliseControlSession(data.coach_control);
    IMPORT_ARRAY_KEYS.forEach(key => {
      if (!(key in data)) return;
      if (key === 'skill_events' && Number.isFinite(deps.eventLimit)) entries[key] = data[key].slice(-deps.eventLimit);
      else if (key === 'coach_journal' && Number.isFinite(deps.journalLimit)) entries[key] = data[key].slice(-deps.journalLimit);
      else entries[key] = data[key];
    });
    if ('streak_best' in data) entries.streak_best = data.streak_best;
    if ('study_position' in data) entries.study_position = data.study_position;
    if ('onboarding' in data) entries.onboarding = deps.normaliseProfile(data.onboarding);
    if ('onboarding_complete' in data) entries.onboarding_complete = data.onboarding_complete;
    else if ('onboarding' in data) entries.onboarding_complete = true;
    return { data, entries };
  }

  function createExportData(services) {
    const source = services || {};
    const get = typeof source.get === 'function' ? source.get : (_key, fallback) => fallback;
    const onboarding = typeof source.getOnboardingProfile === 'function' ? source.getOnboardingProfile() : null;
    const control = typeof source.getCoachControlSession === 'function' ? source.getCoachControlSession() : null;
    const now = typeof source.now === 'function' ? source.now() : Date.now();
    return {
      version: source.version || 'dev', exportDate: new Date(now).toISOString(),
      storageSchemaVersion: get('storage_schema', 1), curriculumVersion: get('curriculum_version', null),
      mistakes: get('mistakes', {}), stats: get('stats', {}), history: get('history', []),
      qprog: get('qprog', {}), streak_best: get('streak_best', 0), custom: get('custom', []),
      ts_scores: get('ts_scores', {}), cmd_prog: get('cmd_prog', {}), code_prog: get('code_prog', {}),
      subnet_prog: get('subnet_prog', {}), git_prog: get('git_prog', {}), regex_prog: get('regex_prog', {}),
      ans_prog: get('ans_prog', {}), df_prog: get('df_prog', {}), k8s_prog: get('k8s_prog', {}),
      pt_prog: get('pt_prog', {}), labs_prog: get('labs_prog', {}), daily: get('daily', {}),
      study_progress: get('study_progress', {}), study_position: get('study_position', { week: 1, day: 1 }),
      study_answers: get('study_answers', {}), senior_case_prog: get('senior_case_prog', {}),
      skill_events: typeof source.getSkillEvents === 'function' ? source.getSkillEvents() : [],
      coach_journal: typeof source.getCoachJournal === 'function' ? source.getCoachJournal() : [],
      coach_control: control || undefined, onboarding: onboarding || undefined, onboarding_complete: !!onboarding
    };
  }

  function create(services, environment) {
    const source = services || {};
    const env = environment || root;
    const notify = message => { if (typeof source.alert === 'function') source.alert(message); else if (typeof env.alert === 'function') env.alert(message); };
    const ask = message => typeof source.prompt === 'function' ? source.prompt(message) : typeof env.prompt === 'function' ? env.prompt(message) : null;
    const options = () => ({
      getBaseQuestions: source.getBaseQuestions,
      normaliseProfile: source.normaliseProfile,
      isSkillEvent: source.isSkillEvent,
      eventLimit: source.eventLimit,
      isJournalEntry: source.isJournalEntry,
      journalLimit: source.journalLimit,
      normaliseControlSession: source.normaliseControlSession
    });

    function exportProgress() {
      const data = createExportData(source);
      const text = JSON.stringify(data, null, 2);
      const blob = new env.Blob([text], { type: 'application/json' });
      const anchor = env.document.createElement('a');
      anchor.href = env.URL.createObjectURL(blob);
      const dateKey = typeof source.dateKey === 'function' ? source.dateKey() : new Date().toISOString().slice(0, 10);
      anchor.download = 'ipmax_' + dateKey + '.json';
      anchor.click();
      env.URL.revokeObjectURL(anchor.href);
      const clipboard = env.navigator && env.navigator.clipboard;
      if (clipboard && typeof clipboard.writeText === 'function') clipboard.writeText(text).then(() => {}).catch(() => {});
      else {
        const textarea = env.document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        env.document.body.appendChild(textarea);
        textarea.select();
        try { env.document.execCommand('copy'); } catch (_) {}
        env.document.body.removeChild(textarea);
      }
      notify('✅ Прогресс скопирован в буфер обмена и сохранён в файл!');
      return data;
    }

    function importProgressData(rawData) {
      const prepared = prepareImport(rawData, options());
      if (!prepared.data.version) notify('⚠️ Старый формат без версии. Импортированы только проверенные поля.');
      const result = typeof source.setMany === 'function' ? source.setMany(prepared.entries) : { ok: false };
      if (!result.ok) {
        if (result.rollbackFailed && result.rollbackFailed.length) throw new Error('Не удалось сохранить импорт и полностью восстановить прежний прогресс. Не закрывайте страницу и экспортируйте текущие данные.');
        throw new Error('Не удалось сохранить импорт. Прежний прогресс восстановлен.');
      }
      notify('✅ Прогресс импортирован v' + (prepared.data.version || '?') + '!');
      if (typeof source.onImported === 'function') source.onImported(prepared.data);
      return prepared.data;
    }

    function importProgressText(text) {
      if (typeof text !== 'string' || byteLength(text) > IMPORT_MAX_BYTES) throw new Error('данные прогресса больше 2 МБ.');
      return importProgressData(JSON.parse(text));
    }

    function importProgress(input) {
      const file = input && input.files && input.files[0];
      if (!file) return;
      if (file.size > IMPORT_MAX_BYTES) {
        notify('Ошибка: файл прогресса больше 2 МБ.');
        input.value = '';
        return;
      }
      const reader = new env.FileReader();
      reader.onload = event => {
        try { importProgressText(event.target.result); }
        catch (error) { notify('Ошибка: ' + error.message); }
      };
      reader.readAsText(file);
      input.value = '';
    }

    function pasteProgressFromClipboard() {
      const manualPaste = () => {
        const text = ask('Вставьте JSON прогресса:');
        if (!text) return;
        try { importProgressText(text); }
        catch (error) { notify('Ошибка JSON: ' + error.message); }
      };
      const clipboard = env.navigator && env.navigator.clipboard;
      if (!clipboard || typeof clipboard.readText !== 'function') return manualPaste();
      clipboard.readText().then(text => {
        try { importProgressText(text); }
        catch (error) { notify('Ошибка JSON: ' + error.message); }
      }, manualPaste);
    }

    return {
      exportProgress, importProgress, importProgressText, importProgressData, pasteProgressFromClipboard,
      createExportData: () => createExportData(source),
      validateProgressImport: data => validateProgressImport(data, options())
    };
  }

  return {
    IMPORT_MAX_BYTES, IMPORT_MAX_DEPTH, IMPORT_MAX_NODES, IMPORT_RECORD_KEYS, IMPORT_ARRAY_KEYS,
    isRecord, validateBoundedImportValue, validateCustomQuestions, validateQuestionProgress, validateHistory,
    validateProgressImport, prepareImport, createExportData, create
  };
});
