const test = require('node:test');
const assert = require('node:assert/strict');
const SourcesUI = require('./sources-ui.js');

const DAY = 86400000;
const now = Date.parse('2026-07-28T12:00:00Z');

const sources = {
  schemaVersion: 1,
  topics: [
    {
      topic: 'Kubernetes',
      questionCount: 56,
      source: 'https://kubernetes.io/docs/home/',
      lastReviewed: '2026-07-28',
      reviewCadenceDays: 120,
      note: 'Релизы каждые ~4 месяца'
    },
    {
      topic: 'Linux',
      questionCount: 134,
      source: 'https://www.kernel.org/doc/html/latest/',
      lastReviewed: '2024-01-01',
      reviewCadenceDays: 365,
      note: 'Стабильная тема'
    }
  ]
};

test('flags a topic as stale once its review cadence has elapsed', () => {
  const fresh = SourcesUI.freshness(SourcesUI.findTopic(sources, 'Kubernetes'), now);
  const stale = SourcesUI.freshness(SourcesUI.findTopic(sources, 'Linux'), now);

  assert.equal(fresh.stale, false);
  assert.equal(fresh.daysLeft, 120);
  assert.equal(fresh.dueDate, '2026-11-25');

  assert.equal(stale.stale, true, 'reviewed in 2024 with a 365-day cadence must be stale');
  assert.ok(stale.daysLeft < 0);
});

test('treats missing or malformed review metadata as unknown, not fresh', () => {
  assert.deepEqual(
    SourcesUI.freshness({ topic: 'X', lastReviewed: 'вчера', reviewCadenceDays: 30 }, now),
    { known: false, stale: false, daysLeft: null }
  );
  assert.deepEqual(
    SourcesUI.freshness({ topic: 'X', lastReviewed: '2026-01-01', reviewCadenceDays: 0 }, now),
    { known: false, stale: false, daysLeft: null }
  );
  assert.equal(SourcesUI.freshness(null, now).known, false);
});

test('summarises topics with the most urgent review first', () => {
  const summary = SourcesUI.summarize(sources, now);

  assert.equal(summary.total, 2);
  assert.equal(summary.stale, 1);
  assert.equal(summary.rows[0].topic, 'Linux', 'overdue topic must come first');
});

test('renders a badge with the review date and a documentation link', () => {
  const badge = SourcesUI.renderBadge(sources, 'Kubernetes', now);

  assert.match(badge, /проверено 2026-07-28/);
  assert.match(badge, /href="https:\/\/kubernetes\.io\/docs\/home\/"/);
  assert.match(badge, /rel="noopener noreferrer"/);
  assert.match(badge, /2026-11-25/);
});

test('marks an overdue topic in the badge instead of claiming it is verified', () => {
  const badge = SourcesUI.renderBadge(sources, 'Linux', now);

  assert.match(badge, /требует проверки/);
  assert.doesNotMatch(badge, /проверено 2024/);
});

test('returns nothing for an unknown topic', () => {
  assert.equal(SourcesUI.renderBadge(sources, 'Кулинария', now), '');
  assert.equal(SourcesUI.findTopic(sources, 'Кулинария'), null);
});

test('refuses non-https and script-bearing URLs', () => {
  assert.equal(SourcesUI.safeUrl('javascript:alert(1)'), null);
  assert.equal(SourcesUI.safeUrl('http://example.com'), null);
  assert.equal(SourcesUI.safeUrl('https://ok.example/docs'), 'https://ok.example/docs');

  const hostile = {
    topics: [{
      topic: 'Linux',
      questionCount: 1,
      source: 'javascript:alert(1)',
      lastReviewed: '2026-07-28',
      reviewCadenceDays: 30
    }]
  };
  const badge = SourcesUI.renderBadge(hostile, 'Linux', now);
  assert.doesNotMatch(badge, /javascript:/);
  assert.doesNotMatch(badge, /<a /);
});

test('escapes hostile topic names and notes in the panel', () => {
  const hostile = {
    topics: [{
      topic: '<img src=x onerror=bad>',
      questionCount: 1,
      source: 'https://ok.example/docs',
      lastReviewed: '2026-07-28',
      reviewCadenceDays: 30,
      note: '<script>alert(1)</script>'
    }]
  };
  const markup = SourcesUI.renderPanel(hostile, now);

  assert.match(markup, /&lt;img src=x onerror=bad&gt;/);
  assert.doesNotMatch(markup, /<img src=x/);
  assert.doesNotMatch(markup, /<script>/);
  assert.match(markup, /aria-live="polite"/);
});

test('renders an empty state when no sources are loaded', () => {
  assert.match(SourcesUI.renderPanel(null, now), /Источники не загружены/);
  assert.match(SourcesUI.renderPanel({ topics: [] }, now), /Источники не загружены/);
});
