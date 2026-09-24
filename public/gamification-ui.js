(function(root, factory) {
  const core = typeof module !== 'undefined' && module.exports ? require('./gamification.js') : root.IPMaxGamification;
  const api = factory(core);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.IPMaxGamificationUI = api;
})(typeof self !== 'undefined' ? self : globalThis, function(core) {
  'use strict';

  function escapeHtml(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function asArray(value) { return Array.isArray(value) ? value : []; }
  function asObject(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }

  function formatXp(value) {
    const total = Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
    // Thin space as a thousands separator: 16 000 XP reads faster than 16000.
    return String(total).replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009');
  }

  /** Compact level badge for the home dashboard. */
  function renderLevelCard(profile) {
    const source = asObject(profile);
    const level = asObject(source.level);
    const quest = source.quest ? asObject(source.quest) : null;
    const unlocked = Number(source.unlockedCount) || 0;
    const total = Number(source.totalCount) || 0;
    const nextLine = level.next
      ? 'До «' + escapeHtml(asObject(level.next).title) + '» осталось ' + formatXp(level.xpToNext) + ' XP'
      : 'Максимальный уровень достигнут';
    const questBlock = quest
      ? '<div class="gm-quest">'
        + '<div class="gm-quest-head"><span class="gm-quest-kicker">Ближайшая цель</span>'
        + '<span class="gm-quest-xp">+' + formatXp(quest.xp) + ' XP</span></div>'
        + '<div class="gm-quest-title">' + escapeHtml(quest.title) + '</div>'
        + '<div class="gm-quest-desc">' + escapeHtml(quest.description) + '</div>'
        + '<div class="gm-bar gm-bar-sm"><div class="gm-bar-fill" style="width:' + (Number(quest.progress) || 0) + '%"></div></div>'
        + '<div class="gm-quest-meta">' + (Number(quest.value) || 0) + ' из ' + (Number(quest.goal) || 0) + ' ' + escapeHtml(quest.unit || '') + '</div>'
        + '<button type="button" class="btn btn-outline btn-sm" data-gm-action="quest" data-gm-page="' + escapeHtml(quest.page || 'exam') + '">Перейти к задаче</button>'
        + '</div>'
      : '';
    return '<div class="gm-level-card">'
      + '<div class="gm-level-top">'
      + '<div class="gm-level-icon" aria-hidden="true">' + escapeHtml(level.icon || '🌱') + '</div>'
      + '<div class="gm-level-copy">'
      + '<div class="gm-level-kicker">Уровень ' + (Number(level.level) || 1) + ' · ' + formatXp(level.xp) + ' XP</div>'
      + '<h3 class="gm-level-title">' + escapeHtml(level.title || '') + '</h3>'
      + '<p class="gm-level-sub">' + escapeHtml(level.subtitle || '') + '</p>'
      + '</div>'
      + '<button type="button" class="gm-badge-count" data-gm-action="open-achievements"'
      + ' aria-label="Открыть достижения: ' + unlocked + ' из ' + total + '">'
      + '🏅 ' + unlocked + '/' + total
      + (Number(source.freshCount) > 0 ? '<span class="gm-dot" aria-hidden="true"></span>' : '')
      + '</button>'
      + '</div>'
      + '<div class="gm-bar"><div class="gm-bar-fill" style="width:' + (Number(level.progress) || 0) + '%"></div></div>'
      + '<div class="gm-level-foot">' + nextLine + '</div>'
      + questBlock
      + '</div>';
  }

  /** The single readiness index with its weighted components. */
  function renderReadinessIndex(index) {
    const source = asObject(index);
    const components = asArray(source.components);
    const score = Math.max(0, Math.min(100, Number(source.score) || 0));
    const bandLabels = {
      high: ['Готов к собеседованию', 'Индекс выше 70% — можно проходить интервью Middle+'],
      medium: ['Идёте по плану', 'Закройте слабые составляющие, чтобы поднять индекс'],
      low: ['В начале пути', 'Двигайте самую слабую составляющую — это даёт максимум']
    };
    const label = bandLabels[source.band] || bandLabels.low;
    const weights = components.map(item => Number(asObject(item).weight) || 0).join('/');
    const action = source.nextAction ? asObject(source.nextAction) : null;
    const rows = components.map(item => {
      const component = asObject(item);
      const value = Math.max(0, Math.min(100, Number(component.score) || 0));
      const tone = value >= 70 ? 'high' : value >= 40 ? 'medium' : 'low';
      return '<div class="gm-ri-row">'
        + '<div class="gm-ri-label"><span>' + escapeHtml(component.label) + '</span>'
        + '<span class="gm-ri-weight">' + (Number(component.weight) || 0) + '%</span></div>'
        + '<div class="gm-bar gm-bar-sm"><div class="gm-bar-fill gm-tone-' + tone + '" style="width:' + value + '%"></div></div>'
        + '<div class="gm-ri-value">' + value + '%</div>'
        + '</div>';
    }).join('');
    const hint = action
      ? '<button type="button" class="gm-ri-hint" data-gm-action="readiness" data-gm-page="' + escapeHtml(action.page || 'exam') + '">'
        + '<span class="gm-ri-hint-text">' + escapeHtml(action.hint || '') + '</span>'
        + '<span class="gm-ri-hint-gain">+' + (Number(action.gain) || 0) + '%</span>'
        + '</button>'
      : '<div class="gm-ri-hint gm-ri-hint-done">Все составляющие закрыты — держите форму повторениями</div>';
    return '<div class="gm-readiness">'
      + '<div class="gm-ri-head">'
      + '<div><div class="gm-ri-kicker">Индекс готовности</div>'
      + '<div class="gm-ri-score gm-tone-text-' + escapeHtml(source.band || 'low') + '">' + score + '<span>%</span></div>'
      + '<div class="gm-ri-band">' + escapeHtml(label[0]) + '</div>'
      + '<div class="gm-ri-note">' + escapeHtml(label[1]) + '</div></div>'
      + '<div class="gm-ri-ring" style="--gm-ring:' + score + '" role="img"'
      + ' aria-label="Индекс готовности ' + score + ' процентов"><span>' + score + '%</span></div>'
      + '</div>'
      + '<div class="gm-ri-weights">Веса составляющих: ' + escapeHtml(weights) + '%</div>'
      + '<div class="gm-ri-rows">' + rows + '</div>'
      + hint
      + '</div>';
  }

  function renderAchievementCard(item) {
    const achievement = asObject(item);
    const unlocked = achievement.unlocked === true;
    return '<article class="gm-ach' + (unlocked ? ' gm-ach-on' : '') + '"'
      + ' data-gm-achievement="' + escapeHtml(achievement.id) + '">'
      + '<div class="gm-ach-head">'
      + '<span class="gm-ach-state" aria-hidden="true">' + (unlocked ? '🏅' : '🔒') + '</span>'
      + '<h4>' + escapeHtml(achievement.title) + '</h4>'
      + '<span class="gm-ach-xp">+' + formatXp(achievement.xp) + ' XP</span>'
      + '</div>'
      + '<p class="gm-ach-desc">' + escapeHtml(achievement.description) + '</p>'
      + '<div class="gm-bar gm-bar-sm"><div class="gm-bar-fill" style="width:' + (Number(achievement.progress) || 0) + '%"></div></div>'
      + '<div class="gm-ach-foot">'
      + '<span>' + (Number(achievement.value) || 0) + ' / ' + (Number(achievement.goal) || 0) + ' ' + escapeHtml(achievement.unit || '') + '</span>'
      + (unlocked ? '<span class="gm-ach-done">получено</span>'
        : '<button type="button" class="gm-ach-go" data-gm-action="quest" data-gm-page="'
          + escapeHtml(achievement.page || 'exam') + '">открыть →</button>')
      + '</div>'
      + '</article>';
  }

  /** Full achievements page: level ladder plus grouped badges. */
  function renderAchievementsPage(profile) {
    const source = asObject(profile);
    const achievements = asArray(source.achievements);
    const categories = asArray(core && core.ACHIEVEMENT_CATEGORIES);
    const level = asObject(source.level);
    const groups = categories.map(category => {
      const items = achievements.filter(item => asObject(item).category === category);
      if (!items.length) return '';
      const done = items.filter(item => asObject(item).unlocked).length;
      return '<section class="gm-ach-group">'
        + '<h3 class="gm-ach-group-title">' + escapeHtml(category)
        + '<span>' + done + '/' + items.length + '</span></h3>'
        + '<div class="gm-ach-grid">' + items.map(renderAchievementCard).join('') + '</div>'
        + '</section>';
    }).join('');
    const ladder = asArray(source.levels).map(item => {
      const entry = asObject(item);
      const reached = Number(level.level) >= Number(entry.level);
      const current = Number(level.level) === Number(entry.level);
      return '<li class="gm-ladder-item' + (reached ? ' gm-ladder-on' : '') + (current ? ' gm-ladder-now' : '') + '">'
        + '<span class="gm-ladder-icon" aria-hidden="true">' + escapeHtml(entry.icon) + '</span>'
        + '<span class="gm-ladder-copy"><b>' + escapeHtml(entry.title) + '</b>'
        + '<span>' + formatXp(entry.minXp) + ' XP</span></span>'
        + (current ? '<span class="gm-ladder-flag">вы здесь</span>' : '')
        + '</li>';
    }).join('');
    return '<div class="gm-ach-page">'
      + renderLevelCard(source)
      + '<section class="gm-ladder-wrap"><h3 class="gm-section-title">Уровни</h3>'
      + '<ol class="gm-ladder">' + ladder + '</ol></section>'
      + '<section><h3 class="gm-section-title">Достижения '
      + (Number(source.unlockedCount) || 0) + ' из ' + (Number(source.totalCount) || 0) + '</h3>'
      + groups + '</section>'
      + '</div>';
  }

  function create(services, environment) {
    const source = asObject(services);
    const env = asObject(environment);
    const doc = env.document || (typeof document !== 'undefined' ? document : null);
    const run = (name, ...args) => (typeof source[name] === 'function' ? source[name](...args) : undefined);
    const byId = id => (doc ? doc.getElementById(id) : null);

    function profile() {
      const state = run('getState') || {};
      return core.buildProfile(state);
    }

    function bind(container) {
      if (!container || typeof container.querySelectorAll !== 'function') return;
      container.querySelectorAll('[data-gm-action]').forEach(button => {
        const action = button.getAttribute('data-gm-action');
        button.addEventListener('click', () => {
          if (action === 'open-achievements') return run('openAchievements');
          return run('navigate', button.getAttribute('data-gm-page') || 'exam');
        });
      });
    }

    function renderHomeLevel() {
      const target = byId('home-level-card');
      if (!target) return null;
      const current = profile();
      target.innerHTML = renderLevelCard(current);
      bind(target);
      return current;
    }

    function renderHomeReadiness() {
      const target = byId('home-readiness-card');
      if (!target) return null;
      const index = run('getReadinessIndex');
      if (!index) {
        target.innerHTML = '';
        return null;
      }
      target.innerHTML = renderReadinessIndex(index);
      bind(target);
      return index;
    }

    function renderAchievements() {
      const target = byId('achievements-host');
      if (!target) return null;
      const current = profile();
      target.innerHTML = renderAchievementsPage(current);
      bind(target);
      // Opening the page is what "seen" means: the notification dot must clear
      // here, not when a badge unlocks off-screen.
      run('markSeen', current.achievements);
      return current;
    }

    return { renderHomeLevel, renderHomeReadiness, renderAchievements, profile };
  }

  return {
    escapeHtml, formatXp, renderLevelCard, renderReadinessIndex,
    renderAchievementCard, renderAchievementsPage, create
  };
});
