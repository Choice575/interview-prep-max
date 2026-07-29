const test = require('node:test');
const assert = require('node:assert/strict');

// coach-ui.js reads the bare `document` identifier at call time, so a global
// stub is enough — no jsdom dependency needed (the project has none).
class FakeElement {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.id = '';
    this.value = '';
    this.style = {};
    this.innerHTML = '';
    this.textContent = '';
    this.options = [];
    this.focused = false;
  }
  focus() { this.focused = true; }
}

class FakeDocument {
  constructor(ids) {
    this.elements = new Map();
    (ids || []).forEach(id => {
      const element = new FakeElement('div');
      element.id = id;
      this.elements.set(id, element);
    });
    this.listeners = [];
  }
  getElementById(id) { return this.elements.get(id) || null; }
  addEventListener(name, listener) { this.listeners.push([name, listener]); }
  createElement(tagName) { return new FakeElement(tagName); }
}

function loadCoachUI() {
  // Fresh module instance per test: `services` and `bound` are module-level.
  delete require.cache[require.resolve('./coach-ui.js')];
  return require('./coach-ui.js');
}

function basePlan(overrides) {
  return Object.assign({
    roleLabel: 'DevOps',
    level: 'Middle',
    daysUntil: 5,
    sessionSize: 20,
    dueCount: 7,
    targetAccuracy: 80,
    focus: { topic: 'Linux', accuracy: 74, coverage: 60, practiceCount: 0, practiceScore: 0, action: { page: 'exam' } },
    weeklyReview: {
      status: 'on-track',
      targetActiveDays: 5,
      accuracyDelta: 4,
      extraQuestions: 0,
      recent: { attempts: 42, activeDays: 4, accuracy: 78 }
    },
    controlSession: { size: 12, topics: ['Linux', 'Docker'] }
  }, overrides || {});
}

function makeServices(document, overrides) {
  return Object.assign({
    getPlan: () => basePlan(),
    getJournal: () => [],
    getControlSession: () => null,
    getProfile: () => ({ role: 'SRE', level: 'Senior', date: '2026-09-01' }),
    getTopics: () => ['Linux', 'Docker'],
    openModal: () => {},
    closeModal: () => {},
    alert: () => {},
    confirm: () => true,
    now: () => Date.parse('2026-07-29T00:00:00Z'),
    refresh: () => {},
    setProfile: () => true,
    normaliseProfile: value => value,
    startFocus: () => {},
    startReview: () => {},
    startControl: () => {},
    requestAiReview: async () => ({ source: 'local', summary: 's', strengths: [], gaps: [], nextSteps: [] }),
    coach: { appendJournalEntry: (list, entry) => list.concat([entry]) },
    setJournal: () => true,
    getJournal2: null
  }, overrides || {});
}

test('formats interview timing with correct Russian plural forms', () => {
  const ui = loadCoachUI();

  assert.equal(ui.formatInterviewTiming(null), 'Дата интервью не задана');
  assert.equal(ui.formatInterviewTiming(-3), 'Дата интервью уже прошла');
  assert.equal(ui.formatInterviewTiming(0), 'Интервью сегодня');
  assert.equal(ui.formatInterviewTiming(1), 'Интервью через 1 день');
  assert.equal(ui.formatInterviewTiming(2), 'Интервью через 2 дня');
  assert.equal(ui.formatInterviewTiming(4), 'Интервью через 4 дня');
  assert.equal(ui.formatInterviewTiming(5), 'Интервью через 5 дней');
  assert.equal(ui.formatInterviewTiming(21), 'Интервью через 21 день');
  assert.equal(ui.formatInterviewTiming(22), 'Интервью через 22 дня');
});

test('uses "дней" for the 11-19 exception where the last digit would say otherwise', () => {
  const ui = loadCoachUI();

  // 11 ends in 1 and 12-14 end in 2-4, but Russian requires "дней" here.
  assert.equal(ui.formatInterviewTiming(11), 'Интервью через 11 дней');
  assert.equal(ui.formatInterviewTiming(12), 'Интервью через 12 дней');
  assert.equal(ui.formatInterviewTiming(14), 'Интервью через 14 дней');
  assert.equal(ui.formatInterviewTiming(111), 'Интервью через 111 дней');
  assert.equal(ui.formatInterviewTiming(101), 'Интервью через 101 день');
  assert.equal(ui.formatInterviewTiming(102), 'Интервью через 102 дня');
});

test('formats deltas with an explicit sign and falls back without a baseline', () => {
  const ui = loadCoachUI();

  assert.equal(ui.formatDelta(4, '%'), '+4%');
  assert.equal(ui.formatDelta(-4, '%'), '-4%');
  assert.equal(ui.formatDelta(0, '%'), '0%');
  assert.equal(ui.formatDelta(3), '+3');
  assert.equal(ui.formatDelta(null), 'нет базы');
  assert.equal(ui.formatDelta(undefined), 'нет базы');
  assert.equal(ui.formatDelta(NaN), 'нет базы');
  assert.equal(ui.formatDelta(Infinity), 'нет базы');
});

test('renders the daily plan card with metrics, focus and weekly review', () => {
  const ui = loadCoachUI();
  const document = new FakeDocument(['daily-plan-card', 'daily-plan-content']);
  global.document = document;
  try {
    ui.configure(makeServices(document));
    ui.render();

    const card = document.getElementById('daily-plan-card');
    const html = document.getElementById('daily-plan-content').innerHTML;

    assert.equal(card.style.display, 'block');
    assert.match(html, /DevOps · Middle/);
    assert.match(html, /Интервью через 5 дней/);
    assert.match(html, /20<\/b><span>вопросов сегодня/);
    assert.match(html, /7<\/b><span>SRS к повторению/);
    assert.match(html, /80%<\/b><span>целевая точность/);
    assert.match(html, /Linux/);
    assert.match(html, /42 действий/);
    assert.match(html, /4\/5<\/b><span>активных дней/);
    assert.match(html, /\+4%<\/b><span>к прошлой неделе/);
    assert.match(html, /В темпе/);
  } finally {
    delete global.document;
  }
});

test('shows the goal prompt when no plan exists', () => {
  const ui = loadCoachUI();
  const document = new FakeDocument(['daily-plan-card', 'daily-plan-content']);
  global.document = document;
  try {
    ui.configure(makeServices(document, { getPlan: () => null }));
    ui.render();

    const html = document.getElementById('daily-plan-content').innerHTML;
    assert.match(html, /Укажите цель подготовки/);
    assert.match(html, /data-coach-action="edit-goal"/);
    assert.doesNotMatch(html, /вопросов сегодня/);
  } finally {
    delete global.document;
  }
});

test('disables actions that have nothing to run', () => {
  const ui = loadCoachUI();
  const document = new FakeDocument(['daily-plan-card', 'daily-plan-content']);
  global.document = document;
  try {
    ui.configure(makeServices(document, {
      getPlan: () => basePlan({ dueCount: 0, focus: null, controlSession: { size: 0, topics: [] } })
    }));
    ui.render();

    const html = document.getElementById('daily-plan-content').innerHTML;
    assert.match(html, /data-coach-action="start-review" disabled/);
    assert.match(html, /data-coach-action="start-control" disabled/);
    assert.match(html, /data-coach-action="start-focus" disabled/);
    assert.match(html, /data-coach-action="open-ai-review" disabled/);
    assert.match(html, /Общий повтор/);
  } finally {
    delete global.document;
  }
});

test('escapes hostile topic and role values instead of injecting markup', () => {
  const ui = loadCoachUI();
  const document = new FakeDocument(['daily-plan-card', 'daily-plan-content']);
  global.document = document;
  try {
    ui.configure(makeServices(document, {
      getPlan: () => basePlan({
        roleLabel: '<img src=x onerror=bad>',
        focus: { topic: '<script>alert(1)</script>', accuracy: 50, coverage: 40, practiceCount: 0, practiceScore: 0, action: { page: 'exam' } },
        controlSession: { size: 3, topics: ['<b>Linux</b>'] }
      })
    }));
    ui.render();

    const html = document.getElementById('daily-plan-content').innerHTML;
    assert.match(html, /&lt;script&gt;/);
    assert.doesNotMatch(html, /<script>/);
    assert.doesNotMatch(html, /<img src=x/);
    assert.doesNotMatch(html, /<b>Linux<\/b>/);
  } finally {
    delete global.document;
  }
});

test('reports the weekly status label for each review state', () => {
  const ui = loadCoachUI();
  const document = new FakeDocument(['daily-plan-card', 'daily-plan-content']);
  global.document = document;
  const expected = {
    'on-track': 'В темпе',
    behind: 'Нужна коррекция',
    building: 'Набираете ритм',
    starting: 'Стартовая неделя',
    'нет-такого': 'Стартовая неделя'
  };
  try {
    for (const [status, label] of Object.entries(expected)) {
      ui.configure(makeServices(document, {
        getPlan: () => basePlan({
          weeklyReview: { status, targetActiveDays: 5, accuracyDelta: 0, recent: { attempts: 1, activeDays: 1, accuracy: 50 } }
        })
      }));
      ui.render();
      assert.match(document.getElementById('daily-plan-content').innerHTML, new RegExp(label), `status ${status}`);
    }
  } finally {
    delete global.document;
  }
});

test('surfaces the plan adjustment only when extra questions were added', () => {
  const ui = loadCoachUI();
  const document = new FakeDocument(['daily-plan-card', 'daily-plan-content']);
  global.document = document;
  try {
    ui.configure(makeServices(document, {
      getPlan: () => basePlan({
        weeklyReview: { status: 'behind', targetActiveDays: 5, accuracyDelta: -6, extraQuestions: 5, recent: { attempts: 10, activeDays: 2, accuracy: 61 } }
      })
    }));
    ui.render();
    assert.match(document.getElementById('daily-plan-content').innerHTML, /\+5 вопросов в сессию/);

    ui.configure(makeServices(document));
    ui.render();
    assert.doesNotMatch(document.getElementById('daily-plan-content').innerHTML, /План скорректирован/);
  } finally {
    delete global.document;
  }
});

test('renders an em dash when the week has no accuracy yet', () => {
  const ui = loadCoachUI();
  const document = new FakeDocument(['daily-plan-card', 'daily-plan-content']);
  global.document = document;
  try {
    ui.configure(makeServices(document, {
      getPlan: () => basePlan({
        weeklyReview: { status: 'starting', targetActiveDays: 5, accuracyDelta: null, recent: { attempts: 0, activeDays: 0, accuracy: null } }
      })
    }));
    ui.render();

    const html = document.getElementById('daily-plan-content').innerHTML;
    assert.match(html, /—<\/b><span>точность недели/);
    assert.match(html, /нет базы<\/b><span>к прошлой неделе/);
  } finally {
    delete global.document;
  }
});

test('counts journal notes and control attempts in the action labels', () => {
  const ui = loadCoachUI();
  const document = new FakeDocument(['daily-plan-card', 'daily-plan-content']);
  global.document = document;
  try {
    ui.configure(makeServices(document, {
      getJournal: () => [{ id: '1', topic: 'Linux', note: 'a', at: 1 }, { id: '2', topic: 'Docker', note: 'b', at: 2 }],
      getControlSession: () => ({ attempts: [{}, {}, {}], questionIds: [1, 2, 3, 4, 5] })
    }));
    ui.render();

    const html = document.getElementById('daily-plan-content').innerHTML;
    assert.match(html, /Журнал навыков · 2/);
    assert.match(html, /AI-разбор · 3\/5/);
    assert.doesNotMatch(html, /data-coach-action="open-ai-review" disabled/);
  } finally {
    delete global.document;
  }
});

test('editGoal fills the form from the saved profile', () => {
  const ui = loadCoachUI();
  const document = new FakeDocument(['onb-role', 'onb-level', 'onb-date']);
  global.document = document;
  const opened = [];
  try {
    ui.configure(makeServices(document, { openModal: (id, focus) => opened.push([id, focus]) }));
    ui.editGoal();

    assert.equal(document.getElementById('onb-role').value, 'SRE');
    assert.equal(document.getElementById('onb-level').value, 'Senior');
    assert.equal(document.getElementById('onb-date').value, '2026-09-01');
    assert.deepEqual(opened, [['onboarding-modal', '#onb-role']]);
  } finally {
    delete global.document;
  }
});

test('editGoal falls back to defaults when no profile is stored', () => {
  const ui = loadCoachUI();
  const document = new FakeDocument(['onb-role', 'onb-level', 'onb-date']);
  global.document = document;
  try {
    ui.configure(makeServices(document, { getProfile: () => null }));
    ui.editGoal();

    assert.equal(document.getElementById('onb-role').value, 'DevOps');
    assert.equal(document.getElementById('onb-level').value, 'Middle');
    assert.equal(document.getElementById('onb-date').value, '');
  } finally {
    delete global.document;
  }
});

test('render stays silent when the card is absent or services are missing', () => {
  const ui = loadCoachUI();
  const document = new FakeDocument([]);
  global.document = document;
  try {
    // No services configured yet.
    assert.doesNotThrow(() => ui.render());

    ui.configure(makeServices(document));
    // Card elements do not exist on this page.
    assert.doesNotThrow(() => ui.render());
  } finally {
    delete global.document;
  }
});

test('configure binds the click delegate exactly once', () => {
  const ui = loadCoachUI();
  const document = new FakeDocument(['daily-plan-card', 'daily-plan-content']);
  global.document = document;
  try {
    ui.configure(makeServices(document));
    ui.configure(makeServices(document));
    ui.configure(makeServices(document));

    assert.equal(document.listeners.length, 1, 'repeat configure() must not stack listeners');
    assert.equal(document.listeners[0][0], 'click');
  } finally {
    delete global.document;
  }
});
