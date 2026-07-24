(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IPMaxStorage = api;
})(typeof self !== 'undefined' ? self : globalThis, function() {
  const CURRENT_STORAGE_SCHEMA = 2;
  const DEFAULT_KEYS = {
    mistakes: 'ipmax_mistakes', stats: 'ipmax_stats', history: 'ipmax_history',
    qprog: 'ipmax_qprog', streak_best: 'ipmax_streak_best', custom: 'ipmax_custom', theme: 'ipmax_theme',
    ts_scores: 'ipmax_ts_scores', cmd_prog: 'ipmax_cmd_prog', code_prog: 'ipmax_code_prog', subnet_prog: 'ipmax_subnet_prog',
    git_prog: 'ipmax_git_prog', regex_prog: 'ipmax_regex_prog', ans_prog: 'ipmax_ans_prog', df_prog: 'ipmax_df_prog',
    k8s_prog: 'ipmax_k8s_prog', pt_prog: 'ipmax_pt_prog', labs_prog: 'ipmax_labs_prog', daily: 'ipmax_daily',
    study_progress: 'ipmax_study_progress', study_position: 'ipmax_study_position', study_answers: 'ipmax_study_answers',
    senior_case_prog: 'ipmax_senior_case_prog', onboarding: 'ipmax_onboarding', onboarding_complete: 'ipmax_onboarding_complete',
    skill_events: 'ipmax_skill_events', coach_journal: 'ipmax_coach_journal', coach_control: 'ipmax_coach_control',
    storage_schema: 'ipmax_storage_schema', curriculum_version: 'ipmax_curriculum_version',
    progress_backup: 'ipmax_progress_backup'
  };

  function create(adapter, keys) {
    const store = adapter && typeof adapter.getItem === 'function' ? adapter : null;
    const names = { ...DEFAULT_KEYS, ...(keys || {}) };
    function get(key, fallback) {
      if (!store || !names[key]) return fallback;
      try {
        const value = store.getItem(names[key]);
        return value ? JSON.parse(value) : fallback;
      } catch (error) {
        console.warn('storage read error:', error);
        return fallback;
      }
    }
    function set(key, value) {
      if (!store || !names[key]) return false;
      try {
        store.setItem(names[key], JSON.stringify(value));
        return true;
      } catch (error) {
        console.warn('storage write error:', error);
        return false;
      }
    }
    function setMany(entries) {
      if (!store || !entries || typeof entries !== 'object' || Array.isArray(entries)) {
        return { ok: false, error: new Error('Invalid storage batch') };
      }
      const items = Object.entries(entries);
      if (items.some(([key]) => !names[key])) {
        return { ok: false, error: new Error('Unknown storage key') };
      }
      let prepared;
      try {
        prepared = items.map(([key, value]) => {
          const serialised = JSON.stringify(value);
          if (serialised === undefined) throw new Error(`Storage value for ${key} is not serialisable`);
          return { key, name: names[key], value: serialised, previous: store.getItem(names[key]) };
        });
      } catch (error) {
        return { ok: false, error };
      }
      try {
        prepared.forEach(item => store.setItem(item.name, item.value));
        return { ok: true };
      } catch (error) {
        const rollbackFailed = [];
        prepared.forEach(item => {
          try { store.removeItem(item.name); } catch (_) { rollbackFailed.push(item.key); }
        });
        prepared.forEach(item => {
          if (item.previous === null) return;
          try { store.setItem(item.name, item.previous); } catch (_) { rollbackFailed.push(item.key); }
        });
        return { ok: false, error, rollbackFailed: [...new Set(rollbackFailed)] };
      }
    }
    function remove(key) {
      if (!store || !names[key]) return false;
      try { store.removeItem(names[key]); return true; }
      catch (error) { console.warn('storage remove error:', error); return false; }
    }

    function migrate(options) {
      if (!store) return { ok: false, error: new Error('Storage is unavailable') };
      const settings = options || {};
      const targetSchema = Number.isSafeInteger(settings.schemaVersion) && settings.schemaVersion > 0
        ? settings.schemaVersion : CURRENT_STORAGE_SCHEMA;
      const targetCurriculum = typeof settings.curriculumVersion === 'string' && settings.curriculumVersion
        ? settings.curriculumVersion : null;
      const currentSchema = get('storage_schema', 1);
      const currentCurriculum = get('curriculum_version', null);
      if (currentSchema === targetSchema && currentCurriculum === targetCurriculum) {
        return { ok: true, migrated: false, storageSchema: targetSchema, curriculumVersion: targetCurriculum };
      }

      const existingBackup = get('progress_backup', null);
      const canReuseBackup = existingBackup && existingBackup.fromStorageSchema === currentSchema &&
        existingBackup.fromCurriculumVersion === currentCurriculum && existingBackup.toStorageSchema === targetSchema &&
        existingBackup.toCurriculumVersion === targetCurriculum;
      if (!canReuseBackup) {
        const entries = {};
        try {
          Object.entries(names).forEach(([key, name]) => {
            if (key === 'progress_backup') return;
            const raw = store.getItem(name);
            if (raw !== null) entries[key] = raw;
          });
        } catch (error) {
          return { ok: false, error };
        }
        const now = typeof settings.now === 'function' ? settings.now() : Date.now();
        const backup = {
          createdAt: new Date(now).toISOString(),
          fromStorageSchema: currentSchema,
          fromCurriculumVersion: currentCurriculum,
          toStorageSchema: targetSchema,
          toCurriculumVersion: targetCurriculum,
          entries
        };
        if (!set('progress_backup', backup)) return { ok: false, error: new Error('Could not create progress backup') };
      }

      const result = setMany({ storage_schema: targetSchema, curriculum_version: targetCurriculum });
      if (!result.ok) return { ...result, migrated: false, backupCreated: true };
      return {
        ok: true, migrated: true, backupCreated: true,
        fromStorageSchema: currentSchema, storageSchema: targetSchema,
        fromCurriculumVersion: currentCurriculum, curriculumVersion: targetCurriculum
      };
    }

    return { get, set, setMany, remove, migrate, keys: names };
  }

  return { CURRENT_STORAGE_SCHEMA, DEFAULT_KEYS, create };
});
