(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IPMaxProfileScope = api;
})(typeof self !== 'undefined' ? self : globalThis, function() {
  'use strict';

  // Область материала под профиль (аудит B6): MLOps-карточек больше, чем по
  // Linux, а Senior-вопросы — треть тестов. Начинающему они мешают, поэтому по
  // умолчанию скрыты; явный выбор пользователя всегда главнее профиля.

  const LEVELS = ['Junior', 'Middle', 'Senior'];
  const LEVELS_BY_PROFILE = {
    Junior: ['Junior', 'Middle'],
    Middle: ['Junior', 'Middle', 'Senior'],
    Senior: ['Junior', 'Middle', 'Senior']
  };
  const MLOPS_COLLECTION = 'MLOps';

  function normalizePrefs(value) {
    const prefs = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return {
      showMlops: prefs.showMlops === true,
      showSenior: prefs.showSenior === true ? true : prefs.showSenior === false ? false : null
    };
  }

  function scopeFor(profile, prefs) {
    const level = profile && LEVELS.includes(profile.level) ? profile.level : null;
    const settings = normalizePrefs(prefs);
    let levels = level ? LEVELS_BY_PROFILE[level].slice() : LEVELS.slice();
    if (settings.showSenior === true && !levels.includes('Senior')) levels.push('Senior');
    if (settings.showSenior === false) levels = levels.filter(item => item !== 'Senior');
    return {
      profileLevel: level,
      levels,
      showMlops: settings.showMlops,
      hidesSenior: !levels.includes('Senior')
    };
  }

  function allowsLevel(scope, level) {
    return !scope || !Array.isArray(scope.levels) || !level || scope.levels.includes(level);
  }

  function filterCards(cards, scope) {
    const list = Array.isArray(cards) ? cards : [];
    if (!scope || scope.showMlops) return list;
    return list.filter(card => !card || card.collection !== MLOPS_COLLECTION);
  }

  function label(scope) {
    if (!scope) return 'Все уровни';
    return scope.levels.join(', ');
  }

  return { LEVELS, LEVELS_BY_PROFILE, MLOPS_COLLECTION, normalizePrefs, scopeFor, allowsLevel, filterCards, label };
});
