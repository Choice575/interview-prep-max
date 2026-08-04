const test = require('node:test');
const assert = require('node:assert/strict');
const ui = require('./gamification-ui.js');
const core = require('./gamification.js');
const coach = require('./coach.js');

function buildProfile(state) {
  return core.buildProfile(state || {});
}

test('formatXp groups thousands', () => {
  assert.equal(ui.formatXp(0), '0');
  assert.equal(ui.formatXp(999), '999');
  assert.equal(ui.formatXp(16000), '16\u2009000');
  assert.equal(ui.formatXp(-5), '0');
  assert.equal(ui.formatXp(undefined), '0');
});

test('level card shows the level, XP and the badge counter', () => {
  const profile = buildProfile({ questionProgress: { a: { correct: 3, wrong: 0 } } });
  const html = ui.renderLevelCard(profile);
  assert.match(html, /Уровень 1/);
  assert.match(html, /gm-badge-count/);
  assert.match(html, /1\/30/);
  assert.match(html, /data-gm-action="open-achievements"/);
});

test('level card announces the distance to the next level', () => {
  const html = ui.renderLevelCard({ level: core.levelFor(450) });
  assert.match(html, /До «/);
  assert.match(html, /350/);
});

test('level card reports the final level instead of a next one', () => {
  const html = ui.renderLevelCard({ level: core.levelFor(20000) });
  assert.match(html, /Максимальный уровень/);
});

test('level card renders the quest with its own progress bar', () => {
  const profile = buildProfile({
    questionProgress: Object.fromEntries(Array.from({ length: 9 }, (_, i) => ['q' + i, { correct: 1, wrong: 0 }]))
  });
  const html = ui.renderLevelCard(profile);
  assert.match(html, /gm-quest/);
  assert.match(html, /Ближайшая цель/);
  assert.match(html, /data-gm-action="quest"/);
});

test('level card shows the unseen dot only when there are fresh unlocks', () => {
  const fresh = buildProfile({ questionProgress: { a: { correct: 1, wrong: 0 } } });
  assert.match(ui.renderLevelCard(fresh), /gm-dot/);
  const seen = buildProfile({ questionProgress: { a: { correct: 1, wrong: 0 } }, seenAchievements: ['first_answer'] });
  assert.doesNotMatch(ui.renderLevelCard(seen), /gm-dot/);
});

test('level card escapes hostile content', () => {
  const html = ui.renderLevelCard({
    level: { title: '<img src=x onerror=alert(1)>', icon: '<b>', level: 1, xp: 0, progress: 0 },
    quest: { title: '"><script>alert(1)</script>', description: 'd', unit: 'u', page: 'exam', xp: 10, progress: 0, value: 0, goal: 1 }
  });
  assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;img/);
});

test('level card survives an empty profile', () => {
  const html = ui.renderLevelCard({});
  assert.match(html, /Уровень 1/);
  assert.doesNotMatch(html, /undefined/);
});

test('readiness index renders the score, weights and every component', () => {
  const index = coach.buildReadinessIndex({
    topicStats: [{ topic: 'Linux', inRole: true, readiness: 50, action: { type: 'questions', topic: 'Linux' } }],
    metrics: { trainerPasses: 10, studyDays: 5, bestDailyStreak: 3 }
  });
  const html = ui.renderReadinessIndex(index);
  assert.match(html, /Индекс готовности/);
  assert.match(html, /35\/25\/20\/10\/10/);
  coach.READINESS_COMPONENTS.forEach(component => {
    assert.ok(html.includes(component.label), 'missing component ' + component.label);
  });
});

test('readiness index renders the next action with its gain', () => {
  const index = coach.buildReadinessIndex({
    topicStats: [{ topic: 'Linux', inRole: true, readiness: 100 }],
    metrics: { trainerPasses: 0, weeklyTests: 4, studyDays: 60, bestDailyStreak: 14 }
  });
  const html = ui.renderReadinessIndex(index);
  assert.match(html, /data-gm-action="readiness"/);
  assert.match(html, /gm-ri-hint-gain/);
  assert.match(html, /\+\d+%/);
});

test('readiness index shows a closing note when everything is complete', () => {
  const index = coach.buildReadinessIndex({
    topicStats: [{ topic: 'Linux', inRole: true, readiness: 100 }],
    metrics: {
      trainerPasses: 100, incidentsDone: 20, seniorCases: 20,
      weeklyTests: 10, blitzDays: 30, studyDays: 100, bestDailyStreak: 40
    }
  });
  const html = ui.renderReadinessIndex(index);
  assert.match(html, /gm-ri-hint-done/);
  assert.doesNotMatch(html, /data-gm-action="readiness"/);
});

test('readiness index exposes the score to assistive technology', () => {
  const html = ui.renderReadinessIndex(coach.buildReadinessIndex({}));
  assert.match(html, /role="img"/);
  assert.match(html, /aria-label="Индекс готовности 0 процентов"/);
});

test('achievement card marks unlocked and locked states differently', () => {
  const unlocked = ui.renderAchievementCard({ id: 'a', title: 'A', description: 'd', xp: 20, unit: 'шт', value: 1, goal: 1, progress: 100, unlocked: true });
  const locked = ui.renderAchievementCard({ id: 'b', title: 'B', description: 'd', xp: 20, unit: 'шт', value: 0, goal: 5, progress: 0, unlocked: false, page: 'exam' });
  assert.match(unlocked, /gm-ach-on/);
  assert.match(unlocked, /получено/);
  assert.doesNotMatch(locked, /gm-ach-on/);
  assert.match(locked, /data-gm-action="quest"/);
});

test('achievements page groups every achievement by category', () => {
  const profile = buildProfile({});
  const html = ui.renderAchievementsPage(profile);
  core.ACHIEVEMENT_CATEGORIES.forEach(category => assert.ok(html.includes(category), 'missing group ' + category));
  const cards = html.match(/data-gm-achievement=/g) || [];
  assert.equal(cards.length, core.ACHIEVEMENTS.length);
});

test('achievements page renders the full level ladder and marks the current level', () => {
  const html = ui.renderAchievementsPage(buildProfile({}));
  const items = html.match(/gm-ladder-item/g) || [];
  assert.equal(items.length, core.LEVELS.length);
  assert.match(html, /gm-ladder-now/);
  assert.match(html, /вы здесь/);
});

test('create renders into the host elements and wires the callbacks', () => {
  const calls = [];
  const nodes = {};
  const makeNode = id => ({
    id,
    innerHTML: '',
    handlers: [],
    querySelectorAll() {
      // Minimal stand-in for the DOM: hand back one clickable stub per action
      // found in the rendered markup.
      const actions = [...String(this.innerHTML).matchAll(/data-gm-action="([a-z-]+)"[^>]*?(?:data-gm-page="([a-z]+)")?/g)];
      return actions.map(match => ({
        getAttribute: name => (name === 'data-gm-action' ? match[1] : match[2] || null),
        addEventListener: (event, handler) => this.handlers.push({ action: match[1], handler })
      }));
    }
  });
  ['home-level-card', 'home-readiness-card', 'achievements-host'].forEach(id => { nodes[id] = makeNode(id); });
  const instance = ui.create({
    getState: () => ({ questionProgress: { a: { correct: 1, wrong: 0 } } }),
    getReadinessIndex: () => coach.buildReadinessIndex({}),
    navigate: page => calls.push(['navigate', page]),
    openAchievements: () => calls.push(['openAchievements']),
    markSeen: items => calls.push(['markSeen', items.length])
  }, { document: { getElementById: id => nodes[id] || null } });

  const profile = instance.renderHomeLevel();
  assert.ok(nodes['home-level-card'].innerHTML.includes('Уровень'));
  assert.equal(profile.unlockedCount, 1);

  instance.renderHomeReadiness();
  assert.ok(nodes['home-readiness-card'].innerHTML.includes('Индекс готовности'));

  instance.renderAchievements();
  assert.ok(nodes['achievements-host'].innerHTML.includes('Достижения'));
  assert.deepEqual(calls.filter(call => call[0] === 'markSeen'), [['markSeen', core.ACHIEVEMENTS.length]]);

  const badge = nodes['home-level-card'].handlers.find(entry => entry.action === 'open-achievements');
  badge.handler();
  assert.ok(calls.some(call => call[0] === 'openAchievements'));
});

test('create clears the readiness host when there is no index', () => {
  const node = { innerHTML: 'stale', querySelectorAll: () => [] };
  const instance = ui.create({ getState: () => ({}), getReadinessIndex: () => null },
    { document: { getElementById: id => (id === 'home-readiness-card' ? node : null) } });
  assert.equal(instance.renderHomeReadiness(), null);
  assert.equal(node.innerHTML, '');
});

test('create tolerates missing host elements', () => {
  const instance = ui.create({ getState: () => ({}) }, { document: { getElementById: () => null } });
  assert.equal(instance.renderHomeLevel(), null);
  assert.equal(instance.renderHomeReadiness(), null);
  assert.equal(instance.renderAchievements(), null);
});
