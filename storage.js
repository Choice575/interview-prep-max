(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IPMaxStorage = api;
})(typeof self !== 'undefined' ? self : globalThis, function() {
  const DEFAULT_KEYS = {
    mistakes: 'ipmax_mistakes', stats: 'ipmax_stats', history: 'ipmax_history',
    qprog: 'ipmax_qprog', streak_best: 'ipmax_streak_best', custom: 'ipmax_custom', theme: 'ipmax_theme',
    ts_scores: 'ipmax_ts_scores', cmd_prog: 'ipmax_cmd_prog', code_prog: 'ipmax_code_prog', subnet_prog: 'ipmax_subnet_prog',
    git_prog: 'ipmax_git_prog', regex_prog: 'ipmax_regex_prog', ans_prog: 'ipmax_ans_prog', df_prog: 'ipmax_df_prog',
    k8s_prog: 'ipmax_k8s_prog', pt_prog: 'ipmax_pt_prog', labs_prog: 'ipmax_labs_prog', daily: 'ipmax_daily',
    study_progress: 'ipmax_study_progress', study_position: 'ipmax_study_position', study_answers: 'ipmax_study_answers',
    senior_case_prog: 'ipmax_senior_case_prog', onboarding: 'ipmax_onboarding', onboarding_complete: 'ipmax_onboarding_complete',
    skill_events: 'ipmax_skill_events'
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
    function remove(key) {
      if (!store || !names[key]) return false;
      try { store.removeItem(names[key]); return true; }
      catch (error) { console.warn('storage remove error:', error); return false; }
    }
    return { get, set, remove, keys: names };
  }

  return { DEFAULT_KEYS, create };
});
