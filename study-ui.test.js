const test = require('node:test');
const assert = require('node:assert/strict');
const StudyUI = require('./study-ui');

test('renders populated technology lifecycle groups and metadata', () => {
  const markup = StudyUI.renderTechnologyStatus({
    preferred: ['Gateway API'],
    current: [],
    legacy: ['Ingress'],
    eol: ['ingress-nginx<script>'],
    overviewOnly: [],
    optional: ['Cilium'],
    lastReviewed: '2026-07-25',
    source: 'roadmap <v5.1>',
    note: 'Gateway API > Ingress',
  });

  assert.match(markup, /Технологический радар/);
  assert.match(markup, /study-tech-preferred/);
  assert.match(markup, /Gateway API/);
  assert.match(markup, /study-tech-legacy/);
  assert.match(markup, /study-tech-eol/);
  assert.match(markup, /study-tech-optional/);
  assert.match(markup, /Проверено 25\.07\.2026/);
  assert.match(markup, /roadmap &lt;v5\.1&gt;/);
  assert.match(markup, /Gateway API &gt; Ingress/);
  assert.match(markup, /ingress-nginx&lt;script&gt;/);
  assert.doesNotMatch(markup, /study-tech-current/);
  assert.doesNotMatch(markup, /<script>/);
});

test('formats only valid roadmap review dates', () => {
  assert.equal(StudyUI.formatReviewDate('2026-07-25'), '25.07.2026');
  assert.equal(StudyUI.formatReviewDate('25.07.2026'), '');
  assert.equal(StudyUI.formatReviewDate(), '');
});

test('renders the production layer and prerequisites safely', () => {
  const markup = StudyUI.renderWeekContext({
    productionLayer: 'Gateway < Service',
    prerequisites: ['Docker & Compose', 'CI создаёт image'],
  });

  assert.match(markup, /study-week-context has-prerequisites/);
  assert.match(markup, /Production-слой/);
  assert.match(markup, /Gateway &lt; Service/);
  assert.match(markup, /Входные условия/);
  assert.match(markup, /Docker &amp; Compose/);
  assert.match(markup, /CI создаёт image/);
});

test('renders a production-only context and rejects malformed input', () => {
  const markup = StudyUI.renderWeekContext({ productionLayer: 'Immutable artifact' });

  assert.match(markup, /study-context-production/);
  assert.doesNotMatch(markup, /has-prerequisites/);
  assert.doesNotMatch(markup, /study-context-prerequisites/);
  assert.equal(StudyUI.renderWeekContext(null), '');
  assert.equal(StudyUI.renderWeekContext({ prerequisites: [] }), '');
});

test('omits an empty or malformed technology status', () => {
  assert.equal(StudyUI.renderTechnologyStatus(null), '');
  assert.equal(StudyUI.renderTechnologyStatus([]), '');
  assert.equal(StudyUI.renderTechnologyStatus({ preferred: [], legacy: [] }), '');
});
