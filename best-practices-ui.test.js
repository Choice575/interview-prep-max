const test = require('node:test');
const assert = require('node:assert/strict');
const BP = require('./best-practices-ui.js');

const dataset = {
  updated: '2026-07-29',
  topics: [
    {
      topic: 'Linux', slug: 'linux', icon: '🐧', trainer: 'exam',
      summary: 'Диагностика и повседневная работа в оболочке под нагрузкой.',
      practices: [
        { title: 'journalctl по времени', why: 'Точечный срез логов экономит время при разборе инцидента и не тонет в шуме.', action: 'Фильтруйте journalctl -u сервис --since для нужного окна времени вместо чтения всего журнала.' },
        { title: 'set -euo pipefail', why: 'Скрипт останавливается на первой ошибке, а не продолжает работу с испорченным состоянием.', action: 'Добавляйте set -euo pipefail в начало каждого bash-скрипта, чтобы ошибки не проглатывались.' }
      ]
    },
    {
      topic: 'Docker', slug: 'docker', icon: '🐳',
      summary: 'Сборка и запуск контейнеров с прицелом на прод и безопасность.',
      practices: [
        { title: 'Многостадийная сборка', why: 'Финальный образ содержит только рантайм, без инструментов сборки и исходников.', action: 'Разделяйте Dockerfile на стадию сборки и рантайм-стадию, копируя только артефакт в финальный слой.' }
      ]
    }
  ]
};

test('selectTopic honours request, then memory, then first', () => {
  assert.equal(BP.selectTopic(dataset, 'Docker', 'Linux').slug, 'docker');
  assert.equal(BP.selectTopic(dataset, 'Нет такого', 'Docker').slug, 'docker');
  assert.equal(BP.selectTopic(dataset, null, null).slug, 'linux');
});

test('selectTopic returns null for an empty or malformed dataset', () => {
  assert.equal(BP.selectTopic(null, 'Linux'), null);
  assert.equal(BP.selectTopic({}, 'Linux'), null);
  assert.equal(BP.selectTopic({ topics: [] }, 'Linux'), null);
  assert.equal(BP.selectTopic({ topics: 'nope' }, 'Linux'), null);
});

test('totalPracticeCount sums across topics and tolerates bad entries', () => {
  assert.equal(BP.totalPracticeCount(dataset), 3);
  assert.equal(BP.totalPracticeCount({ topics: [{ practices: null }, {}] }), 0);
  assert.equal(BP.totalPracticeCount(null), 0);
});

test('renderTabs marks exactly one active tab and puts the rest out of tab order', () => {
  const html = BP.renderTabs(dataset, 'Docker');
  assert.equal((html.match(/role="tab"/g) || []).length, 2);
  assert.equal((html.match(/aria-selected="true"/g) || []).length, 1);
  assert.equal((html.match(/tabindex="0"/g) || []).length, 1);
  assert.equal((html.match(/tabindex="-1"/g) || []).length, 1);
  assert.match(html, /id="practice-tab-docker"[^>]*aria-selected="true"/);
  assert.match(html, /id="practice-tab-linux"[^>]*aria-selected="false"/);
});

test('renderPanel numbers cards and shows count plus revision', () => {
  const html = BP.renderPanel(dataset.topics[0], dataset.updated);
  assert.match(html, /<h2>Linux<\/h2>/);
  assert.match(html, /practice-card-number">01/);
  assert.match(html, /practice-card-number">02/);
  assert.match(html, /<strong>2 практик<\/strong>/);
  assert.match(html, /ревизия 2026-07-29/);
  assert.match(html, /data-topic="Linux" data-page="exam"/);
});

test('renderPanel falls back to exam trainer when none is set', () => {
  const html = BP.renderPanel(dataset.topics[1], dataset.updated);
  assert.match(html, /data-topic="Docker" data-page="exam"/);
});

test('renderPanel renders an empty state for a missing topic', () => {
  assert.match(BP.renderPanel(null, '2026-07-29'), /Раздел пока недоступен/);
});

test('markup escapes hostile values instead of injecting them', () => {
  const hostile = {
    updated: '2026-07-29',
    topics: [{
      topic: '<img src=x onerror=alert(1)>', slug: 'x"><script>', icon: '<b>', trainer: 'exam',
      summary: '<script>alert(2)</script> с достаточной длиной чтобы пройти проверку схемы данных.',
      practices: [{ title: '</h3><script>bad()</script>', why: 'w'.repeat(80), action: 'a'.repeat(80) }]
    }]
  };
  const tabs = BP.renderTabs(hostile, hostile.topics[0].topic);
  const panel = BP.renderPanel(hostile.topics[0], hostile.updated);
  assert.doesNotMatch(tabs, /<script>/);
  assert.doesNotMatch(tabs, /<img src=x/);
  assert.doesNotMatch(panel, /<script>/);
  assert.match(panel, /&lt;script&gt;/);
});

test('nextTabIndex cycles with arrows and jumps with Home/End', () => {
  assert.equal(BP.nextTabIndex('ArrowRight', 0, 3), 1);
  assert.equal(BP.nextTabIndex('ArrowRight', 2, 3), 0, 'wraps forward');
  assert.equal(BP.nextTabIndex('ArrowLeft', 0, 3), 2, 'wraps backward');
  assert.equal(BP.nextTabIndex('Home', 2, 3), 0);
  assert.equal(BP.nextTabIndex('End', 0, 3), 2);
  assert.equal(BP.nextTabIndex('ArrowRight', 0, 0), 0, 'no topics');
});
