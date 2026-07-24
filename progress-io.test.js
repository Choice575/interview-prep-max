const test = require('node:test');
const assert = require('node:assert/strict');
const ProgressIO = require('./progress-io.js');

const dependencies = {
  baseQuestions: [{ id: 1 }],
  normaliseProfile: profile => profile && typeof profile.role === 'string' ? { role: profile.role } : null,
  isSkillEvent: event => event && event.valid === true,
  eventLimit: 2,
  isJournalEntry: entry => entry && typeof entry.note === 'string',
  journalLimit: 1,
  normaliseControlSession: session => session && Array.isArray(session.questionIds) ? { ...session, normalised: true } : null
};

test('builds a complete versioned export through the module contract', () => {
  const values = { stats: { total: 4, correct: 3 }, streak_best: 5 };
  const data = ProgressIO.createExportData({
    version: '12.9.0',
    now: () => Date.UTC(2026, 6, 24),
    get: (key, fallback) => key in values ? values[key] : fallback,
    getOnboardingProfile: () => ({ role: 'SRE' }),
    getSkillEvents: () => [{ valid: true }],
    getCoachJournal: () => [{ note: 'Повторить сети' }],
    getCoachControlSession: () => null
  });

  assert.equal(data.version, '12.9.0');
  assert.equal(data.exportDate, '2026-07-24T00:00:00.000Z');
  assert.deepEqual(data.stats, { total: 4, correct: 3 });
  assert.deepEqual(data.onboarding, { role: 'SRE' });
  assert.equal(data.onboarding_complete, true);
  assert.equal(data.coach_control, undefined);
});

test('validates and prepares only supported bounded import fields', () => {
  const prepared = ProgressIO.prepareImport({
    version: '12.8.0',
    onboarding: { role: 'Cloud' },
    qprog: { 1: { correct: 1, wrong: 0 } },
    custom: [{ id: 2, topic: 'Linux', level: 'Middle', q: 'Вопрос?', options: ['Да', 'Нет'], answer: 0 }],
    skill_events: [{ valid: true, id: 1 }, { valid: true, id: 2 }, { valid: true, id: 3 }],
    coach_journal: [{ note: 'Первая' }, { note: 'Вторая' }],
    coach_control: { questionIds: ['1'] },
    unknown: 'ignored'
  }, dependencies);

  assert.deepEqual(prepared.entries.onboarding, { role: 'Cloud' });
  assert.equal(prepared.entries.onboarding_complete, true);
  assert.deepEqual(prepared.entries.skill_events.map(event => event.id), [2, 3]);
  assert.deepEqual(prepared.entries.coach_journal, [{ note: 'Вторая' }]);
  assert.equal(prepared.entries.coach_control.normalised, true);
  assert.equal('unknown' in prepared.entries, false);
});

test('rejects malformed progress and reserved object keys', () => {
  assert.throws(
    () => ProgressIO.validateProgressImport({ qprog: { 1: { correct: 'many' } } }, dependencies),
    /Некорректные поля: qprog/
  );
  const polluted = JSON.parse('{"stats":{"__proto__":{"admin":true}}}');
  assert.throws(() => ProgressIO.validateProgressImport(polluted, dependencies), /Недопустимое поле progress\.stats\.__proto__/);
  assert.equal(Object.prototype.admin, undefined);
});

test('keeps imported data untouched when the storage batch fails', () => {
  let imported = false;
  const io = ProgressIO.create({
    ...dependencies,
    getBaseQuestions: () => dependencies.baseQuestions,
    setMany: () => ({ ok: false }),
    onImported: () => { imported = true; }
  }, {});

  assert.throws(() => io.importProgressData({ version: '12.8.0', qprog: {} }), /Прежний прогресс восстановлен/);
  assert.equal(imported, false);
});
