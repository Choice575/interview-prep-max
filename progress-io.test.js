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
  const values = {
    stats: { total: 4, correct: 3 }, streak_best: 5,
    storage_schema: 2, curriculum_version: '5.1.0',
    study_weekly_results: { 'weekly-w01': { bestScore: 84, passed: true } }
  };
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
  assert.equal(data.storageSchemaVersion, 2);
  assert.equal(data.curriculumVersion, '5.1.0');
  assert.deepEqual(data.stats, { total: 4, correct: 3 });
  assert.deepEqual(data.onboarding, { role: 'SRE' });
  assert.equal(data.onboarding_complete, true);
  assert.equal(data.coach_control, undefined);
  assert.deepEqual(data.study_weekly_results, { 'weekly-w01': { bestScore: 84, passed: true } });
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
    study_weekly_results: { 'weekly-w01': { bestScore: 72, passed: true } },
    unknown: 'ignored'
  }, dependencies);

  assert.deepEqual(prepared.entries.onboarding, { role: 'Cloud' });
  assert.equal(prepared.entries.onboarding_complete, true);
  assert.deepEqual(prepared.entries.skill_events.map(event => event.id), [2, 3]);
  assert.deepEqual(prepared.entries.coach_journal, [{ note: 'Вторая' }]);
  assert.equal(prepared.entries.coach_control.normalised, true);
  assert.deepEqual(prepared.entries.study_weekly_results, { 'weekly-w01': { bestScore: 72, passed: true } });
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

test('carries the second study program through export and import', () => {
  const values = {
    study_program: 'mlops',
    mlops_progress: { w5d3: 'done' },
    mlops_position: { week: 5, day: 3 }
  };
  const exported = ProgressIO.createExportData({
    version: '14.3.0',
    now: () => Date.UTC(2026, 6, 24),
    get: (key, fallback) => key in values ? values[key] : fallback,
    getOnboardingProfile: () => null,
    getSkillEvents: () => [],
    getCoachJournal: () => [],
    getCoachControlSession: () => null
  });
  assert.equal(exported.study_program, 'mlops');
  assert.deepEqual(exported.mlops_progress, { w5d3: 'done' });
  assert.deepEqual(exported.mlops_position, { week: 5, day: 3 });

  const prepared = ProgressIO.prepareImport({ version: '14.3.0', ...values }, dependencies);
  assert.equal(prepared.entries.study_program, 'mlops');
  assert.deepEqual(prepared.entries.mlops_progress, { w5d3: 'done' });
  assert.deepEqual(prepared.entries.mlops_position, { week: 5, day: 3 });
});

test('rejects a malformed second-program position or unknown program name', () => {
  assert.throws(
    () => ProgressIO.validateProgressImport({ mlops_position: { week: 0, day: 3 } }, dependencies),
    /Некорректные поля: mlops_position/
  );
  assert.throws(
    () => ProgressIO.validateProgressImport({ mlops_position: 'week5' }, dependencies),
    /Некорректные поля: mlops_position/
  );
  assert.throws(
    () => ProgressIO.validateProgressImport({ study_program: 'kubernetes' }, dependencies),
    /Некорректные поля: study_program/
  );
  assert.throws(
    () => ProgressIO.validateProgressImport({ mlops_progress: ['w1d1'] }, dependencies),
    /Некорректные поля: mlops_progress/
  );
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
